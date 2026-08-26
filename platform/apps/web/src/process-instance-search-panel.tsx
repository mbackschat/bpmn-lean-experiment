import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import type {
  ProcessInstanceSearchRequest,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import type { ProcessInstanceSearchApi } from "./process-instance-search-api.ts";
import type { DefinitionApiClient } from "./definitions-api.ts";
import type { ProcessExecutionApi } from "./process-execution-api.ts";
import type { OperatorAuditApi } from "./operator-audit-api.ts";
import {
  ProcessExecutionDetailLoadKind,
  ProcessExecutionDetailLoader,
  ProcessInstanceExecutionDetailBoundary,
} from "./process-instance-execution-detail.tsx";
import type {
  ProcessExecutionDetailSelection,
} from "./process-instance-execution-detail.tsx";
import styles from "./process-instance-search-panel.module.css";

export type ProcessInstanceSearchPanelProps = Readonly<{
  api: ProcessInstanceSearchApi;
  audienceMode?: boolean;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  executionApi: ProcessExecutionApi;
  operatorAuditApi: OperatorAuditApi;
  isActive: boolean;
}>;

/** Global search surface for confirmed Product 2 starts and their public identity only. */
export function ProcessInstanceSearchPanel({
  api,
  audienceMode = false,
  definitionApi,
  executionApi,
  operatorAuditApi,
  isActive,
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
  const [detail, setDetail] = useState<ProcessExecutionDetailSelection>(null);
  const detailLoader = useRef(new ProcessExecutionDetailLoader());
  const returnFocusKey = useRef<string | null>(null);
  const restoreFocus = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const audienceLoaded = useRef(false);

  useEffect(() => {
    if (!audienceMode || !isActive || audienceLoaded.current) return;
    audienceLoaded.current = true;
    const request = { limit: 2, processId: "Process_SequentialMultiInstanceReview" } as const;
    setBusy("search");
    setError(null);
    void api.search(request).then((page) => {
      setInstances(page.instances);
      setActiveRequest(request);
      setNextCursor(page.nextCursor);
      setSearched(true);
    }).catch((cause: unknown) => {
      setError(errorMessage(cause));
    }).finally(() => {
      setBusy(null);
    });
  }, [api, audienceMode, isActive]);

  useEffect(() => {
    if (!isActive) detailLoader.current.clear(executionApi, setDetail);
  }, [executionApi, isActive]);

  useEffect(() => {
    if (
      !isActive ||
      detail?.kind !== ProcessExecutionDetailLoadKind.Current ||
      detail.publication.current.state.status !== "running" ||
      !Object.hasOwn(detail.publication.current.state, "openMultiInstances")
    ) return;
    const timer = window.setTimeout(() => {
      void detailLoader.current.refresh(detail, executionApi, setDetail);
    }, 500);
    return () => { window.clearTimeout(timer); };
  }, [detail, executionApi, isActive]);

  useEffect(() => () => {
    detailLoader.current.invalidate(executionApi);
  }, [executionApi]);

  useEffect(() => {
    if (detail !== null || !restoreFocus.current) return;
    restoreFocus.current = false;
    const row = returnFocusKey.current === null
      ? undefined
      : rowRefs.current.get(returnFocusKey.current);
    requestAnimationFrame(() => { row?.focus(); });
  }, [detail]);

  if (detail !== null) {
    return (
      <ProcessInstanceExecutionDetailBoundary
        api={executionApi}
        definitionApi={definitionApi}
        operatorAuditApi={operatorAuditApi}
        onBack={() => {
          restoreFocus.current = true;
          detailLoader.current.clear(executionApi, setDetail);
        }}
        onUnavailable={(requested, message) => {
          executionApi.invalidate();
          setDetail({ kind: ProcessExecutionDetailLoadKind.Failed, requested, message });
        }}
        state={detail}
      />
    );
  }

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
      className={styles.panel}
      aria-labelledby="process-instance-search-heading"
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>{audienceMode ? "Prepared demonstration" : "Global Process-instance search"}</p>
          <h2 id="process-instance-search-heading">{audienceMode ? "Batch-review outcomes" : "Confirmed Product 2 starts"}</h2>
          <p>{audienceMode
            ? "Open either exact public instance to compare natural completion with lifetime-deadline interruption."
            : "Search only the exact public identity recorded after a confirmed start."}</p>
        </div>
      </div>

      {audienceMode ? null : <form
        className={styles.form}
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
        <Button type="submit" isPending={busy !== null}>
          {busy === "search" ? "Searching…" : "Search"}
        </Button>
      </form>}

      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      {searched && instances.length === 0 ? (
        <p className={styles.empty}>{audienceMode
          ? "The prepared batch-review instances are not available. Run the deterministic demo preparation again."
          : "No confirmed starts match these exact filters."}</p>
      ) : (
        <ProcessInstanceSearchTable
          instances={instances}
          audienceMode={audienceMode}
          onOpen={(instance, row) => {
            returnFocusKey.current = instance.processInstanceId;
            rowRefs.current.set(instance.processInstanceId, row);
            void detailLoader.current.load(instance, executionApi, setDetail);
          }}
          registerRow={(processInstanceId, row) => {
            if (row === null) rowRefs.current.delete(processInstanceId);
            else rowRefs.current.set(processInstanceId, row);
          }}
        />
      )}
      {nextCursor === null ? null : (
        <Button
          className={styles.loadMore!}
          variant={ButtonVariant.Secondary}
          isPending={busy !== null}
          onPress={() => { void loadMore(); }}
        >
          {busy === "more" ? "Loading…" : "Load more"}
        </Button>
      )}
    </section>
  );
}

export function ProcessInstanceSearchTable({
  instances,
  audienceMode = false,
  onOpen = () => undefined,
  registerRow = () => undefined,
}: Readonly<{
  instances: ReadonlyArray<PublicProcessInstanceIdentity>;
  audienceMode?: boolean;
  onOpen?: (instance: PublicProcessInstanceIdentity, row: HTMLButtonElement) => void;
  registerRow?: (processInstanceId: string, row: HTMLButtonElement | null) => void;
}>) {
  if (instances.length === 0) {
    return null;
  }
  if (audienceMode) {
    return (
      <div className={styles.results}>
        <table aria-label="Prepared batch-review instances">
          <thead>
            <tr>
              <th scope="col">Business scenario</th>
              <th scope="col">Exact source</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((instance) => (
              <tr key={instance.processInstanceId}>
                <th scope="row">{audienceScenarioLabel(instance.definition.source.id)}</th>
                <td><code>{instance.definition.source.id}</code></td>
                <td>
                  <Button
                    variant={ButtonVariant.Secondary}
                    ref={(row) => { registerRow(instance.processInstanceId, row); }}
                    onPress={(event) => {
                      const row = event.target;
                      if (row instanceof HTMLButtonElement) onOpen(instance, row);
                    }}
                    aria-label={`Open evidence ${audienceScenarioLabel(instance.definition.source.id)}`}
                  >
                    Open evidence
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className={styles.results}>
      <table aria-label="Confirmed Product 2 starts">
        <thead>
          <tr>
            <th scope="col">Process-instance ID</th>
            <th scope="col">Process ID</th>
            <th scope="col">Version</th>
            <th scope="col">Source ID</th>
            <th scope="col">Source digest</th>
            <th scope="col">Semantic profile</th>
            <th scope="col">Details</th>
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
              <td>
                <Button
                  variant={ButtonVariant.Secondary}
                  ref={(row) => { registerRow(instance.processInstanceId, row); }}
                  onPress={(event) => {
                    const row = event.target;
                    if (row instanceof HTMLButtonElement) onOpen(instance, row);
                  }}
                  aria-label={`View details ${instance.processInstanceId}`}
                >
                  View details
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function audienceScenarioLabel(sourceId: string): string {
  switch (sourceId) {
    case "demo-purchase-order-review.bpmn":
      return "Purchase-order review";
    case "demo-deadline-escalation.bpmn":
      return "Deadline escalation";
    default:
      return sourceId;
  }
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
