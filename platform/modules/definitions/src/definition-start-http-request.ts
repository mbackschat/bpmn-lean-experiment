import {
  decodeDefinitionVersionStartCommand,
  parseStrictJson,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type { DefinitionVersionStartCommand } from "@bpmn-lean/platform-contracts";

import { HttpRequestFailure, readBoundedBody } from "./http-request.js";

const startCommandBodyLimit = 1_048_576;

/** Reads the required closed start command without weakening its recursive value contract. */
export async function readDefinitionVersionStartCommand(
  request: Request,
): Promise<DefinitionVersionStartCommand> {
  if (request.headers.get("content-type") !== "application/json") {
    throw new HttpRequestFailure(
      415,
      PublicApiErrorCode.UnsupportedMediaType,
      "Definition start requires application/json.",
    );
  }
  const bytes = await readBoundedBody(request, startCommandBodyLimit, {
    empty: "The definition start command body must not be empty.",
    tooLarge: "The definition start command exceeds 1048576 bytes.",
  });
  let value: unknown;
  try {
    value = parseStrictJson(bytes);
  } catch {
    throw new HttpRequestFailure(
      400,
      PublicApiErrorCode.InvalidRequest,
      "The definition start command must be valid UTF-8 JSON.",
    );
  }
  try {
    return decodeDefinitionVersionStartCommand(value);
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
