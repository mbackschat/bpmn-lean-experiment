import {
  decodeCanonicalOperatorAuditExport,
  decodePublicApiErrorResponse,
  operatorAuditExportFilename,
  operatorAuditExportPath,
  OperatorAuditApiErrorCodes,
  OperatorAuditUnavailableMessage,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";
import type {
  OperatorAuditExport,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import { LatestRequest } from "./latest-request.ts";

const jsonMediaType = "application/json";

export type OperatorAuditDownload = Readonly<{
  bytes: Uint8Array;
  filename: string;
  value: OperatorAuditExport;
}>;

export type OperatorAuditApi = Readonly<{
  get(instance: PublicProcessInstanceIdentity): Promise<OperatorAuditDownload>;
  invalidate(): void;
}>;

export class OperatorAuditApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "OperatorAuditApiError";
    this.status = status;
    this.code = code;
  }
}

export class OperatorAuditUnavailableError extends Error {
  constructor(message: string = OperatorAuditUnavailableMessage) {
    super(message);
    this.name = "OperatorAuditUnavailableError";
  }
}

export class OperatorAuditProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OperatorAuditProtocolError";
  }
}

/** Fetches and preserves one exact canonical audit attachment for a confirmed Process identity. */
export class OperatorAuditApiClient implements OperatorAuditApi {
  readonly #origin: string;
  readonly #fetch: typeof fetch;
  readonly #requests = new LatestRequest();

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Operator audit API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async get(requestedInstance: PublicProcessInstanceIdentity): Promise<OperatorAuditDownload> {
    const instance = structuredClone(requestedInstance);
    const generation = this.#requests.begin();
    const response = await this.#fetch(
      new URL(operatorAuditExportPath(instance.processInstanceId), this.#origin),
      { headers: { accept: jsonMediaType } },
    );
    this.#requireCurrent(generation);
    if (response.status !== 200) await this.#throwApiError(response);
    requireCanonicalJsonMediaType(response);
    const filename = requireAttachmentFilename(
      response.headers.get("content-disposition"),
      operatorAuditExportFilename(instance.processInstanceId),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    this.#requireCurrent(generation);
    try {
      const value = decodeCanonicalOperatorAuditExport(bytes, instance);
      return { bytes: bytes.slice(), filename, value };
    } catch (cause: unknown) {
      throw new OperatorAuditProtocolError(
        "operator audit export is not the exact canonical representation",
        { cause },
      );
    }
  }

  invalidate(): void {
    this.#requests.invalidate();
  }

  #requireCurrent(generation: number): void {
    if (!this.#requests.isCurrent(generation)) {
      throw new OperatorAuditUnavailableError("The operator audit request was superseded.");
    }
  }

  async #throwApiError(response: Response): Promise<never> {
    let decoded;
    try {
      requireJsonMediaType(response);
      decoded = decodePublicApiErrorResponse(
        parseStrictJson(new Uint8Array(await response.arrayBuffer())),
        OperatorAuditApiErrorCodes,
      );
    } catch (cause: unknown) {
      throw new OperatorAuditProtocolError(
        "operator audit API error violates the public contract",
        { cause },
      );
    }
    if (
      response.status === 503 &&
      decoded.error.code === "operatorAuditUnavailable" &&
      decoded.error.message === OperatorAuditUnavailableMessage
    ) {
      throw new OperatorAuditUnavailableError();
    }
    throw new OperatorAuditApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
    );
  }
}

/** Downloads retained verified bytes without a second request or JSON reconstruction. */
export function downloadOperatorAudit(download: OperatorAuditDownload): void {
  const owned = new ArrayBuffer(download.bytes.byteLength);
  new Uint8Array(owned).set(download.bytes);
  const url = URL.createObjectURL(new Blob([owned], { type: jsonMediaType }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function requireJsonMediaType(response: Response): void {
  const mediaType = response.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== jsonMediaType) {
    throw new OperatorAuditProtocolError("operator audit export has an unexpected media type");
  }
}

function requireCanonicalJsonMediaType(response: Response): void {
  if (response.headers.get("content-type")?.trim().toLowerCase() !== `${jsonMediaType}; charset=utf-8`) {
    throw new OperatorAuditProtocolError("operator audit export has an unexpected media type");
  }
}

function requireAttachmentFilename(value: string | null, expected: string): string {
  if (value !== `attachment; filename="${expected}"`) {
    throw new OperatorAuditProtocolError("operator audit export has an invalid attachment filename");
  }
  return expected;
}
