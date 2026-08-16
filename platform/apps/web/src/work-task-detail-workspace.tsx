import {
  BooleanChoice,
  Button,
  ButtonVariant,
  TextField,
  WorkspaceTabs,
} from "@bpmn-lean/platform-ui-kit";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import type { FormEvent } from "react";

import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
  WorkCompletionResult,
} from "@bpmn-lean/platform-contracts";

import type { DefinitionApiClient } from "./definitions-api";
import { BpmnDiagramMarkerKind } from "./bpmn-viewer-contract.ts";
import type { WorkCompletionView } from "./work-completion-operation";
import type { WorkCompletionSubmission } from "./work-completion-operation";
import { WorkCompletionViewKind } from "./work-completion-operation";
import styles from "./work-inbox.module.css";

const StructuredWorkForm = lazy(async () => {
  const module = await import("./structured-work-form");
  return { default: module.StructuredWorkForm };
});
const DefinitionDiagram = lazy(async () => {
  const module = await import("./definition-diagram");
  return { default: module.DefinitionDiagram };
});

export type WorkTaskDetailWorkspaceProps = Readonly<{
  completionView: WorkCompletionView;
  definitionApi?: Pick<DefinitionApiClient, "getPresentation">;
  detail: PublicTaskDetail;
  onBack: () => void;
  onComplete: WorkTaskFormProps["onComplete"];
  onRetry: () => void;
  task: PublicWorkTask;
}>;

export function WorkTaskDetailWorkspace({
  completionView,
  definitionApi,
  detail,
  onBack,
  onComplete,
  onRetry,
  task,
}: WorkTaskDetailWorkspaceProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const name = task.task.name ?? task.task.id.elementId;
  const tabs = useMemo(() => [{
    id: "form",
    label: "Form",
    content: (
      <WorkTaskForm
        detail={detail}
        completionView={completionView}
        onComplete={onComplete}
        onRetry={onRetry}
      />
    ),
  }, {
    id: "diagram",
    label: "Diagram",
    content: <WorkTaskDiagram definitionApi={definitionApi} task={task} />,
  }, {
    id: "details",
    label: "Details",
    content: <WorkTaskFacts task={task} />,
  }], [completionView, definitionApi, detail, onComplete, onRetry, task]);
  return (
    <div className={styles.detail}>
      <Button className={styles.back!} variant={ButtonVariant.Plain} onPress={onBack}>
        ← Back to tasks
      </Button>
      <div className={styles.detailHeading}>
        <div>
          <p className={styles.eyebrow}>Active User Task</p>
          <h2 id="human-work-heading" ref={headingRef} tabIndex={-1}>{name}</h2>
          <p>{task.hostingInstance.definition.processId}, version {task.hostingInstance.definition.version}</p>
        </div>
        <span className={styles.claimBadge}>
          {task.claim === null ? "Unclaimed" : `Claimed by ${task.claim.actorId}`}
        </span>
      </div>
      <WorkspaceTabs aria-label="Task detail views" tabs={tabs} />
    </div>
  );
}

function WorkTaskDiagram({
  definitionApi,
  task,
}: Readonly<{
  definitionApi: WorkTaskDetailWorkspaceProps["definitionApi"];
  task: PublicWorkTask;
}>) {
  if (definitionApi === undefined) {
    return <p role="status">Diagram viewing is unavailable in this host.</p>;
  }
  const hasExactDiagramBinding = task.task.id.processInstanceId ===
    task.hostingInstance.processInstanceId;
  if (!hasExactDiagramBinding) {
    return (
      <p role="status">
        Task diagram is unavailable because this task belongs to a called Process whose exact diagram binding is not published.
      </p>
    );
  }
  return (
    <Suspense fallback={<p role="status">Loading task diagram…</p>}>
      <DefinitionDiagram
        api={definitionApi}
        definition={task.hostingInstance.definition}
        highlight={{
          elementId: task.task.id.elementId,
          markerKind: BpmnDiagramMarkerKind.Selected,
        }}
      />
    </Suspense>
  );
}

export function WorkTaskFacts({ task }: Readonly<{ task: PublicWorkTask }>) {
  return (
    <dl className={styles.facts}>
      <div><dt>Task element</dt><dd>{task.task.id.elementId}</dd></div>
      <div><dt>Activation</dt><dd>{task.task.id.activation}</dd></div>
      <div><dt>Candidate group</dt><dd>{task.task.metadata?.assignment.candidates[0].id ?? "Unavailable"}</dd></div>
      <div><dt>Worklist priority</dt><dd>{task.catalogPresentation?.worklistPriority ?? "Default"}</dd></div>
      <div><dt>Task Process instance</dt><dd>{task.task.id.processInstanceId}</dd></div>
      <div><dt>Hosting root Process instance</dt><dd>{task.hostingInstance.processInstanceId}</dd></div>
    </dl>
  );
}

export type WorkTaskFormProps = Readonly<{
  detail: PublicTaskDetail;
  completionView: WorkCompletionView;
  onComplete: (submission: WorkCompletionSubmission) => void;
  onRetry: () => void;
}>;

export function WorkTaskForm({
  detail,
  completionView,
  onComplete,
  onRetry,
}: WorkTaskFormProps) {
  if (detail.workTask.claim === null) {
    return <p role="alert">Claim this task before completing it.</p>;
  }
  if (detail.form !== null && "schemaVersion" in detail.form) {
    const pending = completionView.kind === WorkCompletionViewKind.Submitting;
    const blocked = pending ||
      completionView.kind === WorkCompletionViewKind.TransportFailed ||
      completionView.kind === WorkCompletionViewKind.Indeterminate ||
      completionView.kind === WorkCompletionViewKind.NotAccepted;
    return (
      <>
        <CompletionState view={completionView} onRetry={onRetry} />
        <Suspense fallback={<p role="status">Loading structured form…</p>}>
          <StructuredWorkForm
            key={structuredFormStateKey(detail.form)}
            form={detail.form}
            isDisabled={blocked}
            issues={completionView.kind === WorkCompletionViewKind.ValidationFailed
              ? completionView.issues
              : []}
            onSubmit={onComplete}
          />
        </Suspense>
      </>
    );
  }
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
  const refused = completionView.kind === WorkCompletionViewKind.NotAccepted;
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
            isDisabled={pending || retryable || refused}
          />
        ) : (
          <BooleanChoice
            label={field.key}
            name={field.key}
            {...(initial.kind === "boolean" ? { defaultValue: initial.value } : {})}
            isDisabled={pending || retryable || refused}
          />
        )}
        {retryable || refused ? null : (
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
  const retryRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    switch (view.kind) {
      case WorkCompletionViewKind.TransportFailed:
      case WorkCompletionViewKind.Indeterminate:
        retryRef.current?.focus();
        return;
      case WorkCompletionViewKind.NotAccepted:
      case WorkCompletionViewKind.Rejected:
        statusRef.current?.focus();
        return;
      case WorkCompletionViewKind.ValidationFailed:
      case WorkCompletionViewKind.Idle:
      case WorkCompletionViewKind.Submitting:
        return;
    }
  }, [view]);
  switch (view.kind) {
    case WorkCompletionViewKind.Idle:
    case WorkCompletionViewKind.Submitting:
      return null;
    case WorkCompletionViewKind.TransportFailed:
      return (
        <div className={styles.completionState} role="status">
          <p>Completion delivery is unknown. Retry the exact completion request.</p>
          <Button ref={retryRef} onPress={onRetry}>Retry completion</Button>
        </div>
      );
    case WorkCompletionViewKind.Indeterminate:
      return (
        <div className={styles.completionState} role="status">
          <p>Completion is indeterminate. Retry the exact completion request.</p>
          <Button ref={retryRef} onPress={onRetry}>Retry completion</Button>
        </div>
      );
    case WorkCompletionViewKind.Rejected:
      return (
        <p ref={statusRef} tabIndex={-1} className={styles.completionState} role="alert">
          {rejectedCompletionMessage(view.result)}
        </p>
      );
    case WorkCompletionViewKind.NotAccepted:
      return (
        <p ref={statusRef} tabIndex={-1} className={styles.completionState} role="alert">
          {view.message}
        </p>
      );
    case WorkCompletionViewKind.ValidationFailed:
      return null;
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

function structuredFormStateKey(
  form: Extract<NonNullable<PublicTaskDetail["form"]>, { schemaVersion: unknown }>,
): string {
  return JSON.stringify([
    form.catalogIdentity.processId,
    form.catalogIdentity.version,
    form.catalogIdentity.sourceSha256,
    form.catalogIdentity.semanticProfile,
    form.taskDefinition.elementId,
  ]);
}
