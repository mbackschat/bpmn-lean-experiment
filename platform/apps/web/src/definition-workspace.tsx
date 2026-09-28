import { Link } from "@tanstack/react-router";
import { Button, ButtonVariant, InlineDisclosure, ModalDialog } from "@bpmn-lean/platform-ui-kit";
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
import type { MessageStartPublicationApiClient } from "./message-start-publication-api";
import { MessageStartPublicationPanel } from "./message-start-publication-panel";
import type { DefinitionSearch, WorkspaceNavigation } from "./navigation/route-search.ts";
import { ProcessDescriptionLink } from "./process-description-link.tsx";
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
  scheduleApi,
}: Readonly<{
  navigation?: WorkspaceNavigation<DefinitionSearch>;
  api: DefinitionApiClient;
  correlatedMessageApi: CorrelatedMessageApi;
  definition: DeployedDefinitionVersion;
  onOpenInstance?: (instance: PublicProcessInstanceIdentity) => void;
  messageStartPublicationApi: MessageStartPublicationApiClient;
  scheduleApi: DefinitionScheduleApiClient;
}>) {
  const [localTriggers, setLocalTriggers] = useState(false);
  const details = useRef<HTMLElement>(null);
  const triggers = useRef<HTMLDivElement>(null);
  const section = navigation?.search.tab;
  const triggersOpen = navigation === undefined ? localTriggers : section === "triggers";
  useEffect(() => {
    if (section === "start") details.current?.querySelector<HTMLElement>("#start-heading")?.focus();
    else if (section === "triggers") triggers.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [section, definition.version]);
  return (
    <section ref={details} className={styles.details} aria-label={`${definition.processId}, version ${definition.version}`}>
      <div className={styles.contextLinks}>
        {navigation === undefined ? null : <ProcessDescriptionLink definition={definition} search={navigation.search} />}
        <Link className={styles.metricsLink} to="/operations" search={{ tab: "metrics", process: definition.processId, version: definition.version }}>View process metrics</Link>
      </div>
      <DefinitionStartPanel
        key={`${definition.processId}:${definition.version}:${definition.source.sha256}:${definition.semanticProfile}`}
        api={api} definition={definition}
        {...(onOpenInstance === undefined ? {} : { onOpenInstance })}
      />
      <DefinitionDiagram api={api} definition={definition} />
      <div ref={triggers}>
        <InlineDisclosure title="Triggers" isExpanded={triggersOpen} onExpandedChange={(expanded) => {
          if (navigation === undefined) setLocalTriggers(expanded);
          else navigation.navigate({ ...navigation.search, tab: expanded ? "triggers" : "diagram" });
        }}>
          <div className={styles.triggerPanels}>
            <p>Start or continue processes through messages and schedules.</p>
            <CorrelatedMessagePanel key={`correlated-message:${definition.processId}:${definition.version}`} api={correlatedMessageApi} definition={definition} />
            <MessageStartPublicationPanel key={`message-publication:${definition.processId}:${definition.version}`} api={messageStartPublicationApi} definition={definition} />
            <DefinitionSchedulePanel key={`schedule:${definition.processId}:${definition.version}`} api={scheduleApi} definition={definition} />
          </div>
        </InlineDisclosure>
      </div>
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
