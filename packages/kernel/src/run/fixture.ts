/**
 * Kernel fixtures of the population functions, transcribed from `Kernel/Run/Fixture.lean`: the population functions a
 * host shares with the population runner (ARCHITECTURE-SPEC "Population ingress"), each answered over a kernel
 * fixture's admitted programs and input, so the unit cases of these functions are held to the Lean kernel
 * (`kernelRun --fixture`, `kernelRun --batch`). `run.ts` dispatches to them and passes the registry's hooks and the
 * instance state a fixture's stimuli commit, since only it may import the registries. Each reads its input in the
 * runner's wire forms: occurrences, Signal addresses and bindings as stimuli state them, receivers and publications as
 * population scenarios do.
 */
import { assertNever, type Program } from "../il/types.js";
import { bindingsToJson, isObject, type JsonValue } from "../il/codec.js";
import { channelToJson, decodeBindings, decodeSignalAddress, occurrenceFromJson, signalAddressToJson } from "../il/codec/stimulus.js";
import type { Hooks } from "../hooks.js";
import { FailureTag, StartTriggerTag, type BroadcastIntent, type Failure, type OccurrenceRef, type SignalAddress, type State } from "../state.js";
import { FanOutEntryTag, cascadeInstanceId, startedInstanceId, type FanOutEntry } from "../population/contract.js";
import {
  FanOutNextTag, PendingTag, fanOutBegin, fanOutNext, fanOutPass, fanOutRecord, fanOutSnapshot, linearizeReceivers, reachOccurrence,
  signalReceiversOf, type Emission, type FanOutMachine, type FanOutNext, type Pending,
} from "../population/signals.js";
import { messageReceivers, messageStartCandidates } from "../population/messages.js";
import { conditionalStartVerdict } from "../population/conditions.js";
import { deploymentSummary, type DeploymentSummary } from "../population/deploy.js";
import { timerStartCheck } from "../population/timers.js";
import {
  decoded, fanOutEntryJson, failureFields, natural, publicationFromJson, receiverFromJson, receiverJson,
} from "./population.js";
import { arrayField, field, nullable, referenceJson, requiredString } from "./wire.js";

const where = "fixture";

/** `key`'s member decoded by `decode`, or `null` when it is JSON null; Lean's `getObjValD` reads an absent key as null. */
export function nullableAt<T>(json: unknown, key: string, decode: (json: unknown) => T): T | null {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  return value === null ? null : decode(value);
}

const stringValue = (json: unknown): string => {
  if (typeof json !== "string") throw new Error(`${where}: String expected`);
  return json;
};
const address = (json: unknown): SignalAddress => decoded(decodeSignalAddress(json), where);
const occurrenceRef = (json: unknown): OccurrenceRef => decoded(occurrenceFromJson(json), where);
const bindingsOf = (json: unknown, key: string) => decoded(decodeBindings(json, key), where);

export function signalAddressJson(signal: SignalAddress): JsonValue {
  return signalAddressToJson(signal);
}

/** A Signal emission: `{address, variables, businessKey, origin, emitter}`, the last three nullable. */
export function emissionFromJson(json: unknown): Emission {
  return {
    address: address(field(json, "address", where)), variables: bindingsOf(json, "variables"),
    businessKey: nullableAt(json, "businessKey", stringValue), origin: nullableAt(json, "origin", occurrenceRef), emitter: nullableAt(json, "emitter", stringValue),
  };
}

export function emissionJson(emission: Emission): JsonValue {
  return {
    address: signalAddressJson(emission.address), variables: bindingsToJson(emission.variables),
    businessKey: emission.businessKey, origin: nullable(emission.origin, referenceJson), emitter: emission.emitter,
  };
}

/** A Signal an instance threw: `{address, variables, businessKey, origin}`, `businessKey` nullable. */
export function intentFromJson(json: unknown): BroadcastIntent {
  return {
    address: address(field(json, "address", where)), variables: bindingsOf(json, "variables"),
    businessKey: nullableAt(json, "businessKey", stringValue), origin: occurrenceRef(field(json, "origin", where)),
  };
}

export function intentJson(intent: BroadcastIntent): JsonValue {
  return {
    address: signalAddressJson(intent.address), variables: bindingsToJson(intent.variables), businessKey: intent.businessKey,
    origin: referenceJson(intent.origin),
  };
}

/** Work a fan-out still has: `{receiver, emission}` (`emission` nullable for a root receiver) or `{intent, emitter}`. */
export function pendingFromJson(json: unknown): Pending {
  const intent = nullableAt(json, "intent", intentFromJson);
  return intent === null
    ? { tag: PendingTag.Receiver, emission: nullableAt(json, "emission", emissionFromJson), receiver: receiverFromJson(field(json, "receiver", where), where) }
    : { tag: PendingTag.Intent, emitter: requiredString(json, "emitter", where), intent };
}

const failures: Readonly<Record<string, (code: string) => Failure>> = {
  rejected: (code) => ({ tag: FailureTag.Rejected, code }),
  rolledBack: (code) => ({ tag: FailureTag.RolledBack, code }),
  semanticFailure: (code) => ({ tag: FailureTag.SemanticFailure, code }),
  unsupported: (code) => ({ tag: FailureTag.Unsupported, code }),
};

/** A failure by the outcome name and code `failureFields` writes. */
export function failureFromJson(json: unknown): Failure {
  const code = requiredString(json, "code", where);
  const outcome = requiredString(json, "outcome", where);
  const failure = Object.hasOwn(failures, outcome) ? failures[outcome] : undefined;
  if (failure === undefined) throw new Error(`unknown failure outcome ${outcome}`);
  return failure(code);
}

const fanOutEntries: Readonly<Record<string, (json: unknown) => FanOutEntry>> = {
  delivered: (json) => ({ tag: FanOutEntryTag.Delivered, target: occurrenceRef(field(json, "target", where)) }),
  skipped: (json) => ({ tag: FanOutEntryTag.Skipped, target: occurrenceRef(field(json, "target", where)) }),
  started: (json) => ({
    tag: FanOutEntryTag.Started, instanceId: requiredString(json, "instanceId", where), deploymentId: natural(json, "deploymentId", where),
    version: natural(json, "version", where), startEvent: requiredString(json, "startEvent", where),
  }),
  failed: (json) => ({ tag: FanOutEntryTag.Failed, target: receiverFromJson(field(json, "target", where), where), failure: failureFromJson(json) }),
};

/** A fan-out entry in the form `fanOutEntryJson` writes. */
export function fanOutEntryFromJson(json: unknown): FanOutEntry {
  const kind = requiredString(json, "kind", where);
  const entry = Object.hasOwn(fanOutEntries, kind) ? fanOutEntries[kind] : undefined;
  if (entry === undefined) throw new Error(`unknown fan-out entry kind ${kind}`);
  return entry(json);
}

export function fanOutNextJson(next: FanOutNext): JsonValue {
  switch (next.tag) {
    case FanOutNextTag.Reach:
      return { kind: "reach", receiver: receiverJson(next.receiver), emission: nullable(next.emission, emissionJson) };
    case FanOutNextTag.Snapshot:
      return { kind: "snapshot", intent: intentJson(next.intent), emission: emissionJson(next.emission) };
    case FanOutNextTag.Done:
      return { kind: "done", entries: next.entries.map(fanOutEntryJson) };
  }
  return assertNever(next);
}

const receiversAt = (json: unknown, key: string) => arrayField(json, key, where).map((entry) => receiverFromJson(entry, where));

const fanOutOps: Readonly<Record<string, (machine: FanOutMachine, op: unknown) => readonly [FanOutMachine, JsonValue]>> = {
  next: (machine) => [machine, fanOutNextJson(fanOutNext(machine))],
  pass: (machine) => [fanOutPass(machine), null],
  record: (machine, op) => [fanOutRecord(machine, fanOutEntryFromJson(field(op, "entry", where)),
    arrayField(op, "intents", where).map(intentFromJson), requiredString(op, "emitter", where)), null],
  snapshot: (machine, op) => {
    const order = nullableAt(op, "order", (json) => {
      if (!Array.isArray(json)) throw new Error(`${where}: expected JSON array`);
      return json.map((entry) => receiverFromJson(entry, where));
    });
    const taken = fanOutSnapshot(machine, receiversAt(op, "receivers"), order);
    return taken.ok ? [taken.value, { ok: true }] : [machine, { error: taken.error }];
  },
};

/** One step of a fan-out script over `machine`: the machine after it and the step's answer. */
export function fanOutOp(machine: FanOutMachine, op: unknown): readonly [FanOutMachine, JsonValue] {
  const kind = requiredString(op, "op", where);
  const step = Object.hasOwn(fanOutOps, kind) ? fanOutOps[kind] : undefined;
  if (step === undefined) throw new Error(`fixture-fan-out-op-unknown: ${kind}`);
  return step(machine, op);
}

/** The answers of a fan-out script: a machine begun as `input` states, then each of its `ops` in turn. */
export function fanOutScript(input: unknown): JsonValue {
  const root = arrayField(input, "root", where).map(pendingFromJson);
  let machine = fanOutBegin(requiredString(input, "commandId", where), root, natural(input, "budget", where));
  return arrayField(input, "ops", where).map((op) => {
    const [next, answer] = fanOutOp(machine, op);
    machine = next;
    return answer;
  });
}

/** `linearizeReceivers` over `{waiting: [{processInstanceId, occurrences}], starts: [{deploymentId, receivers}]}`. */
export function linearizedAnswer(input: unknown): JsonValue {
  const waiting = arrayField(input, "waiting", where).map((entry) =>
    [requiredString(entry, "processInstanceId", where), arrayField(entry, "occurrences", where).map(occurrenceRef)] as const);
  const starts = arrayField(input, "starts", where).map((entry) =>
    [natural(entry, "deploymentId", where), receiversAt(entry, "receivers")] as const);
  return linearizeReceivers(waiting, starts).map(receiverJson);
}

/** `signalReceiversOf` an instance's state for `{address, emitter}`, `emitter` nullable. */
export function signalReceiversAnswer(program: Program, state: State, input: unknown): JsonValue {
  return signalReceiversOf(program, state, address(field(input, "address", where)), nullableAt(input, "emitter", stringValue)).map(referenceJson);
}

/**
 * Each of `targets` reached in turn with the broadcast `{address, variables, atMs}`, a committed reach advancing the
 * state: `{skipped: true}`, `{outcome: "committed"}` or the failure's `{outcome, code}`.
 */
export function reachAnswers(hooks: Hooks, program: Program, state: State, input: unknown): JsonValue {
  const signal = address(field(input, "address", where));
  const variables = bindingsOf(input, "variables");
  const atMs = natural(input, "atMs", where);
  let current = state;
  return arrayField(input, "targets", where).map((json): JsonValue => {
    const reached = reachOccurrence(hooks, program, current, signal, variables, occurrenceRef(json), atMs);
    if (reached.skipped) return { skipped: true };
    if (!reached.outcome.ok) return failureFields(reached.outcome.failure);
    current = reached.outcome.value;
    return { outcome: "committed" };
  });
}

/** `messageReceivers` of an instance's state for a `publication`: each reached occurrence with its channel. */
export function messageReceiversAnswer(hooks: Hooks, program: Program, state: State, input: unknown): JsonValue {
  return messageReceivers(hooks, program, state, publicationFromJson(field(input, "publication", where), where))
    .map(([ref, channel]) => ({ occurrence: referenceJson(ref), channel: channelToJson(channel) }));
}

/** `messageStartCandidates` of a program for the address of a `publication`: each start with its channel. */
export function startCandidatesAnswer(program: Program, input: unknown): JsonValue {
  return messageStartCandidates(program, publicationFromJson(field(input, "publication", where), where).message)
    .map(([startEvent, channel]) => ({ startEvent, channel: channelToJson(channel) }));
}

/**
 * `conditionalStartVerdict` over a Conditional start input `{instanceId, startEvent, variables, businessKey, atMs}`:
 * `{holds}` or the failure's `{outcome, code}`.
 */
export function conditionalVerdictAnswer(hooks: Hooks, program: Program, input: unknown): JsonValue {
  const verdict = conditionalStartVerdict(hooks, program, {
    instanceId: requiredString(input, "instanceId", where), startEvent: requiredString(input, "startEvent", where),
    variables: bindingsOf(input, "variables"), trigger: { tag: StartTriggerTag.Condition },
    businessKey: nullableAt(input, "businessKey", stringValue), atMs: natural(input, "atMs", where),
  });
  return verdict.ok ? { holds: verdict.value } : failureFields(verdict.failure);
}

/**
 * `timerStartCheck` over each program's summary registered as `registry` states it (`{deploymentId, versions,
 * deployedAtMs}`, in program order), for each of `checks` (`{deploymentId, startEvent, dueMs, atMs, consumed}`).
 */
export function timerChecks(programs: readonly Program[], input: unknown): JsonValue {
  const entries = arrayField(input, "registry", where);
  if (entries.length !== programs.length) throw new Error("fixture-deployment-count");
  const registry = programs.map((program, index): DeploymentSummary => {
    const entry = entries[index];
    const versions = arrayField(entry, "versions", where).map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string") throw new Error(`${where}: versions: pair expected`);
      return [pair[0], natural({ version: pair[1] }, "version", where)] as const;
    });
    return { ...deploymentSummary(program), deploymentId: natural(entry, "deploymentId", where), versions, deployedAtMs: natural(entry, "deployedAtMs", where) };
  });
  return arrayField(input, "checks", where).map((check) => {
    const consumed = field(check, "consumed", where);
    if (typeof consumed !== "boolean") throw new Error(`${where}: consumed: Bool expected`);
    return timerStartCheck(registry, natural(check, "deploymentId", where), requiredString(check, "startEvent", where),
      natural(check, "dueMs", where), natural(check, "atMs", where), consumed);
  });
}

/**
 * The identity of an instance a population start creates, `startedInstanceId`, or `cascadeInstanceId` when `emitter`,
 * the throw's occurrence, is not null.
 */
export function instanceIdAnswer(input: unknown): JsonValue {
  const commandId = requiredString(input, "commandId", where);
  const deploymentId = natural(input, "deploymentId", where);
  const startEvent = requiredString(input, "startEvent", where);
  const emitter = nullableAt(input, "emitter", occurrenceRef);
  return emitter === null ? startedInstanceId(commandId, deploymentId, startEvent) : cascadeInstanceId(commandId, deploymentId, startEvent, emitter);
}
