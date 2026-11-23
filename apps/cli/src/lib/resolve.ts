import type { ApiClient } from "@roam/api";

export async function resolveDispatchId(
	api: ApiClient,
	idOrPrefix: string,
): Promise<string | null> {
	if (idOrPrefix.length >= 36) return idOrPrefix;

	const active = await api.dispatch.list();
	const activeMatches = active.filter((d) => d._id.startsWith(idOrPrefix));
	if (activeMatches.length === 1) return activeMatches[0]?._id ?? null;
	if (activeMatches.length > 1) return null;

	const all = await api.dispatch.list({ includeCleared: true, limit: 50 });
	const allMatches = all.filter((d) => d._id.startsWith(idOrPrefix));
	if (allMatches.length === 1) return allMatches[0]?._id ?? null;
	return null;
}

export async function resolveResponderId(
	api: ApiClient,
	idOrPrefixOrName: string,
): Promise<string | null> {
	if (idOrPrefixOrName.length >= 36) return idOrPrefixOrName;
	const responders = await api.responders.list();
	const exactName = responders.find(
		(r) => r.name.toLowerCase() === idOrPrefixOrName.toLowerCase(),
	);
	if (exactName) return exactName._id;
	const matches = responders.filter((r) => r._id.startsWith(idOrPrefixOrName));
	if (matches.length === 1) return matches[0]?._id ?? null;
	return null;
}
