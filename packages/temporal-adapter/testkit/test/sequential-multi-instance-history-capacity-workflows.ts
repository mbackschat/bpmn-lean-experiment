/** Private whole-topology Workflow used only to measure SMI host capacity before registration. */
import type {
  CompleteUserTaskInstanceStimulus,
  ProcessStartStimulus,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  BpmnWorkflowContinuationHostInputV1,
  BpmnWorkflowContinuationPublicationV1,
  BpmnWorkflowContinuationRecoveryV1,
  ExecutionPublicationPage,
  FlowNodeOccurrencePage,
  WorkflowChainRecoveryEntry,
  WorkflowTerminalResultV1,
} from "@bpmn-lean/temporal-protocol";
import {
  canonicalWorkflowChainJson,
  workflowChainCanonicalUtf8ByteLength,
} from "@bpmn-lean/temporal-protocol";
import {
  ApplicationFailure,
  CancellationScope,
  condition,
  continueAsNew,
  defineQuery,
  defineUpdate,
  isCancellation,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

export const sequentialMultiInstanceCapacityProbeWorkflowType =
  "sequentialMultiInstanceHistoryCapacityProbe";
export const sequentialMultiInstanceCapacityProbeUpdateName =
  "sequentialMultiInstanceHistoryCapacityUpdate";
export const sequentialMultiInstanceCapacityProbeReadinessQueryName =
  "sequentialMultiInstanceHistoryCapacityReadiness";

export const SequentialMultiInstanceCapacityProbeTopology = {
  Natural: "natural",
  Interrupted: "interrupted",
} as const;

export type SequentialMultiInstanceCapacityProbeTopology =
  typeof SequentialMultiInstanceCapacityProbeTopology[
    keyof typeof SequentialMultiInstanceCapacityProbeTopology
  ];

export type SequentialMultiInstanceCapacityProbeStaticPayload = Readonly<{
  continuation: {
    start: ProcessStartStimulus;
    program: SemanticProcessProgram;
    host: BpmnWorkflowContinuationHostInputV1;
    state: RuntimeState;
    recovery: BpmnWorkflowContinuationRecoveryV1;
    publication: BpmnWorkflowContinuationPublicationV1;
  };
  finalPublication: {
    execution: ExecutionPublicationPage;
    occurrences: FlowNodeOccurrencePage;
  };
  terminal: WorkflowTerminalResultV1;
}>;

export type SequentialMultiInstanceCapacityProbeCheckpoint = Readonly<{
  label: string;
  historyLength: number;
  historySize: number;
}>;

export type SequentialMultiInstanceCapacityProbeRun = Readonly<{
  runOrdinal: number;
  stableCheckpoints: readonly SequentialMultiInstanceCapacityProbeCheckpoint[];
  closingCanonicalPayloadBytes: number;
  largestActivationEvents: number;
  largestActivationCanonicalPayloadBytes: number;
}>;

export type SequentialMultiInstanceCapacityProbeReadiness = Readonly<{
  runOrdinal: number;
  acceptedUpdates: number;
  timerFired: boolean;
}>;

export type SequentialMultiInstanceCapacityProbeInput = Readonly<{
  topology: SequentialMultiInstanceCapacityProbeTopology;
  runOrdinal: number;
  staticPayload: SequentialMultiInstanceCapacityProbeStaticPayload;
  priorRuns: readonly SequentialMultiInstanceCapacityProbeRun[];
}>;

export type SequentialMultiInstanceCapacityProbeResult = Readonly<{
  topology: SequentialMultiInstanceCapacityProbeTopology;
  terminal: WorkflowTerminalResultV1;
  runs: readonly SequentialMultiInstanceCapacityProbeRun[];
}>;

const capacityUpdate = defineUpdate<
  WorkflowChainRecoveryEntry,
  [CompleteUserTaskInstanceStimulus]
>(sequentialMultiInstanceCapacityProbeUpdateName);
const readinessQuery = defineQuery<SequentialMultiInstanceCapacityProbeReadiness>(
  sequentialMultiInstanceCapacityProbeReadinessQueryName,
);

export async function sequentialMultiInstanceHistoryCapacityProbe(
  input: SequentialMultiInstanceCapacityProbeInput,
): Promise<SequentialMultiInstanceCapacityProbeResult> {
  requireInput(input);
  const checkpoints: SequentialMultiInstanceCapacityProbeCheckpoint[] = [];
  let previousHistoryLength = 0;
  let largestActivationEvents = 0;
  const inputCanonicalPayloadBytes = workflowChainCanonicalUtf8ByteLength(input);
  let largestActivationCanonicalPayloadBytes = inputCanonicalPayloadBytes;
  let currentActivationCanonicalPayloadBytes = inputCanonicalPayloadBytes;
  let currentActivationResultCanonicalPayloadBytes = 0;
  let acceptedUpdates = firstExpectedUpdateIndex(input);
  let timerFired = false;

  const capture = (label: string): void => {
    const info = workflowInfo();
    const activationEvents = info.historyLength - previousHistoryLength;
    if (activationEvents < 0) {
      throw ApplicationFailure.nonRetryable(
        "SMI capacity probe History length moved backwards",
        "SmiCapacityProbeHistoryInvalid",
      );
    }
    largestActivationEvents = Math.max(largestActivationEvents, activationEvents);
    previousHistoryLength = info.historyLength;
    checkpoints.push({
      label,
      historyLength: info.historyLength,
      historySize: info.historySize,
    });
  };

  setHandler(readinessQuery, () => ({
    runOrdinal: input.runOrdinal,
    acceptedUpdates,
    timerFired,
  }));
  setHandler(capacityUpdate, (stimulus) => {
    if (timerFired || acceptedUpdates >= finalExpectedUpdateIndex(input)) {
      throw ApplicationFailure.nonRetryable(
        "SMI capacity Update arrived outside its exact Run boundary",
        "SmiCapacityProbeUpdateInvalid",
      );
    }
    const recoveryResult = requireUpdate(input, stimulus, acceptedUpdates);
    currentActivationResultCanonicalPayloadBytes =
      workflowChainCanonicalUtf8ByteLength(recoveryResult);
    currentActivationCanonicalPayloadBytes =
      workflowChainCanonicalUtf8ByteLength(stimulus) +
      currentActivationResultCanonicalPayloadBytes;
    largestActivationCanonicalPayloadBytes = Math.max(
      largestActivationCanonicalPayloadBytes,
      currentActivationCanonicalPayloadBytes,
    );
    acceptedUpdates += 1;
    capture(`update-${acceptedUpdates}`);
    return recoveryResult;
  });

  capture("run-open");
  if (input.runOrdinal === 1) {
    capture("before-pre-arming-continue-as-new");
    return await continueWithMeasuredRun(input, checkpoints, {
      largestActivationEvents,
      largestActivationCanonicalPayloadBytes,
      currentActivationCanonicalPayloadBytes,
      currentActivationResultCanonicalPayloadBytes,
    }, 2);
  }
  if (input.runOrdinal === 4) {
    if (input.topology !== SequentialMultiInstanceCapacityProbeTopology.Interrupted) {
      throw ApplicationFailure.nonRetryable(
        "Natural SMI capacity topology cannot open Run 4",
        "SmiCapacityProbeTopologyInvalid",
      );
    }
    await condition(() => acceptedUpdates === 17);
    capture("before-escalation-terminal");
    return terminalResult(input, checkpoints, {
      largestActivationEvents,
      largestActivationCanonicalPayloadBytes,
      currentActivationCanonicalPayloadBytes,
      currentActivationResultCanonicalPayloadBytes,
    });
  }
  if (input.runOrdinal === 3) {
    if (input.topology !== SequentialMultiInstanceCapacityProbeTopology.Interrupted) {
      throw ApplicationFailure.nonRetryable(
        "Natural SMI capacity topology cannot open Run 3",
        "SmiCapacityProbeTopologyInvalid",
      );
    }
    await condition(() => acceptedUpdates === 16);
    capture("before-stale-refusal-continue-as-new");
    return await continueWithMeasuredRun(input, checkpoints, {
      largestActivationEvents,
      largestActivationCanonicalPayloadBytes,
      currentActivationCanonicalPayloadBytes,
      currentActivationResultCanonicalPayloadBytes,
    }, 4);
  }
  if (input.runOrdinal !== 2) {
    throw ApplicationFailure.nonRetryable(
      "SMI capacity probe Run ordinal is outside the reviewed topology",
      "SmiCapacityProbeTopologyInvalid",
    );
  }

  const timerScope = new CancellationScope({ cancellable: true });
  const timer = timerScope.run(() => sleep(1_000)).then(
    () => {
      timerFired = true;
      currentActivationCanonicalPayloadBytes = 0;
      currentActivationResultCanonicalPayloadBytes = 0;
      capture("timer-fired");
    },
    (error: unknown) => {
      if (!isCancellation(error)) {
        throw error;
      }
    },
  );
  if (input.topology === SequentialMultiInstanceCapacityProbeTopology.Natural) {
    await condition(() => acceptedUpdates === 16 || timerFired);
    if (timerFired) {
      throw ApplicationFailure.nonRetryable(
        "SMI natural capacity Timer fired before 16 sequential Updates",
        "SmiCapacityProbeTimerTooEarly",
      );
    }
    timerScope.cancel();
    await timer;
    capture("before-natural-terminal");
    return terminalResult(input, checkpoints, {
      largestActivationEvents,
      largestActivationCanonicalPayloadBytes,
      currentActivationCanonicalPayloadBytes,
      currentActivationResultCanonicalPayloadBytes,
    });
  }

  // Fifteen completions maximize the armed Run while leaving one planned item for interruption.
  await condition(() => acceptedUpdates === 15);
  await condition(() => timerFired);
  await timer;
  capture("before-interrupted-continue-as-new");
  return await continueWithMeasuredRun(input, checkpoints, {
    largestActivationEvents,
    largestActivationCanonicalPayloadBytes,
    currentActivationCanonicalPayloadBytes,
    currentActivationResultCanonicalPayloadBytes,
  }, 3);
}

type ActivationMaxima = Readonly<{
  largestActivationEvents: number;
  largestActivationCanonicalPayloadBytes: number;
  currentActivationCanonicalPayloadBytes: number;
  currentActivationResultCanonicalPayloadBytes: number;
}>;

async function continueWithMeasuredRun(
  input: SequentialMultiInstanceCapacityProbeInput,
  checkpoints: readonly SequentialMultiInstanceCapacityProbeCheckpoint[],
  maxima: ActivationMaxima,
  successorRunOrdinal: 2 | 3 | 4,
): Promise<never> {
  const baseRun = {
    runOrdinal: input.runOrdinal,
    stableCheckpoints: checkpoints,
    closingCanonicalPayloadBytes: 0,
    largestActivationEvents: maxima.largestActivationEvents,
    largestActivationCanonicalPayloadBytes:
      maxima.largestActivationCanonicalPayloadBytes,
  };
  const next = closeCanonicalFixedPoint(input, baseRun, {
    topology: input.topology,
    runOrdinal: successorRunOrdinal,
    staticPayload: input.staticPayload,
  }, maxima.currentActivationCanonicalPayloadBytes);
  return await continueAsNew<typeof sequentialMultiInstanceHistoryCapacityProbe>(
    next,
  );
}

function terminalResult(
  input: SequentialMultiInstanceCapacityProbeInput,
  checkpoints: readonly SequentialMultiInstanceCapacityProbeCheckpoint[],
  maxima: ActivationMaxima,
): SequentialMultiInstanceCapacityProbeResult {
  const baseRun = {
    runOrdinal: input.runOrdinal,
    stableCheckpoints: checkpoints,
    closingCanonicalPayloadBytes: 0,
    largestActivationEvents: maxima.largestActivationEvents,
    largestActivationCanonicalPayloadBytes:
      maxima.largestActivationCanonicalPayloadBytes,
  };
  let terminalBytes = 0;
  let result: SequentialMultiInstanceCapacityProbeResult;
  for (let index = 0; index < 8; index += 1) {
    const closingBytes = maxima.currentActivationResultCanonicalPayloadBytes +
      terminalBytes;
    const run = {
      ...baseRun,
      closingCanonicalPayloadBytes: closingBytes,
      largestActivationCanonicalPayloadBytes: Math.max(
        baseRun.largestActivationCanonicalPayloadBytes,
        maxima.currentActivationCanonicalPayloadBytes + terminalBytes,
      ),
    };
    result = {
      topology: input.topology,
      terminal: input.staticPayload.terminal,
      runs: [...input.priorRuns, run],
    };
    const measured = workflowChainCanonicalUtf8ByteLength(result);
    if (measured === terminalBytes) {
      return result;
    }
    terminalBytes = measured;
  }
  throw ApplicationFailure.nonRetryable(
    "SMI terminal capacity payload did not reach a canonical fixed point",
    "SmiCapacityProbePayloadInvalid",
  );
}

function closeCanonicalFixedPoint(
  input: SequentialMultiInstanceCapacityProbeInput,
  baseRun: SequentialMultiInstanceCapacityProbeRun,
  successor: Omit<SequentialMultiInstanceCapacityProbeInput, "priorRuns">,
  coResidentCanonicalPayloadBytes: number,
): MutableProbeInput {
  let closingBytes = 0;
  for (let index = 0; index < 8; index += 1) {
    const run = {
      ...baseRun,
      closingCanonicalPayloadBytes: closingBytes,
      largestActivationCanonicalPayloadBytes: Math.max(
        baseRun.largestActivationCanonicalPayloadBytes,
        coResidentCanonicalPayloadBytes + closingBytes,
      ),
    };
    const next: MutableProbeInput = {
      ...successor,
      priorRuns: [...input.priorRuns, run],
    };
    const measured = workflowChainCanonicalUtf8ByteLength(next);
    if (measured === closingBytes) {
      return next;
    }
    closingBytes = measured;
  }
  throw ApplicationFailure.nonRetryable(
    "SMI continuation capacity payload did not reach a canonical fixed point",
    "SmiCapacityProbePayloadInvalid",
  );
}

type MutableProbeInput = {
  topology: SequentialMultiInstanceCapacityProbeTopology;
  runOrdinal: number;
  staticPayload: SequentialMultiInstanceCapacityProbeStaticPayload;
  priorRuns: SequentialMultiInstanceCapacityProbeRun[];
};

function requireInput(input: SequentialMultiInstanceCapacityProbeInput): void {
  if (
    (input.topology !== SequentialMultiInstanceCapacityProbeTopology.Natural &&
      input.topology !== SequentialMultiInstanceCapacityProbeTopology.Interrupted) ||
    !Number.isSafeInteger(input.runOrdinal) ||
    input.runOrdinal < 1 ||
    input.runOrdinal > 4 ||
    input.priorRuns.length !== input.runOrdinal - 1
  ) {
    throw ApplicationFailure.nonRetryable(
      "Malformed SMI capacity probe input",
      "SmiCapacityProbeInputInvalid",
    );
  }
  canonicalWorkflowChainJson(input.staticPayload);
}

function requireUpdate(
  input: SequentialMultiInstanceCapacityProbeInput,
  stimulus: CompleteUserTaskInstanceStimulus,
  expectedIndex: number,
): WorkflowChainRecoveryEntry {
  const expectedCommandId = `complete-smi-history-capacity-${expectedIndex}`;
  const recoveryResult = input.staticPayload.terminal.entries.find(
    ({ commandId }) => commandId === expectedCommandId,
  );
  if (
    stimulus.commandId !== expectedCommandId ||
    recoveryResult === undefined ||
    recoveryResult.commandId !== expectedCommandId
  ) {
    throw ApplicationFailure.nonRetryable(
      "Malformed or out-of-order SMI capacity Update",
      "SmiCapacityProbeUpdateInvalid",
    );
  }
  return recoveryResult;
}

function firstExpectedUpdateIndex(
  input: SequentialMultiInstanceCapacityProbeInput,
): number {
  if (input.topology !== SequentialMultiInstanceCapacityProbeTopology.Interrupted) {
    return 0;
  }
  switch (input.runOrdinal) {
    case 3:
      return 15;
    case 4:
      return 16;
    default:
      return 0;
  }
}

function finalExpectedUpdateIndex(
  input: SequentialMultiInstanceCapacityProbeInput,
): number {
  if (input.runOrdinal === 1) {
    return 0;
  }
  if (
    input.topology === SequentialMultiInstanceCapacityProbeTopology.Interrupted &&
    input.runOrdinal === 2
  ) {
    return 15;
  }
  if (
    input.topology === SequentialMultiInstanceCapacityProbeTopology.Interrupted &&
    input.runOrdinal === 3
  ) {
    return 16;
  }
  return input.topology === SequentialMultiInstanceCapacityProbeTopology.Interrupted
    ? 17
    : 16;
}
