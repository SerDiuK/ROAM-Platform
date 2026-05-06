import type { Dispatch, DispatchResponse, Responder } from "@roam/shared";
export declare function shortId(id: string): string;
export declare function formatStatus(status: Dispatch["status"]): string;
export declare function formatDecision(decision: DispatchResponse["decision"]): string;
export declare function formatRole(role: Responder["role"]): string;
export declare function formatRelative(date: Date | string): string;
//# sourceMappingURL=format.d.ts.map