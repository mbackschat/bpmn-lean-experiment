/**
 * Drives one capacity journey through the real Workflow encoders and reports the worst bytes each Start envelope
 * budget measured, so the envelope's estimates can be checked against owners it never sees.
 *
 * Shared by the portable-handoff and effect-data envelope tests. Only stimuli the Workflow records for external
 * recovery enter the ledger; a host-derived `CompleteEffect` does not, which the envelope's estimate over-counts.
 */
import assert from "node:assert/strict";

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
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  bpmnWorkflowPublicationSegmentsV1,
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
  isExternallyRecoverableStimulus,
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

export type MeasuredStartCapacity = Readonly<Record<StartCapacityEnvelopeBudget, number>>;

/** Every budget's measured bytes after the maximal journey, taken from the Workflow-side owners. */
export function measureWithWorkflowEncoders(
  program: SemanticProcessProgram,
  start: StartProcessStimulus,
  completions: ReadonlyArray<Stimulus>,
): MeasuredStartCapacity {
  const instanceId = start.instanceId;
  const stimuli: Stimulus[] = [start, ...completions];
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
    if (stimulus.kind !== StimulusKind.StartProcess) {
      raise(WorkflowChainBudgetKind.SemanticStimulusBytes, bytes(stimulus));
    }
    if (isExternallyRecoverableStimulus(stimulus)) {
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

/**
 * A Map of Strings in `character`, each at most the 1,024-byte text bound, filled to exactly the per-value
 * allowance with a final ASCII entry. Escaped characters cost several canonical bytes per raw byte, so these
 * separate an envelope that measures canonical bytes from host encoders that might re-escape or wrap values.
 */
export function escapeHeavyAllowanceValue(character: string): BusinessValue {
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
export function nodeHeavyValue(): BusinessValue {
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
