/**
 * The mechanism every start shares: a prepared start is the exact program, Workflow ID and start stimulus, bound by
 * an intent digest; dispatch recomputes it, starts the chain at most once under its Workflow ID, and a retry after a
 * lost response is recognized by the intent the chain retains in its memo.
 */
import { stimulusFromJson } from "@bpmn-lean/kernel";
import {
  CapacityBound,
  canonicalBytes,
  canonicalJson,
  capacityCode,
  chainCapacity,
  workflowType,
  type ProcessDescription,
} from "@bpmn-lean/temporal-host/host";

import {
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
import { engineDeploymentScope } from "./definition-deployment.js";
import { engineHostConfig, type EngineHost } from "./host.js";

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
 * The refusal of a program or start stimulus past its byte bound (`host.capacity.program`, `host.capacity.start`),
 * refused here before any Workflow starts; the Workflow measures both again at its start.
 */
export function startCapacityRefusal(program: JsonValue, stimulus: JsonValue): EngineFailure | null {
  if (canonicalBytes(program) > chainCapacity.programBytes) {
    const code = capacityCode(CapacityBound.Program);
    return { code, evidence: `The program exceeds the host's ${String(chainCapacity.programBytes)}-byte bound (${code}).` };
  }
  if (canonicalBytes(stimulus) > chainCapacity.startBytes) {
    const code = capacityCode(CapacityBound.Start);
    return { code, evidence: `The start exceeds the host's ${String(chainCapacity.startBytes)}-byte bound (${code}).` };
  }
  return null;
}

/**
 * The prepared start, or why it cannot be dispatched: the deployment does not serve what the program needs, the program
 * or the start exceeds its byte bound, or the stimulus is not one the kernel's codec reads.
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
  const oversized = startCapacityRefusal(compiled.program, stimulus);
  if (oversized !== null) return oversized;
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
 * Starts the prepared chain under the deployment its definition version registered, so the population's commands reach
 * its waits; an unregistered version is `definition-not-deployed`. A Workflow ID already taken by a chain with the same
 * intent is this start, retried, answering that start's own verdict; with another intent it is a different start
 * holding the address. A start the kernel did not commit is rejected with the kernel's code. A retry racing a start that
 * has no verdict yet throws, as a lost response does, for a later description to settle.
 */
export async function dispatchStart(host: EngineHost, prepared: PreparedStart): Promise<StartDispatch> {
  const population = await engineDeploymentScope(host, prepared.compiled.compilation.definition);
  if ("code" in population) return { kind: StartDispatchKind.Rejected, failure: population };
  const result = await host.processes.start({
    workflowId: prepared.workflowId,
    program: prepared.compiled.program,
    config: engineHostConfig(host),
    start: prepared.stimulus,
    population,
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
  if (described === null || retained === null || !sameIntent(retained.intent, prepared.intent)) {
    return {
      kind: StartDispatchKind.IntegrityFailure,
      failure: { code: "startAddressTaken", evidence: "Another start already holds this process instance's host address." },
    };
  }
  const verdict = await retainedStartVerdict(host, prepared.workflowId, described);
  switch (verdict) {
    case EngineStartDescriptionStatus.Matching:
      return { kind: StartDispatchKind.Started };
    case EngineStartDescriptionStatus.NotCommitted:
      return { kind: StartDispatchKind.Rejected, failure: { code: "startNotCommitted", evidence: "The retained start did not commit." } };
    case EngineStartDescriptionStatus.Pending:
      throw new Error(`The start retained under ${prepared.workflowId} has no verdict yet.`);
  }
}

/**
 * What the host retains of a start under its Workflow ID. A retained start with the expected intent is `matching` only
 * once it committed; before its verdict it is `pending`, and `notCommitted` once its chain ended without committing.
 */
export enum EngineStartDescriptionStatus {
  Matching = "matching",
  Pending = "pending",
  NotCommitted = "notCommitted",
  Missing = "missing",
  Divergent = "divergent",
  Unavailable = "unavailable",
}

/**
 * The verdict on a retained start, read from its chain rather than from the chain's presence: a committed start leaves
 * a committed view; without one, a running chain's start has no verdict yet (its first Workflow task may still run) and
 * an ended chain's start did not commit.
 */
async function retainedStartVerdict(
  host: EngineHost,
  workflowId: string,
  described: ProcessDescription,
): Promise<EngineStartDescriptionStatus.Matching | EngineStartDescriptionStatus.Pending | EngineStartDescriptionStatus.NotCommitted> {
  const snapshot = await host.processes.hostView(workflowId);
  if (snapshot.view !== null) return EngineStartDescriptionStatus.Matching;
  return described.running ? EngineStartDescriptionStatus.Pending : EngineStartDescriptionStatus.NotCommitted;
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
  if (described.workflowType !== workflowType || described.taskQueue !== host.taskQueue || retained === null ||
      !sameIntent(retained.intent, expected)) {
    return EngineStartDescriptionStatus.Divergent;
  }
  try {
    return await retainedStartVerdict(host, workflowId, described);
  } catch {
    return EngineStartDescriptionStatus.Unavailable;
  }
}

/** Whether the chain under `workflowId` runs `identity`; `null` when the host retains no engine memo for it. */
export function retainedIdentityMatches(memo: Readonly<Record<string, JsonValue>> | null, identity: EngineDefinitionIdentity,
  processInstanceId: string): boolean | null {
  const retained = retainedMemo(memo);
  if (retained === null) return null;
  return sameIdentity(retained.definition, identity) && retained.processInstanceId === processInstanceId;
}
