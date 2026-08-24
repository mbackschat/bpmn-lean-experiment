import {
  DefinitionDeployStatus,
  ProcessInstanceStartStatus,
  decodeDefinitionDeployResult,
  decodeDefinitionSchedule,
  decodeMessageStartPublication,
  decodeProcessInstanceStartResult,
  decodePublicTaskDetail,
  decodeWorkAuditPage,
  decodeWorkClaimResult,
  decodeWorkCompletionResult,
  decodeWorkTaskSnapshot,
  definitionSchedulePath,
  definitionVersionStartPath,
  definitionsCollectionPath,
  messageStartPublicationPath,
  workAuditPath,
  workTaskClaimPath,
  workTaskCompletionPath,
  workTaskPath,
  workTasksPath,
} from "@bpmn-lean/platform-contracts";
import { request as httpRequest } from "node:http";
import type {
  DeployedDefinitionVersion,
  DefinitionSchedule,
  MessageStartPublication,
  PublicMessageStartCapability,
  PublicTaskDetail,
  PublicWorkTaskId,
  StartedProcessInstanceResult,
  WorkAuditPage,
  WorkAuditRequest,
  WorkClaimRequest,
  WorkClaimResult,
  WorkCompletionRequest,
  WorkCompletionResult,
  WorkTaskSnapshot,
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
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: '{"initialVariables":[]}',
    },
  );
  requireStatus(captured, [201]);
  const result = decodeProcessInstanceStartResult(captured.json);
  if (result.status !== ProcessInstanceStartStatus.Started) {
    throw new Error(`definition start was rejected: ${captured.text}`);
  }
  return { status: captured.status, text: captured.text, value: result };
}

export async function putDefinitionSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
  activationAt: string,
): Promise<CapturedJson<DefinitionSchedule>> {
  const captured = await requestJson(new URL(definitionSchedulePath(
    definition.processId,
    definition.version,
    scheduleId,
  ), origin), {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ activationAt }),
  });
  requireStatus(captured, [200, 201]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeDefinitionSchedule(captured.json),
  };
}

export async function getDefinitionSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): Promise<CapturedJson<DefinitionSchedule>> {
  const captured = await get(
    origin,
    definitionSchedulePath(definition.processId, definition.version, scheduleId),
    decodeDefinitionSchedule,
  );
  return captured;
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
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        definition: { processId: definition.processId, version: definition.version },
        messageStart,
      }),
    },
  );
  requireStatus(captured, [200, 201, 202]);
  const value = decodeMessageStartPublication(captured.json);
  return { status: captured.status, text: captured.text, value };
}

export function getMessageStartPublication(
  origin: string,
  publicationId: string,
): Promise<CapturedJson<MessageStartPublication>> {
  return get(origin, messageStartPublicationPath(publicationId), decodeMessageStartPublication);
}

export function listWorkTasks(origin: string): Promise<CapturedJson<WorkTaskSnapshot>> {
  return get(origin, workTasksPath(), decodeWorkTaskSnapshot);
}

export function readTaskDetail(
  origin: string,
  taskId: PublicWorkTaskId,
): Promise<CapturedJson<PublicTaskDetail>> {
  return get(origin, workTaskPath(taskId), decodePublicTaskDetail);
}

export async function claimTask(
  origin: string,
  taskId: PublicWorkTaskId,
  request: WorkClaimRequest,
): Promise<CapturedJson<WorkClaimResult>> {
  const captured = await requestJson(new URL(workTaskClaimPath(taskId), origin), {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  requireStatus(captured, [200, 201]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeWorkClaimResult(captured.json),
  };
}

export async function completeTask(
  origin: string,
  actionId: string,
  request: WorkCompletionRequest,
  signal?: AbortSignal,
): Promise<CapturedJson<WorkCompletionResult>> {
  const captured = await requestJson(
    new URL(workTaskCompletionPath(actionId), origin),
    {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(request),
      ...(signal === undefined ? {} : { signal }),
    },
  );
  requireStatus(captured, [200, 202]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeWorkCompletionResult(captured.json),
  };
}

/** Sends the complete request but destroys the response before reading its JSON body. */
export function discardCompletionResponse(
  origin: string,
  actionId: string,
  request: WorkCompletionRequest,
): Promise<void> {
  const body = JSON.stringify(request);
  const target = new URL(workTaskCompletionPath(actionId), origin);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(target, {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    }, (response) => {
      response.destroy();
      resolve();
    });
    outgoing.once("error", reject);
    outgoing.setTimeout(httpDeadlineMs, () => {
      outgoing.destroy(new Error("discarded completion request timed out"));
    });
    outgoing.end(body);
  });
}

export function readWorkAudit(
  origin: string,
  request: WorkAuditRequest = {},
): Promise<CapturedJson<WorkAuditPage>> {
  return get(origin, workAuditPath(request), decodeWorkAuditPage);
}

async function get<Result>(
  origin: string,
  path: string,
  decoder: (value: unknown) => Result,
): Promise<CapturedJson<Result>> {
  const captured = await requestJson(new URL(path, origin), {
    headers: { accept: "application/json" },
  });
  requireStatus(captured, [200]);
  return { status: captured.status, text: captured.text, value: decoder(captured.json) };
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
