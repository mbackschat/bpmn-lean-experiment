import {
  EngineOpenWorkStatus,
  EngineWorkDetailStatus,
  completeWork as completeEngineWork,
  engineProcessWorkLocatorForCanonicalProcess,
  engineProcessWorkLocatorForScheduleExecution,
  observeOpenWork as observeEngineOpenWork,
  parseEngineProcessWorkLocator,
  readWorkDetail as readEngineWorkDetail,
  serializeEngineProcessWorkLocator,
} from "@bpmn-lean/engine-api";
import type {
  EngineCompleteWorkRequest,
  EngineOpenWorkResult,
  EngineProcessWorkLocator,
  EngineWorkDetailRequest,
  EngineWorkDetailResult,
} from "@bpmn-lean/engine-api";
import type {
  ProcessCommandResult,
  TemporalProcessWorkClient,
} from "@bpmn-lean/temporal-client/process-work";

export const ProcessWorkObservationStatus = EngineOpenWorkStatus;
export type ProcessWorkObservationResult = EngineOpenWorkResult;

export const ProcessWorkDetailStatus = EngineWorkDetailStatus;
export type ProcessWorkDetailResult = EngineWorkDetailResult;

/** Private stored form of a Product 1 locator. It carries no public host identity. */
export type SerializedProcessWorkLocator = string;

export type ProcessWorkObservationRequest = Readonly<{
  locator: SerializedProcessWorkLocator;
  hostingProcessInstanceId: string;
}>;

export type ProcessWorkDetailRequest = Omit<
  EngineWorkDetailRequest,
  "temporalClient" | "locator"
> & Readonly<{ locator: SerializedProcessWorkLocator }>;

export type ProcessWorkCompletionRequest = Omit<
  EngineCompleteWorkRequest,
  "temporalClient" | "locator"
> & Readonly<{ locator: SerializedProcessWorkLocator }>;

/** Product 2's representation-free gateway for current Work observation and command. */
export class BpmnProcessWorkGateway {
  readonly #temporalClient: TemporalProcessWorkClient;

  constructor(temporalClient: TemporalProcessWorkClient) {
    this.#temporalClient = temporalClient;
  }

  canonicalLocator(processInstanceId: string): SerializedProcessWorkLocator {
    return serializeEngineProcessWorkLocator(
      engineProcessWorkLocatorForCanonicalProcess(processInstanceId),
    );
  }

  scheduleExecutionLocator(
    executionWorkflowId: string,
  ): SerializedProcessWorkLocator {
    return serializeEngineProcessWorkLocator(
      engineProcessWorkLocatorForScheduleExecution(executionWorkflowId),
    );
  }

  observeOpenWork(
    request: ProcessWorkObservationRequest,
  ): Promise<ProcessWorkObservationResult> {
    return observeEngineOpenWork({
      temporalClient: this.#temporalClient,
      locator: this.#parse(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
    });
  }

  readWorkDetail(
    request: ProcessWorkDetailRequest,
  ): Promise<ProcessWorkDetailResult> {
    return readEngineWorkDetail({
      temporalClient: this.#temporalClient,
      locator: this.#parse(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
      taskId: request.taskId,
      inputVariableNames: request.inputVariableNames,
    });
  }

  completeWork(
    request: ProcessWorkCompletionRequest,
  ): Promise<ProcessCommandResult> {
    return completeEngineWork({
      temporalClient: this.#temporalClient,
      locator: this.#parse(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
      stimulus: request.stimulus,
    });
  }

  #parse(locator: SerializedProcessWorkLocator): EngineProcessWorkLocator {
    return parseEngineProcessWorkLocator(locator);
  }
}
