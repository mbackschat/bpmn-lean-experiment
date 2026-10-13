import {
  EngineOpenWorkStatus,
  EngineVariableValueKind,
  EngineWorkDetailStatus,
  completeWork as completeEngineWork,
  engineProcessWorkLocatorForCanonicalProcess,
  observeOpenWork as observeEngineOpenWork,
  parseEngineProcessWorkLocator,
  readWorkDetail as readEngineWorkDetail,
  serializeEngineProcessWorkLocator,
} from "@bpmn-lean/engine-api";
import type {
  EngineCompleteWorkRequest,
  EngineOpenWorkResult,
  EngineProcessWorkLocator,
  EngineWorkCompletionStimulus,
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

type EngineWorkValue =
  EngineWorkCompletionStimulus["submittedValues"][number]["value"];

/**
 * Closed allow-list of the value arms Product 2 Work forms can carry. The engine's recursive Decimal, List and Map arms
 * stay out of this type until a Product 2 form journey selects them, so they cannot reach the engine through Work.
 */
export type ProcessWorkCompletionValue = Extract<
  EngineWorkValue,
  Readonly<{
    kind:
      | typeof EngineVariableValueKind.Boolean
      | typeof EngineVariableValueKind.Integer
      | typeof EngineVariableValueKind.String
      | typeof EngineVariableValueKind.StringList
      | typeof EngineVariableValueKind.Null;
  }>
>;

export type ProcessWorkCompletionRequest = Omit<
  EngineCompleteWorkRequest,
  "temporalClient" | "locator" | "stimulus"
> & Readonly<{
  locator: SerializedProcessWorkLocator;
  stimulus: Omit<EngineWorkCompletionStimulus, "submittedValues"> & Readonly<{
    submittedValues: ReadonlyArray<Readonly<{
      name: string;
      value: ProcessWorkCompletionValue;
    }>>;
  }>;
}>;

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
