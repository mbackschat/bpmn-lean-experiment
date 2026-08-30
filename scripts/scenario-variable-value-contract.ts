import { requireUnicodeScalarString } from "./strict-json.ts";

const structuredHumanWorkProfile =
  "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
const sequentialMultiInstanceProfile =
  "bpmn-2.0.2-sequential-multi-instance-user-task-draft";
const parallelMultiInstanceProfile =
  "bpmn-2.0.2-parallel-multi-instance-user-task-draft";
const messagePayloadCatchProfile =
  "bpmn-2.0.2-message-payload-catch-draft";

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
    const patch = variablePatch(stimulus);
    if (patch === undefined) continue;
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

function verifyParallelMultiInstanceStimulus(
  stimulus: Readonly<Record<string, unknown>>,
): void {
  switch (stimulus.kind) {
    case "startProcess": {
      const bindings = stimulus.initialVariables;
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
    case "completeUserTaskInstance": {
      const taskId = stimulus.taskId;
      const elementId = taskId !== null && typeof taskId === "object"
        ? (taskId as { readonly elementId?: unknown }).elementId
        : undefined;
      if (elementId === "UserTask_Review") {
        requireExactBinding(
          stimulus.submittedValues,
          "DataOutput_CurrentResult",
          "string",
          "parallel Multi-Instance review completion requires exactly one DataOutput_CurrentResult string binding",
        );
      } else if (
        !Array.isArray(stimulus.submittedValues) ||
        stimulus.submittedValues.length !== 0
      ) {
        throw new TypeError(
          "parallel Multi-Instance non-review User Task completion requires an empty patch",
        );
      }
      return;
    }
    case "completeEffect": {
      const result = stimulus.result;
      const patch = result !== null && typeof result === "object"
        ? (result as { readonly localPatch?: unknown }).localPatch
        : undefined;
      if (!Array.isArray(patch) || patch.length !== 0) {
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
    case "startProcess":
      requireExactBinding(
        stimulus.initialVariables,
        "DataObjectReference_InputItems",
        "stringList",
        "sequential Multi-Instance Process start requires exactly one DataObjectReference_InputItems stringList binding",
      );
      return;
    case "completeUserTaskInstance": {
      const taskId = stimulus.taskId;
      const elementId = taskId !== null && typeof taskId === "object"
        ? (taskId as { readonly elementId?: unknown }).elementId
        : undefined;
      if (elementId === "UserTask_Review") {
        requireExactBinding(
          stimulus.submittedValues,
          "DataOutput_CurrentResult",
          "string",
          "sequential Multi-Instance review completion requires exactly one DataOutput_CurrentResult string binding",
        );
      } else if (
        !Array.isArray(stimulus.submittedValues) ||
        stimulus.submittedValues.length !== 0
      ) {
        throw new TypeError(
          "sequential Multi-Instance non-review User Task completion requires an empty patch",
        );
      }
      return;
    }
    case "completeEffect": {
      const result = stimulus.result;
      const patch = result !== null && typeof result === "object"
        ? (result as { readonly localPatch?: unknown }).localPatch
        : undefined;
      if (!Array.isArray(patch) || patch.length !== 0) {
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
  switch (tagged.kind) {
    case "integer":
      if (
        profile !== structuredHumanWorkProfile ||
        surface !== "completion"
      ) {
        throw new TypeError(
          "integer is only admitted for structured Human Work completion",
        );
      }
      verifyStructuredValue(tagged);
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
    default:
      return;
  }
}

function verifyMessagePayloadValue(
  profile: string,
  tagged: Readonly<{ kind?: unknown; value?: unknown }>,
): void {
  if (profile !== messagePayloadCatchProfile) {
    throw new TypeError(
      "payload-bearing Message delivery is only admitted for the Message payload catch profile",
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

function variablePatch(stimulus: Readonly<Record<string, unknown>>) {
  switch (stimulus.kind) {
    case "startProcess":
      return {
        surface: "start",
        bindings: stimulus.initialVariables as ReadonlyArray<unknown>,
      } as const;
    case "completeUserTaskInstance":
      return {
        surface: "completion",
        bindings: stimulus.submittedValues as ReadonlyArray<unknown>,
      } as const;
    case "completeEffect":
      return {
        surface: "effect",
        bindings: (stimulus.result as {
          readonly localPatch: ReadonlyArray<unknown>;
        }).localPatch,
      } as const;
    case "deliverPayloadMessage":
      return {
        surface: "payload",
        bindings: [{ value: stimulus.payload }],
      } as const;
    default:
      return undefined;
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
