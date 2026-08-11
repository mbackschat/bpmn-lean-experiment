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
 * Four operation classes are managed rather than passive, each owning one
 * scheduler instance: the Event-Based Gateway race, the bounded User Task, the
 * bounded Sub-Process scope, and the monitored User Task whose deadline spawns
 * a branch without ending it. The first three race a deadline against an end;
 * the fourth races it against a withdrawal, which is a different outcome under
 * the same undefined activation order. The host admits at most one managed
 * operation across all four classes, so a race
 * beside a bounded Activity wait is rejected even though each alone is
 * admissible. Every composition needing a second host-driven branch or a second
 * managed scheduler is rejected before Workflow start, with one typed code per
 * class.
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
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported operation in Temporal host admission: ${String(value)}`,
  );
}
