import { useEffect, useState } from "react";

import {
  ExecutionInputKind,
  ExecutionRoleKind,
  ProcessStatus,
  VariableValueKind,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  PublicJsonObject,
} from "@bpmn-lean/platform-contracts";

import { isMuePreviewAlphaDefinition, type MuePreviewAlphaIdentity } from "./mue-preview-alpha-start.ts";
import styles from "./mue-preview-alpha-progress.module.css";

const terminalOutputName = "DataObjectReference_OutputResults";

export type MuePreviewAlphaProgressProps = Readonly<{
  batches: readonly CommittedTransitionBatch[];
  current: CurrentCommittedExecution;
  definition: MuePreviewAlphaIdentity;
}>;

/** Presents only exact committed facts of the MUE Preview Alpha model and ephemeral browser samples. */
export function MuePreviewAlphaProgress({
  batches,
  current,
  definition,
}: MuePreviewAlphaProgressProps) {
  const [samples, setSamples] = useState<readonly CurrentCommittedExecution[]>([]);
  const isAlpha = isMuePreviewAlphaDefinition(definition);

  useEffect(() => {
    if (!isAlpha) return;
    setSamples((observed) => {
      if (observed.at(-1)?.revision === current.revision) return observed;
      return [...observed, immutableBrowserCopy(current)];
    });
  }, [current, isAlpha]);

  if (!isAlpha) return null;
  const firedTimers = committedTimerFirings(batches);
  const terminalOutput = current.state.variables.find(
    ({ name }) => name === terminalOutputName,
  );

  return (
    <section
      className={styles.preview}
      data-ui="mue-preview-alpha"
      aria-labelledby="mue-preview-alpha-heading"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.label}>MUE Preview Alpha</p>
          <h4 id="mue-preview-alpha-heading">Committed progress</h4>
        </div>
        <p className={styles.sessionLabel}>Observed in this browser session</p>
      </header>

      <ObservedRevisions samples={samples} />
      <CommittedTimerFirings firings={firedTimers} />
      {current.state.status === ProcessStatus.Running ? null : (
        <TerminalOutput output={terminalOutput?.value} />
      )}
    </section>
  );
}

function ObservedRevisions({
  samples,
}: Readonly<{ samples: readonly CurrentCommittedExecution[] }>) {
  if (samples.length === 0) return null;
  return (
    <div className={styles.observed}>
      <p className={styles.secondaryLabel}>Committed samples</p>
      <ol aria-label="Observed committed revisions">
        {samples.map((sample) => (
          <li key={sample.revision}>
            Revision {sample.revision}: {sample.state.status}
          </li>
        ))}
      </ol>
    </div>
  );
}

type TimerFiring = Readonly<{
  commandId: string;
  element: string | null;
  revision: number;
}>;

function CommittedTimerFirings({ firings }: Readonly<{ firings: readonly TimerFiring[] }>) {
  if (firings.length === 0) return null;
  return (
    <div className={styles.evidence}>
      <p className={styles.secondaryLabel}>Committed Timer firings</p>
      <ul aria-label="Committed Timer firings">
        {firings.map((firing) => (
          <li key={firing.revision}>
            Revision {firing.revision}: <code>timerFire</code> {firing.element === null ? null : <>at <code>{firing.element}</code></>} in command <code>{firing.commandId}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TerminalOutput({ output }: Readonly<{ output: PublicJsonObject | undefined }>) {
  const items = output === undefined ? null : stringListItems(output);
  return (
    <div className={styles.terminal}>
      <p className={styles.secondaryLabel}>Committed terminal output</p>
      {output === undefined ? (
        <p>No output collection is present in this committed terminal state. This absence alone does not identify the route.</p>
      ) : (
        <dl className={styles.terminalOutput}>
          <dt><code>{terminalOutputName}</code></dt>
          <dd>{items === null ? <code>{JSON.stringify(output)}</code> : (
            <ol>{items.map((item, index) => (
              <li key={JSON.stringify(["terminalOutput", index, item])}>{item}</li>
            ))}</ol>
          )}</dd>
        </dl>
      )}
    </div>
  );
}

/** The items of an engine-typed string list; `null` for every other value form, which is shown exactly instead. */
function stringListItems(value: PublicJsonObject): readonly string[] | null {
  const items = value.value;
  return value.kind === VariableValueKind.StringList && Array.isArray(items) &&
      items.every((item) => typeof item === "string")
    ? items as readonly string[]
    : null;
}

function committedTimerFirings(
  batches: readonly CommittedTransitionBatch[],
): TimerFiring[] {
  return batches.flatMap(({ commandId, transitions }) => transitions.flatMap((record) =>
    record.role.kind === ExecutionRoleKind.Input && record.role.input === ExecutionInputKind.TimerFire
      ? [{ commandId, element: record.element, revision: record.revision }]
      : []));
}

function immutableBrowserCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value);
}
