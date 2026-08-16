import type { WorkAuditPage } from "@bpmn-lean/platform-contracts";

import type {
  AuditRepository,
  AuthorizedAuditSearchRequest,
} from "./audit-contracts.js";

const maximumLimit = 100;

/** Projects an authorized self-audit query without exposing its insertion ordinal. */
export class AuditSearchService {
  constructor(private readonly repository: AuditRepository) {}

  async search(request: AuthorizedAuditSearchRequest): Promise<WorkAuditPage> {
    requireRequest(request);
    const afterOrdinal = request.cursor === undefined
      ? undefined
      : decodeCursor(request.cursor);
    const rows = await this.repository.search({
      actorId: request.actorId,
      ...(request.taskProcessInstanceId === undefined
        ? {}
        : { taskProcessInstanceId: request.taskProcessInstanceId }),
      ...(request.hostingProcessInstanceId === undefined
        ? {}
        : { hostingProcessInstanceId: request.hostingProcessInstanceId }),
      ...(request.actionKind === undefined ? {} : { actionKind: request.actionKind }),
      ...(afterOrdinal === undefined ? {} : { afterOrdinal }),
      limit: request.limit + 1,
    });
    const hasNext = rows.length > request.limit;
    const page = hasNext ? rows.slice(0, request.limit) : rows;
    const last = page.at(-1);
    return {
      events: page.map(({ event }) => event),
      nextCursor: hasNext && last !== undefined ? encodeCursor(last.ordinal) : null,
    };
  }
}

function requireRequest(request: AuthorizedAuditSearchRequest): void {
  if (typeof request.actorId !== "string" || request.actorId.length === 0) {
    throw new TypeError("audit actorId must be nonempty");
  }
  if (!Number.isSafeInteger(request.limit) || request.limit <= 0 || request.limit > maximumLimit) {
    throw new TypeError(`audit limit must be between 1 and ${maximumLimit}`);
  }
}

function encodeCursor(ordinal: number): string {
  return `v1.${Buffer.from(String(ordinal), "utf8").toString("base64url")}`;
}

function decodeCursor(cursor: string): number {
  if (!/^v1\.[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new TypeError("audit cursor must be a nonempty unpadded v1 base64url cursor");
  }
  const encoded = cursor.slice(3);
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  if (Buffer.from(decoded, "utf8").toString("base64url") !== encoded || !/^[1-9][0-9]*$/.test(decoded)) {
    throw new TypeError("audit cursor payload is invalid");
  }
  const ordinal = Number(decoded);
  if (!Number.isSafeInteger(ordinal) || ordinal <= 0) {
    throw new TypeError("audit cursor ordinal is invalid");
  }
  return ordinal;
}
