import type {
  EffectDescriptor,
} from "@bpmn-lean/semantic-core";

export enum EffectExecutionSchedule {
  PlainSuccess = "plainSuccess",
  FailAfterMutationOnce = "failAfterMutationOnce",
}

export enum EffectExecutionResultKind {
  Success = "success",
}

export type EffectRequest = EffectDescriptor & Readonly<{
  idempotencyKey: string;
}>;

export type EffectExecutionResult = Readonly<{
  kind: EffectExecutionResultKind.Success;
}>;

export type EffectProbeEvidence = Readonly<{
  invocations: number;
  mutations: number;
  keys: ReadonlyArray<string>;
}>;

/**
 * Harness-owned external service simulation.
 *
 * Mutations survive a failed Activity attempt, while invocation counts expose retry behavior.
 * Each ordinary execution owns a fresh instance; only the cross-instance discriminator shares one.
 */
export class EffectProbeStore {
  private readonly invocationCountByKey = new Map<string, number>();
  private readonly mutatedKeys = new Set<string>();

  requireEmpty(): void {
    if (
      this.invocationCountByKey.size !== 0 ||
      this.mutatedKeys.size !== 0
    ) {
      throw new Error(
        "Effect probe store must be empty at execution start",
      );
    }
  }

  async execute(
    request: EffectRequest,
    schedule: EffectExecutionSchedule,
  ): Promise<EffectExecutionResult> {
    requireEffectRequest(request);
    const priorInvocations =
      this.invocationCountByKey.get(request.idempotencyKey) ?? 0;
    this.invocationCountByKey.set(
      request.idempotencyKey,
      priorInvocations + 1,
    );

    const wasMutated = this.mutatedKeys.has(request.idempotencyKey);
    if (!wasMutated) {
      this.mutatedKeys.add(request.idempotencyKey);
    }

    switch (schedule) {
      case EffectExecutionSchedule.PlainSuccess:
        return { kind: EffectExecutionResultKind.Success };
      case EffectExecutionSchedule.FailAfterMutationOnce:
        if (!wasMutated) {
          throw new Error(
            "Probe failed after external mutation and before completion acknowledgement",
          );
        }
        return { kind: EffectExecutionResultKind.Success };
      default:
        return assertNever(schedule);
    }
  }

  evidence(): EffectProbeEvidence {
    return {
      invocations: [...this.invocationCountByKey.values()].reduce(
        (total, count) => total + count,
        0,
      ),
      mutations: this.mutatedKeys.size,
      keys: [...this.mutatedKeys].sort(),
    };
  }
}

function requireEffectRequest(
  request: EffectRequest,
): void {
  if (
    request.protocol !== "urn:bpmn-lean:effect:probe-v1" ||
    request.handler !== "bpmnLeanEffectHandler" ||
    !/^effect-transport-sha256:[0-9a-f]{64}$/u.test(
      request.idempotencyKey,
    )
  ) {
    throw new TypeError(
      "Effect request must contain the admitted protocol, handler, and transport key",
    );
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported effect execution schedule: ${String(value)}`,
  );
}
