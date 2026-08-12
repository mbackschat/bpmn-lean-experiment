import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { DefinitionDeployStatus } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionDeployResult,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";

import { DefinitionDiagram } from "./definition-diagram";
import { DefinitionSchedulePanel } from "./definition-schedule-panel";
import { DefinitionStartPanel } from "./definition-start-panel";
import type { DefinitionScheduleApiClient } from "./definition-schedule-api";
import type { DefinitionApiClient } from "./definitions-api";
import type { MessageStartPublicationApiClient } from "./message-start-publication-api";
import { MessageStartPublicationPanel } from "./message-start-publication-panel";
import type { ProcessInstanceSearchApi } from "./process-instance-search-api";
import { ProcessInstanceSearchPanel } from "./process-instance-search-panel";

export type AppProps = Readonly<{
  api: DefinitionApiClient;
  messageStartPublicationApi: MessageStartPublicationApiClient;
  processInstanceSearchApi: ProcessInstanceSearchApi;
  scheduleApi: DefinitionScheduleApiClient;
}>;

export function App({
  api,
  messageStartPublicationApi,
  processInstanceSearchApi,
  scheduleApi,
}: AppProps) {
  const [definitions, setDefinitions] = useState<ReadonlyArray<DeployedDefinitionVersion>>([]);
  const [versions, setVersions] = useState<ReadonlyArray<DeployedDefinitionVersion>>([]);
  const [selected, setSelected] = useState<DeployedDefinitionVersion | null>(null);
  const [deployment, setDeployment] = useState<DefinitionDeployResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const openDefinition = useCallback(async (definition: DeployedDefinitionVersion) => {
    setError(null);
    try {
      const response = await api.listVersions(definition.processId);
      setVersions(response.versions);
      setSelected(response.versions.at(-1) ?? definition);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }, [api]);

  const refresh = useCallback(async (preferred?: DeployedDefinitionVersion) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listDefinitions();
      setDefinitions(response.definitions);
      const next = preferred ?? response.definitions[0];
      if (next === undefined) {
        setVersions([]);
        setSelected(null);
      } else {
        await openDefinition(next);
      }
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api, openDefinition]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function deploy(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const source = form.get("source");
    const semanticProfile = form.get("semanticProfile");
    if (!(source instanceof File) || source.size === 0) {
      setError("Choose a nonempty BPMN XML file.");
      return;
    }
    if (typeof semanticProfile !== "string" || semanticProfile.length === 0) {
      setError("Enter the exact semantic profile ID.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.deploy({
        bytes: new Uint8Array(await source.arrayBuffer()),
        sourceId: source.name,
        semanticProfile,
      });
      setDeployment(result);
      switch (result.status) {
        case DefinitionDeployStatus.Deployed:
          await refresh(result.definition);
          break;
        case DefinitionDeployStatus.Rejected:
          break;
        default:
          assertNever(result);
      }
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="product-header">
        <div>
          <p className="eyebrow">BPMN Lean Platform</p>
          <h1>Definition workspace</h1>
        </div>
        <p className="product-summary">Deploy exact BPMN, inspect honest admission, view every retained version, and start the selected version.</p>
      </header>

      <section className="deploy-panel" aria-labelledby="deploy-heading">
        <div>
          <p className="eyebrow">Third-party deployment</p>
          <h2 id="deploy-heading">Add a BPMN definition</h2>
          <p>The engine validates the exact uploaded bytes against the selected semantic profile.</p>
        </div>
        <form onSubmit={(event) => { void deploy(event); }}>
          <label>
            BPMN XML file
            <input name="source" type="file" accept=".bpmn,application/bpmn+xml,application/xml,text/xml" required />
          </label>
          <label>
            Semantic profile ID
            <input name="semanticProfile" type="text" placeholder="parallel-fork-join-draft" required />
          </label>
          <button type="submit" disabled={loading}>Deploy definition</button>
        </form>
      </section>

      {error === null ? null : <p className="error" role="alert">{error}</p>}
      {loading ? <p className="loading" role="status">Refreshing definitions…</p> : null}
      <DeploymentResult result={deployment} />

      <ProcessInstanceSearchPanel api={processInstanceSearchApi} />

      <div className="workspace-grid">
        <aside className="catalog-panel" aria-labelledby="catalog-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Durable catalog</p>
              <h2 id="catalog-heading">Definitions</h2>
            </div>
            <span className="count">{definitions.length}</span>
          </div>
          {definitions.length === 0 && !loading ? <p>No admitted definitions yet.</p> : null}
          <ul className="definition-list">
            {definitions.map((definition) => (
              <li key={definition.processId}>
                <button
                  type="button"
                  className={selected?.processId === definition.processId ? "selected" : undefined}
                  onClick={() => { void openDefinition(definition); }}
                >
                  <strong>{definition.processId}</strong>
                  <span>Latest version {definition.version}</span>
                </button>
              </li>
            ))}
          </ul>
          {versions.length > 0 ? (
            <div className="versions" aria-label="Definition versions">
              <span>Versions</span>
              {versions.map((version) => (
                <button
                  type="button"
                  key={version.version}
                  className={selected?.version === version.version ? "selected" : undefined}
                  onClick={() => { setSelected(version); }}
                >
                  {version.version}
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        {selected === null ? (
          <section className="empty-panel">
            <p>Select or deploy a definition to view its exact source diagram.</p>
          </section>
        ) : (
          <div className="selected-definition">
            <MessageStartPublicationPanel
              key={`message-publication:${selected.processId}:${selected.version}`}
              api={messageStartPublicationApi}
              definition={selected}
            />
            <DefinitionSchedulePanel
              key={`schedule:${selected.processId}:${selected.version}`}
              api={scheduleApi}
              definition={selected}
            />
            <DefinitionStartPanel
              key={`start:${selected.processId}:${selected.version}`}
              api={api}
              definition={selected}
            />
            <DefinitionDiagram api={api} definition={selected} />
          </div>
        )}
      </div>
    </main>
  );
}

function DeploymentResult({ result }: Readonly<{ result: DefinitionDeployResult | null }>) {
  if (result === null) {
    return null;
  }
  switch (result.status) {
    case DefinitionDeployStatus.Deployed:
      return (
        <section className="result accepted" aria-live="polite">
          <strong>Admitted and deployed</strong>
          <span>{result.definition.processId}, version {result.definition.version}</span>
        </section>
      );
    case DefinitionDeployStatus.Rejected:
      return (
        <section className="result rejected" aria-live="polite">
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
    default:
      return assertNever(result);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown platform failure";
}

function assertNever(value: never): never {
  throw new Error(`unexpected definition result: ${String(value)}`);
}
