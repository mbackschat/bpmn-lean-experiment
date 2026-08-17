import {
  decodePublicFormValue,
  structuredTaskFormSchemaVersion,
  type PublicFormField,
  type PublicFormValue,
  type PublicTaskDetail,
  type PublicWorkTask,
  type PublicWorkTaskId,
} from "@bpmn-lean/platform-contracts";

import {
  projectStructuredCurrentFieldValues,
} from "./structured-form-computation.js";
import {
  type ActorVisibleSystemWorkTask,
  type ExactCurrentActorVisibleWorkTask,
  type WorkExactTaskDetailReader,
  type WorkVisibleTaskReader,
  WorkSnapshotUnavailableError,
} from "./work-service.js";

type WorkDetailGatewayPort = Readonly<{
  readWorkDetail(request: Readonly<{
    locator: string;
    hostingProcessInstanceId: string;
    taskId: PublicWorkTaskId;
    inputVariableNames: readonly string[];
  }>): Promise<
    | Readonly<{
        status: "found";
        detail: Readonly<{
          task: PublicWorkTask["task"];
          inputVariables: readonly unknown[];
        }>;
      }>
    | Readonly<{ status: "notFound" | "closed" | "unknown" | "unavailable" }>
  >;
}>;

type WorkTaskDetailServiceOptions = Readonly<{
  work: WorkVisibleTaskReader | WorkExactTaskDetailReader;
  gateway: WorkDetailGatewayPort;
}>;

export type ActorVisibleWorkTaskDetail = ActorVisibleSystemWorkTask & Readonly<{
  detail: PublicTaskDetail;
}>;

/** Projects one freshly visible engine task and its exact declared input value. */
export class WorkTaskDetailService {
  readonly #options: WorkTaskDetailServiceOptions;

  constructor(options: WorkTaskDetailServiceOptions) {
    this.#options = options;
  }

  async getTaskDetail(taskId: PublicWorkTaskId): Promise<PublicTaskDetail | null> {
    const visible = await this.findVisibleTaskDetail(taskId);
    return visible?.detail ?? null;
  }

  async findVisibleTaskDetail(
    taskId: PublicWorkTaskId,
  ): Promise<ActorVisibleWorkTaskDetail | null> {
    let current: ActorVisibleSystemWorkTask;
    let inputVariables: readonly unknown[];
    if (isExactTaskDetailReader(this.#options.work)) {
      const exact = await this.#options.work.findVisibleTaskDetail(
        structuredClone(taskId),
      );
      if (exact === null) return null;
      current = withoutInputVariables(exact);
      inputVariables = exact.inputVariables;
    } else {
      const visible = await this.#options.work.findVisibleTask(structuredClone(taskId));
      if (visible === null) return null;
      const result = await this.#readDetail(visible, inputVariableNamesFor(visible));
      if (result === null) return null;
      current = visible;
      inputVariables = result.inputVariables;
    }

    const structuredTask = current.structuredTask;
    if (structuredTask !== null) {
      const fields = projectStructuredCurrentFieldValues(
        structuredTask.taskDefinition,
        inputVariables,
      );
      if (fields === null) throw new WorkSnapshotUnavailableError();
      return {
        ...current,
        detail: {
          workTask: current.publicTask,
          form: {
            schemaVersion: structuredTaskFormSchemaVersion,
            catalogIdentity: structuredTask.catalogIdentity,
            taskDefinition: structuredTask.taskDefinition,
            fields,
          },
        },
      };
    }
    const metadata = current.task.metadata;
    if (metadata === undefined || !("form" in metadata)) {
      if (inputVariables.length !== 0) throw new WorkSnapshotUnavailableError();
      return {
        ...current,
        detail: { workTask: current.publicTask, form: null },
      };
    }
    const field = metadata.form.fields[0];
    return {
      ...current,
      detail: {
        workTask: current.publicTask,
        form: { fields: [projectField(field, inputVariables)] },
      },
    };
  }

  async #readDetail(
    current: ActorVisibleSystemWorkTask,
    inputVariableNames: readonly string[],
  ): Promise<Readonly<{ inputVariables: readonly unknown[] }> | null> {
    const result = await this.#options.gateway.readWorkDetail({
      locator: current.registration.locator,
      hostingProcessInstanceId: current.registration.instance.processInstanceId,
      taskId: current.task.id,
      inputVariableNames,
    });
    switch (result.status) {
      case "notFound":
      case "closed":
        return null;
      case "unknown":
      case "unavailable":
        throw new WorkSnapshotUnavailableError();
      case "found":
        if (!sameTask(result.detail.task, current.task)) {
          throw new WorkSnapshotUnavailableError();
        }
        return { inputVariables: result.detail.inputVariables };
    }
  }
}

function isExactTaskDetailReader(
  reader: WorkVisibleTaskReader | WorkExactTaskDetailReader,
): reader is WorkExactTaskDetailReader {
  return "findVisibleTaskDetail" in reader;
}

function inputVariableNamesFor(current: ActorVisibleSystemWorkTask): readonly string[] {
  if (current.structuredTask !== null) {
    return current.structuredTask.taskDefinition.form.fields
      .map(({ key }) => key)
      .toSorted(compareStrings);
  }
  const metadata = current.task.metadata;
  return metadata !== undefined && "form" in metadata
    ? [metadata.form.fields[0].key]
    : [];
}

function withoutInputVariables(
  exact: ExactCurrentActorVisibleWorkTask,
): ActorVisibleSystemWorkTask {
  const { inputVariables: _inputVariables, ...current } = exact;
  return current;
}

function projectField(
  declared: Readonly<{ key: string; type: "string" | "boolean" }>,
  variables: readonly unknown[],
): PublicFormField {
  if (variables.length > 1) throw new WorkSnapshotUnavailableError();
  const value = variables[0] === undefined
    ? { kind: "absent" } as const
    : decodeVariable(variables[0], declared.key);
  switch (declared.type) {
    case "string": {
      const exact = { key: declared.key, type: declared.type } as const;
      switch (value.kind) {
        case "absent":
        case "null":
        case "string":
          return { ...exact, currentValue: value, compatibility: "compatible" };
        case "boolean":
        case "integer":
        case "stringList":
          return { ...exact, currentValue: value, compatibility: "incompatible" };
      }
    }
    case "boolean": {
      const exact = { key: declared.key, type: declared.type } as const;
      switch (value.kind) {
        case "absent":
        case "null":
        case "boolean":
          return { ...exact, currentValue: value, compatibility: "compatible" };
        case "string":
        case "integer":
        case "stringList":
          return { ...exact, currentValue: value, compatibility: "incompatible" };
      }
    }
  }
}

function decodeVariable(value: unknown, expectedName: string): PublicFormValue {
  if (!isExactRecord(value, ["name", "value"]) || value.name !== expectedName) {
    throw new WorkSnapshotUnavailableError();
  }
  const rawValue = value.value;
  if (!isRecord(rawValue) || typeof rawValue.kind !== "string") {
    throw new WorkSnapshotUnavailableError();
  }
  try {
    const decoded = decodePublicFormValue(rawValue, "Work task detail input variable value");
    if (decoded.kind === "absent") throw new TypeError("engine variable cannot be absent");
    return decoded;
  } catch {
    throw new WorkSnapshotUnavailableError();
  }
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length &&
    [...expected].sort().every((key, index) => keys[index] === key);
}

function sameTask(
  left: PublicWorkTask["task"],
  right: PublicWorkTask["task"],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareStrings(left: string, right: string): number {
  const leftScalars = [...left];
  const rightScalars = [...right];
  for (let index = 0; index < Math.min(leftScalars.length, rightScalars.length); index += 1) {
    const difference = Number(leftScalars[index]?.codePointAt(0)) -
      Number(rightScalars[index]?.codePointAt(0));
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}
