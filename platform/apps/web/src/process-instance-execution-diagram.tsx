import { useCallback, useMemo, useState } from "react";

import type {
  CurrentCommittedExecution,
  DeployedDefinitionVersion,
  StateOpenWait,
} from "@bpmn-lean/platform-contracts";

import { DefinitionDiagram } from "./definition-diagram.tsx";
import type { DefinitionApiClient } from "./definitions-api.ts";
import { BpmnDiagramMarkerKind } from "./bpmn-viewer-contract.ts";
import {
  displayOccurrence,
  openWaitKey,
} from "./process-instance-position-identity.ts";
import styles from "./process-instance-execution-diagram.module.css";

export type ProcessInstanceExecutionDiagramProps = Readonly<{
  api: Pick<DefinitionApiClient, "getPresentation">;
  current: CurrentCommittedExecution;
  definition: DeployedDefinitionVersion;
}>;

/** The open waits of the committed state over the matching deployed definition presentation. */
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
        <p>Highlights mark every open wait of this Process instance on the presentation whose source digest matches this confirmed definition. Waits of called instances are listed, never drawn on this diagram.</p>
      </div>
      <div className={styles.guide} aria-label="Diagram position guide">
        <span><span className={styles.waitKey} aria-hidden="true" />Open wait</span>
      </div>
      <DefinitionDiagram
        api={api}
        definition={definition}
        highlight={{
          elementIds,
          markerKind: BpmnDiagramMarkerKind.Current,
        }}
        onMissingElementIds={publishMissing}
      />
      <PositionList current={current} />
      {missing.length === 0 ? null : (
        <div className={styles.missing} role="status">
          <strong>Open waits outside this diagram</strong>
          <p>These open-wait elements have no rendered shape in this presentation and were not guessed onto it.</p>
          <ul>{missing.map((elementId) => <li key={elementId}><code>{elementId}</code></li>)}</ul>
        </div>
      )}
    </section>
  );
}

function PositionList({ current }: Readonly<{ current: CurrentCommittedExecution }>) {
  const waits = current.state.openWaits;
  return (
    <div className={styles.positions}>
      <div>
        <h4>Open waits</h4>
        <OpenWaitList waits={waits.filter(isRootInstanceWait)} />
      </div>
      <div>
        <h4>Open waits in called instances</h4>
        <OpenWaitList waits={waits.filter((wait) => !isRootInstanceWait(wait))} />
      </div>
    </div>
  );
}

function OpenWaitList({ waits }: Readonly<{ waits: readonly StateOpenWait[] }>) {
  return waits.length === 0 ? <p>None.</p> : (
    <ul>{waits.map((wait) => (
      <li key={openWaitKey(wait)}>
        <code>{wait.id.elementId}</code>, kind <code>{wait.detail.kind}</code>, occurrence <code>{displayOccurrence(wait.id)}</code>
      </li>
    ))}</ul>
  );
}

/** A wait runs in a called instance exactly when the engine names the called definition it runs in. */
function isRootInstanceWait(wait: StateOpenWait): boolean {
  return wait.definition === null;
}

function positionElementIds(current: CurrentCommittedExecution): readonly string[] {
  return [...new Set(current.state.openWaits.filter(isRootInstanceWait).map(({ id }) => id.elementId))];
}
