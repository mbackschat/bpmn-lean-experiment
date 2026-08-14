import { LatestRequest } from "./latest-request.ts";

export type RequestedAuditFocus = "heading" | "firstNew" | null;
export type ResolvedAuditFocus = "heading" | "firstNew" | "status" | null;

export type IncidentAuditLoad = Readonly<{
  focus: RequestedAuditFocus;
  generation: number;
}>;

/** Binds focus intent immutably to the same generation as its audit request. */
export function beginIncidentAuditLoad(
  sequence: LatestRequest,
  focus: RequestedAuditFocus,
): IncidentAuditLoad {
  return Object.freeze({ focus, generation: sequence.begin() });
}

export function resolveIncidentAuditFocus(
  sequence: LatestRequest,
  load: IncidentAuditLoad,
  returnedEventCount: number,
): ResolvedAuditFocus {
  if (!sequence.isCurrent(load.generation)) return null;
  if (load.focus === null) return null;
  if (returnedEventCount === 0) return "status";
  return load.focus;
}

export function resolveIncidentAuditFailureFocus(
  sequence: LatestRequest,
  load: IncidentAuditLoad,
): "alert" | null {
  return sequence.isCurrent(load.generation) ? "alert" : null;
}
