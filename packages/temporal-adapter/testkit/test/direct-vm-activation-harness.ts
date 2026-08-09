/**
 * Runs one Workflow activation directly against the installed pinned SDK's VM, with no server.
 *
 * This exists so a test can compose an activation's exact job set — which the ordinary runner cannot,
 * because the server decides what a Workflow activation contains. That control is what makes a
 * shared-activation race observable at all.
 *
 * Everything here is a property of the pinned `@temporalio/worker` 1.21.0 layout: the VM creator,
 * the `WorkflowInfo` shape, and the timestamp encoding are reached through the installed tree rather
 * than reconstructed, so an SDK change surfaces as a load failure instead of a silently wrong
 * activation envelope.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import type { Workflow } from "@temporalio/worker/lib/workflow/interface.js";
import { VMWorkflowCreator } from "@temporalio/worker/lib/workflow/vm.js";
import type { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import { defaultPayloadConverter } from "@temporalio/workflow";
import type { WorkflowInfo } from "@temporalio/workflow";

export const installedWorkerRequire = createRequire(
  createRequire(import.meta.url).resolve("@temporalio/worker"),
);

export type Activation = Parameters<Workflow["activate"]>[0];
export type Completion = Awaited<ReturnType<Workflow["activate"]>>;
export type Timestamp = NonNullable<Activation["timestamp"]>;
export type ParsedWorkflowCode = ReturnType<typeof parseWorkflowCode>;

export type DirectVmActivationRun = Readonly<{
  bundle: ParsedWorkflowCode;
  workflowType: string;
  /**
   * Withholds SDK flags. `hasFlag` answers false for a Workflow whose original execution recorded
   * none, so replaying is how a test observes behavior that must not depend on a flag.
   */
  replaying: boolean;
  taskQueue: string;
  args: ReadonlyArray<ReturnType<typeof defaultPayloadConverter.toPayload>>;
  readyJobs: NonNullable<Activation["jobs"]>;
  /**
   * Checks the initialization activation before the jobs under test are delivered, so a Workflow
   * that never reached its wait state fails as a setup error rather than as a race observation.
   */
  assertInitialization: (completion: Completion) => void;
}>;

/**
 * Initializes the Workflow, then delivers each batch as its own activation.
 *
 * Returns one completion per batch, because a route is often only observable once a later step
 * either accepts or refuses work that only one route can offer.
 */
export async function runDirectVmActivations(
  run: DirectVmActivationRun,
  laterBatches: ReadonlyArray<NonNullable<Activation["jobs"]>> = [],
): Promise<ReadonlyArray<Completion>> {
  const creator = await VMWorkflowCreator.create(run.bundle, 1_000, new Set([
    "executeBpmnEffect",
  ]));
  const workflow = await creator.createWorkflow({
    info: await workflowInfo(run.workflowType, run.replaying, run.taskQueue),
    randomnessSeed: Array.from({ length: 32 }, () => 7),
    now: 0,
    showStackTraceSources: false,
  });
  const runId = workflowRunId(run.workflowType, run.replaying);
  try {
    run.assertInitialization(await workflow.activate({
      runId,
      timestamp: await timestamp(0),
      historyLength: 3,
      isReplaying: run.replaying,
      jobs: [{
        initializeWorkflow: {
          workflowId: workflowId(run.workflowType, run.replaying),
          workflowType: run.workflowType,
          arguments: [...run.args],
        },
      }],
    }));
    const completions: Completion[] = [];
    let elapsedMs = 0;
    let historyLength = 3;
    for (const jobs of [run.readyJobs, ...laterBatches]) {
      elapsedMs += 1_000;
      historyLength += 4;
      completions.push(await workflow.activate({
        runId,
        timestamp: await timestamp(elapsedMs),
        historyLength,
        isReplaying: run.replaying,
        jobs,
      }));
    }
    return completions;
  } finally {
    await workflow.dispose();
    await creator.destroy();
  }
}

/** Initializes the Workflow, then delivers `readyJobs` as a single second activation. */
export async function runDirectVmActivation(
  run: DirectVmActivationRun,
): Promise<Completion> {
  const [completion] = await runDirectVmActivations(run);
  if (completion === undefined) {
    throw new TypeError("Direct-VM activation produced no completion");
  }
  return completion;
}

export function commands(completion: Completion) {
  return completion.successful?.commands ?? [];
}

export function workflowFailureType(completion: Completion): string | undefined {
  return commands(completion).find(
    ({ failWorkflowExecution }) => failWorkflowExecution !== undefined,
  )?.failWorkflowExecution?.failure?.applicationFailureInfo?.type ?? undefined;
}

export function completedWorkflowResult(completion: Completion): unknown {
  const payload = commands(completion).find(
    ({ completeWorkflowExecution }) => completeWorkflowExecution !== undefined,
  )?.completeWorkflowExecution?.result;
  if (payload === null || payload === undefined) {
    throw new TypeError("Direct-VM activation completed without a result payload");
  }
  return defaultPayloadConverter.fromPayload(payload);
}

export function requireStartedTimer(completion: Completion, seq: number): void {
  assert.equal(
    commands(completion).some(({ startTimer }) => startTimer?.seq === seq),
    true,
  );
}

export function workflowRunId(workflowType: string, replaying: boolean): string {
  return `${workflowType}-${replaying ? "legacy" : "current"}-run`;
}

export function workflowId(workflowType: string, replaying: boolean): string {
  return `${workflowType}-${replaying ? "legacy" : "current"}`;
}

export async function timestamp(milliseconds: number): Promise<Timestamp> {
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

export async function importInstalledWorkerDependency(
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

async function workflowInfo(
  workflowType: string,
  replaying: boolean,
  taskQueue: string,
): Promise<WorkflowInfo> {
  return {
    workflowType,
    runId: workflowRunId(workflowType, replaying),
    workflowId: workflowId(workflowType, replaying),
    namespace: "default",
    firstExecutionRunId: workflowRunId(workflowType, replaying),
    attempt: 1,
    taskTimeoutMs: 1_000,
    taskQueue,
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
