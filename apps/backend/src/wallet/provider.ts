export interface WalletProvider {
	createWallet(responderId: string): Promise<{ address: string }>;
	getAddress(responderId: string): Promise<string | null>;
	getBalanceUsdc(address: string): Promise<number>;
	signAndSendUsdc(args: {
		toAddress: string;
		amountUsdc: number;
		memo?: string;
	}): Promise<{ txSignature: string }>;
}

export class WalletError extends Error {
	readonly status: number;
	readonly providerCode: string | undefined;
	readonly responseBody: unknown;

	constructor(args: {
		message: string;
		status: number;
		providerCode?: string;
		responseBody?: unknown;
	}) {
		super(args.message);
		this.name = "WalletError";
		this.status = args.status;
		this.providerCode = args.providerCode;
		this.responseBody = args.responseBody;
	}
}
