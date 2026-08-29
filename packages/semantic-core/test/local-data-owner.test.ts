import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ControlStateKind,
  LocalDataOwnerKind,
  addActivityVariableScope,
  completeActivityVariableScope,
  compareLocalDataOwners,
  createActivityLocalDataOwner,
  createEffectLocalDataOwner,
  effectWaitCanBecomeIncident,
  initialState,
  localDataOwnerProcessInstanceId,
  matchesActivityLocalDataOwner,
  matchesEffectLocalDataOwner,
  sameLocalDataOwner,
} from "@bpmn-lean/semantic-core";
import type {
  ActivityOccurrenceId,
  EffectOccurrenceId,
  RuntimeState,
} from "@bpmn-lean/semantic-core";

const effectId: EffectOccurrenceId = {
  processInstanceId: "Instance_1",
  elementId: "SharedText",
  activation: 1,
};

const activityId: ActivityOccurrenceId = {
  processInstanceId: "Instance_1",
  activityElementId: "SharedText",
  activation: 1,
};

test("local data owners keep equal-coordinate effect and Activity identities distinct", () => {
  const effectOwner = createEffectLocalDataOwner(effectId);
  const activityOwner = createActivityLocalDataOwner(activityId);

  assert.equal(effectOwner.kind, LocalDataOwnerKind.EffectOccurrence);
  assert.equal(activityOwner.kind, LocalDataOwnerKind.ActivityOccurrence);
  assert.equal(sameLocalDataOwner(effectOwner, activityOwner), false);
  assert.equal(matchesEffectLocalDataOwner(effectOwner, effectId), true);
  assert.equal(matchesEffectLocalDataOwner(activityOwner, effectId), false);
  assert.equal(matchesActivityLocalDataOwner(activityOwner, activityId), true);
  assert.equal(matchesActivityLocalDataOwner(effectOwner, activityId), false);
  assert.equal(localDataOwnerProcessInstanceId(effectOwner), "Instance_1");
  assert.equal(localDataOwnerProcessInstanceId(activityOwner), "Instance_1");
});

test("canonical storage keeps the discriminator before equal identity coordinates", () => {
  const activityOwner = createActivityLocalDataOwner(activityId);
  const withActivity = {
    ...initialState.variables,
    activities: [{ owner: activityOwner, bindings: [] }],
  };

  const withBoth = addActivityVariableScope(withActivity, effectId, []);

  assert.deepEqual(
    withBoth.activities.map(({ owner }) => owner.kind),
    [
      LocalDataOwnerKind.EffectOccurrence,
      LocalDataOwnerKind.ActivityOccurrence,
    ],
  );
});

test("each owner arm orders by its complete identity without locale collation", () => {
  const owners = [
    createActivityLocalDataOwner({
      processInstanceId: "Instance_1",
      activityElementId: "ä-activity",
      activation: 1,
    }),
    createActivityLocalDataOwner({
      processInstanceId: "Instance_1",
      activityElementId: "z-activity",
      activation: 10,
    }),
    createActivityLocalDataOwner({
      processInstanceId: "Instance_1",
      activityElementId: "z-activity",
      activation: 2,
    }),
    createEffectLocalDataOwner({
      processInstanceId: "Instance_2",
      elementId: "z-effect",
      activation: 1,
    }),
  ].sort(compareLocalDataOwners);

  assert.deepEqual(owners, [
    createEffectLocalDataOwner({
      processInstanceId: "Instance_2",
      elementId: "z-effect",
      activation: 1,
    }),
    createActivityLocalDataOwner({
      processInstanceId: "Instance_1",
      activityElementId: "z-activity",
      activation: 2,
    }),
    createActivityLocalDataOwner({
      processInstanceId: "Instance_1",
      activityElementId: "z-activity",
      activation: 10,
    }),
    createActivityLocalDataOwner({
      processInstanceId: "Instance_1",
      activityElementId: "ä-activity",
      activation: 1,
    }),
  ]);
});

test("effect completion removes only the effect arm with equal coordinates", () => {
  const activityOwner = createActivityLocalDataOwner(activityId);
  const withActivity = {
    ...initialState.variables,
    activities: [{ owner: activityOwner, bindings: [] }],
  };
  const withBoth = addActivityVariableScope(withActivity, effectId, []);

  const completed = completeActivityVariableScope(
    withBoth,
    effectId,
    [],
    [],
    false,
  );

  assert.deepEqual(completed, {
    process: { bindings: [] },
    activities: [{ owner: activityOwner, bindings: [] }],
  });
});

test("effect incident association cannot consume an equal-coordinate Activity owner", () => {
  const root = {
    processInstanceId: effectId.processInstanceId,
    definitionScopeId: "Process_1",
    activation: 1,
  };
  const wait = {
    id: effectId,
    owner: root,
    descriptor: {
      protocol: "urn:example:protocol",
      operation: "urn:example:operation",
    },
    arguments: [],
    outputMappings: [],
    bpmnErrorRoute: null,
    output: "place:done",
    incidentAlreadyRetried: false,
  } as const;
  const state: RuntimeState = {
    ...initialState,
    control: {
      kind: ControlStateKind.Running,
      instanceId: effectId.processInstanceId,
    },
    scopeOccurrences: [{ id: root, parent: null }],
    effectWaits: [wait],
    variables: {
      ...initialState.variables,
      activities: [{
        owner: createActivityLocalDataOwner(activityId),
        bindings: [],
      }],
    },
  };

  assert.equal(effectWaitCanBecomeIncident(state, wait), false);
});
