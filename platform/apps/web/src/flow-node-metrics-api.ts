import {
  decodeFlowNodeMetricsResult,
  decodePublicApiErrorResponse,
  flowNodeMetricsPath,
  FlowNodeMetricsApiErrorCodes,
  parseStrictJson,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  FlowNodeMetricsApiErrorCode,
  FlowNodeMetricsResult,
} from "@bpmn-lean/platform-contracts";

import { snapshotExactDefinition } from "./exact-definition.ts";

const jsonMediaType = "application/json";
export const FlowNodeMetricsResponseByteLimit = 1_048_576;

export type FlowNodeMetricsApi = Readonly<{
  get(definition: DeployedDefinitionVersion): Promise<FlowNodeMetricsResult>;
}>;

export class FlowNodeMetricsApiError extends Error {
  readonly status: number;
  readonly code: FlowNodeMetricsApiErrorCode;

  constructor(status: number, code: FlowNodeMetricsApiErrorCode, message: string) {
    super(message);
    this.name = "FlowNodeMetricsApiError";
    this.status = status;
    this.code = code;
  }
}

export class FlowNodeMetricsProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FlowNodeMetricsProtocolError";
  }
}

/** HTTP-only client for one all-or-error exact-definition metrics result. */
export class FlowNodeMetricsApiClient implements FlowNodeMetricsApi {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Flow-node metrics API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async get(requestedDefinition: DeployedDefinitionVersion): Promise<FlowNodeMetricsResult> {
    const definition = snapshotExactDefinition(requestedDefinition);
    const response = await this.#fetch(new URL(flowNodeMetricsPath(
      definition.processId,
      definition.version,
    ), this.#origin), {
      method: "GET",
      headers: { accept: jsonMediaType },
    });
    if (response.status === 200) {
      try {
        return decodeFlowNodeMetricsResult(await readStrictJson(response), definition);
      } catch (cause: unknown) {
        if (cause instanceof FlowNodeMetricsProtocolError) throw cause;
        throw new FlowNodeMetricsProtocolError(
          "flow-node metrics response violates the public contract",
          { cause },
        );
      }
    }
    if (!isApprovedErrorStatus(response.status)) {
      throw new FlowNodeMetricsProtocolError(
        `flow-node metrics API returned unexpected HTTP status ${response.status}`,
      );
    }
    let decoded;
    try {
      decoded = decodePublicApiErrorResponse(
        await readStrictJson(response),
        FlowNodeMetricsApiErrorCodes,
      );
    } catch (cause: unknown) {
      if (cause instanceof FlowNodeMetricsProtocolError) throw cause;
      throw new FlowNodeMetricsProtocolError(
        "flow-node metrics API error violates the public contract",
        { cause },
      );
    }
    if (!statusMatchesCode(response.status, decoded.error.code)) {
      throw new FlowNodeMetricsProtocolError(
        "flow-node metrics API error status does not match its public code",
      );
    }
    throw new FlowNodeMetricsApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
    );
  }
}

async function readStrictJson(response: Response): Promise<unknown> {
  requireJsonMediaType(response);
  const bytes = await readBoundedBytes(response);
  try {
    return parseStrictJson(bytes);
  } catch (cause: unknown) {
    throw new FlowNodeMetricsProtocolError(
      "flow-node metrics API returned malformed JSON",
      { cause },
    );
  }
}

function requireJsonMediaType(response: Response): void {
  const mediaType = response.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== jsonMediaType) {
    throw new FlowNodeMetricsProtocolError(
      "flow-node metrics response has an unexpected media type",
    );
  }
}

async function readBoundedBytes(response: Response): Promise<Uint8Array> {
  const claimed = response.headers.get("content-length");
  if (claimed !== null) {
    if (!/^(0|[1-9][0-9]*)$/u.test(claimed) || !Number.isSafeInteger(Number(claimed))) {
      throw new FlowNodeMetricsProtocolError(
        "flow-node metrics response has an invalid content length",
      );
    }
    if (Number(claimed) > FlowNodeMetricsResponseByteLimit) {
      throw new FlowNodeMetricsProtocolError(
        "flow-node metrics response exceeds the byte limit",
      );
    }
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value.byteLength > FlowNodeMetricsResponseByteLimit - byteLength) {
      await reader.cancel();
      throw new FlowNodeMetricsProtocolError(
        "flow-node metrics response exceeds the byte limit",
      );
    }
    chunks.push(next.value);
    byteLength += next.value.byteLength;
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isApprovedErrorStatus(status: number): boolean {
  switch (status) {
    case 400:
    case 403:
    case 404:
    case 405:
    case 500:
    case 503:
      return true;
    default:
      return false;
  }
}

function statusMatchesCode(status: number, code: FlowNodeMetricsApiErrorCode): boolean {
  switch (status) {
    case 400:
      return code === PublicApiErrorCode.InvalidRequest;
    case 403:
      return code === PublicApiErrorCode.Forbidden;
    case 404:
      return code === PublicApiErrorCode.NotFound;
    case 405:
      return code === PublicApiErrorCode.MethodNotAllowed;
    case 500:
      return code === PublicApiErrorCode.InternalFailure;
    case 503:
      return code === PublicApiErrorCode.FlowNodeMetricsUnavailable;
    default:
      return false;
  }
}
