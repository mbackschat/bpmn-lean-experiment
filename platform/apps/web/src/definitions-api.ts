import {
  DefinitionDeployStatus,
  ProcessInstanceStartStatus,
  decodeDefinitionDeployResult,
  decodeDefinitionListResponse,
  decodeDefinitionVersionListResponse,
  decodeProcessInstanceStartResult,
  decodePublicApiErrorResponse,
  definitionsCollectionPath,
  definitionVersionStartPath,
  definitionVersionsPath,
  definitionVersionSourcePath,
  LegacyPublicApiErrorCodes,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionDeployResult,
  DefinitionListResponse,
  DefinitionVersionListResponse,
  DeployedDefinitionVersion,
  ProcessInstanceStartResult,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";

import {
  sameExactDefinition,
  snapshotExactDefinition,
} from "./exact-definition.ts";

export type DefinitionDeploymentInput = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  semanticProfile: string;
}>;

export class DefinitionApiError extends Error {
  readonly status: number;
  readonly code: PublicApiErrorCode;

  constructor(status: number, code: PublicApiErrorCode, message: string) {
    super(message);
    this.name = "DefinitionApiError";
    this.status = status;
    this.code = code;
  }
}

export class DefinitionProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DefinitionProtocolError";
  }
}

/** Same-origin public definition client. It never consumes server or engine implementation state. */
export class DefinitionApiClient {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("definition API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async deploy(input: DefinitionDeploymentInput): Promise<DefinitionDeployResult> {
    requireNonempty(input.sourceId, "sourceId");
    requireNonempty(input.semanticProfile, "semanticProfile");
    const bytes = input.bytes.slice();
    const url = this.#url(definitionsCollectionPath());
    url.searchParams.set("sourceId", input.sourceId);
    url.searchParams.set("semanticProfile", input.semanticProfile);
    const response = await this.#fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/bpmn+xml",
      },
      body: bytes,
    });
    if (response.status !== 201 && response.status !== 422) {
      return await this.#throwApiError(response);
    }
    const result = decodeResponse(
      await readJson(response),
      decodeDefinitionDeployResult,
      "deployment response",
    );
    if (
      (response.status === 201 && result.status !== DefinitionDeployStatus.Deployed) ||
      (response.status === 422 && result.status !== DefinitionDeployStatus.Rejected)
    ) {
      throw new DefinitionProtocolError("deployment HTTP status does not match its result status");
    }
    return result;
  }

  async listDefinitions(): Promise<DefinitionListResponse> {
    const response = await this.#fetch(this.#url(definitionsCollectionPath()), {
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    return decodeResponse(
      await readJson(response),
      decodeDefinitionListResponse,
      "definition-list response",
    );
  }

  async listVersions(processId: string): Promise<DefinitionVersionListResponse> {
    const response = await this.#fetch(this.#url(definitionVersionsPath(processId)), {
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    return decodeResponse(
      await readJson(response),
      decodeDefinitionVersionListResponse,
      "definition-version response",
    );
  }

  async getSource(definition: DeployedDefinitionVersion): Promise<Uint8Array> {
    const response = await this.#fetch(this.#url(definitionVersionSourcePath(
      definition.processId,
      definition.version,
    )), {
      headers: { accept: "application/bpmn+xml, application/xml, text/xml" },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    requireXml(response);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== definition.source.byteLength) {
      throw new DefinitionProtocolError("definition source byte length does not match its deployed identity");
    }
    const digest = await sha256(bytes);
    if (digest !== definition.source.sha256) {
      throw new DefinitionProtocolError("definition source digest does not match its deployed identity");
    }
    if (response.headers.get("etag") !== `"sha256-${digest}"`) {
      throw new DefinitionProtocolError("definition source ETag does not match its deployed identity");
    }
    return bytes.slice();
  }

  async start(definition: DeployedDefinitionVersion): Promise<ProcessInstanceStartResult> {
    const expected = snapshotExactDefinition(definition);
    const response = await this.#fetch(this.#url(definitionVersionStartPath(
      expected.processId,
      expected.version,
    )), {
      method: "POST",
      headers: { accept: "application/json" },
    });
    if (response.status !== 201 && response.status !== 422) {
      return await this.#throwApiError(response);
    }
    const result = decodeResponse(
      await readJson(response),
      decodeProcessInstanceStartResult,
      "process-instance start response",
    );
    if (
      (response.status === 201 && result.status !== ProcessInstanceStartStatus.Started) ||
      (response.status === 422 && result.status !== ProcessInstanceStartStatus.Rejected)
    ) {
      throw new DefinitionProtocolError(
        "process-instance start HTTP status does not match its result status",
      );
    }
    const actual = result.status === ProcessInstanceStartStatus.Started
      ? result.instance.definition
      : result.definition;
    if (!sameExactDefinition(actual, expected)) {
      throw new DefinitionProtocolError(
        "process-instance start response does not match the requested definition identity",
      );
    }
    return result;
  }

  #url(pathname: string): URL {
    return new URL(pathname, this.#origin);
  }

  async #throwApiError(response: Response): Promise<never> {
    const decoded = decodeResponse(
      await readJson(response),
      (value) => decodePublicApiErrorResponse(value, LegacyPublicApiErrorCodes),
      "API error response",
    );
    throw new DefinitionApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new DefinitionProtocolError("definition API JSON response has an unexpected media type");
  }
  try {
    return await response.json() as unknown;
  } catch (cause: unknown) {
    throw new DefinitionProtocolError("definition API returned malformed JSON", { cause });
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

function requireXml(response: Response): void {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  switch (mediaType) {
    case "application/bpmn+xml":
    case "application/xml":
    case "text/xml":
      return;
    default:
      throw new DefinitionProtocolError("definition source response has an unexpected media type");
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", ownedBytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function requireNonempty(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
}
