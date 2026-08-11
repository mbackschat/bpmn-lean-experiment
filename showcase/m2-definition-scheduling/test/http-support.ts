/** Strict HTTP-only support for the M2 definition-scheduling witness. */
import {
  DefinitionDeployStatus,
  decodeDefinitionDeployResult,
  decodeDefinitionSchedule,
  decodeDefinitionScheduleConflictErrorResponse,
  decodeDefinitionScheduleListResponse,
  definitionSchedulePath,
  definitionSchedulesPath,
  definitionsCollectionPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DefinitionScheduleConflictErrorResponse,
  DefinitionScheduleListResponse,
  DeployedDefinitionVersion,
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
  if (captured.status !== 201) {
    throw new Error(`definition deployment returned HTTP ${captured.status}: ${captured.text}`);
  }
  const result = decodeDefinitionDeployResult(captured.json);
  if (result.status !== DefinitionDeployStatus.Deployed) {
    throw new Error(`definition deployment was rejected: ${captured.text}`);
  }
  return { status: captured.status, text: captured.text, value: result.definition };
}

export function putDefinitionSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
  activationAt: string,
): Promise<CapturedJson<DefinitionSchedule>> {
  return requestSchedule(
    new URL(definitionSchedulePath(
      definition.processId,
      definition.version,
      scheduleId,
    ), origin),
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ activationAt }),
    },
    [200, 201],
  );
}

export function getDefinitionSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): Promise<CapturedJson<DefinitionSchedule>> {
  return requestSchedule(
    new URL(definitionSchedulePath(
      definition.processId,
      definition.version,
      scheduleId,
    ), origin),
    { headers: { accept: "application/json" } },
    [200],
  );
}

export async function listDefinitionSchedules(
  origin: string,
  definition: DeployedDefinitionVersion,
): Promise<CapturedJson<DefinitionScheduleListResponse>> {
  const captured = await requestJson(
    new URL(definitionSchedulesPath(
      definition.processId,
      definition.version,
    ), origin),
    { headers: { accept: "application/json" } },
  );
  requireStatus(captured, [200]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeDefinitionScheduleListResponse(captured.json),
  };
}

export function deleteDefinitionSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): Promise<CapturedJson<DefinitionSchedule>> {
  return requestSchedule(
    new URL(definitionSchedulePath(
      definition.processId,
      definition.version,
      scheduleId,
    ), origin),
    { method: "DELETE", headers: { accept: "application/json" } },
    [200],
  );
}

export async function deleteDefinitionScheduleExpectingConflict(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): Promise<CapturedJson<DefinitionScheduleConflictErrorResponse>> {
  const captured = await requestJson(
    new URL(definitionSchedulePath(
      definition.processId,
      definition.version,
      scheduleId,
    ), origin),
    { method: "DELETE", headers: { accept: "application/json" } },
  );
  requireStatus(captured, [409]);
  return {
    status: captured.status,
    text: captured.text,
    value: decodeDefinitionScheduleConflictErrorResponse(captured.json),
  };
}

async function requestSchedule(
  url: URL,
  init: RequestInit,
  expectedStatuses: readonly number[],
): Promise<CapturedJson<DefinitionSchedule>> {
  const captured = await requestJson(url, init);
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
