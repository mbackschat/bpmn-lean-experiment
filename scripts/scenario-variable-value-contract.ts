import { requireUnicodeScalarString } from "./strict-json.ts";

const structuredHumanWorkProfile =
  "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
const sequentialMultiInstanceProfile =
  "bpmn-2.0.2-sequential-multi-instance-user-task-draft";
const parallelMultiInstanceProfile =
  "bpmn-2.0.2-parallel-multi-instance-user-task-draft";
const messagePayloadCatchProfile =
  "bpmn-2.0.2-message-payload-catch-draft";
const portableHandoffProfile =
  "bpmn-2.0.2-portable-business-values-handoff-draft";
const portableEffectDataProfile =
  "cibseven-2.2.0-portable-business-effect-data-draft";
const nestedScopeDataProfile =
  "cibseven-2.2.0-nested-embedded-scope-data-draft";
const portableMessagePayloadProfile =
  "bpmn-2.0.2-portable-business-message-payload-draft";
// SingletonBusinessItem root String bound of the serial handoff's Process Start and User Task completion, which the
// effect-data profile also applies to its String/Null Process Start and its effect results, and the Message-payload
// profile to its payload. The nested scope-data profile applies it to Start, User Task completion and effect results.
const portableHandoffRootStringBytes = 1_024;

export type ScenarioVariableValueContractInput = Readonly<{
  profile: string;
  stimuli: ReadonlyArray<Readonly<Record<string, unknown>>>;
}>;

/** Verifies profile-local variable write surfaces and their bounded values. */
export function verifyScenarioVariableValueContract(
  scenario: ScenarioVariableValueContractInput,
): void {
  for (const stimulus of scenario.stimuli) {
    if (scenario.profile === sequentialMultiInstanceProfile) {
      verifySequentialMultiInstanceStimulus(stimulus);
    }
    if (scenario.profile === parallelMultiInstanceProfile) {
      verifyParallelMultiInstanceStimulus(stimulus);
    }
    for (const patch of variablePatches(stimulus)) {
      for (const binding of patch.bindings) {
        if (binding === null || typeof binding !== "object") continue;
        const value = (binding as { readonly value?: unknown }).value;
        if (
          patch.surface === "payload" &&
          (value === null || typeof value !== "object")
        ) {
          throw new TypeError("Message payload must be a tagged value");
        }
        if (value !== null && typeof value === "object") {
          const tagged = value as {
            readonly kind?: unknown;
            readonly value?: unknown;
          };
          verifyProfileValue(scenario.profile, patch.surface, tagged);
          requireByteCeiling(tagged, 16_384, "tagged value");
        }
        requireByteCeiling(binding, 20_480, "binding");
      }
      requireByteCeiling(patch.bindings, 65_536, "patch");
      if (patch.surface === "payload") {
        requireByteCeiling(stimulus, 65_536, "stimulus");
      }
    }
  }
}

function verifyParallelMultiInstanceStimulus(
  stimulus: Readonly<Record<string, unknown>>,
): void {
  switch (stimulus.kind) {
    case "start": {
      const bindings = stimulus.variables;
      if (!Array.isArray(bindings) || bindings.length !== 2) {
        throw new TypeError(
          "parallel Multi-Instance Process start requires exactly the input collection and completion policy bindings",
        );
      }
      requireExactBinding(
        [bindings[0]],
        "DataObjectReference_InputItems",
        "stringList",
        "parallel Multi-Instance Process start requires DataObjectReference_InputItems first",
      );
      requireExactBinding(
        [bindings[1]],
        "completionPolicy",
        "string",
        "parallel Multi-Instance Process start requires completionPolicy second",
      );
      const policy = bindings[1] as {
        readonly value?: { readonly value?: unknown };
      };
      if (policy.value?.value !== "all" && policy.value?.value !== "first") {
        throw new TypeError(
          "parallel Multi-Instance completionPolicy must be all or first",
        );
      }
      return;
    }
    case "command": {
      const completion = userTaskCompletion(stimulus);
      if (completion === undefined) return;
      if (completion.elementId === "UserTask_Review") {
        requireExactBinding(
          completion.values,
          "DataOutput_CurrentResult",
          "string",
          "parallel Multi-Instance review completion requires exactly one DataOutput_CurrentResult string binding",
        );
      } else if (
        !Array.isArray(completion.values) ||
        completion.values.length !== 0
      ) {
        throw new TypeError(
          "parallel Multi-Instance non-review User Task completion requires an empty patch",
        );
      }
      return;
    }
    case "effectResult": {
      const outputs = effectOutputs(stimulus);
      if (outputs === undefined) return;
      if (!Array.isArray(outputs) || outputs.length !== 0) {
        throw new TypeError(
          "parallel Multi-Instance effect completion requires an empty patch",
        );
      }
      return;
    }
    default:
      return;
  }
}

function verifySequentialMultiInstanceStimulus(
  stimulus: Readonly<Record<string, unknown>>,
): void {
  switch (stimulus.kind) {
    case "start":
      requireExactBinding(
        stimulus.variables,
        "DataObjectReference_InputItems",
        "stringList",
        "sequential Multi-Instance Process start requires exactly one DataObjectReference_InputItems stringList binding",
      );
      return;
    case "command": {
      const completion = userTaskCompletion(stimulus);
      if (completion === undefined) return;
      if (completion.elementId === "UserTask_Review") {
        requireExactBinding(
          completion.values,
          "DataOutput_CurrentResult",
          "string",
          "sequential Multi-Instance review completion requires exactly one DataOutput_CurrentResult string binding",
        );
      } else if (
        !Array.isArray(completion.values) ||
        completion.values.length !== 0
      ) {
        throw new TypeError(
          "sequential Multi-Instance non-review User Task completion requires an empty patch",
        );
      }
      return;
    }
    case "effectResult": {
      const outputs = effectOutputs(stimulus);
      if (outputs === undefined) return;
      if (!Array.isArray(outputs) || outputs.length !== 0) {
        throw new TypeError(
          "sequential Multi-Instance effect completion requires an empty patch",
        );
      }
      return;
    }
    default:
      return;
  }
}

function requireExactBinding(
  candidate: unknown,
  expectedName: string,
  expectedKind: string,
  message: string,
): void {
  if (!Array.isArray(candidate) || candidate.length !== 1) {
    throw new TypeError(message);
  }
  const binding = candidate[0];
  if (binding === null || typeof binding !== "object") {
    throw new TypeError(message);
  }
  const record = binding as {
    readonly name?: unknown;
    readonly value?: unknown;
  };
  const value = record.value;
  if (
    record.name !== expectedName ||
    value === null ||
    typeof value !== "object" ||
    (value as { readonly kind?: unknown }).kind !== expectedKind
  ) {
    throw new TypeError(message);
  }
}

function verifyProfileValue(
  profile: string,
  surface: "start" | "completion" | "effect" | "payload",
  tagged: Readonly<{ kind?: unknown; value?: unknown }>,
): void {
  if (surface === "payload") {
    verifyMessagePayloadValue(profile, tagged);
    return;
  }
  const portableHandoffSurface = (profile === portableHandoffProfile && (surface === "start" || surface === "completion")) ||
    (profile === portableEffectDataProfile && surface === "effect") || profile === nestedScopeDataProfile;
  const boundedRootString = portableHandoffSurface || (profile === portableEffectDataProfile && surface === "start");
  switch (tagged.kind) {
    case "integer":
      if (portableHandoffSurface) return;
      if (
        profile !== structuredHumanWorkProfile ||
        surface !== "completion"
      ) {
        throw new TypeError(
          "integer is only admitted for structured Human Work completion or the portable handoff",
        );
      }
      verifyStructuredValue(tagged);
      return;
    case "string":
      if (boundedRootString && typeof tagged.value === "string" &&
          Buffer.byteLength(tagged.value, "utf8") > portableHandoffRootStringBytes) {
        throw new TypeError(`portable handoff String exceeds ${portableHandoffRootStringBytes} UTF-8 bytes`);
      }
      return;
    case "stringList":
      if (
        profile === structuredHumanWorkProfile &&
        surface === "completion"
      ) {
        verifyStructuredValue(tagged);
        return;
      }
      if (
        (profile === sequentialMultiInstanceProfile ||
          profile === parallelMultiInstanceProfile) &&
        surface === "start"
      ) {
        verifySequentialMultiInstanceInput(tagged);
        return;
      }
      throw new TypeError(
        "stringList is only admitted for structured Human Work completion or Multi-Instance Process start",
      );
    case "decimal":
    case "map":
      // The recursive portable arms are well-formed wire values; only the serial handoff and effect-data profiles select them.
      if (portableHandoffSurface) return;
      throw new TypeError(
        `${tagged.kind} values are admitted by no registered scenario profile`,
      );
    case "list":
      // A root List is never a SingletonBusinessItem, so no registered profile admits it as a scenario value.
      throw new TypeError(
        `${tagged.kind} values are admitted by no registered scenario profile`,
      );
    default:
      return;
  }
}

function verifyMessagePayloadValue(
  profile: string,
  tagged: Readonly<{ kind?: unknown; value?: unknown }>,
): void {
  if (profile === portableMessagePayloadProfile) {
    verifySingletonBusinessPayload(tagged);
    return;
  }
  if (profile !== messagePayloadCatchProfile) {
    throw new TypeError(
      "payload-bearing Message delivery is only admitted for the Message payload catch profile or the structured Message payload profile",
    );
  }
  switch (tagged.kind) {
    case "boolean":
      if (typeof tagged.value !== "boolean") {
        throw new TypeError("Boolean Message payload must carry a Boolean value");
      }
      return;
    case "integer":
      if (
        Object.is(tagged.value, -0) ||
        !Number.isSafeInteger(tagged.value) ||
        Number(tagged.value) < 0
      ) {
        throw new TypeError(
          "Integer Message payload must be a non-negative safe integer",
        );
      }
      return;
    case "string":
      if (typeof tagged.value !== "string") {
        throw new TypeError("String Message payload must carry a String value");
      }
      requireUnicodeScalarString(tagged.value, "String Message payload");
      return;
    case "null":
      if (Object.hasOwn(tagged, "value")) {
        throw new TypeError("Null Message payload carries no value field");
      }
      return;
    default:
      throw new TypeError(
        "Message payload catch admits only Boolean, Integer, String, and Null payloads",
      );
  }
}

/**
 * The structured Message-payload profile selects a SingletonBusinessItem: the portable arms are well-formed wire values,
 * so only the root String bound needs a check here, and a root List stays outside every registered scenario's domain.
 */
function verifySingletonBusinessPayload(
  tagged: Readonly<{ kind?: unknown; value?: unknown }>,
): void {
  switch (tagged.kind) {
    case "string":
      if (typeof tagged.value === "string" &&
          Buffer.byteLength(tagged.value, "utf8") > portableHandoffRootStringBytes) {
        throw new TypeError(`structured Message payload String exceeds ${portableHandoffRootStringBytes} UTF-8 bytes`);
      }
      return;
    case "null":
    case "boolean":
    case "integer":
    case "decimal":
    case "map":
      return;
    default:
      throw new TypeError(
        "structured Message payload admits only String, Null, Boolean, Integer, Decimal, and Map payloads",
      );
  }
}

function verifySequentialMultiInstanceInput(
  tagged: Readonly<{ kind?: unknown; value?: unknown }>,
): void {
  if (!Array.isArray(tagged.value) || tagged.value.length > 16) {
    throw new TypeError(
      "sequential Multi-Instance stringList has at most 16 members",
    );
  }
  for (const member of tagged.value) {
    if (typeof member !== "string") {
      throw new TypeError(
        "sequential Multi-Instance stringList members must be strings",
      );
    }
    requireUnicodeScalarString(
      member,
      "sequential Multi-Instance stringList member",
    );
    if (Buffer.byteLength(member, "utf8") > 512) {
      throw new TypeError(
        "sequential Multi-Instance stringList member exceeds 512 UTF-8 bytes",
      );
    }
  }
  requireByteCeiling(
    tagged.value,
    8_192,
    "sequential Multi-Instance canonical stringList",
  );
}

type VariablePatch = Readonly<{
  surface: "start" | "completion" | "effect" | "payload";
  bindings: ReadonlyArray<unknown>;
}>;

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function asBindings(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

/** The User Task completion a `command` stimulus carries: its task element and submitted values. */
function userTaskCompletion(
  stimulus: Readonly<Record<string, unknown>>,
): Readonly<{ elementId: unknown; values: unknown }> | undefined {
  const action = asRecord(stimulus.action);
  if (action?.kind !== "completeUserTask") return undefined;
  return { elementId: asRecord(stimulus.occurrence)?.elementId, values: action.values };
}

/** The output patch an `effectResult` that returns outputs carries; a technical failure carries none. */
function effectOutputs(
  stimulus: Readonly<Record<string, unknown>>,
): unknown {
  const outcome = asRecord(stimulus.outcome);
  return outcome?.kind === "success" || outcome?.kind === "businessFailure"
    ? outcome.outputs
    : undefined;
}

// A command patch (`setVariables`) shares the completion surface: it is a submitted write no registered profile
// admits the structured or portable kinds on, which is the refusal that surface already carries. A signal start's
// variables share the start surface for the same reason. CIB cases are not widened by either.
function variablePatches(
  stimulus: Readonly<Record<string, unknown>>,
): ReadonlyArray<VariablePatch> {
  switch (stimulus.kind) {
    case "start": {
      const trigger = asRecord(stimulus.trigger);
      const patches: Array<VariablePatch> = [
        { surface: "start", bindings: asBindings(stimulus.variables) },
      ];
      if (trigger?.kind === "signal") {
        patches.push({ surface: "start", bindings: asBindings(trigger.variables) });
      }
      if (trigger?.kind === "message" && trigger.payload !== undefined) {
        patches.push({ surface: "payload", bindings: [{ value: trigger.payload }] });
      }
      return patches;
    }
    case "command": {
      const action = asRecord(stimulus.action);
      return action?.kind === "completeUserTask" || action?.kind === "setVariables"
        ? [{ surface: "completion", bindings: asBindings(action.values) }]
        : [];
    }
    case "deliver":
      return stimulus.payload === undefined
        ? []
        : [{ surface: "payload", bindings: [{ value: stimulus.payload }] }];
    case "effectResult": {
      const outputs = effectOutputs(stimulus);
      return outputs === undefined
        ? []
        : [{ surface: "effect", bindings: asBindings(outputs) }];
    }
    default:
      return [];
  }
}

function verifyStructuredValue(
  tagged: Readonly<{ kind?: unknown; value?: unknown }>,
): void {
  if (tagged.kind === "integer") {
    if (Object.is(tagged.value, -0)) {
      throw new TypeError("integer rejects negative zero");
    }
    if (!Number.isSafeInteger(tagged.value) || Number(tagged.value) < 0) {
      throw new TypeError("integer must be a non-negative safe integer");
    }
    return;
  }
  if (!Array.isArray(tagged.value) || tagged.value.length > 32) {
    throw new TypeError("stringList has at most 32 members");
  }
  for (const member of tagged.value) {
    if (typeof member !== "string") {
      throw new TypeError("stringList members must be strings");
    }
    requireUnicodeScalarString(member, "stringList member");
    if (Buffer.byteLength(member, "utf8") > 1_024) {
      throw new TypeError("stringList member exceeds 1024 UTF-8 bytes");
    }
  }
}

function requireByteCeiling(
  value: unknown,
  maximum: number,
  label: string,
): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maximum) {
    throw new TypeError(`${label} exceeds ${maximum} UTF-8 bytes`);
  }
}
