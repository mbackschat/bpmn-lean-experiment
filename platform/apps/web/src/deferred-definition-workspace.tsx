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

export type DeferredDefinitionWorkspaceProps = Readonly<{
  origin: string;
  onOpenInstance?: (instance: PublicProcessInstanceIdentity) => void;
}>;

export function DeferredDefinitionWorkspace({
  origin,
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
  const [showCatalog, setShowCatalog] = useState(false);
  const requests = useRef(new LatestRequest());
  const selectedDefinition = useRef<DeployedDefinitionVersion | null>(null);
  const exploreButton = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<"explore" | "definition" | null>(null);

  const selectDefinition = useCallback((definition: DeployedDefinitionVersion | null) => {
    selectedDefinition.current = definition;
    setSelected(definition);
  }, []);

  const openDefinition = useCallback(async (definition: DeployedDefinitionVersion) => {
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
      const exact = preferred ?? selectedDefinition.current;
      const next = exact ?? response.definitions[0];
      if (next === undefined) {
        setVersions([]);
        selectDefinition(null);
      } else {
        const response = await api.listVersions(next.processId);
        if (!requests.current.isCurrent(generation)) return false;
        setVersions(response.versions);
        selectDefinition(exact ?? response.versions.at(-1) ?? next);
      }
      return true;
    } catch (cause: unknown) {
      if (requests.current.isCurrent(generation)) setError(errorMessage(cause));
      return false;
    } finally {
      if (requests.current.isCurrent(generation)) setLoading(false);
    }
  }, [api, selectDefinition]);

  useEffect(() => {
    void refresh();
    return () => requests.current.invalidate();
  }, [refresh]);
  useEffect(() => {
    if (showCatalog || returnFocus.current === null) return;
    const target = returnFocus.current === "explore" ? exploreButton.current
      : workspace.current?.querySelector<HTMLSelectElement>("select");
    returnFocus.current = null;
    target?.focus();
  }, [showCatalog]);

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
    const generation = requests.current.begin();
    setLoading(true);
    setError(null);
    try {
      const result = await api.deploy({
        bytes: new Uint8Array(await source.arrayBuffer()),
        sourceId: source.name,
        semanticProfile,
      });
      if (!requests.current.isCurrent(generation)) return;
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
      if (requests.current.isCurrent(generation)) setError(errorMessage(cause));
    } finally {
      if (requests.current.isCurrent(generation)) setLoading(false);
    }
  }
  if (showCatalog) return (
    <ProcessShowcasePanel
      api={api}
      onBack={() => { returnFocus.current = "explore"; setShowCatalog(false); void refresh(); }}
      onPrepared={async (definition) => {
        if (!await refresh(definition)) throw new Error("The prepared definition could not be loaded. Return to Definitions and refresh.");
        returnFocus.current = "definition";
        setShowCatalog(false);
      }}
    />
  );
  return (
    <div ref={workspace}>
    <Button ref={exploreButton} onPress={() => { requests.current.invalidate(); setLoading(false); setShowCatalog(true); }}>Explore process showcases</Button>
    <DefinitionWorkspace
      api={api}
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
        requests.current.invalidate();
        setLoading(false);
        selectDefinition(definition);
      }}
      scheduleApi={scheduleApi}
      selected={selected}
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
