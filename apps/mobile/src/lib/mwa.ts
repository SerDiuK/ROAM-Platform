import { DEMO_CLUSTER } from "@roam/shared";
import { PublicKey, type Transaction } from "@solana/web3.js";
import type * as MobileWalletAdapter from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { Platform } from "react-native";

export class SeekerCancelledError extends Error {
	constructor() {
		super("User cancelled the Seeker prompt");
		this.name = "SeekerCancelledError";
	}
}

export class SeekerAuthorizationError extends Error {
	public readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "SeekerAuthorizationError";
		this.cause = cause;
	}
}

export class SeekerSigningError extends Error {
	public readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "SeekerSigningError";
		this.cause = cause;
	}
}

type Wallet = Pick<
	MobileWalletAdapter.Web3MobileWallet,
	"authorize" | "signAndSendTransactions"
>;

type TransactFn = <T>(callback: (wallet: Wallet) => T) => Promise<T>;

// Name only: Seeker Wallet verifies `uri` via Digital Asset Links and fetches `icon` relative to it;
// a `uri` that fails auto-rejects with a CancellationException before the sheet renders.
const APP_IDENTITY = {
	name: "ROAM",
};

const CHAIN: `solana:${string}` = `solana:${DEMO_CLUSTER}`;

// Lazy `require`: a static import crashes on iOS, web and Expo Go, where the native module is missing.
function loadTransact(): TransactFn | null {
	if (Platform.OS !== "android") return null;
	try {
		const {
			transact,
		}: typeof MobileWalletAdapter = require("@solana-mobile/mobile-wallet-adapter-protocol-web3js");
		return transact;
	} catch {
		return null;
	}
}

function isCancellation(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	// MWA cancels arrive as ERROR_ASSOCIATION_CANCELLED or as a wallet error whose message says cancel.
	if ("code" in err && err.code === "ERROR_ASSOCIATION_CANCELLED") return true;
	return /cancel/i.test(err.message);
}

function rethrow(err: unknown, step: "authorize" | "sign"): never {
	if (
		err instanceof SeekerCancelledError ||
		err instanceof SeekerAuthorizationError ||
		err instanceof SeekerSigningError
	) {
		throw err;
	}
	if (isCancellation(err)) throw new SeekerCancelledError();
	const message = err instanceof Error ? err.message : "Seeker protocol error";
	throw step === "authorize"
		? new SeekerAuthorizationError(message, err)
		: new SeekerSigningError(message, err);
}

async function authorize(wallet: Wallet, authToken: string): Promise<string> {
	try {
		const auth = await wallet.authorize({
			identity: APP_IDENTITY,
			chain: CHAIN,
			auth_token: authToken,
		});
		return auth.auth_token;
	} catch (err) {
		if (isCancellation(err)) throw new SeekerCancelledError();
		return authorizeAfresh(wallet);
	}
}

async function authorizeAfresh(wallet: Wallet): Promise<string> {
	try {
		const auth = await wallet.authorize({
			identity: APP_IDENTITY,
			chain: CHAIN,
		});
		return auth.auth_token;
	} catch (err) {
		rethrow(err, "authorize");
	}
}

function base64AddressToBase58(b64: string): string {
	const bytes = Buffer.from(b64, "base64");
	return new PublicKey(bytes).toBase58();
}

type SignInPayload = {
	domain: string;
	statement?: string;
	nonce?: string;
};

export type SignInResult = {
	address: string;
	addressBase64: string;
	signedMessage: string;
	signature: string;
	authToken: string;
};

type SignedTransaction = {
	signature: string;
	authToken: string;
};

type Mwa = {
	mwaAvailable: boolean;
	signIn: (
		payload: SignInPayload,
		opts?: { authToken?: string | null },
	) => Promise<SignInResult>;
	signAndSendTransaction: (
		tx: Transaction,
		opts: { authToken: string },
	) => Promise<SignedTransaction>;
};

export function createMwa(transact: TransactFn | null): Mwa {
	const available = transact !== null;

	const signIn = async (
		payload: SignInPayload,
		opts: { authToken?: string | null } = {},
	): Promise<SignInResult> => {
		if (!transact) {
			throw new SeekerAuthorizationError("Mobile Wallet Adapter not available");
		}
		try {
			return await transact(async (wallet) => {
				const auth = await wallet.authorize({
					identity: APP_IDENTITY,
					chain: CHAIN,
					auth_token: opts.authToken ?? undefined,
					sign_in_payload: {
						domain: payload.domain,
						statement: payload.statement,
						nonce: payload.nonce,
					},
				});
				const sir = auth.sign_in_result;
				if (!sir) {
					throw new SeekerAuthorizationError(
						"Wallet did not return a sign_in_result",
					);
				}
				return {
					address: base64AddressToBase58(sir.address),
					addressBase64: sir.address,
					signedMessage: sir.signed_message,
					signature: sir.signature,
					authToken: auth.auth_token,
				};
			});
		} catch (err) {
			rethrow(err, "authorize");
		}
	};

	const signAndSendTransaction = async (
		tx: Transaction,
		opts: { authToken: string },
	): Promise<SignedTransaction> => {
		if (!transact) {
			throw new SeekerSigningError("Mobile Wallet Adapter not available");
		}
		try {
			return await transact(async (wallet) => {
				const authToken = await authorize(wallet, opts.authToken);
				const [signature] = await wallet.signAndSendTransactions({
					transactions: [tx],
				});
				if (!signature) {
					throw new SeekerSigningError("Wallet returned no signature");
				}
				return { signature, authToken };
			});
		} catch (err) {
			rethrow(err, "sign");
		}
	};

	return { mwaAvailable: available, signIn, signAndSendTransaction };
}

export const mwa = createMwa(loadTransact());
