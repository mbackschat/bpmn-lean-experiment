import { useEffect, useMemo, useRef, useState } from "react";

import type {
  IncidentAuditEvent,
  OperatorAuditExport,
  PublicProcessInstanceIdentity,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import {
  Button,
  DataTable,
  DataTableCardWidth,
  DataTableResponsiveMode,
} from "@bpmn-lean/platform-ui-kit";
import type { DataTableColumn } from "@bpmn-lean/platform-ui-kit";

import { LatestRequest } from "./latest-request.ts";
import {
  downloadOperatorAudit,
} from "./operator-audit-api.ts";
import type {
  OperatorAuditApi,
  OperatorAuditDownload,
} from "./operator-audit-api.ts";
import styles from "./process-operator-history.module.css";

export type ProcessOperatorHistoryProps = Readonly<{
  api: OperatorAuditApi;
  instance: PublicProcessInstanceIdentity;
  isActive: boolean;
}>;

enum OperatorHistoryLoadKind {
  Pending = "pending",
  Current = "current",
  Failed = "failed",
}

type OperatorHistoryLoadState =
  | Readonly<{ kind: OperatorHistoryLoadKind.Pending }>
  | Readonly<{ kind: OperatorHistoryLoadKind.Current; download: OperatorAuditDownload }>
  | Readonly<{ kind: OperatorHistoryLoadKind.Failed; message: string }>;

/** Instance-local platform action history, independent from semantic execution publication. */
export function ProcessOperatorHistory({ api, instance, isActive }: ProcessOperatorHistoryProps) {
  const [state, setState] = useState<OperatorHistoryLoadState>({
    kind: OperatorHistoryLoadKind.Pending,
  });
  const requests = useMemo(() => new LatestRequest(), []);
  const failure = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const generation = requests.begin();
    setState({ kind: OperatorHistoryLoadKind.Pending });
    void api.get(instance).then((download) => {
      if (requests.isCurrent(generation)) {
        setState({ kind: OperatorHistoryLoadKind.Current, download });
      }
    }, (cause: unknown) => {
      if (requests.isCurrent(generation)) {
        setState({ kind: OperatorHistoryLoadKind.Failed, message: errorMessage(cause) });
      }
    });
    return () => {
      requests.invalidate();
      api.invalidate();
    };
  }, [api, instance, requests]);

  useEffect(() => {
    if (isActive && state.kind === OperatorHistoryLoadKind.Failed) {
      requestAnimationFrame(() => { failure.current?.focus(); });
    }
  }, [isActive, state]);

  return (
    <section className={styles.history} data-ui="operator-history" aria-labelledby="operator-history-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Platform action record</p>
          <h3 id="operator-history-heading">Operator history</h3>
          <p>Two independently captured source-local streams. Their timestamps and positions do not establish a merged or causal chronology.</p>
        </div>
        {state.kind === OperatorHistoryLoadKind.Current ? (
          <Button onPress={() => { downloadOperatorAudit(state.download); }}>
            Download operator audit
          </Button>
        ) : null}
      </div>
      <OperatorHistoryState state={state} failure={failure} />
    </section>
  );
}

function OperatorHistoryState({
  failure,
  state,
}: Readonly<{
  failure: React.RefObject<HTMLParagraphElement | null>;
  state: OperatorHistoryLoadState;
}>) {
  switch (state.kind) {
    case OperatorHistoryLoadKind.Pending:
      return <p className={styles.status} role="status">Loading the complete operator audit…</p>;
    case OperatorHistoryLoadKind.Current:
      return <OperatorAuditCollections value={state.download.value} />;
    case OperatorHistoryLoadKind.Failed:
      return (
        <p className={styles.error} ref={failure} role="alert" tabIndex={-1}>
          Operator audit unavailable. {state.message}
        </p>
      );
  }
}

/** Renders source arrays exactly as received, without timestamp sorting or interleaving. */
export function OperatorAuditCollections({ value }: Readonly<{ value: OperatorAuditExport }>) {
  return (
    <div className={styles.collections}>
      <AuditCollectionHeading
        count={value.work.events.length}
        headEventId={value.work.headEventId}
        id="work-actions-heading"
        label="Work actions"
      />
      {value.work.events.length === 0 ? (
        <p className={styles.empty}>No Work actions were captured through this empty head.</p>
      ) : (
        <WorkActionsTable events={value.work.events} />
      )}
      <AuditCollectionHeading
        count={value.incidentActions.events.length}
        headEventId={value.incidentActions.headEventId}
        id="incident-actions-heading"
        label="Incident actions"
      />
      {value.incidentActions.events.length === 0 ? (
        <p className={styles.empty}>No incident actions were captured through this empty head.</p>
      ) : (
        <IncidentActionsTable events={value.incidentActions.events} />
      )}
    </div>
  );
}

function AuditCollectionHeading({
  count,
  headEventId,
  id,
  label,
}: Readonly<{
  count: number;
  headEventId: string | null;
  id: string;
  label: string;
}>) {
  return (
    <div className={styles.collectionHeading}>
      <h4 id={id}>{label} ({count})</h4>
      <p>{headEventId === null ? "Captured head: empty" : <>Captured head <code>{headEventId}</code></>}</p>
    </div>
  );
}

function WorkActionsTable({ events }: Readonly<{ events: readonly WorkAuditEvent[] }>) {
  return (
    <DataTable
      aria-label="Work actions"
      columns={workColumns}
      responsiveMode={DataTableResponsiveMode.Cards}
      rowId={(event) => event.eventId}
      rows={events}
    />
  );
}

const workColumns: readonly DataTableColumn<WorkAuditEvent>[] = [{
  id: "event",
  header: "Event",
  responsiveLabel: "Event",
  cell: (event) => <code>{event.eventId}</code>,
}, {
  id: "recorded",
  header: "Recorded",
  responsiveLabel: "Recorded",
  cell: (event) => <time dateTime={event.recordedAt}>{event.recordedAt}</time>,
}, {
  id: "actor",
  header: "Actor",
  responsiveLabel: "Actor",
  cell: (event) => <code>{event.actorId}</code>,
}, {
  id: "hosting",
  header: "Hosting Process instance",
  responsiveLabel: "Hosting Process instance",
  cell: (event) => <code>{event.hostingProcessInstanceId}</code>,
}, {
  id: "task",
  header: "Task occurrence",
  responsiveLabel: "Task occurrence",
  cardWidth: DataTableCardWidth.Full,
  cell: (event) => <code>{occurrenceLabel(event.taskId)}</code>,
}, {
  id: "action",
  header: "Action",
  responsiveLabel: "Action",
  cell: (event) => <><code>{event.action.actionId}</code><br />{workActionLabel(event)}</>,
}, {
  id: "outcome",
  header: "Outcome",
  responsiveLabel: "Outcome",
  cell: (event) => event.action.outcome,
}];

function IncidentActionsTable({ events }: Readonly<{ events: readonly IncidentAuditEvent[] }>) {
  return (
    <DataTable
      aria-label="Incident actions"
      columns={incidentColumns}
      responsiveMode={DataTableResponsiveMode.Cards}
      rowId={(event) => event.eventId}
      rows={events}
    />
  );
}

const incidentColumns: readonly DataTableColumn<IncidentAuditEvent>[] = [{
  id: "event",
  header: "Event",
  responsiveLabel: "Event",
  cell: (event) => <code>{event.eventId}</code>,
}, {
  id: "recorded",
  header: "Recorded",
  responsiveLabel: "Recorded",
  cell: (event) => <time dateTime={event.recordedAt}>{event.recordedAt}</time>,
}, {
  id: "actor",
  header: "Actor",
  responsiveLabel: "Actor",
  cell: (event) => <code>{event.actorId}</code>,
}, {
  id: "hosting",
  header: "Hosting Process instance",
  responsiveLabel: "Hosting Process instance",
  cell: (event) => <code>{event.hostingProcessInstanceId}</code>,
}, {
  id: "incident",
  header: "Incident occurrence",
  responsiveLabel: "Incident occurrence",
  cardWidth: DataTableCardWidth.Full,
  cell: (event) => <code>{incidentLabel(event)}</code>,
}, {
  id: "action",
  header: "Action",
  responsiveLabel: "Action",
  cell: (event) => <><code>{event.actionId}</code><br />{incidentActionLabel(event)}</>,
}, {
  id: "outcome",
  header: "Outcome",
  responsiveLabel: "Outcome",
  cell: (event) => event.outcome,
}];

function occurrenceLabel(value: WorkAuditEvent["taskId"]): string {
  return `${value.processInstanceId} / ${value.elementId} / activation ${value.activation}`;
}

function incidentLabel(event: IncidentAuditEvent): string {
  const { effectId } = event.incidentId;
  return `${effectId.processInstanceId} / ${effectId.elementId} / activation ${effectId.activation} / generation ${event.incidentId.generation}`;
}

function workActionLabel(event: WorkAuditEvent): string {
  switch (event.action.kind) {
    case "claim": return "Claim";
    case "release": return "Release";
    case "completion": return "Complete";
  }
}

function incidentActionLabel(event: IncidentAuditEvent): string {
  switch (event.actionKind) {
    case "retryIncident": return "Retry";
    case "cancelIncidentProcess": return "Cancel Process";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown operator audit failure";
}
