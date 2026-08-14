import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import { DefinitionDiagram } from "./definition-diagram.tsx";
import type { DefinitionApiClient } from "./definitions-api.ts";
import {
  sameExactDefinition,
  snapshotExactDefinition,
} from "./exact-definition.ts";
import type { FlowNodeMetricsApi } from "./flow-node-metrics-api.ts";
import {
  FlowNodeMetricsLoader,
  FlowNodeMetricsLoadStateKind,
} from "./flow-node-metrics-load.ts";
import type { FlowNodeMetricsLoadState } from "./flow-node-metrics-load.ts";
import {
  FlowNodeMetricMode,
  projectFlowNodeMetrics,
} from "./flow-node-metrics-projection.ts";
import styles from "./flow-node-metrics-panel.module.css";

const LoadingStateKind = "loading";

type BoundLoadState = Readonly<{
  definition: DeployedDefinitionVersion;
  load: FlowNodeMetricsLoadState | Readonly<{ kind: typeof LoadingStateKind }>;
}>;

export type FlowNodeMetricsPanelProps = Readonly<{
  active: boolean;
  definition: DeployedDefinitionVersion;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  metricsApi: FlowNodeMetricsApi;
}>;

export function FlowNodeMetricsPanel({
  active,
  definition,
  definitionApi,
  metricsApi,
}: FlowNodeMetricsPanelProps) {
  const loader = useMemo(() => new FlowNodeMetricsLoader(metricsApi), [metricsApi]);
  const heading = useRef<HTMLHeadingElement>(null);
  const unavailableAlert = useRef<HTMLParagraphElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<FlowNodeMetricMode>(FlowNodeMetricMode.Frequency);
  const [missingElementIds, setMissingElementIds] = useState<readonly string[]>([]);
  const [state, setState] = useState<BoundLoadState>(() => ({
    definition: snapshotExactDefinition(definition),
    load: { kind: LoadingStateKind },
  }));
  const stateIsCurrent = sameExactDefinition(state.definition, definition);
  const currentLoad = stateIsCurrent ? state.load : { kind: LoadingStateKind } as const;
  const projection = useMemo(() =>
    currentLoad.kind === FlowNodeMetricsLoadStateKind.Available
      ? projectFlowNodeMetrics(currentLoad.snapshot, mode)
      : null,
  [currentLoad, mode]);

  useEffect(() => {
    if (!active) {
      loader.invalidate();
      return;
    }
    const exactDefinition = snapshotExactDefinition(definition);
    setMissingElementIds([]);
    setState({ definition: exactDefinition, load: { kind: LoadingStateKind } });
    void loader.load(exactDefinition).then((load) => {
      if (load !== null) setState({ definition: exactDefinition, load });
    });
    return () => { loader.invalidate(); };
  }, [active, attempt, definition, loader]);

  useEffect(() => {
    if (!active) return;
    const target = currentLoad.kind === FlowNodeMetricsLoadStateKind.Unavailable
      ? unavailableAlert.current
      : heading.current;
    if (target === null) return;
    const frame = requestAnimationFrame(() => { target.focus(); });
    return () => { cancelAnimationFrame(frame); };
  }, [active, currentLoad.kind]);

  const reportMissingElements = useCallback((elementIds: readonly string[]) => {
    setMissingElementIds(elementIds);
  }, []);

  if (!active) return null;

  function retry(): void {
    loader.invalidate();
    setMissingElementIds([]);
    setState({
      definition: snapshotExactDefinition(definition),
      load: { kind: LoadingStateKind },
    });
    setAttempt((value) => value + 1);
  }

  function selectMode(nextMode: FlowNodeMetricMode): void {
    setMissingElementIds([]);
    setMode(nextMode);
  }

  return (
    <section
      className={styles.panel}
      aria-label={`Flow-node metrics for ${definition.processId}, version ${definition.version}`}
      data-ui="flow-node-metrics-detail"
      data-load-state={currentLoad.kind}
    >
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Definition version insight</p>
          <h2 ref={heading} tabIndex={-1}>Flow-node metrics</h2>
        </div>
        <span>Version {definition.version}</span>
      </header>

      {currentLoad.kind === LoadingStateKind ? (
        <p className={styles.loading} role="status">Loading flow-node metrics…</p>
      ) : null}

      {currentLoad.kind === FlowNodeMetricsLoadStateKind.Unavailable ? (
        <div className={styles.unavailable}>
          <p ref={unavailableAlert} tabIndex={-1} role="alert">
            Flow-node metrics are unavailable.
          </p>
          <Button variant={ButtonVariant.Secondary} onPress={retry}>Retry</Button>
        </div>
      ) : null}

      {currentLoad.kind === FlowNodeMetricsLoadStateKind.Available && projection !== null ? (
        <>
          <div className={styles.summary}>
            <p>
              <strong>All retained evidence</strong>
              <span>{currentLoad.snapshot.population.processInstances} Process instance{currentLoad.snapshot.population.processInstances === 1 ? "" : "s"}</span>
            </p>
            <div className={styles.modes} role="group" aria-label="Flow-node metric mode">
              <Button
                className={styles.modeButton!}
                variant={ButtonVariant.Secondary}
                aria-pressed={mode === FlowNodeMetricMode.Frequency}
                onPress={() => { selectMode(FlowNodeMetricMode.Frequency); }}
              >
                Frequency
              </Button>
              <Button
                className={styles.modeButton!}
                variant={ButtonVariant.Secondary}
                aria-pressed={mode === FlowNodeMetricMode.Duration}
                onPress={() => { selectMode(FlowNodeMetricMode.Duration); }}
              >
                Duration
              </Button>
            </div>
          </div>

          <DefinitionDiagram
            api={definitionApi}
            definition={definition}
            metricBadges={projection.badges}
            onMissingMetricElementIds={reportMissingElements}
          />

          {missingElementIds.length === 0 ? null : (
            <div className={styles.missing} role="status">
              <strong>Metrics not present in this diagram</strong>
              <ul>
                {missingElementIds.map((elementId) => <li key={elementId}><code>{elementId}</code></li>)}
              </ul>
            </div>
          )}

          <div className={styles.tableOwner} data-ui="flow-node-metrics-table-owner">
            <table aria-label="Flow-node metric values">
              <thead>
                <tr>
                  <th scope="col" rowSpan={2}>Element ID</th>
                  <th scope="col" rowSpan={2}>Frequency</th>
                  <th scope="col" rowSpan={2}>Running</th>
                  <th scope="col" rowSpan={2}>Completed</th>
                  <th scope="col" rowSpan={2}>Cancelled</th>
                  <th scope="colgroup" colSpan={4}>Completed duration (ms)</th>
                </tr>
                <tr>
                  <th scope="col">Samples</th>
                  <th scope="col">Minimum</th>
                  <th scope="col">Maximum</th>
                  <th scope="col">Average</th>
                </tr>
              </thead>
              <tbody>
                {projection.rows.map((metric) => (
                  <tr key={metric.elementId}>
                    <th scope="row"><code>{metric.elementId}</code></th>
                    <td>{metric.frequency}</td>
                    <td>{metric.running}</td>
                    <td>{metric.completed}</td>
                    <td>{metric.cancelled}</td>
                    {metric.completedDuration === null ? (
                      <td className={styles.noSamples} colSpan={4}>No completed samples</td>
                    ) : (
                      <>
                        <td>{metric.completedDuration.sampleCount}</td>
                        <td>{metric.completedDuration.minimumMs}</td>
                        <td>{metric.completedDuration.maximumMs}</td>
                        <td>{metric.completedDuration.averageMs}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
