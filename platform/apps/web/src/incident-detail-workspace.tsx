import { useEffect, useMemo, useRef, useState } from "react";

import type {
  IncidentActionRequest,
  IncidentActionResult,
  PublicIncident,
} from "@bpmn-lean/platform-contracts";
import {
  Button,
  ButtonVariant,
  ConfirmationDialog,
  WorkspaceTabs,
} from "@bpmn-lean/platform-ui-kit";

import {
  IncidentActionOperation,
  IncidentActionView,
  incidentActionView,
  retainedIncidentActionLabel,
} from "./incident-action-operation.ts";
import { incidentDetailPresentation } from "./incident-workspace-presentation.ts";
import { IncidentAuditPanel } from "./incident-audit-panel.tsx";
import { InteractionLabels } from "./incident-collection.tsx";
import type { IncidentOperationsApi } from "./incident-operations-api.ts";
import { DefinitionDiagram } from "./definition-diagram.tsx";
import type { DefinitionApiClient } from "./definitions-api.ts";
import styles from "./incident-detail-workspace.module.css";

export type IncidentDetailWorkspaceProps = Readonly<{
  api: IncidentOperationsApi;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  incident: PublicIncident;
  onBack: () => void;
  onCommitted: (announcement: string) => void;
}>;

type ActionNotice = Readonly<{
  message: string;
  retryable: boolean;
  view: IncidentActionView | "pending" | "transportFailure" | "verificationUnavailable";
}>;

export function IncidentDetailWorkspace({
  api,
  definitionApi,
  incident,
  onBack,
  onCommitted,
}: IncidentDetailWorkspaceProps) {
  const [current, setCurrent] = useState(incident);
  const [tab, setTab] = useState("overview");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [retainedKind, setRetainedKind] = useState<IncidentActionRequest["kind"] | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const operation = useMemo(() => new IncidentActionOperation(api), [api]);

  useEffect(() => {
    setCurrent(incident);
    queueFocus(heading.current);
  }, [incident]);

  useEffect(() => {
    if (actionNotice !== null) queueFocus(status.current);
  }, [actionNotice]);

  const retry = current.availableInteractions.find(({ kind }) => kind === "retryIncident");
  const cancel = current.availableInteractions.find(({ kind }) => kind === "cancelIncidentProcess");
  const noLongerCurrent = actionNotice?.view === IncidentActionView.RejectedNoLongerCurrent ||
    actionNotice?.view === "verificationUnavailable";
  const presentation = incidentDetailPresentation(noLongerCurrent);

  function start(interaction: IncidentActionRequest): void {
    operation.begin(crypto.randomUUID(), interaction);
    setRetainedKind(interaction.kind);
    void submitRetained(interaction.kind);
  }

  async function submitRetained(kind: IncidentActionRequest["kind"]): Promise<void> {
    setBusy(true);
    setActionNotice({
      message: `${interactionLabelFromKind(kind)} pending.`,
      retryable: false,
      view: "pending",
    });
    try {
      const result = await operation.submit();
      await handleResult(result);
    } catch (cause: unknown) {
      setActionNotice({
        message: `${interactionLabelFromKind(kind)} outcome is unknown after a transport failure. Submit the exact action again. ${errorMessage(cause)}`,
        retryable: true,
        view: "transportFailure",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleResult(result: IncidentActionResult): Promise<void> {
    switch (result.state) {
      case "committed":
        setRetainedKind(null);
        onCommitted(
          `${interactionLabelFromKind(result.interaction.kind)} action ${result.actionId} committed for incident ${incidentIdentityLabel(current)}.`,
        );
        return;
      case "indeterminate":
        setActionNotice({
          message: `${interactionLabelFromKind(result.interaction.kind)} outcome is indeterminate. Submit the exact action again.`,
          retryable: true,
          view: IncidentActionView.Indeterminate,
        });
        return;
      case "rejected":
        setRetainedKind(null);
        await handleRejection(result);
        return;
    }
  }

  async function handleRejection(
    result: Extract<IncidentActionResult, { state: "rejected" }>,
  ): Promise<void> {
    if (result.engineResult.kind === "processClosed") {
      setActionNotice({
        message: `Rejected, no longer current. The root Process is ${result.engineResult.status}.`,
        retryable: false,
        view: incidentActionView(result, false),
      });
      return;
    }
    try {
      const refreshed = await api.getIncident(current.incident.id);
      setCurrent(refreshed);
      setActionNotice({
        message: `${interactionLabelFromKind(result.interaction.kind)} rejected with ${result.engineResult.outcome}. This incident is still current.`,
        retryable: false,
        view: incidentActionView(result, true),
      });
    } catch (cause: unknown) {
      setActionNotice({
        message: `Rejected; the current incident could not be confirmed. ${errorMessage(cause)}`,
        retryable: false,
        view: "verificationUnavailable",
      });
    }
  }

  return (
    <section className={styles.workspace} data-ui="incident-detail" aria-labelledby="incident-detail-heading">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{presentation.eyebrow}</p>
          <h2 id="incident-detail-heading" ref={heading} tabIndex={-1}>
            Incident {current.incident.id.effectId.elementId}
          </h2>
          <p><code>{incidentIdentityLabel(current)}</code></p>
        </div>
        <Button variant={ButtonVariant.Secondary} onPress={onBack}>{presentation.backLabel}</Button>
      </div>

      <WorkspaceTabs
        aria-label="Incident detail"
        selectedKey={tab}
        onSelectionChange={setTab}
        tabs={[{
          id: "overview",
          label: "Overview",
          content: (
            <IncidentOverview
              actionNotice={actionNotice}
              busy={busy}
              incident={current}
              noLongerCurrent={noLongerCurrent}
              overviewLabel={presentation.overviewLabel}
              onCancel={() => { setConfirmationOpen(true); }}
              onRetry={() => {
                if (retry !== undefined) start(retry);
              }}
              onResubmit={() => {
                if (retainedKind !== null) void submitRetained(retainedKind);
              }}
              retainedKind={retainedKind}
              retryAvailable={retry !== undefined}
              cancelAvailable={cancel !== undefined}
              statusRef={status}
            />
          ),
        }, {
          id: "diagram",
          label: "Diagram",
          content: (
            <DefinitionDiagram
              activeElementId={current.incident.effect.id.elementId}
              api={definitionApi}
              definition={current.hostingInstance.definition}
            />
          ),
        }, {
          id: "audit",
          label: "Audit",
          content: (
            <IncidentAuditPanel
              api={api}
              fixedIncident={current}
              isActive={tab === "audit"}
            />
          ),
        }]}
      />

      <ConfirmationDialog
        cancelLabel="Keep Process running"
        confirmLabel="Cancel root Process"
        isOpen={confirmationOpen}
        title="Cancel root Process?"
        onCancel={() => { setConfirmationOpen(false); }}
        onConfirm={() => {
          setConfirmationOpen(false);
          if (cancel !== undefined) start(cancel);
        }}
      >
        <p>Cancelling stops the root Process and removes all remaining live work in that Process tree.</p>
        <p>Already committed data is preserved. This operation does not roll committed work back.</p>
      </ConfirmationDialog>
    </section>
  );
}

type IncidentOverviewProps = Readonly<{
  actionNotice: ActionNotice | null;
  busy: boolean;
  cancelAvailable: boolean;
  incident: PublicIncident;
  noLongerCurrent: boolean;
  overviewLabel: string;
  onCancel: () => void;
  onResubmit: () => void;
  onRetry: () => void;
  retainedKind: IncidentActionRequest["kind"] | null;
  retryAvailable: boolean;
  statusRef: React.RefObject<HTMLParagraphElement | null>;
}>;

function IncidentOverview({
  actionNotice,
  busy,
  cancelAvailable,
  incident,
  noLongerCurrent,
  overviewLabel,
  onCancel,
  onResubmit,
  onRetry,
  retainedKind,
  retryAvailable,
  statusRef,
}: IncidentOverviewProps) {
  const { effectId } = incident.incident.id;
  return (
    <section className={styles.overview} data-ui="incident-overview" aria-label={overviewLabel}>
      {noLongerCurrent ? null : (
        <dl className={styles.facts}>
          <div><dt>Process instance</dt><dd><code>{effectId.processInstanceId}</code></dd></div>
          <div><dt>Hosting Process instance</dt><dd><code>{incident.hostingInstance.processInstanceId}</code></dd></div>
          <div><dt>Service Task element</dt><dd><code>{effectId.elementId}</code></dd></div>
          <div><dt>Activation</dt><dd>{effectId.activation}</dd></div>
          <div><dt>Generation</dt><dd>{incident.incident.id.generation}</dd></div>
          <div><dt>Effect protocol</dt><dd><code>{incident.incident.effect.descriptor.protocol}</code></dd></div>
          <div><dt>Effect operation</dt><dd><code>{incident.incident.effect.descriptor.operation}</code></dd></div>
          <div><dt>Current interactions</dt><dd><InteractionLabels interactions={incident.availableInteractions} /></dd></div>
        </dl>
      )}
      {actionNotice === null ? null : (
        <p className={noticeClass(actionNotice)} role="status" ref={statusRef} tabIndex={-1}>
          {actionNotice.message}
        </p>
      )}
      {noLongerCurrent ? (
        <p className={styles.noLongerCurrent}>Return to Incidents to refresh the complete current snapshot.</p>
      ) : (
        <div className={styles.actions}>
          {operationNeedsRetry(actionNotice) && retainedKind !== null ? (
            <Button isDisabled={busy} onPress={onResubmit}>
              {retainedIncidentActionLabel(retainedKind)}
            </Button>
          ) : retryAvailable ? (
            <Button isDisabled={busy} onPress={onRetry}>
              Retry
            </Button>
          ) : null}
          {cancelAvailable && !operationNeedsRetry(actionNotice) ? (
            <Button isDisabled={busy} variant={ButtonVariant.Danger} onPress={onCancel}>
              Cancel Process
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function operationNeedsRetry(notice: ActionNotice | null): boolean {
  return notice?.retryable === true;
}

function noticeClass(notice: ActionNotice): string {
  switch (notice.view) {
    case IncidentActionView.Committed:
      return styles.success!;
    case IncidentActionView.Indeterminate:
    case "pending":
    case "transportFailure":
      return styles.warning!;
    case IncidentActionView.RejectedCurrent:
    case IncidentActionView.RejectedNoLongerCurrent:
    case "verificationUnavailable":
      return styles.error!;
  }
}

function incidentIdentityLabel(incident: PublicIncident): string {
  const { effectId } = incident.incident.id;
  return `${effectId.processInstanceId} / ${effectId.elementId} / activation ${effectId.activation} / generation ${incident.incident.id.generation}`;
}

function interactionLabelFromKind(kind: IncidentActionRequest["kind"]): string {
  switch (kind) {
    case "retryIncident":
      return "Retry";
    case "cancelIncidentProcess":
      return "Cancel Process";
  }
}

function queueFocus(element: HTMLElement | null): void {
  requestAnimationFrame(() => { element?.focus(); });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown incident operation failure";
}
