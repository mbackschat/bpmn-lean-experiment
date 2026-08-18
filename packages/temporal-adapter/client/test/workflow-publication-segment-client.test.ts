import assert from "node:assert/strict";
import test from "node:test";

import { SemanticProcessCompilerId } from "@bpmn-lean/semantic-core";
import {
  bpmnWorkflowPublicationSegmentDescriptorV1,
  bpmnWorkflowPublicationSegmentDirectoryV1,
  bpmnWorkflowPublicationSegmentQueryName,
  bpmnWorkflowPublicationSegmentSelectionQueryName,
  bpmnWorkflowPublicationSegmentsV1,
} from "@bpmn-lean/temporal-protocol";

import {
  WorkflowPublicationObservationKind,
  observeWorkflowPublicationSegment,
} from "../dist/workflow-publication-segment-client.js";

const processInstanceId = "Instance_1";
const definition = {
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
  semanticProfile: "profile-publication",
  sourceId: "source-publication",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

test("reselects the complete snapshot when the selected current segment changes", async () => {
  const first = selection(1, false);
  const second = selection(2, true);
  let selectionCount = 0;
  let segmentCount = 0;
  const client = {
    getHandle: (_workflowId: string, runId?: string) => ({
      query: async (name: string, request: unknown) => {
        if (name === bpmnWorkflowPublicationSegmentSelectionQueryName) {
          selectionCount += 1;
          return selectionCount === 1 ? first : second;
        }
        assert.equal(name, bpmnWorkflowPublicationSegmentQueryName);
        assert.equal(runId, "run-1");
        segmentCount += 1;
        if (segmentCount === 1) {
          return {
            ...(request as Record<string, unknown>),
            kind: "changed",
            currentDescriptor: descriptor("run-1", 1, 0, 2, "c"),
          };
        }
        return {
          ...(request as Record<string, unknown>),
          kind: "available",
          execution: { kind: "available", page: executionPage() },
          flowNodeOccurrences: {
            kind: "available",
            page: occurrencePage(),
          },
        };
      },
    }),
  } as never;

  const result = await observeWorkflowPublicationSegment(
    client,
    "workflow-id",
    processInstanceId,
    { afterRevision: 0, limit: 1 },
  );

  assert.equal(result.kind, WorkflowPublicationObservationKind.Paired);
  assert.equal(selectionCount, 2);
  assert.equal(segmentCount, 2);
  assert.doesNotMatch(JSON.stringify(result), /run-1|run-2/u);
  assert.deepEqual(result, {
    kind: "paired",
    execution: { kind: "available", page: executionPage() },
    flowNodeOccurrences: { kind: "available", page: occurrencePage() },
  });
});

test("rejects an oversized paired response before exposing public publication", async () => {
  const oversizedCommandId = "x".repeat(100 * 1_024);
  const client = {
    getHandle: (_workflowId: string, runId?: string) => ({
      query: async (name: string, request: unknown) => {
        if (name === bpmnWorkflowPublicationSegmentSelectionQueryName) {
          return selection(2, false);
        }
        assert.equal(name, bpmnWorkflowPublicationSegmentQueryName);
        assert.equal(runId, "run-1");
        return {
          ...(request as Record<string, unknown>),
          kind: "available",
          execution: {
            kind: "available",
            page: executionPage(oversizedCommandId),
          },
          flowNodeOccurrences: {
            kind: "available",
            page: occurrencePage(oversizedCommandId),
          },
        };
      },
    }),
  } as never;

  await assert.rejects(
    observeWorkflowPublicationSegment(
      client,
      "workflow-id",
      processInstanceId,
      { afterRevision: 0, limit: 1 },
    ),
    /queryResponseBytes/u,
  );
});

function selection(headRevision: number, continued: boolean) {
  const closed = descriptor("run-1", 1, 0, headRevision, continued ? "c" : "b");
  const current = continued
    ? descriptor("run-2", 2, headRevision, headRevision, "d")
    : closed;
  return {
    protocol: bpmnWorkflowPublicationSegmentsV1,
    processInstanceId,
    afterRevision: 0,
    limit: 1,
    kind: "available",
    directory: {
      format: bpmnWorkflowPublicationSegmentDirectoryV1,
      segments: continued ? [closed] : [],
    },
    selected: closed,
    currentRun: current,
    snapshot: {
      definition,
      processId: "Process_1",
      processInstanceId,
      headRevision,
      current: {
        revision: headRevision,
        state: stableState(),
        controlTokens: [],
        scopes: [],
      },
      currentOpen: [],
    },
  };
}

function descriptor(
  runId: string,
  runOrdinal: number,
  fromRevision: number,
  throughRevision: number,
  digestCharacter: string,
) {
  return {
    format: bpmnWorkflowPublicationSegmentDescriptorV1,
    runId,
    runOrdinal,
    fromRevision,
    throughRevision,
    sha256: digestCharacter.repeat(64),
  } as const;
}

function executionPage(commandId = "start") {
  return {
    definition,
    processId: "Process_1",
    processInstanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 2,
    batches: [{
      commandId,
      fromRevision: 0,
      throughRevision: 1,
      transitions: [{
        revision: 1,
        logicalTimeMs: 0,
        transition: {
          kind: "externalStimulus",
          stimulus: {
            kind: "startProcess",
            commandId,
            processId: "Process_1",
            instanceId: processInstanceId,
            initialVariables: [],
          },
        },
        positionDelta: {
          consumedTokens: [],
          producedTokens: [],
          enteredScopes: [],
          exitedScopes: [],
        },
      }],
    }],
    current: null,
  } as const;
}

function occurrencePage(commandId = "start") {
  return {
    definition,
    processId: "Process_1",
    processInstanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 2,
    batches: [{
      commandId,
      fromRevision: 0,
      throughRevision: 1,
      committedAtEpochMs: 1_000,
      transitions: [{
        revision: 1,
        lifecycle: { started: [], ended: [] },
      }],
    }],
    currentOpen: null,
  } as const;
}

function stableState() {
  return {
    kind: "state",
    instanceId: processInstanceId,
    status: "running",
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
  } as const;
}
