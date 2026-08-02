import {
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
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.EnterScope:
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
