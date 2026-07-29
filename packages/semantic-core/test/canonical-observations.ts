/**
 * Positional and observation-kind narrowing for capsule test documents.
 *
 * Capsule tests address specific positions in a scenario document or canonical
 * trace and then read kind-specific fields. These accessors turn a missing
 * position or an unexpected observation kind into an explicit harness failure
 * instead of an obscure property error, without weakening what the test asserts
 * about the value itself.
 */
import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  StateObservation,
} from "@bpmn-lean/semantic-core";

export function requiredAt<Value>(
  values: ReadonlyArray<Value>,
  index: number,
  label: string,
): Value {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`${label} has no entry at index ${index}`);
  }
  return value;
}

export function stateObservationAt(
  observations: ReadonlyArray<CanonicalObservation>,
  index: number,
): StateObservation {
  return requireStateObservation(
    requiredAt(observations, index, "observation trace"),
    `index ${index}`,
  );
}

export function lastStateObservation(
  observations: ReadonlyArray<CanonicalObservation>,
): StateObservation {
  return stateObservationAt(observations, observations.length - 1);
}

function requireStateObservation(
  observation: CanonicalObservation,
  position: string,
): StateObservation {
  if (observation.kind !== CanonicalObservationKind.State) {
    throw new TypeError(
      `observation trace ${position} is ${observation.kind}, not a state observation`,
    );
  }
  return observation;
}
