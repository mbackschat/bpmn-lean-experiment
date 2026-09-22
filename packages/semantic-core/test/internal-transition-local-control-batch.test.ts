import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, CorrelationScalarPathLanguage, MessageChannelKind, SemanticOperationKind,
  SemanticProfileId, SemanticTransitionKind, StimulusKind, VariableValueKind,
  applyInternalOperationStep, applyStimulus, applyStimulusWithTrace,
  compareCanonicalStrings, initialState, isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram, projectControlPositionDelta, projectCurrentControlPositions,
  projectFlowNodeOccurrenceLifecycleDelta, projectOpenFlowNodeOccurrences, runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { PreparedInternalTransition } from "../src/internal-transition-batch.ts";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";
import { completionStimulus, parallelProgram, startStimulus } from "./parallel-fork-join-fixture.ts";
import { inclusiveCompletion, inclusiveProgram, inclusiveStart, present } from "./inclusive-gateway-fixture.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const processId = "Process_ConcurrentReview";
const instanceId = "review-4711";
const place = (name: string) => `place:Flow_${name}`;
const task = (name: string) => ({
  ...operationBase(`Task_${name}`), kind: SemanticOperationKind.AwaitUserTask,
  input: place(name), output: place(`${name}_Done`),
  task: { elementId: `Task_${name}`, name },
} as const);
const names = ["Start", "Checks", "Legal", "Deadline", "Content", "Risk",
  "Legal_Done", "Deadline_Done", "Content_Done", "Risk_Done", "End"];
const program = rootScopedProgram({
  ...parallelProgram, processId,
  identity: { ...parallelProgram.identity, semanticProfile: SemanticProfileId.TimerUserTaskComposition,
    sourceId: "concurrent-review-il-witness" },
  controlPlaces: names.map((name) => controlPlace(`Flow_${name}`))
    .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
  operations: [
    { ...operationBase("Start"), kind: SemanticOperationKind.Initiate, output: place("Start") },
    { ...operationBase("Fork"), kind: SemanticOperationKind.Duplicate,
      input: place("Start"), outputs: [place("Checks"), place("Deadline"), place("Legal")] },
    { ...operationBase("Fork_Checks"), kind: SemanticOperationKind.Duplicate,
      input: place("Checks"), outputs: [place("Content"), place("Risk")] },
    task("Legal"), task("Content"), task("Risk"),
    { ...operationBase("Timer_Deadline"), kind: SemanticOperationKind.AwaitTimer,
      input: place("Deadline"), output: place("Deadline_Done"),
      timer: { elementId: "Timer_Deadline", durationMs: 1000 } },
    { ...operationBase("Join"), kind: SemanticOperationKind.Synchronize,
      inputs: [place("Content_Done"), place("Deadline_Done"), place("Legal_Done"), place("Risk_Done")],
      output: place("End") },
    { ...operationBase("End"), kind: SemanticOperationKind.ReachNoneEnd, input: place("End") },
  ],
});
const start = {
  kind: StimulusKind.StartProcess, commandId: "start-concurrent-review", processId, instanceId,
  initialVariables: [],
} as const;

test("a local fork batches with a sibling User Task and Timer in committed closure", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const started = applyStimulusWithTrace(program, initialState, start, 7);
  assert.equal(started.result.outcome, CommandOutcome.Committed);
  assert.equal(started.result.ambiguousInternalChoice, false);
  assert.equal(isWellFormedRuntimeState(program, instanceId, started.result.state), true);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, started.result.state), null);
  assert.equal(started.result.state.userTaskWaits.length, 3);
  assert.equal(started.result.state.timerWaits.length, 1);
  assert.equal(started.committedTransitions.length, 8);
  assert.equal(started.flowNodeOccurrenceLifecycles.length, 8);
  const forkIndex = started.committedTransitions.findIndex(({ transition }) =>
    transition.kind === "internalOperation" && transition.operationId === "operation:Fork_Checks");
  assert.ok(forkIndex > 0);
  assert.deepEqual(started.flowNodeOccurrenceLifecycles[forkIndex]?.started[0]?.anchor,
    { kind: "transition", commandId: start.commandId, transitionIndex: forkIndex, localIndex: 0 });
  assert.deepEqual(started.flowNodeOccurrenceLifecycles[forkIndex]?.ended[0]?.anchor,
    started.flowNodeOccurrenceLifecycles[forkIndex]?.started[0]?.anchor);
});

test("a later oversized arming batch rolls back the preceding mixed local-control batch", () => {
  const result = applyStimulusWithTrace(program, initialState, start, 6);
  assert.equal(result.result.outcome, CommandOutcome.RolledBack);
  assert.equal(result.result.internalStepBoundExceeded, true);
  assert.equal(result.result.ambiguousInternalChoice, false);
  assert.deepEqual(result.result.state, initialState);
  assert.deepEqual(result.committedTransitions, []);
  assert.deepEqual(result.flowNodeOccurrenceLifecycles, []);
});

const { PreparedInternalTransitionFamily, deriveInternalTransitionPreparation: prepare, prepareInternalTransitionBatch: batch,
  applyPreparedInternalTransition: apply } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

const parallelStarted = applyStimulus(parallelProgram, initialState, startStimulus());
const afterA = applyStimulus(parallelProgram, parallelStarted.state, completionStimulus("UserTask_A"));
const beforeFork = admittedInternalPrefix(parallelProgram, initialState, startStimulus(),
  ["operation:StartEvent_1"], ["operation:Gateway_Fork"]);
const beforeJoin = admittedInternalPrefix(parallelProgram, afterA.state, completionStimulus("UserTask_B"),
  [], ["operation:Gateway_Join"]);
const beforeSplit = admittedInternalPrefix(inclusiveProgram, initialState,
  inclusiveStart([present("takeA"), present("takeB")]), ["operation:Start"], ["operation:Split"]);
const inclusiveStarted = applyStimulus(inclusiveProgram, initialState, inclusiveStart([present("takeA"), present("takeB")]));
const inclusiveAfterA = applyStimulus(inclusiveProgram, inclusiveStarted.state, inclusiveCompletion("Task_A"));
const beforeSelectedJoin = admittedInternalPrefix(inclusiveProgram, inclusiveAfterA.state,
  inclusiveCompletion("Task_B"), [], ["operation:Join"]);
const exclusiveProgram: SemanticProcessProgram = {
  ...inclusiveProgram,
  identity: { ...inclusiveProgram.identity, semanticProfile: SemanticProfileId.ExclusiveGatewaySimpleBoolean },
  operations: inclusiveProgram.operations.map((operation): SemanticOperation => {
    switch (operation.kind) {
      case SemanticOperationKind.SelectMany: {
        const candidates = operation.candidates.map(({ expectedJoinInput: _join, ...candidate }) => candidate);
        assert.equal(candidates.length, 2);
        return { ...operationBase(operation.origin.elementId), kind: SemanticOperationKind.Choose,
          input: operation.input, candidates: [candidates[0]!, candidates[1]!],
          defaultOutput: operation.defaultBranch.output, defaultOrigin: operation.defaultBranch.origin };
      }
      case SemanticOperationKind.SynchronizeSelected:
        return { ...operationBase(operation.origin.elementId), kind: SemanticOperationKind.MergeExclusive,
          inputs: operation.inputs, output: operation.output };
      default: return operation;
    }
  }),
};
const localFixtures = [
  { base: parallelProgram, state: beforeFork, id: "operation:Gateway_Fork" },
  { base: parallelProgram, state: beforeJoin, id: "operation:Gateway_Join" },
  { base: exclusiveProgram, state: beforeSplit, id: "operation:Split" },
  { base: inclusiveProgram, state: beforeSplit, id: "operation:Split" },
  { base: inclusiveProgram, state: beforeSelectedJoin, id: "operation:Join" },
];

type ArmingOperation = Extract<SemanticOperation, { input: string; output: string }>;
function companions(): ArmingOperation[] {
  const input = place("Side_Input");
  const output = place("Side_Output");
  const message = { elementId: "Side_Message", channel: { kind: MessageChannelKind.OperationMessage,
    interfaceId: "Side_Interface", interfaceOperationId: "Side_Operation", messageId: "Side_MessageDefinition" } } as const;
  const messageBase = { ...operationBase(message.elementId), input, output, message };
  return [
    { ...operationBase("Side_Task"), kind: SemanticOperationKind.AwaitUserTask, input, output,
      task: { elementId: "Side_Task", name: "Concurrent review" } },
    { ...operationBase("Side_DataTask"), kind: SemanticOperationKind.AwaitDataInputOutputUserTask, input, output,
      task: { elementId: "Side_DataTask", name: "Review submitted details" },
      directInput: { associationId: "Side_InputAssociation", sourcePropertyId: "takeA",
        targetDataInputId: "Side_DataInput", targetDataInputName: "Details" },
      directOutput: { associationId: "Side_OutputAssociation", sourceDataOutputId: "Side_DataOutput",
        sourceDataOutputName: "Decision", targetPropertyId: "Side_Decision" } },
    { ...messageBase, kind: SemanticOperationKind.AwaitMessage },
    { ...messageBase, kind: SemanticOperationKind.AwaitPayloadMessage,
      directOutput: { associationId: "Side_MessageAssociation", sourceDataOutputId: "Side_MessageOutput",
        sourceDataOutputName: "Response", targetPropertyId: "Side_Response" } },
    { ...messageBase, kind: SemanticOperationKind.AwaitCorrelatedPayloadMessage,
      correlationKeyId: "Side_Key", correlationPropertyId: "Side_Property",
      payloadSelector: { language: CorrelationScalarPathLanguage, body: "payload" },
      processPropertySelector: { language: CorrelationScalarPathLanguage, body: "property:takeA", propertyId: "takeA" } },
    { ...operationBase("Side_Timer"), kind: SemanticOperationKind.AwaitTimer, input, output,
      timer: { elementId: "Side_Timer", durationMs: 1000 } },
    { ...operationBase("Side_Effect"), kind: SemanticOperationKind.AwaitEffect, input, output, bpmnErrorRoute: null,
      effect: { elementId: "Side_Effect", inputMappings: [], outputMappings: [],
        descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "urn:bpmn-lean:effect-operation:probe-v1" } } },
  ];
}

function mixedFixture(local: typeof localFixtures[number], side: ArmingOperation, fourth?: ArmingOperation) {
  const startOperation = local.base.operations.find(({ kind }) => kind === SemanticOperationKind.Initiate);
  const endOperation = local.base.operations.find(({ kind }) => kind === SemanticOperationKind.ReachNoneEnd);
  assert.ok(startOperation?.kind === SemanticOperationKind.Initiate && endOperation?.kind === SemanticOperationKind.ReachNoneEnd);
  const control = { ...operationBase("Side_Control"), kind: SemanticOperationKind.AwaitUserTask,
    input: place("Control_Input"), output: place("Control_Output"),
    task: { elementId: "Side_Control", name: "Independent control" } } as const;
  const companions = [side, control, ...(fourth === undefined ? [] : [fourth])];
  const program = rootScopedProgram({
    ...local.base,
    identity: { ...local.base.identity, semanticProfile: SemanticProfileId.ActivityDataInputOutputUserTask },
    controlPlaces: [...local.base.controlPlaces,
      ...["Outer_Input", "Outer_Output", "Side_Input", "Side_Output", "Control_Input", "Control_Output"]
        .map((name) => controlPlace(`Flow_${name}`)),
      ...(fourth === undefined ? [] : [fourth.input, fourth.output].map((id) => controlPlace(id.slice("place:".length)))),
    ].sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    operations: [
      ...local.base.operations.map((operation) => operation.id === startOperation.id
        ? { ...startOperation, output: place("Outer_Input") }
        : operation.id === endOperation.id ? { ...endOperation, input: place("Outer_Output") } : operation),
      { ...operationBase("Outer_Fork"), kind: SemanticOperationKind.Duplicate, input: place("Outer_Input"),
        outputs: [startOperation.output, ...companions.map(({ input }) => input)].sort(compareCanonicalStrings) },
      { ...operationBase("Outer_Join"), kind: SemanticOperationKind.Synchronize, output: place("Outer_Output"),
        inputs: [endOperation.input, ...companions.map(({ output }) => output)].sort(compareCanonicalStrings) },
      ...companions,
    ],
  });
  const owner = local.state.scopeOccurrences[0]!.id;
  const state: RuntimeState = {
    ...local.state, logicalTimeMs: 123,
    controlTokens: [...local.state.controlTokens,
      ...companions.map(({ input }) => ({ placeId: input, owner, multiplicity: 1 })),
    ].sort(compareTokenPlaces),
    variables: { ...local.state.variables, process: { bindings: [
      { name: "takeA", value: { kind: VariableValueKind.String, value: "Review details" } }, present("takeB"),
    ] } },
  };
  const operation = program.operations.find(({ id }) => id === local.id)!;
  const candidates = [operation, ...companions].map((operation) => ({ operation, owner }));
  return { program, state, candidates };
}

function permutations<Value>(values: ReadonlyArray<Value>): Value[][] {
  return values.length === 0 ? [[]] : values.flatMap((value, index) =>
    permutations(values.filter((_, candidate) => candidate !== index)).map((rest) => [value, ...rest]));
}

function assertValid(program: SemanticProcessProgram, state: RuntimeState) {
  assert.equal(state.control.kind, "running");
  const instanceId = state.scopeOccurrences[0]!.id.processInstanceId;
  assert.deepEqual(runtimeStateDefects(program, instanceId, state), []);
  assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
}

function assertAllOrders({ program, state, candidates }: ReturnType<typeof mixedFixture>, orderCount: number) {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assertValid(program, state);
  assert.deepEqual(program.operations.flatMap((operation) => {
    const step = applyInternalOperationStep(program, operation, state);
    return step === null ? [] : [step.operation.id];
  }).sort(compareCanonicalStrings), candidates.map(({ operation }) => operation.id).sort(compareCanonicalStrings));
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null);
  const expected = instantiateInternalPublicationBatch("mixed-batch", 37, prepared.map(({ publicationTemplate }) => publicationTemplate));
  assert.ok(expected !== null);
  let final: RuntimeState | undefined;
  const orders = permutations(prepared);
  assert.equal(orders.length, orderCount);
  for (const ordered of orders) {
    assert.deepEqual(batch(program, state, ordered), ordered);
    assert.deepEqual(instantiateInternalPublicationBatch("mixed-batch", 37,
      ordered.map(({ publicationTemplate }) => publicationTemplate)), expected);
    let current = state;
    const actual = [];
    for (const [index, member] of ordered.entries()) {
      for (const remaining of ordered.slice(index)) assert.deepEqual(prepare(program, current, remaining), remaining);
      const successor = apply(program, current, member);
      assert.ok(successor !== null);
      const step = applyInternalOperationStep(program, member.operation, current);
      assert.ok(step !== null && step.owner !== null);
      assert.deepEqual(step.successor, successor);
      const publication: InstantiatedInternalPublication = expected.find(({ alternative }) => alternative.operationId === member.operation.id)!;
      const positionDelta = projectControlPositionDelta(program, current, successor);
      assert.ok(positionDelta !== null);
      const record = { logicalTimeMs: current.logicalTimeMs,
        transition: { kind: SemanticTransitionKind.InternalOperation, operationId: member.operation.id,
          operationKind: member.operation.kind, origin: member.operation.origin, owner: step.owner }, positionDelta } as const;
      const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, current, successor,
        { kind: "internal", operation: member.operation, owner: step.owner }, "mixed-batch", publication.transitionIndex);
      assert.ok(lifecycle !== null);
      actual.push({ alternative: member.alternative, transitionIndex: publication.transitionIndex, record, lifecycle });
      current = successor;
      assertValid(program, current);
    }
    assert.deepEqual(actual.sort((left, right) =>
      compareCanonicalStrings(left.alternative.operationId, right.alternative.operationId)), expected);
    if (final === undefined) final = current;
    else assert.deepEqual(current, final);
  }
}

for (const local of localFixtures) for (const side of companions()) {
  test(`${local.base.operations.find(({ id }) => id === local.id)!.kind}/${side.kind} preserves complete preparation and accepted publication in six orders`, () => {
    assertAllOrders(mixedFixture(local, side), 6);
  });
}

function fourFamilyFixture() {
  const timer = companions()[5]!;
  return mixedFixture(localFixtures[0]!, companions()[1]!, {
    ...timer, input: place("Timer_Input"), output: place("Timer_Output"),
  });
}

test("local fork, composed data task, ordinary User Task and Timer preserve complete publications in 24 orders", () => {
  const fixture = fourFamilyFixture();
  assert.deepEqual(fixture.candidates.map(({ operation }) => operation.kind), [
    SemanticOperationKind.Duplicate, SemanticOperationKind.AwaitDataInputOutputUserTask,
    SemanticOperationKind.AwaitUserTask, SemanticOperationKind.AwaitTimer,
  ]);
  assertAllOrders(fixture, 24);
});

test("numbering before canonical sorting changes the local anchor when its execution rank moves", () => {
  const { program, state, candidates } = fourFamilyFixture();
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null);
  const templates = prepared.map(({ publicationTemplate }) => publicationTemplate);
  const reverse = [...templates].reverse();
  const canonical = instantiateInternalPublicationBatch("canonical-rank", 37, templates);
  assert.ok(canonical !== null);
  assert.deepEqual(canonical.map(({ transitionIndex }) => transitionIndex), [37, 38, 39, 40]);
  assert.deepEqual(instantiateInternalPublicationBatch("canonical-rank", 37, reverse), canonical);
  const numberedInVisitOrder = (ordered: typeof templates) => ordered.map((template, index) => {
    const singleton = instantiateInternalPublicationBatch("canonical-rank", 37 + index, [template]);
    assert.ok(singleton !== null);
    return singleton[0]!;
  }).sort((left, right) => compareCanonicalStrings(left.alternative.operationId, right.alternative.operationId));
  const forwardWrong = numberedInVisitOrder(templates);
  const reverseWrong = numberedInVisitOrder(reverse);
  const localId = candidates[0]!.operation.id;
  const localAnchor = (publications: typeof canonical) => publications.find(({ alternative }) =>
    alternative.operationId === localId)!.lifecycle.started[0]!.anchor;
  assert.notDeepEqual(localAnchor(forwardWrong), localAnchor(reverseWrong));
  assert.deepEqual(localAnchor(canonical), {
    kind: "transition", commandId: "canonical-rank", transitionIndex: 37, localIndex: 0,
  });
  assert.notDeepEqual(reverseWrong, canonical);
});

test("generic preparation refuses unavailable members, forged owners and stale local publications", () => {
  const { program, state, candidates } = fourFamilyFixture();
  assert.equal(batch(program, state, []), null);
  assert.equal(batch(program, state, candidates.slice(0, 1)), null);
  assert.equal(batch(program, state, [...candidates, candidates[0]!]), null);
  assert.equal(batch(program, state, [...candidates, { ...candidates[0]!, owner: { ...candidates[0]!.owner, activation: 2 } }]), null);
  assert.equal(prepare(program, state, { ...candidates[0]!, owner: null }), null);
  assert.equal(prepare(program, state, { ...candidates[0]!,
    operation: { ...candidates[0]!.operation, id: "operation:undeclared" } }), null);
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null);
  const local = prepared[0]!;
  const forged: PreparedInternalTransition = { ...local, publicationTemplate: { ...local.publicationTemplate,
    record: { ...local.publicationTemplate.record, logicalTimeMs: 0 } } };
  assert.equal(apply(program, state, forged), null);
  const snapshotProgram = { ...program, compensationEventSubProcessSnapshots: {
    targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
  } };
  assert.equal(prepare(snapshotProgram, state, local), null);
  assert.equal(apply(snapshotProgram, state, local), null);
  assert.equal(batch(snapshotProgram, state, candidates), null);
  assert.equal(batch(snapshotProgram, state, candidates.slice(1)), null);
  assert.ok(batch(snapshotProgram, state, candidates.slice(2)) !== null);
});

test("an enabled unsupported member refuses the whole mixed frontier in every position", () => {
  const fixture = fourFamilyFixture();
  const original = fixture.candidates[2]!;
  assert.equal(original.operation.kind, SemanticOperationKind.AwaitUserTask);
  const operation = { ...operationBase(original.operation.origin.elementId), kind: SemanticOperationKind.MergeExclusive,
    inputs: [place("Control_Input")], output: place("Control_Output") } as const;
  const program = rootScopedProgram({ ...fixture.program,
    operations: fixture.program.operations.map((candidate) => candidate.id === operation.id ? operation : candidate),
  });
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assertValid(program, fixture.state);
  assert.notEqual(applyInternalOperationStep(program, operation, fixture.state), null);
  const unsupported = { ...original, operation };
  const supported = fixture.candidates.filter((candidate) => candidate !== original);
  assert.ok(batch(program, fixture.state, supported) !== null);
  for (let index = 0; index <= supported.length; index += 1) {
    assert.equal(batch(program, fixture.state, [...supported.slice(0, index), unsupported, ...supported.slice(index)]), null);
  }
});

test("a nonadjacent local output and arming input conflict refuses all candidate orders", () => {
  const fixture = fourFamilyFixture();
  const local = fixture.candidates[0]!;
  assert.ok(local.operation.kind === SemanticOperationKind.Duplicate);
  const operation = { ...local.operation, outputs: [...local.operation.outputs, place("Timer_Input")].sort(compareCanonicalStrings) };
  const program = rootScopedProgram({ ...fixture.program,
    operations: fixture.program.operations.map((candidate) => {
      if (candidate.id === operation.id) return operation;
      return candidate.id === "operation:Outer_Fork" && candidate.kind === SemanticOperationKind.Duplicate
        ? { ...candidate, outputs: candidate.outputs.filter((output) => output !== place("Timer_Input")) }
        : candidate;
    }),
  });
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assertValid(program, fixture.state);
  const candidates = fixture.candidates.map((candidate) => candidate === local ? { ...candidate, operation } : candidate);
  assert.ok(candidates.every((candidate) => prepare(program, fixture.state, candidate) !== null));
  assert.ok(batch(program, fixture.state, candidates.slice(0, 3)) !== null);
  const localPrepared = prepare(program, fixture.state, candidates[0]!);
  assert.ok(localPrepared !== null);
  const successor = apply(program, fixture.state, localPrepared);
  assert.ok(successor !== null);
  assertValid(program, successor);
  assert.equal(successor.controlTokens.find(({ placeId }) => placeId === place("Timer_Input"))?.multiplicity, 2);
  for (const ordered of permutations(candidates)) assert.equal(batch(program, fixture.state, ordered), null);
});

test("each mixed family rejects stale complete preparations despite unchanged operation identity", () => {
  const { program, state, candidates } = fourFamilyFixture();
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null);
  for (const member of prepared) {
    const stale = { ...state, logicalTimeMs: state.logicalTimeMs + 1 };
    assertValid(program, stale);
    assert.notEqual(applyInternalOperationStep(program, member.operation, stale), null);
    assert.notEqual(prepare(program, stale, member), null);
    assert.equal(apply(program, stale, member), null);
    let forged: PreparedInternalTransition;
    switch (member.family) {
      case PreparedInternalTransitionFamily.Arming:
        forged = { ...member, footprint: { ...member.footprint, reads: [] } };
        break;
      case PreparedInternalTransitionFamily.LocalControl:
      case PreparedInternalTransitionFamily.ScopeCreation:
      case PreparedInternalTransitionFamily.Regional:
      case PreparedInternalTransitionFamily.OrdinaryEnd:
        forged = { ...member, footprint: { ...member.footprint, reads: [] } };
        break;
    }
    assert.equal(apply(program, state, forged), null);
  }
});
