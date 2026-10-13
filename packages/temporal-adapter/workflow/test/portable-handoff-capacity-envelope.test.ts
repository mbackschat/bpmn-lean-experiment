/**
 * Settles the pre-start capacity envelope of the portable handoff against the real Workflow encoders.
 *
 * The oracle is the encoders themselves: the maximal journey (a full-allowance Start order and two full-allowance
 * completions) is driven through the actual candidate preflight, publication, successor, Query, terminal-envelope,
 * recovery-ledger and retention owners, and for every hosted budget the measured bytes must stay within the
 * envelope's estimate (soundness of the bookkeeping allowances) and within the production limit. The envelope never
 * sees these encoders, so an allowance that an encoder outgrows fails here rather than in production.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  canonicalValueUtf8ByteLength,
  initialState,
  isSingletonBusinessItem,
  maximumCanonicalValueBytes,
} from "@bpmn-lean/semantic-core";
import type {
  BusinessValue,
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  StartCapacityEnvelopeResultKind,
  WorkflowChainBudgetKind,
  assessStartCapacityEnvelope,
  bpmnWorkflowPublicationSegmentsV1,
  fullAllowanceValue,
  productionStartCapacityEnvelopeLimits,
  reservedFutureCommandIdBytes,
  runStartCapacityJourney,
  startCapacityEnvelopeBudgets,
  workflowChainCanonicalUtf8ByteLength as bytes,
} from "@bpmn-lean/temporal-protocol";
import type { StartCapacityEnvelopeBudget } from "@bpmn-lean/temporal-protocol";

import {
  WorkflowChainCapacityState,
  WorkflowCommandCapacityState,
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryPreflightKind,
  buildWorkflowChainSuccessor,
  createCommandPublicationState,
  integrateCommandPublication,
  measureWorkflowRunRetention,
  preflightWorkflowSemanticCandidate,
  recordCommandPublicationOutcome,
} from "../dist/index.js";
import type { CommandPublicationState, WorkflowChainRuntime } from "../dist/index.js";
import { preflightWorkflowTerminalResult } from "../dist/workflow-terminal-completion.js";
import {
  emptyWorkflowPublicationSegmentDirectory,
  queryWorkflowPublicationSegment,
  selectWorkflowPublication,
} from "../dist/workflow-publication-segments.js";
import {
  portableHandoffProgram,
  portableHandoffStart,
} from "../../protocol/test/portable-handoff-capacity-fixture.ts";

const production = productionStartCapacityEnvelopeLimits();

/** Identifier shapes the allowances must stay sound for: the retained short ones, then long instance and command IDs. */
const identifierShapes = [
  { label: "short identifiers", instanceId: "Order_1", startCommandId: "start-order" },
  { label: "long instance ID", instanceId: "I".repeat(512), startCommandId: "start-order" },
  { label: "long Start command ID", instanceId: "Order_1", startCommandId: "S".repeat(2_048) },
] as const;

function completion(
  instanceId: string,
  elementId: string,
  output: string,
  ordinal: number,
  value: BusinessValue = fullAllowanceValue(),
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`,
    taskId: { processInstanceId: instanceId, elementId, activation: 1 },
    submittedValues: [{ name: output, value }],
  };
}

/** Every budget's measured bytes after the maximal journey, taken from the Workflow-side owners. */
function measureWithWorkflowEncoders(
  program: SemanticProcessProgram,
  start: StartProcessStimulus,
  output: BusinessValue = fullAllowanceValue(),
): Readonly<Record<StartCapacityEnvelopeBudget, number>> {
  const instanceId = start.instanceId;
  const stimuli: Stimulus[] = [
    start,
    completion(instanceId, "ReviewOrder", "ReviewOrder_out", 1, output),
    completion(instanceId, "ArchiveOrder", "ArchiveOrder_out", 2, output),
  ];
  const recovery = new WorkflowCommandRecoveryLedger();
  const runtime: WorkflowChainRuntime = {
    eventHistoryEventLimit: 8_000, eventHistoryByteLimit: 8 * 1024 * 1024, runId: "capacity-run-1", runOrdinal: 1,
    firstExecutionRunId: "capacity-run-1", segmentDirectory: emptyWorkflowPublicationSegmentDirectory(), recovery,
    capacity: new WorkflowChainCapacityState({ processInstanceId: instanceId, runOrdinal: 1 }),
    commandCapacity: new WorkflowCommandCapacityState(),
  };
  const worst = Object.fromEntries(startCapacityEnvelopeBudgets.map((budget) => [budget, 0])) as
    Record<StartCapacityEnvelopeBudget, number>;
  const raise = (budget: StartCapacityEnvelopeBudget, value: number) => {
    worst[budget] = Math.max(worst[budget], value);
  };
  raise(WorkflowChainBudgetKind.SemanticProcessProgramBytes, bytes(program));
  raise(WorkflowChainBudgetKind.InitialStartStimulusBytes, bytes(start));

  let state: RuntimeState = initialState;
  let publication: CommandPublicationState = createCommandPublicationState(program, instanceId);
  const trace: CanonicalObservation[] = [];
  for (const stimulus of stimuli) {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed, `${stimulus.commandId.slice(0, 8)} commits`);
    const before = publication;
    publication = recordCommandPublicationOutcome(
      integrateCommandPublication(program, before, stimulus, step, () => 1_700_000_000_000),
      stimulus,
      step.observations,
    );
    const candidate = preflightWorkflowSemanticCandidate({ state: step.state, publicationBefore: before, publication });
    assert.equal(candidate.kind, "ready", "the real candidate preflight accepts the maximal journey");
    if (candidate.kind === "ready") {
      raise(WorkflowChainBudgetKind.CommittedRuntimeStateBytes, candidate.observedStateBytes);
      raise(WorkflowChainBudgetKind.PublicationBatchBytes, candidate.observedPublicationBatchBytes ?? 0);
    }
    if (stimulus.kind === StimulusKind.CompleteUserTaskInstance) {
      raise(WorkflowChainBudgetKind.SemanticStimulusBytes, bytes(stimulus));
      const admitted = recovery.preflight(stimulus);
      assert.equal(admitted.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
      if (admitted.kind === WorkflowCommandRecoveryPreflightKind.Admitted) {
        recovery.record(admitted.admission, CommandOutcome.Committed);
      }
    }
    state = step.state;
    trace.push(...step.observations);
    measureQuery(program, instanceId, publication, raise);
    if (step.state.control.kind === "running") {
      measureSuccessor(runtime, start, program, step.state, publication, raise);
    }
  }
  raise(WorkflowChainBudgetKind.CommandRecoveryLedgerBytes, bytes(recovery.snapshot()));
  raise(WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes, measureWorkflowRunRetention(trace, publication));
  const terminal = preflightWorkflowTerminalResult(program, instanceId, state, trace, recovery);
  assert.equal(terminal.kind, "ready", "the real terminal preflight accepts the maximal journey");
  if (terminal.kind === "ready") raise(WorkflowChainBudgetKind.TerminalResultEnvelopeBytes, bytes(terminal.result));
  return worst;
}

function measureQuery(
  program: SemanticProcessProgram,
  instanceId: string,
  publication: CommandPublicationState,
  raise: (budget: StartCapacityEnvelopeBudget, value: number) => void,
): void {
  const segmentRuntime = {
    runId: "capacity-run-1", runOrdinal: 1, firstExecutionRunId: "capacity-run-1",
    segmentDirectory: emptyWorkflowPublicationSegmentDirectory(),
  };
  const selectionRequest = { protocol: bpmnWorkflowPublicationSegmentsV1, processInstanceId: instanceId, afterRevision: 0 } as const;
  const selection = selectWorkflowPublication(program, instanceId, segmentRuntime, publication, selectionRequest);
  assert.equal(selection.kind, "available");
  if (selection.kind !== "available") return;
  const response = queryWorkflowPublicationSegment(program, instanceId, segmentRuntime, publication,
    { ...selectionRequest, descriptor: selection.selected, snapshot: selection.snapshot });
  raise(WorkflowChainBudgetKind.QueryResponseBytes, bytes(response));
}

function measureSuccessor(
  runtime: WorkflowChainRuntime,
  start: StartProcessStimulus,
  program: SemanticProcessProgram,
  state: RuntimeState,
  publication: CommandPublicationState,
  raise: (budget: StartCapacityEnvelopeBudget, value: number) => void,
): void {
  const successor = buildWorkflowChainSuccessor(runtime, start, program, state, publication, []);
  const [, , host, , , continuationPublication] = successor;
  raise(WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes,
    Math.max(bytes(host), bytes(continuationPublication)));
  raise(WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes,
    successor.reduce((total, argument) => total + bytes(argument), 0));
}

for (const { label, instanceId, startCommandId } of identifierShapes) {
  test(`the envelope bounds every Workflow encoder for the maximal journey, ${label}`, async (context) => {
    const program = await portableHandoffProgram();
    const start = portableHandoffStart(instanceId, fullAllowanceValue(), startCommandId);
    const envelope = assessStartCapacityEnvelope(start, program);
    assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
    const actual = measureWithWorkflowEncoders(program, start);
    for (const budget of startCapacityEnvelopeBudgets) {
      const estimate = envelope.estimates[budget];
      context.diagnostic(`${budget}: actual ${actual[budget]}, estimate ${estimate}, limit ${production[budget]}`);
      assert.ok(actual[budget] > 0, `${budget} was exercised`);
      assert.ok(actual[budget] <= estimate, `${budget}: actual ${actual[budget]} exceeds estimate ${estimate}`);
      assert.ok(actual[budget] <= production[budget], `${budget}: actual ${actual[budget]} exceeds production`);
    }
  });
}

test("the envelope's journey submits exactly the stimuli an independent drive of the model uses", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", fullAllowanceValue());
  const { steps } = runStartCapacityJourney(start, program);
  assert.deepEqual(steps.map(({ stimulus }) => stimulus), [
    start,
    completion("Order_1", "ReviewOrder", "ReviewOrder_out", 1),
    completion("Order_1", "ArchiveOrder", "ArchiveOrder_out", 2),
  ]);
});

test("at production limits the longest instance ID the envelope admits fits every real encoder, one byte shorter than the refused one", async (context) => {
  const program = await portableHandoffProgram();
  const value = fullAllowanceValue();
  const fits = (length: number) => assessStartCapacityEnvelope(
    portableHandoffStart("I".repeat(length), value), program).kind === StartCapacityEnvelopeResultKind.WithinCapacity;
  let low = 1;
  let high = 64 * 1024;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle;
  }
  const admittedActual = measureWithWorkflowEncoders(program, portableHandoffStart("I".repeat(low), value, "start-order"));
  for (const budget of startCapacityEnvelopeBudgets) {
    assert.ok(admittedActual[budget] <= production[budget], `${budget} holds at the longest admitted instance ID`);
  }
  const refused = assessStartCapacityEnvelope(portableHandoffStart("I".repeat(high), value), program);
  assert.ok(refused.kind === StartCapacityEnvelopeResultKind.Exceeded);
  assert.equal(high, low + 1);
  // The envelope is conservative by design: the real encoders are not required to overflow at `high`.
  context.diagnostic(`refused at ${high} instance-ID bytes by ${refused.failure.budget}: ` +
    `estimate ${refused.failure.estimatedValue} over ${refused.failure.configuredBound}`);
});

/**
 * A Map of Strings in `character`, each at most the 1,024-byte text bound, filled to exactly the per-value
 * allowance with a final ASCII entry. Escaped characters cost several canonical bytes per raw byte, so these
 * separate an envelope that measures canonical bytes from host encoders that might re-escape or wrap values.
 */
function escapeHeavyAllowanceValue(character: string): BusinessValue {
  const map = (texts: ReadonlyArray<string>): BusinessValue => ({
    kind: VariableValueKind.Map,
    value: texts.map((text, index) => ({
      name: `k${String(index).padStart(2, "0")}`,
      value: { kind: VariableValueKind.String, value: text },
    })),
  });
  const texts: string[] = [];
  while (canonicalValueUtf8ByteLength(map([...texts, character.repeat(1_024), ""])) <= maximumCanonicalValueBytes) {
    texts.push(character.repeat(1_024));
  }
  for (;;) {
    const room = maximumCanonicalValueBytes - canonicalValueUtf8ByteLength(map([...texts, ""]));
    if (room < 0) break;
    texts.push("a".repeat(Math.min(1_024, room)));
  }
  const value = map(texts);
  assert.ok(isSingletonBusinessItem(value), "the escape-heavy output is admitted");
  assert.ok(canonicalValueUtf8ByteLength(value) > maximumCanonicalValueBytes - 64, "the output nearly fills the allowance");
  return value;
}

/** Many small nodes within the depth, member and node bounds: per-node encoder overhead, not text, dominates. */
function nodeHeavyValue(): BusinessValue {
  return {
    kind: VariableValueKind.Map,
    value: Array.from({ length: 32 }, (_, index) => ({
      name: `k${String(index).padStart(2, "0")}`,
      value: {
        kind: VariableValueKind.List,
        value: Array.from({ length: 6 }, () => ({ kind: VariableValueKind.Decimal, coefficient: "-9223372036854775808", scale: 6 })),
      },
    })),
  } as const satisfies BusinessValue;
}

test("outputs of other shapes within the allowance stay inside the envelope reserved by the sentinel", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", fullAllowanceValue());
  const envelope = assessStartCapacityEnvelope(start, program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
  for (const output of [escapeHeavyAllowanceValue("\""), escapeHeavyAllowanceValue("\u0001"), nodeHeavyValue()]) {
    assert.ok(isSingletonBusinessItem(output));
    const actual = measureWithWorkflowEncoders(program, start, output);
    for (const budget of startCapacityEnvelopeBudgets) {
      assert.ok(actual[budget] <= envelope.estimates[budget],
        `${budget}: actual ${actual[budget]} exceeds the sentinel estimate ${envelope.estimates[budget]}`);
    }
  }
});
