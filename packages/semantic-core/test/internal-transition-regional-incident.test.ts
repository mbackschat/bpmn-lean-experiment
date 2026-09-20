import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, applyInternalOperationStep, compareCanonicalStrings,
  isWellFormedSemanticProcessProgram, projectOpenFlowNodeOccurrences, runtimeStateDefects,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { internalArmingOperation } from "./internal-arming-operation-fixture.ts";
import { regionalKinds, regionalPairFixture } from "./internal-regional-pair-fixture.ts";

const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: apply } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { effectIncidentAssociationsAreValid: incidentsValid, programAllowsEffectIncidents } = await import(
  new URL("../dist/semantic-process-incident-validation.js", import.meta.url).href
) as typeof import("../src/semantic-process-incident-validation.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

for (const kind of regionalKinds) {
  for (const inside of kind === Kind.ThrowError || kind === Kind.TerminateScope ? [false, true] : [false]) {
    test(`${kind} ${inside ? "removes" : "preserves"} an incident together with its exact local data`, () => {
      const fixture = regionalPairFixture(kind, Kind.CompleteScope);
      const branch = fixture.branches[0]!;
      const original = inside ? fixture.program.operations.find(({ id }) =>
        id === `operation:${branch.name}_Sibling_Task`)! : fixture.side;
      assert.ok(original.kind === Kind.AwaitUserTask);
      const operation = internalArmingOperation(Kind.AwaitEffect, original.input, original.output);
      const program: SemanticProcessProgram = { ...fixture.program,
        operations: fixture.program.operations.map((candidate) => candidate === original ? operation : candidate)
          .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
        operationScopes: fixture.program.operationScopes.map((binding) => binding.operationId === original.id
          ? { ...binding, operationId: operation.id } : binding)
          .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
      };
      const oldWait = fixture.state.userTaskWaits.find(({ id }) => id.elementId === original.task.elementId);
      const ready: RuntimeState = oldWait === undefined ? fixture.state : { ...fixture.state,
        userTaskWaits: fixture.state.userTaskWaits.filter((wait) => wait !== oldWait),
        controlTokens: [...fixture.state.controlTokens,
          { placeId: original.input, owner: oldWait.owner, multiplicity: 1 }].sort(compareTokenPlaces),
      };
      const armed = applyInternalOperationStep(program, operation, ready);
      assert.ok(armed !== null);
      const wait = armed.successor.effectWaits[0]!;
      const incident = { id: { effectId: wait.id, generation: 1 as const }, wait };
      const before: RuntimeState = { ...armed.successor, effectWaits: [], effectIncidents: [incident] };
      const valid = (state: RuntimeState) => {
        assert.deepEqual(runtimeStateDefects(program, fixture.start.instanceId, state), []);
        assert.equal(incidentsValid(state), true);
        assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
      };
      assert.equal(isWellFormedSemanticProcessProgram(program), true);
      assert.equal(supportsSemanticProcessExecution(fixture.start, program), false);
      assert.equal(programAllowsEffectIncidents(program), false,
        "the suspended state is constructed; this does not broaden incident-report admission");
      valid(before);
      const localData = before.variables.activities[0]!;
      assert.ok(localData !== undefined);
      const selected = prepare(program, before, branch.selected);
      assert.ok(selected !== null);
      const after = apply(program, before, selected);
      assert.ok(after !== null);
      assert.deepEqual(after, applyInternalOperationStep(program, branch.selected, before)?.successor);
      valid(after);
      assert.deepEqual(after.effectIncidents, inside ? [] : [incident]);
      assert.deepEqual(after.variables.activities, inside ? [] : [localData]);
      assert.deepEqual(after.effectWaits, []);
      for (const field of ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
        "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations"] as const) {
        assert.deepEqual(after[field], before[field]);
      }
      assert.deepEqual(after.variables.process, before.variables.process);
      if (!inside) {
        assert.equal(incidentsValid({ ...after, variables: { ...after.variables, activities: [] } }), false);
        assert.equal(incidentsValid({ ...after, variables: { ...after.variables,
          activities: [localData, localData] } }), false);
        assert.equal(incidentsValid({ ...after, effectWaits: [wait] }), false);
      }
    });
  }
}
