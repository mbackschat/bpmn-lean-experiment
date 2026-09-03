import { Button, WorkspaceTabs } from "@bpmn-lean/platform-ui-kit";
import { DefinitionDeployStatus } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionDeployResult,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";
import { useState } from "react";
import type { FormEvent } from "react";

import { DefinitionDiagram } from "./definition-diagram";
import type { CorrelatedMessageApi } from "./correlated-message-api.ts";
import { CorrelatedMessagePanel } from "./correlated-message-panel.tsx";
import { DefinitionSchedulePanel } from "./definition-schedule-panel";
import { DefinitionStartPanel } from "./definition-start-panel";
import type { DefinitionScheduleApiClient } from "./definition-schedule-api";
import type { DefinitionApiClient } from "./definitions-api";
import type { FlowNodeMetricsApi } from "./flow-node-metrics-api.ts";
import { FlowNodeMetricsPanel } from "./flow-node-metrics-panel.tsx";
import type { MessageStartPublicationApiClient } from "./message-start-publication-api";
import { MessageStartPublicationPanel } from "./message-start-publication-panel";
import styles from "./definition-workspace.module.css";

export type DefinitionWorkspaceProps = Readonly<{
  api: DefinitionApiClient;
  correlatedMessageApi: CorrelatedMessageApi;
  definitions: ReadonlyArray<DeployedDefinitionVersion>;
  deployment: DefinitionDeployResult | null;
  error: string | null;
  loading: boolean;
  messageStartPublicationApi: MessageStartPublicationApiClient;
  metricsApi: FlowNodeMetricsApi;
  onDeploy: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onOpenDefinition: (definition: DeployedDefinitionVersion) => Promise<void>;
  onSelectVersion: (definition: DeployedDefinitionVersion) => void;
  scheduleApi: DefinitionScheduleApiClient;
  selected: DeployedDefinitionVersion | null;
  versions: ReadonlyArray<DeployedDefinitionVersion>;
}>;

export function DefinitionWorkspace({
  api,
  correlatedMessageApi,
  definitions,
  deployment,
  error,
  loading,
  messageStartPublicationApi,
  metricsApi,
  onDeploy,
  onOpenDefinition,
  onSelectVersion,
  scheduleApi,
  selected,
  versions,
}: DefinitionWorkspaceProps) {
  return (
    <div className={styles.workspace}>
      <section className={styles.toolbar} aria-label="Definition selection">
        <label>
          Definition
          <select
            value={selected?.processId ?? ""}
            disabled={definitions.length === 0}
            onChange={(event) => {
              const definition = definitions.find(({ processId }) =>
                processId === event.currentTarget.value
              );
              if (definition !== undefined) void onOpenDefinition(definition);
            }}
          >
            {definitions.length === 0 ? <option value="">No definitions</option> : null}
            {definitions.map((definition) => (
              <option key={definition.processId} value={definition.processId}>
                {definition.processId}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version
          <select
            value={selected?.version ?? ""}
            disabled={versions.length === 0}
            onChange={(event) => {
              const version = Number(event.currentTarget.value);
              const definition = versions.find((candidate) => candidate.version === version);
              if (definition !== undefined) onSelectVersion(definition);
            }}
          >
            {versions.map((version) => (
              <option key={version.version} value={version.version}>
                Version {version.version}
              </option>
            ))}
          </select>
        </label>
        <details className={styles.deployDisclosure}>
          <summary>Add BPMN definition</summary>
          <form className={styles.deployForm} onSubmit={(event) => { void onDeploy(event); }}>
            <label>
              BPMN XML file
              <input name="source" type="file" accept=".bpmn,application/bpmn+xml,application/xml,text/xml" required />
            </label>
            <label>
              Semantic profile ID
              <input name="semanticProfile" type="text" placeholder="parallel-fork-join-draft" required />
            </label>
            <Button type="submit" isPending={loading}>Deploy definition</Button>
          </form>
        </details>
      </section>
      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      {loading ? <p className={styles.loading} role="status">Refreshing definitions…</p> : null}
      <DeploymentResult result={deployment} />
      {selected === null ? (
        <section className={styles.empty}>
          <p>Select or deploy a definition to inspect it.</p>
        </section>
      ) : (
        <DefinitionDetails
          api={api}
          correlatedMessageApi={correlatedMessageApi}
          definition={selected}
          messageStartPublicationApi={messageStartPublicationApi}
          metricsApi={metricsApi}
          scheduleApi={scheduleApi}
        />
      )}
    </div>
  );
}

function DefinitionDetails({
  api,
  correlatedMessageApi,
  definition,
  messageStartPublicationApi,
  metricsApi,
  scheduleApi,
}: Readonly<{
  api: DefinitionApiClient;
  correlatedMessageApi: CorrelatedMessageApi;
  definition: DeployedDefinitionVersion;
  messageStartPublicationApi: MessageStartPublicationApiClient;
  metricsApi: FlowNodeMetricsApi;
  scheduleApi: DefinitionScheduleApiClient;
}>) {
  const [selectedTab, setSelectedTab] = useState("diagram");
  const tabs = [{
    id: "diagram",
    label: "Diagram",
    content: <DefinitionDiagram api={api} definition={definition} />,
  }, {
    id: "metrics",
    label: "Flow-node metrics",
    content: (
      <FlowNodeMetricsPanel
        active={selectedTab === "metrics"}
        definition={definition}
        definitionApi={api}
        metricsApi={metricsApi}
      />
    ),
  }, {
    id: "start",
    label: "Start",
    content: <DefinitionStartPanel api={api} definition={definition} />,
  }, {
    id: "triggers",
    label: "Triggers",
    content: (
      <div className={styles.triggerPanels}>
        <CorrelatedMessagePanel
          key={`correlated-message:${definition.processId}:${definition.version}`}
          api={correlatedMessageApi}
          definition={definition}
        />
        <MessageStartPublicationPanel
          key={`message-publication:${definition.processId}:${definition.version}`}
          api={messageStartPublicationApi}
          definition={definition}
        />
        <DefinitionSchedulePanel
          key={`schedule:${definition.processId}:${definition.version}`}
          api={scheduleApi}
          definition={definition}
        />
      </div>
    ),
  }];
  return (
    <section className={styles.details} aria-label={`${definition.processId}, version ${definition.version}`}>
      <WorkspaceTabs
        aria-label="Definition views"
        tabs={tabs}
        selectedKey={selectedTab}
        onSelectionChange={setSelectedTab}
      />
    </section>
  );
}

function DeploymentResult({ result }: Readonly<{ result: DefinitionDeployResult | null }>) {
  if (result === null) return null;
  switch (result.status) {
    case DefinitionDeployStatus.Deployed:
      return (
        <section className={`${styles.result} ${styles.accepted}`} aria-live="polite">
          <strong>Admitted and deployed</strong>
          <span>{result.definition.processId}, version {result.definition.version}</span>
        </section>
      );
    case DefinitionDeployStatus.Rejected:
      return (
        <section className={`${styles.result} ${styles.rejected}`} aria-live="polite">
          <strong>Not deployed</strong>
          <p>The engine returned {result.diagnostics.length} admission finding{result.diagnostics.length === 1 ? "" : "s"}.</p>
          <ol>
            {result.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}:${index}`}>
                <code>{diagnostic.code}</code>: {diagnostic.evidence}
                {diagnostic.element === null ? null : (
                  <small>Element {diagnostic.element.id ?? "without ID"}, {diagnostic.element.containmentPath}</small>
                )}
              </li>
            ))}
          </ol>
        </section>
      );
  }
}
