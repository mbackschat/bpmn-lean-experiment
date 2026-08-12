import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Button,
  ButtonVariant,
  Checkbox,
  DataTable,
  TextField,
} from "@bpmn-lean/platform-ui-kit";
import type { DataTableColumn } from "@bpmn-lean/platform-ui-kit";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
} from "@bpmn-lean/platform-contracts";

import type { WorkApiClient } from "./work-tasks-api";
import styles from "./work-inbox.module.css";

const tasksQueryKey = ["work", "tasks"] as const;

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
    mutationFn: (input: Readonly<{
      detail: PublicTaskDetail;
      value: Extract<PublicFormValue, { kind: "string" | "boolean" }>;
    }>) => {
      const field = input.detail.form?.fields[0];
      if (field === undefined) throw new Error("The task has no completable field.");
      return api.complete(createActionId(), {
        taskId: input.detail.workTask.task.id,
        expectedClaimGeneration:
          input.detail.workTask.claim?.generation ??
          input.detail.workTask.claimGeneration,
        submittedValues: [{ key: field.key, value: input.value }],
      });
    },
    onSuccess: async () => {
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
    },
  });
  const columns = useMemo<readonly DataTableColumn<PublicWorkTask>[]>(() => [{
    id: "task",
    header: "Task",
    cell: (row) => (
      <Button
        className={styles.taskLink!}
        onPress={() => setSelected(row)}
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
  }], [claim, release]);
  const error = tasks.error ?? detail.error ?? claim.error ?? release.error ?? complete.error;
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
            <Button onPress={() => setSelected(null)}>Close</Button>
          </div>
          {detail.isPending ? <p role="status">Loading task detail…</p> : null}
          {detail.data === undefined ? null : (
            <WorkTaskForm
              detail={detail.data}
              pending={complete.isPending}
              onComplete={(value) => complete.mutateAsync({ detail: detail.data, value }).then(() => undefined)}
            />
          )}
        </div>
      )}
    </section>
  );
}

export type WorkTaskFormProps = Readonly<{
  detail: PublicTaskDetail;
  pending: boolean;
  onComplete: (
    value: Extract<PublicFormValue, { kind: "string" | "boolean" }>,
  ) => Promise<void>;
}>;

export function WorkTaskForm({ detail, pending, onComplete }: WorkTaskFormProps) {
  const field = detail.form?.fields[0];
  if (field === undefined) return <p>This task has no generated form.</p>;
  if (field.compatibility === "incompatible") {
    return <p role="alert">The current value does not match the declared field type.</p>;
  }
  const initial = initialFormValue(field);
  const exactField = field;
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    switch (exactField.type) {
      case "string":
        await onComplete({
          kind: "string",
          value: String(data.get(exactField.key) ?? ""),
        });
        return;
      case "boolean":
        await onComplete({
          kind: "boolean",
          value: data.get(exactField.key) === "on",
        });
        return;
    }
  }
  return (
    <form className={styles.form} onSubmit={(event) => { void submit(event); }}>
      {field.type === "string" ? (
        <TextField
          label={field.key}
          name={field.key}
          defaultValue={initial.kind === "string" ? initial.value : ""}
          isDisabled={pending}
        />
      ) : (
        <Checkbox
          name={field.key}
          defaultSelected={initial.kind === "boolean" ? initial.value : false}
          isDisabled={pending}
        >
          {field.key}
        </Checkbox>
      )}
      <Button type="submit" isPending={pending}>Complete task</Button>
    </form>
  );
}

export function initialFormValue(field: PublicFormField): PublicFormValue {
  return structuredClone(field.currentValue);
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
