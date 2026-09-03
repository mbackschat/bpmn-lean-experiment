import {
  EffectOperation,
  EffectProtocol,
  EffectExecutionResultKind,
  isDenseArray,
  isVariableBinding,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  EffectExecutionResult,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import type {
  EffectActivityImplementationResult,
  EffectActivityImplementations,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";

export enum EffectExecutionSchedule {
  PlainSuccess = "plainSuccess",
  FailAfterMutationOnce = "failAfterMutationOnce",
  IncidentReportRetrySuccess = "incidentReportRetrySuccess",
  IncidentReportRetryFailure = "incidentReportRetryFailure",
  IncidentReportCancel = "incidentReportCancel",
}

export type EffectProbeEvidence = DeepReadonly<{
  invocations: number;
  mutations: number;
  keys: string[];
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
  ): Promise<EffectActivityImplementationResult> {
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
        return effectResultFor(request);
      case EffectExecutionSchedule.FailAfterMutationOnce:
        if (!wasMutated) {
          throw new Error(
            "Probe failed after external mutation and before completion acknowledgement",
          );
        }
        return effectResultFor(request);
      case EffectExecutionSchedule.IncidentReportRetrySuccess:
        return priorInvocations === 0
          ? { kind: "technicalFailure" }
          : effectResultFor(request);
      case EffectExecutionSchedule.IncidentReportRetryFailure:
      case EffectExecutionSchedule.IncidentReportCancel:
        return { kind: "technicalFailure" };
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

type EffectProbeRegistration = DeepReadonly<{
  request: EffectRequest;
  execute(request: EffectRequest): Promise<EffectActivityImplementationResult>;
}>;

/**
 * Routes harness Activity calls without placing scheduling controls in the Activity request.
 *
 * Registrations are keyed only by the committed-intent transport key. Concurrent registrations
 * for the same semantic effect are rejected because they cannot own independent stores safely.
 */
export class EffectProbeActivityRegistry {
  private readonly registrations =
    new Map<string, EffectProbeRegistration>();

  register(
    request: EffectRequest,
    execute: EffectProbeRegistration["execute"],
  ): void {
    requireEffectRequest(request);
    if (this.registrations.has(request.idempotencyKey)) {
      throw new Error(
        `Effect transport key already has an active probe registration: ${request.idempotencyKey}`,
      );
    }
    this.registrations.set(request.idempotencyKey, {
      request,
      execute,
    });
  }

  unregister(idempotencyKey: string): void {
    if (!this.registrations.delete(idempotencyKey)) {
      throw new Error(
        `Effect transport key has no active probe registration: ${idempotencyKey}`,
      );
    }
  }

  readonly activities: EffectActivityImplementations = {
    executeBpmnEffect: async (request) => {
      requireEffectRequest(request);
      const registration = this.registrations.get(
        request.idempotencyKey,
      );
      if (
        registration === undefined ||
        registration.request.protocol !== request.protocol ||
        registration.request.operation !== request.operation
      ) {
        throw new Error(
          `No exact probe registration exists for ${request.idempotencyKey}`,
        );
      }
      return registration.execute(request);
    },
  };
}

function requireEffectRequest(
  request: EffectRequest,
): void {
  if (request.protocol !== EffectProtocol.Activity) {
    throw new TypeError(
      "Effect request must contain one admitted protocol, operation, and argument contract",
    );
  }
  switch (request.operation) {
    case EffectOperation.Probe:
      requireArguments(request.arguments.length === 0);
      break;
    case EffectOperation.MappedSuccess:
      requireArguments(hasMappedSuccessArguments(request.arguments));
      break;
    case EffectOperation.MappedBoundaryError:
      requireArguments(hasMappedBoundaryErrorArguments(request.arguments));
      break;
    case EffectOperation.CompensationSingleEffect:
      requireArguments(hasCompensationSingleEffectArguments(request.arguments));
      break;
    default:
      throw new TypeError(
        "Effect request must contain one admitted protocol, operation, and argument contract",
      );
  }
  if (
    !/^effect-transport-sha256:[0-9a-f]{64}$/u.test(
      request.idempotencyKey,
    )
  ) {
    throw new TypeError(
      "Effect request must contain one content-bound transport key",
    );
  }
}

function effectResultFor(
  request: EffectRequest,
): EffectExecutionResult {
  if (request.operation === EffectOperation.MappedSuccess) {
    return {
      kind: EffectExecutionResultKind.Success,
      localPatch: [
        {
          name: "result",
          value: {
            kind: VariableValueKind.String,
            value: "example-result",
          },
        },
      ],
    };
  }
  if (request.operation === EffectOperation.MappedBoundaryError) {
    return {
      kind: EffectExecutionResultKind.BpmnError,
      code: "MappedBusinessError",
      message: "mapped business error",
      localPatch: [
        {
          name: "result",
          value: {
            kind: VariableValueKind.Null,
          },
        },
      ],
    };
  }
  return {
    kind: EffectExecutionResultKind.Success,
    localPatch: [],
  };
}

function hasCompensationSingleEffectArguments(
  arguments_: unknown,
): arguments_ is [] | [VariableBinding] {
  if (!isDenseArray(arguments_) || arguments_.length > 1) {
    return false;
  }
  const binding = arguments_[0];
  if (binding === undefined) {
    return true;
  }
  if (!isVariableBinding(binding)) {
    return false;
  }
  switch (binding.value.kind) {
    case VariableValueKind.Boolean:
    case VariableValueKind.String:
    case VariableValueKind.Null:
      return true;
    case VariableValueKind.Integer:
    case VariableValueKind.StringList:
      return false;
    default:
      return assertNever(binding.value);
  }
}

function hasMappedBoundaryErrorArguments(
  arguments_: ReadonlyArray<VariableBinding>,
): boolean {
  return arguments_.length === 1 &&
    arguments_[0]?.name === "requestValue" &&
    arguments_[0]?.value.kind === VariableValueKind.String &&
    arguments_[0]?.value.value === "example-input";
}

function hasMappedSuccessArguments(
  arguments_: ReadonlyArray<VariableBinding>,
): boolean {
  return arguments_.length === 1 &&
    arguments_[0]?.name === "requestValue" &&
    arguments_[0]?.value.kind === VariableValueKind.String &&
    arguments_[0]?.value.value === "example-input";
}

function requireArguments(condition: boolean): void {
  if (!condition) {
    throw new TypeError(
      "Effect request must contain one admitted protocol, operation, and argument contract",
    );
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported effect execution schedule: ${String(value)}`,
  );
}
