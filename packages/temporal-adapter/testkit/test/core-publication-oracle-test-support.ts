/**
 * Refinement oracle for the E1 and E2 publications: numbers the semantic core's own committed publications and
 * lifecycle deltas as the hosting contract specifies, so a live host snapshot can be compared with them in full.
 *
 * The numbering restated here is the public contract rather than the host's code. Transition revisions count from 1
 * across the whole committed history; an occurrence started at position `i` of the transition with revision `r` is
 * identified by `(instance, r, i)`; and the open set is whatever no later transition ended. The Worker runs the same
 * TypeScript semantic core that produced the expected values, so this checks the host's encoding, numbering and
 * carrying of the core's publications. It is a refinement check, not an independent lane.
 *
 * Host wall-clock stamps (`committedAtEpochMs`, `startedAtEpochMs`) are the only fields left out of the comparison.
 * They are readings of the host clock, not semantic output, and are checked for being non-decreasing safe integers.
 */
import assert from "node:assert/strict";

import {
  FlowNodeOccurrenceTerminalKind,
  ScenarioStepKind,
  projectOpenFlowNodeOccurrences,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  ScenarioStep,
  SemanticProcessProgram,
  Stimulus,
  UnnumberedCommittedExecutionPublication,
  UnnumberedFlowNodeOccurrenceDelta,
  UnnumberedFlowNodeOccurrenceStart,
} from "@bpmn-lean/semantic-core";

import type { ExecutionSnapshot, OccurrenceSnapshot } from "./live-process-observation-test-support.ts";

/** What one committed command published according to the core, before any host numbering. */
export type CoreCommit = DeepReadonly<{
  commandId: string;
  publication: UnnumberedCommittedExecutionPublication;
  lifecycles: UnnumberedFlowNodeOccurrenceDelta[];
  /** The core's own projection of the open set after this command, used to check the lifecycle fold. */
  open: UnnumberedFlowNodeOccurrenceStart[];
}>;

export type PublicationSnapshot = DeepReadonly<{
  execution: ExecutionSnapshot;
  occurrences: OccurrenceSnapshot;
}>;

type PublishedStart = DeepReadonly<{
  id: { processInstanceId: string; startRevision: number; startIndex: number };
  processId: string;
  elementId: string;
  owner: UnnumberedFlowNodeOccurrenceStart["owner"];
}>;

export function coreCommit(
  program: SemanticProcessProgram,
  stimulus: Stimulus,
  step: Extract<ScenarioStep, { kind: ScenarioStepKind.Committed }>,
): CoreCommit {
  const { publication, flowNodeOccurrenceLifecycles } = step;
  assert.ok(publication !== null && flowNodeOccurrenceLifecycles !== null,
    "a committed core step must carry its publication and lifecycle deltas");
  assert.equal(flowNodeOccurrenceLifecycles.length, publication.transitions.length);
  const open = projectOpenFlowNodeOccurrences(program, step.state);
  assert.ok(open !== null, "a committed core state must project an open set");
  return { commandId: stimulusCommandId(stimulus), publication, lifecycles: flowNodeOccurrenceLifecycles, open };
}

/** Fails unless both publications of `snapshot` equal the numbered core publications of exactly these commits. */
export function assertPublicationsMatchCore(
  snapshot: PublicationSnapshot,
  commits: ReadonlyArray<CoreCommit>,
  processInstanceId: string,
): void {
  const expected = numberCorePublications(commits, processInstanceId);
  assert.deepEqual({
    headRevision: snapshot.execution.headRevision,
    batches: snapshot.execution.batches,
    current: snapshot.execution.current,
  }, expected.execution);
  let previousStamp = 0;
  for (const { committedAtEpochMs } of snapshot.occurrences.batches) {
    assert.ok(Number.isSafeInteger(committedAtEpochMs) && committedAtEpochMs >= previousStamp);
    previousStamp = committedAtEpochMs;
  }
  for (const { startedAtEpochMs } of snapshot.occurrences.currentOpen) {
    assert.ok(Number.isSafeInteger(startedAtEpochMs) && startedAtEpochMs >= 0);
  }
  assert.deepEqual({
    headRevision: snapshot.occurrences.headRevision,
    batches: snapshot.occurrences.batches.map(({ committedAtEpochMs: _stamp, ...batch }) => batch),
    currentOpen: snapshot.occurrences.currentOpen.map(({ startedAtEpochMs: _stamp, ...open }) => open),
  }, expected.occurrences);
}

function numberCorePublications(commits: ReadonlyArray<CoreCommit>, processInstanceId: string) {
  const open = new Map<string, PublishedStart>();
  const executionBatches = [];
  const occurrenceBatches = [];
  let revision = 0;
  for (const commit of commits) {
    const fromRevision = revision;
    const executionTransitions = [];
    const occurrenceTransitions = [];
    for (const [index, record] of commit.publication.transitions.entries()) {
      revision += 1;
      executionTransitions.push({ revision, ...record });
      const delta = commit.lifecycles[index];
      assert.ok(delta !== undefined);
      const started = delta.started.map((start, startIndex): PublishedStart => {
        const published = {
          id: { processInstanceId, startRevision: revision, startIndex },
          processId: start.processId,
          elementId: start.elementId,
          owner: start.owner,
        };
        open.set(JSON.stringify(start.anchor), published);
        return published;
      });
      const ended = delta.ended.map(({ anchor, terminal }) => {
        const key = JSON.stringify(anchor);
        const match = open.get(key);
        assert.ok(match !== undefined, "the core ended an occurrence it never started");
        open.delete(key);
        return { id: match.id, terminal };
      }).sort((left, right) => left.id.startRevision - right.id.startRevision ||
        left.id.startIndex - right.id.startIndex);
      occurrenceTransitions.push({ revision, lifecycle: { started, ended } });
    }
    executionBatches.push({
      commandId: commit.commandId, fromRevision, throughRevision: revision, transitions: executionTransitions,
    });
    occurrenceBatches.push({
      commandId: commit.commandId, fromRevision, throughRevision: revision, transitions: occurrenceTransitions,
    });
  }
  const last = commits.at(-1);
  assert.ok(last !== undefined, "an empty history publishes nothing to compare");
  const remaining = [...open.values()].sort((left, right) => left.id.startRevision - right.id.startRevision ||
    left.id.startIndex - right.id.startIndex);
  // The fold of started and ended anchors must leave exactly the open set the core projects after the last command.
  assert.deepEqual(
    remaining.map(({ processId, elementId, owner }) => JSON.stringify({ processId, elementId, owner })).sort(),
    last.open.map(({ processId, elementId, owner }) => JSON.stringify({ processId, elementId, owner })).sort(),
  );
  return {
    execution: {
      headRevision: revision,
      batches: executionBatches,
      current: { revision, ...last.publication.current },
    },
    occurrences: { headRevision: revision, batches: occurrenceBatches, currentOpen: remaining },
  };
}

type Draft<Value> = { -readonly [Key in keyof Value]: Draft<Value[Key]> };

/**
 * Host-snapshot defects the comparison must reject, each a realistic consistent-encoder fault applied to every
 * affected record rather than one stray field. `snapshot` must be a mid-journey one: with no open task, scope or
 * produced token left, several of these would change nothing.
 */
export function publicationDefects(
  snapshot: PublicationSnapshot,
): ReadonlyArray<readonly [label: string, defective: PublicationSnapshot]> {
  const defect = (change: (draft: Draft<PublicationSnapshot>) => void): PublicationSnapshot => {
    const draft = structuredClone(snapshot) as Draft<PublicationSnapshot>;
    change(draft);
    return draft;
  };
  const lifecycles = (draft: Draft<PublicationSnapshot>) =>
    draft.occurrences.batches.flatMap(({ transitions }) => transitions.map(({ lifecycle }) => lifecycle));
  return [
    ["every E1 record loses positionDelta.producedTokens", defect((draft) => {
      for (const { transitions } of draft.execution.batches) {
        for (const { positionDelta } of transitions) Reflect.deleteProperty(positionDelta, "producedTokens");
      }
    })],
    ["E1 current drops its root scope", defect((draft) => {
      draft.execution.current.scopes = [];
    })],
    ["E1 current gains a phantom control token", defect((draft) => {
      const [scope] = draft.execution.current.scopes;
      assert.ok(scope !== undefined);
      draft.execution.current.controlTokens.push({ sequenceFlowId: "ToEnd", owner: scope.id, multiplicity: 1 });
    })],
    ["every E2 start names the wrong owner", defect((draft) => {
      for (const { started } of lifecycles(draft)) {
        for (const start of started) start.owner.definitionScopeId = "scope:wrong";
      }
    })],
    ["every E2 end reports Cancelled instead of Completed", defect((draft) => {
      for (const { ended } of lifecycles(draft)) {
        for (const end of ended) end.terminal = FlowNodeOccurrenceTerminalKind.Cancelled;
      }
    })],
    ["E2 currentOpen loses the open task", defect((draft) => {
      draft.occurrences.currentOpen = [];
    })],
  ];
}
