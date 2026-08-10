import { useState } from "react";

import { ProcessInstanceStartStatus } from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ProcessInstanceStartResult,
} from "@bpmn-lean/platform-contracts";

import type { DefinitionApiClient } from "./definitions-api";

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

  async function start(): Promise<void> {
    setStarting(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.start(definition));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unknown platform failure");
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="start-panel" aria-labelledby="start-heading">
      <div>
        <p className="eyebrow">Exact version command</p>
        <h2 id="start-heading">Start this definition</h2>
        <p>
          The platform sends version {definition.version} and its stored source identity to the engine.
        </p>
      </div>
      <button type="button" disabled={starting} onClick={() => { void start(); }}>
        {starting ? "Starting…" : `Start version ${definition.version}`}
      </button>
      {error === null ? null : <p className="error" role="alert">{error}</p>}
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
        <div className="start-result accepted" aria-live="polite">
          <strong>Process instance started</strong>
          <span data-testid="started-instance-definition">
            {result.instance.definition.processId}, version {result.instance.definition.version}
          </span>
          <code data-testid="started-instance-id">{result.instance.processInstanceId}</code>
        </div>
      );
    case ProcessInstanceStartStatus.Rejected:
      return (
        <div className="start-result rejected" aria-live="polite">
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
