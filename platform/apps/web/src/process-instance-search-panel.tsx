import { useState } from "react";
import type { FormEvent } from "react";

import type {
  ProcessInstanceSearchRequest,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import type { ProcessInstanceSearchApi } from "./process-instance-search-api.ts";

export type ProcessInstanceSearchPanelProps = Readonly<{
  api: ProcessInstanceSearchApi;
}>;

/** Global search surface for confirmed Product 2 starts and their public identity only. */
export function ProcessInstanceSearchPanel({
  api,
}: ProcessInstanceSearchPanelProps) {
  const [processInstanceId, setProcessInstanceId] = useState("");
  const [processId, setProcessId] = useState("");
  const [version, setVersion] = useState("");
  const [sourceSha256, setSourceSha256] = useState("");
  const [instances, setInstances] = useState<
    ReadonlyArray<PublicProcessInstanceIdentity>
  >([]);
  const [activeRequest, setActiveRequest] = useState<
    ProcessInstanceSearchRequest | null
  >(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState<"search" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const request = processInstanceSearchRequest({
      processInstanceId,
      processId,
      version,
      sourceSha256,
    });
    setBusy("search");
    setError(null);
    try {
      const page = await api.search(request);
      setInstances(page.instances);
      setActiveRequest(request);
      setNextCursor(page.nextCursor);
      setSearched(true);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function loadMore(): Promise<void> {
    if (activeRequest === null || nextCursor === null) {
      return;
    }
    setBusy("more");
    setError(null);
    try {
      const accumulatedIds = new Set(
        instances.map(({ processInstanceId: id }) => id),
      );
      const page = await api.loadMore(
        activeRequest,
        nextCursor,
        accumulatedIds,
      );
      setInstances((current) => [...current, ...page.instances]);
      setNextCursor(page.nextCursor);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="process-instance-search-panel"
      aria-labelledby="process-instance-search-heading"
    >
      <div className="process-instance-search-heading">
        <div>
          <p className="eyebrow">Global Process-instance search</p>
          <h2 id="process-instance-search-heading">Confirmed Product 2 starts</h2>
          <p>Search only the exact public identity recorded after a confirmed start.</p>
        </div>
      </div>

      <form
        className="process-instance-search-form"
        onSubmit={(event) => { void search(event); }}
      >
        <label>
          Process-instance ID
          <input
            name="processInstanceId"
            type="text"
            value={processInstanceId}
            onChange={(event) => { setProcessInstanceId(event.currentTarget.value); }}
          />
        </label>
        <label>
          Process ID
          <input
            name="processId"
            type="text"
            value={processId}
            onChange={(event) => { setProcessId(event.currentTarget.value); }}
          />
        </label>
        <label>
          Version
          <input
            name="version"
            type="number"
            min={1}
            step={1}
            value={version}
            onChange={(event) => { setVersion(event.currentTarget.value); }}
          />
        </label>
        <label>
          Source digest
          <input
            name="sourceSha256"
            type="text"
            minLength={64}
            maxLength={64}
            pattern="[0-9a-f]{64}"
            value={sourceSha256}
            onChange={(event) => { setSourceSha256(event.currentTarget.value); }}
          />
        </label>
        <button type="submit" disabled={busy !== null}>
          {busy === "search" ? "Searching…" : "Search"}
        </button>
      </form>

      {error === null ? null : <p className="error" role="alert">{error}</p>}
      {searched && instances.length === 0 ? (
        <p className="process-instance-search-empty">No confirmed starts match these exact filters.</p>
      ) : (
        <ProcessInstanceSearchTable instances={instances} />
      )}
      {nextCursor === null ? null : (
        <button
          type="button"
          className="secondary-action process-instance-load-more"
          disabled={busy !== null}
          onClick={() => { void loadMore(); }}
        >
          {busy === "more" ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  );
}

export function ProcessInstanceSearchTable({
  instances,
}: Readonly<{
  instances: ReadonlyArray<PublicProcessInstanceIdentity>;
}>) {
  if (instances.length === 0) {
    return null;
  }
  return (
    <div className="process-instance-search-results">
      <table aria-label="Confirmed Product 2 starts">
        <thead>
          <tr>
            <th scope="col">Process-instance ID</th>
            <th scope="col">Process ID</th>
            <th scope="col">Version</th>
            <th scope="col">Source ID</th>
            <th scope="col">Source digest</th>
            <th scope="col">Semantic profile</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((instance) => (
            <tr key={instance.processInstanceId}>
              <th scope="row"><code>{instance.processInstanceId}</code></th>
              <td><code>{instance.definition.processId}</code></td>
              <td>{instance.definition.version}</td>
              <td><code>{instance.definition.source.id}</code></td>
              <td><code>{instance.definition.source.sha256}</code></td>
              <td><code>{instance.definition.semanticProfile}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Builds exact optional filters with the panel's fixed two-row pagination witness. */
export function processInstanceSearchRequest(fields: Readonly<{
  processInstanceId: string;
  processId: string;
  version: string;
  sourceSha256: string;
}>): ProcessInstanceSearchRequest {
  return {
    limit: 2,
    ...(fields.processInstanceId === ""
      ? {}
      : { processInstanceId: fields.processInstanceId }),
    ...(fields.processId === "" ? {} : { processId: fields.processId }),
    ...(fields.version === "" ? {} : { version: Number(fields.version) }),
    ...(fields.sourceSha256 === "" ? {} : { sourceSha256: fields.sourceSha256 }),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown platform failure";
}
