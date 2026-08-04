/** Direct-VM oracle for the adapter's installed-SDK activation-batching trust boundary. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  DeliverMessageStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  DefaultLogger,
  bundleWorkflowCode,
} from "@temporalio/worker";
import type {
  WorkflowBundleWithSourceMap,
} from "@temporalio/worker";
import type { Workflow } from "@temporalio/worker/lib/workflow/interface.js";
import { VMWorkflowCreator } from "@temporalio/worker/lib/workflow/vm.js";
import { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import {
  defaultPayloadConverter,
} from "@temporalio/workflow";
import type {
  WorkflowInfo,
} from "@temporalio/workflow";

import {
  bpmnEventRaceOrderingUnavailableFailureType,
  bpmnProcessWorkflowType,
  bpmnDeliverMessageSignalName,
  loadBpmnWorkflowBundle,
} from "@bpmn-lean/temporal-adapter";

const fixtureUrl = new URL(
  "../../../scenarios/event-based-gateway-message-timer/process.bpmn",
  import.meta.url,
);
const probeWorkflowUrl = new URL(
  "./event-race-sdk-activation-workflows.ts",
  import.meta.url,
);
const installedWorkerRequire = createRequire(
  createRequire(import.meta.url).resolve("@temporalio/worker"),
);

type Activation = Parameters<Workflow["activate"]>[0];
type Completion = Awaited<ReturnType<Workflow["activate"]>>;
type Timestamp = NonNullable<Activation["timestamp"]>;

export type EventRaceSdkActivationWitness = Readonly<{
  disabledPremiseCompletion: Completion;
  fixedPriorityCoreBypassCompletion: Completion;
  ordinaryDualReadyCompletion: Completion;
  separateReadyCompletion: Completion;
}>;

export async function runEventRaceSdkActivationWitness(): Promise<EventRaceSdkActivationWitness> {
  const program = await compileEventRaceProgram();
  const fixture = eventRaceFixture(program, "sdk-activation-premise");
  const productionBundle = parseWorkflowCode(
    (await loadBpmnWorkflowBundle()).code,
  );
  const ordinaryDualReadyCompletion = await activateProductionRace(
    productionBundle,
    fixture,
    false,
    [messageJob(fixture.delivery), timerJob()],
  );
  const separateReadyCompletion = await activateProductionRace(
    productionBundle,
    fixture,
    false,
    [messageJob(fixture.delivery)],
  );
  const probeBundle = await loadProbeBundle();
  const disabledPremiseCompletion = await activateProbeWithSdkFlag(
    probeBundle,
    "eventRaceSdkActivationProbe",
    true,
  );
  const fixedPriorityCoreBypassCompletion = await activateProbeWithSdkFlag(
    probeBundle,
    "eventRaceFixedMessagePriorityCoreBypassMutation",
    false,
  );
  return {
    disabledPremiseCompletion,
    fixedPriorityCoreBypassCompletion,
    ordinaryDualReadyCompletion,
    separateReadyCompletion,
  };
}

/**
 * Drives one activation carrying a completion Update and a due Timer, with the single-batch SdkFlag
 * unavailable.
 *
 * Replay is how the flag is withheld: `hasFlag` answers false for a Workflow whose original
 * execution recorded no flag, which is the same construction the Event-race disabled-premise
 * completion uses. The Event-race probe splits under exactly this condition, so the pair separates
 * a conditional licence from the unconditional one an Update enjoys.
 */
export async function runBoundedCompletionUpdateWitness(): Promise<Completion> {
  return withWorkflow(
    await loadProbeBundle(),
    "boundedCompletionUpdateSdkActivationProbe",
    true,
    [],
    [completionUpdateJob(), timerJob()],
  );
}

/** Requires the Update and the Timer to have shared one activation. */
export function requireUpdateCoalescedWithTimer(completion: Completion): void {
  assert.equal(
    workflowFailureType(completion),
    "BpmnBoundedCompletionUpdateCoalescedWithTimer",
  );
  // The licence must not come from the flag. The Workflow does report its used internal flags, and
  // the single-batch flag is absent from them, so the coalescing came from `hasSignals` being false
  // rather than from `ProcessWorkflowActivationJobsAsSingleBatch` being available.
  assert.equal(completion.successful?.usedInternalFlags?.includes(2), false);
}

export function assertPinnedSingleBatchSource(source: string): void {
  // Pins the predicate's definition, not only its use below. `!hasSignals` is what sends an
  // Update-only activation down the single-batch path irrespective of the SdkFlag, and that
  // licence survives only while the predicate reads `signalWorkflow` alone. A definition widened
  // to count `doUpdate` would split the batch while every use-site assertion kept matching.
  assert.match(
    source,
    /const hasSignals = activation\.jobs\.some\(\(\{ signalWorkflow \}\) => signalWorkflow != null\);/u,
  );
  assert.match(
    source,
    /const doSingleBatch = !hasSignals \|\| this\.activator\.hasFlag\([^)]*SdkFlags\.ProcessWorkflowActivationJobsAsSingleBatch\);/u,
  );
  assert.match(
    source,
    /if \(doSingleBatch\) \{[\s\S]*?this\.workflowModule\.activate\([\s\S]*?jobs: rest[\s\S]*?this\.tryUnblockConditionsAndMicrotasks\(\);[\s\S]*?\}\s*else \{/u,
  );
  assert.match(
    source,
    /for \(const jobs of \[signals, nonSignals\]\) \{[\s\S]*?this\.workflowModule\.activate\([\s\S]*?jobs[\s\S]*?this\.tryUnblockConditionsAndMicrotasks\(\);/u,
  );
}

export async function readInstalledPinnedSdkActivationSource(): Promise<string> {
  const packageJson: unknown = JSON.parse(await readFile(
    installedWorkerRequire.resolve("@temporalio/worker/package.json"),
    "utf8",
  ));
  assert.equal(installedPackageVersion(packageJson), "1.21.0");
  return readFile(
    installedWorkerRequire.resolve(
      "@temporalio/worker/lib/workflow/vm-shared.js",
    ),
    "utf8",
  );
}

export function requireOrderingUnavailable(completion: Completion): void {
  assert.equal(
    workflowFailureType(completion),
    bpmnEventRaceOrderingUnavailableFailureType,
  );
  assert.equal(completion.successful?.usedInternalFlags?.includes(2), true);
  assert.equal(
    commands(completion).some(({ cancelTimer }) => cancelTimer !== undefined),
    false,
  );
}

export function requireMessageCoreAdvancement(completion: Completion): void {
  assert.equal(workflowFailureType(completion), undefined);
  assert.equal(completion.successful?.usedInternalFlags?.includes(2), true);
  assert.equal(
    commands(completion).some(({ cancelTimer }) => cancelTimer?.seq === 1),
    true,
  );
}

export function requireSplitBatchPriorityExposure(completion: Completion): void {
  assert.notEqual(completion.successful, undefined);
  assert.equal(workflowFailureType(completion), undefined);
  assert.equal(completedWorkflowResult(completion), "message");
  assert.equal(completion.successful?.usedInternalFlags?.includes(2), false);
}

export function requireFixedMessagePriorityCoreBypass(completion: Completion): void {
  assert.notEqual(completion.successful, undefined);
  assert.equal(workflowFailureType(completion), undefined);
  assert.equal(completedWorkflowResult(completion), "message");
  assert.equal(completion.successful?.usedInternalFlags?.includes(2), true);
}

async function activateProductionRace(
  bundle: ReturnType<typeof parseWorkflowCode>,
  fixture: Readonly<{
    delivery: DeliverMessageStimulus;
    start: StartProcessStimulus;
    program: SemanticProcessProgram;
  }>,
  replaying: boolean,
  jobs: NonNullable<Activation["jobs"]>,
): Promise<Completion> {
  return withWorkflow(
    bundle,
    bpmnProcessWorkflowType,
    replaying,
    [
      defaultPayloadConverter.toPayload(fixture.start),
      defaultPayloadConverter.toPayload(fixture.program),
    ],
    jobs,
  );
}

async function activateProbeWithSdkFlag(
  bundle: ReturnType<typeof parseWorkflowCode>,
  workflowType: string,
  replaying: boolean,
): Promise<Completion> {
  return withWorkflow(
    bundle,
    workflowType,
    replaying,
    [],
    [
      { signalWorkflow: { signalName: "eventRaceSdkReadiness", input: [] } },
      timerJob(),
    ],
  );
}

async function withWorkflow(
  bundle: ReturnType<typeof parseWorkflowCode>,
  workflowType: string,
  replaying: boolean,
  args: ReadonlyArray<ReturnType<typeof defaultPayloadConverter.toPayload>>,
  readyJobs: NonNullable<Activation["jobs"]>,
): Promise<Completion> {
  const creator = await VMWorkflowCreator.create(bundle, 1_000, new Set([
    "executeBpmnEffect",
  ]));
  const workflow = await creator.createWorkflow({
    info: await workflowInfo(workflowType, replaying),
    randomnessSeed: Array.from({ length: 32 }, () => 7),
    now: 0,
    showStackTraceSources: false,
  });
  try {
    const initialization = await workflow.activate({
      runId: workflowInfoRunId(workflowType, replaying),
      timestamp: await timestamp(0),
      historyLength: 3,
      isReplaying: replaying,
      jobs: [{
        initializeWorkflow: {
          workflowId: workflowInfoWorkflowId(workflowType, replaying),
          workflowType,
          arguments: [...args],
        },
      }],
    });
    assert.equal(
      commands(initialization).some(({ startTimer }) => startTimer?.seq === 1),
      true,
    );
    return workflow.activate({
      runId: workflowInfoRunId(workflowType, replaying),
      timestamp: await timestamp(1_000),
      historyLength: 7,
      isReplaying: replaying,
      jobs: readyJobs,
    });
  } finally {
    await workflow.dispose();
    await creator.destroy();
  }
}

async function loadProbeBundle(): Promise<ReturnType<typeof parseWorkflowCode>> {
  const bundle: WorkflowBundleWithSourceMap = await bundleWorkflowCode({
    workflowsPath: fileURLToPath(probeWorkflowUrl),
    logger: new DefaultLogger("ERROR"),
  });
  return parseWorkflowCode(bundle.code);
}

async function compileEventRaceProgram(): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId: "event-race-sdk-activation",
    expectedSha256: undefined,
    semanticProfile: "bpmn-2.0.2-event-based-gateway-message-timer-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Event race SDK activation fixture was rejected");
  }
  return compilation.semanticProcess;
}

function eventRaceFixture(
  program: SemanticProcessProgram,
  suffix: string,
) {
  const race = program.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitEventRace,
  );
  assert.ok(race?.kind === SemanticOperationKind.AwaitEventRace);
  const instanceId = `EventRace_${suffix}`;
  const delivery: DeliverMessageStimulus = {
    kind: StimulusKind.DeliverMessage,
    commandId: `deliver-${suffix}`,
    subscriptionId: {
      processInstanceId: instanceId,
      elementId: race.message.elementId,
      activation: 1,
    },
    channel: race.message.channel,
  };
  return {
    delivery,
    program,
    start: {
      kind: StimulusKind.StartProcess,
      commandId: `start-${suffix}`,
      processId: program.processId,
      instanceId,
      initialVariables: [],
    },
  } as const;
}

function messageJob(delivery: DeliverMessageStimulus): NonNullable<Activation["jobs"]>[number] {
  return {
    signalWorkflow: {
      signalName: bpmnDeliverMessageSignalName,
      input: [defaultPayloadConverter.toPayload(delivery)],
    },
  };
}

/**
 * A `doUpdate` job for the probe's completion Update.
 *
 * `id`, `protocolInstanceId`, and `name` are the three fields the installed activator requires; a
 * missing one is a `TypeError` rather than a batching observation, so they are set explicitly.
 */
function completionUpdateJob(): NonNullable<Activation["jobs"]>[number] {
  return {
    doUpdate: {
      id: "bounded-completion-premise",
      protocolInstanceId: "bounded-completion-premise",
      name: "boundedCompletionSdkReadiness",
      input: [],
      runValidator: false,
    },
  };
}

function timerJob(): NonNullable<Activation["jobs"]>[number] {
  return { fireTimer: { seq: 1 } };
}

function commands(completion: Completion) {
  return completion.successful?.commands ?? [];
}

function workflowFailureType(completion: Completion): string | undefined {
  return commands(completion).find(
    ({ failWorkflowExecution }) => failWorkflowExecution !== undefined,
  )?.failWorkflowExecution?.failure?.applicationFailureInfo?.type ?? undefined;
}

function completedWorkflowResult(completion: Completion): unknown {
  const payload = commands(completion).find(
    ({ completeWorkflowExecution }) => completeWorkflowExecution !== undefined,
  )?.completeWorkflowExecution?.result;
  if (payload === null || payload === undefined) {
    throw new TypeError("SDK activation probe completed without a result payload");
  }
  return defaultPayloadConverter.fromPayload(payload);
}

async function workflowInfo(
  workflowType: string,
  replaying: boolean,
): Promise<WorkflowInfo> {
  return {
    workflowType,
    runId: workflowInfoRunId(workflowType, replaying),
    workflowId: workflowInfoWorkflowId(workflowType, replaying),
    namespace: "default",
    firstExecutionRunId: workflowInfoRunId(workflowType, replaying),
    attempt: 1,
    taskTimeoutMs: 1_000,
    taskQueue: "event-race-sdk-activation",
    searchAttributes: {},
    typedSearchAttributes: await typedSearchAttributes(),
    historyLength: 3,
    historySize: 0,
    continueAsNewSuggested: false,
    targetWorkerDeploymentVersionChanged: false,
    startTime: new Date(0),
    runStartTime: new Date(0),
    unsafe: {
      isReplaying: replaying,
      isReplayingHistoryEvents: replaying,
      now: () => 0,
      random: {
        random: () => 0.5,
        uuid4: () => "00000000-0000-4000-8000-000000000000",
        fillRandom: (bytes) => bytes.fill(7),
      },
    },
  };
}

function workflowInfoRunId(workflowType: string, replaying: boolean): string {
  return `${workflowType}-${replaying ? "legacy" : "current"}-run`;
}

function workflowInfoWorkflowId(workflowType: string, replaying: boolean): string {
  return `${workflowType}-${replaying ? "legacy" : "current"}`;
}

async function timestamp(milliseconds: number): Promise<Timestamp> {
  const module = await importInstalledWorkerDependency(
    "@temporalio/common/lib/time.js",
  );
  const candidate = module["msNumberToTs"];
  if (typeof candidate !== "function") {
    throw new TypeError("Pinned Temporal common package does not export msNumberToTs");
  }
  const value: unknown = Reflect.apply(candidate, undefined, [milliseconds]);
  if (!isTimestamp(value)) {
    throw new TypeError("Pinned Temporal common package returned an invalid timestamp");
  }
  return value;
}

async function typedSearchAttributes(): Promise<WorkflowInfo["typedSearchAttributes"]> {
  const module = await importInstalledWorkerDependency("@temporalio/common");
  const Constructor = module["TypedSearchAttributes"];
  if (typeof Constructor !== "function") {
    throw new TypeError("Pinned Temporal common package does not export TypedSearchAttributes");
  }
  const value: unknown = Reflect.construct(Constructor, []);
  if (!isTypedSearchAttributes(value)) {
    throw new TypeError("Pinned Temporal common package returned invalid typed search attributes");
  }
  return value;
}

async function importInstalledWorkerDependency(
  specifier: string,
): Promise<Readonly<Record<string, unknown>>> {
  const module: unknown = await import(
    pathToFileURL(installedWorkerRequire.resolve(specifier)).href
  );
  if (module === null || typeof module !== "object" || Array.isArray(module)) {
    throw new TypeError(`Pinned Temporal dependency ${specifier} is not a module object`);
  }
  return Object.fromEntries(Object.entries(module));
}

function isTimestamp(value: unknown): value is Timestamp {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const nanos = Reflect.get(value, "nanos");
  const seconds = Reflect.get(value, "seconds");
  return typeof nanos === "number" &&
    seconds !== null &&
    typeof seconds === "object" &&
    !Array.isArray(seconds) &&
    typeof Reflect.get(seconds, "mul") === "function";
}

function isTypedSearchAttributes(
  value: unknown,
): value is WorkflowInfo["typedSearchAttributes"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return typeof Reflect.get(value, "get") === "function" &&
    typeof Reflect.get(value, "copy") === "function" &&
    typeof Reflect.get(value, "getAll") === "function";
}

function installedPackageVersion(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const version = Object.fromEntries(Object.entries(value))["version"];
  return typeof version === "string" ? version : undefined;
}
