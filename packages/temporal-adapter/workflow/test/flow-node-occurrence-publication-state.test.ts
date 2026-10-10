import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  ControlStateKind,
  ScenarioStepKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticProfileId,
  SemanticTransitionKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  compareCanonicalStrings,
  initialState,
  isWellFormedSemanticProcessProgram,
  projectOpenFlowNodeOccurrences,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  ScenarioStep,
  SemanticProcessProgram,
  StartProcessStimulus,
  Stimulus,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  FlowNodeOccurrencePublicationResultKind,
  requireOpenFlowNodeOccurrencesMatchRuntime,
} from "@bpmn-lean/temporal-protocol";

import {
  accumulateExecutionPublication,
  createExecutionPublicationState,
} from "../dist/execution-publication-state.js";
import {
  accumulateFlowNodeOccurrencePublication,
  createFlowNodeOccurrencePublicationState,
} from "../dist/flow-node-occurrence-publication-state.js";
import {
  queryFlowNodeOccurrences,
} from "../dist/flow-node-occurrence-query-handler.js";
import {
  createCommandPublicationState,
  integrateCommandPublication,
} from "../dist/command-publication-integration.js";
import {
  publicationCompletion,
  publicationProcessInstanceId,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

function startPublications(
  committedAtEpochMs = 1_000,
  fixture: { readonly program: SemanticProcessProgram; readonly start: StartProcessStimulus } = {
    program: publicationProgram,
    start: publicationStart,
  },
) {
  const { program, start } = fixture;
  const step = advanceScenario(
    program,
    initialState,
    start,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const executionBefore = createExecutionPublicationState(
    program,
    start.instanceId,
  );
  const execution = accumulateExecutionPublication(
    program,
    executionBefore,
    start,
    step,
  );
  const occurrences = accumulateFlowNodeOccurrencePublication(
    program,
    createFlowNodeOccurrencePublicationState(
      program,
      start.instanceId,
    ),
    executionBefore,
    execution,
    start,
    step,
    committedAtEpochMs,
  );
  return { step, execution, occurrences };
}

type CommittedStep = Extract<ScenarioStep, { kind: ScenarioStepKind.Committed }>;
type MultiInstanceProfile =
  | typeof SemanticProfileId.SequentialMultiInstanceUserTask
  | typeof SemanticProfileId.ParallelMultiInstanceUserTask;

async function multiInstanceFixture(
  semanticProfile: MultiInstanceProfile,
  items: ReadonlyArray<string> = ["alpha", "beta", "gamma"],
) {
  const sequential = semanticProfile === SemanticProfileId.SequentialMultiInstanceUserTask;
  const relativePath = sequential
    ? "../../../../scenarios/sequential-multi-instance/process.bpmn"
    : "../../../../scenarios/parallel-multi-instance/process.bpmn";
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(relativePath, import.meta.url)),
    sourceId: `occurrence-endpoint-${sequential ? "sequential" : "parallel"}`,
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted);
  const program = compiled.semanticProcess;
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const entry = program.operations.find((operation) =>
    operation.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask ||
    operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask);
  assert.ok(entry !== undefined && (
    entry.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask ||
    entry.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  ));
  const initialVariables: VariableBinding[] = [{
    name: entry.data.input.dataObjectReferenceId,
    value: { kind: VariableValueKind.StringList, value: [...items] },
  }];
  if (entry.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask) {
    initialVariables.push({
      name: entry.completionCondition.variable,
      value: { kind: VariableValueKind.String, value: "all" },
    });
  }
  initialVariables.sort((left, right) => compareCanonicalStrings(left.name, right.name));
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-occurrence-endpoint",
    processId: program.processId,
    instanceId: "OccurrenceEndpoint_1",
    initialVariables,
  };
  return { program, entry, start };
}

function completeMultiInstanceTask(
  fixture: Awaited<ReturnType<typeof multiInstanceFixture>>,
  state: RuntimeState,
): CompleteUserTaskInstanceStimulus {
  const wait = state.userTaskWaits[0];
  assert.ok(wait !== undefined);
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-occurrence-endpoint-${wait.id.activation}`,
    taskId: wait.id,
    submittedValues: [{
      name: fixture.entry.data.output.taskDataOutputId,
      value: { kind: VariableValueKind.String, value: "accepted" },
    }],
  };
}

function omitEntryStarts(
  step: CommittedStep,
  operationKind: SemanticOperationKind,
): CommittedStep {
  assert.ok(step.publication !== null && step.flowNodeOccurrenceLifecycles !== null);
  const index = step.publication.transitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation &&
    transition.operationKind === operationKind);
  assert.ok(index >= 0);
  assert.ok(step.flowNodeOccurrenceLifecycles[index]!.started.length > 0);
  const corrupted = structuredClone(step);
  assert.ok(corrupted.flowNodeOccurrenceLifecycles !== null);
  Object.assign(corrupted.flowNodeOccurrenceLifecycles[index]!, { started: [] });
  return corrupted;
}

function assertOmittedStartRefusedBeforeClock(
  program: SemanticProcessProgram,
  before: ReturnType<typeof createCommandPublicationState>,
  stimulus: Stimulus,
  step: CommittedStep,
  corrupted: CommittedStep,
): void {
  assert.deepEqual(corrupted.state, step.state);
  assert.deepEqual(corrupted.publication, step.publication);
  assert.deepEqual(corrupted.observations, step.observations);
  const exactBefore = structuredClone(before);
  let samples = 0;
  assert.throws(() => integrateCommandPublication(
    program,
    before,
    stimulus,
    corrupted,
    () => {
      samples += 1;
      return 2_000;
    },
  ), TypeError);
  assert.equal(samples, 0);
  assert.deepEqual(before, exactBefore);
}

function assertCommittedOpenEndpoint(
  program: SemanticProcessProgram,
  step: CommittedStep,
  publications: ReturnType<typeof createCommandPublicationState>,
  expectedCount: number,
): void {
  const projected = projectOpenFlowNodeOccurrences(program, step.state);
  assert.ok(projected !== null);
  assert.equal(projected.length, expectedCount);
  assert.equal(publications.flowNodeOccurrences.currentOpen.length, expectedCount);
  assert.equal(publications.flowNodeOccurrences.retainedOpen.length, expectedCount);
  const semanticEntries = publications.flowNodeOccurrences.retainedOpen.map(
    ({ anchor, occurrence }) => ({
      anchor,
      processId: occurrence.processId,
      elementId: occurrence.elementId,
      owner: occurrence.owner,
    }),
  );
  const canonical = (entries: ReadonlyArray<unknown>) => entries.map(
    (entry) => JSON.stringify(entry),
  ).sort(compareCanonicalStrings);
  assert.deepEqual(canonical(semanticEntries), canonical(projected.map(
    ({ anchor, processId, elementId, owner }) => ({ anchor, processId, elementId, owner }),
  )));
}

test("numbers, folds, and E1-aligns one real multi-transition lifecycle batch", () => {
  const { step, execution, occurrences } = startPublications();
  assert.equal(occurrences.headRevision, execution.headRevision);
  assert.deepEqual(
    occurrences.batches[0]?.transitions.map(({ revision }) => revision),
    execution.batches[0]?.transitions.map(({ revision }) => revision),
  );
  assert.equal(
    occurrences.batches[0]?.transitions.length,
    step.flowNodeOccurrenceLifecycles?.length,
  );
  assert.equal(occurrences.batches[0]?.committedAtEpochMs, 1_000);
  assert.deepEqual(
    occurrences.currentOpen.map(({ elementId }) => elementId),
    ["UserTask_A", "UserTask_B"],
  );
  assert.ok(occurrences.currentOpen.every(({ startedAtEpochMs }) =>
    startedAtEpochMs === 1_000));
  const publicBytes = JSON.stringify({
    batches: occurrences.batches,
    currentOpen: occurrences.currentOpen,
  });
  assert.doesNotMatch(
    publicBytes,
    /"anchor"|"transitionIndex"|"localIndex"/u,
  );
  assert.ok(occurrences.retainedOpen.every(({ anchor }) =>
    anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition));
});

test("resolves terminals once and keeps one nondecreasing time per command batch", () => {
  const started = startPublications();
  const completion = publicationCompletion("UserTask_A");
  const step = advanceScenario(
    publicationProgram,
    started.step.state,
    completion,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const execution = accumulateExecutionPublication(
    publicationProgram,
    started.execution,
    completion,
    step,
  );
  const occurrences = accumulateFlowNodeOccurrencePublication(
    publicationProgram,
    started.occurrences,
    started.execution,
    execution,
    completion,
    step,
    1_250,
  );
  assert.deepEqual(
    occurrences.currentOpen.map(({ elementId }) => elementId),
    ["UserTask_B"],
  );
  const ended = occurrences.batches[1]?.transitions.flatMap(
    ({ lifecycle }) => lifecycle.ended,
  ) ?? [];
  assert.ok(ended.some(({ id }) =>
    id.startRevision === started.occurrences.currentOpen[0]?.id.startRevision));
  assert.equal(occurrences.lastCommittedAtEpochMs, 1_250);

  assert.throws(
    () => accumulateFlowNodeOccurrencePublication(
      publicationProgram,
      started.occurrences,
      started.execution,
      execution,
      completion,
      step,
      999,
    ),
    /accumulator continuity drifted/u,
  );
});

test("rejects a forged positive-cursor anchor map and duplicate or unknown lifecycle anchors", () => {
  const started = startPublications();
  const completion = publicationCompletion("UserTask_A");
  const step = advanceScenario(
    publicationProgram,
    started.step.state,
    completion,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const execution = accumulateExecutionPublication(
    publicationProgram,
    started.execution,
    completion,
    step,
  );
  const forged = {
    ...started.occurrences,
    retainedOpen: [],
  };
  assert.throws(
    () => accumulateFlowNodeOccurrencePublication(
      publicationProgram,
      forged,
      started.execution,
      execution,
      completion,
      step,
      1_250,
    ),
    /accumulator continuity drifted/u,
  );
  const swapped = {
    ...started.occurrences,
    retainedOpen: started.occurrences.retainedOpen.map((entry, index, all) => ({
      ...entry,
      anchor: structuredClone(all[all.length - index - 1]!.anchor),
    })),
  };
  assert.throws(
    () => accumulateFlowNodeOccurrencePublication(
      publicationProgram,
      swapped,
      started.execution,
      execution,
      completion,
      step,
      1_250,
    ),
    /accumulator continuity drifted/u,
  );

  const unknown = structuredClone(step);
  assert.ok(unknown.flowNodeOccurrenceLifecycles !== null);
  const deltaWithEnd = unknown.flowNodeOccurrenceLifecycles.find(
    ({ ended }) => ended.length > 0,
  );
  assert.ok(deltaWithEnd?.ended[0] !== undefined);
  deltaWithEnd.ended[0].anchor = {
    kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
    id: {
      processInstanceId: publicationProcessInstanceId,
      elementId: "Unknown_Task",
      activation: 99,
    },
  };
  assert.throws(
    () => accumulateFlowNodeOccurrencePublication(
      publicationProgram,
      started.occurrences,
      started.execution,
      execution,
      completion,
      unknown,
      1_250,
    ),
    /ended an unknown anchor/u,
  );

  const duplicated = structuredClone(step);
  assert.ok(duplicated.flowNodeOccurrenceLifecycles !== null);
  const deltaWithStart = duplicated.flowNodeOccurrenceLifecycles.find(
    ({ started: values }) => values.length > 0,
  );
  if (deltaWithStart !== undefined) {
    deltaWithStart.started.push(structuredClone(deltaWithStart.started[0]!));
    assert.throws(
      () => accumulateFlowNodeOccurrencePublication(
        publicationProgram,
        started.occurrences,
        started.execution,
        execution,
        completion,
        duplicated,
        1_250,
      ),
      /not canonical|reused an open anchor/u,
    );
  }
});

test("queries complete aligned batches, all valid revision-zero cursors, gaps, and immutable copies", () => {
  const emptyExecution = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const emptyOccurrences = createFlowNodeOccurrencePublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  for (const afterRevision of [0, 7]) {
    assert.deepEqual(
      queryFlowNodeOccurrences(
        publicationProgram,
        emptyExecution,
        emptyOccurrences,
        { afterRevision },
      ),
      { kind: FlowNodeOccurrencePublicationResultKind.NotReady },
    );
  }

  const started = startPublications();
  const completion = publicationCompletion("UserTask_A");
  const completionStep = advanceScenario(
    publicationProgram,
    started.step.state,
    completion,
  );
  assert.ok(completionStep.kind === ScenarioStepKind.Committed);
  const completedExecution = accumulateExecutionPublication(
    publicationProgram,
    started.execution,
    completion,
    completionStep,
  );
  const completedOccurrences = accumulateFlowNodeOccurrencePublication(
    publicationProgram,
    started.occurrences,
    started.execution,
    completedExecution,
    completion,
    completionStep,
    1_250,
  );
  const firstBatch = queryFlowNodeOccurrences(
    publicationProgram,
    completedExecution,
    completedOccurrences,
    { afterRevision: 0, limit: 1 },
  );
  assert.ok(firstBatch.kind === FlowNodeOccurrencePublicationResultKind.Available);
  assert.equal(firstBatch.page.batches.length, 1);
  assert.equal(firstBatch.page.currentOpen, null);
  assert.equal(
    firstBatch.page.pageThroughRevision,
    completedOccurrences.batches[0]?.throughRevision,
  );

  const atHead = queryFlowNodeOccurrences(
    publicationProgram,
    started.execution,
    started.occurrences,
    { afterRevision: started.occurrences.headRevision },
  );
  assert.equal(atHead.kind, FlowNodeOccurrencePublicationResultKind.Available);
  assert.ok(atHead.kind === FlowNodeOccurrencePublicationResultKind.Available);
  assert.deepEqual(atHead.page.batches, []);
  assert.deepEqual(atHead.page.currentOpen, started.occurrences.currentOpen);

  for (const afterRevision of [1, started.occurrences.headRevision + 1]) {
    assert.deepEqual(
      queryFlowNodeOccurrences(
        publicationProgram,
        started.execution,
        started.occurrences,
        { afterRevision },
      ),
      { kind: FlowNodeOccurrencePublicationResultKind.Gap },
    );
  }

  const first = queryFlowNodeOccurrences(
    publicationProgram,
    started.execution,
    started.occurrences,
    { afterRevision: 0, limit: 1 },
  );
  assert.ok(first.kind === FlowNodeOccurrencePublicationResultKind.Available);
  const mutable = first as unknown as {
    page: { currentOpen: Array<{ elementId: string }> };
  };
  mutable.page.currentOpen[0]!.elementId = "mutated-query-copy";
  assert.notEqual(
    started.occurrences.currentOpen[0]?.elementId,
    "mutated-query-copy",
  );
});

test("refuses an omitted sequential Multi-Instance entry start before sampling committed time", async () => {
  const fixture = await multiInstanceFixture(SemanticProfileId.SequentialMultiInstanceUserTask);
  const step = advanceScenario(fixture.program, initialState, fixture.start);
  assert.ok(step.kind === ScenarioStepKind.Committed);
  assert.equal(projectOpenFlowNodeOccurrences(fixture.program, step.state)?.length, 1);
  const corrupted = omitEntryStarts(step, SemanticOperationKind.AwaitSequentialMultiInstanceUserTask);
  assertOmittedStartRefusedBeforeClock(
    fixture.program,
    createCommandPublicationState(fixture.program, fixture.start.instanceId),
    fixture.start,
    step,
    corrupted,
  );
});

test("refuses omitted parallel Multi-Instance entry starts before sampling committed time", async () => {
  const fixture = await multiInstanceFixture(SemanticProfileId.ParallelMultiInstanceUserTask);
  const step = advanceScenario(fixture.program, initialState, fixture.start);
  assert.ok(step.kind === ScenarioStepKind.Committed);
  assert.equal(projectOpenFlowNodeOccurrences(fixture.program, step.state)?.length, 3);
  const corrupted = omitEntryStarts(step, SemanticOperationKind.AwaitParallelMultiInstanceUserTask);
  assertOmittedStartRefusedBeforeClock(
    fixture.program,
    createCommandPublicationState(fixture.program, fixture.start.instanceId),
    fixture.start,
    step,
    corrupted,
  );
});

test("refuses an omitted sequential Multi-Instance successor start before sampling committed time", async () => {
  const fixture = await multiInstanceFixture(SemanticProfileId.SequentialMultiInstanceUserTask);
  const started = startPublications(1_000, fixture);
  const completion = completeMultiInstanceTask(fixture, started.step.state);
  const step = advanceScenario(fixture.program, started.step.state, completion);
  assert.ok(step.kind === ScenarioStepKind.Committed);
  assert.equal(projectOpenFlowNodeOccurrences(fixture.program, step.state)?.length, 1);
  assert.ok(step.flowNodeOccurrenceLifecycles !== null);
  assert.equal(step.flowNodeOccurrenceLifecycles[0].started.length, 1);
  const corrupted = structuredClone(step);
  assert.ok(corrupted.flowNodeOccurrenceLifecycles !== null);
  Object.assign(corrupted.flowNodeOccurrenceLifecycles[0], { started: [] });
  assertOmittedStartRefusedBeforeClock(
    fixture.program,
    { execution: started.execution, flowNodeOccurrences: started.occurrences, commandResults: [] },
    completion,
    step,
    corrupted,
  );
});

test("publishes exact committed sequential and parallel Multi-Instance entry endpoints", async () => {
  for (const [profile, expectedCount] of [
    [SemanticProfileId.SequentialMultiInstanceUserTask, 1],
    [SemanticProfileId.ParallelMultiInstanceUserTask, 3],
  ] as const) {
    const fixture = await multiInstanceFixture(profile);
    const step = advanceScenario(fixture.program, initialState, fixture.start);
    assert.ok(step.kind === ScenarioStepKind.Committed);
    const publications = integrateCommandPublication(
      fixture.program,
      createCommandPublicationState(fixture.program, fixture.start.instanceId),
      fixture.start,
      step,
      () => 1_000,
    );
    assertCommittedOpenEndpoint(fixture.program, step, publications, expectedCount);
  }
});

test("compares semantic endpoint identities independently of retained ordering and public numbering", async () => {
  const fixture = await multiInstanceFixture(SemanticProfileId.ParallelMultiInstanceUserTask);
  const { step, occurrences } = startPublications(1_000, fixture);
  const retained = structuredClone(occurrences.retainedOpen).reverse().map((entry, index) => ({
    ...entry,
    occurrence: {
      ...entry.occurrence,
      id: { ...entry.occurrence.id, startIndex: index + 20 },
    },
  }));
  const requireEndpoint = (entries: typeof retained, state = step.state) =>
    requireOpenFlowNodeOccurrencesMatchRuntime(
      fixture.program, state, entries, entries.map(({ occurrence }) => occurrence), 1_000,
    );
  assert.doesNotThrow(() => requireEndpoint(retained));
  for (const occurrencePatch of [
    { processId: "another-process" },
    { elementId: "another-element" },
    { owner: { ...retained[0]!.occurrence.owner, instanceId: "another-owner" } },
  ]) {
    const changed = structuredClone(retained);
    Object.assign(changed[0]!.occurrence, occurrencePatch);
    assert.throws(() => requireEndpoint(changed), TypeError);
  }
  const swapped = structuredClone(retained);
  Object.assign(swapped[0]!, { anchor: swapped[1]!.anchor });
  assert.throws(() => requireEndpoint(swapped), TypeError);
  const invalid = { ...step.state, control: { kind: ControlStateKind.Completed } };
  assert.equal(projectOpenFlowNodeOccurrences(fixture.program, invalid), null);
  assert.throws(() => requireEndpoint(retained, invalid), TypeError);
});

test("publishes sequential Multi-Instance successors and final or zero-item empty endpoints", async () => {
  const fixture = await multiInstanceFixture(SemanticProfileId.SequentialMultiInstanceUserTask);
  const started = startPublications(1_000, fixture);
  let step = started.step;
  let publications: ReturnType<typeof createCommandPublicationState> = {
    execution: started.execution,
    flowNodeOccurrences: started.occurrences,
    commandResults: [],
  };
  for (const remaining of [2, 1, 0]) {
    const completion = completeMultiInstanceTask(fixture, step.state);
    const completed = advanceScenario(fixture.program, step.state, completion);
    assert.ok(completed.kind === ScenarioStepKind.Committed);
    publications = integrateCommandPublication(
      fixture.program, publications, completion, completed, () => 1_250,
    );
    assertCommittedOpenEndpoint(fixture.program, completed, publications, remaining === 0 ? 0 : 1);
    assert.equal(completed.state.control.kind,
      remaining === 0 ? ControlStateKind.Completed : ControlStateKind.Running);
    step = completed;
  }
  const empty = await multiInstanceFixture(SemanticProfileId.SequentialMultiInstanceUserTask, []);
  const emptyStep = advanceScenario(empty.program, initialState, empty.start);
  assert.ok(emptyStep.kind === ScenarioStepKind.Committed);
  const emptyPublications = integrateCommandPublication(
    empty.program,
    createCommandPublicationState(empty.program, empty.start.instanceId),
    empty.start,
    emptyStep,
    () => 1_000,
  );
  assert.equal(emptyStep.state.control.kind, ControlStateKind.Completed);
  assertCommittedOpenEndpoint(empty.program, emptyStep, emptyPublications, 0);
});
