import { useCallback, useEffect, useRef, useState } from "react";
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
import type { OperationsSearch, WorkspaceNavigation } from "./navigation/route-search.ts";
import { LatestRequest } from "./latest-request.ts";

export type ProcessInstanceSearchPanelProps = Readonly<{
  api: ProcessInstanceSearchApi;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  executionApi: ProcessExecutionApi;
  operatorAuditApi: OperatorAuditApi;
  isActive: boolean;
  initialInstance?: PublicProcessInstanceIdentity;
  navigation?: WorkspaceNavigation<OperationsSearch>;
}>;

/** Global search surface for confirmed Product 2 starts and their public identity only. */
export function ProcessInstanceSearchPanel({
  api,
  definitionApi,
  executionApi,
  operatorAuditApi,
  isActive,
  initialInstance,
  navigation,
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
  const collectionHeading = useRef<HTMLHeadingElement>(null);
  const consumedInitialInstance = useRef<PublicProcessInstanceIdentity | undefined>(undefined);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const routed = navigation !== undefined;
  const routeInstance = navigation?.search.instance;
  const filterInstance = navigation?.search.filterInstance;
  const filterProcess = navigation?.search.process;
  const filterVersion = navigation?.search.version;
  const filterSource = navigation?.search.source;
  const filterKey = JSON.stringify([filterInstance, filterProcess, filterVersion, filterSource]);
  const previousFilterKey = useRef(filterKey);
  const collectionRequests = useRef(new LatestRequest());

  const runSearch = useCallback(async (request: ProcessInstanceSearchRequest): Promise<void> => {
    const generation = collectionRequests.current.begin();
    setBusy("search");
    setError(null);
    try {
      const page = await api.search(request);
      if (!collectionRequests.current.isCurrent(generation)) return;
      setInstances(page.instances);
      setActiveRequest(request);
      setNextCursor(page.nextCursor);
      setSearched(true);
    } catch (cause: unknown) {
      if (collectionRequests.current.isCurrent(generation)) setError(errorMessage(cause));
    } finally {
      if (collectionRequests.current.isCurrent(generation)) setBusy(null);
    }
  }, [api]);

  useEffect(() => {
    if (!isActive && !routed) detailLoader.current.clear(executionApi, setDetail);
  }, [executionApi, isActive, routed]);

  useEffect(() => {
    if (routed || !isActive || initialInstance === undefined || consumedInitialInstance.current === initialInstance) return;
    consumedInitialInstance.current = initialInstance;
    returnFocusKey.current = null;
    restoreFocus.current = false;
    void detailLoader.current.load(initialInstance, executionApi, setDetail);
  }, [executionApi, initialInstance, isActive, routed]);

  useEffect(() => {
    if (!routed || !isActive) return;
    let current = true;
    detailLoader.current.clear(executionApi, setDetail);
    setLookupError(null);
    if (routeInstance === undefined) return;
    void (async () => {
      try {
        const instance = initialInstance?.processInstanceId === routeInstance
          ? initialInstance
          : (await api.search({ processInstanceId: routeInstance, limit: 2 })).instances
            .find((candidate) => candidate.processInstanceId === routeInstance);
        if (!current) return;
        if (instance === undefined) throw new Error("No matching public Process instance was found.");
        await detailLoader.current.load(instance, executionApi, setDetail);
      } catch (cause: unknown) {
        if (current) setLookupError(errorMessage(cause));
      }
    })();
    return () => {
      current = false;
      detailLoader.current.invalidate(executionApi);
    };
  }, [api, executionApi, initialInstance, isActive, routeInstance, routed]);

  useEffect(() => {
    if (!routed || !isActive || routeInstance !== undefined) return;
    const changed = previousFilterKey.current !== filterKey;
    previousFilterKey.current = filterKey;
    setProcessInstanceId(filterInstance ?? "");
    setProcessId(filterProcess ?? "");
    setVersion(filterVersion === undefined ? "" : String(filterVersion));
    setSourceSha256(filterSource ?? "");
    if (filterInstance === undefined && filterProcess === undefined && filterVersion === undefined && filterSource === undefined) {
      setBusy(null);
      if (changed) void runSearch({ limit: 2 });
      return () => { collectionRequests.current.invalidate(); };
    }
    const request = processInstanceSearchRequest({
      processInstanceId: filterInstance ?? "", processId: filterProcess ?? "",
      version: filterVersion === undefined ? "" : String(filterVersion), sourceSha256: filterSource ?? "",
    });
    void runSearch(request);
    return () => { collectionRequests.current.invalidate(); };
  }, [filterInstance, filterKey, filterProcess, filterSource, filterVersion, isActive, routeInstance, routed, runSearch]);

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
    collectionRequests.current.invalidate();
    detailLoader.current.clear(executionApi, setDetail);
    consumedInitialInstance.current = undefined;
  }, [executionApi]);

  useEffect(() => {
    if (detail !== null || !restoreFocus.current || (routed && routeInstance !== undefined)) return;
    restoreFocus.current = false;
    const row = returnFocusKey.current === null
      ? undefined
      : rowRefs.current.get(returnFocusKey.current);
    requestAnimationFrame(() => { (row ?? collectionHeading.current)?.focus(); });
  }, [detail, routeInstance, routed]);

  function backToCollection(): void {
    restoreFocus.current = true;
    if (navigation !== undefined) {
      const { instance: _instance, view: _view, ...search } = navigation.search;
      navigation.navigate(search);
    }
    detailLoader.current.clear(executionApi, setDetail);
    setLookupError(null);
  }

  const detailInstance = detail !== null && detail.kind === ProcessExecutionDetailLoadKind.Current
    ? detail.instance : detail?.requested;
  if (routed && routeInstance !== undefined && detailInstance?.processInstanceId !== routeInstance) {
    return (
      <section className={styles.panel}>
        <h2>Process instance</h2>
        <Button variant={ButtonVariant.Secondary} onPress={backToCollection}>Back to Process instances</Button>
        {lookupError === null
          ? <p role="status">Finding the public Process instance…</p>
          : <p role="alert">Process instance unavailable. {lookupError}</p>}
      </section>
    );
  }

  if (detail !== null && (!routed || routeInstance !== undefined)) {
    return (
      <ProcessInstanceExecutionDetailBoundary
        api={executionApi}
        definitionApi={definitionApi}
        operatorAuditApi={operatorAuditApi}
        onBack={backToCollection}
        onUnavailable={(requested, message) => {
          executionApi.invalidate();
          setDetail({ kind: ProcessExecutionDetailLoadKind.Failed, requested, message });
        }}
        state={detail}
        {...(navigation === undefined ? {} : { navigation })}
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
    if (navigation !== undefined) {
      const { filterInstance: _filterInstance, process: _process, version: _version, source: _source, ...rest } = navigation.search;
      const changed = processInstanceId !== (filterInstance ?? "") || processId !== (filterProcess ?? "") ||
        version !== (filterVersion === undefined ? "" : String(filterVersion)) || sourceSha256 !== (filterSource ?? "");
      navigation.navigate({
        ...rest,
        ...(request.processInstanceId === undefined ? {} : { filterInstance: request.processInstanceId }),
        ...(request.processId === undefined ? {} : { process: request.processId }),
        ...(request.version === undefined ? {} : { version: request.version }),
        ...(request.sourceSha256 === undefined ? {} : { source: request.sourceSha256 }),
      });
      if (changed) return;
    }
    await runSearch(request);
  }

  async function loadMore(): Promise<void> {
    if (activeRequest === null || nextCursor === null) {
      return;
    }
    const generation = collectionRequests.current.begin();
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
      if (!collectionRequests.current.isCurrent(generation)) return;
      setInstances((current) => [...current, ...page.instances]);
      setNextCursor(page.nextCursor);
    } catch (cause: unknown) {
      if (collectionRequests.current.isCurrent(generation)) setError(errorMessage(cause));
    } finally {
      if (collectionRequests.current.isCurrent(generation)) setBusy(null);
    }
  }

  return (
    <section
      className={styles.panel}
      aria-labelledby="process-instance-search-heading"
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Find an instance</p>
          <h2 id="process-instance-search-heading" ref={collectionHeading} tabIndex={-1}>Process instances</h2>
          <p>Instances started through this app, including scheduled and message-triggered starts.</p>
        </div>
      </div>

      <form
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
      </form>

      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      {searched && instances.length === 0 ? (
        <p className={styles.empty}>No process instances match these filters.</p>
      ) : (
        <ProcessInstanceSearchTable
          instances={instances}
          onOpen={(instance, row) => {
            returnFocusKey.current = instance.processInstanceId;
            rowRefs.current.set(instance.processInstanceId, row);
            if (navigation === undefined) void detailLoader.current.load(instance, executionApi, setDetail);
            else navigation.navigate({ ...navigation.search, instance: instance.processInstanceId, view: "overview" });
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
  onOpen = () => undefined,
  registerRow = () => undefined,
}: Readonly<{
  instances: ReadonlyArray<PublicProcessInstanceIdentity>;
  onOpen?: (instance: PublicProcessInstanceIdentity, row: HTMLButtonElement) => void;
  registerRow?: (processInstanceId: string, row: HTMLButtonElement | null) => void;
}>) {
  if (instances.length === 0) {
    return null;
  }
  return (
    <div className={styles.results}>
      <table aria-label="Process instances">
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
