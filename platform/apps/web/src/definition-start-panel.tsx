import { useState } from "react";

import { ProcessInstanceStartStatus } from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ProcessInstanceStartResult,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import { Button } from "@bpmn-lean/platform-ui-kit";

import type { DefinitionApiClient } from "./definitions-api";
import styles from "./definition-start-panel.module.css";
import { resolveMuePreviewAlphaStart } from "./mue-preview-alpha-start";
import { findProcessShowcase } from "./process-showcase-catalog.ts";

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
  const alphaStart = resolveMuePreviewAlphaStart(definition);
  const showcase = findProcessShowcase(definition);

  async function start(): Promise<void> {
    setStarting(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.start(
        definition,
        showcase?.showcase?.start ?? alphaStart?.command ?? { initialVariables: [] },
      ));
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
          <p className={styles.eyebrow}>Exact version command</p>
          <h2 id="start-heading">Start this definition</h2>
          <p>
            The platform sends version {definition.version} and its stored source identity to the engine.
          </p>
        </div>
        <Button isPending={starting} onPress={() => { void start(); }}>
          {starting ? "Starting…" : `Start version ${definition.version}`}
        </Button>
      </div>
      {alphaStart === null ? null : (
        <div className={styles.previewInput} data-testid="mue-preview-alpha-start-input">
          <strong>MUE Preview Alpha</strong>
          <span>{alphaStart.label}</span>
        </div>
      )}
      {showcase?.showcase === null || showcase === null ? null : (
        <div className={styles.previewInput}>
          <strong>{showcase.title}</strong>
          <p>{showcase.showcase.tryIt}</p>
          {showcase.showcase.mode === "guided" ? <p>Guided simulation: the RC showcase host supplies simulated participants and external services. On other hosts, this starts the model without those participants.</p> : null}
          {showcase.showcase.start.initialVariables.length === 0 ? null : (
            <details><summary>Showcase start data</summary><pre>{JSON.stringify(showcase.showcase.start.initialVariables, null, 2)}</pre></details>
          )}
        </div>
      )}
      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      <StartResult result={result} />
      {result?.status === ProcessInstanceStartStatus.Started && onOpenInstance !== undefined ? (
        <Button onPress={() => onOpenInstance(result.instance)}>View instance in Operations</Button>
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
