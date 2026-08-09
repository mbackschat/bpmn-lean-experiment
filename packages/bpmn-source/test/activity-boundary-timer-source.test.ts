/**
 * Locks exact source admission and lowering for the interrupting Activity boundary Timer profile.
 *
 * The oracle is the [approved capsule](../../../docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md):
 * one bounded User Task owns one interrupting `PT1S` Timer Boundary Event, and both routes lead to
 * a distinct published follow-on User Task, which is what makes the route choice observable.
 *
 * `boundaryTimer.elementId` is the Boundary Event, because that identity is published as the timer
 * occurrence element; the boundary Sequence Flow is an ordinary token-carrying control place, unlike
 * an Event-Based Gateway's configuration flows.
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

const profile = "bpmn-2.0.2-activity-boundary-timer-draft";
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const source = await readFile(
  new URL("../../../scenarios/activity-boundary-timer/process.bpmn", import.meta.url),
  "utf8",
);

function compile(bytes: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "activity-boundary-timer-test",
    expectedSha256: undefined,
    semanticProfile: profile,
    sourceOverlay: null,
    limits,
  });
}

test("lowers the bounded task and its deadline into one Activity-owned wait", async () => {
  const result = await compile(source);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  assert.deepEqual(
    result.semanticProcess.operations.filter(
      ({ kind }) => kind === SemanticOperationKind.AwaitBoundedUserTask,
    ),
    [
      {
        id: "operation:BoundedTask",
        kind: SemanticOperationKind.AwaitBoundedUserTask,
        origin: { kind: "bpmnElement", elementId: "BoundedTask" },
        input: "place:Flow_Start",
        task: {
          elementId: "BoundedTask",
          name: "Bounded work",
          output: "place:Flow_Normal",
        },
        boundaryTimer: {
          elementId: "Deadline",
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

test("keeps both routes distinguishable through distinct follow-on tasks", async () => {
  const result = await compile(source);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  // Each route publishes its own task, so a wrongly routed interruption is observable rather than
  // collapsing onto an indistinguishable terminal state.
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
      ["place:Flow_Boundary", "BoundaryTask"],
      ["place:Flow_Normal", "NormalTask"],
    ],
  );
});

/**
 * The capsule designates a lexical `cancelActivity="false"` as its retained hostile control: the
 * XSD and CMOF default the attribute to `true`, so an omitted attribute is already the interrupting
 * form and only an explicit `false` selects the non-interrupting proposition this profile excludes.
 * Omission and explicit `true` must therefore admit identically, and `false` must be refused.
 */
test("refuses a lexical non-interrupting deadline and admits the defaulted form", async () => {
  const attached = 'attachedToRef="BoundedTask"';
  const nonInterrupting = await compile(
    source.replace(attached, `${attached} cancelActivity="false"`),
  );
  assert.notEqual(nonInterrupting.status, BpmnCompilationStatus.Accepted);

  const explicitlyInterrupting = await compile(
    source.replace(attached, `${attached} cancelActivity="true"`),
  );
  const omitted = await compile(source);
  assert.equal(explicitlyInterrupting.status, BpmnCompilationStatus.Accepted);
  assert.equal(omitted.status, BpmnCompilationStatus.Accepted);
  if (
    explicitlyInterrupting.status !== BpmnCompilationStatus.Accepted ||
    omitted.status !== BpmnCompilationStatus.Accepted
  ) {
    return;
  }
  assert.deepEqual(
    explicitlyInterrupting.semanticProcess.operations,
    omitted.semanticProcess.operations,
  );
});

/**
 * A boundary node whose `attachedToRef` does not resolve to a User Task in its own scope must be
 * refused at admission. Before this was checked, such a source compiled `Accepted` with the deadline
 * dropped entirely: the boundary node lowers to no operation, so nothing downstream noticed that no
 * bounded operation had consumed it, and the deadline vanished silently.
 */
test("refuses a deadline attached to a node that is not a User Task", async () => {
  const misattached = await compile(
    source.replace('attachedToRef="BoundedTask"', 'attachedToRef="NormalEnd"'),
  );
  assert.notEqual(misattached.status, BpmnCompilationStatus.Accepted);
});
