import {
  MessageChannelKind,
  SemanticOperationKind,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
} from "./contracts.js";
import type {
  TemporalHostCapabilityResult,
} from "./contracts.js";

/**
 * Conservatively proves the current single-host-driven-wait contract.
 *
 * User Task and Message waits are passive ingress and may coexist. A token
 * split combined with a timer or effect can create more than one host-driven
 * branch, which requires a scheduler that this adapter does not implement.
 *
 * Two operation classes are managed rather than passive, each owning one
 * scheduler instance: the Event-Based Gateway race and the bounded User Task
 * with its interrupting boundary Timer. The host admits at most one managed
 * operation across both classes, so a race beside a bounded Activity wait is
 * rejected even though each alone is admissible. Every composition needing a
 * second host-driven branch or a second managed scheduler is rejected before
 * Workflow start, with one typed code per class.
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
  const managedEventRaces = program.operations.filter(
    ({ kind }) =>
      classifyHostOperation(kind) === HostOperationClass.ManagedEventRace,
  );
  const boundedActivityWaits = program.operations.filter(
    ({ kind }) =>
      classifyHostOperation(kind) === HostOperationClass.BoundedActivityWait,
  );
  // Each managed class owns one scheduler instance, so the host admits at most one managed
  // operation across both classes. Checking the classes independently would admit a race beside a
  // bounded Activity wait, which needs two schedulers this adapter does not run concurrently.
  const managedTotal = managedEventRaces.length + boundedActivityWaits.length;
  if (managedEventRaces.length > 0) {
    const [race] = managedEventRaces;
    if (
      managedTotal === 1 &&
      race?.kind === SemanticOperationKind.AwaitEventRace &&
      race.message.channel.kind === MessageChannelKind.OperationMessage &&
      race.timer.durationMs === 1_000 &&
      !canSplitTokens &&
      !hasHostDrivenWait
    ) {
      return { kind: TemporalHostCapabilityResultKind.Admitted };
    }
    return {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code:
          TemporalHostAdmissionFailureCode.EventRaceSchedulerUnavailable,
        evidence:
          "The Temporal host admits only one isolated operation-addressed Message/PT1S managed race.",
      },
    };
  }
  if (boundedActivityWaits.length > 0) {
    const [bounded] = boundedActivityWaits;
    if (
      managedTotal === 1 &&
      bounded?.kind === SemanticOperationKind.AwaitBoundedUserTask &&
      bounded.boundaryTimer.durationMs === 1_000 &&
      !canSplitTokens &&
      !hasHostDrivenWait
    ) {
      return { kind: TemporalHostCapabilityResultKind.Admitted };
    }
    return {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code:
          TemporalHostAdmissionFailureCode.BoundedActivitySchedulerUnavailable,
        evidence:
          "The Temporal host admits only one isolated bounded User Task with an exact PT1S boundary Timer.",
      },
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
} as const;

type HostOperationClass =
  typeof HostOperationClass[keyof typeof HostOperationClass];

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
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.InvokeProcess:
    case SemanticOperationKind.ReturnProcess:
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.ReachNoneEnd:
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
