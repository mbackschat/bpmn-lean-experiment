import { createRef, useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { PublicIncident } from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import {
  IncidentDetailLoader,
  IncidentDetailLoadBoundary,
  IncidentDetailLoadKind,
} from "./incident-detail-load.tsx";
import type { IncidentDetailSelection } from "./incident-detail-load.tsx";
import { LatestRequest } from "./latest-request.ts";
import { IncidentCollection, incidentKey } from "./incident-collection.tsx";
import type { IncidentOperationsApi } from "./incident-operations-api.ts";
import type { DefinitionApiClient } from "./definitions-api.ts";
import styles from "./incidents-panel.module.css";
import type { OperationsSearch, WorkspaceNavigation } from "./navigation/route-search.ts";

export type IncidentsPanelProps = Readonly<{
  api: IncidentOperationsApi;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  isActive: boolean;
  navigation?: WorkspaceNavigation<OperationsSearch>;
}>;

export function IncidentsPanel({
  api,
  definitionApi,
  isActive,
  navigation,
}: IncidentsPanelProps) {
  const [incidents, setIncidents] = useState<readonly PublicIncident[]>([]);
  const [detailSelection, setDetailSelection] = useState<IncidentDetailSelection>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const requests = useRef(new LatestRequest());
  const detailLoader = useRef(new IncidentDetailLoader());
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocusKey = useRef<string | null>(null);
  const restoreCollectionFocus = useRef<Readonly<{ rowKey: string | null }> | null>(null);
  const rowRefs = useRef(new Map<string, RefObject<HTMLButtonElement | null>>());
  const selectionGeneration = useRef(0);
  const retainedAction = useRef(false);
  const requestedIncident = useRef<PublicIncident | null>(null);
  const active = useRef(isActive);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const routed = navigation !== undefined;
  const routeIncident = navigation?.search.incident;
  const latestNavigation = useRef(navigation);
  latestNavigation.current = navigation;

  const loadCollection = useCallback(async (focusHeading = false) => {
    const generation = requests.current.begin();
    setLoading(true);
    setError(null);
    try {
      const snapshot = await api.listIncidents();
      if (!requests.current.isCurrent(generation)) return;
      setIncidents(snapshot.incidents);
      if (focusHeading && active.current) queueFocus(heading.current);
    } catch (cause: unknown) {
      if (requests.current.isCurrent(generation)) setError(collectionErrorMessage(cause));
    } finally {
      if (requests.current.isCurrent(generation)) setLoading(false);
    }
  }, [api]);

  const openIncident = useCallback(async (incident: PublicIncident): Promise<void> => {
    if (retainedAction.current) return;
    selectionGeneration.current += 1;
    requestedIncident.current = incident;
    returnFocusKey.current = incidentKey(incident);
    setError(null);
    await detailLoader.current.load(
      incident,
      (incidentId) => api.getIncident(incidentId),
      setDetailSelection,
    );
  }, [api]);

  useEffect(() => {
    active.current = isActive;
    if (!isActive) {
      requests.current.invalidate();
      if (!routed && !retainedAction.current) {
        selectionGeneration.current += 1;
        requestedIncident.current = null;
        detailLoader.current.clear(setDetailSelection);
      }
      return;
    }
    if (!routed) void loadCollection();
    if (!routed && requestedIncident.current !== null && !retainedAction.current) {
      void openIncident(requestedIncident.current);
    }
    return () => {
      active.current = false;
      requests.current.invalidate();
      // Activity hides effects without discarding state; obsolete reads must not publish on return.
      detailLoader.current.clear(() => undefined);
    };
  }, [isActive, loadCollection, openIncident, routed]);

  useEffect(() => {
    if (!routed || !isActive || retainedAction.current) return;
    selectionGeneration.current += 1;
    requestedIncident.current = null;
    detailLoader.current.clear(setDetailSelection);
    setLookupError(null);
    if (routeIncident === undefined) {
      void loadCollection();
      return;
    }
    let current = true;
    void (async () => {
      try {
        const snapshot = await api.listIncidents();
        if (!current) return;
        setIncidents(snapshot.incidents);
        setLoading(false);
        const incident = snapshot.incidents.find((candidate) => incidentKey(candidate) === routeIncident);
        if (incident === undefined) throw new Error("No matching current public incident was found.");
        await openIncident(incident);
      } catch (cause: unknown) {
        if (current) setLookupError(collectionErrorMessage(cause));
      }
    })();
    return () => {
      current = false;
      detailLoader.current.clear(() => undefined);
    };
  }, [api, isActive, loadCollection, openIncident, routeIncident, routed]);

  useEffect(() => {
    const pending = restoreCollectionFocus.current;
    if (loading || detailSelection !== null || pending === null || (routed && routeIncident !== undefined)) return;
    const frame = requestAnimationFrame(() => {
      restoreCollectionFocus.current = null;
      const row = pending.rowKey === null
        ? null
        : rowRefs.current.get(pending.rowKey)?.current ?? null;
      (row ?? heading.current)?.focus();
    });
    return () => { cancelAnimationFrame(frame); };
  }, [detailSelection, incidents, loading, routeIncident, routed]);

  function backToCollection(): void {
    if (retainedAction.current) return;
    selectionGeneration.current += 1;
    requestedIncident.current = null;
    restoreCollectionFocus.current = { rowKey: returnFocusKey.current };
    clearRouteSelection();
    detailLoader.current.clear(setDetailSelection);
  }

  function clearRouteSelection(): void {
    const currentNavigation = latestNavigation.current;
    if (currentNavigation === undefined) return;
    const { incident: _incident, view: _view, ...search } = currentNavigation.search;
    currentNavigation.navigate(search);
    setLookupError(null);
  }

  async function committed(message: string, generation: number): Promise<void> {
    if (selectionGeneration.current !== generation) return;
    selectionGeneration.current += 1;
    requestedIncident.current = null;
    setAnnouncement(message);
    restoreCollectionFocus.current = { rowKey: null };
    clearRouteSelection();
    detailLoader.current.clear(setDetailSelection);
    if (active.current && !routed) await loadCollection(true);
  }

  const selectedIncident = detailSelection?.kind === IncidentDetailLoadKind.Current
    ? detailSelection.incident : detailSelection?.requested;
  if (routed && routeIncident !== undefined && (selectedIncident === undefined || incidentKey(selectedIncident) !== routeIncident)) {
    return (
      <section className={styles.panel}>
        <h2>Incident</h2>
        <Button variant={ButtonVariant.Secondary} onPress={backToCollection}>Back to incidents</Button>
        {lookupError === null
          ? <p role="status">Finding the current public incident…</p>
          : <p role="alert">Incident unavailable. {lookupError}</p>}
      </section>
    );
  }

  if (detailSelection !== null && (!routed || routeIncident !== undefined)) {
    const generation = selectionGeneration.current;
    return (
      <IncidentDetailLoadBoundary
        api={api}
        definitionApi={definitionApi}
        state={detailSelection}
        {...(navigation === undefined ? {} : { navigation })}
        onBack={backToCollection}
        onCommitted={(message) => { void committed(message, generation); }}
        onRetentionChange={(retained) => {
          if (selectionGeneration.current === generation) {
            retainedAction.current = retained;
            navigation?.retainSelection(retained && requestedIncident.current !== null ? incidentKey(requestedIncident.current) : null);
          }
        }}
        onRetry={(incident) => { void openIncident(incident); }}
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
          onSelect={(incident) => {
            if (navigation === undefined) void openIncident(incident);
            else navigation.navigate({ ...navigation.search, incident: incidentKey(incident), view: "overview" });
          }}
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

function collectionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown incident collection failure";
}
