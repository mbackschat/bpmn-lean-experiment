import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, ControlStateKind, EffectExecutionResultKind, ScenarioStepKind, StimulusKind, VariableValueKind,
  advanceScenario, initialState, replayCommittedTransitions,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, StartProcessStimulus, Stimulus } from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind, assessTemporalHostCapability, TemporalHostCapabilityResultKind,
  BpmnWorkflowHostInputKind, requireBpmnWorkflowHostInputV1,
  workflowChainCanonicalUtf8ByteLength, workflowChainProductionLimit, workflowContinuationBudgetViolation,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowChainCapacityState, WorkflowCommandCapacityState, WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryPreflightKind, WorkflowCommandRecoveryLookupKind,
  WorkflowSemanticCandidatePreflightKind, buildWorkflowChainSuccessor,
  createCommandPublicationState, integrateCommandPublication, isExternallyRecoverableStimulus, initializeWorkflowChain,
  preflightWorkflowSemanticCandidate, recordCommandPublicationOutcome, validateIncomingWorkflowContinuation,
  validateContinuationArguments,
} from "@bpmn-lean/temporal-workflow";
import type { CommandPublicationState, WorkflowChainRuntime } from "@bpmn-lean/temporal-workflow";
import { parallelCommandInputs } from "../../../bpmn-source/test/parallel-scope-command-fixture.ts";

const { emptyWorkflowPublicationSegmentDirectory, restoreWorkflowCommandPublication } = await import(
  new URL("../dist/workflow-publication-segments.js", import.meta.url).href
) as typeof import("../src/workflow-publication-segments.ts");
const firstRun = "private-pmis-run-1";
type Fixture = { program: SemanticProcessProgram; start: StartProcessStimulus; state: RuntimeState;
  publication: CommandPublicationState; runtime: WorkflowChainRuntime };

function fixture(input: { program: SemanticProcessProgram; start: StartProcessStimulus }): Fixture {
  return { ...input, state: initialState, publication: createCommandPublicationState(input.program, input.start.instanceId),
    runtime: { eventHistoryEventLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents),
      eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes),
      runId: firstRun, runOrdinal: 1, firstExecutionRunId: firstRun,
      segmentDirectory: emptyWorkflowPublicationSegmentDirectory(), recovery: new WorkflowCommandRecoveryLedger(),
      capacity: new WorkflowChainCapacityState({ processInstanceId: input.start.instanceId, runOrdinal: 1 }),
      commandCapacity: new WorkflowCommandCapacityState() } };
}

function commit(value: Fixture, command: Stimulus): Fixture {
  const step = advanceScenario(value.program, value.state, command);
  assert.equal(step.kind, ScenarioStepKind.Committed, command.commandId);
  if (step.kind !== ScenarioStepKind.Committed) assert.fail("Expected committed private command");
  assert.ok(step.publication);
  assert.deepEqual(replayCommittedTransitions(value.program, value.state, step.publication.transitions), step.state);
  const integrated = integrateCommandPublication(value.program, value.publication, command, step, () => 1_000);
  const publication = recordCommandPublicationOutcome(integrated, command, step.observations);
  assert.equal(preflightWorkflowSemanticCandidate({ state: step.state, publicationBefore: value.publication,
    publication }).kind, WorkflowSemanticCandidatePreflightKind.Ready);
  if (isExternallyRecoverableStimulus(command)) {
    const admitted = value.runtime.recovery.preflight(command);
    assert.equal(admitted.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
    if (admitted.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) assert.fail("Expected recovery admission");
    value.runtime.recovery.record(admitted.admission, CommandOutcome.Committed);
  }
  return { ...value, state: step.state, publication };
}

function human(value: Fixture, elementId: string, activation = 1, stop = false): Extract<Stimulus, { kind: StimulusKind.CompleteUserTaskInstance }> {
  const wait = value.state.userTaskWaits.find(({ id }) => id.elementId === elementId && id.activation === activation);
  assert.ok(wait);
  return { kind: StimulusKind.CompleteUserTaskInstance, commandId: `${elementId}-${activation}`, taskId: wait.id,
    submittedValues: stop ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] : [] };
}

function effect(value: Fixture, activation = 1): Stimulus {
  const wait = value.state.effectWaits.find(({ id }) => id.activation === activation);
  assert.ok(wait);
  return { kind: StimulusKind.CompleteEffect, commandId: `effect-${activation}`, effectId: wait.id,
    result: { kind: EffectExecutionResultKind.Success,
      localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "accepted" } }] } };
}

function successor(value: Fixture) {
  return buildWorkflowChainSuccessor(value.runtime, value.start, value.program, value.state, value.publication, []);
}

function validateCarried(value: Fixture, hostValue: unknown, state: unknown, recovery: unknown, publication: unknown) {
  const host = requireBpmnWorkflowHostInputV1(hostValue);
  assert.equal(host.kind, BpmnWorkflowHostInputKind.Continuation);
  if (host.kind !== BpmnWorkflowHostInputKind.Continuation) assert.fail("Expected successor metadata");
  return validateContinuationArguments(value.start, value.program, host, state, recovery, publication, firstRun, undefined, false);
}

function verifyResume(value: Fixture, command: Stimulus) {
  const args = successor(value);
  assert.equal(workflowContinuationBudgetViolation(...args), null);
  const copied = JSON.parse(JSON.stringify(args)) as typeof args;
  assert.throws(() => validateIncomingWorkflowContinuation(copied[0], copied[1], copied[2], copied[3], copied[4], copied[5], firstRun),
    /Workflow continuation has invalid execution input/u);
  assert.throws(() => initializeWorkflowChain(...copied), /Workflow continuation has invalid execution input/u);
  assert.equal(JSON.stringify(copied), JSON.stringify(args));
  const restored = validateCarried(value, copied[2], copied[3], copied[4], copied[5]);
  for (const [actual, expected] of [[restored.state, args[3]], [restored.recovery, args[4]], [restored.publication, args[5]]])
    assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  const recovered = new WorkflowCommandRecoveryLedger(restored.recovery);
  assert.deepEqual(advanceScenario(value.program, restored.state, command), advanceScenario(value.program, value.state, command));
  const resumed: Fixture = { ...value, state: restored.state, publication: restoreWorkflowCommandPublication(restored.publication),
    runtime: { ...value.runtime, runId: "private-pmis-run-2", runOrdinal: 2,
      segmentDirectory: restored.publication.segmentDirectory, recovery: recovered,
      capacity: new WorkflowChainCapacityState({ processInstanceId: value.start.instanceId, runOrdinal: 2 }),
      commandCapacity: new WorkflowCommandCapacityState() } };
  const expected = commit(value, command);
  const actual = commit(resumed, command);
  assert.equal(JSON.stringify(actual.state), JSON.stringify(expected.state));
  assert.deepEqual([...value.publication.execution.batches, ...actual.publication.execution.batches], expected.publication.execution.batches);
  assert.deepEqual([...value.publication.flowNodeOccurrences.batches, ...actual.publication.flowNodeOccurrences.batches],
    expected.publication.flowNodeOccurrences.batches);
  assert.deepEqual(actual.publication.execution.current, expected.publication.execution.current);
  assert.deepEqual(actual.publication.flowNodeOccurrences.currentOpen, expected.publication.flowNodeOccurrences.currentOpen);
  assert.deepEqual(actual.publication.flowNodeOccurrences.retainedOpen, expected.publication.flowNodeOccurrences.retainedOpen);
  assert.deepEqual(actual.runtime.recovery.snapshot(), expected.runtime.recovery.snapshot());
  if (actual.state.control.kind === ControlStateKind.Running) {
    const next = successor(actual);
    assert.equal(next[5].segmentDirectory.segments.length, 2);
    const nextRestored = validateCarried(actual, next[2], next[3], next[4], next[5]);
    assert.deepEqual(nextRestored.publication, next[5]);
  }
  assert.equal(assessTemporalHostCapability(value.program).kind, TemporalHostCapabilityResultKind.Rejected);
  const bytes = args.map(workflowChainCanonicalUtf8ByteLength);
  return { args, next: expected, bytes: { start: bytes[0], program: bytes[1], host: bytes[2], state: bytes[3],
    recovery: bytes[4], publication: bytes[5], aggregate: bytes.reduce((sum, count) => sum + count, 0) } };
}

for (const input of await parallelCommandInputs()) {
  test(`private PMIS carried envelope preserves ${input.count} bodies while host ingress refuses`, context => {
    let value = commit(fixture(input), input.start);
    if (input.count > 0) value = commit(value, human(value, "Review"));
    const { bytes } = verifyResume(value, input.count === 0 ? human(value, "PublishBatch") : effect(value));
    context.diagnostic(JSON.stringify({ count: input.count, bytes }));
  });
}

for (const early of [false, true]) test(`private PMIS carried envelope preserves ${early ? "early cancellation" : "partial retirement"}`, async context => {
  const input = (await parallelCommandInputs({ condition: early })).find(({ count }) => count === 2)!;
  let value = commit(fixture(input), input.start);
  value = commit(value, human(value, "Review", 1, early));
  value = commit(value, effect(value));
  value = commit(value, human(value, "Confirm"));
  assert.equal(value.state.variables.scopes.length, early ? 0 : 1);
  const { bytes } = verifyResume(value, human(value, early ? "PublishBatch" : "Review", early ? 1 : 2));
  context.diagnostic(JSON.stringify({ early, bytes }));
});

test("private PMIS carried envelope rejects missing and misaligned publication, recovery and identity", async t => {
  const input = (await parallelCommandInputs()).find(({ count }) => count === 2)!;
  let value = commit(fixture(input), input.start);
  const review = human(value, "Review");
  value = commit(value, review);
  const args = successor(value);
  validateCarried(value, args[2], args[3], args[4], args[5]);
  const [host, state, recovery, publication] = args.slice(2, 6);
  const entry = args[4].entries[0]!;
  assert.ok(entry);
  const mutations: readonly (readonly [string, number, unknown])[] = [
    ["missing publication", 3, undefined],
    ["missing recovery", 2, undefined],
    ["missing recovery entries", 2, {}],
    ["duplicate recovery identity", 2, { entries: [entry, entry] }],
    ["malformed recovery digest", 2, { entries: [{ ...entry, stimulusSha256: "invalid" }] }],
    ["unknown recovery field", 2, { ...args[4], extra: true }],
    ["wrong instance", 0, { ...args[2], processInstanceId: "foreign" }],
    ["wrong Start", 0, { ...args[2], startCommandId: "other" }],
    ["wrong definition", 0, { ...args[2], definition: { ...args[2].definition, semanticProfile: "other" } }],
    ["wrong first Run", 0, { ...args[2], firstExecutionRunId: "other" }],
    ["wrong directory digest", 0, { ...args[2], publicationSegmentDirectorySha256: "0".repeat(64) }],
    ["missing paired open set", 3, { ...args[5], flowNodeOccurrences: { ...args[5].flowNodeOccurrences, retainedOpen: [] } }],
    ["misaligned E2 head", 3, { ...args[5], flowNodeOccurrences: { ...args[5].flowNodeOccurrences, headRevision: 0 } }],
    ["missing segment", 3, { ...args[5], segmentDirectory: emptyWorkflowPublicationSegmentDirectory() }],
  ];
  for (const [label, index, replacement] of mutations) await t.test(label, () => {
    const altered: unknown[] = [host, state, recovery, publication];
    assert.notDeepEqual(altered[index], replacement, `${label}: mutation must change carried facts`);
    altered[index] = replacement;
    assert.throws(() => validateCarried(value, altered[0], altered[1], altered[2], altered[3]), label);
  });
  const restored = new WorkflowCommandRecoveryLedger(args[4]);
  assert.deepEqual(restored.lookup(review), { kind: WorkflowCommandRecoveryLookupKind.Resolved, outcome: CommandOutcome.Committed });
  assert.equal(restored.lookup({ ...review,
    submittedValues: [{ name: "reviewStatus", value: { kind: VariableValueKind.String, value: "changed" } }] }).kind,
  WorkflowCommandRecoveryLookupKind.IdentityConflict);
  const substituted = new WorkflowCommandRecoveryLedger({ entries: [{ ...entry, stimulusSha256: "0".repeat(64) }] });
  assert.equal(substituted.lookup(review).kind, WorkflowCommandRecoveryLookupKind.IdentityConflict);
});

for (const bodyShape of ["joined", "separate-ends"] as const) for (const early of [false, true]) test(
  `private PMIS ${bodyShape} carried envelope preserves branches and ${early ? "early cancellation" : "natural retirement"}`,
  async context => {
    const input = (await parallelCommandInputs({ bodyShape, condition: early })).find(({ count }) => count === 2)!;
    let value = commit(fixture(input), input.start);
    const sizes: number[] = [];
    const resume = (command: Stimulus) => {
      const checked = verifyResume(value, command);
      sizes.push(checked.bytes.aggregate);
      value = checked.next;
    };
    if (bodyShape === "joined") {
      value = commit(value, human(value, "Branch0", 1, early));
      assert.equal(value.state.effectWaits.length, 0, "partial Join cannot arm its Service Task");
      resume(human(value, "Branch1"));
      assert.equal(value.state.effectWaits.length, 0, "one remaining Join input still blocks Service arming");
      resume(human(value, "Branch2"));
    } else {
      assert.equal(value.state.effectWaits.length, 2);
      resume(human(value, "Branch0", 1, early));
      assert.equal(value.state.variables.scopes.length, 2, "first inner End retains both bodies");
      assert.ok(value.state.userTaskWaits.some(wait => wait.id.elementId === "Branch1" && wait.owner.activation === 1));
    }
    assert.ok(value.state.effectWaits.some(wait => wait.owner.activation === 1));
    const sibling = value.state.userTaskWaits.find(wait => wait.owner.activation === 2);
    assert.ok(sibling, "carried checkpoint has simultaneous sibling Human and Service work");
    const args = successor(value);
    validateCarried(value, args[2], args[3], args[4], args[5]);
    const mutations = [
      { ...args[3], userTaskWaits: args[3].userTaskWaits.filter(wait => wait.id.elementId !== sibling.id.elementId || wait.id.activation !== sibling.id.activation) },
      { ...args[3], userTaskWaits: args[3].userTaskWaits.map(wait => wait.id.elementId === sibling.id.elementId && wait.id.activation === sibling.id.activation
        ? { ...wait, owner: { ...wait.owner, activation: 999 } } : wait) },
    ];
    for (const [index, state] of mutations.entries()) {
      assert.notDeepEqual(state, args[3], `pending branch mutation ${index} changes carried state`);
      assert.throws(() => validateCarried(value, args[2], state, args[4], args[5]), `pending sibling branch mutation ${index}`);
    }
    resume(effect(value));
    if (bodyShape === "separate-ends") resume(human(value, "Branch1"));
    resume(human(value, "Confirm"));
    assert.equal(value.state.variables.scopes.length, early ? 0 : 1);
    if (!early) {
      const branches = bodyShape === "joined" ? ["Branch0", "Branch1", "Branch2"] : ["Branch0", "Branch1"];
      for (const branch of branches) resume(human(value, branch, 2));
      resume(effect(value, 2));
      resume(human(value, "Confirm", 2));
      assert.equal(value.state.variables.scopes.length, 0);
    }
    resume(human(value, "PublishBatch"));
    assert.equal(value.state.control.kind, ControlStateKind.Completed);
    context.diagnostic(JSON.stringify({ bodyShape, early, checkpoints: sizes.length, maximumAggregateBytes: Math.max(...sizes) }));
  },
);
