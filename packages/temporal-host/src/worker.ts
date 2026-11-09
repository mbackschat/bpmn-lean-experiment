/**
 * The host Worker: the Workflow bundle, the caller's effect handler and the Script handler, on one task queue.
 */
import { fileURLToPath } from "node:url";

import {
  DefaultLogger,
  Worker,
  bundleWorkflowCode,
  type NativeConnection,
  type WorkflowBundleWithSourceMap,
} from "@temporalio/worker";

import { createHostActivities, type EffectHandler } from "./activities.js";

export { createHostActivities, type EffectContext, type EffectHandler, type HostActivityOptions } from "./activities.js";
export type { EffectRequest, ScriptRequest } from "./host-machine.js";
export { EffectResultKind, type Binding, type EffectResult } from "./port.js";

const workflowsPath = fileURLToPath(new URL("./workflows.js", import.meta.url));

let bundle: Promise<WorkflowBundleWithSourceMap> | undefined;

/**
 * The Workflow bundle, built once per Node process, a failed build included, so a replacement Worker and a replay
 * never run a different artifact than the Worker that wrote the history.
 */
export function loadWorkflowBundle(): Promise<WorkflowBundleWithSourceMap> {
  // Successful Webpack progress is noise; compilation errors stay visible.
  bundle ??= bundleWorkflowCode({ workflowsPath, logger: new DefaultLogger("ERROR") });
  return bundle;
}

export interface HostWorkerOptions {
  readonly connection: NativeConnection;
  readonly namespace?: string;
  readonly taskQueue: string;
  readonly effects: EffectHandler;
  /** The bound on one Script's evaluation, after which it is the effect's technical failure. */
  readonly scriptTimeoutMs: number;
  readonly identity?: string;
}

export async function createHostWorker(options: HostWorkerOptions): Promise<Worker> {
  return Worker.create({
    connection: options.connection,
    ...(options.namespace === undefined ? {} : { namespace: options.namespace }),
    ...(options.identity === undefined ? {} : { identity: options.identity }),
    taskQueue: options.taskQueue,
    workflowBundle: await loadWorkflowBundle(),
    activities: createHostActivities({ effects: options.effects, scriptTimeoutMs: options.scriptTimeoutMs }),
  });
}

/** Replays one captured history against this package's bundle; a nondeterminism error rejects. */
export async function replayHistory(history: unknown, workflowId?: string): Promise<void> {
  await Worker.runReplayHistory({ workflowBundle: await loadWorkflowBundle() }, history, workflowId);
}
