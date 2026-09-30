import { useEffect, useRef, useState } from "react";

import { ProcessInstanceStartStatus } from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ProcessInstanceStartResult,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant, InlineDisclosure } from "@bpmn-lean/platform-ui-kit";

import type { DefinitionApiClient } from "./definitions-api";
import styles from "./definition-start-panel.module.css";
import { resolveMuePreviewAlphaStart } from "./mue-preview-alpha-start";
import { findProcessShowcase } from "./process-showcase-catalog.ts";
import { LatestRequest } from "./latest-request.ts";

export type DefinitionStartPanelProps = Readonly<{
  api: DefinitionApiClient;
  definition: DeployedDefinitionVersion;
  onOpenInstance?: (instance: PublicProcessInstanceIdentity) => void;
}>;

export function DefinitionStartPanel({
  api,
  definition,
  onOpenInstance,
}: DefinitionStartPanelProps) {
  const [result, setResult] = useState<ProcessInstanceStartResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const automaticNavigation = useRef(new LatestRequest());
  useEffect(() => () => { automaticNavigation.current.invalidate(); }, []);
  const alphaStart = resolveMuePreviewAlphaStart(definition);
  const showcase = findProcessShowcase(definition);

  async function start(): Promise<void> {
    const navigationGeneration = automaticNavigation.current.begin();
    setStarting(true);
    setError(null);
    setResult(null);
    try {
      const started = await api.start(
        definition,
        showcase?.showcase?.start ?? alphaStart?.command ?? { initialVariables: [] },
      );
      setResult(started);
      if (started.status === ProcessInstanceStartStatus.Started && showcase?.showcase?.mode === "guided"
        && automaticNavigation.current.isCurrent(navigationGeneration)) {
        onOpenInstance?.(started.instance);
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unknown platform failure");
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="start-heading">
      <div className={styles.layout}>
        <div>
          <h2 id="start-heading" tabIndex={-1}>Ready to start</h2>
          <p>
            Start a new instance of {showcase?.title ?? definition.processId}, version {definition.version}.
            {" "}Each start creates a separate instance.
          </p>
        </div>
        <Button variant={result?.status === ProcessInstanceStartStatus.Started ? ButtonVariant.Secondary : ButtonVariant.Primary} isPending={starting} onPress={() => { void start(); }}>
          {starting ? "Starting…" : `Start version ${definition.version}`}
        </Button>
      </div>
      {alphaStart === null ? null : (
        <div className={styles.previewInput} data-testid="mue-preview-alpha-start-input">
          <strong>Example input</strong>
          <span>{alphaStart.label}</span>
        </div>
      )}
      {showcase?.showcase === null || showcase === null ? null : (
        <div className={styles.previewInput}>
          <strong>{showcase.title}</strong>
          <p>{showcase.showcase.tryIt}</p>
          {showcase.showcase.mode === "guided" ? <div>
            <strong>Automatic demonstration</strong>
            <p>In the RC demo, simulated participants and services run this example automatically, often within seconds. After Start, we’ll open the instance so you can see its progress, result and History. On other hosts, tasks wait for their participants.</p>
          </div> : null}
          {showcase.showcase.start.initialVariables.length === 0 ? null : (
            <InlineDisclosure title="Showcase start data"><pre>{JSON.stringify(showcase.showcase.start.initialVariables, null, 2)}</pre></InlineDisclosure>
          )}
        </div>
      )}
      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      <StartResult result={result} />
      {result?.status === ProcessInstanceStartStatus.Started ? (
        <div className={styles.nextSteps}>
          <h3>What happens next</h3>
          {showcase?.showcase?.mode === "human" ? (
            <p>Open the task inbox, find this process, then claim and complete its tasks. The inbox shows work available to you; a task may take a moment to appear. <a href="#/work">Open task inbox</a></p>
          ) : (
            <p>{showcase?.showcase?.mode === "guided" ? "The showcase host supplies simulated participants and services. " : ""}Open this instance to see its current state, diagram and History.</p>
          )}
          {onOpenInstance === undefined ? null : <Button onPress={() => onOpenInstance(result.instance)}>View instance in Operations</Button>}
        </div>
      ) : null}
    </section>
  );
}

function StartResult({ result }: Readonly<{ result: ProcessInstanceStartResult | null }>) {
  if (result === null) {
    return null;
  }
  switch (result.status) {
    case ProcessInstanceStartStatus.Started:
      return (
        <div className={`${styles.result} ${styles.accepted}`} aria-live="polite">
          <strong>Process instance started</strong>
          <span data-testid="started-instance-definition">
            {result.instance.definition.processId}, version {result.instance.definition.version}
          </span>
          <code data-testid="started-instance-id">{result.instance.processInstanceId}</code>
        </div>
      );
    case ProcessInstanceStartStatus.Rejected:
      return (
        <div className={`${styles.result} ${styles.rejected}`} aria-live="polite">
          <strong>Process instance not started</strong>
          <span>{result.definition.processId}, version {result.definition.version}</span>
          <code>{result.failure.code}</code>
          <p>{result.failure.evidence}</p>
        </div>
      );
    default:
      return assertNever(result);
  }
}

function assertNever(value: never): never {
  throw new Error(`unexpected process-instance start result: ${String(value)}`);
}
