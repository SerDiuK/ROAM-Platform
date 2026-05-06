import type { WalletProvider } from "./provider.js";
import { WalletError } from "./provider.js";

// Crossmint server-side Wallets API. Defaults to the 2022-06-09 stable API
// version. See https://docs.crossmint.com/api-reference for the full surface.
//
// Wallet locators accepted by Crossmint (anywhere {locator} appears below):
//   - wallet id (uuid)
//   - on-chain address
//   - shorthand `userId:<linkedUser>:solana-smart-wallet`
// We use the userId shorthand so a responder's wallet is deterministic from
// their backend ID without us having to track Crossmint's wallet IDs.

const DEFAULT_BASE_URL = "https://www.crossmint.com/api/2022-06-09";
const SOLANA_WALLET_TYPE = "solana-smart-wallet";

export interface CrossmintConfig {
	apiKey: string;
	projectId: string;
	agentWalletId: string;
	usdcMintAddress: string;
	baseUrl?: string;
}

export class CrossmintProvider implements WalletProvider {
	private readonly apiKey: string;
	private readonly projectId: string;
	private readonly agentWalletId: string;
	private readonly usdcMintAddress: string;
	private readonly baseUrl: string;

	constructor(config: CrossmintConfig) {
		this.apiKey = config.apiKey;
		this.projectId = config.projectId;
		this.agentWalletId = config.agentWalletId;
		this.usdcMintAddress = config.usdcMintAddress;
		this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
	}

	async createWallet(responderId: string): Promise<{ address: string }> {
		const body = await this.request<{ address: string }>("POST", "/wallets", {
			type: SOLANA_WALLET_TYPE,
			linkedUser: `userId:${responderId}`,
		});
		return { address: body.address };
	}

	async getAddress(responderId: string): Promise<string | null> {
		const locator = encodeURIComponent(
			`userId:${responderId}:${SOLANA_WALLET_TYPE}`,
		);
		try {
			const body = await this.request<{ address: string }>(
				"GET",
				`/wallets/${locator}`,
			);
			return body.address;
		} catch (err: unknown) {
			if (err instanceof WalletError && err.status === 404) return null;
			throw err;
		}
	}

	async getBalanceUsdc(address: string): Promise<number> {
		const locator = encodeURIComponent(address);
		const body = await this.request<{
			balances?: Array<{ token?: string; amount?: string; decimals?: number }>;
		}>(
			"GET",
			`/wallets/${locator}/balances?currencies=usdc&chains=solana`,
		);
		const usdc = body.balances?.find(
			(b) => b.token?.toLowerCase() === "usdc",
		);
		if (!usdc?.amount) return 0;
		const parsed = Number.parseFloat(usdc.amount);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	async signAndSendUsdc(args: {
		toAddress: string;
		amountUsdc: number;
		memo?: string;
	}): Promise<{ txSignature: string }> {
		const locator = encodeURIComponent(this.agentWalletId);
		const body = await this.request<{ txSignature?: string; hash?: string }>(
			"POST",
			`/wallets/${locator}/tokens/solana:${this.usdcMintAddress}/transfers`,
			{
				recipient: args.toAddress,
				amount: args.amountUsdc.toString(),
				...(args.memo ? { memo: args.memo } : {}),
			},
		);
		const signature = body.txSignature ?? body.hash;
		if (!signature) {
			throw new WalletError({
				message: "Crossmint transfer succeeded but returned no signature",
				status: 502,
				responseBody: body,
			});
		}
		return { txSignature: signature };
	}

	private async request<T>(
		method: "GET" | "POST",
		path: string,
		body?: unknown,
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const init: RequestInit = {
			method,
			headers: {
				"X-API-KEY": this.apiKey,
				"X-Project-Id": this.projectId,
				...(body !== undefined ? { "Content-Type": "application/json" } : {}),
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		};
		const res = await fetch(url, init);
		const text = await res.text();
		const parsed: unknown = text ? safeJsonParse(text) : undefined;
		if (!res.ok) {
			const providerCode = extractCode(parsed);
			throw new WalletError({
				message: `Crossmint ${method} ${path} failed: ${res.status}${
					providerCode ? ` (${providerCode})` : ""
				}`,
				status: res.status,
				providerCode,
				responseBody: parsed ?? text,
			});
		}
		return parsed as T;
	}
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function extractCode(parsed: unknown): string | undefined {
	if (parsed && typeof parsed === "object" && "code" in parsed) {
		const code = (parsed as { code: unknown }).code;
		if (typeof code === "string") return code;
	}
	return undefined;
}
