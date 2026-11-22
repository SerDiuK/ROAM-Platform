import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
	createAssociatedTokenAccountInstruction,
	createTransferCheckedInstruction,
	getAssociatedTokenAddress,
	getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import {
	type Connection,
	Keypair,
	PublicKey,
	sendAndConfirmTransaction,
	Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { ResponderModel } from "../db/models/responder.js";
import type { WalletProvider } from "./provider.js";
import { WalletError } from "./provider.js";

const USDC_DECIMALS = 6;
const ENCRYPTION_ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface EmbeddedSolanaConfig {
	connection: Connection;
	agentKeypair: Keypair;
	usdcMint: PublicKey;
	encryptionKey: Buffer;
}

export class EmbeddedSolanaProvider implements WalletProvider {
	private readonly connection: Connection;
	private readonly agentKeypair: Keypair;
	private readonly usdcMint: PublicKey;
	private readonly encryptionKey: Buffer;

	constructor(config: EmbeddedSolanaConfig) {
		if (config.encryptionKey.length !== 32) {
			throw new Error(
				`encryptionKey must be 32 bytes, got ${config.encryptionKey.length}`,
			);
		}
		this.connection = config.connection;
		this.agentKeypair = config.agentKeypair;
		this.usdcMint = config.usdcMint;
		this.encryptionKey = config.encryptionKey;
	}

	get agentAddress(): string {
		return this.agentKeypair.publicKey.toBase58();
	}

	async createWallet(responderId: string): Promise<{ address: string }> {
		const existing =
			await ResponderModel.findById(responderId).select("walletAddress");
		if (!existing) {
			throw new WalletError({
				message: `responder_not_found: ${responderId}`,
				status: 404,
			});
		}
		if (existing.walletAddress) {
			return { address: existing.walletAddress };
		}

		const keypair = Keypair.generate();
		const address = keypair.publicKey.toBase58();
		const encrypted = this.encrypt(bs58.encode(keypair.secretKey));

		await ResponderModel.findByIdAndUpdate(responderId, {
			walletAddress: address,
			encryptedWalletSecret: encrypted,
		});

		return { address };
	}

	async getAddress(responderId: string): Promise<string | null> {
		const responder =
			await ResponderModel.findById(responderId).select("walletAddress");
		return responder?.walletAddress ?? null;
	}

	async getBalanceUsdc(address: string): Promise<number> {
		const owner = new PublicKey(address);
		const ata = await getAssociatedTokenAddress(this.usdcMint, owner, true);
		const info = await this.connection.getAccountInfo(ata);
		if (!info) return 0;
		const balance = await this.connection.getTokenAccountBalance(ata);
		return balance.value.uiAmount ?? 0;
	}

	async signAndSendUsdc(args: {
		toAddress: string;
		amountUsdc: number;
		memo?: string;
	}): Promise<{ txSignature: string }> {
		if (args.memo !== undefined) {
			// Memo is ignored: no SPL memo instruction is attached.
		}

		const recipient = new PublicKey(args.toAddress);
		const sourceAta = await getOrCreateAssociatedTokenAccount(
			this.connection,
			this.agentKeypair,
			this.usdcMint,
			this.agentKeypair.publicKey,
			true,
		);
		const recipientAta = await getAssociatedTokenAddress(
			this.usdcMint,
			recipient,
			true,
		);

		const tx = new Transaction();
		const recipientInfo = await this.connection.getAccountInfo(recipientAta);
		if (!recipientInfo) {
			tx.add(
				createAssociatedTokenAccountInstruction(
					this.agentKeypair.publicKey,
					recipientAta,
					recipient,
					this.usdcMint,
				),
			);
		}

		const rawAmount = BigInt(Math.round(args.amountUsdc * 10 ** USDC_DECIMALS));
		tx.add(
			createTransferCheckedInstruction(
				sourceAta.address,
				this.usdcMint,
				recipientAta,
				this.agentKeypair.publicKey,
				rawAmount,
				USDC_DECIMALS,
			),
		);

		const signature = await sendAndConfirmTransaction(this.connection, tx, [
			this.agentKeypair,
		]);
		return { txSignature: signature };
	}

	private encrypt(plaintext: string): string {
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv(ENCRYPTION_ALGO, this.encryptionKey, iv);
		const ciphertext = Buffer.concat([
			cipher.update(plaintext, "utf8"),
			cipher.final(),
		]);
		const authTag = cipher.getAuthTag();
		return `${iv.toString("hex")}.${authTag.toString("hex")}.${ciphertext.toString("hex")}`;
	}

	decryptResponderSecret(encrypted: string): Uint8Array {
		const parts = encrypted.split(".");
		if (parts.length !== 3) {
			throw new WalletError({
				message: "Malformed encryptedWalletSecret",
				status: 500,
			});
		}
		const [ivHex, authTagHex, ctHex] = parts as [string, string, string];
		const iv = Buffer.from(ivHex, "hex");
		const authTag = Buffer.from(authTagHex, "hex");
		const ciphertext = Buffer.from(ctHex, "hex");
		if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
			throw new WalletError({
				message: "encryptedWalletSecret has wrong IV/tag size",
				status: 500,
			});
		}
		const decipher = createDecipheriv(ENCRYPTION_ALGO, this.encryptionKey, iv);
		decipher.setAuthTag(authTag);
		const plaintext = Buffer.concat([
			decipher.update(ciphertext),
			decipher.final(),
		]);
		return bs58.decode(plaintext.toString("utf8"));
	}
}
