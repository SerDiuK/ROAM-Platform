import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { Contract } from "@roam/shared";

export type ApiClient = ContractRouterClient<Contract>;

export type CreateApiClientOptions = {
	// Async getter so callers can lazily resolve a token from secure-store /
	// localStorage on every request rather than capturing it at construction
	// time. Returning null/undefined sends the request without an Authorization
	// header — the backend will only allow auth.signIn + health to land.
	getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>;
};

export function createApiClient(
	baseUrl: string,
	options: CreateApiClientOptions = {},
): ApiClient {
	const link = new RPCLink({
		url: `${baseUrl}/rpc`,
		headers: options.getAuthToken
			? async () => {
					const token = await options.getAuthToken?.();
					return token ? { Authorization: `Bearer ${token}` } : {};
				}
			: undefined,
	});
	return createORPCClient(link);
}
