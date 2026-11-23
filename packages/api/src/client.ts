import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { Contract } from "@roam/shared";

export type ApiClient = ContractRouterClient<Contract>;

type CreateApiClientOptions = {
	getAuthToken?: () =>
		| string
		| null
		| undefined
		| Promise<string | null | undefined>;
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
