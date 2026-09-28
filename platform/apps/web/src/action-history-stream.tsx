import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { IncidentAuditEvent, WorkAuditEvent } from "@bpmn-lean/platform-contracts";
import { Button, DataTable, DataTableResponsiveMode, InlineDisclosure } from "@bpmn-lean/platform-ui-kit";
import type { DataTableColumn } from "@bpmn-lean/platform-ui-kit";
import { LatestRequest } from "./latest-request.ts";
import styles from "./action-history.module.css";

type HistoryRow = Readonly<{
  eventId: string;
  actorId: string;
  recordedAt: string;
  hostingProcessInstanceId: string;
  action: string;
  outcome: string;
  technical: WorkAuditEvent | IncidentAuditEvent;
}>;
type HistoryPage = Readonly<{ events: readonly HistoryRow[]; nextCursor: string | null }>;
type Props = Readonly<{ kind: "task" | "incident"; read: (cursor?: string) => Promise<HistoryPage> }>;

export function ActionHistoryStream({ kind, read }: Props) {
  const [events, setEvents] = useState<readonly HistoryRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requests = useRef(new LatestRequest());
  const busy = useRef(false);
  const cursors = useRef(new Set<string>());
  const status = useRef<HTMLParagraphElement>(null);
  const title = kind === "task" ? "Your task actions" : "Incident actions";
  const headingId = `${kind}-action-history-heading`;

  async function load(next?: string, focus = false) {
    if (busy.current) return;
    busy.current = true;
    const generation = requests.current.begin();
    setLoading(true);
    setError(null);
    try {
      const page = await read(next);
      if (!requests.current.isCurrent(generation)) return;
      const combined = next === undefined ? page.events : [...events, ...page.events];
      if (new Set(combined.map((event) => event.eventId)).size !== combined.length
        || (next !== undefined && page.nextCursor !== null && (page.nextCursor === next || cursors.current.has(page.nextCursor)))) {
        throw new Error("The history response repeats a page or event. Refresh history to try again.");
      }
      if (next === undefined) cursors.current.clear();
      else cursors.current.add(next);
      setEvents(combined);
      setCursor(page.nextCursor);
      setLoaded(true);
    } catch (cause: unknown) {
      if (requests.current.isCurrent(generation)) setError(cause instanceof Error ? cause.message : "The request could not be completed.");
    } finally {
      if (requests.current.isCurrent(generation)) {
        busy.current = false;
        setLoading(false);
        if (focus) requestAnimationFrame(() => { status.current?.focus(); });
      }
    }
  }

  useEffect(() => {
    busy.current = false;
    void load();
    return () => { requests.current.invalidate(); };
  }, [read]);

  return <section className={styles.stream} aria-labelledby={headingId}>
    <h3 id={headingId}>{title}</h3>
    <p>{kind === "task" ? "Only your task actions are shown here. Open a process to inspect its full action history."
      : "Recorded incident actions do not indicate whether an incident is still current."}</p>
    <p ref={status} tabIndex={-1} role="status">{loading ? `Loading ${kind} actions…` : `${events.length} recorded ${kind} actions shown.`}</p>
    {error === null ? null : <div className={styles.error}>
      <p role="alert">{kind === "task" ? "Task" : "Incident"} history unavailable. {error}</p>
      <Button onPress={() => { void load(loaded && cursor !== null ? cursor : undefined, true); }}>Retry {kind} history</Button>
    </div>}
    {loaded && events.length > 0 ? <DataTable aria-label={title} columns={columns}
      rows={events} rowId={(event) => event.eventId} responsiveMode={DataTableResponsiveMode.Cards}
      rowDetails={{ title: "details", content: (row) => <ActionDetails event={row.technical} /> }} /> : null}
    {loaded && !loading && error === null && events.length === 0 ? <div>
      <p>No {kind} actions match these filters.</p>
      {kind === "task" ? <p>Claim, release or complete a task, then refresh this history. <Link className={styles.link} to="/work" search={{}}>Open task inbox</Link></p>
        : <p>Incident actions appear after someone retries a failed service or cancels a process through its incident.</p>}
    </div> : null}
    {cursor === null || error !== null ? null : <Button isPending={loading} onPress={() => { void load(cursor, true); }}>Load more {kind} actions</Button>}
  </section>;
}

const columns: readonly DataTableColumn<HistoryRow>[] = [
  { id: "action", header: "Action", responsiveLabel: "Action", cell: (row) => row.action },
  { id: "outcome", header: "Outcome", responsiveLabel: "Outcome", cell: (row) => row.outcome },
  { id: "actor", header: "Person", responsiveLabel: "Person", cell: (row) => row.actorId },
  { id: "recorded", header: "Recorded at", responsiveLabel: "Recorded at", cell: (row) => <time dateTime={row.recordedAt}>{new Date(row.recordedAt).toLocaleString()}</time> },
  { id: "process", header: "Process instance", responsiveLabel: "Process instance", cell: (row) => <div className={styles.process}>
    <span>{row.hostingProcessInstanceId}</span>
    <Link className={styles.link} to="/operations" search={{ tab: "process-instances", instance: row.hostingProcessInstanceId, view: "operator-history" }}>View process</Link>
  </div> },
];

function ActionDetails({ event }: Readonly<{ event: WorkAuditEvent | IncidentAuditEvent }>) {
  const occurrence = "taskId" in event ? event.taskId : event.incidentId.effectId;
  return <>
    <dl className={styles.facts}>
      <div><dt>{"taskId" in event ? "Task" : "Service task"}</dt><dd>{occurrence.elementId}</dd></div>
      <div><dt>Occurrence</dt><dd>{occurrence.activation}</dd></div>
      <div><dt>Action ID</dt><dd>{"action" in event ? event.action.actionId : event.actionId}</dd></div>
      <div><dt>Event ID</dt><dd>{event.eventId}</dd></div>
    </dl>
    <InlineDisclosure title="raw record"><pre>{JSON.stringify(event, null, 2)}</pre></InlineDisclosure>
  </>;
}

export function taskHistoryRow(event: WorkAuditEvent): HistoryRow {
  let action: string;
  switch (event.action.kind) {
    case "claim": action = "Claim task"; break;
    case "release": action = "Release task"; break;
    case "completion": action = "Complete task"; break;
  }
  return { ...event, action, outcome: outcomeLabel(event.action.outcome), technical: event };
}

export function incidentHistoryRow(event: IncidentAuditEvent): HistoryRow {
  return { ...event, action: event.actionKind === "retryIncident" ? "Retry service" : "Cancel process",
    outcome: outcomeLabel(event.outcome), technical: event };
}

function outcomeLabel(outcome: WorkAuditEvent["action"]["outcome"] | IncidentAuditEvent["outcome"]): string {
  switch (outcome) {
    case "claimed": return "Claimed";
    case "released": return "Released";
    case "idempotent": return "Already applied";
    case "conflict": return "Not applied — conflicting action";
    case "reserved": return "Request recorded";
    case "committed": return "Completed successfully";
    case "rejected": return "Not applied";
    case "indeterminate": return "Outcome not yet confirmed";
  }
}
