import {
  DefinitionDeployStatus,
  ProcessInstanceStartStatus,
  decodeDefinitionDeployResult,
  decodeDefinitionListResponse,
  decodeResolvedBpmnDiagramPresentation,
  decodeDefinitionVersionListResponse,
  decodeProcessInstanceStartResult,
  decodePublicApiErrorResponse,
  definitionsCollectionPath,
  definitionVersionPresentationPath,
  definitionVersionStartPath,
  definitionVersionsPath,
  definitionVersionSourcePath,
  LegacyPublicApiErrorCodes,
  parseWireJson,
  serializeDefinitionVersionStartCommand,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionVersionStartCommand,
  DefinitionDeployResult,
  DefinitionListResponse,
  DefinitionVersionListResponse,
  DeployedDefinitionVersion,
  ProcessInstanceStartResult,
  PublicApiErrorCode,
  ResolvedBpmnDiagramPresentation,
} from "@bpmn-lean/platform-contracts";

import {
  sameExactDefinition,
  snapshotExactDefinition,
} from "./exact-definition.ts";

/** Caller-owned bytes are borrowed; deploy captures every byte and literal before I/O. */
export type DefinitionDeploymentInput = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  semanticProfile: string;
  sourceOverlay?: Readonly<{ id: string; sha256: string; bytes: Uint8Array }>;
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
    const sourceId = input.sourceId;
    const semanticProfile = input.semanticProfile;
    requireNonempty(sourceId, "sourceId");
    requireNonempty(semanticProfile, "semanticProfile");
    const bytes = input.bytes.slice();
    const selectedOverlay = input.sourceOverlay;
    const overlaySelection = selectedOverlay === undefined ? undefined : {
      id: selectedOverlay.id, sha256: selectedOverlay.sha256, bytes: selectedOverlay.bytes,
    };
    if (overlaySelection !== undefined) requireSourceOverlay(overlaySelection);
    const sourceOverlay = overlaySelection === undefined ? undefined : {
      ...overlaySelection, bytes: overlaySelection.bytes.slice(),
    };
    const url = this.#url(definitionsCollectionPath());
    url.searchParams.set("sourceId", sourceId);
    url.searchParams.set("semanticProfile", semanticProfile);
    const response = await this.#fetch(url, {
      method: "POST",
      headers: sourceOverlay === undefined ? {
        accept: "application/json",
        "content-type": "application/bpmn+xml",
      } : { accept: "application/json" },
      body: sourceOverlay === undefined ? bytes : deploymentMultipart(bytes, sourceOverlay),
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

  async getPresentation(
    definition: DeployedDefinitionVersion,
  ): Promise<ResolvedBpmnDiagramPresentation> {
    const expected = snapshotExactDefinition(definition);
    const response = await this.#fetch(this.#url(definitionVersionPresentationPath(
      expected.processId,
      expected.version,
    )), {
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    const presentation = decodeResponse(
      await readJson(response),
      decodeResolvedBpmnDiagramPresentation,
      "definition presentation response",
    );
    if (!sameExactDefinition(presentation.definition, expected)) {
      throw new DefinitionProtocolError(
        "definition presentation response does not match the requested definition identity",
      );
    }
    if (presentation.sourceSha256 !== presentation.definition.source.sha256) {
      throw new DefinitionProtocolError(
        "definition presentation source digest does not match its deployed identity",
      );
    }
    const digest = await sha256(new TextEncoder().encode(
      presentation.presentationBpmnXml,
    ));
    if (digest !== presentation.presentationSha256) {
      throw new DefinitionProtocolError(
        "definition presentation digest does not match its exact UTF-8 bytes",
      );
    }
    return presentation;
  }

  async start(
    definition: DeployedDefinitionVersion,
    command: DefinitionVersionStartCommand,
  ): Promise<ProcessInstanceStartResult> {
    const expected = snapshotExactDefinition(definition);
    const commandBytes = serializeDefinitionVersionStartCommand(command);
    const response = await this.#fetch(this.#url(definitionVersionStartPath(
      expected.processId,
      expected.version,
    )), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: Uint8Array.from(commandBytes).buffer,
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

function requireSourceOverlay(overlay: NonNullable<DefinitionDeploymentInput["sourceOverlay"]>): void {
  if (!overlay.id.isWellFormed() || Array.from(overlay.id).length < 1 || Array.from(overlay.id).length > 256) {
    throw new TypeError("Source overlay ID must contain 1–256 well-formed Unicode characters.");
  }
  if (!/^[0-9a-f]{64}$/u.test(overlay.sha256)) {
    throw new TypeError("Source overlay SHA-256 must contain exactly 64 lowercase hexadecimal characters.");
  }
  if (overlay.bytes.byteLength === 0 || overlay.bytes.byteLength > 65_536) {
    throw new TypeError("Choose a nonempty source overlay file of at most 65536 bytes.");
  }
}

function deploymentMultipart(
  bytes: Uint8Array,
  overlay: NonNullable<DefinitionDeploymentInput["sourceOverlay"]>,
): FormData {
  const form = new FormData();
  form.append("bpmn", new Blob([Uint8Array.from(bytes).buffer], { type: "application/bpmn+xml" }), "definition.bpmn");
  form.append("sourceOverlay", new Blob([Uint8Array.from(overlay.bytes).buffer], { type: "application/json" }), "source-overlay.json");
  // HTML §4.10.22.8 normalizes scalar line endings; BPD-CAPTURE-01 requires literal IDs.
  form.append("sourceOverlayId", new Blob([overlay.id], { type: "text/plain" }), "source-overlay-id.txt");
  form.append("sourceOverlaySha256", overlay.sha256);
  // BPD-CAPTURE-01 preserves literal bytes; native FormData owns its matching transport boundary.
  return form;
}

async function readJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new DefinitionProtocolError("definition API JSON response has an unexpected media type");
  }
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return parseWireJson(bytes);
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
