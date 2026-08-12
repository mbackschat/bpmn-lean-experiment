import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
  PublicWorkTaskId,
} from "@bpmn-lean/platform-contracts";

import {
  WorkService,
  WorkSnapshotUnavailableError,
} from "./work-service.js";

type DetailVariable = Readonly<{
  name: string;
  value:
    | Readonly<{ kind: "null" }>
    | Readonly<{ kind: "string"; value: string }>
    | Readonly<{ kind: "boolean"; value: boolean }>;
}>;

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
          inputVariables: readonly DetailVariable[];
        }>;
      }>
    | Readonly<{ status: "notFound" | "closed" | "unknown" | "unavailable" }>
  >;
}>;

type WorkTaskDetailServiceOptions = Readonly<{
  work: WorkService;
  gateway: WorkDetailGatewayPort;
}>;

/** Projects one freshly visible engine task and its exact declared input value. */
export class WorkTaskDetailService {
  readonly #options: WorkTaskDetailServiceOptions;

  constructor(options: WorkTaskDetailServiceOptions) {
    this.#options = options;
  }

  async getTaskDetail(taskId: PublicWorkTaskId): Promise<PublicTaskDetail | null> {
    const current = await this.#options.work.findVisibleTask(structuredClone(taskId));
    if (current === null) return null;
    const metadata = current.task.metadata;
    if (metadata === undefined) {
      return { workTask: current.publicTask, form: null };
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
          workTask: current.publicTask,
          form: {
            fields: [projectField(field, result.detail.inputVariables)],
          },
        };
    }
  }
}

function projectField(
  declared: Readonly<{ key: string; type: "string" | "boolean" }>,
  variables: readonly DetailVariable[],
): PublicFormField {
  if (variables.length > 1 || (variables[0] !== undefined && variables[0].name !== declared.key)) {
    throw new WorkSnapshotUnavailableError();
  }
  const value: PublicFormValue = variables[0]?.value ?? { kind: "absent" };
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

function sameTask(
  left: PublicWorkTask["task"],
  right: PublicWorkTask["task"],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
