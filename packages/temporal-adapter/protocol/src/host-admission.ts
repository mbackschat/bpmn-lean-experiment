import {
  MessageChannelKind,
  SemanticOperationKind,
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
    return managedTotal === 1 &&
        operation !== undefined &&
        claimed.managed.isAdmissibleIsolatedForm(operation) &&
        !canSplitTokens &&
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
  BoundedScopeWait: "boundedScopeWait",
  MonitoredActivityWait: "monitoredActivityWait",
  SequentialMultiInstanceActivityWait: "sequentialMultiInstanceActivityWait",
  ParallelMultiInstanceActivityWait: "parallelMultiInstanceActivityWait",
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
  isAdmissibleIsolatedForm: (operation: SemanticOperation) => boolean;
  failure: TemporalHostAdmissionFailure;
}>;

const managedClasses: ReadonlyArray<ManagedHostClass> = [
  {
    operationClass: HostOperationClass.ManagedEventRace,
    isAdmissibleIsolatedForm: (operation) =>
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
    isAdmissibleIsolatedForm: (operation) =>
      operation.kind === SemanticOperationKind.AwaitBoundedUserTask &&
      operation.boundaryTimer.durationMs === 1_000,
    failure: {
      code: TemporalHostAdmissionFailureCode.BoundedActivitySchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated bounded User Task with an exact PT1S boundary Timer.",
    },
  },
  {
    operationClass: HostOperationClass.BoundedScopeWait,
    isAdmissibleIsolatedForm: (operation) =>
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
    isAdmissibleIsolatedForm: (operation) =>
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
    isAdmissibleIsolatedForm: (operation) =>
      operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask &&
      operation.boundaryTimer.durationMs === 1_000,
    failure: {
      code: TemporalHostAdmissionFailureCode
        .SequentialMultiInstanceSchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated sequential Multi-Instance User Task with one exact PT1S outer-lifetime boundary Timer.",
    },
  },
  {
    operationClass: HostOperationClass.ParallelMultiInstanceActivityWait,
    isAdmissibleIsolatedForm: (operation) =>
      operation.kind ===
        SemanticOperationKind.AwaitParallelMultiInstanceUserTask &&
      operation.boundaryTimer.durationMs === 1_000,
    failure: {
      code: TemporalHostAdmissionFailureCode
        .ParallelMultiInstanceSchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated parallel Multi-Instance User Task with one exact PT1S outer-lifetime boundary Timer.",
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
    // Passive because the host schedules nothing for it: its readiness is decided entirely inside the
    // semantic core from committed Process data, and it arms no deadline or host-visible effect.
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.ReachNoneEnd:
    case SemanticOperationKind.TerminateScope:
    case SemanticOperationKind.CompleteScope:
      return HostOperationClass.Passive;
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
      return HostOperationClass.SequentialMultiInstanceActivityWait;
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return HostOperationClass.ParallelMultiInstanceActivityWait;
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return HostOperationClass.Passive;
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported operation in Temporal host admission: ${String(value)}`,
  );
}
