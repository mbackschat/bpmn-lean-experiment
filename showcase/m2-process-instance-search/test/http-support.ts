/** Strict public-HTTP support for the M2 Process-instance search witness. */
import {
  DefinitionDeployStatus,
  ProcessInstanceStartStatus,
  decodeDefinitionDeployResult,
  decodeDefinitionSchedule,
  decodeMessageStartPublication,
  decodeProcessInstanceSearchPage,
  decodeProcessInstanceStartResult,
  definitionSchedulePath,
  definitionVersionStartPath,
  definitionsCollectionPath,
  messageStartPublicationPath,
  processInstancesPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DeployedDefinitionVersion,
  MessageStartPublication,
  ProcessInstanceSearchPage,
  ProcessInstanceSearchRequest,
  PublicMessageStartCapability,
  StartedProcessInstanceResult,
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

export async function startDefinition(
  origin: string,
  definition: DeployedDefinitionVersion,
): Promise<CapturedJson<StartedProcessInstanceResult>> {
  const captured = await requestJson(
    new URL(definitionVersionStartPath(definition.processId, definition.version), origin),
    { method: "POST", headers: { accept: "application/json" } },
  );
  requireStatus(captured, [201]);
  const result = decodeProcessInstanceStartResult(captured.json);
  if (result.status !== ProcessInstanceStartStatus.Started) {
    throw new Error(`definition start was rejected: ${captured.text}`);
  }
  return { status: captured.status, text: captured.text, value: result };
}

export function putDefinitionSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
  activationAt: string,
): Promise<CapturedJson<DefinitionSchedule>> {
  return requestSchedule(origin, definition, scheduleId, {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ activationAt }),
  }, [200, 201]);
}

export function getDefinitionSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): Promise<CapturedJson<DefinitionSchedule>> {
  return requestSchedule(
    origin,
    definition,
    scheduleId,
    { headers: { accept: "application/json" } },
    [200],
  );
}

export async function putMessageStartPublication(
  origin: string,
  publicationId: string,
  definition: DeployedDefinitionVersion,
  messageStart: PublicMessageStartCapability,
): Promise<CapturedJson<MessageStartPublication>> {
  const captured = await requestJson(
    new URL(messageStartPublicationPath(publicationId), origin),
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        definition: {
          processId: definition.processId,
          version: definition.version,
        },
        messageStart,
      }),
    },
  );
  requireStatus(captured, [200, 201, 202]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeMessageStartPublication(captured.json),
  };
}

export async function getMessageStartPublication(
  origin: string,
  publicationId: string,
): Promise<CapturedJson<MessageStartPublication>> {
  const captured = await requestJson(
    new URL(messageStartPublicationPath(publicationId), origin),
    { headers: { accept: "application/json" } },
  );
  requireStatus(captured, [200]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeMessageStartPublication(captured.json),
  };
}

export async function searchProcessInstances(
  origin: string,
  request: ProcessInstanceSearchRequest = {},
): Promise<CapturedJson<ProcessInstanceSearchPage>> {
  const captured = await requestJson(
    new URL(processInstancesPath(request), origin),
    { headers: { accept: "application/json" } },
  );
  requireStatus(captured, [200]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeProcessInstanceSearchPage(captured.json),
  };
}

async function requestSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
  init: RequestInit,
  expectedStatuses: readonly number[],
): Promise<CapturedJson<DefinitionSchedule>> {
  const captured = await requestJson(
    new URL(definitionSchedulePath(
      definition.processId,
      definition.version,
      scheduleId,
    ), origin),
    init,
  );
  requireStatus(captured, expectedStatuses);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeDefinitionSchedule(captured.json),
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
