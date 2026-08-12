import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
  PublicWorkTaskId,
} from "@bpmn-lean/platform-contracts";

import {
  type ActorVisibleSystemWorkTask,
  WorkService,
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
  work: WorkService;
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
    const current = await this.#options.work.findVisibleTask(structuredClone(taskId));
    if (current === null) return null;
    const metadata = current.task.metadata;
    if (metadata === undefined) {
      return {
        ...current,
        detail: { workTask: current.publicTask, form: null },
      };
    }
    const field = metadata.form.fields[0];
    const result = await this.#options.gateway.readWorkDetail({
      locator: current.registration.locator,
      hostingProcessInstanceId: current.registration.instance.processInstanceId,
      taskId: current.task.id,
      inputVariableNames: [field.key],
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
        return {
          ...current,
          detail: {
            workTask: current.publicTask,
            form: {
              fields: [projectField(field, result.detail.inputVariables)],
            },
          },
        };
    }
  }
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
      return value.kind === "boolean"
        ? { ...exact, currentValue: value, compatibility: "incompatible" }
        : { ...exact, currentValue: value, compatibility: "compatible" };
    }
    case "boolean": {
      const exact = { key: declared.key, type: declared.type } as const;
      return value.kind === "string"
        ? { ...exact, currentValue: value, compatibility: "incompatible" }
        : { ...exact, currentValue: value, compatibility: "compatible" };
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
  switch (rawValue.kind) {
    case "null":
      if (!hasExactKeys(rawValue, ["kind"])) throw new WorkSnapshotUnavailableError();
      return { kind: "null" };
    case "string":
      if (!hasExactKeys(rawValue, ["kind", "value"]) || typeof rawValue.value !== "string") {
        throw new WorkSnapshotUnavailableError();
      }
      return { kind: "string", value: rawValue.value };
    case "boolean":
      if (!hasExactKeys(rawValue, ["kind", "value"]) || typeof rawValue.value !== "boolean") {
        throw new WorkSnapshotUnavailableError();
      }
      return { kind: "boolean", value: rawValue.value };
    default:
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
