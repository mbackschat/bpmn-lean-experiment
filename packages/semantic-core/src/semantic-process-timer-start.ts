/** Timer Start admission and initiation after an external timer occurrence has been resolved. */
import type { TriggerTimerStartStimulus } from "./contract.js";
import {
  SemanticOperationKind,
  SemanticOriginKind,
} from "./semantic-process-contract.js";
import type {
  InitiateTimerOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  SemanticProfileId,
  profileAllowsProgramShape,
} from "./semantic-process-profile.js";
import type { RuntimeState } from "./semantic-process-state.js";
import {
  admitTriggeredStartRoot,
  applyTriggeredStartOutputs,
  processStartMatchesProgram,
} from "./semantic-process-triggered-start.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

/** Validates a reusable timer initiation with an exact normalized duration and canonical outputs. */
export function isWellFormedInitiateTimerOperation(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is InitiateTimerOperation {
  const outputs = isRecord(value) && Array.isArray(value.outputs)
    ? value.outputs
    : undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "kind", "origin", "timer", "outputs"]) ||
    value.kind !== SemanticOperationKind.InitiateTimer ||
    !isNonEmptyString(value.id) ||
    !isRecord(value.origin) ||
    !hasOnlyKeys(value.origin, ["kind", "elementId"]) ||
    value.origin.kind !== SemanticOriginKind.BpmnElement ||
    !isNonEmptyString(value.origin.elementId) ||
    !isRecord(value.timer) ||
    !hasOnlyKeys(value.timer, ["durationMs"]) ||
    value.timer.durationMs !== 1000 ||
    outputs === undefined ||
    outputs.length === 0
  ) {
    return false;
  }
  return outputs.every(
    (output, index) =>
      isNonEmptyString(output) &&
      placeIds.has(output) &&
      (index === 0 ||
        compareCanonicalStrings(String(outputs[index - 1]), output) < 0),
  );
}

/** Admits one exact Timer Start occurrence without installing Process timer state. */
export function admitTimerStart(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: TriggerTimerStartStimulus,
): RuntimeState | null {
  const initiations = program.operations.filter(
    (
      operation,
    ): operation is InitiateTimerOperation =>
      operation.kind === SemanticOperationKind.InitiateTimer,
  );
  const initiation = initiations[0];
  if (
    program.identity.semanticProfile !== SemanticProfileId.TimerStart ||
    !profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations,
      program.definitionScopes.length,
    ) ||
    initiations.length !== 1 ||
    initiation === undefined ||
    initiation.timer.durationMs !== 1000 ||
    !processStartMatchesProgram(stimulus, program)
  ) {
    return null;
  }
  return admitTriggeredStartRoot(
    program,
    state,
    stimulus.instanceId,
    initiation.id,
  );
}

/** Produces every Timer Start outgoing token under the admitted root owner exactly once. */
export function applyTimerInitiation(
  operation: InitiateTimerOperation,
  state: RuntimeState,
): RuntimeState | null {
  return applyTriggeredStartOutputs(operation.outputs, state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
}
