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
    ({ kind }) => kind === SemanticOperationKind.Duplicate,
  );
  const hasHostDrivenWait = program.operations.some(({ kind }) => {
    switch (kind) {
      case SemanticOperationKind.AwaitTimer:
      case SemanticOperationKind.AwaitEffect:
        return true;
      case SemanticOperationKind.Initiate:
      case SemanticOperationKind.EnterScope:
      case SemanticOperationKind.AwaitUserTask:
      case SemanticOperationKind.AwaitMessage:
      case SemanticOperationKind.Duplicate:
      case SemanticOperationKind.Synchronize:
      case SemanticOperationKind.Choose:
      case SemanticOperationKind.ThrowError:
      case SemanticOperationKind.ReachNoneEnd:
      case SemanticOperationKind.CompleteScope:
        return false;
      default:
        return assertNever(kind);
    }
  });
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

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported operation in Temporal host admission: ${String(value)}`,
  );
}
