import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, SemanticOperationKind, SemanticTransitionKind, VariableValueKind,
  applyInternalOperationStep, applyStimulusWithTrace, compareCanonicalStrings, initialState,
  isWellFormedRuntimeState, isWellFormedSemanticProcessProgram, projectControlPositionDelta,
  projectCurrentControlPositions, projectFlowNodeOccurrenceLifecycleDelta,
  projectOpenFlowNodeOccurrences, runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { PreparedInternalTransition } from "../src/internal-transition-batch.ts";
import type { InternalScopeCreationOperation } from "../src/internal-transition-scope-creation-preparation.ts";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";
import { program as scopeProgram, startStimulus } from "./embedded-subprocess-fixture.ts";
import { callActivityProgram, callActivityStart } from "./call-activity-fixture.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { reviewProgram } from "./sequential-multi-instance-fixture.ts";
import { internalArmingKinds as armKinds, internalArmingOperation } from "./internal-arming-operation-fixture.ts";
import type { InternalArmingKind as ArmKind } from "./internal-arming-operation-fixture.ts";

const { deriveInternalTransitionPreparation: prepare, prepareInternalTransitionBatch: batch,
  applyPreparedInternalTransition: apply } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");
const { internalTransitionStateFootprintsAreIndependent: independent, InternalTransitionStateAtomKind: Atom } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");

type ScopeKind = SemanticOperationKind.EnterScope | SemanticOperationKind.InvokeProcess;
const scopeKinds: ScopeKind[] = [SemanticOperationKind.EnterScope, SemanticOperationKind.InvokeProcess];
const root: SemanticProcessProgram["definitionScopes"][number] = scopeProgram.definitionScopes[0]!;
const place = (name: string) => `place:${name}`;
const task = (name: string, input: string, output: string) => ({
  ...operationBase(name), kind: SemanticOperationKind.AwaitUserTask, input, output,
  task: { elementId: name, name },
} as const);

function fixture(kinds: readonly ScopeKind[], armKind: ArmKind = SemanticOperationKind.AwaitUserTask) {
  const operations: SemanticOperation[] = [];
  const definitionScopes = [root];
  const operationScopes: SemanticProcessProgram["operationScopes"][number][] = [];
  const controlPlaceScopes: SemanticProcessProgram["controlPlaceScopes"][number][] = [];
  const addOperation = (operation: SemanticOperation, scopeId = root.id) => {
    operations.push(operation);
    operationScopes.push({ operationId: operation.id, scopeId });
  };
  const addPlaces = (names: readonly string[], scopeId = root.id) => {
    controlPlaceScopes.push(...names.map((name) => ({ controlPlaceId: place(name), scopeId })));
  };
  const scopeOperations = kinds.map((kind, index) => {
    const name = `Scope_${index}:é😀`;
    const scopeId = `scope:${name}`;
    const calledProcessId = `Process_${name}`;
    definitionScopes.push({ id: scopeId, parentScopeId: kind === SemanticOperationKind.EnterScope ? root.id : null,
      originElementId: kind === SemanticOperationKind.EnterScope ? name : calledProcessId });
    addPlaces([`${name}_Input`, `${name}_Output`]);
    addPlaces([`${name}_Entry`, `${name}_End`], scopeId);
    addOperation(task(`${name}_Task`, place(`${name}_Entry`), place(`${name}_End`)), scopeId);
    addOperation({ ...operationBase(`${name}_End`), kind: SemanticOperationKind.ReachNoneEnd,
      input: place(`${name}_End`) }, scopeId);
    const operation: InternalScopeCreationOperation = kind === SemanticOperationKind.EnterScope
      ? { ...operationBase(name), kind, input: place(`${name}_Input`), childEntry: place(`${name}_Entry`), childScopeId: scopeId }
      : { ...operationBase(name), kind, input: place(`${name}_Input`), calledEntry: place(`${name}_Entry`),
        calledProcessId, calledRootScopeId: scopeId, returnOperationId: `operation:Return_${name}` };
    addOperation(operation);
    addOperation(kind === SemanticOperationKind.EnterScope
      ? { ...operationBase(`Complete_${name}`), origin: operation.origin, kind: SemanticOperationKind.CompleteScope,
        scopeId, parentOutput: place(`${name}_Output`) }
      : { ...operationBase(`Return_${name}`), origin: operation.origin, kind: SemanticOperationKind.ReturnProcess,
        calledProcessId, calledRootScopeId: scopeId, callerOutput: place(`${name}_Output`) }, scopeId);
    return operation;
  });
  addPlaces(["Start", "End", "Local_Input", "Local_Left", "Local_Right", "Local_Left_Done", "Local_Right_Done",
    "Arm_Input", "Arm_Output"]);
  const local = { ...operationBase("Local_Fork"), kind: SemanticOperationKind.Duplicate,
    input: place("Local_Input"), outputs: [place("Local_Left"), place("Local_Right")] } as const;
  const arm = internalArmingOperation(armKind, place("Arm_Input"), place("Arm_Output"));
  addOperation({ ...operationBase("Start"), kind: SemanticOperationKind.Initiate, output: place("Start") });
  addOperation({ ...operationBase("Outer_Fork"), kind: SemanticOperationKind.Duplicate, input: place("Start"),
    outputs: [...scopeOperations.map(({ input }) => input),
      local.input, place("Arm_Input")].sort(compareCanonicalStrings) });
  addOperation(local);
  addOperation(arm);
  addOperation(task("Local_Left_Task", place("Local_Left"), place("Local_Left_Done")));
  addOperation(task("Local_Right_Task", place("Local_Right"), place("Local_Right_Done")));
  addOperation({ ...operationBase("Outer_Join"), kind: SemanticOperationKind.Synchronize,
    inputs: [...kinds.map((_, index) => place(`Scope_${index}:é😀_Output`)), place("Local_Left_Done"),
      place("Local_Right_Done"), place("Arm_Output")].sort(compareCanonicalStrings), output: place("End") });
  addOperation({ ...operationBase("End"), kind: SemanticOperationKind.ReachNoneEnd, input: place("End") });
  addOperation({ ...operationBase("Complete_Root"), origin: operationBase(scopeProgram.processId).origin,
    kind: SemanticOperationKind.CompleteScope, scopeId: root.id, parentOutput: null });
  const program: SemanticProcessProgram = {
    ...scopeProgram,
    definitionScopes: definitionScopes.sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    operations: operations.sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    operationScopes: operationScopes.sort((left, right) => compareCanonicalStrings(left.operationId, right.operationId)),
    controlPlaces: controlPlaceScopes.map(({ controlPlaceId }) => controlPlace(controlPlaceId.slice(6)))
      .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    controlPlaceScopes: controlPlaceScopes.sort((left, right) => compareCanonicalStrings(left.controlPlaceId, right.controlPlaceId)),
  };
  const start = { ...startStimulus(), initialVariables: [
    { name: "details", value: { kind: VariableValueKind.String, value: "Review details" } },
  ] } as const;
  const selected = [...scopeOperations, local, arm];
  const prefix = admittedInternalPrefix(scopeProgram, initialState, startStimulus(), ["operation:StartEvent_Outer"],
    ["operation:SubProcess_Work"]);
  const owner = prefix.scopeOccurrences[0]!.id;
  const state: RuntimeState = { ...prefix, logicalTimeMs: 491, endOccurrences: 18,
    controlTokens: selected.map((operation) => ({ placeId: operation.input,
      owner, multiplicity: 1 })).sort(compareTokenPlaces),
    variables: { ...prefix.variables, process: { bindings: start.initialVariables } },
    scopeActivations: [...prefix.scopeActivations, { elementId: "unrelated:scope", count: 91 }],
    callActivations: [{ elementId: "unrelated:call", count: 77 }],
  };
  return { program, state, start, candidates: selected.map((operation) => ({ operation, owner })) };
}

function assertValid(program: SemanticProcessProgram, state: RuntimeState) {
  assert.equal(isWellFormedSemanticProcessProgram(program), true, "constructed Program is structurally valid");
  assert.equal(state.control.kind, "running");
  assert.deepEqual(runtimeStateDefects(program, startStimulus().instanceId, state), []);
  assert.equal(isWellFormedRuntimeState(program, startStimulus().instanceId, state), true);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
}

function permutations<Value>(values: readonly Value[]): Value[][] {
  return values.length === 0 ? [[]] : values.flatMap((value, index) =>
    permutations(values.filter((_, other) => other !== index)).map((rest) => [value, ...rest]));
}

function assertAllOrders({ program, state, start, candidates }: ReturnType<typeof fixture>) {
  assertValid(program, state);
  assert.equal(supportsSemanticProcessExecution(start, program), false,
    "constructed mixed frontier establishes no admitted profile or source reachability");
  assert.deepEqual(program.operations.flatMap((operation) => applyInternalOperationStep(program, operation, state) === null ? [] : [operation.id]),
    candidates.map(({ operation }) => operation.id).sort(compareCanonicalStrings));
  const prepared: readonly PreparedInternalTransition[] | null = batch(program, state, candidates);
  assert.ok(prepared !== null, "valid independent scope frontier must prepare");
  const expected = instantiateInternalPublicationBatch("scope-batch", 43, prepared.map(({ publicationTemplate }) => publicationTemplate));
  assert.ok(expected !== null);
  let final: RuntimeState | undefined;
  for (const ordered of permutations(prepared)) {
    assert.deepEqual(batch(program, state, ordered), ordered);
    assert.deepEqual(instantiateInternalPublicationBatch("scope-batch", 43,
      ordered.map(({ publicationTemplate }) => publicationTemplate)), expected);
    let current: RuntimeState = state;
    const actual = [];
    for (const [index, member] of ordered.entries()) {
      for (const remaining of ordered.slice(index)) assert.deepEqual(prepare(program, current, remaining), remaining);
      const successor = apply(program, current, member);
      assert.ok(successor !== null);
      const step = applyInternalOperationStep(program, member.operation, current);
      assert.ok(step !== null && step.owner !== null);
      assert.deepEqual(successor, step.successor);
      const publication: InstantiatedInternalPublication = expected.find(({ alternative }) => alternative.operationId === member.operation.id)!;
      const positionDelta = projectControlPositionDelta(program, current, successor);
      const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, current, successor,
        { kind: "internal", operation: member.operation, owner: step.owner }, "scope-batch", publication.transitionIndex);
      assert.ok(positionDelta !== null && lifecycle !== null);
      actual.push({ alternative: member.alternative, transitionIndex: publication.transitionIndex,
        record: { logicalTimeMs: current.logicalTimeMs, transition: { kind: SemanticTransitionKind.InternalOperation,
          operationId: member.operation.id, operationKind: member.operation.kind, origin: member.operation.origin, owner: step.owner }, positionDelta }, lifecycle });
      assertValid(program, successor);
      for (const key of ["sequentialMultiInstanceControllers", "parallelMultiInstanceControllers", "compensationActivityRetentions",
        "compensationParentContextRetentions", "compensationTriggers", "compensationHandlerEffectWaits"] as const) {
        assert.equal(Object.hasOwn(successor, key), Object.hasOwn(state, key));
        assert.deepEqual(successor[key], state[key]);
      }
      current = successor;
    }
    assert.deepEqual(actual.sort((left, right) => compareCanonicalStrings(left.alternative.operationId, right.alternative.operationId)), expected);
    if (final === undefined) final = current;
    else assert.deepEqual(current, final);
    assert.equal(current.callActivations.find(({ elementId }) => elementId === "unrelated:call")?.count, 77);
    assert.equal(current.scopeActivations.find(({ elementId }) => elementId === "unrelated:scope")?.count, 91);
    assert.equal(current.endOccurrences, 18);
    prepared.forEach((member: PreparedInternalTransition) => {
      if (member.family !== "scopeCreation") return;
      assert.deepEqual(current.scopeOccurrences.find(({ id }) =>
        id.processInstanceId === member.patch.scope.id.processInstanceId &&
        id.definitionScopeId === member.patch.scope.id.definitionScopeId &&
        id.activation === member.patch.scope.id.activation), member.patch.scope);
      if (member.patch.kind === "calledProcess") {
        const expectedCall = member.patch.record;
        assert.deepEqual(current.calledProcessOccurrences.find(({ id }) =>
          id.processInstanceId === expectedCall.id.processInstanceId && id.elementId === expectedCall.id.elementId &&
          id.activation === expectedCall.id.activation), expectedCall);
      }
    });
  }
}

for (const kind of scopeKinds) for (const arm of armKinds) {
  test(`${kind}, local control and ${arm} preserve complete preparations and accepted publications in all six orders`, () => {
    assertAllOrders(fixture([kind], arm));
  });
}
for (const left of scopeKinds) for (const right of scopeKinds) {
  test(`${left}/${right}, local control and composed data arming preserve all 24 orders`, () => {
    assertAllOrders(fixture([left, right], SemanticOperationKind.AwaitDataInputOutputUserTask));
  });
}

test("scope creation preserves a declared present-empty sequential controller collection in every mixed order", () => {
  const mixed = fixture(scopeKinds, SemanticOperationKind.AwaitDataInputOutputUserTask);
  const sequential = reviewProgram.operations.find(({ kind }) => kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask);
  assert.ok(sequential?.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask);
  const operation = { ...sequential, ...operationBase("Local_Left_Task"),
    input: place("Local_Left"), task: { elementId: "Local_Left_Task", name: "Review item" },
    normalOutput: place("Local_Left_Done"), boundaryTimer: { ...sequential.boundaryTimer,
      output: place("Local_Deadline"), origin: controlPlace("Local_Deadline").origin } };
  const end = { ...operationBase("Local_Deadline_End"), kind: SemanticOperationKind.ReachNoneEnd,
    input: place("Local_Deadline") } as const;
  const program = { ...mixed.program,
    operations: [...mixed.program.operations.map((candidate) => candidate.id === operation.id ? operation : candidate), end]
      .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    operationScopes: [...mixed.program.operationScopes, { operationId: end.id, scopeId: root.id }]
      .sort((left, right) => compareCanonicalStrings(left.operationId, right.operationId)),
    controlPlaces: [...mixed.program.controlPlaces, controlPlace("Local_Deadline")]
      .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    controlPlaceScopes: [...mixed.program.controlPlaceScopes, { controlPlaceId: place("Local_Deadline"), scopeId: root.id }]
      .sort((left, right) => compareCanonicalStrings(left.controlPlaceId, right.controlPlaceId)),
  };
  assertAllOrders({ ...mixed, program, state: { ...mixed.state, sequentialMultiInstanceControllers: [] } });
});

for (const kind of scopeKinds) {
  test(`${kind} generic preparation checks complete payloads, stale issuance and exact owner`, () => {
    const { program, state, candidates } = fixture([kind]);
    assertValid(program, state);
    const prepared = prepare(program, state, candidates[0]!);
    assert.ok(prepared !== null && prepared.family === "scopeCreation");
    assert.equal(prepare(program, state, { ...candidates[0]!, owner: null }), null);
    for (const owner of [
      { ...prepared.owner, activation: prepared.owner.activation + 1 },
      { ...prepared.owner, processInstanceId: "another-instance" },
      { ...prepared.owner, definitionScopeId: "another-definition" },
    ]) assert.equal(prepare(program, state, { ...candidates[0]!, owner }), null);
    const forged: PreparedInternalTransition[] = [
      { ...prepared, footprint: { ...prepared.footprint, reads: [] } },
      { ...prepared, owner: { ...prepared.owner, activation: 99 } },
      { ...prepared, patch: { ...prepared.patch, counter: { ...prepared.patch.counter, count: 99 } } },
      { ...prepared, patch: { ...prepared.patch, scope: { ...prepared.patch.scope, parent: prepared.patch.scope.id } } },
      { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
        record: { ...prepared.publicationTemplate.record, logicalTimeMs: 0 } } },
      { ...prepared, publicationTemplate: { ...prepared.publicationTemplate, lifecycle: { started: [], ended: [] } } },
    ];
    if (prepared.patch.kind === "calledProcess") forged.push({ ...prepared,
      patch: { ...prepared.patch, record: { ...prepared.patch.record, returnOperationId: "forged-return" } } });
    for (const member of forged) assert.equal(apply(program, state, member), null);
    const stale = { ...state, logicalTimeMs: state.logicalTimeMs + 1 };
    assertValid(program, stale);
    assert.notEqual(prepare(program, stale, candidates[0]!), null);
    assert.equal(apply(program, stale, prepared), null);
    const counterKey = kind === SemanticOperationKind.EnterScope ? "scopeActivations" : "callActivations";
    const changed = { ...state, [counterKey]: [...state[counterKey], { elementId: prepared.patch.counter.elementId, count: 8 }]
      .sort((left, right) => compareCanonicalStrings(left.elementId, right.elementId)) };
    assertValid(program, changed);
    assert.notEqual(prepare(program, changed, candidates[0]!), null);
    assert.equal(apply(program, changed, prepared), null);
    const snapshot = { ...program, compensationEventSubProcessSnapshots: {
      targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
    } };
    assert.equal(prepare(snapshot, state, candidates[0]!), null);
    assert.equal(apply(snapshot, state, prepared), null);
    for (const ordered of permutations(candidates)) assert.equal(batch(snapshot, state, ordered), null);
  });

  test(`${kind} refuses a foreign-owner token census despite an unchanged selected bucket`, () => {
    const { program, state, candidates } = fixture([kind]);
    const candidate = candidates[0]!;
    const prepared = prepare(program, state, candidate);
    assert.ok(prepared !== null && prepared.family === "scopeCreation");
    const foreign = { ...prepared.owner, activation: 99 };
    const collision = { ...state, controlTokens: [...state.controlTokens,
      { placeId: prepared.operation.input, owner: foreign, multiplicity: 1 }].sort(compareTokenPlaces) };
    assert.deepEqual(collision.controlTokens.find(({ placeId, owner }) =>
      placeId === prepared.operation.input && owner === prepared.owner),
    state.controlTokens.find(({ placeId }) => placeId === prepared.operation.input));
    assert.equal(projectCurrentControlPositions(program, collision), null,
      "foreign-owner corruption is a helper-bound witness, not a projectable-state claim");
    assert.equal(prepare(program, collision, candidate), null);
    assert.equal(apply(program, collision, prepared), null);
    for (const ordered of permutations(candidates)) assert.equal(batch(program, collision, ordered), null);
    const foreignBucket = { kind: Atom.ControlToken, owner: foreign, placeId: prepared.operation.input } as const;
    assert.equal(independent(prepared.footprint, { reads: [], writes: [foreignBucket] }), true);
    assert.equal(independent(prepared.footprint, { reads: [], writes: [foreignBucket,
      { kind: Atom.TokenOwners, placeId: prepared.operation.input }] }), false);
  });
}

test("duplicate alternatives and any enabled unsupported member refuse every frontier order", () => {
  const { program, state, candidates } = fixture(scopeKinds);
  assertValid(program, state);
  assert.equal(batch(program, state, []), null);
  assert.equal(batch(program, state, candidates.slice(0, 1)), null);
  for (const ordered of permutations(candidates)) assert.equal(batch(program, state, [...ordered, ordered[0]!]), null);
  const original = candidates.at(-1)!;
  assert.ok(original.operation.kind === SemanticOperationKind.AwaitUserTask);
  const operation = { ...operationBase(original.operation.origin.elementId), kind: SemanticOperationKind.MergeExclusive,
    inputs: [original.operation.input], output: original.operation.output } as const;
  const changed = { ...program, operations: program.operations.map((value) => value.id === operation.id ? operation : value) };
  assertValid(changed, state);
  assert.notEqual(applyInternalOperationStep(changed, operation, state), null);
  const supported = candidates.slice(0, -1);
  assert.notEqual(batch(changed, state, supported), null);
  for (const ordered of permutations([...supported, { ...original, operation }])) assert.equal(batch(changed, state, ordered), null);
});

const canonicalCallProgram: SemanticProcessProgram = {
  ...callActivityProgram,
  definitionScopes: [...callActivityProgram.definitionScopes].sort((left, right) => compareCanonicalStrings(left.id, right.id)),
  controlPlaces: [...callActivityProgram.controlPlaces].sort((left, right) => compareCanonicalStrings(left.id, right.id)),
  controlPlaceScopes: [...callActivityProgram.controlPlaceScopes]
    .sort((left, right) => compareCanonicalStrings(left.controlPlaceId, right.controlPlaceId)),
};

for (const [program, start, prefix, enabled] of [
  [scopeProgram, startStimulus(), "operation:StartEvent_Outer", "operation:SubProcess_Work"],
  [canonicalCallProgram, callActivityStart(), "operation:Start_Caller", "operation:Call:é"],
] as const) {
  test(`${program.identity.semanticProfile} preserves admitted singleton execution and full trace`, () => {
    assert.equal(supportsSemanticProcessExecution(start, program), true);
    const state = admittedInternalPrefix(program, initialState, start, [prefix], [enabled]);
    const operation = program.operations.find(({ id }) => id === enabled)!;
    const member = prepare(program, state, { operation, owner: state.scopeOccurrences[0]!.id });
    assert.ok(member !== null);
    assert.deepEqual(apply(program, state, member), applyInternalOperationStep(program, operation, state)?.successor);
    const traced = applyStimulusWithTrace(program, initialState, start);
    assert.equal(traced.result.outcome, CommandOutcome.Committed);
    assert.equal(traced.result.ambiguousInternalChoice, false);
    assert.equal(traced.result.internalStepBoundExceeded, false);
    assert.equal(isWellFormedRuntimeState(program, start.instanceId, traced.result.state), true);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, traced.result.state), null);
    assert.ok(traced.committedTransitions.some(({ transition }) =>
      transition.kind === SemanticTransitionKind.InternalOperation && transition.operationId === enabled));
  });
}

for (const kind of scopeKinds) {
  test(`${kind} commits the complete mixed closure and rolls back when the mixed batch exceeds remaining fuel`, () => {
    const { program, start } = fixture([kind, kind]);
    const emptyStart = { ...start, initialVariables: [] };
    assert.equal(supportsSemanticProcessExecution(emptyStart, program), false,
      "private evaluator fixture is outside profile admission");
    const accepted = applyStimulusWithTrace(program, initialState, emptyStart, 10);
    assert.equal(accepted.result.outcome, CommandOutcome.Committed);
    assert.equal(accepted.result.ambiguousInternalChoice, false);
    assert.equal(accepted.result.internalStepBoundExceeded, false);
    assertValid(program, accepted.result.state);
    assert.equal(accepted.result.state.userTaskWaits.length, 5);
    assert.equal(accepted.committedTransitions.length, 11);
    assert.equal(accepted.flowNodeOccurrenceLifecycles.length, 11);
    const refused = applyStimulusWithTrace(program, initialState, emptyStart, 5);
    assert.equal(refused.result.outcome, CommandOutcome.RolledBack);
    assert.equal(refused.result.internalStepBoundExceeded, true);
    assert.equal(refused.result.ambiguousInternalChoice, false);
    assert.deepEqual(refused.result.state, initialState);
    assert.deepEqual(refused.committedTransitions, []);
    assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
  });
}
