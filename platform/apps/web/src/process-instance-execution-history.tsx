import {
  SemanticTransitionKind,
  StimulusKind,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  CommittedTransitionRecord,
  OccurrenceId,
  ScopeOccurrenceId,
  Stimulus,
} from "@bpmn-lean/platform-contracts";

import styles from "./process-instance-execution-history.module.css";

export type ProcessInstanceExecutionHistoryProps = Readonly<{
  batches: readonly CommittedTransitionBatch[];
}>;

/** Complete revision-ordered semantic history. Every row is one published transition fact. */
export function ProcessInstanceExecutionHistory({
  batches,
}: ProcessInstanceExecutionHistoryProps) {
  const records = batches.flatMap((batch) => batch.transitions.map((record) => ({
    commandId: batch.commandId,
    record,
  })));
  return (
    <section className={styles.panel} data-ui="execution-history" aria-labelledby="execution-history-heading">
      <div>
        <p className={styles.eyebrow}>Committed semantic history</p>
        <h3 id="execution-history-heading">History</h3>
        <p className={styles.summary}>Every record is shown in committed revision order. External stimuli and selected internal operations remain separate facts.</p>
      </div>
      <ol className={styles.records}>
        {records.map(({ commandId, record }) => (
          <li key={record.revision} className={styles.record} data-revision={record.revision}>
            <TransitionRecord commandId={commandId} record={record} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function TransitionRecord({
  commandId,
  record,
}: Readonly<{ commandId: string; record: CommittedTransitionRecord }>) {
  switch (record.transition.kind) {
    case SemanticTransitionKind.ExternalStimulus:
      return (
        <>
          <RecordHeading label="External stimulus" revision={record.revision} />
          <dl className={styles.facts}>
            <Fact label="Command ID" value={commandId} />
            <Fact label="Stimulus" value={record.transition.stimulus.kind} />
            <Fact label="Logical time" value={`${record.logicalTimeMs} ms`} />
            {stimulusOccurrence(record.transition.stimulus)}
          </dl>
          <details>
            <summary>Exact stimulus values</summary>
            <pre>{JSON.stringify(record.transition.stimulus, null, 2)}</pre>
          </details>
        </>
      );
    case SemanticTransitionKind.InternalOperation:
      return (
        <>
          <RecordHeading label="Internal operation" revision={record.revision} />
          <dl className={styles.facts}>
            <Fact label="Command ID" value={commandId} />
            <Fact label="Operation" value={record.transition.operationKind} />
            <Fact label="Operation ID" value={record.transition.operationId} />
            <Fact label="Origin element" value={record.transition.origin.elementId} />
            <Fact label="Owner" value={scopeOccurrenceLabel(record.transition.owner)} />
            <Fact label="Logical time" value={`${record.logicalTimeMs} ms`} />
          </dl>
        </>
      );
  }
}

function RecordHeading({ label, revision }: Readonly<{ label: string; revision: number }>) {
  return (
    <div className={styles.recordHeading}>
      <strong>{label}</strong>
      <span>Revision {revision}</span>
    </div>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return <><dt>{label}</dt><dd><code>{value}</code></dd></>;
}

function stimulusOccurrence(stimulus: Stimulus) {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
      return <Fact label="Process instance" value={stimulus.instanceId} />;
    case StimulusKind.CompleteUserTaskInstance:
      return <Fact label="Task occurrence" value={occurrenceLabel(stimulus.taskId)} />;
    case StimulusKind.DeliverMessage:
      return <Fact label="Subscription occurrence" value={occurrenceLabel(stimulus.subscriptionId)} />;
    case StimulusKind.FireTimer:
      return <Fact label="Timer occurrence" value={occurrenceLabel(stimulus.timerId)} />;
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
      return <Fact label="Effect occurrence" value={occurrenceLabel(stimulus.effectId)} />;
    case StimulusKind.RetryIncident:
      return <Fact label="Incident occurrence" value={occurrenceLabel(stimulus.incidentId.effectId)} />;
    case StimulusKind.CancelIncidentProcess:
      return <Fact label="Incident occurrence" value={occurrenceLabel(stimulus.incidentId.effectId)} />;
  }
}

function occurrenceLabel(id: OccurrenceId): string {
  return `${id.processInstanceId} / ${id.elementId} / activation ${id.activation}`;
}

function scopeOccurrenceLabel(id: ScopeOccurrenceId): string {
  return `${id.processInstanceId} / ${id.definitionScopeId} / activation ${id.activation}`;
}
