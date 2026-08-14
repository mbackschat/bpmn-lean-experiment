import {
  DefinitionDeployStatus,
  ProcessInstanceStartStatus,
  decodeDefinitionDeployResult,
  decodeIncidentActionResult,
  decodeIncidentAuditPage,
  decodeProcessInstanceStartResult,
  decodePublicIncidentSnapshot,
  definitionVersionStartPath,
  definitionsCollectionPath,
  incidentActionPath,
  incidentAuditPath,
  incidentsPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  IncidentActionRequest,
  IncidentActionResult,
  IncidentAuditPage,
  IncidentAuditRequest,
  PublicIncidentSnapshot,
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

export function listIncidents(
  origin: string,
): Promise<CapturedJson<PublicIncidentSnapshot>> {
  return get(origin, incidentsPath(), decodePublicIncidentSnapshot);
}

export async function submitIncidentAction(
  origin: string,
  actionId: string,
  interaction: IncidentActionRequest,
): Promise<CapturedJson<IncidentActionResult>> {
  const captured = await requestJson(new URL(incidentActionPath(actionId), origin), {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(interaction),
  });
  requireStatus(captured, [200, 202]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeIncidentActionResult(captured.json),
  };
}

export function readIncidentAudit(
  origin: string,
  request: IncidentAuditRequest = {},
): Promise<CapturedJson<IncidentAuditPage>> {
  return get(origin, incidentAuditPath(request), decodeIncidentAuditPage);
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
