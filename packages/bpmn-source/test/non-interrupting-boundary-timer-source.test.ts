/**
 * Locks exact source admission and lowering for the non-interrupting boundary Timer profile.
 *
 * The oracle is the [approved capsule](../../../docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-PROPOSAL.md):
 * one monitored User Task owns one non-interrupting `PT1S` Timer Boundary Event, so firing spawns a
 * concurrent handler branch rather than ending the host, and both routes lead to a distinct
 * published follow-on User Task.
 *
 * The admitted `cancelActivity` set is the exact inverse of the interrupting sibling profile's, so
 * neither profile's source is admissible to the other. That inversion is the discriminator these
 * cases exist to hold: without it a source could acquire the wrong interruption semantics by
 * matching a shape both profiles share.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
  SemanticOperationKind,
} from "@bpmn-lean/bpmn-source";
import { isWellFormedSemanticProcessProgram } from "@bpmn-lean/semantic-core";

const profile = "bpmn-2.0.2-non-interrupting-boundary-timer-draft";
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const source = await readFile(
  new URL("../../../scenarios/non-interrupting-boundary-timer/process.bpmn", import.meta.url),
  "utf8",
);

function compile(bytes: string, semanticProfile: string = profile) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "non-interrupting-boundary-timer-test",
    expectedSha256: undefined,
    semanticProfile,
    limits,
  });
}

test("lowers the monitored task and its deadline into one Activity-owned wait", async () => {
  const result = await compile(source);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  assert.deepEqual(
    result.semanticProcess.operations.filter(
      ({ kind }) => kind === SemanticOperationKind.AwaitMonitoredUserTask,
    ),
    [
      {
        id: "operation:MonitoredTask",
        kind: SemanticOperationKind.AwaitMonitoredUserTask,
        origin: { kind: "bpmnElement", elementId: "MonitoredTask" },
        input: "place:Flow_Start",
        task: {
          elementId: "MonitoredTask",
          name: "Monitored work",
          output: "place:Flow_Normal",
        },
        boundaryTimer: {
          elementId: "Reminder",
          durationMs: 1_000,
          output: "place:Flow_Boundary",
          origin: {
            kind: "bpmnSequenceFlow",
            elementId: "Flow_Boundary",
          },
        },
      },
    ],
  );
});

test("keeps both branches distinguishable through distinct follow-on tasks", async () => {
  const result = await compile(source);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  // Each branch publishes its own task, so a spawn that wrongly ended its host is observable rather
  // than collapsing onto an indistinguishable terminal state.
  assert.deepEqual(
    result.semanticProcess.operations
      .filter(({ kind }) => kind === SemanticOperationKind.AwaitUserTask)
      .map((operation) =>
        operation.kind === SemanticOperationKind.AwaitUserTask
          ? [operation.input, operation.task.elementId]
          : []
      )
      .sort(),
    [
      ["place:Flow_Boundary", "HandlerTask"],
      ["place:Flow_Normal", "NormalTask"],
    ],
  );
});

/**
 * The capsule's retained hostile controls. An omitted attribute resolves to the XSD and CMOF default
 * `true`, so both omission and lexical `true` select the interrupting proposition this profile
 * excludes; only lexical `false` is admitted here.
 */
test("admits only a lexical non-interrupting deadline", async () => {
  const attached = 'attachedToRef="MonitoredTask" cancelActivity="false"';
  const omitted = await compile(source.replace(attached, 'attachedToRef="MonitoredTask"'));
  const interrupting = await compile(
    source.replace(attached, 'attachedToRef="MonitoredTask" cancelActivity="true"'),
  );

  assert.notEqual(omitted.status, BpmnCompilationStatus.Accepted);
  assert.notEqual(interrupting.status, BpmnCompilationStatus.Accepted);
});

/**
 * The inversion runs both ways: this profile's source must not be admissible to the interrupting
 * sibling either. Both profiles pin the same checked-node multiset, so the operation multiset is the
 * only place this separation can be observed.
 */
test("refuses this source under the interrupting sibling profile", async () => {
  const sibling = await compile(source, "bpmn-2.0.2-activity-boundary-timer-draft");

  assert.notEqual(sibling.status, BpmnCompilationStatus.Accepted);
});

/**
 * A non-interrupting deadline whose `attachedToRef` does not resolve to a User Task in its own scope
 * must be refused. The boundary node lowers to no operation of its own, so without this the deadline
 * would vanish silently and the program would compile deadline-free.
 */
test("refuses a deadline attached to a node that is not a User Task", async () => {
  const misattached = await compile(
    source.replace('attachedToRef="MonitoredTask"', 'attachedToRef="NormalEnd"'),
  );

  assert.notEqual(misattached.status, BpmnCompilationStatus.Accepted);
});
