/**
 * Kernel runner wire, transcribed from `Kernel/Run/Wire.lean`: reading the runner's JSON inputs, and the occurrence
 * reference both runner modes publish.
 */
import { isObject, type JsonValue } from "../il/codec.js";
import { stimulusFromJson } from "../il/codec/stimulus.js";
import type { Input, OccurrenceRef } from "../state.js";

export type ScenarioStimulus = readonly [string, Input];

/** An already public reference (`host.ts` `publicRef`, `population.ts` `occurrence`): the schema's `occurrenceId`. */
export function referenceJson(ref: OccurrenceRef): JsonValue {
  return { processInstanceId: ref.processInstanceId, elementId: ref.element, activation: ref.activation };
}

/** A present value, or JSON null: the schema's nullable members. */
export function nullable<T>(value: T | null, encode: (value: T) => JsonValue): JsonValue {
  return value === null ? null : encode(value);
}

/** Lean's `Json.getObjVal?`: the key must be present. */
export function field(json: unknown, key: string, where: string): unknown {
  if (!isObject(json) || !Object.hasOwn(json, key)) throw new Error(`${where}: property not found: ${key}`);
  return json[key];
}

/** Lean's `getObjValAs? String`: an absent key reads as `null`, which is no String. */
export function requiredString(json: unknown, key: string, where: string): string {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  if (typeof value !== "string") throw new Error(`${where}: ${key}: String expected`);
  return value;
}

/** Lean's `getObjValAs? (Array Json)`. */
export function arrayField(json: unknown, key: string, where: string): readonly unknown[] {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  if (!Array.isArray(value)) throw new Error(`${where}: expected JSON array`);
  return value;
}

export function stimulusOf(json: unknown, where: string): ScenarioStimulus {
  const decoded = stimulusFromJson(json);
  if (!decoded.ok) throw new Error(`${where}: ${decoded.refusal}`);
  return decoded.value;
}
