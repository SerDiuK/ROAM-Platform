import { randomBytes, randomUUID } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it, vi } from "vitest";
import { ResponderModel } from "../db/models/responder.js";
import { EmbeddedSolanaProvider } from "./embedded.js";
import { WalletError } from "./provider.js";

const USDC_DEVNET = new PublicKey(
	"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

type FakeConnection = {
	getAccountInfo: ReturnType<typeof vi.fn>;
	getTokenAccountBalance: ReturnType<typeof vi.fn>;
};

function makeFakeConnection(): FakeConnection {
	return {
		getAccountInfo: vi.fn(),
		getTokenAccountBalance: vi.fn(),
	};
}

function buildProvider(connection: FakeConnection = makeFakeConnection()): {
	provider: EmbeddedSolanaProvider;
	connection: FakeConnection;
	encryptionKey: Buffer;
} {
	const encryptionKey = randomBytes(32);
	const provider = new EmbeddedSolanaProvider({
		connection: connection as unknown as ConstructorParameters<
			typeof EmbeddedSolanaProvider
		>[0]["connection"],
		agentKeypair: Keypair.generate(),
		usdcMint: USDC_DEVNET,
		encryptionKey,
	});
	return { provider, connection, encryptionKey };
}

async function makeResponderDoc(): Promise<{ _id: string }> {
	const doc = await new ResponderModel({
		_id: randomUUID(),
		name: `RSP-${randomUUID().slice(0, 6)}`,
		role: "responder",
		availability: "available",
	}).save();
	return { _id: doc._id };
}

describe("EmbeddedSolanaProvider constructor", () => {
	it("rejects an encryption key that is not 32 bytes", () => {
		expect(
			() =>
				new EmbeddedSolanaProvider({
					connection: makeFakeConnection() as unknown as ConstructorParameters<
						typeof EmbeddedSolanaProvider
					>[0]["connection"],
					agentKeypair: Keypair.generate(),
					usdcMint: USDC_DEVNET,
					encryptionKey: Buffer.alloc(16),
				}),
		).toThrow(/encryptionKey must be 32 bytes/);
	});
});

describe("EmbeddedSolanaProvider.createWallet", () => {
	it("generates a keypair, persists encrypted secret + address, returns the address", async () => {
		const { provider } = buildProvider();
		const op = await makeResponderDoc();

		const result = await provider.createWallet(op._id);

		expect(result.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
		const stored = await ResponderModel.findById(op._id).select(
			"+encryptedWalletSecret walletAddress",
		);
		expect(stored?.walletAddress).toBe(result.address);
		expect(stored?.encryptedWalletSecret).toMatch(
			/^[0-9a-f]+\.[0-9a-f]+\.[0-9a-f]+$/,
		);
	});

	it("is idempotent: a second call returns the same address and does not overwrite the encrypted secret", async () => {
		const { provider } = buildProvider();
		const op = await makeResponderDoc();

		const first = await provider.createWallet(op._id);
		const afterFirst = await ResponderModel.findById(op._id).select(
			"+encryptedWalletSecret",
		);

		const second = await provider.createWallet(op._id);
		const afterSecond = await ResponderModel.findById(op._id).select(
			"+encryptedWalletSecret",
		);

		expect(second.address).toBe(first.address);
		expect(afterSecond?.encryptedWalletSecret).toBe(
			afterFirst?.encryptedWalletSecret,
		);
	});

	it("throws WalletError 404 when the responder does not exist", async () => {
		const { provider } = buildProvider();
		const ghostId = randomUUID();

		await expect(provider.createWallet(ghostId)).rejects.toMatchObject({
			name: "WalletError",
			status: 404,
		});
	});
});

describe("EmbeddedSolanaProvider.getAddress", () => {
	it("returns null for an unknown responder", async () => {
		const { provider } = buildProvider();
		const result = await provider.getAddress(randomUUID());
		expect(result).toBeNull();
	});

	it("returns null when a responder has not been provisioned yet", async () => {
		const { provider } = buildProvider();
		const op = await makeResponderDoc();
		const result = await provider.getAddress(op._id);
		expect(result).toBeNull();
	});

	it("returns the address once a wallet has been provisioned", async () => {
		const { provider } = buildProvider();
		const op = await makeResponderDoc();
		const { address } = await provider.createWallet(op._id);

		const result = await provider.getAddress(op._id);
		expect(result).toBe(address);
	});
});

describe("EmbeddedSolanaProvider encryption round-trip", () => {
	it("decryptResponderSecret recovers the originally generated secret key", async () => {
		const { provider } = buildProvider();
		const op = await makeResponderDoc();

		const { address } = await provider.createWallet(op._id);
		const stored = await ResponderModel.findById(op._id).select(
			"+encryptedWalletSecret",
		);
		const ciphertext = stored?.encryptedWalletSecret;
		expect(ciphertext).toBeDefined();
		if (!ciphertext) throw new Error("ciphertext missing");

		const decrypted = provider.decryptResponderSecret(ciphertext);
		const recovered = Keypair.fromSecretKey(decrypted);
		expect(recovered.publicKey.toBase58()).toBe(address);
	});

	it("rejects malformed ciphertext", async () => {
		const { provider } = buildProvider();
		expect(() => provider.decryptResponderSecret("not.real")).toThrow(
			WalletError,
		);
	});

	it("rejects ciphertext with the wrong IV/auth-tag size", async () => {
		const { provider } = buildProvider();
		const bogus = `${"00".repeat(8)}.${"00".repeat(8)}.${"00".repeat(16)}`;
		expect(() => provider.decryptResponderSecret(bogus)).toThrow(WalletError);
	});

	it("encrypted secrets vary across calls (random IV per encrypt)", async () => {
		const { provider } = buildProvider();
		const op1 = await makeResponderDoc();
		const op2 = await makeResponderDoc();
		await provider.createWallet(op1._id);
		await provider.createWallet(op2._id);

		const a = await ResponderModel.findById(op1._id).select(
			"+encryptedWalletSecret",
		);
		const b = await ResponderModel.findById(op2._id).select(
			"+encryptedWalletSecret",
		);
		expect(a?.encryptedWalletSecret).not.toBe(b?.encryptedWalletSecret);
	});
});

describe("EmbeddedSolanaProvider.getBalanceUsdc", () => {
	it("returns 0 when the ATA does not exist (getAccountInfo returns null)", async () => {
		const connection = makeFakeConnection();
		connection.getAccountInfo.mockResolvedValue(null);
		const { provider } = buildProvider(connection);

		const balance = await provider.getBalanceUsdc(
			Keypair.generate().publicKey.toBase58(),
		);

		expect(balance).toBe(0);
		expect(connection.getAccountInfo).toHaveBeenCalledTimes(1);
		expect(connection.getTokenAccountBalance).not.toHaveBeenCalled();
	});

	it("returns the parsed uiAmount from getTokenAccountBalance when the ATA exists", async () => {
		const connection = makeFakeConnection();
		connection.getAccountInfo.mockResolvedValue({ data: Buffer.alloc(0) });
		connection.getTokenAccountBalance.mockResolvedValue({
			value: {
				amount: "20000000",
				decimals: 6,
				uiAmount: 20,
				uiAmountString: "20",
			},
		});
		const { provider } = buildProvider(connection);

		const balance = await provider.getBalanceUsdc(
			Keypair.generate().publicKey.toBase58(),
		);

		expect(balance).toBe(20);
		expect(connection.getTokenAccountBalance).toHaveBeenCalledTimes(1);
	});

	it("returns 0 when getTokenAccountBalance reports a null uiAmount", async () => {
		const connection = makeFakeConnection();
		connection.getAccountInfo.mockResolvedValue({ data: Buffer.alloc(0) });
		connection.getTokenAccountBalance.mockResolvedValue({
			value: {
				amount: "0",
				decimals: 6,
				uiAmount: null,
				uiAmountString: "0",
			},
		});
		const { provider } = buildProvider(connection);

		const balance = await provider.getBalanceUsdc(
			Keypair.generate().publicKey.toBase58(),
		);
		expect(balance).toBe(0);
	});
});

describe("EmbeddedSolanaProvider.agentAddress", () => {
	it("exposes the agent keypair pubkey as a base58 string", () => {
		const agentKeypair = Keypair.generate();
		const provider = new EmbeddedSolanaProvider({
			connection: makeFakeConnection() as unknown as ConstructorParameters<
				typeof EmbeddedSolanaProvider
			>[0]["connection"],
			agentKeypair,
			usdcMint: USDC_DEVNET,
			encryptionKey: randomBytes(32),
		});
		expect(provider.agentAddress).toBe(agentKeypair.publicKey.toBase58());
		expect(provider.agentAddress).toBe(
			bs58.encode(agentKeypair.publicKey.toBytes()),
		);
	});
});
