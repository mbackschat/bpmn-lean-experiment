import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ExecutionPublicationExport,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import {
  Button,
  ButtonVariant,
  WorkspaceTabs,
} from "@bpmn-lean/platform-ui-kit";

import type { DefinitionApiClient } from "./definitions-api.ts";
import { LatestRequest } from "./latest-request.ts";
import { MuePreviewAlphaProgress } from "./mue-preview-alpha-progress.tsx";
import type { OperatorAuditApi } from "./operator-audit-api.ts";
import { downloadExecutionPublication } from "./process-execution-api.ts";
import type { ProcessExecutionApi } from "./process-execution-api.ts";
import { ProcessInstanceExecutionDiagram } from "./process-instance-execution-diagram.tsx";
import { ProcessInstanceExecutionHistory } from "./process-instance-execution-history.tsx";
import { ProcessOperatorHistory } from "./process-operator-history.tsx";
import styles from "./process-instance-execution-detail.module.css";

export enum ProcessExecutionDetailLoadKind {
  Pending = "pending",
  Current = "current",
  Failed = "failed",
}

export type ProcessExecutionDetailLoadState =
  | Readonly<{
      kind: typeof ProcessExecutionDetailLoadKind.Pending;
      requested: PublicProcessInstanceIdentity;
    }>
  | Readonly<{
      kind: typeof ProcessExecutionDetailLoadKind.Current;
      instance: PublicProcessInstanceIdentity;
      publication: ExecutionPublicationExport;
    }>
  | Readonly<{
      kind: typeof ProcessExecutionDetailLoadKind.Failed;
      message: string;
      requested: PublicProcessInstanceIdentity;
    }>;

export type ProcessExecutionDetailSelection = ProcessExecutionDetailLoadState | null;

type PublishSelection = (state: ProcessExecutionDetailSelection) => void;

/** Corroborates a selected public identity with one fresh complete committed publication. */
export class ProcessExecutionDetailLoader {
  readonly #requests = new LatestRequest();

  async load(
    requested: PublicProcessInstanceIdentity,
    api: ProcessExecutionApi,
    publish: PublishSelection,
  ): Promise<void> {
    const generation = this.#requests.begin();
    publish({ kind: ProcessExecutionDetailLoadKind.Pending, requested });
    try {
      const publication = await api.getComplete(requested);
      if (this.#requests.isCurrent(generation)) {
        publish({
          kind: ProcessExecutionDetailLoadKind.Current,
          instance: requested,
          publication,
        });
      }
    } catch (cause: unknown) {
      if (this.#requests.isCurrent(generation)) {
        publish({
          kind: ProcessExecutionDetailLoadKind.Failed,
          message: errorMessage(cause),
          requested,
        });
      }
    }
  }

  async refresh(
    previous: Extract<ProcessExecutionDetailLoadState, { kind: "current" }>,
    api: ProcessExecutionApi,
    publish: PublishSelection,
  ): Promise<void> {
    const generation = this.#requests.begin();
    try {
      const publication = await api.getComplete(previous.instance);
      if (!this.#requests.isCurrent(generation)) return;
      if (publication.current.revision < previous.publication.current.revision) {
        throw new TypeError("committed execution revision regressed during polling");
      }
      publish({
        kind: ProcessExecutionDetailLoadKind.Current,
        instance: previous.instance,
        publication,
      });
    } catch (cause: unknown) {
      if (this.#requests.isCurrent(generation)) {
        publish({
          kind: ProcessExecutionDetailLoadKind.Failed,
          message: errorMessage(cause),
          requested: previous.instance,
        });
      }
    }
  }

  clear(api: ProcessExecutionApi, publish: PublishSelection): void {
    this.invalidate(api);
    publish(null);
  }

  invalidate(api: ProcessExecutionApi): void {
    this.#requests.invalidate();
    api.invalidate();
  }
}

export type ProcessInstanceExecutionDetailBoundaryProps = Readonly<{
  api: ProcessExecutionApi;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  operatorAuditApi: OperatorAuditApi;
  onBack: () => void;
  onUnavailable: (requested: PublicProcessInstanceIdentity, message: string) => void;
  state: ProcessExecutionDetailSelection;
}>;

/** Mounts History, Diagram, and export only after one fresh complete publication succeeds. */
export function ProcessInstanceExecutionDetailBoundary({
  api,
  definitionApi,
  operatorAuditApi,
  onBack,
  onUnavailable,
  state,
}: ProcessInstanceExecutionDetailBoundaryProps) {
  if (state === null) return null;
  const instance = state.kind === ProcessExecutionDetailLoadKind.Current
    ? state.instance
    : state.requested;
  return (
    <ProcessInstanceExecutionDetail
      api={api}
      definitionApi={definitionApi}
      instance={instance}
      onBack={onBack}
      onUnavailable={(message) => { onUnavailable(instance, message); }}
      operatorAuditApi={operatorAuditApi}
      state={state}
    />
  );
}

type ProcessInstanceExecutionDetailProps = Readonly<{
  api: ProcessExecutionApi;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  instance: PublicProcessInstanceIdentity;
  onBack: () => void;
  onUnavailable: (message: string) => void;
  operatorAuditApi: OperatorAuditApi;
  state: ProcessExecutionDetailLoadState;
}>;

function ProcessInstanceExecutionDetail({
  api,
  definitionApi,
  instance,
  onBack,
  onUnavailable,
  operatorAuditApi,
  state,
}: ProcessInstanceExecutionDetailProps) {
  const [tab, setTab] = useState("overview");
  const [downloadStatus, setDownloadStatus] = useState<"pending" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const interactiveFocusClaimed = useRef(false);
  const downloadRequests = useMemo(() => new LatestRequest(), []);

  useEffect(() => {
    interactiveFocusClaimed.current = false;
  }, [instance]);

  useEffect(() => {
    if (
      state.kind === ProcessExecutionDetailLoadKind.Current &&
      !interactiveFocusClaimed.current
    ) {
      queueFocusWhenUnowned(heading.current);
    }
  }, [instance, state.kind]);

  useEffect(() => {
    return () => {
      downloadRequests.invalidate();
      api.invalidate();
    };
  }, [api, downloadRequests, instance]);

  async function download(): Promise<void> {
    if (state.kind !== ProcessExecutionDetailLoadKind.Current) return;
    const generation = downloadRequests.begin();
    setDownloadStatus("pending");
    try {
      const exact = await api.getExport(instance);
      if (!downloadRequests.isCurrent(generation)) return;
      downloadExecutionPublication(exact);
    } catch (cause: unknown) {
      if (!downloadRequests.isCurrent(generation)) return;
      onUnavailable(errorMessage(cause));
    } finally {
      if (downloadRequests.isCurrent(generation)) setDownloadStatus(null);
    }
  }

  function selectTab(next: string): void {
    downloadRequests.invalidate();
    setDownloadStatus(null);
    setTab(next);
  }

  const semanticTabs = state.kind === ProcessExecutionDetailLoadKind.Current
    ? [{
        id: "overview",
        label: "Overview",
        content: (
          <ExecutionOverview
            busy={downloadStatus === "pending"}
            instance={instance}
            onDownload={() => { void download(); }}
            publication={state.publication}
          />
        ),
      }, {
        id: "history",
        label: "History",
        content: <ProcessInstanceExecutionHistory batches={state.publication.batches} />,
      }, {
        id: "diagram",
        label: "Diagram",
        content: (
          <ProcessInstanceExecutionDiagram
            api={definitionApi}
            current={state.publication.current}
            definition={instance.definition}
          />
        ),
      }]
    : [];
  const selectedTab = state.kind === ProcessExecutionDetailLoadKind.Current
    ? tab
    : "operator-history";
  const tabs = [...semanticTabs, {
    id: "operator-history",
    label: "Operator history",
    content: (
      <ProcessOperatorHistory
        api={operatorAuditApi}
        instance={instance}
        isActive={selectedTab === "operator-history"}
      />
    ),
  }];
  return (
    <section
      className={styles.workspace}
      data-ui="process-execution-detail"
      aria-labelledby="process-execution-detail-heading"
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement;
        const role = target.getAttribute("role");
        if (target !== heading.current && role !== "status" && role !== "alert") {
          interactiveFocusClaimed.current = true;
        }
        if (
          state.kind !== ProcessExecutionDetailLoadKind.Current &&
          target.closest('[data-key="operator-history"]') !== null
        ) {
          setTab("operator-history");
        }
      }}
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Confirmed Process instance</p>
          <h2 id="process-execution-detail-heading" ref={heading} tabIndex={-1}>
            Process instance {instance.processInstanceId}
          </h2>
          <p><code>{instance.definition.processId}</code></p>
        </div>
        <Button variant={ButtonVariant.Secondary} onPress={onBack}>Back to Process instances</Button>
      </div>
      <ExecutionAvailability state={state} />
      <WorkspaceTabs
        aria-label="Process instance detail"
        selectedKey={selectedTab}
        onSelectionChange={selectTab}
        tabs={tabs}
      />
    </section>
  );
}

function ExecutionOverview({
  busy,
  instance,
  onDownload,
  publication,
}: Readonly<{
  busy: boolean;
  instance: PublicProcessInstanceIdentity;
  onDownload: () => void;
  publication: ExecutionPublicationExport;
}>) {
  return (
    <section className={styles.overview} data-ui="execution-overview" aria-labelledby="execution-overview-heading">
      <div>
        <p className={styles.eyebrow}>Exact current fact</p>
        <h3 id="execution-overview-heading">Overview</h3>
      </div>
      <dl className={styles.facts}>
        <Fact label="Process-instance ID" value={instance.processInstanceId} />
        <Fact label="Process ID" value={instance.definition.processId} />
        <Fact label="Definition version" value={String(instance.definition.version)} />
        <Fact label="Source ID" value={instance.definition.source.id} />
        <Fact label="Source digest" value={instance.definition.source.sha256} />
        <Fact label="Semantic profile" value={instance.definition.semanticProfile} />
        <Fact label="Head revision" value={String(publication.headRevision)} />
        <Fact label="Current status" value={publication.current.state.status} />
      </dl>
      <MuePreviewAlphaProgress
        batches={publication.batches}
        current={publication.current}
      />
      <div className={styles.actions}>
        <Button isPending={busy} onPress={onDownload}>Download execution history</Button>
      </div>
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return <><dt>{label}</dt><dd><code>{value}</code></dd></>;
}

function ExecutionAvailability({ state }: Readonly<{ state: ProcessExecutionDetailLoadState }>) {
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.kind !== ProcessExecutionDetailLoadKind.Current) queueFocus(status.current);
  }, [state]);
  switch (state.kind) {
    case ProcessExecutionDetailLoadKind.Current:
      return null;
    case ProcessExecutionDetailLoadKind.Pending:
      return <p className={styles.status} ref={status} role="status" tabIndex={-1}>Loading the complete committed execution publication… Operator history remains independent.</p>;
    case ProcessExecutionDetailLoadKind.Failed:
      return <p className={styles.error} ref={status} role="alert" tabIndex={-1}>Committed execution publication unavailable. {state.message} Overview, History, Diagram, and execution export are suppressed. Operator history remains available.</p>;
  }
}

function queueFocus(element: HTMLElement | null): void {
  requestAnimationFrame(() => { element?.focus(); });
}

function queueFocusWhenUnowned(element: HTMLElement | null): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active === null || active === document.body || !active.isConnected) element?.focus();
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown execution publication failure";
}
