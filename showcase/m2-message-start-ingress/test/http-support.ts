/** Strict HTTP-only support for the M2 Message Start ingress witness. */
import {
  DefinitionDeployStatus,
  decodeDefinitionDeployResult,
  decodeMessageStartPublication,
  decodePublicApiErrorResponse,
  definitionsCollectionPath,
  messageStartPublicationPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  MessageStartPublication,
  PublicApiErrorResponse,
  PublicMessageStartCapability,
} from "@bpmn-lean/platform-contracts";

const httpDeadlineMs = 5_000;

export type CapturedJson<Result> = Readonly<{
  status: number;
  text: string;
  value: Result;
}>;

export async function deployDefinition(
  origin: string,
  input: Readonly<{
    bytes: Uint8Array;
    sourceId: string;
    semanticProfile: string;
  }>,
): Promise<CapturedJson<DeployedDefinitionVersion>> {
  const url = new URL(definitionsCollectionPath(), origin);
  url.searchParams.set("sourceId", input.sourceId);
  url.searchParams.set("semanticProfile", input.semanticProfile);
  const captured = await requestJson(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/bpmn+xml",
    },
    body: input.bytes.slice(),
  });
  requireStatus(captured, [201]);
  const result = decodeDefinitionDeployResult(captured.json);
  if (result.status !== DefinitionDeployStatus.Deployed) {
    throw new Error(`definition deployment was rejected: ${captured.text}`);
  }
  return { status: captured.status, text: captured.text, value: result.definition };
}

export function beginDiscardedPublication(
  origin: string,
  publicationId: string,
  definition: DeployedDefinitionVersion,
  messageStart: PublicMessageStartCapability,
  signal: AbortSignal,
): Promise<void> {
  return fetch(new URL(messageStartPublicationPath(publicationId), origin), {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(publicationRequest(definition, messageStart)),
    signal,
  }).then(async (response) => {
    await response.body?.cancel();
  });
}

export function putMessageStartPublication(
  origin: string,
  publicationId: string,
  definition: DeployedDefinitionVersion,
  messageStart: PublicMessageStartCapability,
): Promise<CapturedJson<MessageStartPublication>> {
  return requestPublication(
    new URL(messageStartPublicationPath(publicationId), origin),
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(publicationRequest(definition, messageStart)),
    },
    [200, 201, 202],
  );
}

export function getMessageStartPublication(
  origin: string,
  publicationId: string,
): Promise<CapturedJson<MessageStartPublication>> {
  return requestPublication(
    new URL(messageStartPublicationPath(publicationId), origin),
    { headers: { accept: "application/json" } },
    [200],
  );
}

export async function getMissingMessageStartPublication(
  origin: string,
  publicationId: string,
): Promise<CapturedJson<PublicApiErrorResponse>> {
  const captured = await requestJson(
    new URL(messageStartPublicationPath(publicationId), origin),
    { headers: { accept: "application/json" } },
  );
  requireStatus(captured, [404]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodePublicApiErrorResponse(captured.json),
  };
}

async function requestPublication(
  url: URL,
  init: RequestInit,
  expectedStatuses: readonly number[],
): Promise<CapturedJson<MessageStartPublication>> {
  const captured = await requestJson(url, init);
  requireStatus(captured, expectedStatuses);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeMessageStartPublication(captured.json),
  };
}

function publicationRequest(
  definition: DeployedDefinitionVersion,
  messageStart: PublicMessageStartCapability,
) {
  return {
    definition: {
      processId: definition.processId,
      version: definition.version,
    },
    messageStart,
  };
}

async function requestJson(
  url: URL,
  init: RequestInit,
): Promise<Readonly<{ status: number; text: string; json: unknown }>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(httpDeadlineMs),
  });
  const mediaType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new TypeError(`HTTP ${response.status} returned ${mediaType ?? "no media type"}`);
  }
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (cause: unknown) {
    throw new TypeError(`HTTP ${response.status} returned malformed JSON`, { cause });
  }
  return { status: response.status, text, json };
}

function requireStatus(
  captured: Readonly<{ status: number; text: string }>,
  expected: readonly number[],
): void {
  if (!expected.includes(captured.status)) {
    throw new Error(
      `expected HTTP ${expected.join(" or ")}, received ${captured.status}: ${captured.text}`,
    );
  }
}
