import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyStimulus,
  initialState,
  projectControlPositionDelta,
  projectCurrentControlPositions,
} from "@bpmn-lean/semantic-core";

import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";
import {
  callActivityProgram,
  callActivityStart,
} from "./call-activity-fixture.ts";

test("current positions expose exact Sequence Flow origins and scope occurrences without private place IDs", () => {
  const started = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const afterA = applyStimulus(
    parallelProgram,
    started.state,
    completionStimulus("UserTask_A"),
  );
  const positions = projectCurrentControlPositions(parallelProgram, afterA.state);

  assert.deepEqual(positions, {
    controlTokens: [{
      sequenceFlowId: "Flow_AToJoin",
      owner: {
        processInstanceId: "Instance_1",
        definitionScopeId: "scope:Process_ParallelForkJoin",
        activation: 1,
      },
      multiplicity: 1,
    }],
    scopes: [{
      id: {
        processInstanceId: "Instance_1",
        definitionScopeId: "scope:Process_ParallelForkJoin",
        activation: 1,
      },
      parent: null,
      bpmnElementId: "Process_ParallelForkJoin",
    }],
  });
  assert.equal(JSON.stringify(positions).includes("place:Flow_AToJoin"), false);
});

test("position projection fails closed for a duplicate control-place origin and invalid runtime ownership", () => {
  const started = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const afterA = applyStimulus(
    parallelProgram,
    started.state,
    completionStimulus("UserTask_A"),
  );
  const duplicateOriginProgram = {
    ...parallelProgram,
    controlPlaces: parallelProgram.controlPlaces.map((place, index) =>
      index === 1
        ? { ...place, origin: parallelProgram.controlPlaces[0]!.origin }
        : place
    ),
  };
  const unknownOwnerState = {
    ...afterA.state,
    controlTokens: afterA.state.controlTokens.map((token) => ({
      ...token,
      owner: { ...token.owner, activation: 99 },
    })),
  };

  assert.equal(
    projectCurrentControlPositions(duplicateOriginProgram, afterA.state),
    null,
  );
  assert.equal(
    projectCurrentControlPositions(parallelProgram, unknownOwnerState),
    null,
  );
});

test("scope projection fails closed for an invalid parent instead of guessing containment", () => {
  const started = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const root = started.state.scopeOccurrences[0]!;
  const invalidParentState = {
    ...started.state,
    scopeOccurrences: [{
      ...root,
      parent: { ...root.id, activation: 99 },
    }],
  };

  assert.equal(
    projectCurrentControlPositions(parallelProgram, invalidParentState),
    null,
  );
});

test("a valid two-level called-Process tree remains projectable", () => {
  const called = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
  );

  assert.notEqual(
    projectCurrentControlPositions(callActivityProgram, called.state),
    null,
  );
});

test("running position projection rejects duplicate called-Process records", () => {
  const called = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
  );
  const record = called.state.calledProcessOccurrences[0]!;
  const duplicated = {
    ...called.state,
    calledProcessOccurrences: [record, record],
  };

  assert.equal(
    projectCurrentControlPositions(callActivityProgram, duplicated),
    null,
  );
});

test("running position projection rejects a non-derived called instance identity", () => {
  const called = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
  );
  const record = called.state.calledProcessOccurrences[0]!;
  const nonDerivedRoot = {
    ...record.calledRoot,
    processInstanceId: "call:not-derived",
  };
  const nonDerived = {
    ...called.state,
    scopeOccurrences: called.state.scopeOccurrences.map((occurrence) =>
      occurrence.id.processInstanceId === record.calledRoot.processInstanceId &&
          occurrence.id.definitionScopeId === record.calledRoot.definitionScopeId &&
          occurrence.id.activation === record.calledRoot.activation
        ? { ...occurrence, id: nonDerivedRoot }
        : occurrence
    ),
    calledProcessOccurrences: [{ ...record, calledRoot: nonDerivedRoot }],
  };

  assert.equal(
    projectCurrentControlPositions(callActivityProgram, nonDerived),
    null,
  );
});

test("position deltas preserve multiplicity and are empty for unchanged public positions", () => {
  const started = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const token = {
    placeId: "place:Flow_AToJoin",
    owner: started.state.scopeOccurrences[0]!.id,
    multiplicity: 2,
  };
  const before = { ...started.state, controlTokens: [token] };
  const after = {
    ...started.state,
    controlTokens: [{ ...token, multiplicity: 1 }],
  };

  assert.deepEqual(projectControlPositionDelta(parallelProgram, before, after), {
    consumedTokens: [{
      sequenceFlowId: "Flow_AToJoin",
      owner: token.owner,
      multiplicity: 1,
    }],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  });
  assert.deepEqual(projectControlPositionDelta(parallelProgram, after, after), {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  });
});
