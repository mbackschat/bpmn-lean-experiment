/**
 * The mechanism every start shares: a prepared start is the exact program, Workflow ID and start stimulus, bound by
 * an intent digest; dispatch recomputes it, starts the chain at most once under its Workflow ID, and a retry after a
 * lost response is recognized by the intent the chain retains in its memo.
 */
import { stimulusFromJson } from "@bpmn-lean/kernel";
import { workflowType } from "@bpmn-lean/temporal-host/host";

import {
  canonicalJson,
  member,
  sameIdentity,
  sha256Hex,
  type EngineDefinitionIdentity,
  type EngineFailure,
  type EngineIntent,
  type JsonValue,
} from "./common.js";
import type { CompiledDefinition } from "./definition.js";
import { engineHostRefusal } from "./definition.js";
import { engineCorrelationScope, engineHostConfig, type EngineHost } from "./host.js";

export type PreparedStart = Readonly<{
  compiled: CompiledDefinition;
  workflowId: string;
  processInstanceId: string;
  stimulus: JsonValue;
  intent: EngineIntent;
}>;

/** What the host retains of a start: the intent, the definition identity and the semantic instance identity. */
export type EngineStartMemo = Readonly<{
  intent: EngineIntent;
  definition: EngineDefinitionIdentity;
  processInstanceId: string;
}>;

/**
 * The prepared start, or why it cannot be dispatched: the deployment does not serve what the program needs, or the
 * stimulus is not one the kernel's codec reads.
 */
export function prepareStart(
  host: EngineHost,
  protocol: string,
  compiled: CompiledDefinition,
  workflowId: string,
  processInstanceId: string,
  stimulus: JsonValue,
): PreparedStart | EngineFailure {
  const refusal = engineHostRefusal(compiled.compilation.hostRequirements, host.served);
  if (refusal !== null) {
    return { code: refusal, evidence: `The deployment does not serve what the definition requires (${refusal}).` };
  }
  const decoded = stimulusFromJson(stimulus);
  if (!decoded.ok) return { code: "stimulus.malformed", evidence: decoded.refusal };
  const content = {
    protocol,
    workflowId,
    workflowType,
    taskQueue: host.taskQueue,
    definition: compiled.compilation.definition,
    programSha256: sha256Hex(canonicalJson(compiled.program)),
    stimulus,
  };
  return {
    compiled,
    workflowId,
    processInstanceId,
    stimulus,
    intent: { protocol, intentSha256: sha256Hex(canonicalJson(content)) },
  };
}

export function startMemo(prepared: PreparedStart): EngineStartMemo {
  return {
    intent: prepared.intent,
    definition: prepared.compiled.compilation.definition,
    processInstanceId: prepared.processInstanceId,
  };
}

export function sameIntent(left: EngineIntent, right: EngineIntent): boolean {
  return left.protocol === right.protocol && left.intentSha256 === right.intentSha256;
}

/** The start memo a description carries, `null` when it carries none in the engine's form. */
export function retainedMemo(memo: JsonValue | Readonly<Record<string, JsonValue>> | null): EngineStartMemo | null {
  const intent = member(memo, "intent");
  const definition = member(memo, "definition");
  const processInstanceId = member(memo, "processInstanceId");
  if (typeof member(intent, "protocol") !== "string" || typeof member(intent, "intentSha256") !== "string" ||
      member(definition, "ref") === undefined || typeof processInstanceId !== "string") {
    return null;
  }
  return memo as unknown as EngineStartMemo;
}

export enum StartDispatchKind {
  Started = "started",
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export type StartDispatch =
  | Readonly<{ kind: StartDispatchKind.Started }>
  | Readonly<{ kind: StartDispatchKind.Rejected | StartDispatchKind.IntegrityFailure; failure: EngineFailure }>;

/**
 * Starts the prepared chain. A Workflow ID already taken by a chain with the same intent is this start, retried; with
 * another intent it is a different start holding the address. A start the kernel did not commit is rejected with the
 * kernel's code.
 */
export async function dispatchStart(host: EngineHost, prepared: PreparedStart): Promise<StartDispatch> {
  const result = await host.processes.start({
    workflowId: prepared.workflowId,
    program: prepared.compiled.program,
    config: engineHostConfig(host),
    start: prepared.stimulus,
    correlationScope: engineCorrelationScope(prepared.compiled.compilation.definition),
    memo: startMemo(prepared) as unknown as Readonly<Record<string, JsonValue>>,
  });
  if (result.outcome === "committed") return { kind: StartDispatchKind.Started };
  if (result.code !== "workflow-already-started") {
    return {
      kind: StartDispatchKind.Rejected,
      failure: { code: result.code ?? result.outcome, evidence: `The kernel's verdict on the start was ${result.outcome}.` },
    };
  }
  const described = await host.processes.describe(prepared.workflowId);
  const retained = described === null ? null : retainedMemo(described.memo);
  if (retained === null || !sameIntent(retained.intent, prepared.intent)) {
    return {
      kind: StartDispatchKind.IntegrityFailure,
      failure: { code: "startAddressTaken", evidence: "Another start already holds this process instance's host address." },
    };
  }
  const snapshot = await host.processes.hostView(prepared.workflowId);
  return snapshot.view === null
    ? { kind: StartDispatchKind.Rejected, failure: { code: "startNotCommitted", evidence: "The retained start did not commit." } }
    : { kind: StartDispatchKind.Started };
}

export enum EngineStartDescriptionStatus {
  Matching = "matching",
  Missing = "missing",
  Divergent = "divergent",
  Unavailable = "unavailable",
}

/** Compares what the host retained under `workflowId` with the expected intent; transport failures are `unavailable`. */
export async function describeStart(
  host: EngineHost,
  workflowId: string,
  expected: EngineIntent,
): Promise<EngineStartDescriptionStatus> {
  let described;
  try {
    described = await host.processes.describe(workflowId);
  } catch {
    return EngineStartDescriptionStatus.Unavailable;
  }
  if (described === null) return EngineStartDescriptionStatus.Missing;
  const retained = retainedMemo(described.memo);
  return described.workflowType === workflowType && described.taskQueue === host.taskQueue && retained !== null &&
      sameIntent(retained.intent, expected)
    ? EngineStartDescriptionStatus.Matching
    : EngineStartDescriptionStatus.Divergent;
}

/** Whether the chain under `workflowId` runs `identity`; `null` when the host retains no engine memo for it. */
export function retainedIdentityMatches(memo: Readonly<Record<string, JsonValue>> | null, identity: EngineDefinitionIdentity,
  processInstanceId: string): boolean | null {
  const retained = retainedMemo(memo);
  if (retained === null) return null;
  return sameIdentity(retained.definition, identity) && retained.processInstanceId === processInstanceId;
}
