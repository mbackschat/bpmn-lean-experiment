/**
 * Product 2's representation-free gateway for current human work: the engine's open User Task waits as Work tasks,
 * one task's detail with selected process variables, and completion.
 */
import {
  completeWork,
  engineProcessLocatorForCanonicalProcess,
  observeOpenWork,
  parseEngineProcessLocator,
  readWorkDetail,
  serializeEngineProcessLocator,
  EngineOpenWorkStatus,
  EngineWorkDetailStatus,
  type EngineBinding,
  type EngineHost,
  type EngineOccurrenceId,
  type EngineOpenWait,
} from "@bpmn-lean/engine-api";
import type { PublicWorkTask, VariableBinding as PlatformVariableBinding } from "@bpmn-lean/platform-contracts";

import { engineBindings } from "./gateway-context.js";
import { processCommandResult, type ProcessCommandResult } from "./process-command-result.js";

export const ProcessWorkObservationStatus = EngineOpenWorkStatus;
export const ProcessWorkDetailStatus = EngineWorkDetailStatus;

/** One open User Task as the Work contract presents it. */
export type ProcessWorkTask = PublicWorkTask["task"];

export type ProcessWorkObservationResult =
  | Readonly<{ status: EngineOpenWorkStatus.Open; openUserTasks: readonly ProcessWorkTask[] }>
  | Readonly<{ status: EngineOpenWorkStatus.Closed | EngineOpenWorkStatus.Unknown | EngineOpenWorkStatus.Unavailable }>;

export type ProcessWorkDetailResult =
  | Readonly<{
      status: EngineWorkDetailStatus.Found;
      detail: Readonly<{ task: ProcessWorkTask; inputVariables: readonly EngineBinding[] }>;
    }>
  | Readonly<{
      status: EngineWorkDetailStatus.NotFound | EngineWorkDetailStatus.Closed | EngineWorkDetailStatus.Unknown |
        EngineWorkDetailStatus.Unavailable;
    }>;

/** Private stored form of a Product 1 locator. It carries no public host identity. */
export type SerializedProcessWorkLocator = string;

export type ProcessWorkObservationRequest = Readonly<{
  locator: SerializedProcessWorkLocator;
  hostingProcessInstanceId: string;
}>;

export type ProcessWorkDetailRequest = ProcessWorkObservationRequest & Readonly<{
  taskId: EngineOccurrenceId;
  inputVariableNames: readonly string[];
}>;

/**
 * The value arms Product 2 Work forms carry. The engine's Decimal, List and Map arms stay out until a Product 2 form
 * journey selects them, so they cannot reach the engine through Work.
 */
export type ProcessWorkCompletionValue = PlatformVariableBinding["value"];

export type ProcessWorkCompletionRequest = ProcessWorkObservationRequest & Readonly<{
  stimulus: Readonly<{
    kind: "completeUserTaskInstance";
    commandId: string;
    taskId: EngineOccurrenceId;
    submittedValues: ReadonlyArray<Readonly<{ name: string; value: ProcessWorkCompletionValue }>>;
  }>;
}>;

/** The kernel's User Task detail (`canonical-result.schema.json#/$defs/userTaskDetail`). */
type UserTaskDetail = Readonly<{
  name: string | null;
  assignee: string | null;
  candidateUsers: readonly string[];
  candidateGroups: readonly string[];
  formKey: string | null;
  formFields: readonly Readonly<{ key: string; type: string }>[];
}>;

/**
 * The Work task of one open User Task wait. Work presents a task's name, its one candidate group and its one string
 * or boolean form field; due dates, priority and Activity inputs are not part of it. A task whose assignment or form
 * Work cannot present faithfully (an assignee, candidate users, several groups, a form key or another form) is refused
 * here rather than shown with less authority attached than the engine assigned.
 */
export function processWorkTask(wait: EngineOpenWait): ProcessWorkTask {
  const detail = wait.detail as unknown as UserTaskDetail;
  const refuse = (fact: string): never => {
    throw new TypeError(`User Task ${wait.id.elementId} carries ${fact}, which the Work contract cannot present`);
  };
  if (detail.assignee !== null) refuse("an assignee");
  if (detail.candidateUsers.length > 0) refuse("candidate users");
  if (detail.candidateGroups.length > 1) refuse("several candidate groups");
  if (detail.formKey !== null) refuse("a form key");
  if (detail.formFields.length > 1) refuse("several form fields");
  const [group] = detail.candidateGroups;
  const [field] = detail.formFields;
  if (field !== undefined && group === undefined) refuse("a form without a candidate group");
  const id = { ...wait.id };
  if (group === undefined) return { id, name: detail.name, state: "active" };
  const assignment = { candidates: [{ kind: "group", id: group }] } as const;
  if (field === undefined) return { id, name: detail.name, state: "active", metadata: { assignment } };
  if (field.type !== "string" && field.type !== "boolean") refuse(`a ${field.type} form field`);
  return {
    id,
    name: detail.name,
    state: "active",
    metadata: { assignment, form: { fields: [{ key: field.key, type: field.type as "string" | "boolean" }] } },
  };
}

export class BpmnProcessWorkGateway {
  readonly #host: EngineHost;

  constructor(host: EngineHost) {
    this.#host = host;
  }

  canonicalLocator(processInstanceId: string): SerializedProcessWorkLocator {
    return serializeEngineProcessLocator(engineProcessLocatorForCanonicalProcess(this.#host.population.population, processInstanceId));
  }

  async observeOpenWork(request: ProcessWorkObservationRequest): Promise<ProcessWorkObservationResult> {
    const result = await observeOpenWork({
      host: this.#host,
      locator: parseEngineProcessLocator(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
    });
    return result.status === EngineOpenWorkStatus.Open
      ? { status: result.status, openUserTasks: result.openUserTasks.map(processWorkTask) }
      : result;
  }

  async readWorkDetail(request: ProcessWorkDetailRequest): Promise<ProcessWorkDetailResult> {
    const result = await readWorkDetail({
      host: this.#host,
      locator: parseEngineProcessLocator(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
      taskId: request.taskId,
      inputVariableNames: request.inputVariableNames,
    });
    return result.status === EngineWorkDetailStatus.Found
      ? {
          status: result.status,
          detail: { task: processWorkTask(result.detail.task), inputVariables: result.detail.inputVariables },
        }
      : result;
  }

  async completeWork(request: ProcessWorkCompletionRequest): Promise<ProcessCommandResult> {
    return processCommandResult(await completeWork({
      host: this.#host,
      locator: parseEngineProcessLocator(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
      completion: {
        commandId: request.stimulus.commandId,
        taskId: request.stimulus.taskId,
        values: engineBindings(request.stimulus.submittedValues),
      },
    }));
  }
}
