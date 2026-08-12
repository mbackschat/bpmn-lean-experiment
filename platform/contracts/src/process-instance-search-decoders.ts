import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
} from "./decoder-primitives.js";
import { decodePublicProcessInstanceIdentity } from "./process-instance-decoders.js";
import type {
  ProcessInstanceSearchPage,
  ProcessInstanceSearchRequest,
} from "./process-instance-search.js";

const requestFields = new Set([
  "cursor",
  "limit",
  "processId",
  "processInstanceId",
  "sourceSha256",
  "version",
]);
const lowercaseSha256 = /^[0-9a-f]{64}$/u;
const opaqueCursor = /^v1\.[A-Za-z0-9_-]+$/u;

/** Decodes the closed optional exact-filter request without adding defaults. */
export function decodeProcessInstanceSearchRequest(
  value: unknown,
): ProcessInstanceSearchRequest {
  requireObject(value, "process instance search request");
  requireKnownRequestFields(value);
  return {
    ...(Object.hasOwn(value, "processInstanceId")
      ? {
          processInstanceId: requireNonemptyString(
            readOwn(value, "processInstanceId"),
            "process instance search request.processInstanceId",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "processId")
      ? {
          processId: requireNonemptyString(
            readOwn(value, "processId"),
            "process instance search request.processId",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "version")
      ? { version: decodePositiveSafeInteger(readOwn(value, "version"), "version") }
      : {}),
    ...(Object.hasOwn(value, "sourceSha256")
      ? { sourceSha256: decodeSourceSha256(readOwn(value, "sourceSha256")) }
      : {}),
    ...(Object.hasOwn(value, "cursor")
      ? { cursor: decodeOpaqueCursor(readOwn(value, "cursor"), "cursor") }
      : {}),
    ...(Object.hasOwn(value, "limit")
      ? { limit: decodeLimit(readOwn(value, "limit")) }
      : {}),
  };
}

/** Decodes one closed page and rejects private fields at every nested level. */
export function decodeProcessInstanceSearchPage(
  value: unknown,
): ProcessInstanceSearchPage {
  requireObject(value, "process instance search page");
  requireExactKeys(value, "process instance search page", [
    "instances",
    "nextCursor",
  ]);
  const instances = readOwn(value, "instances");
  if (!Array.isArray(instances)) {
    throw new TypeError("process instance search page.instances must be an array");
  }
  const nextCursor = readOwn(value, "nextCursor");
  return {
    instances: Array.from(instances, (instance, index) =>
      decodePublicProcessInstanceIdentity(
        instance,
        `process instance search page.instances[${index}]`,
      )
    ),
    nextCursor: nextCursor === null
      ? null
      : decodeOpaqueCursor(nextCursor, "process instance search page.nextCursor"),
  };
}

/** Validates the public syntax while leaving the cursor payload opaque. */
export function decodeOpaqueProcessInstanceSearchCursor(
  value: unknown,
  label = "cursor",
): string {
  return decodeOpaqueCursor(value, label);
}

function requireKnownRequestFields(value: object): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !requestFields.has(key)) {
      throw new TypeError("process instance search request contains an unknown field");
    }
  }
}

function decodePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(
      `process instance search request.${label} must be a positive safe integer`,
    );
  }
  return value;
}

function decodeSourceSha256(value: unknown): string {
  if (typeof value !== "string" || !lowercaseSha256.test(value)) {
    throw new TypeError(
      "process instance search request.sourceSha256 must be a lowercase SHA-256 digest",
    );
  }
  return value;
}

function decodeOpaqueCursor(value: unknown, label: string): string {
  if (typeof value !== "string" || !opaqueCursor.test(value)) {
    throw new TypeError(`${label} must be an opaque versioned cursor`);
  }
  return value;
}

function decodeLimit(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw new TypeError(
      "process instance search request.limit must be an integer from 1 through 100",
    );
  }
  return value;
}
