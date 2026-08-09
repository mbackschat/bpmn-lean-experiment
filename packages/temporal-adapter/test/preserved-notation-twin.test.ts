/**
 * The targeted preservation gate's four obligations, asserted on the preserved/twin pair.
 *
 * [The 2026-07-30 targeted preservation decision](../../../docs/PLAN.md#approved-decisions) requires
 * every capsule that widens admission to establish that each newly reachable internal closure stays
 * within `semanticProcessClosureLimit`, that every newly reachable multiple-enabled state is handled,
 * that every newly reachable stable `running` state is terminally complete or exposes a resumption
 * surface, and that host capability is decided before Workflow start.
 *
 * Preserve-only admission makes a new *source* reachable, not a new program, so the honest form of
 * those obligations is that the preserved source inherits the twin's values unchanged. That is
 * asserted here rather than deduced from the programs being equal: the equality is what makes the
 * inheritance true, and stating it separately is what makes a future divergence visible instead of
 * silently reinterpreting a passing equality check as evidence about four different properties.
 *
 * This suite lives in the adapter package because it is the only one that may reach the compiler,
 * the semantic core, and the host capability predicate at once; the dependency direction forbids the
 * reverse.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId,
  StimulusKind,
  applyStimulus,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  semanticProcessClosureLimit,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";

import {
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-adapter";

const preservedNotationSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const executedOnlyTwin = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);

const instanceId = "TwinInstance_1";
const start: Stimulus = {
  kind: StimulusKind.StartProcess,
  commandId: "start-twin",
  processId: "Process_SequentialUserTask",
  instanceId,
  initialVariables: [],
};

async function program(
  source: URL,
  sourceId: string,
  semanticProfile: string,
): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(source),
    sourceId,
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(
      `${sourceId} was rejected: ${JSON.stringify(compilation.diagnostics)}`,
    );
  }
  return compilation.semanticProcess;
}

async function twinPrograms(): Promise<
  Readonly<{ preserved: SemanticProcessProgram; twin: SemanticProcessProgram }>
> {
  const [preserved, twin] = await Promise.all([
    program(
      preservedNotationSource,
      "user-task-preserved-notation-process",
      SemanticProfileId.UserTaskPreservedNotation,
    ),
    program(
      executedOnlyTwin,
      "sequential-user-task-process",
      SemanticProfileId.UserTask,
    ),
  ]);
  return { preserved, twin };
}

test("keeps the preserved source inside the twin's exact closure bound", async () => {
  const { preserved, twin } = await twinPrograms();

  for (const [label, candidate] of [
    ["preserved", preserved],
    ["twin", twin],
  ] as const) {
    assert.equal(
      applyStimulus(candidate, initialState, start, semanticProcessClosureLimit)
        .internalStepBoundExceeded,
      false,
      `${label} exceeded the declared closure limit`,
    );
    // The exact minimum, not merely "within the limit": a preserved construct that added one hidden
    // internal step would still pass a bound of eight while changing what the engine does.
    assert.equal(
      applyStimulus(candidate, initialState, start, 2).internalStepBoundExceeded,
      false,
      `${label} needs more than two internal steps to reach its first wait`,
    );
    assert.equal(
      applyStimulus(candidate, initialState, start, 1).internalStepBoundExceeded,
      true,
      `${label} reaches its first wait in fewer steps than the twin`,
    );
  }
});

test("gives the preserved source the twin's enabledness and resumption surface", async () => {
  const { preserved, twin } = await twinPrograms();

  const settled = (candidate: SemanticProcessProgram) => {
    const outcome = applyStimulus(
      candidate,
      initialState,
      start,
      semanticProcessClosureLimit,
    );
    return outcome.state;
  };
  const preservedState = settled(preserved);
  const twinState = settled(twin);

  assert.equal(
    enabledInternalOperationCount(preserved, preservedState),
    0,
    "a settled state must enable no further internal operation",
  );
  assert.equal(
    enabledInternalOperationCount(preserved, preservedState),
    enabledInternalOperationCount(twin, twinState),
  );
  assert.equal(isStableStateResumable(preservedState), true);
  assert.equal(
    isStableStateResumable(preservedState),
    isStableStateResumable(twinState),
  );
});

test("gives the preserved source the twin's host capability verdict", async () => {
  const { preserved, twin } = await twinPrograms();

  const preservedCapability = assessTemporalHostCapability(preserved);
  assert.deepEqual(preservedCapability, assessTemporalHostCapability(twin));
  assert.equal(
    preservedCapability.kind,
    TemporalHostCapabilityResultKind.Admitted,
    `the preserved source must be host-admissible: ${JSON.stringify(preservedCapability)}`,
  );
});
