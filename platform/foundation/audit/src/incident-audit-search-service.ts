import {
  decodeIncidentAuditRequest,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentAuditPage,
  PublicEffectIncidentId,
} from "@bpmn-lean/platform-contracts";

import {
  decodeIncidentAuditCursor,
  encodeIncidentAuditCursor,
} from "./incident-audit-cursor.js";
import type {
  IncidentAuditRepository,
  NormalizedIncidentAuditSearchRequest,
} from "./incident-audit-contracts.js";

const maximumLimit = 100;

/** Projects an authorized incident-audit query without exposing its ordinal. */
export class IncidentAuditSearchService {
  constructor(private readonly repository: IncidentAuditRepository) {}

  async search(
    request: NormalizedIncidentAuditSearchRequest,
  ): Promise<IncidentAuditPage> {
    const decoded = decodeIncidentAuditRequest(request);
    const limit = requireLimit(decoded.limit);
    const afterOrdinal = decoded.cursor === undefined
      ? undefined
      : decodeIncidentAuditCursor(decoded.cursor);
    const incidentId = completeIncidentId(decoded);
    const rows = await this.repository.search({
      ...(decoded.actorId === undefined ? {} : { actorId: decoded.actorId }),
      ...(decoded.hostingProcessInstanceId === undefined
        ? {}
        : { hostingProcessInstanceId: decoded.hostingProcessInstanceId }),
      ...(incidentId === undefined ? {} : { incidentId }),
      ...(decoded.actionKind === undefined
        ? {}
        : { actionKind: decoded.actionKind }),
      ...(afterOrdinal === undefined ? {} : { afterOrdinal }),
      limit: limit + 1,
    });
    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    return {
      events: page.map(({ event }) => event),
      nextCursor: hasNext && last !== undefined
        ? encodeIncidentAuditCursor(last.ordinal)
        : null,
    };
  }
}

function completeIncidentId(
  request: ReturnType<typeof decodeIncidentAuditRequest>,
): PublicEffectIncidentId | undefined {
  if (
    request.incidentProcessInstanceId === undefined ||
    request.incidentElementId === undefined ||
    request.incidentActivation === undefined ||
    request.incidentGeneration === undefined
  ) {
    return undefined;
  }
  return {
    effectId: {
      processInstanceId: request.incidentProcessInstanceId,
      elementId: request.incidentElementId,
      activation: request.incidentActivation,
    },
    generation: request.incidentGeneration,
  };
}

function requireLimit(value: number | undefined): number {
  if (
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maximumLimit
  ) {
    throw new TypeError(`incident audit limit must be between 1 and ${maximumLimit}`);
  }
  return value;
}
