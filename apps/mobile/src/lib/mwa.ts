import { PublicKey, type Transaction } from "@solana/web3.js";
import { Platform } from "react-native";

export class SeekerCancelledError extends Error {
	constructor() {
		super("User cancelled the Seeker prompt");
		this.name = "SeekerCancelledError";
	}
}

export class SeekerProtocolError extends Error {
	public readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "SeekerProtocolError";
		this.cause = cause;
	}
}

type SignInPayloadShape = {
	domain: string;
	address?: string;
	statement?: string;
	uri?: string;
	version?: string;
	chain_id?: string;
	nonce?: string;
	issued_at?: string;
	expiration_time?: string;
	not_before?: string;
	request_id?: string;
	resources?: string[];
};

type SignInResultShape = {
	address: string;
	signed_message: string;
	signature: string;
	signature_type?: string;
};

type AuthorizeParams = {
	identity: { uri?: string; icon?: string; name?: string };
	chain?: string;
	auth_token?: string;
	sign_in_payload?: SignInPayloadShape;
};

type AuthorizationResult = {
	accounts: ReadonlyArray<{ address: string }>;
	auth_token: string;
	sign_in_result?: SignInResultShape;
};

type Web3MobileWalletShape = {
	authorize: (params: AuthorizeParams) => Promise<AuthorizationResult>;
	signAndSendTransactions: (params: {
		transactions: Transaction[];
	}) => Promise<string[]>;
};

export type TransactFn = <T>(
	cb: (wallet: Web3MobileWalletShape) => Promise<T>,
) => Promise<T>;

// Name only: Seeker Wallet verifies `uri` via Digital Asset Links and fetches `icon` relative to it;
// a `uri` that fails auto-rejects with a CancellationException before the sheet renders.
const APP_IDENTITY = {
	name: "ROAM",
};

const CHAIN = "solana:devnet";

// Lazy `require`: a static import crashes on iOS, web and Expo Go, where the native module is missing.
function loadTransact(): TransactFn | null {
	if (Platform.OS !== "android") return null;
	try {
		const mod =
			require("@solana-mobile/mobile-wallet-adapter-protocol-web3js") as {
				transact?: TransactFn;
			};
		return mod.transact ?? null;
	} catch {
		return null;
	}
}

function isCancellation(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const e = err as { code?: number | string; message?: string };
	// MWA cancels arrive as ERROR_ASSOCIATION_CANCELLED or as a wallet error whose message says cancel.
	if (e.code === "ERROR_ASSOCIATION_CANCELLED") return true;
	return /cancel/i.test(e.message ?? "");
}

function rethrow(err: unknown): never {
	if (isCancellation(err)) throw new SeekerCancelledError();
	const message = err instanceof Error ? err.message : "Seeker protocol error";
	throw new SeekerProtocolError(message, err);
}

function base64AddressToBase58(b64: string): string {
	const bytes = Buffer.from(b64, "base64");
	return new PublicKey(bytes).toBase58();
}

export type SignInPayload = {
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

export type Mwa = {
	mwaAvailable: boolean;
	signIn: (
		payload: SignInPayload,
		opts?: { authToken?: string | null },
	) => Promise<SignInResult>;
	signAndSendTransaction: (
		tx: Transaction,
		opts: { authToken: string },
	) => Promise<string>;
};

export function createMwa(transact: TransactFn | null): Mwa {
	const available = transact !== null;

	const signIn = async (
		payload: SignInPayload,
		opts: { authToken?: string | null } = {},
	): Promise<SignInResult> => {
		if (!transact) {
			throw new SeekerProtocolError("Mobile Wallet Adapter not available");
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
					throw new SeekerProtocolError(
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
			rethrow(err);
		}
	};

	const signAndSendTransaction = async (
		tx: Transaction,
		opts: { authToken: string },
	): Promise<string> => {
		if (!transact) {
			throw new SeekerProtocolError("Mobile Wallet Adapter not available");
		}
		try {
			return await transact(async (wallet) => {
				try {
					await wallet.authorize({
						identity: APP_IDENTITY,
						chain: CHAIN,
						auth_token: opts.authToken,
					});
				} catch {
					await wallet.authorize({
						identity: APP_IDENTITY,
						chain: CHAIN,
					});
				}
				const sigs = await wallet.signAndSendTransactions({
					transactions: [tx],
				});
				const sig = sigs[0];
				if (!sig) {
					throw new SeekerProtocolError("Wallet returned no signature");
				}
				return sig;
			});
		} catch (err) {
			rethrow(err);
		}
	};

	return { mwaAvailable: available, signIn, signAndSendTransaction };
}

export const mwa: Mwa = createMwa(loadTransact());
