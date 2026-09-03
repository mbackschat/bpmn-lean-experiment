import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
  MessageChannelKind,
  SemanticOperationKind,
  isWellFormedSemanticProcessProgram,
  profileAllowsProgramShape,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
} from "./contracts.js";
import type {
  TemporalHostAdmissionFailure,
  TemporalHostCapabilityResult,
} from "./contracts.js";

/**
 * Conservatively proves the current single-host-driven-wait contract.
 *
 * User Task and Message waits are passive ingress and may coexist. A token
 * split combined with a timer or effect can create more than one host-driven
 * branch, which requires a scheduler that this adapter does not implement.
 *
 * Every operation classified by `managedClasses` owns one scheduler instance.
 * Its entry binds the exact isolated form that scheduler proves and the typed
 * refusal returned for every other composition. Deadline-racing families keep
 * their own outcome and identity rules, including the sequential Multi-Instance
 * family whose outer deadline survives inner-task turnover. The host admits at
 * most one managed operation across all classes, so any composition needing a
 * second host-driven branch or scheduler is rejected before Workflow start.
 * The exact Compensation source checkpoint may retain its historical Parallel
 * split because semantic admission proves that it synchronizes before the throw.
 */
export function assessTemporalHostCapability(
  program: SemanticProcessProgram,
): TemporalHostCapabilityResult {
  const canSplitTokens = program.operations.some(
    ({ kind }) => classifyHostOperation(kind) === HostOperationClass.TokenSplit,
  );
  const hasHostDrivenWait = program.operations.some(
    ({ kind }) =>
      classifyHostOperation(kind) === HostOperationClass.HostDrivenWait,
  );
  const claimants = managedClasses.map((managed) => ({
    managed,
    operations: program.operations.filter(
      ({ kind }) => classifyHostOperation(kind) === managed.operationClass,
    ),
  }));
  // Each managed class owns one scheduler instance, so the host admits at most one managed
  // operation across every class. Counting per class would admit a race beside a bounded Activity
  // wait, which needs two schedulers this adapter does not run concurrently.
  const managedTotal = claimants.reduce(
    (total, { operations }) => total + operations.length,
    0,
  );
  const claimed = claimants.find(({ operations }) => operations.length > 0);
  if (claimed !== undefined) {
    const [operation] = claimed.operations;
    const isAdmissibleProgramForm = managedTotal === 1 &&
        operation !== undefined &&
        claimed.managed.isAdmissibleProgramForm(operation, program);
    return isAdmissibleProgramForm &&
        (!canSplitTokens || claimed.managed.allowsSynchronizedTokenSplit === true) &&
        !hasHostDrivenWait
      ? { kind: TemporalHostCapabilityResultKind.Admitted }
      : {
        kind: TemporalHostCapabilityResultKind.Rejected,
        failure: claimed.managed.failure,
      };
  }
  if (canSplitTokens && hasHostDrivenWait) {
    return {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code:
          TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits,
        evidence:
          "A token split can make a timer or effect wait concurrent with another semantic branch.",
      },
    };
  }
  return { kind: TemporalHostCapabilityResultKind.Admitted };
}

const HostOperationClass = {
  Passive: "passive",
  TokenSplit: "tokenSplit",
  HostDrivenWait: "hostDrivenWait",
  ManagedEventRace: "managedEventRace",
  BoundedActivityWait: "boundedActivityWait",
  MessageBoundedActivityWait: "messageBoundedActivityWait",
  BoundedScopeWait: "boundedScopeWait",
  MonitoredActivityWait: "monitoredActivityWait",
  SequentialMultiInstanceActivityWait: "sequentialMultiInstanceActivityWait",
  ParallelMultiInstanceActivityWait: "parallelMultiInstanceActivityWait",
  CorrelatedMessageWait: "correlatedMessageWait",
  CompensationTrigger: "compensationTrigger",
} as const;

type HostOperationClass =
  typeof HostOperationClass[keyof typeof HostOperationClass];

/**
 * One managed class: which operations claim its scheduler, the isolated form that scheduler proves,
 * and the identity an operator receives when the claim is refused.
 *
 * Declaration order decides which refusal a program claiming two managed classes reports, so the
 * operator is told about the first class present rather than an arbitrary one.
 */
type ManagedHostClass = Readonly<{
  operationClass: HostOperationClass;
  isAdmissibleProgramForm: (
    operation: SemanticOperation,
    program: SemanticProcessProgram,
  ) => boolean;
  allowsSynchronizedTokenSplit?: true;
  failure: TemporalHostAdmissionFailure;
}>;

const managedClasses: ReadonlyArray<ManagedHostClass> = [
  {
    operationClass: HostOperationClass.CompensationTrigger,
    isAdmissibleProgramForm: (operation, program) =>
      operation.kind === SemanticOperationKind.TriggerCompensation &&
      program.identity.semanticProfile ===
        COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID &&
      isWellFormedSemanticProcessProgram(program) &&
      profileAllowsProgramShape(
        program.identity.semanticProfile,
        program.operations,
        program.definitionScopes.length,
      ),
    // The approved hosting preflight permits this one historical split only because the exact
    // checkpoint Program synchronizes it before the throw; see COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md.
    allowsSynchronizedTokenSplit: true,
    failure: {
      code: TemporalHostAdmissionFailureCode.CompensationSchedulerUnavailable,
      evidence:
        "The Temporal host admits Compensation scheduling only for the exact well-formed source checkpoint without another host-driven wait.",
    },
  },
  {
    operationClass: HostOperationClass.CorrelatedMessageWait,
    isAdmissibleProgramForm: (operation, program) =>
      operation.kind === SemanticOperationKind.AwaitCorrelatedPayloadMessage &&
      program.identity.semanticProfile ===
        MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID &&
      isWellFormedSemanticProcessProgram(program) &&
      profileAllowsProgramShape(
        program.identity.semanticProfile,
        program.operations,
        program.definitionScopes.length,
      ),
    failure: {
      code: TemporalHostAdmissionFailureCode.CorrelatedMessageIngressUnavailable,
      evidence:
        "The Temporal host admits only one isolated correlated payload Message wait under the registered Message-key correlation profile.",
    },
  },
  {
    operationClass: HostOperationClass.ManagedEventRace,
    isAdmissibleProgramForm: (operation) =>
      operation.kind === SemanticOperationKind.AwaitEventRace &&
      operation.message.channel.kind === MessageChannelKind.OperationMessage &&
      operation.timer.durationMs === 1_000,
    failure: {
      code: TemporalHostAdmissionFailureCode.EventRaceSchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated operation-addressed Message/PT1S managed race.",
    },
  },
  {
    operationClass: HostOperationClass.BoundedActivityWait,
    isAdmissibleProgramForm: (operation) =>
      operation.kind === SemanticOperationKind.AwaitBoundedUserTask &&
      operation.boundaryTimer.durationMs === 1_000,
    failure: {
      code: TemporalHostAdmissionFailureCode.BoundedActivitySchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated bounded User Task with an exact PT1S boundary Timer.",
    },
  },
  {
    operationClass: HostOperationClass.MessageBoundedActivityWait,
    isAdmissibleProgramForm: (operation) =>
      operation.kind === SemanticOperationKind.AwaitMessageBoundedUserTask &&
      operation.boundaryMessage.channel.kind ===
        MessageChannelKind.OperationMessage,
    failure: {
      code: TemporalHostAdmissionFailureCode
        .MessageBoundedActivitySchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated User Task with one operation-addressed payload-free interrupting Message boundary.",
    },
  },
  {
    operationClass: HostOperationClass.BoundedScopeWait,
    isAdmissibleProgramForm: (operation) =>
      operation.kind === SemanticOperationKind.EnterBoundedScope &&
      operation.boundaryTimer.durationMs === 1_000,
    failure: {
      code: TemporalHostAdmissionFailureCode.BoundedScopeSchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated bounded Sub-Process scope with an exact PT1S boundary Timer.",
    },
  },
  {
    operationClass: HostOperationClass.MonitoredActivityWait,
    isAdmissibleProgramForm: (operation) =>
      operation.kind === SemanticOperationKind.AwaitMonitoredUserTask &&
      operation.boundaryTimer.durationMs === 1_000,
    failure: {
      code: TemporalHostAdmissionFailureCode.MonitoredActivitySchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated monitored User Task with an exact PT1S non-interrupting boundary Timer.",
    },
  },
  {
    operationClass: HostOperationClass.SequentialMultiInstanceActivityWait,
    isAdmissibleProgramForm: (operation) =>
      operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask &&
      operation.boundaryTimer.durationMs === 5_000,
    failure: {
      code: TemporalHostAdmissionFailureCode
        .SequentialMultiInstanceSchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated sequential Multi-Instance User Task with one exact PT5S outer-lifetime boundary Timer.",
    },
  },
  {
    operationClass: HostOperationClass.ParallelMultiInstanceActivityWait,
    isAdmissibleProgramForm: (operation) =>
      operation.kind ===
        SemanticOperationKind.AwaitParallelMultiInstanceUserTask &&
      operation.boundaryTimer.durationMs === 5_000,
    failure: {
      code: TemporalHostAdmissionFailureCode
        .ParallelMultiInstanceSchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated parallel Multi-Instance User Task with one exact PT5S outer-lifetime boundary Timer.",
    },
  },
];

function classifyHostOperation(
  kind: SemanticOperationKind,
): HostOperationClass {
  switch (kind) {
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.SelectMany:
      return HostOperationClass.TokenSplit;
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect:
      return HostOperationClass.HostDrivenWait;
    case SemanticOperationKind.AwaitEventRace:
      return HostOperationClass.ManagedEventRace;
    case SemanticOperationKind.AwaitBoundedUserTask:
      return HostOperationClass.BoundedActivityWait;
    case SemanticOperationKind.AwaitMessageBoundedUserTask:
      return HostOperationClass.MessageBoundedActivityWait;
    case SemanticOperationKind.EnterBoundedScope:
      return HostOperationClass.BoundedScopeWait;
    // Managed rather than a token split, even though firing creates a second live branch: the split
    // is semantic and has no `duplicate` operation to declare it, so `canSplitTokens` is silent here
    // by construction. Its silence is not evidence, and the class is assigned from the deadline this
    // operation owns rather than from that predicate.
    case SemanticOperationKind.AwaitMonitoredUserTask:
      return HostOperationClass.MonitoredActivityWait;
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.InvokeProcess:
    case SemanticOperationKind.ReturnProcess:
    case SemanticOperationKind.AwaitUserTask:
    // Passive for the plain reason: entry consumes a token and arms no deadline, and the declared
    // OutputSet becomes an obligation only once a completion command arrives.
    case SemanticOperationKind.AwaitDataOutputUserTask:
    // Passive because the host schedules nothing for it: its readiness is decided entirely inside the
    // semantic core from committed Process data, and it arms no deadline or host-visible effect.
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitPayloadMessage:
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.ReachNoneEnd:
    case SemanticOperationKind.TerminateScope:
    case SemanticOperationKind.CompleteScope:
      return HostOperationClass.Passive;
    case SemanticOperationKind.AwaitCorrelatedPayloadMessage:
      return HostOperationClass.CorrelatedMessageWait;
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
      return HostOperationClass.SequentialMultiInstanceActivityWait;
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return HostOperationClass.ParallelMultiInstanceActivityWait;
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return HostOperationClass.Passive;
    case SemanticOperationKind.TriggerCompensation:
      return HostOperationClass.CompensationTrigger;
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported operation in Temporal host admission: ${String(value)}`,
  );
}
