import { useCallback, useMemo, useState } from "react";

import type {
  CurrentCommittedExecution,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";

import { DefinitionDiagram } from "./definition-diagram.tsx";
import type { DefinitionApiClient } from "./definitions-api.ts";
import {
  displayScopeOccurrence,
  executionScopeKey,
  executionTokenKey,
} from "./process-instance-position-identity.ts";
import styles from "./process-instance-execution-diagram.module.css";

export type ProcessInstanceExecutionDiagramProps = Readonly<{
  api: Pick<DefinitionApiClient, "getPresentation">;
  current: CurrentCommittedExecution;
  definition: DeployedDefinitionVersion;
}>;

/** Exact current published positions over the matching deployed definition presentation. */
export function ProcessInstanceExecutionDiagram({
  api,
  current,
  definition,
}: ProcessInstanceExecutionDiagramProps) {
  const elementIds = useMemo(() => positionElementIds(current), [current]);
  const [missing, setMissing] = useState<readonly string[]>([]);
  const publishMissing = useCallback((ids: readonly string[]) => {
    setMissing(ids);
  }, []);
  return (
    <section className={styles.panel} data-ui="execution-diagram" aria-labelledby="execution-diagram-heading">
      <div>
        <p className={styles.eyebrow}>Current committed position</p>
        <h3 id="execution-diagram-heading">Diagram</h3>
        <p>Highlights combine every published token Sequence Flow and active wait element on the presentation whose source digest matches this confirmed definition.</p>
      </div>
      <DefinitionDiagram
        activeElementIds={elementIds}
        api={api}
        definition={definition}
        onMissingElementIds={publishMissing}
      />
      <PositionList current={current} />
      {missing.length === 0 ? null : (
        <div className={styles.missing} role="status">
          <strong>Published positions outside this diagram</strong>
          <p>These called-Process or missing rendered elements remain part of the committed position and were not guessed onto this diagram.</p>
          <ul>{missing.map((elementId) => <li key={elementId}><code>{elementId}</code></li>)}</ul>
        </div>
      )}
    </section>
  );
}

function PositionList({ current }: Readonly<{ current: CurrentCommittedExecution }>) {
  return (
    <div className={styles.positions}>
      <div>
        <h4>Control tokens</h4>
        {current.controlTokens.length === 0 ? <p>None.</p> : (
          <ul>{current.controlTokens.map((token) => (
            <li key={executionTokenKey(token)}>
              <code>{token.sequenceFlowId}</code>, multiplicity {token.multiplicity}, owner <code>{displayScopeOccurrence(token.owner)}</code>
            </li>
          ))}</ul>
        )}
      </div>
      <div>
        <h4>Active waits</h4>
        {current.state.activeWaits.length === 0 ? <p>None.</p> : (
          <ul>{current.state.activeWaits.map((wait) => (
            <li key={JSON.stringify(["activeWait", wait.elementId, wait.kind])}>
              <code>{wait.elementId}</code>, kind {wait.kind}, multiplicity {wait.multiplicity}
            </li>
          ))}</ul>
        )}
      </div>
      <div>
        <h4>Live scopes</h4>
        {current.scopes.length === 0 ? <p>None.</p> : (
          <ul>{current.scopes.map((scope) => (
            <li key={executionScopeKey(scope)}>
              <code>{scope.bpmnElementId}</code>, occurrence <code>{displayScopeOccurrence(scope.id)}</code>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

function positionElementIds(current: CurrentCommittedExecution): readonly string[] {
  return [...new Set([
    ...current.controlTokens.map(({ sequenceFlowId }) => sequenceFlowId),
    ...current.state.activeWaits.map(({ elementId }) => elementId),
  ])];
}
