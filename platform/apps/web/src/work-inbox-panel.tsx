import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Button,
  ButtonVariant,
  DataTable,
  DataTableCardWidth,
  DataTableResponsiveMode,
} from "@bpmn-lean/platform-ui-kit";
import type { DataTableColumn } from "@bpmn-lean/platform-ui-kit";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  PublicWorkTask,
} from "@bpmn-lean/platform-contracts";

import { WorkApiError } from "./work-tasks-api";
import type { WorkApiClient } from "./work-tasks-api";
import type { DefinitionApiClient } from "./definitions-api";
import {
  createRetainedCompletionOperation,
  resolveCompletionResult,
  submitRetainedCompletionOperation,
  WorkCompletionViewKind,
} from "./work-completion-operation";
import type {
  RetainedCompletionOperation,
  WorkCompletionView,
} from "./work-completion-operation";
import { WorkTaskDetailWorkspace } from "./work-task-detail-workspace";
import styles from "./work-inbox.module.css";

const tasksQueryKey = ["work", "tasks"] as const;

export type WorkInboxPanelProps = Readonly<{
  api: Pick<
    WorkApiClient,
    "listTasks" | "getTask" | "claim" | "release" | "complete"
  >;
  createActionId?: () => string;
  definitionApi?: Pick<DefinitionApiClient, "getPresentation">;
}>;

export function WorkInboxPanel({
  api,
  createActionId = () => globalThis.crypto.randomUUID(),
  definitionApi,
}: WorkInboxPanelProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PublicWorkTask | null>(null);
  const collectionHeadingRef = useRef<HTMLHeadingElement>(null);
  const taskButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastSelectedTaskIdRef = useRef<string | null>(null);
  const returnFocusRef = useRef<"collection" | "task" | null>(null);
  const [completionOperation, setCompletionOperation] =
    useState<RetainedCompletionOperation | null>(null);
  const completionOperationRef = useRef<RetainedCompletionOperation | null>(
    null,
  );
  const [completionView, setCompletionView] = useState<WorkCompletionView>({
    kind: WorkCompletionViewKind.Idle,
  });
  useEffect(() => {
    if (selected !== null) return;
    switch (returnFocusRef.current) {
      case "collection":
        collectionHeadingRef.current?.focus();
        break;
      case "task": {
        const taskId = lastSelectedTaskIdRef.current;
        const taskButton = taskId === null
          ? null
          : taskButtonRefs.current.get(taskId) ?? null;
        (taskButton ?? collectionHeadingRef.current)?.focus();
        break;
      }
      case null:
        return;
    }
    returnFocusRef.current = null;
  }, [selected]);
  const tasks = useQuery({
    queryKey: tasksQueryKey,
    queryFn: () => api.listTasks(),
    refetchInterval: 5_000,
    retry: false,
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
    onError: (error, operation) => {
      if (isFormValidationFailure(error)) {
        completionOperationRef.current = null;
        setCompletionOperation(null);
        setCompletionView({
          kind: WorkCompletionViewKind.ValidationFailed,
          issues: error.issues,
        });
        return;
      }
      if (isDefiniteCompletionRefusal(error)) {
        completionOperationRef.current = null;
        setCompletionOperation(null);
        setCompletionView({
          kind: WorkCompletionViewKind.NotAccepted,
          message: completionRefusalMessage(error),
        });
        void refresh();
        return;
      }
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
        returnFocusRef.current = "collection";
        setSelected(null);
        await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      } else if (result.state === "rejected") {
        await refresh();
      }
    },
  });
  const columns = useMemo<readonly DataTableColumn<PublicWorkTask>[]>(() => [{
    cardWidth: DataTableCardWidth.Full,
    id: "task",
    header: "Task",
    responsiveLabel: "Task",
    cell: (row) => row.claim === null ? (
      <span>{row.task.name ?? row.task.id.elementId}</span>
    ) : (
      <Button
        ref={(element) => {
          const taskId = workTaskRowId(row);
          if (element === null) taskButtonRefs.current.delete(taskId);
          else taskButtonRefs.current.set(taskId, element);
        }}
        onPress={() => {
          if (completionOperation !== null) return;
          lastSelectedTaskIdRef.current = workTaskRowId(row);
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
    cardWidth: DataTableCardWidth.Full,
    id: "process",
    header: "Process",
    responsiveLabel: "Process",
    cell: (row) => row.hostingInstance.definition.processId,
  }, {
    id: "priority",
    header: "Priority",
    responsiveLabel: "Priority",
    cell: (row) => row.catalogPresentation?.worklistPriority ?? 50,
  }, {
    id: "candidate",
    header: "Candidate group",
    responsiveLabel: "Candidate group",
    cell: (row) => row.task.metadata?.assignment.candidates[0].id ?? "Unavailable",
  }, {
    id: "claim",
    header: "Claim",
    responsiveLabel: "Claim",
    cell: (row) => row.claim === null ? "Unclaimed" : `Claimed by ${row.claim.actorId}`,
  }, {
    cardWidth: DataTableCardWidth.Full,
    id: "action",
    header: "Action",
    responsiveLabel: "Action",
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
  if (selected !== null) {
    return (
      <section className={styles.panel} aria-label="Tasks">
        {error === null ? null : <p role="alert" className={styles.error}>{errorMessage(error)}</p>}
        {detail.isPending ? <p role="status">Loading task detail…</p> : null}
        {detail.data === undefined ? null : (
          <WorkTaskDetailWorkspace
            task={detail.data.workTask}
            detail={detail.data}
            completionView={completionView}
            {...(definitionApi === undefined ? {} : { definitionApi })}
            onBack={() => {
              if (completionOperation !== null) return;
              returnFocusRef.current = "task";
              setSelected(null);
              completionOperationRef.current = null;
              setCompletionView({ kind: WorkCompletionViewKind.Idle });
              complete.reset();
            }}
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
      </section>
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="human-work-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="human-work-heading" ref={collectionHeadingRef} tabIndex={-1}>Tasks</h2>
          <p>Engine-published User Tasks available to the current actor.</p>
        </div>
        <Button onPress={() => { void tasks.refetch(); }} isPending={tasks.isFetching}>
          Refresh
        </Button>
      </div>
      {error === null ? null : <p role="alert" className={styles.error}>{errorMessage(error)}</p>}
      {tasks.isPending ? <p role="status">Loading current tasks…</p> : null}
      {tasks.data?.tasks.length === 0 ? <p>No current tasks.</p> : null}
      {tasks.data === undefined || tasks.data.tasks.length === 0 ? null : (
        <div className={styles.taskTable}>
          <DataTable
            aria-label="Current tasks"
            columns={columns}
            rows={tasks.data.tasks}
            rowId={workTaskRowId}
            responsiveMode={DataTableResponsiveMode.Cards}
          />
        </div>
      )}
    </section>
  );
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

function isDefiniteCompletionRefusal(error: unknown): error is WorkApiError {
  return error instanceof WorkApiError && error.status >= 400 && error.status < 500;
}

function isFormValidationFailure(error: unknown): error is WorkApiError {
  return error instanceof WorkApiError &&
    error.code === "formValidationFailed" &&
    error.issues.length > 0;
}

function completionRefusalMessage(error: WorkApiError): string {
  switch (error.status) {
    case 404:
    case 409:
      return "Completion was not accepted because the task claim is no longer current.";
    case 422:
      return "Completion was not accepted because the form value is no longer compatible.";
    default:
      return "Completion was not accepted by the Work API.";
  }
}

export {
  WorkCompletionViewKind,
} from "./work-completion-operation";
export type {
  RetainedCompletionOperation,
  WorkCompletionView,
} from "./work-completion-operation";
export {
  createRetainedCompletionOperation,
  resolveCompletionResult,
  submitRetainedCompletionOperation,
} from "./work-completion-operation";
export {
  initialFormValue,
  selectedBooleanFormValue,
  WorkTaskDetailWorkspace,
  WorkTaskForm,
} from "./work-task-detail-workspace";
export type { WorkTaskFormProps } from "./work-task-detail-workspace";
