import { Button, ButtonVariant, ModalDialog, WorkspaceTabs } from "@bpmn-lean/platform-ui-kit";
import { DefinitionDeployStatus } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionDeployResult,
  DeployedDefinitionVersion,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import { useEffect, useRef, useState } from "react";
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
import type { DefinitionSearch, WorkspaceNavigation } from "./navigation/route-search.ts";
import { findProcessShowcase } from "./process-showcase-catalog.ts";
import styles from "./definition-workspace.module.css";

export type DefinitionWorkspaceProps = Readonly<{
  navigation?: WorkspaceNavigation<DefinitionSearch>;
  api: DefinitionApiClient;
  correlatedMessageApi: CorrelatedMessageApi;
  definitions: ReadonlyArray<DeployedDefinitionVersion>;
  deployment: DefinitionDeployResult | null;
  error: string | null;
  loading: boolean;
  messageStartPublicationApi: MessageStartPublicationApiClient;
  metricsApi: FlowNodeMetricsApi;
  onDeploy: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onOpenDefinition: (definition: DeployedDefinitionVersion) => Promise<void>;
  onOpenInstance?: (instance: PublicProcessInstanceIdentity) => void;
  onSelectVersion: (definition: DeployedDefinitionVersion) => void;
  scheduleApi: DefinitionScheduleApiClient;
  selected: DeployedDefinitionVersion | null;
  versions: ReadonlyArray<DeployedDefinitionVersion>;
}>;

export function DefinitionWorkspace({
  api,
  navigation,
  correlatedMessageApi,
  definitions,
  deployment,
  error,
  loading,
  messageStartPublicationApi,
  metricsApi,
  onDeploy,
  onOpenDefinition,
  onOpenInstance,
  onSelectVersion,
  scheduleApi,
  selected,
  versions,
}: DefinitionWorkspaceProps) {
  const [deployOpen, setDeployOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  async function submitDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deploying) return;
    setDeploying(true);
    try {
      if (await onDeploy(event)) setDeployOpen(false);
    } finally {
      setDeploying(false);
    }
  }
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
      </section>
      <section className={styles.addDefinition} aria-label="Add a new definition">
        <p>Or upload a new process model</p>
        <Button variant={ButtonVariant.Secondary} onPress={() => setDeployOpen(true)}>Add BPMN definition</Button>
      </section>
      <ModalDialog isOpen={deployOpen} title="Add BPMN definition" isDismissable={!deploying} onCancel={() => setDeployOpen(false)}>
        <p>Choose a BPMN file and the semantic profile it uses. Deployment adds the definition; it does not start a process.</p>
        <form className={styles.deployForm} onSubmit={(event) => { void submitDeployment(event); }}>
          <label>
            BPMN XML file
            <input autoFocus disabled={deploying} name="source" type="file" accept=".bpmn,application/bpmn+xml,application/xml,text/xml" required />
          </label>
          <label>
            Semantic profile ID
            <input disabled={deploying} name="semanticProfile" type="text" placeholder="parallel-fork-join-draft" required />
          </label>
          {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
          {deployment?.status === DefinitionDeployStatus.Rejected ? <DeploymentResult result={deployment} /> : null}
          {deploying ? <p role="status">Deploying… Please wait for the result before closing this dialog.</p> : null}
          <div className={styles.deployActions}>
            <Button variant={ButtonVariant.Secondary} isDisabled={deploying} onPress={() => setDeployOpen(false)}>Cancel</Button>
            <Button type="submit" isPending={deploying}>Deploy definition</Button>
          </div>
        </form>
      </ModalDialog>
      {error === null || deployOpen ? null : <p className={styles.error} role="alert">{error}</p>}
      {loading ? <p className={styles.loading} role="status">Refreshing definitions…</p> : null}
      {deployOpen ? null : <DeploymentResult result={deployment} />}
      {selected === null ? (
        <section className={styles.empty}>
          <p>Select or deploy a definition to inspect it.</p>
        </section>
      ) : (
        <DefinitionDetails
          key={selected.processId}
          api={api}
          {...(navigation === undefined ? {} : { navigation })}
          correlatedMessageApi={correlatedMessageApi}
          definition={selected}
          {...(onOpenInstance === undefined ? {} : { onOpenInstance })}
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
  navigation,
  correlatedMessageApi,
  definition,
  onOpenInstance,
  messageStartPublicationApi,
  metricsApi,
  scheduleApi,
}: Readonly<{
  navigation?: WorkspaceNavigation<DefinitionSearch>;
  api: DefinitionApiClient;
  correlatedMessageApi: CorrelatedMessageApi;
  definition: DeployedDefinitionVersion;
  onOpenInstance?: (instance: PublicProcessInstanceIdentity) => void;
  messageStartPublicationApi: MessageStartPublicationApiClient;
  metricsApi: FlowNodeMetricsApi;
  scheduleApi: DefinitionScheduleApiClient;
}>) {
  const [localTab, setLocalTab] = useState("diagram");
  const details = useRef<HTMLElement>(null);
  const focusStart = useRef(false);
  const showcase = findProcessShowcase(definition);
  const selectedTab = navigation?.search.tab ?? localTab;
  useEffect(() => {
    if (selectedTab === "start" && focusStart.current) {
      details.current?.querySelector<HTMLElement>("#start-heading")?.focus();
      focusStart.current = false;
    }
  }, [selectedTab]);
  const setSelectedTab = (tab: string) => {
    if (navigation === undefined) setLocalTab(tab);
    else navigation.navigate({ ...navigation.search, tab: tab as NonNullable<DefinitionSearch["tab"]> });
  };
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
    keepMounted: true,
    content: <DefinitionStartPanel key={`${definition.processId}:${definition.version}:${definition.source.sha256}:${definition.semanticProfile}`} api={api} definition={definition} {...(onOpenInstance === undefined ? {} : { onOpenInstance })} />,
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
    <section ref={details} className={styles.details} aria-label={`${definition.processId}, version ${definition.version}`}>
      {selectedTab === "start" ? null : (
        <div className={styles.startAction}>
          <div>
            <strong>{showcase?.title ?? "Run this process"}</strong>
            <p>Ready to try it? Review the starting details, then create a new instance.</p>
          </div>
          <Button onPress={() => { focusStart.current = true; setSelectedTab("start"); }}>Start process</Button>
        </div>
      )}
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
