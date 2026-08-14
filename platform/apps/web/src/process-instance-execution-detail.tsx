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
import { downloadExecutionPublication } from "./process-execution-api.ts";
import type { ProcessExecutionApi } from "./process-execution-api.ts";
import { ProcessInstanceExecutionDiagram } from "./process-instance-execution-diagram.tsx";
import { ProcessInstanceExecutionHistory } from "./process-instance-execution-history.tsx";
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
  onBack: () => void;
  onUnavailable: (requested: PublicProcessInstanceIdentity, message: string) => void;
  state: ProcessExecutionDetailSelection;
}>;

/** Mounts History, Diagram, and export only after one fresh complete publication succeeds. */
export function ProcessInstanceExecutionDetailBoundary({
  api,
  definitionApi,
  onBack,
  onUnavailable,
  state,
}: ProcessInstanceExecutionDetailBoundaryProps) {
  if (state === null) return null;
  switch (state.kind) {
    case ProcessExecutionDetailLoadKind.Current:
      return (
        <ProcessInstanceExecutionDetail
          api={api}
          definitionApi={definitionApi}
          instance={state.instance}
          onBack={onBack}
          onUnavailable={(message) => { onUnavailable(state.instance, message); }}
          publication={state.publication}
        />
      );
    case ProcessExecutionDetailLoadKind.Pending:
      return (
        <ExecutionDetailStatus
          instance={state.requested}
          message="Loading the complete committed execution publication…"
          onBack={onBack}
          role="status"
        />
      );
    case ProcessExecutionDetailLoadKind.Failed:
      return (
        <ExecutionDetailStatus
          instance={state.requested}
          message={`Committed execution publication unavailable. ${state.message} History, Diagram, and export are suppressed.`}
          onBack={onBack}
          role="alert"
        />
      );
  }
}

type ProcessInstanceExecutionDetailProps = Readonly<{
  api: ProcessExecutionApi;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  instance: PublicProcessInstanceIdentity;
  onBack: () => void;
  onUnavailable: (message: string) => void;
  publication: ExecutionPublicationExport;
}>;

function ProcessInstanceExecutionDetail({
  api,
  definitionApi,
  instance,
  onBack,
  onUnavailable,
  publication,
}: ProcessInstanceExecutionDetailProps) {
  const [tab, setTab] = useState("overview");
  const [downloadStatus, setDownloadStatus] = useState<"pending" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const downloadRequests = useMemo(() => new LatestRequest(), []);

  useEffect(() => {
    queueFocus(heading.current);
    return () => {
      downloadRequests.invalidate();
      api.invalidate();
    };
  }, [api, downloadRequests, publication]);

  async function download(): Promise<void> {
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
    api.invalidate();
    setDownloadStatus(null);
    setTab(next);
  }

  return (
    <section className={styles.workspace} data-ui="process-execution-detail" aria-labelledby="process-execution-detail-heading">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Committed execution</p>
          <h2 id="process-execution-detail-heading" ref={heading} tabIndex={-1}>
            Process instance {instance.processInstanceId}
          </h2>
          <p><code>{instance.definition.processId}</code></p>
        </div>
        <Button variant={ButtonVariant.Secondary} onPress={onBack}>Back to Process instances</Button>
      </div>
      <WorkspaceTabs
        aria-label="Process instance detail"
        selectedKey={tab}
        onSelectionChange={selectTab}
        tabs={[{
          id: "overview",
          label: "Overview",
          content: (
            <ExecutionOverview
              busy={downloadStatus === "pending"}
              instance={instance}
              onDownload={() => { void download(); }}
              publication={publication}
            />
          ),
        }, {
          id: "history",
          label: "History",
          content: <ProcessInstanceExecutionHistory batches={publication.batches} />,
        }, {
          id: "diagram",
          label: "Diagram",
          content: (
            <ProcessInstanceExecutionDiagram
              api={definitionApi}
              current={publication.current}
              definition={instance.definition}
            />
          ),
        }]}
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
      <div className={styles.actions}>
        <Button isPending={busy} onPress={onDownload}>Download execution history</Button>
      </div>
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return <><dt>{label}</dt><dd><code>{value}</code></dd></>;
}

function ExecutionDetailStatus({
  instance,
  message,
  onBack,
  role,
}: Readonly<{
  instance: PublicProcessInstanceIdentity;
  message: string;
  onBack: () => void;
  role: "alert" | "status";
}>) {
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => { queueFocus(status.current); }, [message, role]);
  return (
    <section className={styles.workspace} data-ui="process-execution-load" aria-labelledby="process-execution-load-heading">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Committed execution verification</p>
          <h2 id="process-execution-load-heading">Process instance {instance.processInstanceId}</h2>
        </div>
        <Button variant={ButtonVariant.Secondary} onPress={onBack}>Back to Process instances</Button>
      </div>
      <p className={role === "alert" ? styles.error : styles.status} ref={status} role={role} tabIndex={-1}>{message}</p>
    </section>
  );
}

function queueFocus(element: HTMLElement | null): void {
  requestAnimationFrame(() => { element?.focus(); });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown execution publication failure";
}
