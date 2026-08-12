import type { PublicProcessInstanceIdentity } from "./process-instances.js";

/** Optional exact-match filters and the opaque position for one search page. */
export type ProcessInstanceSearchRequest = Readonly<{
  processInstanceId?: string;
  processId?: string;
  version?: number;
  sourceSha256?: string;
  cursor?: string;
  limit?: number;
}>;

/** One newest-first page of exact public Process-instance identities. */
export type ProcessInstanceSearchPage = Readonly<{
  instances: ReadonlyArray<PublicProcessInstanceIdentity>;
  nextCursor: string | null;
}>;
