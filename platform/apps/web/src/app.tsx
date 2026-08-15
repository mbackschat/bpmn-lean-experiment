import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { DefinitionDeployStatus } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionDeployResult,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";

import type { DefinitionScheduleApiClient } from "./definition-schedule-api";
import type { DefinitionApiClient } from "./definitions-api";
import { DefinitionWorkspace } from "./definition-workspace";
import type { MessageStartPublicationApiClient } from "./message-start-publication-api";
import type { FlowNodeMetricsApi } from "./flow-node-metrics-api.ts";
import type { IncidentOperationsApi } from "./incident-operations-api";
import { OperationsWorkspace } from "./operations-workspace";
import type { ProcessInstanceSearchApi } from "./process-instance-search-api";
import type { ProcessExecutionApi } from "./process-execution-api";
import type { WorkApiClient } from "./work-tasks-api";
import { WorkInboxPanel } from "./work-inbox-panel";
import { AppShell, AppWorkspace } from "./app-shell";
import { CapabilitiesPanel } from "./capabilities-panel";

export type AppProps = Readonly<{
  api: DefinitionApiClient;
  messageStartPublicationApi: MessageStartPublicationApiClient;
  incidentOperationsApi: IncidentOperationsApi;
  metricsApi: FlowNodeMetricsApi;
  processInstanceSearchApi: ProcessInstanceSearchApi;
  processExecutionApi: ProcessExecutionApi;
  productVersion: string;
  scheduleApi: DefinitionScheduleApiClient;
  workApi: WorkApiClient;
}>;

export function App({
  api,
  incidentOperationsApi,
  messageStartPublicationApi,
  metricsApi,
  processInstanceSearchApi,
  processExecutionApi,
  productVersion,
  scheduleApi,
  workApi,
}: AppProps) {
  const [definitions, setDefinitions] = useState<ReadonlyArray<DeployedDefinitionVersion>>([]);
  const [versions, setVersions] = useState<ReadonlyArray<DeployedDefinitionVersion>>([]);
  const [selected, setSelected] = useState<DeployedDefinitionVersion | null>(null);
  const [deployment, setDeployment] = useState<DefinitionDeployResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<AppWorkspace>(AppWorkspace.Work);

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
    <AppShell
      activeWorkspace={workspace}
      about={<CapabilitiesPanel productVersion={productVersion} />}
      onNavigate={setWorkspace}
      work={<WorkInboxPanel api={workApi} definitionApi={api} />}
      operations={(
        <OperationsWorkspace
          definitionApi={api}
          incidentApi={incidentOperationsApi}
          processExecutionApi={processExecutionApi}
          processInstanceSearchApi={processInstanceSearchApi}
        />
      )}
      definitions={(
        <DefinitionWorkspace
          api={api}
          definitions={definitions}
          deployment={deployment}
          error={error}
          loading={loading}
          messageStartPublicationApi={messageStartPublicationApi}
          metricsApi={metricsApi}
          onDeploy={deploy}
          onOpenDefinition={openDefinition}
          onSelectVersion={setSelected}
          scheduleApi={scheduleApi}
          selected={selected}
          versions={versions}
        />
      )}
    />
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown platform failure";
}

function assertNever(value: never): never {
  throw new Error(`unexpected definition result: ${String(value)}`);
}
