import { useState } from "react";

import { ProcessInstanceStartStatus } from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ProcessInstanceStartResult,
} from "@bpmn-lean/platform-contracts";
import { Button } from "@bpmn-lean/platform-ui-kit";

import type { DefinitionApiClient } from "./definitions-api";
import styles from "./definition-start-panel.module.css";
import { resolveMuePreviewAlphaStart } from "./mue-preview-alpha-start";

export type DefinitionStartPanelProps = Readonly<{
  api: DefinitionApiClient;
  definition: DeployedDefinitionVersion;
}>;

export function DefinitionStartPanel({
  api,
  definition,
}: DefinitionStartPanelProps) {
  const [result, setResult] = useState<ProcessInstanceStartResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alphaStart = resolveMuePreviewAlphaStart(definition);

  async function start(): Promise<void> {
    setStarting(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.start(
        definition,
        alphaStart?.command ?? { initialVariables: [] },
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
      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      <StartResult result={result} />
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
