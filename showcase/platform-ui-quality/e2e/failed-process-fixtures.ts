import type { Page, Route } from "@playwright/test";

import { installPublicApiFixtures } from "./fixtures.ts";

export enum FailedProcessFixtureStatus {
  Failed = "failed",
  Running = "running",
  Completed = "completed",
  Cancelled = "cancelled",
}

export const failedProcessLabels = {
  processInstanceId: "process-instance-compensation-返金-🚀-enterprise-travel-cancellation-2026-09-25-000001",
  processId: "Process_Travel_Cancellation",
  elementId: `Compensation_返金_🚀_${"LongOccurrenceIdentity".repeat(12)}`,
  code: '<img src=x onerror="document.body.dataset.injected=1">返金拒否🚀',
  message: '<img src=x onerror="document.body.dataset.injected=1"> Refund declined — 返金🚀\nExact message.',
} as const;

const definition = {
  processId: failedProcessLabels.processId,
  version: 1,
  source: {
    kind: "bpmnSource",
    id: "failed-process-ui-wire-example.bpmn",
    sha256: "a".repeat(64),
    byteLength: 2_048,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2-compensation-trigger-handler-draft",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const instance = { processInstanceId: failedProcessLabels.processInstanceId, definition };
const identity = {
  definition: {
    compiler: "bpmn-source-semantic-process",
    semanticProfile: definition.semanticProfile,
    sourceId: definition.source.id,
    sourceSha256: definition.source.sha256,
    sourceOverlay: null,
  },
  processId: definition.processId,
  processInstanceId: instance.processInstanceId,
};
const rootPosition = {
  id: {
    processInstanceId: instance.processInstanceId,
    definitionScopeId: "Scope_Process",
    activation: 1,
  },
  parent: null,
  bpmnElementId: definition.processId,
};

function occurrence(activation: number) {
  return {
    processInstanceId: instance.processInstanceId,
    elementId: failedProcessLabels.elementId,
    activation,
  };
}

// These closed wire examples exercise presentation, not engine reachability; the proposal's real-host lane owns that evidence.
function publication(message: string | null, status: FailedProcessFixtureStatus) {
  const failure = {
    kind: "compensationHandlerFailure",
    triggerId: occurrence(17),
    handlerId: occurrence(18),
    effectId: occurrence(19),
    code: failedProcessLabels.code,
    message,
  };
  const batches = [{
    commandId: "start-wire-example",
    fromRevision: 0,
    throughRevision: 1,
    transitions: [{
      revision: 1,
      logicalTimeMs: 0,
      transition: {
        kind: "externalStimulus",
        stimulus: {
          kind: "startProcess",
          commandId: "start-wire-example",
          processId: definition.processId,
          instanceId: instance.processInstanceId,
          initialVariables: [],
        },
      },
      positionDelta: {
        consumedTokens: [], producedTokens: [], enteredScopes: [rootPosition], exitedScopes: [],
      },
    }],
  }, {
    commandId: "complete-effect-wire-example",
    fromRevision: 1,
    throughRevision: 2,
    transitions: [{
      revision: 2,
      logicalTimeMs: 0,
      transition: {
        kind: "externalStimulus",
        stimulus: {
          kind: "completeEffect",
          commandId: "complete-effect-wire-example",
          effectId: failure.effectId,
          result: { kind: "bpmnError", code: failure.code, message, localPatch: [] },
        },
      },
      positionDelta: {
        consumedTokens: [], producedTokens: [], enteredScopes: [], exitedScopes: [rootPosition],
      },
    }],
  }];
  return {
    format: "bpmn-lean.execution-publication.v1",
    ...identity,
    headRevision: 2,
    batches,
    current: {
      revision: 2,
      state: {
        kind: "state",
        instanceId: instance.processInstanceId,
        status,
        ...(status === FailedProcessFixtureStatus.Failed ? { failure } : {}),
        activeWaits: [], openUserTasks: [], openMessageSubscriptions: [], openTimers: [],
        openEffects: [], openIncidents: [], variables: [], enabledInteractions: [], logicalTimeMs: 0,
      },
      controlTokens: [],
      scopes: [],
    },
  };
}

export function failedProcessExportBytes(
  message: string | null = failedProcessLabels.message,
  status = FailedProcessFixtureStatus.Failed,
): Uint8Array {
  return new TextEncoder().encode(canonicalJson(publication(message, status)));
}

export async function installFailedProcessFixtures(
  page: Page,
  message: string | null = failedProcessLabels.message,
  status = FailedProcessFixtureStatus.Failed,
): Promise<void> {
  await installPublicApiFixtures(page);
  const value = publication(message, status);
  const { format: _format, ...body } = value;
  const executionPath = `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/execution`;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") return route.fallback();
    switch (path) {
      case "/api/v1/process-instances":
        return json(route, { instances: [instance], nextCursor: null });
      case executionPath:
        return json(route, { ...body, requestedAfterRevision: 0, pageThroughRevision: 2 });
      case `${executionPath}/export`:
        return attachment(route, failedProcessExportBytes(message, status), "execution-failed-process.json");
      case `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/operator-audit/export`:
        return attachment(route, new TextEncoder().encode(canonicalJson({
          format: "bpmn-lean.operator-audit.v1",
          instance,
          work: { headEventId: null, events: [] },
          incidentActions: { headEventId: null, events: [] },
        })), `operator-audit-${instance.processInstanceId.replace(/[^A-Za-z0-9._-]+/gu, "_").slice(0, 80)}.json`);
      case `/api/v1/definitions/${definition.processId}/versions/${definition.version}/presentation`:
        return json(route, {
          error: { code: "internalFailure", message: "The definition request could not be completed." },
        }, 500);
      default:
        return route.fallback();
    }
  });
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function attachment(route: Route, bytes: Uint8Array, filename: string): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
    body: Buffer.from(bytes),
  });
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  switch (typeof value) {
    case "boolean": return value ? "true" : "false";
    case "number": return String(value);
    case "string": return JSON.stringify(value);
    case "object": {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
    }
    default: throw new TypeError("unsupported fixture JSON value");
  }
}
