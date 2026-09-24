import assert from "node:assert/strict";
import test from "node:test";

import {
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import { QueryNotRegisteredError } from "@temporalio/client";
import { ExecutionPublicationResultKind, bpmnWorkflowPublicationSegmentSelectionQueryName } from "@bpmn-lean/temporal-testkit";
import { program, twoBatchPublicationPage } from "../../protocol/test/semantic-publication-fixture.ts";

import type { TestWorkflowEnvironment } from "@temporalio/testing";

import { waitForPublishedWorkflowChainState, waitForWorkflowChainRunCount } from "./workflow-chain-test-support.ts";

const semanticProcess = {
  ...program,
  kind: SemanticProcessKind.SemanticProcess,
  identity: { ...program.identity, compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  controlPlaces: program.controlPlaces.map((place) => ({
    ...place,
    origin: { ...place.origin, kind: SemanticOriginKind.BpmnSequenceFlow },
  })),
  operations: program.operations.map((operation) => ({
    ...operation,
    kind: SemanticOperationKind.Initiate,
    origin: { ...operation.origin, kind: SemanticOriginKind.BpmnElement },
  })),
} satisfies SemanticProcessProgram;

test("waits for workflow-chain observations by elapsed deadline instead of attempt count", async () => {
  let attempts = 0;
  let nowMs = 0;
  const workflowId = "workflow-chain-deadline-witness";
  const environment = {
    client: {
      workflow: {
        list: async function* () {
          attempts += 1;
          if (attempts > 100) {
            yield {
              workflowId,
              runId: "run-1",
              startTime: new Date(0),
            };
          }
        },
      },
    },
  } as unknown as TestWorkflowEnvironment;

  await waitForWorkflowChainRunCount(
    environment,
    workflowId,
    1,
    {
      now: () => nowMs,
      delay: async (durationMs) => {
        nowMs += durationMs;
      },
    },
  );

  assert.equal(attempts, 101);
  assert.equal(nowMs, 2_500);
});

test("stops workflow-chain polling at its shared elapsed deadline", async () => {
  let attempts = 0;
  let nowMs = 0;
  const environment = {
    client: {
      workflow: {
        list: async function* () {
          attempts += 1;
        },
      },
    },
  } as unknown as TestWorkflowEnvironment;

  await assert.rejects(
    waitForWorkflowChainRunCount(
      environment,
      "workflow-chain-deadline-witness",
      1,
      {
        now: () => nowMs,
        delay: async (durationMs) => {
          nowMs += durationMs;
        },
      },
    ),
    /Workflow chain did not reach 1 Runs; latest was 0/u,
  );
  assert.equal(attempts, 800);
  assert.equal(nowMs, 20_000);
});

for (const pageCount of [17, 33]) {
  test(`reaches the current publication across ${pageCount} retained pages without restarting its prefix`, async () => {
    const fixture = twoBatchPublicationPage();
    const headRevision = pageCount + 1;
    const requested: number[] = [];
    let nowMs = 0;
    const environment = {
      client: { workflow: {
        connection: {
          withDeadline: <Value>(_deadline: number, invoke: () => Promise<Value>) => invoke(),
        },
        getHandle: () => ({
          query: async (name: string, request: { afterRevision: number }) => {
            if (name === bpmnWorkflowPublicationSegmentSelectionQueryName) {
              throw new QueryNotRegisteredError("legacy publication fixture", 3);
            }
            const after = request.afterRevision;
            requested.push(after);
            const through = after === 0 ? 2 : after + 1;
            const commandId = `retry-${through}`;
            const template = fixture.batches[1];
            const transition = template.transitions[0];
            const batch = after === 0 ? fixture.batches[0] : {
              ...template, commandId, fromRevision: after, throughRevision: through,
              transitions: [{ ...transition, revision: through, transition: {
                ...transition.transition,
                stimulus: { ...transition.transition.stimulus, commandId },
              } }],
            };
            return {
              kind: ExecutionPublicationResultKind.Available,
              page: {
                ...fixture, requestedAfterRevision: after, pageThroughRevision: through,
                headRevision, batches: [batch],
                current: through === headRevision ? { ...fixture.current, revision: headRevision } : null,
              },
            };
          },
        }),
      } },
    } as unknown as TestWorkflowEnvironment;
    const state = await waitForPublishedWorkflowChainState(
      environment, "publication-pagination", semanticProcess, fixture.processInstanceId,
      () => true,
      { now: () => nowMs, delay: async (durationMs) => { nowMs += durationMs; } },
    );
    assert.deepEqual(state, fixture.current.state);
    assert.deepEqual(requested, [0, ...Array.from({ length: pageCount - 1 }, (_, index) => index + 2)]);
    assert.ok(nowMs < 20_000);
  });
}
