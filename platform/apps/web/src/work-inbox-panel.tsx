import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Button,
  ButtonVariant,
  BooleanChoice,
  DataTable,
  TextField,
} from "@bpmn-lean/platform-ui-kit";
import type { DataTableColumn } from "@bpmn-lean/platform-ui-kit";
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
  WorkCompletionRequest,
  WorkCompletionResult,
} from "@bpmn-lean/platform-contracts";

import type { WorkApiClient } from "./work-tasks-api";
import styles from "./work-inbox.module.css";

const tasksQueryKey = ["work", "tasks"] as const;

export const WorkCompletionViewKind = {
  Idle: "idle",
  Submitting: "submitting",
  TransportFailed: "transportFailed",
  Indeterminate: "indeterminate",
  Rejected: "rejected",
} as const;

export type WorkCompletionView =
  | Readonly<{ kind: typeof WorkCompletionViewKind.Idle }>
  | Readonly<{ kind: typeof WorkCompletionViewKind.Submitting }>
  | Readonly<{ kind: typeof WorkCompletionViewKind.TransportFailed }>
  | Readonly<{ kind: typeof WorkCompletionViewKind.Indeterminate }>
  | Readonly<{
      kind: typeof WorkCompletionViewKind.Rejected;
      result: Extract<WorkCompletionResult, { state: "rejected" }>;
    }>;

export type RetainedCompletionOperation = Readonly<{
  actionId: string;
  request: WorkCompletionRequest;
}>;

export type WorkCompletionResolution = Readonly<{
  operation: RetainedCompletionOperation | null;
  closeDetail: boolean;
  view: WorkCompletionView;
}>;

type CompletionApi = Readonly<{
  complete: (
    actionId: string,
    request: WorkCompletionRequest,
  ) => Promise<WorkCompletionResult>;
}>;

export type WorkInboxPanelProps = Readonly<{
  api: Pick<
    WorkApiClient,
    "listTasks" | "getTask" | "claim" | "release" | "complete"
  >;
  createActionId?: () => string;
}>;

export function WorkInboxPanel({
  api,
  createActionId = () => globalThis.crypto.randomUUID(),
}: WorkInboxPanelProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PublicWorkTask | null>(null);
  const [completionOperation, setCompletionOperation] =
    useState<RetainedCompletionOperation | null>(null);
  const completionOperationRef = useRef<RetainedCompletionOperation | null>(
    null,
  );
  const [completionView, setCompletionView] = useState<WorkCompletionView>({
    kind: WorkCompletionViewKind.Idle,
  });
  const tasks = useQuery({
    queryKey: tasksQueryKey,
    queryFn: () => api.listTasks(),
    refetchInterval: 5_000,
  });
  const detail = useQuery({
    queryKey: ["work", "task", selected === null ? "none" : workTaskRowId(selected)],
    queryFn: () => api.getTask(selected!.task.id),
    enabled: selected !== null,
  });
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
    if (selected !== null) {
      await queryClient.invalidateQueries({
        queryKey: ["work", "task", workTaskRowId(selected)],
      });
    }
  };
  const claim = useMutation({
    mutationFn: (task: PublicWorkTask) => api.claim(task.task.id, {
      actionId: createActionId(),
      expectedGeneration: task.claimGeneration,
    }),
    onSuccess: refresh,
  });
  const release = useMutation({
    mutationFn: (task: PublicWorkTask) => api.release(task.task.id, {
      actionId: createActionId(),
      generation: task.claim?.generation ?? task.claimGeneration,
    }),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: (operation: RetainedCompletionOperation) =>
      submitRetainedCompletionOperation(api, operation),
    onMutate: (operation) => {
      completionOperationRef.current = operation;
      setCompletionOperation(operation);
      setCompletionView({ kind: WorkCompletionViewKind.Submitting });
    },
    onError: (_error, operation) => {
      completionOperationRef.current = operation;
      setCompletionOperation(operation);
      setCompletionView({ kind: WorkCompletionViewKind.TransportFailed });
    },
    onSuccess: async (result, operation) => {
      const resolution = resolveCompletionResult(operation, result);
      completionOperationRef.current = resolution.operation;
      setCompletionOperation(resolution.operation);
      setCompletionView(resolution.view);
      if (resolution.closeDetail) {
        setSelected(null);
        await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      } else if (result.state === "rejected") {
        await refresh();
      }
    },
  });
  const columns = useMemo<readonly DataTableColumn<PublicWorkTask>[]>(() => [{
    id: "task",
    header: "Task",
    cell: (row) => (
      <Button
        className={styles.taskLink!}
        onPress={() => {
          if (completionOperation !== null) return;
          completionOperationRef.current = null;
          setSelected(row);
          setCompletionView({ kind: WorkCompletionViewKind.Idle });
          complete.reset();
        }}
        variant={ButtonVariant.Plain}
      >
        {row.task.name ?? row.task.id.elementId}
      </Button>
    ),
  }, {
    id: "process",
    header: "Process",
    cell: (row) => row.hostingInstance.definition.processId,
  }, {
    id: "candidate",
    header: "Candidate group",
    cell: (row) => row.task.metadata?.assignment.candidates[0].id ?? "Unavailable",
  }, {
    id: "claim",
    header: "Claim",
    cell: (row) => row.claim === null ? "Unclaimed" : `Claimed by ${row.claim.actorId}`,
  }, {
    id: "action",
    header: "Action",
    cell: (row) => row.claim === null ? (
      <Button
        isPending={claim.isPending}
        onPress={() => claim.mutate(row)}
      >
        Claim
      </Button>
    ) : (
      <Button
        isPending={release.isPending}
        onPress={() => release.mutate(row)}
      >
        Release
      </Button>
    ),
  }], [claim, release, complete, completionOperation]);
  const error = tasks.error ?? detail.error ?? claim.error ?? release.error;
  return (
    <section className={styles.panel} aria-labelledby="human-work-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Product 2</p>
          <h2 id="human-work-heading">Human work</h2>
          <p>Current engine-published tasks available to the configured actor.</p>
        </div>
        <Button onPress={() => { void tasks.refetch(); }} isPending={tasks.isFetching}>
          Refresh
        </Button>
      </div>
      {error === null ? null : <p role="alert" className={styles.error}>{errorMessage(error)}</p>}
      {tasks.isPending ? <p role="status">Loading current tasks…</p> : null}
      {tasks.data?.tasks.length === 0 ? <p>No current tasks.</p> : null}
      {tasks.data === undefined || tasks.data.tasks.length === 0 ? null : (
        <DataTable
          aria-label="Current tasks"
          columns={columns}
          rows={tasks.data.tasks}
          rowId={workTaskRowId}
        />
      )}
      {selected === null ? null : (
        <div className={styles.detail}>
          <div className={styles.detailHeading}>
            <h3>{selected.task.name ?? selected.task.id.elementId}</h3>
            <Button
              isDisabled={completionOperation !== null}
              onPress={() => {
                setSelected(null);
                completionOperationRef.current = null;
                setCompletionView({ kind: WorkCompletionViewKind.Idle });
                complete.reset();
              }}
            >
              Close
            </Button>
          </div>
          {detail.isPending ? <p role="status">Loading task detail…</p> : null}
          {detail.data === undefined ? null : (
            <WorkTaskForm
              detail={detail.data}
              completionView={completionView}
              onComplete={(value) => {
                const operation = completionOperationRef.current ??
                  createRetainedCompletionOperation(
                    detail.data,
                    value,
                    createActionId,
                  );
                completionOperationRef.current = operation;
                complete.mutate(operation);
              }}
              onRetry={() => {
                const operation = completionOperationRef.current;
                if (operation === null) {
                  throw new Error("No retained completion operation is available.");
                }
                complete.mutate(operation);
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}

export type WorkTaskFormProps = Readonly<{
  detail: PublicTaskDetail;
  completionView: WorkCompletionView;
  onComplete: (
    value: Extract<PublicFormValue, { kind: "string" | "boolean" }>,
  ) => void;
  onRetry: () => void;
}>;

export function WorkTaskForm({
  detail,
  completionView,
  onComplete,
  onRetry,
}: WorkTaskFormProps) {
  const field = detail.form?.fields[0];
  if (field === undefined) return <p>This task has no generated form.</p>;
  if (field.compatibility === "incompatible") {
    return <p role="alert">The current value does not match the declared field type.</p>;
  }
  const initial = initialFormValue(field);
  const exactField = field;
  const pending = completionView.kind === WorkCompletionViewKind.Submitting;
  const retryable =
    completionView.kind === WorkCompletionViewKind.TransportFailed ||
    completionView.kind === WorkCompletionViewKind.Indeterminate;
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    switch (exactField.type) {
      case "string":
        onComplete({
          kind: "string",
          value: String(data.get(exactField.key) ?? ""),
        });
        return;
      case "boolean":
        onComplete({
          kind: "boolean",
          value: selectedBooleanFormValue(data.get(exactField.key)),
        });
        return;
    }
  }
  return (
    <>
      <CompletionState view={completionView} onRetry={onRetry} />
      <form className={styles.form} onSubmit={submit}>
        {field.type === "string" ? (
          <TextField
            label={field.key}
            name={field.key}
            defaultValue={initial.kind === "string" ? initial.value : ""}
            isDisabled={pending || retryable}
          />
        ) : (
          <BooleanChoice
            label={field.key}
            name={field.key}
            {...(initial.kind === "boolean" ? { defaultValue: initial.value } : {})}
            isDisabled={pending || retryable}
          />
        )}
        {retryable ? null : (
          <Button type="submit" isPending={pending}>Complete task</Button>
        )}
      </form>
    </>
  );
}

function CompletionState({
  view,
  onRetry,
}: Readonly<{ view: WorkCompletionView; onRetry: () => void }>) {
  switch (view.kind) {
    case WorkCompletionViewKind.Idle:
    case WorkCompletionViewKind.Submitting:
      return null;
    case WorkCompletionViewKind.TransportFailed:
      return (
        <div className={styles.completionState} role="status">
          <p>Completion delivery is unknown. Retry the exact completion request.</p>
          <Button onPress={onRetry}>Retry completion</Button>
        </div>
      );
    case WorkCompletionViewKind.Indeterminate:
      return (
        <div className={styles.completionState} role="status">
          <p>Completion is indeterminate. Retry the exact completion request.</p>
          <Button onPress={onRetry}>Retry completion</Button>
        </div>
      );
    case WorkCompletionViewKind.Rejected:
      return (
        <p className={styles.completionState} role="alert">
          {rejectedCompletionMessage(view.result)}
        </p>
      );
  }
}

/** Mints and freezes one exact completion operation before its first submission. */
export function createRetainedCompletionOperation(
  detail: PublicTaskDetail,
  value: Extract<PublicFormValue, { kind: "string" | "boolean" }>,
  createActionId: () => string,
): RetainedCompletionOperation {
  const field = detail.form?.fields[0];
  if (field === undefined) throw new Error("The task has no completable field.");
  if (field.type !== value.kind) {
    throw new Error("The completion value does not match the published field type.");
  }
  const actionId = createActionId();
  if (typeof actionId !== "string" || actionId.length === 0) {
    throw new Error("Completion action identity must not be empty.");
  }
  const taskId = Object.freeze({
    processInstanceId: detail.workTask.task.id.processInstanceId,
    elementId: detail.workTask.task.id.elementId,
    activation: detail.workTask.task.id.activation,
  });
  const submittedValue = value.kind === "string"
    ? Object.freeze({ kind: value.kind, value: value.value })
    : Object.freeze({ kind: value.kind, value: value.value });
  const submittedValues = Object.freeze([Object.freeze({
    key: field.key,
    value: submittedValue,
  })]) as WorkCompletionRequest["submittedValues"];
  const request = Object.freeze({
    taskId,
    expectedClaimGeneration:
      detail.workTask.claim?.generation ?? detail.workTask.claimGeneration,
    submittedValues,
  });
  return Object.freeze({ actionId, request });
}

/** Reuses the already-minted identity and immutable request for every retry. */
export function submitRetainedCompletionOperation(
  api: CompletionApi,
  operation: RetainedCompletionOperation,
): Promise<WorkCompletionResult> {
  return api.complete(operation.actionId, operation.request);
}

/** Resolves only terminal results; indeterminate keeps the exact operation retryable. */
export function resolveCompletionResult(
  operation: RetainedCompletionOperation,
  result: WorkCompletionResult,
): WorkCompletionResolution {
  switch (result.state) {
    case "committed":
      return {
        operation: null,
        closeDetail: true,
        view: { kind: WorkCompletionViewKind.Idle },
      };
    case "rejected":
      return {
        operation: null,
        closeDetail: false,
        view: { kind: WorkCompletionViewKind.Rejected, result },
      };
    case "indeterminate":
      return {
        operation,
        closeDetail: false,
        view: { kind: WorkCompletionViewKind.Indeterminate },
      };
  }
}

export function initialFormValue(field: PublicFormField): PublicFormValue {
  return structuredClone(field.currentValue);
}

export function selectedBooleanFormValue(value: FormDataEntryValue | null): boolean {
  switch (value) {
    case "true":
      return true;
    case "false":
      return false;
    default:
      throw new Error("Choose true or false.");
  }
}

export function workTaskRowId(task: PublicWorkTask): string {
  const id = task.task.id;
  return JSON.stringify([
    task.hostingInstance.processInstanceId,
    id.processInstanceId,
    id.elementId,
    id.activation,
  ]);
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Human work request failed.";
}

function rejectedCompletionMessage(
  result: Extract<WorkCompletionResult, { state: "rejected" }>,
): string {
  switch (result.engineResult.kind) {
    case "processClosed":
      return "Completion was rejected because the Process is closed.";
    case "semantic":
      return `Completion was rejected with semantic outcome ${result.engineResult.outcome}.`;
  }
}
