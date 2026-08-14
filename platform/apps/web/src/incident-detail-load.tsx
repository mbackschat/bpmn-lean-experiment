import { useEffect, useRef } from "react";

import type { PublicEffectIncidentId, PublicIncident } from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import { IncidentDetailWorkspace } from "./incident-detail-workspace.tsx";
import type { IncidentOperationsApi } from "./incident-operations-api.ts";
import type { DefinitionApiClient } from "./definitions-api.ts";
import { LatestRequest } from "./latest-request.ts";
import styles from "./incidents-panel.module.css";

export enum IncidentDetailLoadKind {
  Pending = "pending",
  Current = "current",
  Failed = "failed",
}

export type IncidentDetailLoadState =
  | Readonly<{
      kind: IncidentDetailLoadKind.Pending;
      requested: PublicIncident;
    }>
  | Readonly<{
      kind: IncidentDetailLoadKind.Current;
      incident: PublicIncident;
    }>
  | Readonly<{
      kind: IncidentDetailLoadKind.Failed;
      message: string;
      requested: PublicIncident;
    }>;

export type IncidentDetailSelection = IncidentDetailLoadState | null;

type PublishDetailSelection = (state: IncidentDetailSelection) => void;
type GetIncident = (incidentId: PublicEffectIncidentId) => Promise<PublicIncident>;

/** Owns request currency so abandoned collection rows can never become actionable detail. */
export class IncidentDetailLoader {
  readonly #requests = new LatestRequest();

  async load(
    requested: PublicIncident,
    getIncident: GetIncident,
    publish: PublishDetailSelection,
  ): Promise<void> {
    const generation = this.#requests.begin();
    publish({ kind: IncidentDetailLoadKind.Pending, requested });
    try {
      const incident = await getIncident(requested.incident.id);
      if (this.#requests.isCurrent(generation)) {
        publish({ kind: IncidentDetailLoadKind.Current, incident });
      }
    } catch (cause: unknown) {
      if (this.#requests.isCurrent(generation)) {
        publish({
          kind: IncidentDetailLoadKind.Failed,
          message: errorMessage(cause),
          requested,
        });
      }
    }
  }

  clear(publish: PublishDetailSelection): void {
    this.#requests.invalidate();
    publish(null);
  }
}

export type IncidentDetailLoadBoundaryProps = Readonly<{
  api: IncidentOperationsApi;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  onBack: () => void;
  onCommitted: (announcement: string) => void;
  onRetry: (incident: PublicIncident) => void;
  state: IncidentDetailSelection;
}>;

/** Mounts incident actions only for detail corroborated by a fresh exact-detail response. */
export function IncidentDetailLoadBoundary({
  api,
  definitionApi,
  onBack,
  onCommitted,
  onRetry,
  state,
}: IncidentDetailLoadBoundaryProps) {
  if (state === null) return null;
  switch (state.kind) {
    case IncidentDetailLoadKind.Current:
      return (
        <IncidentDetailWorkspace
          api={api}
          definitionApi={definitionApi}
          incident={state.incident}
          onBack={onBack}
          onCommitted={onCommitted}
        />
      );
    case IncidentDetailLoadKind.Pending:
      return (
        <IncidentDetailStatus
          incident={state.requested}
          message="Confirming that this incident is still current…"
          onBack={onBack}
          statusRole="status"
        />
      );
    case IncidentDetailLoadKind.Failed:
      return (
        <IncidentDetailStatus
          incident={state.requested}
          message={`Current incident detail could not be confirmed. ${state.message}`}
          onBack={onBack}
          onRetry={() => { onRetry(state.requested); }}
          statusRole="alert"
        />
      );
  }
}

type IncidentDetailStatusProps = Readonly<{
  incident: PublicIncident;
  message: string;
  onBack: () => void;
  onRetry?: () => void;
  statusRole: "alert" | "status";
}>;

function IncidentDetailStatus({
  incident,
  message,
  onBack,
  onRetry,
  statusRole,
}: IncidentDetailStatusProps) {
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    queueFocus(status.current);
  }, [message, statusRole]);

  return (
    <section className={styles.panel} data-ui="incident-detail-load" aria-labelledby="incident-detail-load-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Incident detail verification</p>
          <h2 id="incident-detail-load-heading" tabIndex={-1}>
            Incident {incident.incident.id.effectId.elementId}
          </h2>
        </div>
        <Button variant={ButtonVariant.Secondary} onPress={onBack}>Back to incidents</Button>
      </div>
      <p
        role={statusRole}
        className={statusRole === "alert" ? styles.error : styles.status}
        ref={status}
        tabIndex={-1}
      >
        {message}
      </p>
      {onRetry === undefined ? null : (
        <div>
          <Button variant={ButtonVariant.Secondary} onPress={onRetry}>Retry incident detail</Button>
        </div>
      )}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown incident operations failure";
}

function queueFocus(element: HTMLElement | null): void {
  requestAnimationFrame(() => { element?.focus(); });
}
