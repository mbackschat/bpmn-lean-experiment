import {
  decodeProcessInstanceSearchPage,
  decodeProcessInstanceSearchRequest,
  decodePublicApiErrorResponse,
  processInstancesPath,
  LegacyPublicApiErrorCodes,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";
import type {
  ProcessInstanceSearchPage,
  ProcessInstanceSearchRequest,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "./definitions-api.ts";

export type ProcessInstanceSearchApi = Readonly<{
  search(request?: ProcessInstanceSearchRequest): Promise<ProcessInstanceSearchPage>;
  loadMore(
    request: ProcessInstanceSearchRequest,
    nextCursor: string,
    accumulatedProcessInstanceIds: ReadonlySet<string>,
  ): Promise<ProcessInstanceSearchPage>;
}>;

/** HTTP-only global search client that accepts only identities matching its exact filters. */
export class ProcessInstanceSearchApiClient implements ProcessInstanceSearchApi {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Process-instance search API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async search(
    request: ProcessInstanceSearchRequest = {},
  ): Promise<ProcessInstanceSearchPage> {
    const expected = snapshotRequest(request);
    return await this.#read(expected, new Set());
  }

  async loadMore(
    request: ProcessInstanceSearchRequest,
    nextCursor: string,
    accumulatedProcessInstanceIds: ReadonlySet<string>,
  ): Promise<ProcessInstanceSearchPage> {
    const filters = snapshotRequest(request);
    const expected = snapshotRequest({ ...filters, cursor: nextCursor });
    return await this.#read(expected, new Set(accumulatedProcessInstanceIds));
  }

  async #read(
    expected: ProcessInstanceSearchRequest,
    accumulatedProcessInstanceIds: ReadonlySet<string>,
  ): Promise<ProcessInstanceSearchPage> {
    const response = await this.#fetch(
      new URL(processInstancesPath(expected), this.#origin),
      { headers: { accept: "application/json" } },
    );
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    const page = decodeResponse(
      await readJson(response),
      decodeProcessInstanceSearchPage,
      "Process-instance search response",
    );
    requireMatchingPage(page, expected, accumulatedProcessInstanceIds);
    return page;
  }

  async #throwApiError(response: Response): Promise<never> {
    const decoded = decodeResponse(
      await readJson(response),
      (value) => decodePublicApiErrorResponse(value, LegacyPublicApiErrorCodes),
      "Process-instance search API error response",
    );
    throw new DefinitionApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
    );
  }
}

function snapshotRequest(
  request: ProcessInstanceSearchRequest,
): ProcessInstanceSearchRequest {
  return decodeProcessInstanceSearchRequest(request);
}

function requireMatchingPage(
  page: ProcessInstanceSearchPage,
  expected: ProcessInstanceSearchRequest,
  accumulatedProcessInstanceIds: ReadonlySet<string>,
): void {
  const pageIds = new Set<string>();
  for (const instance of page.instances) {
    requireMatchingInstance(instance, expected);
    if (pageIds.has(instance.processInstanceId)) {
      throw new DefinitionProtocolError(
        "Process-instance search response contains a duplicate Process-instance ID",
      );
    }
    if (accumulatedProcessInstanceIds.has(instance.processInstanceId)) {
      throw new DefinitionProtocolError(
        "Process-instance search response repeats an already accumulated Process-instance ID",
      );
    }
    pageIds.add(instance.processInstanceId);
  }
}

function requireMatchingInstance(
  instance: PublicProcessInstanceIdentity,
  expected: ProcessInstanceSearchRequest,
): void {
  requireFilterMatch(
    expected.processInstanceId,
    instance.processInstanceId,
    "processInstanceId",
  );
  requireFilterMatch(expected.processId, instance.definition.processId, "processId");
  requireFilterMatch(expected.version, instance.definition.version, "version");
  requireFilterMatch(
    expected.sourceSha256,
    instance.definition.source.sha256,
    "sourceSha256",
  );
}

function requireFilterMatch(
  expected: number | string | undefined,
  actual: number | string,
  label: string,
): void {
  if (expected !== undefined && actual !== expected) {
    throw new DefinitionProtocolError(
      `Process-instance search response violates the exact ${label} filter`,
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new DefinitionProtocolError(
      "Process-instance search API JSON response has an unexpected media type",
    );
  }
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return parseStrictJson(bytes);
  } catch (cause: unknown) {
    throw new DefinitionProtocolError(
      "Process-instance search API returned malformed JSON",
      { cause },
    );
  }
}

function decodeResponse<Result>(
  value: unknown,
  decoder: (candidate: unknown) => Result,
  label: string,
): Result {
  try {
    return decoder(value);
  } catch (cause: unknown) {
    throw new DefinitionProtocolError(`${label} violates the public contract`, { cause });
  }
}
