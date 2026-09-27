import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@bpmn-lean/platform-ui-kit";

import { DefinitionDeployStatus } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionDeployResult,
  DeployedDefinitionVersion,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import { DefinitionApiClient } from "./definitions-api.ts";
import { CorrelatedMessageApiClient } from "./correlated-message-api.ts";
import { DefinitionScheduleApiClient } from "./definition-schedule-api.ts";
import {
  DefinitionWorkspace,
} from "./definition-workspace.tsx";
import { FlowNodeMetricsApiClient } from "./flow-node-metrics-api.ts";
import { MessageStartPublicationApiClient } from "./message-start-publication-api.ts";
import { ProcessShowcasePanel } from "./process-showcase-panel.tsx";
import { LatestRequest } from "./latest-request.ts";
import type { DefinitionSearch, WorkspaceNavigation } from "./navigation/route-search.ts";
import styles from "./definition-workspace.module.css";

export type DeferredDefinitionWorkspaceProps = Readonly<{
  navigation?: WorkspaceNavigation<DefinitionSearch>;
  origin: string;
  onOpenInstance?: (instance: PublicProcessInstanceIdentity) => void;
}>;

export function DeferredDefinitionWorkspace({
  origin,
  navigation,
  onOpenInstance,
}: DeferredDefinitionWorkspaceProps) {
  const api = useMemo(() => new DefinitionApiClient(origin), [origin]);
  const correlatedMessageApi = useMemo(
    () => new CorrelatedMessageApiClient(origin),
    [origin],
  );
  const messageStartPublicationApi = useMemo(
    () => new MessageStartPublicationApiClient(origin),
    [origin],
  );
  const metricsApi = useMemo(() => new FlowNodeMetricsApiClient(origin), [origin]);
  const scheduleApi = useMemo(() => new DefinitionScheduleApiClient(origin), [origin]);
  const [definitions, setDefinitions] = useState<ReadonlyArray<DeployedDefinitionVersion>>([]);
  const [versions, setVersions] = useState<ReadonlyArray<DeployedDefinitionVersion>>([]);
  const [selected, setSelected] = useState<DeployedDefinitionVersion | null>(null);
  const [deployment, setDeployment] = useState<DefinitionDeployResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localCatalog, setLocalCatalog] = useState(false);
  const showCatalog = navigation === undefined ? localCatalog : navigation.search.view === "showcases";
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const setShowCatalog = (show: boolean) => {
    if (navigation === undefined) setLocalCatalog(show);
    else {
      const { view, model, ...search } = navigation.search;
      navigation.navigate(show ? { ...search, view: "showcases" } : search);
    }
  };
  const routeProcess = navigation?.search.process;
  const routeVersion = navigation?.search.version;
  const requests = useRef(new LatestRequest());
  const selectedDefinition = useRef<DeployedDefinitionVersion | null>(null);
  const exploreButton = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<"explore" | "start" | null>(null);

  const selectDefinition = useCallback((definition: DeployedDefinitionVersion | null) => {
    selectedDefinition.current = definition;
    setSelected(definition);
  }, []);

  const openDefinition = useCallback(async (definition: DeployedDefinitionVersion) => {
    if (navigationRef.current !== undefined) {
      navigationRef.current.navigate({ process: definition.processId, version: definition.version });
      return;
    }
    const generation = requests.current.begin();
    setError(null);
    setLoading(true);
    selectDefinition(definition);
    setVersions([definition]);
    try {
      const response = await api.listVersions(definition.processId);
      if (!requests.current.isCurrent(generation)) return;
      setVersions(response.versions);
      selectDefinition(response.versions.at(-1) ?? definition);
    } catch (cause: unknown) {
      if (requests.current.isCurrent(generation)) setError(errorMessage(cause));
    } finally {
      if (requests.current.isCurrent(generation)) setLoading(false);
    }
  }, [api, selectDefinition]);

  const refresh = useCallback(async (preferred?: DeployedDefinitionVersion) => {
    const generation = requests.current.begin();
    setLoading(true);
    setError(null);
    try {
      const response = await api.listDefinitions();
      if (!requests.current.isCurrent(generation)) return false;
      setDefinitions(response.definitions);
      const route = navigationRef.current;
      const exact = preferred ?? (route === undefined ? selectedDefinition.current : null);
      const requested = route?.search.process;
      const next = exact ?? (requested === undefined ? response.definitions[0] : response.definitions.find((entry) => entry.processId === requested));
      if (requested !== undefined && next === undefined) throw new Error("Definition unavailable. This process is not in the published definition list.");
      if (next === undefined) {
        setVersions([]);
        selectDefinition(null);
      } else {
        const response = await api.listVersions(next.processId);
        if (!requests.current.isCurrent(generation)) return false;
        setVersions(response.versions);
        const version = preferred?.version ?? route?.search.version;
        const resolved = version === undefined ? exact ?? response.versions.at(-1) ?? next : response.versions.find((entry) => entry.version === version);
        if (resolved === undefined) throw new Error("Definition version unavailable. Choose a retained version.");
        selectDefinition(resolved);
        if (route !== undefined && (route.search.process !== resolved.processId || route.search.version !== resolved.version)) {
          route.navigate({ ...route.search, process: resolved.processId, version: resolved.version }, true);
        }
      }
      return true;
    } catch (cause: unknown) {
      if (requests.current.isCurrent(generation)) { selectDefinition(null); setVersions([]); setError(errorMessage(cause)); }
      return false;
    } finally {
      if (requests.current.isCurrent(generation)) setLoading(false);
    }
  }, [api, selectDefinition]);

  useEffect(() => {
    void refresh();
    return () => requests.current.invalidate();
  }, [refresh, routeProcess, routeVersion]);
  useEffect(() => {
    if (showCatalog || returnFocus.current === null) return;
    const target = returnFocus.current === "explore" ? exploreButton.current
      : workspace.current?.querySelector<HTMLElement>("#start-heading");
    if (target === null || target === undefined) return;
    returnFocus.current = null;
    target.focus();
  }, [showCatalog, selected, loading]);

  async function deploy(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const source = form.get("source");
    const semanticProfile = form.get("semanticProfile");
    if (!(source instanceof File) || source.size === 0) {
      setError("Choose a nonempty BPMN XML file.");
      return false;
    }
    if (typeof semanticProfile !== "string" || semanticProfile.length === 0) {
      setError("Enter the exact semantic profile ID.");
      return false;
    }
    const generation = requests.current.begin();
    setLoading(true);
    setError(null);
    setDeployment(null);
    try {
      const result = await api.deploy({
        bytes: new Uint8Array(await source.arrayBuffer()),
        sourceId: source.name,
        semanticProfile,
      });
      if (!requests.current.isCurrent(generation)) return false;
      setDeployment(result);
      switch (result.status) {
        case DefinitionDeployStatus.Deployed:
          return await refresh(result.definition);
        case DefinitionDeployStatus.Rejected:
          return false;
        default:
          return assertNever(result);
      }
    } catch (cause: unknown) {
      if (requests.current.isCurrent(generation)) setError(errorMessage(cause));
      return false;
    } finally {
      if (requests.current.isCurrent(generation)) setLoading(false);
    }
  }
  if (showCatalog) return (
    <ProcessShowcasePanel
      api={api}
      definitions={definitions}
      {...(navigation === undefined ? {} : { navigation })}
      onBack={() => { returnFocus.current = "explore"; setShowCatalog(false); void refresh(); }}
      onPrepared={async (definition) => {
        if (!await refresh(definition)) throw new Error("The prepared definition could not be loaded. Return to Definitions and refresh.");
        returnFocus.current = "start";
        if (navigationRef.current === undefined) setLocalCatalog(false);
        else navigationRef.current.navigate({ process: definition.processId, version: definition.version, tab: "start" });
      }}
    />
  );
  return (
    <div ref={workspace} className={styles.catalogWorkspace}>
    <Button ref={exploreButton} onPress={() => { requests.current.invalidate(); setLoading(false); setShowCatalog(true); }}>Explore process showcases</Button>
    <DefinitionWorkspace
      api={api}
      {...(navigation === undefined ? {} : { navigation })}
      correlatedMessageApi={correlatedMessageApi}
      definitions={definitions}
      deployment={deployment}
      error={error}
      loading={loading}
      messageStartPublicationApi={messageStartPublicationApi}
      metricsApi={metricsApi}
      onDeploy={deploy}
      onOpenDefinition={openDefinition}
      {...(onOpenInstance === undefined ? {} : { onOpenInstance })}
      onSelectVersion={(definition) => {
        if (navigation !== undefined) navigation.navigate({ ...navigation.search, process: definition.processId, version: definition.version });
        else {
          requests.current.invalidate();
          setLoading(false);
          selectDefinition(definition);
        }
      }}
      scheduleApi={scheduleApi}
      selected={navigation !== undefined && selected !== null && (
        (routeProcess !== undefined && selected.processId !== routeProcess) ||
        (routeVersion !== undefined && selected.version !== routeVersion)
      ) ? null : selected}
      versions={versions}
    />
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown platform failure";
}

function assertNever(value: never): never {
  throw new Error(`unexpected definition result: ${String(value)}`);
}
