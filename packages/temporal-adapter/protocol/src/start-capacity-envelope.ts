/**
 * Pre-start aggregate capacity envelope of the portable handoff profile.
 *
 * Every per-value bound is already enforced, but one admitted root value is copied into committed state, the
 * paired publication batch, the selected-Run Query response, the terminal envelope and every Continue-As-New
 * argument, so component limits alone cannot show that the successful journey fits. The envelope runs that
 * journey through the real semantic core with each permitted future output at its full per-value allowance, and
 * sums the genuine semantic-core artifacts each hosted budget measures. A structure only the Workflow host can
 * encode (revision numbering, page and snapshot wrappers, directories) is covered by a named, documented
 * bookkeeping allowance whose soundness is checked against the real encoders by the Workflow package's tests.
 *
 * The estimate is deliberately conservative: it counts every structural copy the capsule enumerates and never
 * subtracts one. See the [capacity admission](../../../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#capacity-admission)
 * rule. It reserves the two-completion business path only; retries, command history and Run longevity stay
 * bounded by their own policies and the typed host capacity failure.
 */
import {
  CommandOutcome,
  SemanticProfileId,
  projectOpenFlowNodeOccurrences,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  ProcessStartStimulus,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { runStartCapacityJourney } from "./start-capacity-journey.js";
import type { StartCapacityJourney } from "./start-capacity-journey.js";
import {
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength as measured,
  workflowChainProductionLimit,
} from "./workflow-chain.js";
import type { WorkflowChainRecoveryEntry } from "./workflow-chain.js";

/**
 * The hosted budgets whose measured artifact carries a copy of the journey's values or identifiers. Event History
 * bytes (8 MiB per Run) and the semantic input queue (256 KiB) also carry copies, but the journey's Run history
 * and its at most two queued completions of about 17 KB each stay far below them, so they need no estimate here.
 */
export const startCapacityEnvelopeBudgets = [
  WorkflowChainBudgetKind.SemanticProcessProgramBytes,
  WorkflowChainBudgetKind.InitialStartStimulusBytes,
  WorkflowChainBudgetKind.SemanticStimulusBytes,
  WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
  WorkflowChainBudgetKind.PublicationBatchBytes,
  WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes,
  WorkflowChainBudgetKind.QueryResponseBytes,
  WorkflowChainBudgetKind.TerminalResultEnvelopeBytes,
  WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes,
  WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
  WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes,
] as const;

export type StartCapacityEnvelopeBudget = typeof startCapacityEnvelopeBudgets[number];

export type StartCapacityEnvelopeLimits = Readonly<Record<StartCapacityEnvelopeBudget, number>>;
export type StartCapacityEstimates = Readonly<Record<StartCapacityEnvelopeBudget, number>>;

/**
 * Non-value bytes a budget's artifact carries beyond the semantic-core parts the envelope sums: `fixedBytes` for
 * wrapper keys and numbering, plus the number of host-only copies of the instance and of the longest command
 * identifier. The semantic-core parts already count the copies they contain.
 */
export type StartCapacityBookkeepingAllowance = Readonly<{
  fixedBytes: number;
  instanceIdCopies: number;
  commandIdCopies: number;
}>;

const exactArtifact = { fixedBytes: 0, instanceIdCopies: 0, commandIdCopies: 0 } as const;

/**
 * One allowance per budget. A zero entry means the Workflow measures the semantic-core artifact itself. The others
 * were sized with headroom over the overhead the real Workflow encoders added for the retained handoff model, with a
 * short, a long instance ID and a long Start command ID; the Workflow package's test fails if an encoder outgrows
 * its allowance.
 */
export const startCapacityBookkeepingAllowance = {
  [WorkflowChainBudgetKind.SemanticProcessProgramBytes]: exactArtifact,
  [WorkflowChainBudgetKind.InitialStartStimulusBytes]: exactArtifact,
  [WorkflowChainBudgetKind.SemanticStimulusBytes]: exactArtifact,
  [WorkflowChainBudgetKind.CommittedRuntimeStateBytes]: exactArtifact,
  /**
   * Revision numbering, epoch and the pair's wrapper keys, the owner instance ID the host adds to each of the Start
   * batch's two occurrence lifecycles, and the command ID of each of the two batches.
   */
  [WorkflowChainBudgetKind.PublicationBatchBytes]: { fixedBytes: 1_024, instanceIdCopies: 2, commandIdCopies: 2 },
  /** Publication fold wrappers and one segment-directory descriptor; the host input's own copies are explicit. */
  [WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes]:
    { fixedBytes: 2_048, instanceIdCopies: 6, commandIdCopies: 0 },
  /** Echoed request, snapshot and both page wrappers, and the command ID of each of the Run's three batches. */
  [WorkflowChainBudgetKind.QueryResponseBytes]: { fixedBytes: 4_096, instanceIdCopies: 16, commandIdCopies: 6 },
  /** Envelope and receipt wrapper keys. */
  [WorkflowChainBudgetKind.TerminalResultEnvelopeBytes]: { fixedBytes: 1_024, instanceIdCopies: 2, commandIdCopies: 0 },
  /** Host input, recovery wrapper and publication continuation, summed once for the three arguments. */
  [WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes]:
    { fixedBytes: 4_096, instanceIdCopies: 6, commandIdCopies: 0 },
  /** The rebuilt entries carry the longest outcome, so the Workflow's recorded ledger can only be smaller. */
  [WorkflowChainBudgetKind.CommandRecoveryLedgerBytes]: exactArtifact,
  /** Per-batch framing of the retained execution, occurrence and trace arrays, and each batch's command ID. */
  [WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes]:
    { fixedBytes: 4_096, instanceIdCopies: 8, commandIdCopies: 6 },
} as const satisfies Record<StartCapacityEnvelopeBudget, StartCapacityBookkeepingAllowance>;

export enum StartCapacityEnvelopeResultKind {
  /** The Program's profile does not select the portable handoff, so the envelope admits it unchanged. */
  NotApplicable = "notApplicable",
  WithinCapacity = "withinCapacity",
  Exceeded = "exceeded",
}

export type StartCapacityEnvelopeFailure = Readonly<{
  budget: StartCapacityEnvelopeBudget;
  configuredBound: number;
  estimatedValue: number;
}>;

export type StartCapacityEnvelopeResult =
  | Readonly<{ kind: StartCapacityEnvelopeResultKind.NotApplicable }>
  | Readonly<{
      kind: StartCapacityEnvelopeResultKind.WithinCapacity;
      estimates: StartCapacityEstimates;
    }>
  | Readonly<{
      kind: StartCapacityEnvelopeResultKind.Exceeded;
      failure: StartCapacityEnvelopeFailure;
      estimates: StartCapacityEstimates;
    }>;

export function productionStartCapacityEnvelopeLimits(): StartCapacityEnvelopeLimits {
  return Object.fromEntries(
    startCapacityEnvelopeBudgets.map((budget) => [budget, workflowChainProductionLimit(budget)]),
  ) as StartCapacityEnvelopeLimits;
}

/**
 * Decides before Workflow creation whether the successful portable-handoff journey fits every hosted budget.
 *
 * The caller has already admitted `start` against `program`. Limits may only be lowered from production, which
 * is how tests locate the exact boundary. Throws when the admitted Program does not offer the journey.
 */
export function assessStartCapacityEnvelope(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  limits: StartCapacityEnvelopeLimits = productionStartCapacityEnvelopeLimits(),
): StartCapacityEnvelopeResult {
  if (program.identity.semanticProfile !== SemanticProfileId.PortableBusinessValuesHandoff) {
    return { kind: StartCapacityEnvelopeResultKind.NotApplicable };
  }
  const configured = requireLimits(limits);
  const estimates = estimateStartCapacity(start, program, runStartCapacityJourney(start, program));
  const exceeded = startCapacityEnvelopeBudgets.find((budget) => estimates[budget] > configured[budget]);
  return exceeded === undefined
    ? { kind: StartCapacityEnvelopeResultKind.WithinCapacity, estimates }
    : {
        kind: StartCapacityEnvelopeResultKind.Exceeded,
        failure: {
          budget: exceeded,
          configuredBound: configured[exceeded],
          estimatedValue: estimates[exceeded],
        },
        estimates,
      };
}

/** The operator-facing evidence naming the exceeded budget, its bound and the estimate. */
export function startCapacityEnvelopeEvidence(failure: StartCapacityEnvelopeFailure): string {
  return `The successful portable-handoff journey is estimated at ${failure.estimatedValue} canonical UTF-8 bytes ` +
    `for ${failure.budget}, above its ${failure.configuredBound}-byte bound; no Workflow was started.`;
}

type Journey = DeepReadonly<{
  start: ProcessStartStimulus;
  program: SemanticProcessProgram;
  journey: StartCapacityJourney;
}>;

function estimateStartCapacity(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  journey: StartCapacityJourney,
): StartCapacityEstimates {
  const subject: Journey = { start, program, journey };
  const instanceWeight = measured(start.instanceId) + measured(program.processId);
  const commandWeight = longestCommandId(subject);
  return Object.fromEntries(startCapacityEnvelopeBudgets.map((budget) => {
    const { fixedBytes, instanceIdCopies, commandIdCopies } = startCapacityBookkeepingAllowance[budget];
    return [
      budget,
      artifactBytes(budget, subject) + fixedBytes + instanceIdCopies * instanceWeight +
        commandIdCopies * commandWeight,
    ];
  })) as StartCapacityEstimates;
}

/**
 * The semantic-core artifacts one budget measures, in bytes, before any bookkeeping allowance.
 *
 * Copy counts follow the capsule: committed state holds at most three value roots; a paired batch carries one in
 * its stimulus; the Query echoes the snapshot, returns the current and every batch of the Run; a successor
 * carries state, current and the original Start.
 */
function artifactBytes(budget: StartCapacityEnvelopeBudget, subject: Journey): number {
  const { start, program, journey } = subject;
  const steps = journey.steps;
  switch (budget) {
    case WorkflowChainBudgetKind.SemanticProcessProgramBytes:
      return measured(program);
    case WorkflowChainBudgetKind.InitialStartStimulusBytes:
      return measured(start);
    case WorkflowChainBudgetKind.SemanticStimulusBytes:
      return largest(steps.slice(1).map(({ stimulus }) => measured(stimulus)));
    case WorkflowChainBudgetKind.CommittedRuntimeStateBytes:
      return largest(steps.map(({ committed }) => measured(committed.state)));
    case WorkflowChainBudgetKind.PublicationBatchBytes:
      return largest(steps.map((_, index) => measured(batchParts(subject, index, index + 1))));
    case WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes:
      return largest([0, 1].flatMap((index) => [
        measured(publicationContinuationParts(subject, index)),
        measured(hostContinuationParts(subject)),
      ]));
    case WorkflowChainBudgetKind.QueryResponseBytes:
      return largest(steps.map((_, index) => measured(queryParts(subject, index))));
    case WorkflowChainBudgetKind.TerminalResultEnvelopeBytes:
      return measured([terminalObservation(subject), program.identity, ledgerEntries(subject, 2)]);
    case WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes:
      return largest([0, 1].map((index) => successorBytes(subject, index)));
    case WorkflowChainBudgetKind.CommandRecoveryLedgerBytes:
      return measured(ledgerEntries(subject, 2));
    case WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes:
      return measured(batchParts(subject, 0, steps.length).concat(steps.flatMap(
        ({ committed }) => [committed.observations],
      )));
    default:
      return assertNever(budget);
  }
}

/** Transition and lifecycle records of the commands in `[from, to)`, which the paired batches number and wrap. */
function batchParts(subject: Journey, from: number, to: number): unknown[] {
  return subject.journey.steps.slice(from, to).flatMap(({ committed }) => [
    requirePublication(committed).transitions,
    committed.flowNodeOccurrenceLifecycles,
  ]);
}

/** The Query echoes the snapshot and returns the current, the open sets and every batch up to the head. */
function queryParts(subject: Journey, headIndex: number): unknown[] {
  const head = subject.journey.steps[headIndex];
  if (head === undefined) throw new TypeError("Capacity journey has no such head");
  const current = requirePublication(head.committed).current;
  return [
    current,
    current,
    openSet(subject, headIndex),
    openSet(subject, headIndex),
    ...batchParts(subject, 0, headIndex + 1),
    subject.program.identity,
    subject.program.identity,
    subject.program.identity,
  ];
}

function publicationContinuationParts(subject: Journey, headIndex: number): unknown[] {
  const head = subject.journey.steps[headIndex];
  if (head === undefined) throw new TypeError("Capacity journey has no such head");
  return [
    requirePublication(head.committed).current,
    openSet(subject, headIndex),
    openSet(subject, headIndex),
    subject.program.identity,
    subject.program.identity,
  ];
}

function hostContinuationParts(subject: Journey): unknown[] {
  return [subject.program.identity, subject.program.processId, subject.start.instanceId, subject.start.commandId];
}

/** Everything one successor Run carries after the command at `headIndex` left the Process at a wait. */
function successorBytes(subject: Journey, headIndex: number): number {
  const head = subject.journey.steps[headIndex];
  if (head === undefined) throw new TypeError("Capacity journey has no such head");
  return measured(subject.start) + measured(subject.program) +
    measured(hostContinuationParts(subject)) +
    measured(head.committed.state) +
    measured(ledgerEntries(subject, headIndex)) +
    measured(publicationContinuationParts(subject, headIndex));
}

function openSet(subject: Journey, headIndex: number): unknown {
  const head = subject.journey.steps[headIndex];
  const open = head === undefined ? null : projectOpenFlowNodeOccurrences(subject.program, head.committed.state);
  if (open === null) throw new TypeError("Capacity journey state has no open occurrence projection");
  return open;
}

function terminalObservation(subject: Journey): unknown {
  const last = subject.journey.steps.at(-1)?.committed.observations.at(-1);
  if (last === undefined) throw new TypeError("Capacity journey has no terminal observation");
  return last;
}

/**
 * The recovery ledger after `count` completions, each entry carrying the reserved command ID and the longest
 * outcome so that the estimate covers any outcome the Workflow could record.
 */
function ledgerEntries(subject: Journey, count: number): WorkflowChainRecoveryEntry[] {
  const longest = Object.values(CommandOutcome).reduce((best, outcome) =>
    outcome.length > best.length ? outcome : best
  );
  return subject.journey.steps.slice(1, 1 + count).map(({ stimulus }) => ({
    commandId: stimulusCommandId(stimulus),
    stimulusSha256: "0".repeat(64),
    outcome: longest,
  }));
}

/** The Start's command ID is caller-chosen, the future ones are the reserved length; the longer bounds a batch. */
function longestCommandId(subject: Journey): number {
  return largest(subject.journey.steps.map(({ stimulus }) => measured(stimulusCommandId(stimulus))));
}

function requirePublication(
  committed: StartCapacityJourney["steps"][number]["committed"],
) {
  if (committed.publication === null || committed.flowNodeOccurrenceLifecycles === null) {
    throw new TypeError("Capacity journey step has no publication");
  }
  return committed.publication;
}

function largest(values: ReadonlyArray<number>): number {
  return values.reduce((best, value) => Math.max(best, value), 0);
}

function requireLimits(limits: StartCapacityEnvelopeLimits): StartCapacityEnvelopeLimits {
  for (const budget of startCapacityEnvelopeBudgets) {
    const value = limits[budget];
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${budget} limit must be a positive safe integer`);
    }
    if (value > workflowChainProductionLimit(budget)) {
      throw new RangeError(`${budget} limit exceeds production`);
    }
  }
  return { ...limits };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported capacity-envelope budget: ${String(value)}`);
}
