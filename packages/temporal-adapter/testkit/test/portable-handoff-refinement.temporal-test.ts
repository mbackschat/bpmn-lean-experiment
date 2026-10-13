/**
 * Live qualification of the portable-value serial handoff (`PBV-TREE-01`, `PBV-IDENTITY-01`, `PBV-COPY-01`, capacity
 * admission): the order reaches both User Tasks exactly, across refusal, forced Continue-As-New, Worker replacement
 * and content-bound recovery, and every Run replays.
 *
 * The reference is the semantic core stepping the same stimuli in this process. It is the TypeScript core the Worker
 * runs, so this is a refinement check of the host, not an independent lane. Against the core's own steps the test
 * compares: the published state and the open-task Query at every wait; every E1 batch (all transition records,
 * positionDelta included, with revisions numbered from 1) and E1 `current` (state, control tokens, scopes); every E2
 * batch (each transition's started and ended occurrences with owner and terminal) and E2 `currentOpen`, all in full
 * but for host clock stamps; the outcome of every command; and the retained trace of all Runs. The core's publications
 * are numbered by the oracle in core-publication-oracle-test-support.ts, whose own sensitivity is locked by the last
 * subtest. The Archive input, the terminal Process values and the E1 stimuli are also checked against the submitted
 * values directly, so a flaw shared by host and core would still fail. Every journey starts through the production
 * client path (`startBpmnProcess`), so the pre-start capacity envelope is on it; only the host input's event
 * threshold is lowered, which makes each handled command roll the Workflow over.
 */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { TestContext } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioStepKind,
  SemanticProfileId,
  SemanticTransitionKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  canonicalValueUtf8ByteLength,
  deployProcess,
  initialState,
  maximumCanonicalValueBytes,
} from "@bpmn-lean/semantic-core";
import type {
  BusinessValue,
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
  Stimulus,
  VariableValue,
} from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";
import type { WorkflowClient, WorkflowStartOptions } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import { fullAllowanceValue } from "@bpmn-lean/temporal-protocol";
import {
  BpmnCommandIdentityConflict,
  BpmnProcessAdmissionFailureCode,
  BpmnProcessStartResultKind,
  BpmnWorkflowHostInputKind,
  FlowNodeOccurrenceTerminalKind,
  WorkflowChainBudgetKind,
  bpmnSemanticTaskQueue,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  listOpenUserTasks,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  readTestProcessTerminalResult,
  startBpmnProcess,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";

import { portableHandoffProgram, portableHandoffStart } from "../../protocol/test/portable-handoff-capacity-fixture.ts";
import {
  assertCompletion,
  executionPublication,
  occurrences,
  publishedState,
  publishedStateWhere,
  replayWorkflowChain,
} from "./live-process-observation-test-support.ts";
import type {
  ExecutionSnapshot,
  OccurrenceSnapshot,
  ReplayedChain,
  StartedScenario,
} from "./live-process-observation-test-support.ts";
import {
  assertPublicationsMatchCore,
  coreCommit,
  publicationDefects,
} from "./core-publication-oracle-test-support.ts";
import type { CoreCommit, PublicationSnapshot } from "./core-publication-oracle-test-support.ts";
import { loadJson, temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import {
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const operationDeadlineMs = 20_000;
const rolloverPollIntervalMs = 25;
const identity = "bpmn-lean-portable-handoff";
/** Low enough that a Run holding retained work continues after the next handled command; the lever the other refinement witnesses use. */
const forcedRolloverEventLimit = 4;
/** The longest instance ID the envelope admits and the command-ID length it reserves for each future completion. */
const longestAdmittedInstanceIdBytes = 835;
const reservedCommandIdBytes = 256;

const reviewTaskId = "ReviewOrder";
const archiveTaskId = "ArchiveOrder";
const reviewInputId = "ReviewOrder_in";
const archiveInputId = "ArchiveOrder_in";
const reviewOutputId = "ReviewOrder_out";
const archiveOutputId = "ArchiveOrder_out";
const receivedProperty = "receivedOrder";
const reviewedProperty = "reviewedOrder";
const archivedProperty = "archivedOrder";

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;
const integer = (value: number) => ({ kind: VariableValueKind.Integer, value }) as const;
const decimal = (coefficient: string, scale: number) =>
  ({ kind: VariableValueKind.Decimal, coefficient, scale }) as const;
const absent = { kind: VariableValueKind.Null } as const;
const list = (...value: ReadonlyArray<BusinessValue>) => ({ kind: VariableValueKind.List, value }) as const;
const map = (...entries: ReadonlyArray<readonly [string, BusinessValue]>) =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) }) as const;
const lineItem = (quantity: number, sku: string) => map(["quantity", integer(quantity)], ["sku", text(sku)]);
const address = map(["city", text("Berlin")], ["line2", absent]);

/** The capsule's 12-node order: repeated equal items, a present-Null field and an exact scale-two amount. */
const capsuleOrder = map(
  ["address", address],
  ["items", list(lineItem(1, "A"), lineItem(1, "A"))],
  ["total", decimal("12345", 2)],
);
/** The revision: ordered unequal items and a negative amount, which defeat deduplication, sorting and unsigned reads. */
const revisedOrder = map(
  ["address", address],
  ["items", list(lineItem(2, "B"), lineItem(1, "A"))],
  ["total", decimal("-125", 2)],
);

/** One Start, the refusals offered at each wait, and the two completions that move the Process on. */
type Journey = DeepReadonly<{
  start: StartProcessStimulus;
  reviewRefusals: CompleteUserTaskInstanceStimulus[];
  review: CompleteUserTaskInstanceStimulus;
  archiveRefusals: CompleteUserTaskInstanceStimulus[];
  archive: CompleteUserTaskInstanceStimulus;
}>;

type Host = Readonly<{
  environment: TestWorkflowEnvironment;
  program: SemanticProcessProgram;
  bundle: WorkflowBundleWithSourceMap;
  replaceWorker: () => Promise<void>;
}>;

type WaitSnapshot = DeepReadonly<{
  execution: ExecutionSnapshot;
  occurrences: OccurrenceSnapshot;
  openTasks: StateObservation["openUserTasks"];
}>;

type CoreJourney = DeepReadonly<{
  trace: CanonicalObservation[];
  states: StateObservation[];
  outcomes: CommandOutcome[];
  /** The committed commands only, in order; a refusal publishes nothing. */
  commits: CoreCommit[];
}>;

/** The Archive-wait snapshot with the core commits it must equal, kept to prove the comparison rejects defects. */
type MidJourneyEvidence = DeepReadonly<{
  snapshot: PublicationSnapshot;
  commits: CoreCommit[];
  processInstanceId: string;
}>;

test("portable handoff keeps nested business values exact across live hosting boundaries", async (context) => {
  const program = await portableHandoffProgram();
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity,
    downloadDirectory: temporalCacheDirectory,
  }), 40_000, "portable handoff Temporal startup");
  let worker: WorkerLease | undefined;
  let replacements = 0;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const host: Host = {
      environment,
      program,
      bundle,
      replaceWorker: async () => {
        assert.ok(worker !== undefined);
        await stopBpmnTestWorker(worker);
        worker = undefined;
        replacements += 1;
        worker = await startBpmnTestWorker(environment, bundle, `${identity}-replacement-${replacements}`);
      },
    };

    let midJourney: MidJourneyEvidence | undefined;
    await timed(context, "capsule order with refusals", async () => {
      const journey = await scenarioJourney(program, "order-revised", true);
      assert.deepEqual(startValue(journey), capsuleOrder);
      assert.deepEqual(outputValue(journey.review), revisedOrder);
      midJourney = await driveJourney(host, journey);
    });
    await timed(context, "present Null control", async () => {
      const journey = await scenarioJourney(program, "order-null", false);
      assert.deepEqual(outputValue(journey.review), absent);
      await driveJourney(host, journey);
    });
    await timed(context, "maximal order at the longest admitted identifiers", async () => {
      await driveJourney(host, maximalJourney());
    });
    await timed(context, "over-envelope Start creates no Workflow", async () => {
      await assertEnvelopeRefusal(host);
    });
    await timed(context, "publication comparison rejects dropped produced tokens, lost scope, phantom token, wrong owner, wrong terminal and lost open task", async () => {
      assert.ok(midJourney !== undefined, "the capsule-order journey must supply the mid-journey snapshot");
      const { snapshot, commits, processInstanceId } = midJourney;
      assertPublicationsMatchCore(snapshot, commits, processInstanceId);
      for (const [label, defective] of publicationDefects(snapshot)) {
        assert.notDeepEqual(defective, snapshot, `${label} must change the snapshot`);
        assert.throws(() => assertPublicationsMatchCore(defective, commits, processInstanceId),
          assert.AssertionError, label);
      }
    });
  } finally {
    try {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
    } finally {
      await withDeadline(environment.teardown(), operationDeadlineMs, "portable handoff Temporal teardown");
    }
  }
});

async function timed(context: TestContext, label: string, body: () => Promise<void>): Promise<void> {
  const began = performance.now();
  await context.test(label, body);
  context.diagnostic(`${label}: ${Math.round(performance.now() - began)} ms`);
}

/**
 * Drives one Start through both User Tasks.
 *
 * Each wait is entered, refused where the journey offers refusals, observed across the Continue-As-New its commands
 * force, and left only by a completion; the Worker is replaced at each wait before that completion.
 */
async function driveJourney(host: Host, journey: Journey): Promise<MidJourneyEvidence> {
  const { environment, program } = host;
  const stimuli = journeyStimuli(journey);
  const expected = coreJourney(program, stimuli);
  const reviewRefusalCount = journey.reviewRefusals.length;
  assert.deepEqual(expected.outcomes, [
    CommandOutcome.Committed,
    ...journey.reviewRefusals.map(() => CommandOutcome.Rejected),
    CommandOutcome.Committed,
    ...journey.archiveRefusals.map(() => CommandOutcome.Rejected),
    CommandOutcome.Committed,
  ]);
  const atReview = requireState(expected.states, 0);
  const atArchive = requireState(expected.states, reviewRefusalCount + 1);
  const atEnd = requireState(expected.states, stimuli.length - 1);
  for (const [index, state] of expected.states.entries()) {
    // The core account of a refusal is a preserved state; the host is held to it below.
    if (index >= 1 && index <= reviewRefusalCount) assert.deepEqual(state, atReview);
    if (index > reviewRefusalCount + 1 && index < stimuli.length - 1) assert.deepEqual(state, atArchive);
  }
  const received = startValue(journey);
  const reviewed = outputValue(journey.review);
  const archived = outputValue(journey.archive);

  const started = await startThroughClient(host, journey.start);

  // Review wait: the task input is a by-value copy of the Start value.
  const reviewWait = await publishedState(environment, started, program, 1);
  assert.deepEqual(reviewWait, atReview);
  assertWait(reviewWait, reviewTaskId, reviewInputId, [[receivedProperty, received]], received);
  const reviewSnapshot = await waitSnapshot(host, started);
  assertPublicationsMatchCore(reviewSnapshot, expected.commits.slice(0, 1), started.instanceId);
  assert.deepEqual(reviewSnapshot.execution.current.state, atReview);
  assert.deepEqual(reviewSnapshot.openTasks, atReview.openUserTasks);
  assert.deepEqual(openElementIds(reviewSnapshot), [reviewTaskId]);

  // The host evaluates its rollover threshold when a command is handled, so the first refusal continues the Workflow;
  // the whole carried account, not only the final variables, must come out of that Continue-As-New unchanged.
  const [firstRefusal, ...laterRefusals] = journey.reviewRefusals;
  assert.ok(firstRefusal !== undefined, "every journey offers the Review wait a refusal");
  await assertCompletion(environment, started, firstRefusal, CommandOutcome.Rejected);
  await waitForRolloverPast(environment, started, firstRefusal.commandId);
  assert.deepEqual(await waitSnapshot(host, started), reviewSnapshot);
  for (const refusal of laterRefusals) {
    await assertCompletion(environment, started, refusal, CommandOutcome.Rejected);
    assert.deepEqual(await waitSnapshot(host, started), reviewSnapshot);
  }
  await host.replaceWorker();
  assert.deepEqual(await waitSnapshot(host, started), reviewSnapshot);

  await assertCompletion(environment, started, journey.review, CommandOutcome.Committed);

  // Archive wait: the value Review submitted under its DataOutput name arrives under Archive's own input ID.
  const archiveWait = await publishedStateWhere(environment, started, program,
    (state) => state.openUserTasks[0]?.id.elementId === archiveTaskId);
  assert.deepEqual(archiveWait, atArchive);
  assertWait(archiveWait, archiveTaskId, archiveInputId,
    [[receivedProperty, received], [reviewedProperty, reviewed]], reviewed);
  await waitForRolloverPast(environment, started, journey.review.commandId);
  const archiveSnapshot = await waitSnapshot(host, started);
  assertPublicationsMatchCore(archiveSnapshot, expected.commits.slice(0, 2), started.instanceId);
  assert.deepEqual(archiveSnapshot.execution.current.state, atArchive);
  assert.deepEqual(archiveSnapshot.openTasks, atArchive.openUserTasks);
  assert.deepEqual(openElementIds(archiveSnapshot), [archiveTaskId]);
  assert.deepEqual(lifetimes(archiveSnapshot.occurrences, reviewTaskId), {
    startedIn: [journey.start.commandId],
    endedIn: [journey.review.commandId],
    terminals: [FlowNodeOccurrenceTerminalKind.Completed],
  });

  // Content-bound recovery: the recorded outcome returns, nothing is applied twice, and one changed leaf is a conflict.
  await assertCompletion(environment, started, journey.review, CommandOutcome.Committed);
  assert.deepEqual(await waitSnapshot(host, started), archiveSnapshot);
  await assert.rejects(
    submitUserTaskCompletion(environment.client.workflow, started.instanceId, withChangedLeaf(journey.review)),
    BpmnCommandIdentityConflict,
  );
  assert.deepEqual(await waitSnapshot(host, started), archiveSnapshot);

  for (const refusal of journey.archiveRefusals) {
    await assertCompletion(environment, started, refusal, CommandOutcome.Rejected);
    assert.deepEqual(await waitSnapshot(host, started), archiveSnapshot);
  }
  await host.replaceWorker();
  assert.deepEqual(await waitSnapshot(host, started), archiveSnapshot);

  await assertCompletion(environment, started, journey.archive, CommandOutcome.Committed);
  const terminal = await withDeadline(readTestProcessTerminalResult(started.handle), operationDeadlineMs,
    "portable handoff terminal receipt");
  assert.ok(isCompletedProcessReceipt(terminal.receipt));
  assert.deepEqual(terminal.receipt.definition, program.identity);
  assert.equal(terminal.receipt.processId, program.processId);
  assert.equal(terminal.receipt.processInstanceId, started.instanceId);
  assert.deepEqual(terminal.receipt.finalState, atEnd);
  assert.equal(atEnd.status, ProcessStatus.Completed);
  assert.deepEqual(atEnd.openUserTasks, []);
  // All three Properties, canonical by name; the submitted DataOutput names never became Process variables.
  assert.deepEqual(atEnd.variables, [
    { name: archivedProperty, value: archived },
    { name: receivedProperty, value: received },
    { name: reviewedProperty, value: reviewed },
  ]);
  for (const completion of [journey.review, journey.archive]) {
    assert.equal(terminal.recoveryEntries.filter((entry) =>
      entry.commandId === completion.commandId && entry.outcome === CommandOutcome.Committed
    ).length, 1);
  }

  // Closed-chain recovery still answers from the retained ledger, without a new publication.
  const closed = await waitSnapshot(host, started);
  assertPublicationsMatchCore(closed, expected.commits, started.instanceId);
  assert.deepEqual(closed.execution.current.state, atEnd);
  for (const completion of [journey.review, journey.archive]) {
    await assertCompletion(environment, started, completion, CommandOutcome.Committed);
  }
  assert.deepEqual(await waitSnapshot(host, started), closed);

  // Independent of the core: three committed batches, each carrying exactly the stimulus the test submitted.
  const committed = [journey.start, journey.review, journey.archive];
  assert.deepEqual(closed.execution.batches.map(({ commandId }) => commandId), committed.map(({ commandId }) => commandId));
  for (const [index, batch] of closed.execution.batches.entries()) {
    const external = batch.transitions[0]?.transition;
    assert.ok(external?.kind === SemanticTransitionKind.ExternalStimulus);
    assert.deepEqual(external.stimulus, committed[index]);
  }
  assert.deepEqual(closed.occurrences.batches.map(({ commandId }) => commandId), committed.map(({ commandId }) => commandId));
  assert.equal(closed.occurrences.headRevision, closed.execution.headRevision);
  assert.deepEqual(closed.occurrences.currentOpen, []);
  assert.deepEqual(lifetimes(closed.occurrences, reviewTaskId), {
    startedIn: [journey.start.commandId],
    endedIn: [journey.review.commandId],
    terminals: [FlowNodeOccurrenceTerminalKind.Completed],
  });
  assert.deepEqual(lifetimes(closed.occurrences, archiveTaskId), {
    startedIn: [journey.review.commandId],
    endedIn: [journey.archive.commandId],
    terminals: [FlowNodeOccurrenceTerminalKind.Completed],
  });

  const chain = await replayWorkflowChain(environment, host.bundle, started.workflowId);
  assert.equal(chain.rolloverCount, chain.runCount - 1);
  assert.deepEqual(chain.trace, expected.trace);
  // Each commit landed in a later Run than the one before it, so the nested values crossed a real rollover each time.
  const startRun = runOfCommand(chain, journey.start.commandId);
  const reviewRun = runOfCommand(chain, journey.review.commandId);
  const archiveRun = runOfCommand(chain, journey.archive.commandId);
  assert.ok(startRun < reviewRun && reviewRun < archiveRun,
    `commits must span Runs, found ${startRun}, ${reviewRun}, ${archiveRun}`);
  return {
    snapshot: archiveSnapshot,
    commits: expected.commits.slice(0, 2),
    processInstanceId: started.instanceId,
  };
}

/** Starts through the production client path, lowering only the host input's event threshold so each handled command rolls the Workflow over. */
async function startThroughClient(host: Host, start: StartProcessStimulus): Promise<StartedScenario> {
  const client = withForcedRollover(host.environment.client.workflow);
  const result = await withDeadline(
    startBpmnProcess(client, start, host.program, { taskQueue: bpmnSemanticTaskQueue }),
    operationDeadlineMs, "portable handoff client start",
  );
  assert.ok(result.kind === BpmnProcessStartResultKind.Started);
  const handle = getTestProcessHandle(host.environment.client.workflow, result.processInstanceId);
  return { handle, workflowId: handle.workflowId, instanceId: start.instanceId };
}

function withForcedRollover(client: WorkflowClient): WorkflowClient {
  return new Proxy(client, {
    get(target, property) {
      const member: unknown = Reflect.get(target, property, target);
      if (property !== "start") {
        return typeof member === "function" ? member.bind(target) : member;
      }
      return (workflowType: string, options: WorkflowStartOptions) => {
        const [start, program, hostInput]: ReadonlyArray<unknown> = options.args ?? [];
        assert.ok(typeof hostInput === "object" && hostInput !== null &&
          "kind" in hostInput && hostInput.kind === BpmnWorkflowHostInputKind.Initial);
        return target.start(workflowType, {
          ...options,
          args: [start, program, { ...hostInput, eventHistoryEventLimit: forcedRolloverEventLimit }],
        });
      };
    },
  });
}

/**
 * Polls until the latest Run no longer holds the command's observation, i.e. the Workflow has continued past it.
 *
 * The retained trace is per Run, so a Run that still lists the command has not yet rolled over.
 */
async function waitForRolloverPast(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  commandId: string,
): Promise<void> {
  for (let attempt = 0; attempt < operationDeadlineMs / rolloverPollIntervalMs; attempt += 1) {
    const trace = await readBpmnProcessTrace(environment.client.workflow, started.instanceId);
    if (!trace.some((observation) => isCommandObservation(observation, commandId))) {
      return;
    }
    await delay(rolloverPollIntervalMs);
  }
  assert.fail(`Workflow did not continue past command ${commandId.slice(0, 32)}`);
}

async function waitSnapshot(host: Host, started: StartedScenario): Promise<WaitSnapshot> {
  return {
    execution: await executionPublication(host.environment, started, host.program),
    occurrences: await occurrences(host.environment, started, host.program),
    openTasks: await listOpenUserTasks(host.environment.client.workflow, started.instanceId),
  };
}

/** A Start whose envelope is exceeded by one identifier byte is refused before any Workflow exists. */
async function assertEnvelopeRefusal(host: Host): Promise<void> {
  const instanceId = longInstanceId(longestAdmittedInstanceIdBytes + 1);
  const result = await withDeadline(
    startBpmnProcess(host.environment.client.workflow, portableHandoffStart(instanceId, fullAllowanceValue()),
      host.program, { taskQueue: bpmnSemanticTaskQueue }),
    operationDeadlineMs, "portable handoff refused client start",
  );
  assert.ok(result.kind === BpmnProcessStartResultKind.Rejected);
  assert.equal(result.failure.code, BpmnProcessAdmissionFailureCode.StartCapacityEnvelopeExceeded);
  // The refusal names the budget and its bound; the 835-byte maximal journey is the admitted control one byte below.
  const bound = workflowChainProductionLimit(WorkflowChainBudgetKind.QueryResponseBytes);
  assert.ok(result.failure.evidence.includes(`for queryResponseBytes, above its ${bound}-byte bound`));
  assert.ok(result.failure.evidence.endsWith("no Workflow was started."));
  await assert.rejects(
    withDeadline(getTestProcessHandle(host.environment.client.workflow, instanceId).describe(),
      operationDeadlineMs, "refused Start describe"),
    WorkflowNotFoundError,
  );
}

function maximalJourney(): Journey {
  const instanceId = longInstanceId(longestAdmittedInstanceIdBytes);
  const received = allowanceVariant("a");
  const reviewed = allowanceVariant("b");
  const archived = allowanceVariant("c");
  for (const value of [received, reviewed, archived]) {
    assert.equal(canonicalValueUtf8ByteLength(value), maximumCanonicalValueBytes);
  }
  assert.equal(Buffer.byteLength(instanceId), longestAdmittedInstanceIdBytes);
  return {
    start: portableHandoffStart(instanceId, received),
    reviewRefusals: [rootListRefusal("maximal-root-list", instanceId)],
    review: completion(instanceId, "review", reviewTaskId, reviewOutputId, reviewed),
    archiveRefusals: [],
    archive: completion(instanceId, "archive", archiveTaskId, archiveOutputId, archived),
  };
}

/** The full-allowance Map with only its first character changed, so each copy of the three values is distinguishable. */
function allowanceVariant(marker: string): BusinessValue {
  const full = fullAllowanceValue();
  assert.ok(full.kind === VariableValueKind.Map);
  const [first, ...rest] = full.value;
  assert.ok(first !== undefined && first.value.kind === VariableValueKind.String);
  return { kind: VariableValueKind.Map, value: [
    { name: first.name, value: text(`${marker}${first.value.value.slice(1)}`) },
    ...rest,
  ] };
}

function longInstanceId(bytes: number): string {
  return "Handoff_maximal_".padEnd(bytes, "i");
}

/** Reservation-length command ID, so the journey holds exactly what the envelope reserved for each completion. */
function completion(
  instanceId: string,
  label: string,
  elementId: string,
  outputId: string,
  value: BusinessValue,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `${label}-`.padEnd(reservedCommandIdBytes, "x"),
    taskId: { processInstanceId: instanceId, elementId, activation: 1 },
    submittedValues: [{ name: outputId, value }],
  };
}

/** A root List is a well-formed value the profile's port domain refuses: typed rejection, active task preserved. */
function rootListRefusal(commandId: string, instanceId: string): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: { processInstanceId: instanceId, elementId: reviewTaskId, activation: 1 },
    submittedValues: [{ name: reviewOutputId, value: list(integer(1), integer(1)) }],
  };
}

/**
 * Splits a retained scenario's schedule around its two completions, so its own refusals stay at the wait they target.
 * `withRootList` adds the root-List refusal, which the scenario domain cannot carry, at the Review wait.
 */
async function scenarioJourney(
  program: SemanticProcessProgram,
  name: string,
  withRootList: boolean,
): Promise<Journey> {
  const scenario = await loadJson<Scenario>(new URL(
    `../../../../scenarios/portable-business-values-handoff/${name}.scenario.json`, import.meta.url,
  ));
  assert.equal(scenario.profile, SemanticProfileId.PortableBusinessValuesHandoff);
  assert.equal(scenario.bpmn.sha256, program.identity.sourceSha256);
  const [start, ...rest] = scenario.stimuli;
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const completions = rest.map((stimulus) => {
    assert.ok(stimulus.kind === StimulusKind.CompleteUserTaskInstance);
    return stimulus;
  });
  const reviewIndex = completions.findIndex(({ commandId }) => commandId === "complete-review");
  const archiveIndex = completions.findIndex(({ commandId }) => commandId === "complete-archive");
  const review = completions[reviewIndex];
  const archive = completions[archiveIndex];
  assert.ok(review !== undefined && archive !== undefined && reviewIndex < archiveIndex);
  return {
    start,
    reviewRefusals: [
      ...completions.slice(0, reviewIndex),
      ...(withRootList ? [rootListRefusal(`${name}-root-list`, start.instanceId)] : []),
    ],
    review,
    archiveRefusals: completions.slice(reviewIndex + 1, archiveIndex),
    archive,
  };
}

function journeyStimuli(journey: Journey): Stimulus[] {
  return [journey.start, ...journey.reviewRefusals, journey.review, ...journey.archiveRefusals, journey.archive];
}

function startValue(journey: Journey): VariableValue {
  const [binding] = journey.start.initialVariables;
  assert.ok(binding?.name === receivedProperty && journey.start.initialVariables.length === 1);
  return binding.value;
}

function outputValue(stimulus: CompleteUserTaskInstanceStimulus): VariableValue {
  const [binding] = stimulus.submittedValues;
  assert.ok(binding !== undefined && stimulus.submittedValues.length === 1);
  return binding.value;
}

/** The pure core's committed account of the whole schedule: the trace, the state after each stimulus and each outcome. */
function coreJourney(program: SemanticProcessProgram, stimuli: ReadonlyArray<Stimulus>): CoreJourney {
  const [start] = stimuli;
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const deployment = deployProcess(start, program);
  assert.equal(deployment.outcome, CommandOutcome.Committed);
  const trace: CanonicalObservation[] = [deployment.observation];
  const states: StateObservation[] = [];
  const outcomes: CommandOutcome[] = [];
  const commits: CoreCommit[] = [];
  let state = initialState;
  for (const stimulus of stimuli) {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind !== ScenarioStepKind.HarnessFailure);
    trace.push(...step.observations);
    state = step.state;
    const command = step.observations.find((observation) => observation.kind === CanonicalObservationKind.Command);
    const observed = step.observations.find((observation) => observation.kind === CanonicalObservationKind.State);
    assert.ok(command?.kind === CanonicalObservationKind.Command);
    assert.ok(observed?.kind === CanonicalObservationKind.State);
    outcomes.push(command.outcome);
    states.push(observed);
    if (step.kind === ScenarioStepKind.Committed) commits.push(coreCommit(program, stimulus, step));
  }
  return { trace, states, outcomes, commits };
}

function assertWait(
  state: StateObservation,
  taskElementId: string,
  inputId: string,
  variables: ReadonlyArray<readonly [string, VariableValue]>,
  input: VariableValue,
): void {
  assert.equal(state.status, ProcessStatus.Running);
  assert.deepEqual(state.variables, variables.map(([name, value]) => ({ name, value })));
  assert.equal(state.openUserTasks.length, 1);
  const task = state.openUserTasks[0];
  assert.ok(task !== undefined);
  assert.equal(task.id.elementId, taskElementId);
  assert.deepEqual(task.inputs, [{ name: inputId, value: input }]);
}

function openElementIds(snapshot: WaitSnapshot): string[] {
  return snapshot.occurrences.currentOpen.map(({ elementId }) => elementId);
}

/** The commands whose batches started and ended the occurrences of one element, and how each ended. */
function lifetimes(snapshot: OccurrenceSnapshot, elementId: string) {
  const started = snapshot.batches.flatMap(({ commandId, transitions }) =>
    transitions.flatMap(({ lifecycle }) =>
      lifecycle.started.filter((entry) => entry.elementId === elementId).map(({ id }) => ({ commandId, id }))));
  const ended = snapshot.batches.flatMap(({ commandId, transitions }) =>
    transitions.flatMap(({ lifecycle }) => lifecycle.ended
      .filter(({ id }) => started.some((entry) => entry.id.processInstanceId === id.processInstanceId &&
        entry.id.startRevision === id.startRevision && entry.id.startIndex === id.startIndex))
      .map(({ terminal }) => ({ commandId, terminal }))));
  return {
    startedIn: started.map(({ commandId }) => commandId),
    endedIn: ended.map(({ commandId }) => commandId),
    terminals: ended.map(({ terminal }) => terminal),
  };
}

function runOfCommand(chain: ReplayedChain, commandId: string): number {
  const indexes = chain.runTraces.flatMap((trace, index) =>
    trace.some((observation) => isCommandObservation(observation, commandId)) ? [index] : []);
  assert.equal(indexes.length, 1, `command ${commandId.slice(0, 32)} must be retained by exactly one Run`);
  return indexes[0] as number;
}

function isCommandObservation(observation: CanonicalObservation, commandId: string): boolean {
  return observation.kind === CanonicalObservationKind.Command && observation.commandId === commandId;
}

function requireState(states: ReadonlyArray<StateObservation>, index: number): StateObservation {
  const state = states[index];
  assert.ok(state !== undefined, `no core state after stimulus ${index}`);
  return state;
}

/**
 * The same completion command ID with its value minimally changed: the first String leaf for another of equal length,
 * or the whole value when it has none, which keeps the changed completion as admissible as the original.
 */
function withChangedLeaf(source: CompleteUserTaskInstanceStimulus): CompleteUserTaskInstanceStimulus {
  const [binding] = source.submittedValues;
  assert.ok(binding !== undefined);
  const changed = changeFirstStringLeaf(binding.value as BusinessValue) ?? text("changed");
  return { ...source, submittedValues: [{ name: binding.name, value: changed }] };
}

function changeFirstStringLeaf(value: BusinessValue): BusinessValue | undefined {
  switch (value.kind) {
    case VariableValueKind.String:
      return value.value.length === 0 ? undefined : text(`${value.value.startsWith("Z") ? "Y" : "Z"}${value.value.slice(1)}`);
    case VariableValueKind.List:
      for (const [index, member] of value.value.entries()) {
        const changed = changeFirstStringLeaf(member);
        if (changed !== undefined) {
          return { kind: VariableValueKind.List, value: value.value.map((old, at) => at === index ? changed : old) };
        }
      }
      return undefined;
    case VariableValueKind.Map:
      for (const [index, entry] of value.value.entries()) {
        const changed = changeFirstStringLeaf(entry.value);
        if (changed !== undefined) {
          return { kind: VariableValueKind.Map, value: value.value.map((old, at) =>
            at === index ? { name: old.name, value: changed } : old) };
        }
      }
      return undefined;
    case VariableValueKind.Null:
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
    case VariableValueKind.Decimal:
      return undefined;
  }
}
