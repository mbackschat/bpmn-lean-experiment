/**
 * What an accepted definition offers before any instance runs (`Kernel.Host.definitionCapabilities`), in the engine
 * API's form: one start list of `{startEventId, trigger, schedule}` and the correlated Message channels
 * ([Contracts](../../../docs/kernel/ARCHITECTURE-SPEC.md#contracts)). The kernel renders them (`Kernel.Run.capabilitiesJson`);
 * this module decodes that rendering member by member, so a rendering outside the contract is a Product 1 defect that
 * throws `TypeError`, never a capability.
 */
import { member, requireWireString, sameJson, type JsonValue } from "./common.js";

/** A Message channel in the scenario contract's `messageChannel` form (`channelToJson`). */
export type EngineMessageChannel =
  | Readonly<{ kind: "operationMessage"; interfaceId: string; interfaceOperationId: string; messageId: string }>
  | Readonly<{ kind: "directMessage"; messageId: string }>
  | Readonly<{ kind: "unspecifiedMessage" }>;

/**
 * A Timer start's schedule as the kernel resolves it from the definition (`Kernel.IL.Timer.resolve`): one delay, one
 * instant, a cycle's period and its repetitions (`null` unbounded), or a Cron expression's text. Admission refuses every
 * other form.
 */
export type EngineTimerSchedule =
  | Readonly<{ durationMs: number }>
  | Readonly<{ instantMs: number }>
  | Readonly<{ cycle: Readonly<{ periodMs: number; repetitions: number | null }> }>
  | Readonly<{ cron: string }>;

/**
 * How a start fires, by the vocabulary's `startTrigger` kind; a Message start names its channel and its literal Message
 * name (`null` when the name is no literal).
 */
export type EngineStartTrigger =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "message"; channel: EngineMessageChannel; messageName: string | null }>
  | Readonly<{ kind: "signal" }>
  | Readonly<{ kind: "timer" }>
  | Readonly<{ kind: "condition" }>;

/** One start a host can offer; `schedule` is a Timer start's and `null` for every other kind. */
export type EngineStartCapability = Readonly<{
  startEventId: string;
  trigger: EngineStartTrigger;
  schedule: EngineTimerSchedule | null;
}>;

/** A correlation criterion: the correlation key and the expression bound to its value, in the kernel IL's form. */
export type EngineCorrelationCriterion = Readonly<{ key: string; value: JsonValue }>;

/**
 * The correlated catches on one Message channel: each element that waits correlated on it, and the criteria the
 * kernel evaluates in the waiting instance when a publication is matched.
 */
export type EngineCorrelatedChannel = Readonly<{
  channel: EngineMessageChannel;
  catches: readonly Readonly<{ elementId: string; criteria: readonly EngineCorrelationCriterion[] }>[];
}>;

export type EngineDefinitionCapabilities = Readonly<{
  starts: readonly EngineStartCapability[];
  correlatedChannels: readonly EngineCorrelatedChannel[];
}>;

/** `json` as an object with exactly the `required` members and at most the `optional` ones. */
function exactObject(json: unknown, required: readonly string[], optional: readonly string[], name: string): unknown {
  if (json === null || typeof json !== "object" || Array.isArray(json)) throw new TypeError(`${name} must be an object`);
  const keys = Object.keys(json);
  const unknown = keys.filter((key) => !required.includes(key) && !optional.includes(key));
  const missing = required.filter((key) => !keys.includes(key));
  if (unknown.length > 0 || missing.length > 0) {
    throw new TypeError(`${name} must have the members ${JSON.stringify(required)} and at most ${JSON.stringify(optional)}`);
  }
  return json;
}

function arrayOf<T>(json: unknown, name: string, item: (entry: unknown, name: string) => T): readonly T[] {
  if (!Array.isArray(json)) throw new TypeError(`${name} must be an array`);
  return json.map((entry: unknown, index) => item(entry, `${name}[${String(index)}]`));
}

function naturalOf(json: unknown, name: string): number {
  if (typeof json !== "number" || !Number.isSafeInteger(json) || json < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return json;
}

function onlyMember(json: unknown, keys: readonly string[], name: string): string {
  if (json === null || typeof json !== "object" || Array.isArray(json)) throw new TypeError(`${name} must be an object`);
  const present = Object.keys(json);
  const [key] = present;
  if (present.length !== 1 || key === undefined || !keys.includes(key)) {
    throw new TypeError(`${name} must have exactly one member of ${JSON.stringify(keys)}`);
  }
  return key;
}

/** A Timer start's schedule from the kernel's rendering (`Kernel.Run.resolvedTimerJson`). */
export function engineTimerScheduleFromJson(json: unknown): EngineTimerSchedule {
  const name = "Timer start schedule";
  const key = onlyMember(json, ["durationMs", "instantMs", "cycle", "cron"], name);
  const value = member(json, key);
  switch (key) {
    case "durationMs": return { durationMs: naturalOf(value, `${name}.durationMs`) };
    case "instantMs": return { instantMs: naturalOf(value, `${name}.instantMs`) };
    case "cron": return { cron: requireWireString(value, `${name}.cron`) };
    case "cycle": {
      const keys = value !== null && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : null;
      if (keys === null || !sameJson(keys, ["periodMs", "repetitions"])) {
        throw new TypeError(`${name}.cycle must have exactly periodMs and repetitions`);
      }
      const repetitions = member(value, "repetitions");
      return {
        cycle: {
          periodMs: naturalOf(member(value, "periodMs"), `${name}.cycle.periodMs`),
          repetitions: repetitions === null ? null : naturalOf(repetitions, `${name}.cycle.repetitions`),
        },
      };
    }
  }
  throw new TypeError(`${name} has no member ${key}`);
}

/** A Message channel from the kernel's rendering (`channelToJson`). */
export function engineMessageChannelFromJson(json: unknown, name = "Message channel"): EngineMessageChannel {
  const kind = member(json, "kind");
  switch (kind) {
    case "operationMessage": {
      const channel = exactObject(json, ["kind", "interfaceId", "interfaceOperationId", "messageId"], [], name);
      return {
        kind,
        interfaceId: requireWireString(member(channel, "interfaceId"), `${name}.interfaceId`),
        interfaceOperationId: requireWireString(member(channel, "interfaceOperationId"), `${name}.interfaceOperationId`),
        messageId: requireWireString(member(channel, "messageId"), `${name}.messageId`),
      };
    }
    case "directMessage": {
      const channel = exactObject(json, ["kind", "messageId"], [], name);
      return { kind, messageId: requireWireString(member(channel, "messageId"), `${name}.messageId`) };
    }
    case "unspecifiedMessage":
      exactObject(json, ["kind"], [], name);
      return { kind };
  }
  throw new TypeError(`${name}.kind must name a Message channel`);
}

function startTriggerFromJson(json: unknown, name: string): EngineStartTrigger {
  const kind = member(json, "kind");
  switch (kind) {
    case "message": {
      const trigger = exactObject(json, ["kind", "channel"], ["messageName"], name);
      const messageName = member(trigger, "messageName");
      return {
        kind,
        channel: engineMessageChannelFromJson(member(trigger, "channel"), `${name}.channel`),
        messageName: messageName === undefined ? null : requireWireString(messageName, `${name}.messageName`),
      };
    }
    case "none":
    case "signal":
    case "timer":
    case "condition":
      exactObject(json, ["kind"], [], name);
      return { kind };
  }
  throw new TypeError(`${name}.kind must name a start trigger`);
}

/** A start from the kernel's rendering; a Timer start, and only a Timer start, carries a schedule. */
function startFromJson(json: unknown, name: string): EngineStartCapability {
  const start = exactObject(json, ["startEventId", "trigger"], ["schedule"], name);
  const trigger = startTriggerFromJson(member(start, "trigger"), `${name}.trigger`);
  const schedule = member(start, "schedule");
  if ((trigger.kind === "timer") !== (schedule !== undefined)) {
    throw new TypeError(`${name} must carry a schedule exactly when it is a Timer start`);
  }
  return {
    startEventId: requireWireString(member(start, "startEventId"), `${name}.startEventId`),
    trigger,
    schedule: schedule === undefined ? null : engineTimerScheduleFromJson(schedule),
  };
}

function criterionFromJson(json: unknown, name: string): EngineCorrelationCriterion {
  const criterion = exactObject(json, ["key", "value"], [], name);
  return { key: requireWireString(member(criterion, "key"), `${name}.key`), value: member(criterion, "value") as JsonValue };
}

function correlatedChannelFromJson(json: unknown, name: string): EngineCorrelatedChannel {
  const group = exactObject(json, ["channel", "catches"], [], name);
  return {
    channel: engineMessageChannelFromJson(member(group, "channel"), `${name}.channel`),
    catches: arrayOf(member(group, "catches"), `${name}.catches`, (entry, at) => {
      const correlated = exactObject(entry, ["elementId", "criteria"], [], at);
      return {
        elementId: requireWireString(member(correlated, "elementId"), `${at}.elementId`),
        criteria: arrayOf(member(correlated, "criteria"), `${at}.criteria`, criterionFromJson),
      };
    }),
  };
}

/** The capabilities from the kernel's rendering; `relations` is provenance the engine API does not offer. */
export function engineDefinitionCapabilitiesFromJson(json: unknown): EngineDefinitionCapabilities {
  const name = "definition capabilities";
  const capabilities = exactObject(json, ["starts", "correlatedChannels", "relations"], [], name);
  return {
    starts: arrayOf(member(capabilities, "starts"), `${name}.starts`, startFromJson),
    correlatedChannels: arrayOf(member(capabilities, "correlatedChannels"), `${name}.correlatedChannels`, correlatedChannelFromJson),
  };
}
