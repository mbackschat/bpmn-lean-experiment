import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import type {
  IncidentAuditEvent,
  IncidentAuditRequest,
  PublicIncident,
} from "@bpmn-lean/platform-contracts";
import {
  Button,
  ButtonVariant,
  DataTable,
  DataTableCardWidth,
  DataTableResponsiveMode,
} from "@bpmn-lean/platform-ui-kit";
import type { DataTableColumn } from "@bpmn-lean/platform-ui-kit";

import { LatestRequest } from "./latest-request.ts";
import {
  beginIncidentAuditLoad,
  resolveIncidentAuditFailureFocus,
  resolveIncidentAuditFocus,
} from "./incident-audit-load.ts";
import type {
  RequestedAuditFocus,
  ResolvedAuditFocus,
} from "./incident-audit-load.ts";
import type { IncidentOperationsApi } from "./incident-operations-api.ts";
import styles from "./incident-audit-panel.module.css";

export type IncidentAuditPanelProps = Readonly<{
  api: Pick<IncidentOperationsApi, "readAudit">;
  fixedIncident?: PublicIncident;
  isActive: boolean;
}>;

export function IncidentAuditPanel({
  api,
  fixedIncident,
  isActive,
}: IncidentAuditPanelProps) {
  const [events, setEvents] = useState<readonly IncidentAuditEvent[]>([]);
  const [request, setRequest] = useState<IncidentAuditRequest>(() =>
    fixedIncidentRequest(fixedIncident));
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(new LatestRequest());
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const errorAlert = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async (
    exact: IncidentAuditRequest,
    append: boolean,
    focus: RequestedAuditFocus,
  ) => {
    const activeLoad = beginIncidentAuditLoad(sequence.current, focus);
    setLoading(true);
    setError(null);
    try {
      const page = await api.readAudit(exact);
      if (!sequence.current.isCurrent(activeLoad.generation)) return;
      setEvents((current) => append ? [...current, ...page.events] : page.events);
      setNextCursor(page.nextCursor);
      setSearched(true);
      queueAuditFocus(
        resolveIncidentAuditFocus(sequence.current, activeLoad, page.events.length),
        heading.current,
        status.current,
        page.events[0],
      );
    } catch (cause: unknown) {
      if (resolveIncidentAuditFailureFocus(sequence.current, activeLoad) === null) return;
      setError(errorMessage(cause));
    } finally {
      if (sequence.current.isCurrent(activeLoad.generation)) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (error !== null) queueFocus(errorAlert.current);
  }, [error]);

  useEffect(() => {
    if (!isActive) {
      sequence.current.invalidate();
      return;
    }
    const exact = fixedIncidentRequest(fixedIncident);
    setRequest(exact);
    void load({ ...exact, limit: 25 }, false, null);
  }, [fixedIncident, isActive, load]);

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const exact = auditRequestFromForm(new FormData(event.currentTarget));
      setRequest(exact);
      void load({ ...exact, limit: 25 }, false, "heading");
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  function loadNext(): void {
    if (nextCursor === null) return;
    void load({ ...request, cursor: nextCursor, limit: 25 }, true, "firstNew");
  }

  return (
    <section className={styles.panel} data-ui="incident-audit" aria-labelledby={fixedIncident === undefined ? "incident-audit-heading" : "incident-detail-audit-heading"}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Platform action record</p>
          <h2
            id={fixedIncident === undefined ? "incident-audit-heading" : "incident-detail-audit-heading"}
            ref={heading}
            tabIndex={-1}
          >
            {fixedIncident === undefined ? "Incident action audit" : "Actions for this incident"}
          </h2>
          <p>These rows are platform actions. They do not prove that an incident is current.</p>
        </div>
      </div>

      {fixedIncident === undefined ? (
        <AuditFilters disabled={loading} onSubmit={applyFilters} />
      ) : null}

      <p ref={status} tabIndex={-1} className={styles.status} role="status">
        {loading ? "Loading incident action audit…" : searched ? `${events.length} platform action records shown.` : "Incident action audit is ready."}
      </p>
      {error === null ? null : <p role="alert" ref={errorAlert} tabIndex={-1} className={styles.error}>{error}</p>}
      {!loading && error === null && searched && events.length === 0
        ? <p className={styles.empty}>No platform incident actions match these filters.</p>
        : null}
      {events.length === 0 ? null : <IncidentAuditTable events={events} />}
      {nextCursor === null ? null : (
        <Button
          variant={ButtonVariant.Secondary}
          isDisabled={loading}
          onPress={loadNext}
        >
          Next audit page
        </Button>
      )}
    </section>
  );
}

function AuditFilters({
  disabled,
  onSubmit,
}: Readonly<{
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <form className={styles.filters} onSubmit={onSubmit}>
      <label>Actor ID<input disabled={disabled} name="actorId" /></label>
      <label>Hosting Process instance<input disabled={disabled} name="hostingProcessInstanceId" /></label>
      <label>Incident Process instance<input disabled={disabled} name="incidentProcessInstanceId" /></label>
      <label>Service Task element<input disabled={disabled} name="incidentElementId" /></label>
      <label>Activation<input disabled={disabled} min={1} name="incidentActivation" type="number" /></label>
      <label>Generation<input disabled={disabled} min={1} max={1} name="incidentGeneration" type="number" /></label>
      <label>
        Action
        <select disabled={disabled} name="actionKind" defaultValue="">
          <option value="">All actions</option>
          <option value="retryIncident">Retry</option>
          <option value="cancelIncidentProcess">Cancel Process</option>
        </select>
      </label>
      <Button type="submit" isDisabled={disabled}>Apply audit filters</Button>
    </form>
  );
}

function IncidentAuditTable({ events }: Readonly<{ events: readonly IncidentAuditEvent[] }>) {
  const columns: readonly DataTableColumn<IncidentAuditEvent>[] = [{
    id: "event",
    header: "Event",
    responsiveLabel: "Event",
    cell: (event) => <code data-audit-event-id={event.eventId} tabIndex={-1}>{event.eventId}</code>,
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
    header: "Incident",
    responsiveLabel: "Incident",
    cardWidth: DataTableCardWidth.Full,
    cell: (event) => <code>{auditIncidentLabel(event)}</code>,
  }, {
    id: "action",
    header: "Action",
    responsiveLabel: "Action",
    cell: (event) => <><code>{event.actionId}</code><br />{auditActionLabel(event.actionKind)}</>,
  }, {
    id: "outcome",
    header: "Outcome",
    responsiveLabel: "Outcome",
    cell: (event) => event.outcome,
  }];
  return (
    <DataTable
      aria-label="Incident action audit"
      columns={columns}
      responsiveMode={DataTableResponsiveMode.Cards}
      rowId={(event) => event.eventId}
      rows={events}
    />
  );
}

export function auditRequestFromForm(form: FormData): IncidentAuditRequest {
  const actorId = optionalText(form, "actorId");
  const hostingProcessInstanceId = optionalText(form, "hostingProcessInstanceId");
  const incidentProcessInstanceId = optionalText(form, "incidentProcessInstanceId");
  const incidentElementId = optionalText(form, "incidentElementId");
  const activation = optionalPositiveInteger(form, "incidentActivation");
  const generation = optionalPositiveInteger(form, "incidentGeneration");
  const suppliedIncidentFields = [
    incidentProcessInstanceId,
    incidentElementId,
    activation,
    generation,
  ].filter((value) => value !== undefined).length;
  if (suppliedIncidentFields !== 0 && suppliedIncidentFields !== 4) {
    throw new TypeError("Supply all four incident identity filters together.");
  }
  if (generation !== undefined && generation !== 1) {
    throw new TypeError("Incident generation must be 1.");
  }
  const actionKind = optionalText(form, "actionKind");
  if (
    actionKind !== undefined &&
    actionKind !== "retryIncident" &&
    actionKind !== "cancelIncidentProcess"
  ) {
    throw new TypeError("Unknown incident audit action.");
  }
  return {
    ...(actorId === undefined ? {} : { actorId }),
    ...(hostingProcessInstanceId === undefined ? {} : { hostingProcessInstanceId }),
    ...(incidentProcessInstanceId === undefined ? {} : {
      incidentProcessInstanceId,
      incidentElementId: incidentElementId!,
      incidentActivation: activation!,
      incidentGeneration: 1,
    }),
    ...(actionKind === undefined ? {} : { actionKind }),
  };
}

function fixedIncidentRequest(incident: PublicIncident | undefined): IncidentAuditRequest {
  if (incident === undefined) return {};
  const { effectId } = incident.incident.id;
  return {
    hostingProcessInstanceId: incident.hostingInstance.processInstanceId,
    incidentProcessInstanceId: effectId.processInstanceId,
    incidentElementId: effectId.elementId,
    incidentActivation: effectId.activation,
    incidentGeneration: incident.incident.id.generation,
  };
}

function optionalText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== "string") throw new TypeError(`${name} must be text.`);
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function optionalPositiveInteger(form: FormData, name: string): number | undefined {
  const text = optionalText(form, name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}

function auditIncidentLabel(event: IncidentAuditEvent): string {
  const { effectId } = event.incidentId;
  return `${effectId.processInstanceId} / ${effectId.elementId} / activation ${effectId.activation} / generation ${event.incidentId.generation}`;
}

function auditActionLabel(kind: IncidentAuditEvent["actionKind"]): string {
  switch (kind) {
    case "retryIncident":
      return "Retry";
    case "cancelIncidentProcess":
      return "Cancel Process";
  }
}

function queueAuditFocus(
  target: ResolvedAuditFocus,
  heading: HTMLElement | null,
  status: HTMLElement | null,
  firstEvent: IncidentAuditEvent | undefined,
): void {
  if (target === "heading") {
    queueFocus(heading);
  } else if (target === "firstNew") {
    requestAnimationFrame(() => {
      const first = firstEvent === undefined
        ? null
        : document.querySelector<HTMLElement>(`[data-audit-event-id="${CSS.escape(firstEvent.eventId)}"]`);
      (first ?? status)?.focus();
    });
  } else if (target === "status") {
    queueFocus(status);
  }
}

function queueFocus(element: HTMLElement | null): void {
  requestAnimationFrame(() => { element?.focus(); });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown incident audit failure";
}
