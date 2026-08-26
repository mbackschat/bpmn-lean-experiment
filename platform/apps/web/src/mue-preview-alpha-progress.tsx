import { useEffect, useState } from "react";

import {
  SemanticTransitionKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  OpenSequentialMultiInstance,
  VariableValue,
} from "@bpmn-lean/platform-contracts";

import { isMuePreviewAlphaProfile } from "./mue-preview-alpha-start.ts";
import styles from "./mue-preview-alpha-progress.module.css";

const terminalOutputName = "DataObjectReference_OutputResults";

export type MuePreviewAlphaProgressProps = Readonly<{
  batches: readonly CommittedTransitionBatch[];
  current: CurrentCommittedExecution;
  semanticProfile: string;
}>;

/** Presents only exact committed Sequential Multi-Instance facts and ephemeral browser samples. */
export function MuePreviewAlphaProgress({
  batches,
  current,
  semanticProfile,
}: MuePreviewAlphaProgressProps) {
  const [samples, setSamples] = useState<readonly CurrentCommittedExecution[]>([]);
  const isAlphaState = isMuePreviewAlphaProfile(semanticProfile) &&
    Object.hasOwn(current.state, "openMultiInstances");

  useEffect(() => {
    if (!isAlphaState) return;
    setSamples((observed) => {
      if (observed.at(-1)?.revision === current.revision) return observed;
      return [...observed, immutableBrowserCopy(current)];
    });
  }, [current, isAlphaState]);

  if (!isAlphaState) return null;
  const controllers = (current.state.openMultiInstances ?? []).filter(
    (controller): controller is OpenSequentialMultiInstance =>
      controller.mode === "sequential",
  );
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
          <h4 id="mue-preview-alpha-heading">Sequential Multi-Instance progress</h4>
        </div>
        <p className={styles.sessionLabel}>Observed in this browser session</p>
      </header>

      {controllers.length === 0 ? (
        <p className={styles.status} role="status">
          No Multi-Instance controller is open in committed revision {current.revision}.
        </p>
      ) : (
        <div className={styles.controllers}>
          {controllers.map((controller) => (
            <ControllerProgress
              controller={controller}
              key={activityOccurrenceKey(controller)}
            />
          ))}
        </div>
      )}

      <ObservedRevisions samples={samples} />
      <CommittedTimerFirings firings={firedTimers} />
      <PublishedCompletionInteractions current={current} />
      {current.state.status === "running" ? null : (
        <TerminalOutput output={terminalOutput?.value} />
      )}
    </section>
  );
}

function ControllerProgress({
  controller,
}: Readonly<{ controller: OpenSequentialMultiInstance }>) {
  const iteration = controller.activeIterations[0]!;
  return (
    <article className={styles.controller}>
      <div className={styles.controllerHeading}>
        <div>
          <p className={styles.secondaryLabel}>Sequential body</p>
          <h5>{controller.id.activityElementId} / activation {controller.id.activation}</h5>
        </div>
        <span className={styles.mode}>Sequential</span>
      </div>
      <progress
        aria-label={`Completed ${controller.id.activityElementId} instances`}
        max={controller.plannedInstanceCount}
        value={controller.numberOfCompletedInstances}
      />
      <dl className={styles.metrics}>
        <Metric label="Planned" value={controller.plannedInstanceCount} />
        <Metric label="Completed" value={controller.numberOfCompletedInstances} />
        <Metric label="Active" value={controller.numberOfActiveInstances} />
        <Metric label="Pending" value={controller.pendingItemCount} />
      </dl>
      <div className={styles.iteration}>
        <p className={styles.secondaryLabel}>Active iteration</p>
        <p><code>{iteration.taskId.elementId} / activation {iteration.taskId.activation}</code></p>
        <dl className={styles.iterationFacts}>
          <dt>Loop counter</dt><dd>{iteration.loopCounter}</dd>
          <dt>Current input</dt><dd><code>{formatValue(iteration.taskInput.value)}</code></dd>
          <dt>Completion binding</dt><dd><code>{iteration.completionBindingName}</code></dd>
        </dl>
      </div>
    </article>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
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
  elementId: string;
  activation: number;
  revision: number;
}>;

function CommittedTimerFirings({ firings }: Readonly<{ firings: readonly TimerFiring[] }>) {
  if (firings.length === 0) return null;
  return (
    <div className={styles.evidence}>
      <p className={styles.secondaryLabel}>Committed Timer commands</p>
      <ul aria-label="Committed Timer commands">
        {firings.map((firing) => (
          <li key={JSON.stringify(["timerFiring", firing.revision, firing.commandId])}>
            Revision {firing.revision}: <code>fireTimer</code> for <code>{firing.elementId} / activation {firing.activation}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PublishedCompletionInteractions({
  current,
}: Readonly<{ current: CurrentCommittedExecution }>) {
  const completions = current.state.enabledInteractions.filter(
    (interaction) => interaction.kind === StimulusKind.CompleteUserTaskInstance,
  );
  if (completions.length === 0) return null;
  return (
    <div className={styles.evidence}>
      <p className={styles.secondaryLabel}>Published completion interactions</p>
      <ul aria-label="Published completion interactions">
        {completions.map(({ taskId }) => (
          <li key={JSON.stringify(["completionInteraction", taskId.elementId, taskId.activation])}>
            <code>{taskId.elementId} / activation {taskId.activation}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TerminalOutput({ output }: Readonly<{ output: VariableValue | undefined }>) {
  return (
    <div className={styles.terminal}>
      <p className={styles.secondaryLabel}>Committed terminal output</p>
      {output === undefined ? (
        <p>No output collection is present in this committed terminal state. This absence alone does not identify the route.</p>
      ) : (
        <dl className={styles.terminalOutput}>
          <dt><code>{terminalOutputName}</code></dt>
          <dd>{output.kind === VariableValueKind.StringList ? (
            <ol>{output.value.map((item, index) => (
              <li key={JSON.stringify(["terminalOutput", index, item])}>{item}</li>
            ))}</ol>
          ) : <code>{formatValue(output)}</code>}</dd>
        </dl>
      )}
    </div>
  );
}

function committedTimerFirings(
  batches: readonly CommittedTransitionBatch[],
): TimerFiring[] {
  return batches.flatMap(({ transitions }) => transitions.flatMap((record) => {
    if (
      record.transition.kind !== SemanticTransitionKind.ExternalStimulus ||
      record.transition.stimulus.kind !== StimulusKind.FireTimer
    ) return [];
    const { stimulus } = record.transition;
    return [{
      commandId: stimulus.commandId,
      elementId: stimulus.timerId.elementId,
      activation: stimulus.timerId.activation,
      revision: record.revision,
    }];
  }));
}

function formatValue(value: VariableValue): string {
  switch (value.kind) {
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
      return String(value.value);
    case VariableValueKind.String:
      return value.value;
    case VariableValueKind.StringList:
      return JSON.stringify(value.value);
    case VariableValueKind.Null:
      return "null";
  }
}

function activityOccurrenceKey(controller: OpenSequentialMultiInstance): string {
  const { id } = controller;
  return JSON.stringify([
    "activityOccurrence",
    id.processInstanceId,
    id.activityElementId,
    id.activation,
  ]);
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
