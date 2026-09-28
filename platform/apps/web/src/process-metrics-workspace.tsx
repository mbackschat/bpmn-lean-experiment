import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";
import type { DefinitionApiClient } from "./definitions-api.ts";
import type { FlowNodeMetricsApi } from "./flow-node-metrics-api.ts";
import { FlowNodeMetricsPanel } from "./flow-node-metrics-panel.tsx";
import type { OperationsSearch, WorkspaceNavigation } from "./navigation/route-search.ts";
import styles from "./process-metrics-workspace.module.css";

type Props = Readonly<{
  definitionApi: Pick<DefinitionApiClient, "listDefinitions" | "listVersions" | "getPresentation">;
  metricsApi: FlowNodeMetricsApi;
  navigation?: WorkspaceNavigation<OperationsSearch>;
}>;

export function ProcessMetricsWorkspace({ definitionApi, metricsApi, navigation }: Props) {
  const [localSelection, setLocalSelection] = useState<OperationsSearch>({});
  const selection = navigation?.search ?? localSelection;
  const definitions = useQuery({
    queryKey: ["process-metrics", "definitions"],
    queryFn: () => definitionApi.listDefinitions(),
    retry: false,
  });
  const choices = definitions.data?.definitions ?? [];
  const process = selection.process ?? choices[0]?.processId;
  const knownProcess = choices.some((entry) => entry.processId === process);
  const versions = useQuery({
    queryKey: ["process-metrics", "versions", process],
    queryFn: () => definitionApi.listVersions(process!),
    enabled: process !== undefined && knownProcess,
    retry: false,
  });
  const versionChoices = versions.data?.versions.filter((entry) => entry.processId === process) ?? [];
  const version = selection.version ?? versionChoices.at(-1)?.version;
  const selected = versionChoices.find((entry) => entry.version === version);
  const unavailable = definitions.isError || versions.isError;

  useEffect(() => {
    if (selected === undefined || unavailable || navigation === undefined) return;
    if (selection.process !== selected.processId || selection.version !== selected.version) {
      navigation.navigate({ ...selection, tab: "metrics", process: selected.processId, version: selected.version }, true);
    }
  }, [selected, unavailable, navigation, selection]);

  function select(next: OperationsSearch) {
    if (navigation === undefined) setLocalSelection(next);
    else navigation.navigate(next);
  }

  if (definitions.isPending) return <p role="status">Loading processes…</p>;
  if (definitions.isError) return <div className={styles.workspace}>
    <p role="alert">The process list could not be loaded.</p>
    <Button variant={ButtonVariant.Secondary} onPress={() => { void definitions.refetch(); }}>Retry process list</Button>
  </div>;
  if (choices.length === 0) return <div className={styles.workspace}>
    <p>No process definitions are available yet. Prepare or add a process in Definitions first.</p>
    <Link className={styles.link} to="/definitions" search={{}}>Open Definitions</Link>
  </div>;

  return <div className={styles.workspace}>
    <section className={styles.selection} aria-label="Process metrics selection">
      <label>Process
        <select value={knownProcess ? process : ""} onChange={(event) => {
          const { version: _version, ...search } = selection;
          select({ ...search, tab: "metrics", process: event.currentTarget.value });
        }}>
          {knownProcess ? null : <option value="" disabled>Choose an available process</option>}
          {choices.map((entry) => <option key={entry.processId} value={entry.processId}>{entry.processId}</option>)}
        </select>
      </label>
      <label>Version
        <select disabled={!knownProcess || versions.isPending || versions.isError} value={selected?.version ?? ""}
          onChange={(event) => { select({ ...selection, tab: "metrics", process: process!, version: Number(event.currentTarget.value) }); }}>
          {selected === undefined ? <option value="" disabled>Choose a retained version</option> : null}
          {versionChoices.map((entry) => <option key={entry.version} value={entry.version}>Version {entry.version}</option>)}
        </select>
      </label>
      {selected === undefined || unavailable ? null : <Link className={styles.link} to="/definitions" search={{ process: selected.processId, version: selected.version, tab: "diagram" }}>View definition</Link>}
    </section>
    {!knownProcess ? <p role="alert">This process is unavailable. Choose an available process above.</p>
      : versions.isPending ? <p role="status">Loading process versions…</p>
      : versions.isError ? <div className={styles.workspace}>
        <p role="alert">The process versions could not be loaded.</p>
        <Button variant={ButtonVariant.Secondary} onPress={() => { void versions.refetch(); }}>Retry process versions</Button>
      </div>
      : selected === undefined ? <p role="alert">This version is unavailable. Choose a retained version above.</p>
      : <FlowNodeMetricsPanel active definition={selected} definitionApi={definitionApi} metricsApi={metricsApi} />}
  </div>;
}
