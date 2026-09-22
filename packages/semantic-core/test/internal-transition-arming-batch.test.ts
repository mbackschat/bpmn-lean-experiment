import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, ControlStateKind, CorrelationScalarPathLanguage, LocalDataOwnerKind, MessageChannelKind,
  SemanticOperationKind, SemanticProcessCompilerId, SemanticTransitionKind,
  SemanticProcessKind, SemanticProfileId, StimulusKind, VariableValueKind, compareCanonicalStrings,
  initialState, isWellFormedRuntimeState, isWellFormedSemanticProcessProgram,
  applyInternalOperationStep, applyStimulusWithTrace, projectControlPositionDelta,
  projectFlowNodeOccurrenceLifecycleDelta, projectOpenFlowNodeOccurrences,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitDataInputOutputUserTaskOperation, RuntimeState, SemanticOperation, SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import type { PreparedInternalArming } from "../src/internal-transition-arming-batch.ts";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";
import type { InternalOrdinaryArmingOperation } from "../src/internal-transition-ordinary-arming-patch.ts";

type BatchModule = typeof import("../src/internal-transition-arming-batch.ts");
const { PreparedInternalArmingKind, deriveInternalArmingPreparation: prepare, prepareInternalArmingBatch: batch,
  applyPreparedInternalArming: apply } = await import(
  new URL("../dist/internal-transition-arming-batch.js", import.meta.url).href
) as BatchModule;
type PublicationModule = typeof import("../src/internal-publication-template.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationModule;
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
const { InternalTransitionStateAtomKind: Atom, internalTransitionFootprintsAreIndependent,
  internalTransitionStateFootprintsAreIndependent } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
type ClosureModule = typeof import("../src/semantic-process-closure.ts");
const { closeSupportedInternalOperations } = await import(
  new URL("../dist/semantic-process-closure.js", import.meta.url).href
) as ClosureModule;

const processId = "Process_ClaimAssessment";
const instanceId = "claim-4711";
const owner = rootScopeOccurrence(processId, instanceId);
const sourceName = "Property_ClaimSummary";
function dataTask(suffix: string): AwaitDataInputOutputUserTaskOperation {
  return {
    ...operationBase(`UserTask_${suffix}`), kind: SemanticOperationKind.AwaitDataInputOutputUserTask,
    input: `place:Flow_Ready_${suffix}`, output: `place:Flow_${suffix}_Done`,
    task: { elementId: `UserTask_${suffix}`, name: suffix },
    directInput: { associationId: `InputAssociation_${suffix}`, sourcePropertyId: sourceName,
      targetDataInputId: `Input_${suffix}`, targetDataInputName: "Claim summary" },
    directOutput: { associationId: `OutputAssociation_${suffix}`, sourceDataOutputId: `Output_${suffix}`,
      sourceDataOutputName: "Decision", targetPropertyId: `Property_${suffix}Decision` },
  };
}

type ArmingOperation = Extract<SemanticOperation, { input: string; output: string }>;
const coverage = dataTask("Coverage");
const payment = dataTask("Payment");
const { directOutput: _coverageOutput, ...coverageInput } = coverage;
const inputOnly = { ...coverageInput, kind: SemanticOperationKind.AwaitDataInputUserTask } as const;
const { directInput: _paymentInput, ...paymentOutput } = payment;
const outputOnly = { ...paymentOutput, kind: SemanticOperationKind.AwaitDataOutputUserTask } as const;
function fixture(arms: ReadonlyArray<ArmingOperation> = [coverage, payment]) {
  const names = ["Flow_Start_Fork", "Flow_Join_End",
    ...arms.flatMap(({ input, output }) => [input.slice(6), output.slice(6)])];
  const program: SemanticProcessProgram = rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: { compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: SemanticProfileId.ActivityDataInputOutputUserTask,
      sourceId: "claim-frontier", sourceOverlay: null, sourceSha256: "0".repeat(64) },
    processId,
    controlPlaces: names.map(controlPlace).sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operations: [
      { ...operationBase("Start_Claim"), kind: SemanticOperationKind.Initiate, output: "place:Flow_Start_Fork" },
      { ...operationBase("Fork_Claim"), kind: SemanticOperationKind.Duplicate, input: "place:Flow_Start_Fork",
        outputs: arms.map(({ input }) => input).sort(compareCanonicalStrings) },
      ...arms,
      { ...operationBase("Join_Claim"), kind: SemanticOperationKind.Synchronize,
        inputs: arms.map(({ output }) => output).sort(compareCanonicalStrings), output: "place:Flow_Join_End" },
      { ...operationBase("End_Claim"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Flow_Join_End" },
    ],
  });
  const state: RuntimeState = {
    ...initialState, control: { kind: ControlStateKind.Running, instanceId },
    scopeOccurrences: [{ id: owner, parent: null }],
    scopeActivations: [{ elementId: owner.definitionScopeId, count: 1 }],
    controlTokens: arms.map(({ input: placeId }) => ({ placeId, owner, multiplicity: 1 }))
      .sort((a, b) => compareCanonicalStrings(a.placeId, b.placeId)),
    taskActivations: [{ elementId: coverage.task.elementId, count: 2 }],
    activityActivations: [{ elementId: coverage.task.elementId, count: 7 }],
    logicalTimeMs: 321,
    variables: { ...initialState.variables, process: { bindings: [
      { name: sourceName, value: { kind: VariableValueKind.String, value: "Claim summary" } },
    ] } },
  };
  return { program, state, candidates: arms.map((operation) => ({ operation, owner })) };
}

function ordinaryOperations(): ReadonlyArray<InternalOrdinaryArmingOperation> {
  const input = "place:Flow_Ready_Ordinary";
  const output = "place:Flow_Ordinary_Done";
  const message = { elementId: "MessageCatch_Claim", channel: {
    kind: MessageChannelKind.OperationMessage, interfaceId: "Interface_Claim",
    interfaceOperationId: "Operation_Claim", messageId: "Message_Claim",
  } } as const;
  const messageBase = { ...operationBase(message.elementId), input, output, message };
  return [
    { ...operationBase("UserTask_Ordinary"), kind: SemanticOperationKind.AwaitUserTask,
      input, output, task: { elementId: "UserTask_Ordinary", name: "Ordinary review" } },
    { ...messageBase, kind: SemanticOperationKind.AwaitMessage },
    { ...messageBase, kind: SemanticOperationKind.AwaitPayloadMessage,
      directOutput: { associationId: "MessageOutputAssociation", sourceDataOutputId: "MessageOutput",
        sourceDataOutputName: "Message result", targetPropertyId: "Property_MessageResult" } },
    { ...messageBase, kind: SemanticOperationKind.AwaitCorrelatedPayloadMessage,
      correlationKeyId: "ClaimKey", correlationPropertyId: "ClaimProperty",
      payloadSelector: { language: CorrelationScalarPathLanguage, body: "payload" },
      processPropertySelector: { language: CorrelationScalarPathLanguage,
        body: `property:${sourceName}`, propertyId: sourceName } },
    { ...operationBase("Timer_Claim"), kind: SemanticOperationKind.AwaitTimer,
      input, output, timer: { elementId: "Timer_Claim", durationMs: 1000 } },
    { ...operationBase("UserTask_Coverage"), id: "operation:Effect_Claim",
      kind: SemanticOperationKind.AwaitEffect, input, output, bpmnErrorRoute: null,
      effect: { elementId: "UserTask_Coverage",
        descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "urn:bpmn-lean:effect-operation:probe-v1" },
        inputMappings: [], outputMappings: [] } },
  ];
}

function permutations<Value>(values: ReadonlyArray<Value>): Value[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map((rest) => [value, ...rest]));
}

function assertInvariants(program: SemanticProcessProgram, state: RuntimeState): void {
  assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
}

function checkEveryOrder(program: SemanticProcessProgram, state: RuntimeState,
  candidates: ReturnType<typeof fixture>["candidates"]): RuntimeState {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assertInvariants(program, state);
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null);
  const commandId = "claim-review";
  const firstTransitionIndex = 37;
  const expected = instantiateInternalPublicationBatch(commandId, firstTransitionIndex,
    prepared.map(({ publicationTemplate }) => publicationTemplate));
  assert.ok(expected !== null);
  const orders = permutations(prepared);
  assert.equal(orders.length, prepared.length === 3 ? 6 : 24);
  let final: RuntimeState | undefined;
  for (const ordered of orders) {
    assert.deepEqual(batch(program, state, ordered), ordered);
    assert.deepEqual(instantiateInternalPublicationBatch(commandId, firstTransitionIndex,
      ordered.map(({ publicationTemplate }) => publicationTemplate)), expected);
    let current = state;
    const actual = [];
    for (const [index, member] of ordered.entries()) {
      assertInvariants(program, current);
      for (const remaining of ordered.slice(index)) {
        assert.deepEqual(prepare(program, current, remaining), remaining);
      }
      const successor = apply(program, current, member);
      assert.ok(successor !== null);
      const step = applyInternalOperationStep(program, member.operation, current);
      assert.ok(step !== null);
      assert.deepEqual(step.successor, successor);
      assert.deepEqual(step.owner, member.owner);
      const canonical: InstantiatedInternalPublication | undefined = expected.find(
        ({ alternative }) => alternative.operationId === member.operation.id);
      assert.ok(canonical !== undefined);
      const positionDelta = projectControlPositionDelta(program, current, step.successor);
      assert.ok(positionDelta !== null);
      const record = {
        logicalTimeMs: step.successor.logicalTimeMs,
        transition: { kind: SemanticTransitionKind.InternalOperation, operationId: step.operation.id,
          operationKind: step.operation.kind, origin: step.operation.origin, owner: step.owner },
        positionDelta,
      };
      const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, current, step.successor,
        { kind: "internal", operation: step.operation, owner: step.owner }, commandId, canonical.transitionIndex);
      assert.ok(lifecycle !== null);
      assert.deepEqual(record, canonical.record);
      assert.deepEqual(lifecycle, canonical.lifecycle);
      actual.push({ alternative: member.alternative, transitionIndex: canonical.transitionIndex, record, lifecycle });
      current = successor;
    }
    assertInvariants(program, current);
    assert.deepEqual(actual.sort((a, b) => a.transitionIndex - b.transitionIndex), expected);
    if (final === undefined) final = current;
    else assert.deepEqual(current, final);
  }
  assert.ok(final !== undefined);
  return final;
}

test("standalone input and output arming close together with exact evaluator state and publication", () => {
  const { program: composedProfile, state, candidates } = fixture([inputOnly, outputOnly]);
  const program = { ...composedProfile, identity: {
    ...composedProfile.identity, semanticProfile: SemanticProfileId.ActivityDataInputUserTask,
  } };
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assertInvariants(program, state);
  const started = applyStimulusWithTrace(program, initialState, {
    kind: StimulusKind.StartProcess, commandId: "start-standalone-data", processId, instanceId,
    initialVariables: state.variables.process.bindings,
  }, 4);
  assert.equal(started.result.outcome, CommandOutcome.Committed);
  assertInvariants(program, started.result.state);
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null);
  let expected: RuntimeState = { ...state, taskActivations: [], activityActivations: [], logicalTimeMs: 0 };
  for (const { operation } of candidates) {
    const step = applyInternalOperationStep(program, operation, expected);
    assert.ok(step !== null);
    expected = step.successor;
  }
  assert.deepEqual(started.result.state, expected);
  const actual = started.committedTransitions?.filter(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation &&
    candidates.some(({ operation }) => operation.id === transition.operationId));
  assert.ok(actual !== undefined && actual.length === 2);
  const templates = batch(program, { ...state, taskActivations: [], activityActivations: [], logicalTimeMs: 0 }, candidates);
  assert.ok(templates !== null);
  const publication = instantiateInternalPublicationBatch("start-standalone-data", 3,
    templates.map(({ publicationTemplate }) => publicationTemplate));
  assert.ok(publication !== null);
  assert.deepEqual(actual, publication.map(({ record }) => record));
  assert.deepEqual(started.flowNodeOccurrenceLifecycles?.slice(3), publication.map(({ lifecycle }) => lifecycle));
});

test("input-only, output-only and composed arms preserve complete state and publication in every order", () => {
  const { program, state, candidates } = fixture([inputOnly, outputOnly, dataTask("Fraud")]);
  const final = checkEveryOrder(program, state, candidates);
  assert.deepEqual(final.variables.process, state.variables.process);
  const outputRecord = final.activityOccurrences.find(({ operationId }) => operationId === outputOnly.id);
  assert.ok(outputRecord !== undefined);
  assert.deepEqual(final.variables.activities.find(({ owner: local }) =>
    local.kind === LocalDataOwnerKind.ActivityOccurrence &&
    local.id.activityElementId === outputRecord.id.activityElementId), {
    owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: outputRecord.id }, bindings: [],
  });
});

test("output-only arms create empty scopes with no Process data or variable dependencies", () => {
  const arms = ["Coverage", "Payment", "Fraud"].map((suffix) => {
    const { directInput: _input, ...operation } = dataTask(suffix);
    return { ...operation, kind: SemanticOperationKind.AwaitDataOutputUserTask } as const;
  });
  const { program, state: initial, candidates } = fixture(arms);
  const state = { ...initial, variables: { ...initial.variables, process: { bindings: [] } } };
  const final = checkEveryOrder(program, state, candidates);
  assert.equal(final.variables.activities.length, 3);
  assert.ok(final.variables.activities.every(({ bindings }) => bindings.length === 0));
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null);
  for (const member of prepared) {
    assert.equal(member.footprint.reads.some(({ kind }) => kind === Atom.ProcessVariable), false);
    assert.equal(member.footprint.writes.some(({ kind }) => kind === Atom.ProcessVariable || kind === Atom.ActivityVariable), false);
    assert.equal(member.footprint.writes.some(({ kind }) => kind === Atom.ActivityVariableScope), true);
    const writer = { reads: [], writes: [{ kind: Atom.ProcessVariable, name: sourceName }] } as const;
    assert.equal(internalTransitionStateFootprintsAreIndependent(member.footprint, writer), true);
    const changed: RuntimeState = { ...state, variables: { ...state.variables, process: { bindings: [
      { name: sourceName, value: { kind: VariableValueKind.Null } },
    ] } } };
    assert.deepEqual(prepare(program, changed, member), member);
    assert.deepEqual(apply(program, changed, member), applyInternalOperationStep(program, member.operation, changed)?.successor);
  }
});

test("three input-only arms share one Process read and retain independently issued Activity scopes", () => {
  const arms = ["Coverage", "Payment", "Fraud"].map((suffix) => {
    const { directOutput: _output, ...operation } = dataTask(suffix);
    return { ...operation, kind: SemanticOperationKind.AwaitDataInputUserTask } as const;
  });
  const { program, state, candidates } = fixture(arms);
  const final = checkEveryOrder(program, state, candidates);
  assert.equal(final.variables.activities.length, 3);
  assert.ok(final.variables.activities.every(({ bindings }) => bindings.length === 1));
  assert.deepEqual(final.variables.process, state.variables.process);
});

for (const ordinary of ordinaryOperations()) {
  test(`standalone data arms and ${ordinary.kind} preserve complete preparation and publication in all orders`, () => {
    const { program, state: initial, candidates } = fixture([inputOnly, outputOnly, ordinary]);
    const state = ordinary.kind === SemanticOperationKind.AwaitEffect
      ? { ...initial, effectActivations: [{ elementId: ordinary.effect.elementId, count: 7 }] }
      : initial;
    checkEveryOrder(program, state, candidates);
    const prepared = batch(program, state, candidates);
    assert.ok(prepared !== null);
    const writer = { reads: [], writes: [{ kind: Atom.ProcessVariable, name: sourceName }] } as const;
    for (const member of prepared) {
      const readsInput = member.operation.kind === SemanticOperationKind.AwaitDataInputUserTask ||
        member.operation.kind === SemanticOperationKind.AwaitCorrelatedPayloadMessage;
      assert.deepEqual(member.footprint.reads.filter(({ kind }) => kind === Atom.ProcessVariable),
        readsInput ? [{ kind: Atom.ProcessVariable, name: sourceName }] : []);
      assert.equal(internalTransitionStateFootprintsAreIndependent(member.footprint, writer), !readsInput);
    }
  });
}

for (const ordinary of ordinaryOperations()) {
  test(`three-member composed/${ordinary.kind} frontier preserves complete preparations and accepted E1/E2 in all six orders`, () => {
    const { program, state: initial, candidates } = fixture([coverage, payment, ordinary]);
    const state = ordinary.kind === SemanticOperationKind.AwaitEffect
      ? { ...initial, effectActivations: [{ elementId: ordinary.effect.elementId, count: 7 }] }
      : initial;
    const final = checkEveryOrder(program, state, candidates);
    assert.deepEqual(final.variables.process, state.variables.process);
    const prepared = batch(program, state, candidates);
    assert.ok(prepared !== null);
    if (ordinary.kind === SemanticOperationKind.AwaitCorrelatedPayloadMessage) {
      const writer = { reads: [], writes: [{ kind: Atom.ProcessVariable, name: sourceName }] } as const;
      for (const member of prepared) {
        assert.deepEqual(member.footprint.reads.filter(({ kind }) => kind === Atom.ProcessVariable),
          [{ kind: Atom.ProcessVariable, name: sourceName }]);
        assert.equal(member.footprint.writes.some(({ kind }) => kind === Atom.ProcessVariable), false);
        assert.equal(internalTransitionStateFootprintsAreIndependent(member.footprint, writer), false);
      }
    }
    if (ordinary.kind === SemanticOperationKind.AwaitEffect) {
      assert.deepEqual(final.variables.activities.map(({ owner: local }) => local.kind),
        [LocalDataOwnerKind.EffectOccurrence, LocalDataOwnerKind.ActivityOccurrence, LocalDataOwnerKind.ActivityOccurrence]);
      const activity = final.activityOccurrences.find(({ operationId }) => operationId === coverage.id);
      const effect = final.effectWaits[0];
      assert.ok(activity !== undefined && effect !== undefined);
      assert.equal(activity.id.activation, effect.id.activation);
      const data = prepared[0]!;
      assert.equal(data.kind, PreparedInternalArmingKind.Data);
      assert.notEqual(activity.id.activation, data.patch.wait.id.activation);
    }
  });
}

test("ordinary-only three-member arming remains available", () => {
  const arms = ordinaryOperations().filter(({ kind }) => kind === SemanticOperationKind.AwaitUserTask ||
    kind === SemanticOperationKind.AwaitMessage || kind === SemanticOperationKind.AwaitTimer)
    .map((operation, index) => ({ ...operation, input: `place:Flow_Ready_${index}`, output: `place:Flow_${index}_Done` }));
  const { program, state, candidates } = fixture(arms);
  checkEveryOrder(program, state, candidates);
});

test("four distinct arming families preserve full publication through all twenty-four orders", () => {
  const ordinary = ordinaryOperations();
  const message = ordinary.find(({ kind }) => kind === SemanticOperationKind.AwaitCorrelatedPayloadMessage)!;
  const timer = { ...ordinary.find(({ kind }) => kind === SemanticOperationKind.AwaitTimer)!,
    input: "place:Flow_Ready_Timer", output: "place:Flow_Timer_Done" };
  const effect = { ...ordinary.find(({ kind }) => kind === SemanticOperationKind.AwaitEffect)!,
    input: "place:Flow_Ready_Effect", output: "place:Flow_Effect_Done" };
  const { program, state: initial, candidates } = fixture([coverage, message, timer, effect]);
  const state = { ...initial, effectActivations: [{ elementId: coverage.task.elementId, count: 7 }] };
  checkEveryOrder(program, state, candidates);
});

test("four-member frontier checks the nonadjacent pair beyond an independent first member", () => {
  const effect = ordinaryOperations().find(({ kind }) => kind === SemanticOperationKind.AwaitEffect)!;
  const timer = { ...ordinaryOperations().find(({ kind }) => kind === SemanticOperationKind.AwaitTimer)!,
    input: "place:Flow_Ready_Timer", output: "place:Flow_Timer_Done" };
  const { program, state: initial, candidates } = fixture([payment, coverage, timer, effect]);
  const state = { ...initial, effectActivations: [{ elementId: coverage.task.elementId, count: 7 }] };
  checkEveryOrder(program, state, candidates);
  const collision = { ...state, effectActivations: [{ elementId: coverage.task.elementId, count: 2 }] };
  const individually = candidates.map((candidate) => prepare(program, collision, candidate));
  for (const member of individually) assert.ok(member !== null);
  for (let left = 0; left < individually.length; left += 1) {
    for (let right = left + 1; right < individually.length; right += 1) {
      assert.equal(internalTransitionFootprintsAreIndependent(individually[left]!.footprint, individually[right]!.footprint),
        !(left === 1 && right === 3));
    }
  }
  assert.equal(batch(program, collision, candidates), null);
});

test("batch refusal retains every unavailable frontier member and the minimum cardinality", () => {
  const { program, state, candidates } = fixture();
  assert.equal(batch(program, state, []), null);
  assert.equal(batch(program, state, candidates.slice(0, 1)), null);
  assert.equal(batch(program, state, [...candidates, candidates[0]!]), null);
  const disabled = { ...state, controlTokens: state.controlTokens.slice(1) };
  assert.equal(batch(program, disabled, candidates), null);
  const excluded: ReadonlyArray<SemanticOperation> = [
    ...program.operations.filter(({ kind }) => kind === SemanticOperationKind.Duplicate ||
      kind === SemanticOperationKind.Synchronize || kind === SemanticOperationKind.ReachNoneEnd),
  ];
  for (const operation of excluded) {
    const candidate = { operation, owner };
    assert.equal(prepare(program, state, candidate), null);
    for (const frontier of [[candidate, ...candidates], [...candidates, candidate]]) {
      assert.equal(batch(program, state, frontier), null);
    }
  }
});

for (const ordinary of ordinaryOperations()) {
  test(`snapshot declarations preserve existing ordinary ${ordinary.kind} batches`, () => {
    const companion = { ...operationBase("UserTask_Companion"),
      kind: SemanticOperationKind.AwaitUserTask, input: "place:Flow_Ready_Companion",
      output: "place:Flow_Companion_Done", task: { elementId: "UserTask_Companion", name: "Companion" } } as const;
    const { program, state, candidates } = fixture([ordinary, companion]);
    const snapshots = { ...program, compensationEventSubProcessSnapshots: {
      targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
    } };
    const prepared = batch(snapshots, state, candidates);
    assert.ok(prepared !== null);
    let final: RuntimeState | undefined;
    for (const ordered of permutations(prepared)) {
      let current = state;
      for (const member of ordered) {
        assert.deepEqual(prepare(snapshots, current, member), member);
        const expected = applyInternalOperationStep(snapshots, member.operation, current);
        assert.ok(expected !== null);
        const successor = apply(snapshots, current, member);
        assert.deepEqual(successor, expected.successor);
        assert.ok(successor !== null);
        current = successor;
      }
      if (final === undefined) final = current;
      else assert.deepEqual(current, final);
    }
  });
}

test("snapshot declarations exclude every data preparation, checked apply and mixed batch", () => {
  const ordinary = ordinaryOperations()[0]!;
  const { program, state, candidates } = fixture([inputOnly, outputOnly, dataTask("Fraud"), ordinary]);
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null);
  const snapshots = { ...program, compensationEventSubProcessSnapshots: {
    targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
  } };
  for (const member of prepared) {
    if (member.kind === PreparedInternalArmingKind.Data) {
      assert.equal(prepare(snapshots, state, member), null);
      assert.equal(apply(snapshots, state, member), null);
    } else {
      assert.deepEqual(prepare(snapshots, state, member), member);
      assert.deepEqual(apply(snapshots, state, member), apply(program, state, member));
    }
  }
  assert.equal(batch(snapshots, state, candidates), null);
});

for (const operation of [inputOnly, outputOnly, dataTask("Fraud")]) {
  test(`${operation.kind} refuses malformed selection, token ownership and occurrence collisions`, () => {
    const { program, state } = fixture([operation, dataTask("Companion")]);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assertInvariants(program, state);
    const candidate = { operation, owner };
    const prepared = prepare(program, state, candidate);
    assert.ok(prepared !== null && prepared.kind === PreparedInternalArmingKind.Data);
    const { record, wait } = prepared.patch;
    const token = state.controlTokens.find(({ placeId }) => placeId === operation.input)!;
    const mutations: ReadonlyArray<RuntimeState> = [
      { ...state, scopeOccurrences: [] },
      { ...state, controlTokens: [...state.controlTokens, token] },
      { ...state, controlTokens: state.controlTokens.filter(({ placeId }) => placeId !== operation.input) },
      { ...state, variables: { ...state.variables, activities: [{
        owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: record.id }, bindings: [],
      }] } },
      { ...state, activityOccurrences: [record] },
      { ...state, activityOccurrences: [{ ...record, id: { ...record.id, activation: 99 } }] },
      { ...state, timerWaits: [{ id: wait.id, owner, deadlineMs: 1000, output: operation.output }] },
      { ...state, taskActivations: [{ elementId: operation.task.elementId, count: Number.MAX_SAFE_INTEGER }] },
      { ...state, activityActivations: [{ elementId: operation.task.elementId, count: Number.MAX_SAFE_INTEGER }] },
    ];
    for (const malformed of mutations) {
      assert.equal(prepare(program, malformed, candidate), null);
      assert.equal(apply(program, malformed, prepared), null);
    }
    const duplicate = { ...program, operations: [...program.operations, { ...operation, id: "operation:Duplicate" }] };
    assert.equal(prepare(duplicate, state, candidate), null);
    assert.equal(prepare(program, state, { operation: { ...operation, output: "place:stale" }, owner }), null);
    assert.equal(prepare(program, state, { operation, owner: null }), null);
  });
}

test("checked apply compares operation, owner, patch, footprint and publication template", () => {
  const { program, state } = fixture();
  const prepared = prepare(program, state, { operation: coverage, owner });
  assert.ok(prepared !== null);
  assert.ok(prepared.kind === PreparedInternalArmingKind.Data);
  const mutations: ReadonlyArray<PreparedInternalArming> = [
    { ...prepared, operation: { ...prepared.operation, output: "place:stale" } },
    { ...prepared, owner: { ...owner, activation: 2 } },
    { ...prepared, patch: { ...prepared.patch, input: "place:stale" } },
    { ...prepared, footprint: { ...prepared.footprint, reads: [] } },
    { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
      record: { ...prepared.publicationTemplate.record, logicalTimeMs: 322 } } },
  ];
  for (const mutation of mutations) assert.equal(apply(program, state, mutation), null);
  const after = apply(program, state, prepared);
  assert.ok(after !== null);
  assert.equal(apply(program, after, prepared), null);
  assert.deepEqual(apply(program, state, JSON.parse(JSON.stringify(prepared))), after);
});

test("copied null and escaped String values survive the complete JSON preparation contract", () => {
  const { program, state } = fixture();
  for (const value of [{ kind: VariableValueKind.Null },
    { kind: VariableValueKind.String, value: "" },
    { kind: VariableValueKind.String, value: 'Claim \\"\\n\\u0000😀' }] as const) {
    const current = { ...state, variables: { ...state.variables, process: { bindings: [{ name: sourceName, value }] } } };
    const prepared = prepare(program, current, { operation: coverage, owner });
    assert.ok(prepared !== null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared)), prepared);
    assert.notEqual(apply(program, current, prepared), null);
  }
});
const staleInputCases = [inputOnly, coverage].flatMap((operation) =>
  (["Process input", "logical time", "task ordinal", "Activity ordinal"] as const)
    .map((changed) => ({ operation, changed })));
for (const { operation, changed } of staleInputCases) {
  test(`checked ${operation.kind} apply refuses stale ${changed} with unchanged operation ID and token`, () => {
    const { program, state } = fixture([operation, payment]);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
    const prepared = prepare(program, state, { operation, owner });
    assert.ok(prepared !== null);
    let stale = state;
    switch (changed) {
      case "Process input":
        stale = { ...state, variables: { ...state.variables, process: { bindings: [
          { name: sourceName, value: { kind: VariableValueKind.String, value: "Corrected claim" } },
        ] } } };
        break;
      case "logical time": stale = { ...state, logicalTimeMs: 322 }; break;
      case "task ordinal": stale = { ...state, taskActivations: [{ elementId: coverage.task.elementId, count: 3 }] }; break;
      case "Activity ordinal": stale = { ...state, activityActivations: [{ elementId: coverage.task.elementId, count: 8 }] }; break;
    }
    const rederived = prepare(program, stale, prepared);
    assert.ok(rederived !== null);
    assert.equal(rederived.operation.id, prepared.operation.id);
    assert.deepEqual(stale.controlTokens, state.controlTokens);
    assert.notDeepEqual(rederived, prepared);
    assert.equal(apply(program, stale, prepared), null);
  });
}

test("an oversized standalone batch restores the pre-command state and erases both publications", () => {
  const { program } = fixture([inputOnly, outputOnly, dataTask("Fraud")]);
  const result = applyStimulusWithTrace(program, initialState, {
    kind: StimulusKind.StartProcess, commandId: "bounded-standalone-data", processId, instanceId,
    initialVariables: [{ name: sourceName, value: { kind: VariableValueKind.String, value: "Claim summary" } }],
  }, 4);
  assert.equal(result.result.outcome, CommandOutcome.RolledBack);
  assert.equal(result.result.internalStepBoundExceeded, true);
  assert.equal(result.result.ambiguousInternalChoice, false);
  assert.deepEqual(result.result.state, initialState);
  assert.deepEqual(result.committedTransitions, []);
  assert.deepEqual(result.flowNodeOccurrenceLifecycles, []);
});

test("committed Start closes a complete composed, ordinary task and Timer frontier with paired publication", () => {
  const task = ordinaryOperations()[0]!;
  const timer = { ...ordinaryOperations().find(({ kind }) => kind === SemanticOperationKind.AwaitTimer)!,
    input: "place:Flow_Ready_Timer", output: "place:Flow_Timer_Done" };
  const { program } = fixture([coverage, task, timer]);
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const started = applyStimulusWithTrace(program, initialState, {
    kind: StimulusKind.StartProcess, commandId: "start-claim-batch", processId, instanceId,
    initialVariables: [{ name: sourceName, value: { kind: VariableValueKind.String, value: "Claim summary" } }],
  }, 5);
  assert.equal(started.result.outcome, CommandOutcome.Committed);
  assertInvariants(program, started.result.state);
  assert.equal(started.result.state.userTaskWaits.length, 2);
  assert.equal(started.result.state.timerWaits.length, 1);
  assert.equal(started.result.state.activityOccurrences.length, 1);
  assert.ok(started.committedTransitions !== null && started.flowNodeOccurrenceLifecycles !== null);
  assert.equal(started.committedTransitions.length, started.flowNodeOccurrenceLifecycles.length);
  assert.equal(started.committedTransitions.length, 6);
});

test("an oversized composed batch restores pre-admission state and erases publication", () => {
  const task = ordinaryOperations()[0]!;
  const timer = { ...ordinaryOperations().find(({ kind }) => kind === SemanticOperationKind.AwaitTimer)!,
    input: "place:Flow_Ready_Timer", output: "place:Flow_Timer_Done" };
  const { program } = fixture([coverage, task, timer]);
  const result = applyStimulusWithTrace(program, initialState, {
    kind: StimulusKind.StartProcess, commandId: "bounded-claim-batch", processId, instanceId,
    initialVariables: [{ name: sourceName, value: { kind: VariableValueKind.String, value: "Claim summary" } }],
  }, 4);
  assert.equal(result.result.outcome, CommandOutcome.RolledBack);
  assert.equal(result.result.internalStepBoundExceeded, true);
  assert.equal(result.result.ambiguousInternalChoice, false);
  assert.deepEqual(result.result.state, initialState);
  assert.deepEqual(result.committedTransitions, []);
  assert.deepEqual(result.flowNodeOccurrenceLifecycles, []);
});

test("the closure discards a provisional prefix when the retained executor refuses", () => {
  const { candidates } = fixture();
  const first = { operation: candidates[0]!.operation, successor: 1 };
  const second = { operation: candidates[1]!.operation, successor: 2 };
  const applied: number[] = [];
  const closed = closeSupportedInternalOperations(0, 2,
    (state) => state === 0 ? [first, second] : [second],
    (_state, enabled) => enabled,
    (state, prepared) => {
      applied.push(state);
      return state === 0 ? prepared : null;
    });
  assert.deepEqual(applied, [0, 1]);
  assert.equal(closed.ambiguousInternalChoice, true);
  assert.equal(closed.state, 0);
  assert.deepEqual(closed.steps, []);
  assert.deepEqual(closed.batches, []);
});
