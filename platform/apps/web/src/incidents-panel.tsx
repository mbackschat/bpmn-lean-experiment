import { createRef, useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { PublicIncident } from "@bpmn-lean/platform-contracts";

import { incidentSelectionAfterTabChange } from "./incident-workspace-presentation.ts";
import { LatestRequest } from "./latest-request.ts";
import { IncidentCollection, incidentKey } from "./incident-collection.tsx";
import { IncidentDetailWorkspace } from "./incident-detail-workspace.tsx";
import type { IncidentOperationsApi } from "./incident-operations-api.ts";
import type { DefinitionApiClient } from "./definitions-api.ts";
import styles from "./incidents-panel.module.css";

export type IncidentsPanelProps = Readonly<{
  api: IncidentOperationsApi;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  isActive: boolean;
}>;

export function IncidentsPanel({
  api,
  definitionApi,
  isActive,
}: IncidentsPanelProps) {
  const [incidents, setIncidents] = useState<readonly PublicIncident[]>([]);
  const [selected, setSelected] = useState<PublicIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const requests = useRef(new LatestRequest());
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocusKey = useRef<string | null>(null);
  const restoreCollectionFocus = useRef<Readonly<{ rowKey: string | null }> | null>(null);
  const rowRefs = useRef(new Map<string, RefObject<HTMLButtonElement | null>>());

  const loadCollection = useCallback(async (focusHeading = false) => {
    const generation = requests.current.begin();
    setLoading(true);
    setError(null);
    try {
      const snapshot = await api.listIncidents();
      if (!requests.current.isCurrent(generation)) return;
      setIncidents(snapshot.incidents);
      if (focusHeading) queueFocus(heading.current);
    } catch (cause: unknown) {
      if (requests.current.isCurrent(generation)) setError(errorMessage(cause));
    } finally {
      if (requests.current.isCurrent(generation)) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!isActive) {
      requests.current.invalidate();
      setSelected((current) => incidentSelectionAfterTabChange(false, current));
      return;
    }
    void loadCollection();
  }, [isActive, loadCollection]);

  useEffect(() => {
    const pending = restoreCollectionFocus.current;
    if (selected !== null || pending === null) return;
    restoreCollectionFocus.current = null;
    const row = pending.rowKey === null
      ? null
      : rowRefs.current.get(pending.rowKey)?.current ?? null;
    queueFocus(row ?? heading.current);
  }, [selected]);

  async function openIncident(incident: PublicIncident): Promise<void> {
    returnFocusKey.current = incidentKey(incident);
    setSelected(incident);
    setError(null);
    const generation = requests.current.begin();
    try {
      const detail = await api.getIncident(incident.incident.id);
      if (requests.current.isCurrent(generation)) setSelected(detail);
    } catch (cause: unknown) {
      if (requests.current.isCurrent(generation)) setError(errorMessage(cause));
    }
  }

  function backToCollection(): void {
    requests.current.invalidate();
    restoreCollectionFocus.current = { rowKey: returnFocusKey.current };
    setSelected(null);
  }

  async function committed(message: string): Promise<void> {
    setAnnouncement(message);
    setSelected(null);
    await loadCollection(true);
  }

  if (selected !== null) {
    return (
      <IncidentDetailWorkspace
        api={api}
        definitionApi={definitionApi}
        incident={selected}
        onBack={backToCollection}
        onCommitted={(message) => { void committed(message); }}
      />
    );
  }

  return (
    <section className={styles.panel} data-ui="incident-collection" aria-labelledby="current-incidents-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Complete engine snapshot</p>
          <h2 id="current-incidents-heading" ref={heading} tabIndex={-1}>Current incidents</h2>
          <p>Inspect failed Service Task effects before selecting an operation.</p>
        </div>
      </div>
      {announcement === null ? null : <p role="status" className={styles.success}>{announcement}</p>}
      {loading ? <p role="status" className={styles.status}>Loading current incidents…</p> : null}
      {error === null ? null : <p role="alert" className={styles.error}>{error}</p>}
      {!loading && error === null && incidents.length === 0
        ? <p className={styles.empty}>No current incidents.</p>
        : null}
      {incidents.length === 0 ? null : (
        <IncidentCollection
          incidents={incidents}
          onSelect={(incident) => { void openIncident(incident); }}
          rowRef={(incident) => {
            const key = incidentKey(incident);
            const existing = rowRefs.current.get(key);
            if (existing !== undefined) return existing;
            const created = createRef<HTMLButtonElement>();
            rowRefs.current.set(key, created);
            return created;
          }}
        />
      )}
    </section>
  );
}

function queueFocus(element: HTMLElement | null): void {
  requestAnimationFrame(() => { element?.focus(); });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown incident operations failure";
}
