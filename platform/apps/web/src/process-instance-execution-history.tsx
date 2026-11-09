import {
  ExecutionInputKind,
  ExecutionRoleKind,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  CommittedTransitionRecord,
  ExecutionRole,
} from "@bpmn-lean/platform-contracts";

import styles from "./process-instance-execution-history.module.css";

export type ProcessInstanceExecutionHistoryProps = Readonly<{
  batches: readonly CommittedTransitionBatch[];
}>;

/** Complete revision-ordered semantic history. Every row is one published kernel micro-step. */
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
        <p className={styles.summary}>Every record is one committed engine step in revision order: what caused it, the element it acted on and the scope that owns it. Records of one command share its command ID.</p>
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
  return (
    <>
      <div className={styles.recordHeading}>
        <strong>{roleTitle(record.role)}</strong>
        <span>Revision {record.revision}</span>
      </div>
      <dl className={styles.facts}>
        <Fact label="Command ID" value={commandId} />
        <RoleFact role={record.role} />
        {record.element === null ? <><dt>Element</dt><dd>None</dd></> : <Fact label="Element" value={record.element} />}
        {record.sourceType === null ? null : <Fact label="Element type" value={record.sourceType} />}
        <Fact label="Owner scope" value={String(record.owner)} />
      </dl>
    </>
  );
}

function roleTitle(role: ExecutionRole): string {
  switch (role.kind) {
    case ExecutionRoleKind.Input:
      return inputTitle(role.input);
    case ExecutionRoleKind.Signal:
      return "Signal";
    case ExecutionRoleKind.Arrive:
      return "Sequence Flow arrival";
    case ExecutionRoleKind.Idle:
      return "Scope idle";
  }
}

function inputTitle(input: ExecutionInputKind): string {
  switch (input) {
    case ExecutionInputKind.Start:
      return "Start";
    case ExecutionInputKind.Command:
      return "Command";
    case ExecutionInputKind.Deliver:
      return "Delivery";
    case ExecutionInputKind.TimerFire:
      return "Timer firing";
    case ExecutionInputKind.EffectResult:
      return "Effect result";
  }
}

function RoleFact({ role }: Readonly<{ role: ExecutionRole }>) {
  switch (role.kind) {
    case ExecutionRoleKind.Input:
      return <Fact label="Input" value={role.input} />;
    case ExecutionRoleKind.Signal:
      return <Fact label="Signal" value={role.signal} />;
    case ExecutionRoleKind.Arrive:
      return <Fact label="Sequence Flow" value={role.flow} />;
    case ExecutionRoleKind.Idle:
      return <Fact label="Idle scope" value={String(role.scope)} />;
  }
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return <><dt>{label}</dt><dd><code>{value}</code></dd></>;
}
