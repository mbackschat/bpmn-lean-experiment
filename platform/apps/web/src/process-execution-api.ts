import {
  decodeCanonicalExecutionPublicationExport,
  decodeExecutionPublicationExport,
  decodeExecutionPublicationPage,
  decodePublicApiErrorResponse,
  executionPublicationExportPath,
  executionPublicationIdentityForPublicProcessInstance,
  executionPublicationPath,
  ExecutionPublicationApiErrorCodes,
  ExecutionPublicationUnavailableMessage,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  ExecutionPublicationExport,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import { LatestRequest } from "./latest-request.ts";

const publicationPageLimit = 100;
const jsonMediaType = "application/json";

export type ExecutionPublicationDownload = Readonly<{
  bytes: Uint8Array;
  filename: string;
}>;

export type ProcessExecutionApi = Readonly<{
  getComplete(instance: PublicProcessInstanceIdentity): Promise<ExecutionPublicationExport>;
  getExport(instance: PublicProcessInstanceIdentity): Promise<ExecutionPublicationDownload>;
  invalidate(): void;
}>;

export class ProcessExecutionApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ProcessExecutionApiError";
    this.status = status;
    this.code = code;
  }
}

export class ProcessExecutionUnavailableError extends Error {
  constructor(message: string = ExecutionPublicationUnavailableMessage) {
    super(message);
    this.name = "ProcessExecutionUnavailableError";
  }
}

export class ProcessExecutionProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProcessExecutionProtocolError";
  }
}

/** HTTP-only client for one complete committed publication and its exact canonical export. */
export class ProcessExecutionApiClient implements ProcessExecutionApi {
  readonly #origin: string;
  readonly #fetch: typeof fetch;
  readonly #requests = new LatestRequest();

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Process execution API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async getComplete(
    requestedInstance: PublicProcessInstanceIdentity,
  ): Promise<ExecutionPublicationExport> {
    const instance = snapshotInstance(requestedInstance);
    const identity = executionPublicationIdentityForPublicProcessInstance(instance);
    const generation = this.#requests.begin();
    const batches: CommittedTransitionBatch[] = [];
    let afterRevision = 0;
    let observedHead = 0;

    while (true) {
      const response = await this.#fetch(this.#url(executionPublicationPath({
        processInstanceId: identity.processInstanceId,
        afterRevision,
        limit: publicationPageLimit,
      })), { headers: { accept: jsonMediaType } });
      this.#requireCurrent(generation);
      if (response.status !== 200) await this.#throwApiError(response);
      const value = await readStrictJson(response);
      this.#requireCurrent(generation);
      let page;
      try {
        page = decodeExecutionPublicationPage(value, {
          ...identity,
          afterRevision,
          limit: publicationPageLimit,
        });
      } catch (cause: unknown) {
        throw new ProcessExecutionProtocolError(
          "execution publication page violates the public contract",
          { cause },
        );
      }
      if (page.headRevision < observedHead) {
        throw new ProcessExecutionProtocolError("execution publication head revision regressed");
      }
      observedHead = page.headRevision;
      batches.push(...page.batches);
      if (page.current !== null) {
        const candidate = {
          format: "bpmn-lean.execution-publication.v1",
          ...identity,
          headRevision: page.headRevision,
          batches,
          current: page.current,
        };
        try {
          return decodeExecutionPublicationExport(candidate, identity);
        } catch (cause: unknown) {
          throw new ProcessExecutionProtocolError(
            "complete execution publication violates the public contract",
            { cause },
          );
        }
      }
      if (page.pageThroughRevision <= afterRevision) {
        throw new ProcessExecutionProtocolError("execution publication page made no progress");
      }
      afterRevision = page.pageThroughRevision;
    }
  }

  async getExport(
    requestedInstance: PublicProcessInstanceIdentity,
  ): Promise<ExecutionPublicationDownload> {
    const instance = snapshotInstance(requestedInstance);
    const identity = executionPublicationIdentityForPublicProcessInstance(instance);
    const generation = this.#requests.begin();
    const response = await this.#fetch(this.#url(
      executionPublicationExportPath(identity.processInstanceId),
    ), { headers: { accept: jsonMediaType } });
    this.#requireCurrent(generation);
    if (response.status !== 200) await this.#throwApiError(response);
    requireJsonMediaType(response, "execution publication export");
    const filename = requireAttachmentFilename(response.headers.get("content-disposition"));
    const bytes = new Uint8Array(await response.arrayBuffer());
    this.#requireCurrent(generation);
    try {
      decodeCanonicalExecutionPublicationExport(bytes, identity);
    } catch (cause: unknown) {
      throw new ProcessExecutionProtocolError(
        "execution publication export is not the exact canonical representation",
        { cause },
      );
    }
    return { bytes: bytes.slice(), filename };
  }

  invalidate(): void {
    this.#requests.invalidate();
  }

  #url(pathname: string): URL {
    return new URL(pathname, this.#origin);
  }

  #requireCurrent(generation: number): void {
    if (!this.#requests.isCurrent(generation)) {
      throw new ProcessExecutionUnavailableError(
        "The committed execution request was superseded.",
      );
    }
  }

  async #throwApiError(response: Response): Promise<never> {
    let decoded;
    try {
      decoded = decodePublicApiErrorResponse(
        await readStrictJson(response),
        ExecutionPublicationApiErrorCodes,
      );
    } catch (cause: unknown) {
      throw new ProcessExecutionProtocolError(
        "execution publication API error violates the public contract",
        { cause },
      );
    }
    if (
      response.status === 503 &&
      decoded.error.code === "executionPublicationUnavailable" &&
      decoded.error.message === ExecutionPublicationUnavailableMessage
    ) {
      throw new ProcessExecutionUnavailableError();
    }
    throw new ProcessExecutionApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
    );
  }
}

/** Starts a browser download without reserializing the already verified canonical bytes. */
export function downloadExecutionPublication(
  download: ExecutionPublicationDownload,
): void {
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

async function readStrictJson(response: Response): Promise<unknown> {
  requireJsonMediaType(response, "execution publication");
  try {
    return parseStrictJson(new Uint8Array(await response.arrayBuffer()));
  } catch (cause: unknown) {
    throw new ProcessExecutionProtocolError(
      "execution publication API returned malformed JSON",
      { cause },
    );
  }
}

function requireJsonMediaType(response: Response, label: string): void {
  const mediaType = response.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== jsonMediaType) {
    throw new ProcessExecutionProtocolError(`${label} has an unexpected media type`);
  }
}

function requireAttachmentFilename(value: string | null): string {
  const match = /^attachment; filename="([A-Za-z0-9._-]+\.json)"$/u.exec(value ?? "");
  if (match?.[1] === undefined || !match[1].startsWith("execution-")) {
    throw new ProcessExecutionProtocolError(
      "execution publication export has an invalid attachment filename",
    );
  }
  return match[1];
}

function snapshotInstance(
  instance: PublicProcessInstanceIdentity,
): PublicProcessInstanceIdentity {
  return structuredClone(instance);
}
