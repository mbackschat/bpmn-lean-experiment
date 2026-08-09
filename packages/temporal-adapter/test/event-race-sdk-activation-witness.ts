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

import {
  commands,
  completedWorkflowResult,
  installedWorkerRequire,
  requireStartedTimer,
  runDirectVmActivation,
  workflowFailureType,
} from "./direct-vm-activation-harness.ts";
import type {
  Activation,
  Completion,
} from "./direct-vm-activation-harness.ts";

import {
  bpmnEventRaceOrderingUnavailableFailureType,
  bpmnProcessWorkflowType,
  bpmnDeliverMessageSignalName,
  loadBpmnWorkflowBundle,
} from "@bpmn-lean/temporal-adapter";

const eventRaceTaskQueue = "event-race-sdk-activation";
const fixtureUrl = new URL(
  "../../../scenarios/event-based-gateway-message-timer/process.bpmn",
  import.meta.url,
);
const probeWorkflowUrl = new URL(
  "./event-race-sdk-activation-workflows.ts",
  import.meta.url,
);

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
  return runDirectVmActivation({
    bundle: await loadProbeBundle(),
    workflowType: "boundedCompletionUpdateSdkActivationProbe",
    replaying: true,
    taskQueue: eventRaceTaskQueue,
    args: [],
    readyJobs: [completionUpdateJob(), timerJob()],
    assertInitialization: (completion) => requireStartedTimer(completion, 1),
  });
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
  return runDirectVmActivation({
    bundle,
    workflowType: bpmnProcessWorkflowType,
    replaying,
    taskQueue: eventRaceTaskQueue,
    args: [
      defaultPayloadConverter.toPayload(fixture.start),
      defaultPayloadConverter.toPayload(fixture.program),
    ],
    readyJobs: jobs,
    assertInitialization: (completion) => requireStartedTimer(completion, 1),
  });
}

async function activateProbeWithSdkFlag(
  bundle: ReturnType<typeof parseWorkflowCode>,
  workflowType: string,
  replaying: boolean,
): Promise<Completion> {
  return runDirectVmActivation({
    bundle,
    workflowType,
    replaying,
    taskQueue: eventRaceTaskQueue,
    args: [],
    readyJobs: [
      { signalWorkflow: { signalName: "eventRaceSdkReadiness", input: [] } },
      timerJob(),
    ],
    assertInitialization: (completion) => requireStartedTimer(completion, 1),
  });
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
    sourceOverlay: null,
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

function installedPackageVersion(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const version = Object.fromEntries(Object.entries(value))["version"];
  return typeof version === "string" ? version : undefined;
}
