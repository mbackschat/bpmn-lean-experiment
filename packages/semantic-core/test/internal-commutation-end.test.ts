import assert from "node:assert/strict";
import { test } from "node:test";

import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  applyInternalOperationStep,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionCandidate,
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "../src/internal-transition-footprint.ts";

import {
  callActivityCompletion,
  callActivityProgram,
  callActivityStart,
  expectedCalledInstanceId,
} from "./call-activity-fixture.ts";
import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type EndPreparationModule =
  typeof import("../src/internal-transition-end-preparation.ts");

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const preparationModule = await import(
  new URL(
    "../dist/internal-transition-end-preparation.js",
    import.meta.url,
  ).href
) as EndPreparationModule;

const {
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;
const { deriveInternalReachNoneEndStateFootprint } = preparationModule;

const started = applyStimulus(
  parallelProgram,
  initialState,
  startStimulus(),
);
assert.equal(started.outcome, CommandOutcome.Committed);
const afterA = applyStimulus(
  parallelProgram,
  started.state,
  completionStimulus("UserTask_A"),
);
assert.equal(afterA.outcome, CommandOutcome.Committed);
const ready = admittedInternalPrefix(
  parallelProgram,
  afterA.state,
  completionStimulus("UserTask_B"),
  ["operation:Gateway_Join"],
  ["operation:EndEvent_1"],
);
const operation = parallelProgram.operations.find(({ kind }) =>
  kind === SemanticOperationKind.ReachNoneEnd
);
assert.ok(operation?.kind === SemanticOperationKind.ReachNoneEnd);
const candidate = applyInternalOperationStep(
  parallelProgram,
  operation,
  ready,
);
if (candidate === null || candidate.owner === null) {
  throw new Error("expected an ordinary End candidate");
}
const candidateOwner = candidate.owner;

const callStarted = applyStimulus(
  callActivityProgram,
  initialState,
  callActivityStart(),
);
assert.equal(callStarted.outcome, CommandOutcome.Committed);
const calledEndReady = admittedInternalPrefix(
  callActivityProgram,
  callStarted.state,
  callActivityCompletion(
    expectedCalledInstanceId,
    "Task_Called",
    "complete-called-for-end-footprint",
  ),
  [],
  ["operation:End_Called"],
);
if (calledEndReady.control.kind !== ControlStateKind.Running) {
  throw new Error("expected the caller to remain running");
}
const hostInstanceId = calledEndReady.control.instanceId;
const calledEndOperation = callActivityProgram.operations.find(({ id }) =>
  id === "operation:End_Called"
);
assert.ok(calledEndOperation?.kind === SemanticOperationKind.ReachNoneEnd);
const calledEndCandidate = applyInternalOperationStep(
  callActivityProgram,
  calledEndOperation,
  calledEndReady,
);
if (calledEndCandidate === null || calledEndCandidate.owner === null) {
  throw new Error("expected a called-Process End candidate");
}
const calledEndOwner = calledEndCandidate.owner;

test("derives one exact ordinary-End token and a relative End increment", () => {
  const footprint = requireEndFootprint(candidate);
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.ControlToken), {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: candidateOwner,
    placeId: operation.input,
  });
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.EndIncrement), {
    kind: InternalTransitionStateAtomKind.EndIncrement,
  });
  assert.equal(
    footprint.reads.some(({ kind }) =>
      kind === InternalTransitionStateAtomKind.EndCount
    ),
    false,
  );
});

test("distinct ordinary Ends compose while absolute End-count observation conflicts", () => {
  const footprint = requireEndFootprint(candidate);
  const otherEnd: InternalTransitionStateFootprint = {
    reads: [
      {
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner: candidateOwner,
        placeId: "place:Independent_End_Input",
      },
      { kind: InternalTransitionStateAtomKind.EndIncrement },
    ],
    writes: [
      {
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner: candidateOwner,
        placeId: "place:Independent_End_Input",
      },
      { kind: InternalTransitionStateAtomKind.EndIncrement },
    ],
  };
  assert.equal(independent(footprint, otherEnd), true);
  assert.equal(
    independent(footprint, {
      reads: [{ kind: InternalTransitionStateAtomKind.EndCount }],
      writes: [],
    }),
    false,
  );
});

test("a called-Process End retains its semantic owner instead of the host instance", () => {
  const footprint = deriveInternalReachNoneEndStateFootprint(
    callActivityProgram,
    calledEndReady,
    calledEndCandidate,
  );
  if (footprint === null) {
    throw new Error("expected a called-Process End footprint");
  }
  assert.notEqual(
    calledEndOwner.processInstanceId,
    hostInstanceId,
  );
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.ControlToken), {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: calledEndOwner,
    placeId: calledEndOperation.input,
  });
});

test("preparation ignores the supplied successor and rejects an inexact offer", () => {
  const expected = requireEndFootprint(candidate);
  const poisoned = {
    ...candidate,
    successor: {
      ...candidate.successor,
      controlTokens: ready.controlTokens,
      endOccurrences: 999,
    },
  };
  assert.deepEqual(requireEndFootprint(poisoned), expected);

  const offered = ready.controlTokens.find(({ placeId }) =>
    placeId === operation.input
  );
  assert.ok(offered !== undefined);
  assert.equal(
    deriveInternalReachNoneEndStateFootprint(
      parallelProgram,
      {
        ...ready,
        controlTokens: ready.controlTokens.map((token) =>
          token === offered ? { ...token, multiplicity: 2 } : token
        ),
      },
      candidate,
    ),
    null,
  );
});

function requireEndFootprint(
  selected: InternalTransitionCandidate,
): InternalTransitionStateFootprint {
  const footprint = deriveInternalReachNoneEndStateFootprint(
    parallelProgram,
    ready,
    selected,
  );
  if (footprint === null) {
    throw new Error("expected an ordinary End internal state footprint");
  }
  return footprint;
}

function findWrite(
  footprint: InternalTransitionStateFootprint,
  kind: InternalTransitionStateAtom["kind"],
): InternalTransitionStateAtom | undefined {
  return footprint.writes.find((atom) => atom.kind === kind);
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}
