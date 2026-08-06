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
  BpmnSourceDiagnosticCode,
  compileBpmnToSemanticProcess,
  SemanticOperationKind,
} from "@bpmn-lean/bpmn-source";
import {
  BoundaryInterruption,
  CheckedNodeKind,
  isWellFormedSemanticProcessProgram,
  profileAllowsCheckedProcessShape,
} from "@bpmn-lean/semantic-core";
import type { CheckedNode } from "@bpmn-lean/semantic-core";

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
 * sibling either. Both profiles pin the same checked-node multiset, so the disposition is what
 * separates them, and it is checked in checked source before any operation exists.
 */
test("refuses this source under the interrupting sibling profile", async () => {
  const sibling = await compile(source, "bpmn-2.0.2-activity-boundary-timer-draft");

  assert.notEqual(sibling.status, BpmnCompilationStatus.Accepted);
});

/**
 * The refusals above are stage-blind: `BpmnCompilationStatus` carries no stage discriminator, so
 * `notEqual(status, Accepted)` would also hold if the separation lived only in the operation
 * multiset. This asserts the checked-graph predicate directly, so the TypeScript side has its own
 * witness that the disposition is refused before lowering rather than after it.
 */
test("refuses the opposite disposition at the checked-graph boundary", () => {
  const graph = (interruption: BoundaryInterruption) => [
    { kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
    { kind: CheckedNodeKind.UserTask, id: "MonitoredTask", name: null },
    {
      kind: CheckedNodeKind.TimerBoundaryEvent,
      id: "Reminder",
      attachedToRef: "MonitoredTask",
      interruption,
      durationLiteral: "PT1S",
      outputFlowId: "Flow_Boundary",
    },
    { kind: CheckedNodeKind.UserTask, id: "NormalTask", name: null },
    { kind: CheckedNodeKind.UserTask, id: "HandlerTask", name: null },
    { kind: CheckedNodeKind.NoneEndEvent, id: "NormalEnd" },
    { kind: CheckedNodeKind.NoneEndEvent, id: "HandlerEnd" },
  ] as const satisfies ReadonlyArray<CheckedNode>;

  assert.equal(
    profileAllowsCheckedProcessShape(
      profile,
      graph(BoundaryInterruption.NonInterrupting),
      1,
    ),
    true,
  );
  // The same node kinds with the opposite disposition, which is the only difference.
  assert.equal(
    profileAllowsCheckedProcessShape(
      profile,
      graph(BoundaryInterruption.Interrupting),
      1,
    ),
    false,
  );
});

/**
 * `bpmn-moddle` reduces an `xsd:boolean` attribute to `value === "true"` and reports no warning, so
 * every lexeme except `true` reaches the checked graph as `false` — the non-interrupting
 * disposition. `"1"` is the sharpest case: it is schema-valid and means *true*, so without an exact
 * lexeme check a valid interrupting boundary Event is admitted as non-interrupting. `"0"` and
 * `"false"` agree on the disposition but are still separated, because admitting `"0"` here would
 * mean the guard passed for a reason it cannot state.
 */
// Both XML attribute-value delimiters, because the guard is over a syntactic class and a case per
// value would certify only the spelling it happened to use. The single-quoted `'1'` is the case an
// earlier double-quote-only form admitted.
for (const quote of ['"', "'"]) {
  for (const lexeme of ["1", "0", "maybe", "FALSE", ""]) {
    test(`refuses cancelActivity=${quote}${lexeme}${quote} before parsing`, async () => {
      const ambiguous = await compile(
        source.replace(
          'cancelActivity="false"',
          `cancelActivity=${quote}${lexeme}${quote}`,
        ),
      );

      assert.notEqual(ambiguous.status, BpmnCompilationStatus.Accepted);
      if (ambiguous.status === BpmnCompilationStatus.Accepted) {
        return;
      }
      // Named rather than status-only: the two admitted lexemes are already refused by later
      // stages, so a status-only assertion would pass without this guard existing.
      assert.deepEqual(
        ambiguous.diagnostics.map(({ code }) => code),
        [BpmnSourceDiagnosticCode.AmbiguousBooleanLexeme],
      );
    });
  }
}

/** The single-quoted admitted spelling must still compile, so the guard rejects by lexeme rather than by delimiter. */
test("admits a single-quoted non-interrupting deadline", async () => {
  const singleQuoted = await compile(
    source.replace('cancelActivity="false"', "cancelActivity='false'"),
  );

  assert.equal(singleQuoted.status, BpmnCompilationStatus.Accepted);
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
