import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind,
  VariableValueKind,
  applyInternalOperationStep,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation } from "@bpmn-lean/semantic-core";
import { frontier, program } from "./internal-commutation-fixture.ts";
import { operationBase, controlPlace } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { propagatedErrorProgram, startFor } from "./flow-node-occurrence-lifecycle-fixture.ts";
import { terminateProgram, terminateCompletion, terminateInstanceId } from "./terminate-end-event-fixture.ts";

const { InternalTransitionStateAtomKind: Atom, deriveInternalTransitionFootprint, internalTransitionStateFootprintsAreIndependent: independent } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");
const { deriveInternalDuplicatePreparation, deriveInternalSynchronizePreparation } = await import(
  new URL("../dist/internal-transition-local-control-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-local-control-preparation.ts");
const { deriveInternalDataArmingPreparation } = await import(
  new URL("../dist/internal-transition-data-arming-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-data-arming-preparation.ts");
const { onlyTokenOwner, commonTokenOwner } = await import(
  new URL("../dist/semantic-process-scope-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-scope-runtime.ts");
const { deriveInternalThrowErrorStateFootprint } = await import(
  new URL("../dist/internal-transition-error-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-error-preparation.ts");
const { deriveInternalTerminateScopeStateFootprint } = await import(
  new URL("../dist/internal-transition-termination-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-termination-preparation.ts");
const { canonicalUniqueStateAtoms } = await import(
  new URL("../dist/internal-transition-footprint-ordering.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint-ordering.ts");
const { tokenOwnerCensusAtoms } = await import(
  new URL("../dist/internal-transition-token-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-token-preparation.ts");

const selectedTask = program.operations.find(({ kind }) => kind === SemanticOperationKind.AwaitUserTask);
assert.ok(selectedTask?.kind === SemanticOperationKind.AwaitUserTask);
const task = selectedTask;
const owner = frontier.scopeOccurrences[0]!.id;
const otherOwner = { ...owner, activation: owner.activation + 1 };
const producerInput = "place:Flow_ProducerInput";
const distinctOutput = "place:Flow_DistinctOutput";

test("census keys are owner-free, canonical, deduplicated, and outside region ownership", () => {
  const census = { kind: Atom.TokenOwners, placeId: task.input } as const;
  assert.deepEqual(tokenOwnerCensusAtoms([task.input, task.input]), [census]);
  assert.equal(canonicalUniqueStateAtoms([census, census]), null);
  assert.deepEqual(canonicalUniqueStateAtoms(tokenOwnerCensusAtoms(["\u{10000}", "\uE000", "\u{10000}"])), [
    { kind: Atom.TokenOwners, placeId: "\uE000" },
    { kind: Atom.TokenOwners, placeId: "\u{10000}" },
  ]);
  const reader = { reads: [census], writes: [] };
  assert.equal(independent(reader, { reads: [], writes: [census] }), false);
  assert.equal(independent(reader, { reads: [], writes: [{ ...census, placeId: distinctOutput }] }), true);
  assert.equal(independent(reader, { reads: [], writes: [{
    kind: Atom.OccurrenceRegion, region: { root: owner, members: [owner, otherOwner] },
  }] }), true);
});

function insertionFixture(reader: SemanticOperation, output: string) {
  const producer = {
    ...operationBase("Producer"), kind: SemanticOperationKind.Duplicate,
    input: producerInput, outputs: [output],
  } as const;
  const selectedProgram = rootScopedProgram({
    ...program,
    controlPlaces: [...program.controlPlaces, controlPlace("Flow_ProducerInput"), controlPlace("Flow_DistinctOutput")],
    operations: [producer, reader],
  });
  const state: RuntimeState = {
    ...frontier,
    scopeOccurrences: [...frontier.scopeOccurrences, { id: otherOwner, parent: null }],
    controlTokens: [
      { owner, placeId: task.input, multiplicity: 1 },
      { owner: otherOwner, placeId: producerInput, multiplicity: 1 },
    ],
    variables: { ...frontier.variables, process: { bindings: [{
      name: "Property_Input", value: { kind: VariableValueKind.String, value: "claim" },
    }] } },
  };
  return { selectedProgram, state, producer };
}

// These helper-boundary fixtures exercise repeated root ownership without claiming source admission.
for (const composed of [false, true]) {
  test(`${composed ? "composed" : "ordinary"} selection conflicts with another owner's insertion at its input`, () => {
    const reader = composed ? {
      ...task, kind: SemanticOperationKind.AwaitDataInputOutputUserTask,
      directInput: {
        associationId: "InputAssociation", sourcePropertyId: "Property_Input",
        targetDataInputId: "DataInput", targetDataInputName: "Input",
      },
      directOutput: {
        associationId: "OutputAssociation", sourceDataOutputId: "DataOutput",
        sourceDataOutputName: "Output", targetPropertyId: "Property_Output",
      },
    } as const : task;
    for (const output of [task.input, distinctOutput]) {
      const { selectedProgram, state, producer } = insertionFixture(reader, output);
      const read = composed
        ? deriveInternalDataArmingPreparation(selectedProgram, state, { operation: reader, owner })?.footprint
        : deriveInternalTransitionFootprint(selectedProgram, state, { operation: reader, owner });
      const write = deriveInternalDuplicatePreparation(selectedProgram, state, producer);
      assert.ok(read && write);
      assert.deepEqual(onlyTokenOwner(state, task.input), owner);
      const after = applyInternalOperationStep(selectedProgram, producer, state)?.successor;
      assert.ok(after);
      assert.deepEqual(after.controlTokens.filter((token) => token.owner.activation === owner.activation),
        state.controlTokens.filter((token) => token.owner.activation === owner.activation));
      assert.deepEqual(onlyTokenOwner(after, task.input), output === task.input ? undefined : owner);
      const rederived = composed
        ? deriveInternalDataArmingPreparation(selectedProgram, after, { operation: reader, owner })
        : deriveInternalTransitionFootprint(selectedProgram, after, { operation: reader, owner });
      assert.equal(rederived === null, output === task.input);
      assert.equal(independent(read, write.footprint), output !== task.input);
    }
  });
}

test("Parallel join protects the second input census and keeps output checks owner-specific", () => {
  const second = "place:Flow_TimerInput";
  const join = {
    ...operationBase("Join"), kind: SemanticOperationKind.Synchronize,
    inputs: [task.input, second], output: task.output,
  } as const;
  for (const output of [second, distinctOutput]) {
    const fixture = insertionFixture(join, output);
    const state = { ...fixture.state, controlTokens: [...fixture.state.controlTokens,
      { owner, placeId: second, multiplicity: 1 }] };
    const read = deriveInternalSynchronizePreparation(fixture.selectedProgram, state, join);
    const write = deriveInternalDuplicatePreparation(fixture.selectedProgram, state, fixture.producer);
    assert.ok(read && write);
    assert.deepEqual(commonTokenOwner(state, join.inputs), owner);
    const after = applyInternalOperationStep(fixture.selectedProgram, fixture.producer, state)?.successor;
    assert.ok(after);
    assert.deepEqual(commonTokenOwner(after, join.inputs), output === second ? undefined : owner);
    assert.equal(deriveInternalSynchronizePreparation(fixture.selectedProgram, after, join) === null, output === second);
    assert.equal(independent(read.footprint, write.footprint), output !== second);
    assert.deepEqual(censusPlaces(read.footprint.reads), [...join.inputs].sort());
  }
});

for (const error of [false, true]) {
  test(`${error ? "Error" : "Terminate"} removes descendant and called-descendant census entries once per place`, () => {
    const selectedProgram = error ? propagatedErrorProgram : terminateProgram;
    const started = applyStimulus(selectedProgram, initialState, startFor(selectedProgram, terminateInstanceId));
    const ready = admittedInternalPrefix(selectedProgram, started.state, terminateCompletion("UserTask_Trigger"),
      [], ["operation:EndEvent_Terminate"]);
    const operation = selectedProgram.operations.find(({ kind }) =>
      kind === (error ? SemanticOperationKind.ThrowError : SemanticOperationKind.TerminateScope));
    assert.ok(operation && "input" in operation);
    const regionOwner = onlyTokenOwner(ready, operation.input);
    assert.ok(regionOwner);
    const descendant = { ...regionOwner, definitionScopeId: "scope:Descendant" };
    const calledRoot = { processInstanceId: "called-instance", definitionScopeId: "scope:Called", activation: 1 };
    const state: RuntimeState = {
      ...ready,
      scopeOccurrences: [...ready.scopeOccurrences, { id: descendant, parent: regionOwner }, { id: calledRoot, parent: null }],
      calledProcessOccurrences: [...ready.calledProcessOccurrences, {
        id: { processInstanceId: regionOwner.processInstanceId, elementId: "Call", activation: 1 },
        caller: descendant, calledRoot, calledProcessId: "Process_Called", returnOperationId: "operation:Return",
      }],
      controlTokens: [...ready.controlTokens,
        { owner: descendant, placeId: task.input, multiplicity: 1 },
        { owner: calledRoot, placeId: task.input, multiplicity: 1 },
      ],
    };
    const candidate = applyInternalOperationStep(selectedProgram, operation, state);
    assert.ok(candidate);
    assert.equal(candidate.successor.controlTokens.some(({ placeId }) => placeId === task.input), false);
    const write = error
      ? deriveInternalThrowErrorStateFootprint(selectedProgram, state, candidate)
      : deriveInternalTerminateScopeStateFootprint(selectedProgram, state, candidate);
    assert.ok(write);
    for (const input of [task.input, distinctOutput]) {
      const reader = { ...task, input };
      const readProgram = rootScopedProgram({ ...program,
        controlPlaces: [...program.controlPlaces, controlPlace("Flow_DistinctOutput")], operations: [reader] });
      const readState = { ...frontier, controlTokens: [{ owner, placeId: input, multiplicity: 1 }] };
      const read = deriveInternalTransitionFootprint(readProgram, readState, { operation: reader, owner });
      assert.ok(read);
      assert.equal(independent(read, write), input !== task.input);
    }
    assert.equal(censusPlaces(write.writes).filter((placeId) => placeId === task.input).length, 1);
    assert.equal(censusPlaces(write.writes).includes(operation.input), true);
  });
}

function censusPlaces(atoms: ReadonlyArray<import("../src/internal-transition-footprint.ts").InternalTransitionStateAtom>) {
  return atoms.flatMap((atom) => atom.kind === Atom.TokenOwners ? [atom.placeId] : []);
}
