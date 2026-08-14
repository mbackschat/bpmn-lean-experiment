import {
  decodeProcessInstanceSearchRequest,
} from "@bpmn-lean/platform-contracts";
import type {
  ProcessInstanceSearchPage,
  ProcessInstanceSearchRequest,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import type {
  ProcessInstanceRepository,
  ProcessInstanceRepositoryQuery,
} from "./contracts.js";
import type {
  ConfirmedProcessOperationsPublication,
} from "./incident-contracts.js";
import { snapshotProcessInstanceIdentity } from "./process-instance-values.js";

const defaultLimit = 50;
const cursorPrefix = "v1.";
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;

/** Records and searches the exact confirmed-start registry without adding state. */
export class ProcessInstanceSearchService {
  constructor(private readonly repository: ProcessInstanceRepository) {}

  /** Structural publisher port consumed by definitions without a module import. */
  async recordConfirmedProcessInstance(
    publication: ConfirmedProcessOperationsPublication,
  ): Promise<void> {
    this.repository.recordConfirmed({
      instance: snapshotProcessInstanceIdentity(publication.instance),
      locator: publication.locator,
    });
  }

  /** Returns at most 50 by default or the requested maximum of 100 exact identities. */
  searchProcessInstances(
    request: ProcessInstanceSearchRequest,
  ): ProcessInstanceSearchPage {
    const decoded = decodeProcessInstanceSearchRequest(request);
    const limit = decoded.limit ?? defaultLimit;
    const rows = this.repository.search(repositoryQuery(
      decoded,
      limit + 1,
    ));
    const pageRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = pageRows.at(-1);
    return {
      instances: pageRows.map(({ instance }) =>
        snapshotProcessInstanceIdentity(instance)
      ),
      nextCursor: hasMore && last !== undefined
        ? encodeCursor(last.ordinal)
        : null,
    };
  }
}

function repositoryQuery(
  request: ProcessInstanceSearchRequest,
  limit: number,
): ProcessInstanceRepositoryQuery {
  return {
    ...(request.processInstanceId === undefined
      ? {}
      : { processInstanceId: request.processInstanceId }),
    ...(request.processId === undefined
      ? {}
      : { processId: request.processId }),
    ...(request.version === undefined ? {} : { version: request.version }),
    ...(request.sourceSha256 === undefined
      ? {}
      : { sourceSha256: request.sourceSha256 }),
    ...(request.cursor === undefined
      ? {}
      : { beforeOrdinal: decodeCursor(request.cursor) }),
    limit,
  };
}

function encodeCursor(ordinal: number): string {
  requirePositiveSafeInteger(ordinal, "ordinal");
  return cursorPrefix + Buffer.from(String(ordinal), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): number {
  if (!cursor.startsWith(cursorPrefix)) {
    throw new TypeError("cursor has an unsupported version");
  }
  const payload = cursor.slice(cursorPrefix.length);
  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch (error: unknown) {
    throw new TypeError("cursor payload is invalid", { cause: error });
  }
  if (
    !canonicalPositiveInteger.test(decoded) ||
    Buffer.from(decoded, "utf8").toString("base64url") !== payload
  ) {
    throw new TypeError("cursor payload is not a canonical ordinal");
  }
  const ordinal = Number(decoded);
  requirePositiveSafeInteger(ordinal, "cursor ordinal");
  return ordinal;
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}
