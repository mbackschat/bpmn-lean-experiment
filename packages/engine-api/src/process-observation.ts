/**
 * Reading one process chain behind an opaque locator: its retained description and the kernel's canonical state
 * observation (`Kernel.Run.observationJson`), whose `openWaits` is `Kernel.Host`'s open-wait list with typed detail.
 * Every read distinguishes an ended chain (`closed`), a chain the host does not know (`unknown`) and a host it could
 * not reach (`unavailable`).
 */
import type { ProcessDescription } from "@bpmn-lean/temporal-host/host";

import { member, requireWireString, type EngineBinding, type EngineOccurrenceId, type JsonValue } from "./common.js";
import type { EngineHost } from "./host.js";
import { engineProcessLocatorWorkflowId, type EngineProcessLocator } from "./process-locator.js";
import { retainedMemo } from "./start-dispatch.js";

/** One open wait of the canonical observation; `detail.kind` names the wait's detail form. */
export type EngineOpenWait = Readonly<{
  id: EngineOccurrenceId;
  definition: JsonValue | null;
  input: string | null;
  detail: Readonly<{ kind: string } & Record<string, JsonValue>>;
}>;

export type EngineStateObservation = Readonly<{
  instanceId: string;
  status: string;
  logicalTimeMs: number;
  variables: readonly EngineBinding[];
  openWaits: readonly EngineOpenWait[];
}>;

export enum ObservedKind {
  Running = "running",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type Observed =
  | Readonly<{ kind: ObservedKind.Running; workflowId: string; description: ProcessDescription; state: EngineStateObservation }>
  | Readonly<{ kind: ObservedKind.Closed | ObservedKind.Unknown | ObservedKind.Unavailable }>;

/**
 * The running chain's description and state. A chain the engine did not start for `processInstanceId`, or whose
 * instance never committed a start, is unknown.
 */
export async function observeProcess(host: EngineHost, locator: EngineProcessLocator, processInstanceId: string): Promise<Observed> {
  const workflowId = engineProcessLocatorWorkflowId(locator);
  requireWireString(processInstanceId, "processInstanceId");
  try {
    const description = await host.processes.describe(workflowId);
    if (description === null || retainedMemo(description.memo)?.processInstanceId !== processInstanceId) {
      return { kind: ObservedKind.Unknown };
    }
    if (!description.running) return { kind: ObservedKind.Closed };
    const state = await host.processes.observation(workflowId);
    if (state === null) return { kind: ObservedKind.Unknown };
    return { kind: ObservedKind.Running, workflowId, description, state: state as unknown as EngineStateObservation };
  } catch {
    return { kind: ObservedKind.Unavailable };
  }
}

/** The open waits whose detail has the given form (a contract name of `canonical-result.schema.json`). */
export function waitsWithDetail(state: EngineStateObservation, kind: string): readonly EngineOpenWait[] {
  return state.openWaits.filter((wait) => member(wait.detail, "kind") === kind);
}

export function sameOccurrence(left: EngineOccurrenceId, right: EngineOccurrenceId): boolean {
  return left.processInstanceId === right.processInstanceId && left.elementId === right.elementId &&
    left.activation === right.activation;
}

export function requireOccurrence(value: EngineOccurrenceId, name: string): EngineOccurrenceId {
  if (typeof value.processInstanceId !== "string" || typeof value.elementId !== "string" ||
      !Number.isSafeInteger(value.activation) || value.activation < 0) {
    throw new TypeError(`${name} must be an occurrence identity`);
  }
  return { processInstanceId: value.processInstanceId, elementId: value.elementId, activation: value.activation };
}

/**
 * A command's verdict as Product 2 records it: the kernel's outcome, or the chain having ended before it arrived, with
 * the instance's final status (`null` when the ended chain's state could not be read).
 */
export type EngineCommandResult =
  | Readonly<{ kind: "semantic"; commandId: string; outcome: string; code: string | null }>
  | Readonly<{
      kind: "processClosed";
      commandId: string;
      receipt: Readonly<{ processInstanceId: string; status: string | null }>;
    }>;

/** Submits one command stimulus to the chain behind `locator`. */
export async function submitCommand(
  host: EngineHost,
  locator: EngineProcessLocator,
  processInstanceId: string,
  stimulus: Readonly<{ commandId: string } & Record<string, JsonValue>>,
): Promise<EngineCommandResult> {
  const workflowId = engineProcessLocatorWorkflowId(locator);
  const result = await host.processes.command(workflowId, stimulus);
  if (result.outcome === "rejected" && result.code === "workflow-closed") {
    return closed(host, workflowId, stimulus.commandId, processInstanceId);
  }
  return { kind: "semantic", commandId: stimulus.commandId, outcome: result.outcome, code: result.code };
}

/** The receipt of a command that found the chain ended, with the final status its last state records. */
export async function closed(host: EngineHost, workflowId: string, commandId: string, processInstanceId: string):
  Promise<EngineCommandResult> {
  let observed: unknown = null;
  try {
    observed = member(await host.processes.observation(workflowId), "status");
  } catch {
    observed = null;
  }
  return { kind: "processClosed", commandId, receipt: { processInstanceId, status: typeof observed === "string" ? observed : null } };
}
