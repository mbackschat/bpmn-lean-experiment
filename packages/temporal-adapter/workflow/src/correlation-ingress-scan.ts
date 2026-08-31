import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";

import {
  CorrelationCandidateScanResultKind,
  bpmnBeginCorrelationCandidateScanUpdateName,
  bpmnFinishCorrelationCandidateScanUpdateName,
  requireCorrelationCandidateScanActivityRequest,
  requireCorrelationCandidateScanCompletion,
  requireCorrelationCandidateScanRequest,
  sameCorrelationCandidateScanCompletion,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnBeginCorrelationCandidateScanUpdateArguments,
  BpmnFinishCorrelationCandidateScanUpdateArguments,
  CorrelationCandidateRegistrationState,
  CorrelationCandidateScanActivities,
  CorrelationCandidateScanActivityRequest,
  CorrelationCandidateScanBeginResult,
  CorrelationCandidateScanCompletion,
  CorrelationCandidateScanFinishResult,
  CorrelationCandidateScanRequest,
  CorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";

import {
  beginCorrelationCandidateScan,
  finishCorrelationCandidateScan,
} from "./correlation-candidate-registration.js";

export const bpmnBeginCorrelationCandidateScanUpdate: ReturnType<
  typeof defineUpdate<
    CorrelationCandidateScanBeginResult,
    BpmnBeginCorrelationCandidateScanUpdateArguments
  >
> = defineUpdate<
  CorrelationCandidateScanBeginResult,
  BpmnBeginCorrelationCandidateScanUpdateArguments
>(bpmnBeginCorrelationCandidateScanUpdateName);

export const bpmnFinishCorrelationCandidateScanUpdate: ReturnType<
  typeof defineUpdate<
    CorrelationCandidateScanFinishResult,
    BpmnFinishCorrelationCandidateScanUpdateArguments
  >
> = defineUpdate<
  CorrelationCandidateScanFinishResult,
  BpmnFinishCorrelationCandidateScanUpdateArguments
>(bpmnFinishCorrelationCandidateScanUpdateName);

type ResolveCorrelationCandidateScan = CorrelationCandidateScanActivities[
  "resolveBpmnCorrelationCandidateScan"
];

export type CorrelationCandidateScanCoordinatorOptions = Readonly<{
  address: CorrelatedMessageAddress;
  configuration: CorrelationIngressConfiguration;
  currentState: () => CorrelationCandidateRegistrationState;
  replaceState: (state: CorrelationCandidateRegistrationState) => void;
  resolve: ResolveCorrelationCandidateScan;
}>;

/** Keeps one exact registration snapshot installed until its complete fanout is acknowledged. */
export class CorrelationCandidateScanCoordinator {
  private resolving: Readonly<{
    scanId: string;
    promise: Promise<CorrelationCandidateScanCompletion>;
  }> | null = null;
  private completed: CorrelationCandidateScanCompletion | null = null;

  constructor(
    private readonly options: CorrelationCandidateScanCoordinatorOptions,
  ) {}

  validateBegin(value: unknown): CorrelationCandidateScanRequest {
    return requireCorrelationCandidateScanRequest(
      value,
      this.options.configuration,
    );
  }

  async begin(value: unknown): Promise<CorrelationCandidateScanBeginResult> {
    const request = this.validateBegin(value);
    const transition = beginCorrelationCandidateScan(
      this.options.currentState(),
      this.options.address,
      this.options.configuration,
      request.scanId,
    );
    this.options.replaceState(transition.state);
    switch (transition.result.kind) {
      case CorrelationCandidateScanResultKind.BlockedByPendingRegistration:
      case CorrelationCandidateScanResultKind.BlockedByQuarantine:
      case CorrelationCandidateScanResultKind.Busy:
        return transition.result;
      case CorrelationCandidateScanResultKind.Started:
      case CorrelationCandidateScanResultKind.Retained:
        return this.resolve(
          requireCorrelationCandidateScanActivityRequest({
            scanId: transition.result.scanId,
            address: this.options.address,
            registrations: transition.result.candidates,
            configuration: this.options.configuration,
          }),
        );
      case CorrelationCandidateScanResultKind.Finished:
      case CorrelationCandidateScanResultKind.NotActive:
        throw new TypeError("A scan begin transition returned a finish result");
      default:
        return assertNever(transition.result);
    }
  }

  validateFinish(value: unknown): CorrelationCandidateScanCompletion {
    if (this.completed === null) {
      throw new TypeError("Correlation candidate scan is not complete");
    }
    const completion = requireCorrelationCandidateScanCompletion(
      value,
      this.activityRequestForActiveBarrier(this.completed.scanId),
    );
    if (!sameCorrelationCandidateScanCompletion(completion, this.completed)) {
      throw new TypeError("Correlation candidate scan completion changed");
    }
    return completion;
  }

  finish(value: unknown): CorrelationCandidateScanFinishResult {
    const completion = this.validateFinish(value);
    const transition = finishCorrelationCandidateScan(
      this.options.currentState(),
      this.options.address,
      this.options.configuration,
      completion.scanId,
    );
    if (transition.result.kind !== CorrelationCandidateScanResultKind.Finished) {
      throw new TypeError("Correlation candidate scan barrier changed before finish");
    }
    this.options.replaceState(transition.state);
    this.completed = null;
    return {
      kind: CorrelationCandidateScanResultKind.Finished,
      scanId: transition.result.scanId,
    };
  }

  private resolve(
    request: CorrelationCandidateScanActivityRequest,
  ): Promise<CorrelationCandidateScanCompletion> {
    if (this.completed !== null) {
      if (this.completed.scanId !== request.scanId) {
        throw new TypeError("Completed correlation scan disagrees with its barrier");
      }
      return Promise.resolve(this.completed);
    }
    if (this.resolving !== null) {
      if (this.resolving.scanId !== request.scanId) {
        throw new TypeError("Resolving correlation scan disagrees with its barrier");
      }
      return this.resolving.promise;
    }
    const promise = this.options.resolve(request).then((value) => {
      const completion = requireCorrelationCandidateScanCompletion(value, request);
      this.completed = completion;
      return completion;
    }).finally(() => {
      if (this.resolving?.promise === promise) {
        this.resolving = null;
      }
    });
    this.resolving = { scanId: request.scanId, promise };
    return promise;
  }

  private activityRequestForActiveBarrier(
    scanId: string,
  ): CorrelationCandidateScanActivityRequest {
    const barrier = this.options.currentState().scanBarrier;
    if (barrier === null || barrier.scanId !== scanId) {
      throw new TypeError("Correlation candidate scan barrier is not current");
    }
    return requireCorrelationCandidateScanActivityRequest({
      scanId,
      address: this.options.address,
      registrations: barrier.candidates,
      configuration: this.options.configuration,
    });
  }
}

export function registerCorrelationCandidateScanHandlers(
  coordinator: CorrelationCandidateScanCoordinator,
): void {
  setHandler(
    bpmnBeginCorrelationCandidateScanUpdate,
    (request) => coordinator.begin(request),
    { validator: (request) => coordinator.validateBegin(request) },
  );
  setHandler(
    bpmnFinishCorrelationCandidateScanUpdate,
    (completion) => coordinator.finish(completion),
    { validator: (completion) => coordinator.validateFinish(completion) },
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported correlation candidate scan state: ${String(value)}`);
}
