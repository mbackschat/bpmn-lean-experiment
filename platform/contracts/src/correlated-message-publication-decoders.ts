import { decodeDeployedDefinitionVersion } from "./deployed-definition-decoder.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import {
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
} from "./correlated-message-publications.js";
import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessagePublication,
  DefinitionCorrelatedMessageResolution,
  PublicCorrelatedMessageCapability,
  PutDefinitionCorrelatedMessagePublicationRequest,
} from "./correlated-message-publications.js";
import { decodePublicOperationMessageChannel } from "./deployed-definition-decoder.js";

/** Decodes one closed definition-scoped correlated Message capability. */
export function decodePublicCorrelatedMessageCapability(
  value: unknown,
  label = "correlated Message capability",
): PublicCorrelatedMessageCapability {
  requireObject(value, label);
  requireExactKeys(value, label, ["catchEventId", "channel", "correlationKeyId"]);
  return {
    catchEventId: requireNonemptyString(
      readOwn(value, "catchEventId"),
      `${label}.catchEventId`,
    ),
    channel: decodePublicOperationMessageChannel(
      readOwn(value, "channel"),
      `${label}.channel`,
    ),
    correlationKeyId: requireNonemptyString(
      readOwn(value, "correlationKeyId"),
      `${label}.correlationKeyId`,
    ),
  };
}

/** Decodes all target-free Message capabilities for one exact definition version. */
export function decodeDefinitionCorrelatedMessageCapabilities(
  value: unknown,
): DefinitionCorrelatedMessageCapabilities {
  requireObject(value, "correlated Message capabilities");
  requireExactKeys(value, "correlated Message capabilities", ["definition", "messages"]);
  const messagesValue = readOwn(value, "messages");
  if (!Array.isArray(messagesValue)) {
    throw new TypeError("messages must be an array");
  }
  const messages = Array.from(messagesValue, (message, index) =>
    decodePublicCorrelatedMessageCapability(
      message,
      `messages[${index}] correlated Message capability`,
    )
  );
  const seenCatchEventIds = new Set<string>();
  for (const message of messages) {
    if (seenCatchEventIds.has(message.catchEventId)) {
      throw new TypeError("messages must not repeat catchEventId");
    }
    seenCatchEventIds.add(message.catchEventId);
  }
  return {
    definition: decodeDeployedDefinitionVersion(
      readOwn(value, "definition"),
      "definition",
    ),
    messages,
  };
}

/** Decodes the bounded target-free correlated Message publication request. */
export function decodePutDefinitionCorrelatedMessagePublicationRequest(
  value: unknown,
): PutDefinitionCorrelatedMessagePublicationRequest {
  requireObject(value, "correlated Message publication request");
  requireExactKeys(value, "correlated Message publication request", ["payload"]);
  const payload = readOwn(value, "payload");
  requireObject(payload, "payload");
  requireExactKeys(payload, "payload", ["kind", "value"]);
  const kind = readOwn(payload, "kind");
  if (kind !== "string") {
    throw new TypeError("payload.kind must be string");
  }
  return {
    payload: {
      kind,
      value: requireNonemptyString(readOwn(payload, "value"), "payload.value"),
    },
  };
}

/** Decodes one closed correlated Message resolution and its public context. */
export function decodeDefinitionCorrelatedMessagePublication(
  value: unknown,
): DefinitionCorrelatedMessagePublication {
  requireObject(value, "correlated Message publication");
  requireExactKeys(value, "correlated Message publication", [
    "correlatedMessage",
    "definition",
    "resolution",
  ]);
  return {
    definition: decodeDeployedDefinitionVersion(
      readOwn(value, "definition"),
      "definition",
    ),
    correlatedMessage: decodePublicCorrelatedMessageCapability(
      readOwn(value, "correlatedMessage"),
    ),
    resolution: decodeResolution(readOwn(value, "resolution")),
  };
}

function decodeResolution(value: unknown): DefinitionCorrelatedMessageResolution {
  requireObject(value, "correlated Message resolution");
  switch (readOwn(value, "kind")) {
    case DefinitionCorrelatedMessageResolutionKind.Semantic:
      return decodeSemanticResolution(value);
    case DefinitionCorrelatedMessageResolutionKind.Capacity:
      return decodePublicationCapacityResolution(value);
    case DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate:
      return decodeInfrastructureResolution(value);
    default:
      throw new TypeError("correlated Message resolution.kind is not public");
  }
}

function decodeSemanticResolution(
  value: object,
): Extract<DefinitionCorrelatedMessageResolution, { kind: "semantic" }> {
  requireExactKeys(value, "semantic resolution", [
    "commandId",
    "ingressOrdinal",
    "kind",
    "outcome",
  ]);
  return {
    kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
    commandId: requireNonemptyString(readOwn(value, "commandId"), "commandId"),
    ingressOrdinal: requirePositiveSafeInteger(
      readOwn(value, "ingressOrdinal"),
      "ingressOrdinal",
    ),
    outcome: decodeSemanticOutcome(readOwn(value, "outcome")),
  };
}

function decodeSemanticOutcome(
  value: unknown,
): Extract<DefinitionCorrelatedMessageResolution, { kind: "semantic" }>["outcome"] {
  requireObject(value, "semantic outcome");
  const kind = readOwn(value, "kind");
  switch (kind) {
    case DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch:
    case DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous: {
      requireExactKeys(value, `${kind} outcome`, ["kind"]);
      return { kind };
    }
    case DefinitionCorrelatedMessageSemanticOutcomeKind.Committed: {
      requireExactKeys(value, "committed outcome", ["kind", "target"]);
      const target = readOwn(value, "target");
      requireObject(target, "committed target");
      requireExactKeys(target, "committed target", ["processInstanceId"]);
      return {
        kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
        target: {
          processInstanceId: requireNonemptyString(
            readOwn(target, "processInstanceId"),
            "committed target.processInstanceId",
          ),
        },
      };
    }
    default:
      throw new TypeError("semantic outcome.kind is not public");
  }
}

function decodePublicationCapacityResolution(
  value: object,
): Extract<DefinitionCorrelatedMessageResolution, { kind: "capacity" }> {
  requireExactKeys(value, "capacity resolution", [
    "commandId",
    "failure",
    "ingressOrdinal",
    "kind",
  ]);
  if (readOwn(value, "ingressOrdinal") !== null) {
    throw new TypeError("capacity resolution.ingressOrdinal must be null");
  }
  const failure = readOwn(value, "failure");
  requireObject(failure, "capacity failure");
  requireExactKeys(failure, "capacity failure", [
    "configuredBound",
    "kind",
    "measure",
    "observedValue",
  ]);
  const kind = readOwn(failure, "kind");
  if (kind !== "publicationQueue" && kind !== "publicationLedger") {
    throw new TypeError("capacity failure.kind is not public");
  }
  const measure = readOwn(failure, "measure");
  if (measure !== "count" && measure !== "canonicalBytes") {
    throw new TypeError("capacity failure.measure is not public");
  }
  return {
    kind: DefinitionCorrelatedMessageResolutionKind.Capacity,
    commandId: requireNonemptyString(readOwn(value, "commandId"), "commandId"),
    ingressOrdinal: null,
    failure: {
      kind,
      measure,
      configuredBound: requirePositiveSafeInteger(
        readOwn(failure, "configuredBound"),
        "capacity failure.configuredBound",
      ),
      observedValue: requireNonnegativeSafeInteger(
        readOwn(failure, "observedValue"),
        "capacity failure.observedValue",
      ),
    },
  };
}

function decodeInfrastructureResolution(
  value: object,
): Extract<
  DefinitionCorrelatedMessageResolution,
  { kind: "infrastructureIndeterminate" }
> {
  requireExactKeys(value, "infrastructure resolution", [
    "commandId",
    "failure",
    "ingressOrdinal",
    "kind",
    "phase",
    "target",
  ]);
  const commandId = requireNonemptyString(readOwn(value, "commandId"), "commandId");
  const ingressOrdinal = decodeNullablePositiveSafeInteger(
    readOwn(value, "ingressOrdinal"),
    "ingressOrdinal",
  );
  const phase = decodeInfrastructurePhase(readOwn(value, "phase"));
  const target = readOwn(value, "target");
  const failure = readOwn(value, "failure");
  requireObject(failure, "infrastructure failure");
  const failureKind = readOwn(failure, "kind");
  if (failureKind === "targetInconsistent") {
    requireExactKeys(failure, "targetInconsistent failure", ["kind"]);
    if (phase !== "targetDelivery") {
      throw new TypeError("targetInconsistent requires targetDelivery phase");
    }
    requireObject(target, "targetInconsistent target");
    requireExactKeys(target, "targetInconsistent target", ["processInstanceId"]);
    return {
      kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
      commandId,
      ingressOrdinal,
      phase,
      target: {
        processInstanceId: requireNonemptyString(
          readOwn(target, "processInstanceId"),
          "targetInconsistent target.processInstanceId",
        ),
      },
      failure: { kind: failureKind },
    };
  }
  if (target !== null) {
    throw new TypeError("non-target infrastructure resolution.target must be null");
  }
  return {
    kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
    commandId,
    ingressOrdinal,
    phase,
    target: null,
    failure: decodeUntargetedInfrastructureFailure(failure, failureKind),
  };
}

function decodeUntargetedInfrastructureFailure(
  failure: object,
  kind: unknown,
): Extract<
  DefinitionCorrelatedMessageResolution,
  { kind: "infrastructureIndeterminate"; target: null }
>["failure"] {
  switch (kind) {
    case "unconfirmed":
      requireExactKeys(failure, "unconfirmed failure", ["kind"]);
      return { kind };
    case "capacity": {
      requireExactKeys(failure, "infrastructure capacity failure", [
        "boundary",
        "configuredBound",
        "kind",
        "observedValue",
      ]);
      const boundary = readOwn(failure, "boundary");
      if (
        boundary !== "activityRequest" &&
        boundary !== "activityResult" &&
        boundary !== "queryResponse" &&
        boundary !== "continuation"
      ) {
        throw new TypeError("infrastructure capacity failure.boundary is not public");
      }
      return {
        kind,
        boundary,
        configuredBound: requirePositiveSafeInteger(
          readOwn(failure, "configuredBound"),
          "infrastructure capacity failure.configuredBound",
        ),
        observedValue: requireNonnegativeSafeInteger(
          readOwn(failure, "observedValue"),
          "infrastructure capacity failure.observedValue",
        ),
      };
    }
    case "runCapacity":
      requireExactKeys(failure, "run capacity failure", [
        "configuredBound",
        "kind",
        "observedValue",
      ]);
      return {
        kind,
        configuredBound: requirePositiveSafeInteger(
          readOwn(failure, "configuredBound"),
          "run capacity failure.configuredBound",
        ),
        observedValue: requireNonnegativeSafeInteger(
          readOwn(failure, "observedValue"),
          "run capacity failure.observedValue",
        ),
      };
    default:
      throw new TypeError("infrastructure failure.kind is not public");
  }
}

function decodeInfrastructurePhase(
  value: unknown,
): Extract<
  DefinitionCorrelatedMessageResolution,
  { kind: "infrastructureIndeterminate" }
>["phase"] {
  switch (value) {
    case "ingressResolution":
    case "candidateFanout":
    case "targetDelivery":
    case "resultRecovery":
      return value;
    default:
      throw new TypeError("infrastructure resolution.phase is not public");
  }
}

function decodeNullablePositiveSafeInteger(
  value: unknown,
  label: string,
): number | null {
  return value === null ? null : requirePositiveSafeInteger(value, label);
}
