import {
  decodePutDefinitionScheduleRequest,
  parseStrictJson,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  PutDefinitionScheduleRequest,
} from "@bpmn-lean/platform-contracts";

import {
  HttpRequestFailure,
  readBoundedBody,
} from "./http-request.js";

const scheduleRequestBodyLimit = 1_024;

/** Reads the closed schedule request while keeping shape and value failures distinct. */
export async function readDefinitionScheduleRequest(
  request: Request,
): Promise<PutDefinitionScheduleRequest> {
  if (request.headers.get("content-type") !== "application/json") {
    throw new HttpRequestFailure(
      415,
      PublicApiErrorCode.UnsupportedMediaType,
      "Definition schedule creation requires application/json.",
    );
  }
  const bytes = await readBoundedBody(request, scheduleRequestBodyLimit, {
    empty: "The definition schedule request body must not be empty.",
    tooLarge: "The definition schedule request exceeds 1024 bytes.",
  });
  let value: unknown;
  try {
    value = parseStrictJson(bytes);
  } catch {
    throw invalidJson();
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw malformedShape();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    !Object.hasOwn(record, "activationAt") ||
    typeof record.activationAt !== "string"
  ) {
    throw malformedShape();
  }
  try {
    return decodePutDefinitionScheduleRequest(value);
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      throw new HttpRequestFailure(
        422,
        PublicApiErrorCode.InvalidRequest,
        error.message,
      );
    }
    throw error;
  }
}

function invalidJson(): HttpRequestFailure {
  return new HttpRequestFailure(
    400,
    PublicApiErrorCode.InvalidRequest,
    "The definition schedule request must be valid UTF-8 JSON.",
  );
}

function malformedShape(): HttpRequestFailure {
  return new HttpRequestFailure(
    400,
    PublicApiErrorCode.InvalidRequest,
    "The definition schedule request must contain only string activationAt.",
  );
}
