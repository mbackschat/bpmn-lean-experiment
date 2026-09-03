import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  CommandOutcome,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  canonicalCompensationExecutionStateUtf8Bytes,
  canonicalCompensationParentContextRetentionsUtf8Bytes,
  compensationStartDataAdmitted,
  initialState,
  projectCompensationStartCapacity,
  type SemanticProcessProgram,
  type StartProcessStimulus,
  type VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  compensationSemanticProgram,
} from "./compensation-trigger-handler-semantic-fixtures.ts";

const sourceName = "completionContext";

const program = {
  ...compensationSemanticProgram,
  identity: {
    ...compensationSemanticProgram.identity,
    semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  },
  compensationEventSubProcessSnapshots: {
    ...compensationSemanticProgram.compensationEventSubProcessSnapshots,
    limits: { maxRecords: 1, maxCanonicalBytes: 8_192 },
  },
  compensationExecution: {
    ...compensationSemanticProgram.compensationExecution,
    limits: { maxTriggers: 1, maxHandlers: 3, maxCanonicalBytes: 20_480 },
  },
} satisfies SemanticProcessProgram;

test("requires the exact Program-derived restored Process String", () => {
  const valid = start("CompensationStart_1", [stringBinding(sourceName, "frozen itinerary")]);
  assert.equal(compensationStartDataAdmitted(program, valid), true);
  assert.equal(applyStimulus(program, initialState, valid).outcome, CommandOutcome.Committed);

  const malformed: ReadonlyArray<StartProcessStimulus> = [
    { ...valid, initialVariables: [] },
    { ...valid, initialVariables: [stringBinding("archivedContext", "frozen itinerary")] },
    {
      ...valid,
      initialVariables: [
        stringBinding(sourceName, "frozen itinerary"),
        stringBinding("unrelated", "extra"),
      ],
    },
    {
      ...valid,
      initialVariables: [
        stringBinding(sourceName, "first"),
        stringBinding(sourceName, "second"),
      ],
    },
    {
      ...valid,
      initialVariables: [{
        name: sourceName,
        value: { kind: VariableValueKind.Null },
      }],
    },
  ];
  for (const candidate of malformed) {
    assert.equal(compensationStartDataAdmitted(program, candidate), false);
    const result = applyStimulus(program, initialState, candidate);
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.strictEqual(result.state, initialState);
  }
});

test("derives the required name from the Program rather than a checkpoint literal", () => {
  const mutatedName = "Property_Mutated";
  const mutated = {
    ...program,
    compensationExecution: {
      ...program.compensationExecution,
      subjects: program.compensationExecution.subjects.map((subject) =>
        subject.body.input.kind === "restoredProcessBinding"
          ? {
              ...subject,
              body: {
                ...subject.body,
                input: { ...subject.body.input, sourceName: mutatedName },
              },
            }
          : subject
      ),
    },
  } satisfies SemanticProcessProgram;
  assert.equal(
    compensationStartDataAdmitted(
      mutated,
      start("ProgramNameMutation_1", [stringBinding(sourceName, "value")]),
    ),
    false,
  );
  assert.equal(
    compensationStartDataAdmitted(
      mutated,
      start("ProgramNameMutation_2", [stringBinding(mutatedName, "value")]),
    ),
    true,
  );
});

test("admits the largest fitting String and rejects one input byte more", () => {
  const instanceId = "ValueCapacity_1";
  const largest = largestAdmittedLength((length) =>
    start(instanceId, [stringBinding(sourceName, "v".repeat(length))])
  );
  const exact = start(instanceId, [stringBinding(sourceName, "v".repeat(largest))]);
  const over = start(instanceId, [stringBinding(sourceName, "v".repeat(largest + 1))]);
  assert.equal(compensationStartDataAdmitted(program, exact), true);
  assert.equal(compensationStartDataAdmitted(program, over), false);
  assertRejectedWithIdentity(over);
});

test("admits the largest fitting instance identity and rejects one input byte more", () => {
  const largest = largestAdmittedLength((length) =>
    start(`I${"d".repeat(length)}`, [stringBinding(sourceName, "short")])
  );
  const exact = start(
    `I${"d".repeat(largest)}`,
    [stringBinding(sourceName, "short")],
  );
  const over = start(
    `I${"d".repeat(largest + 1)}`,
    [stringBinding(sourceName, "short")],
  );
  assert.equal(compensationStartDataAdmitted(program, exact), true);
  assert.equal(compensationStartDataAdmitted(program, over), false);
  assertRejectedWithIdentity(over);
});

test("uses canonical UTF-8 accounting for escaping and multi-byte String values", () => {
  for (const [instanceId, value] of [
    ["Escaped_\"\\_1", "quote=\" slash=\\ newline=\n"],
    ["Multibyte_雪_1", "旅程-雪-🚆"],
  ] as const) {
    const candidate = start(instanceId, [stringBinding(sourceName, value)]);
    const projection = projectCompensationStartCapacity(program, candidate);
    assert.ok(projection !== null);
    assert.equal(
      projection.snapshotCanonicalBytes,
      canonicalCompensationParentContextRetentionsUtf8Bytes(projection.retentions),
    );
    assert.equal(
      projection.executionCanonicalBytes,
      canonicalCompensationExecutionStateUtf8Bytes(
        [projection.trigger],
        projection.waits,
      ),
    );
    assert.equal(compensationStartDataAdmitted(program, candidate), true);
  }
});

test("binds snapshot and first-frontier capacities independently", () => {
  const candidate = start("IndependentCapacity_1", [
    stringBinding(sourceName, "capacity witness"),
  ]);
  const projection = projectCompensationStartCapacity(program, candidate);
  assert.ok(projection !== null);
  const exact = {
    ...program,
    compensationEventSubProcessSnapshots: {
      ...program.compensationEventSubProcessSnapshots,
      limits: {
        ...program.compensationEventSubProcessSnapshots.limits,
        maxCanonicalBytes: projection.snapshotCanonicalBytes,
      },
    },
    compensationExecution: {
      ...program.compensationExecution,
      limits: {
        ...program.compensationExecution.limits,
        maxCanonicalBytes: projection.executionCanonicalBytes,
      },
    },
  } satisfies SemanticProcessProgram;
  assert.equal(compensationStartDataAdmitted(exact, candidate), true);
  assert.equal(compensationStartDataAdmitted({
    ...exact,
    compensationEventSubProcessSnapshots: {
      ...exact.compensationEventSubProcessSnapshots,
      limits: {
        ...exact.compensationEventSubProcessSnapshots.limits,
        maxCanonicalBytes: projection.snapshotCanonicalBytes - 1,
      },
    },
  }, candidate), false);
  assert.equal(compensationStartDataAdmitted({
    ...exact,
    compensationExecution: {
      ...exact.compensationExecution,
      limits: {
        ...exact.compensationExecution.limits,
        maxCanonicalBytes: projection.executionCanonicalBytes - 1,
      },
    },
  }, candidate), false);
});

test("preserves every non-checkpoint profile", () => {
  const ordinary = {
    ...program,
    identity: compensationSemanticProgram.identity,
  } satisfies SemanticProcessProgram;
  assert.equal(compensationStartDataAdmitted(ordinary, start("Ordinary_1", [])), true);
});

function largestAdmittedLength(
  candidate: (length: number) => StartProcessStimulus,
): number {
  let low = 0;
  let high = 30_000;
  assert.equal(compensationStartDataAdmitted(program, candidate(low)), true);
  assert.equal(compensationStartDataAdmitted(program, candidate(high)), false);
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (compensationStartDataAdmitted(program, candidate(middle))) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
}

function assertRejectedWithIdentity(candidate: StartProcessStimulus): void {
  const result = applyStimulus(program, initialState, candidate);
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.strictEqual(result.state, initialState);
}

function stringBinding(name: string, value: string): VariableBinding {
  return { name, value: { kind: VariableValueKind.String, value } };
}

function start(
  instanceId: string,
  initialVariables: StartProcessStimulus["initialVariables"],
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: `start:${instanceId}`,
    processId: program.processId,
    instanceId,
    initialVariables,
  };
}
