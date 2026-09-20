import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityHandlerKind, applyStimulus, initialState, projectOpenFlowNodeOccurrences, runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";
import * as scope from "./bounded-scope-fixture.ts";
import * as bounded from "./bounded-task-fixture.ts";
import * as monitored from "./monitored-task-fixture.ts";

const families = [
  { name: "bounded scope", program: scope.boundedScopeProgram, instanceId: scope.instanceId, start: scope.start },
  { name: "bounded task", program: bounded.boundedProgram, instanceId: bounded.instanceId, start: bounded.start },
  { name: "monitored task", program: monitored.monitoredProgram, instanceId: monitored.instanceId, start: monitored.start },
] as const;

for (const { name: family, program, instanceId, start } of families) {
  const armed = applyStimulus(program, initialState, start).state;
  const mutations: ReadonlyArray<Readonly<{
    name: string;
    activities: RuntimeState["activityOccurrences"];
  }>> = [
    { name: "missing Activity", activities: [] },
    { name: "missing handler attachment", activities: armed.activityOccurrences.map(
      (record) => ({ ...record, attachedHandlers: [] }),
    ) },
  ];

  for (const { name, activities } of mutations) {
    test(`${family} Timer projection rejects ${name} despite a live ordinal-matched body`, () => {
      assert.equal(armed.timerWaits.length, 1);
      assert.notEqual(projectOpenFlowNodeOccurrences(program, armed), null);
      const malformed: RuntimeState = { ...armed, activityOccurrences: activities };
      assert.deepEqual(runtimeStateDefects(program, instanceId, malformed), []);
      assert.equal(projectOpenFlowNodeOccurrences(program, malformed), null);
    });
  }

  test(`${family} Timer projection follows its attachment when activation counters diverge`, () => {
    assert.equal(armed.timerWaits.length, 1);
    const before = projectOpenFlowNodeOccurrences(program, armed);
    assert.notEqual(before, null);
    const divergent: RuntimeState = {
      ...armed,
      timerWaits: armed.timerWaits.map((wait) => ({ ...wait, id: { ...wait.id, activation: 2 } })),
      timerActivations: armed.timerActivations.map((counter) => ({ ...counter, count: 2 })),
      activityOccurrences: armed.activityOccurrences.map((record) => ({
        ...record,
        attachedHandlers: record.attachedHandlers.map((handler) => {
          switch (handler.kind) {
            case ActivityHandlerKind.Timer:
              return { ...handler, occurrence: { ...handler.occurrence, activation: 2 } };
            case ActivityHandlerKind.Message:
              return handler;
          }
        }),
      })),
    };
    assert.deepEqual(runtimeStateDefects(program, instanceId, divergent), []);
    assert.deepEqual(projectOpenFlowNodeOccurrences(program, divergent), before);
  });
}
