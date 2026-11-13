/**
 * The evaluation Worker's configuration: its container environment, read once and checked completely before anything
 * connects, and the business handlers `BPMN_WORKER_EFFECTS_JSON` declares.
 *
 * A handler is bound by the effect descriptor `(protocol, operation)` its source binding resolved to, never by a model,
 * element or Process identity, so a second model that binds the same operation is served by the same configuration and
 * an undeclared descriptor is refused rather than answered by another handler. The wire form is the `effectHandlers`
 * list of the neutral runnable-MVP configurations (`examples/temporal-mvp`), plus the optional `technicalFailures`.
 */
import type { EffectHandler } from "./activities.js";
import { EffectResultKind, type Binding, type EffectResult } from "./port.js";

export enum ConfiguredResultKind {
  Success = "success",
  BpmnError = "bpmnError",
  TechnicalFailure = "technicalFailure",
}

export type ConfiguredResult =
  | { readonly kind: ConfiguredResultKind.Success; readonly localPatch: readonly Binding[] }
  | {
      readonly kind: ConfiguredResultKind.BpmnError;
      readonly code: string;
      readonly message: string | null;
      readonly localPatch: readonly Binding[];
    }
  | { readonly kind: ConfiguredResultKind.TechnicalFailure };

export interface ConfiguredEffect {
  readonly protocol: string;
  readonly operation: string;
  /**
   * How many incidents one occurrence of this effect reports before `result`. The kernel counts a failure in the
   * request (`EffectRequest.failures`), so the count survives a Worker restart and a transport retry, which a
   * process-local memory of earlier invocations would not.
   */
  readonly technicalFailures: number;
  readonly result: ConfiguredResult;
}

export interface EvaluationWorkerConfig {
  readonly address: string;
  readonly namespace: string;
  readonly taskQueue: string;
  readonly identity: string;
  readonly healthPort: number;
  /** The bound on one Script Task's evaluation, after which it is the effect's technical failure. */
  readonly scriptTimeoutMs: number;
  readonly effects: readonly ConfiguredEffect[];
}

const variables = {
  address: "BPMN_TEMPORAL_ADDRESS",
  namespace: "BPMN_TEMPORAL_NAMESPACE",
  taskQueue: "BPMN_TEMPORAL_TASK_QUEUE",
  identity: "BPMN_WORKER_IDENTITY",
  healthPort: "BPMN_WORKER_HEALTH_PORT",
  scriptTimeoutMs: "BPMN_WORKER_SCRIPT_TIMEOUT_MS",
  effects: "BPMN_WORKER_EFFECTS_JSON",
} as const;

/** The largest timeout `vm` and the timers accept, a signed 32-bit millisecond count. */
const maximumTimeoutMs = 2 ** 31 - 1;

const knownVariables: ReadonlySet<string> = new Set(Object.values(variables));

/** The namespaces of this Worker's variables: a name inside one that is not declared above is a misspelling. */
const ownedPrefix = /^BPMN_(?:TEMPORAL|WORKER)_/u;

/**
 * Reads the container contract. Every variable is required, and a variable of the Worker's own namespaces that this
 * contract does not declare is refused, so a misspelled name fails here instead of silently leaving a bound unset.
 */
export function loadEvaluationWorkerConfig(environment: NodeJS.ProcessEnv): EvaluationWorkerConfig {
  for (const name of Object.keys(environment).sort()) {
    if (ownedPrefix.test(name) && !knownVariables.has(name)) throw new TypeError(`${name} is not a configuration variable of the evaluation Worker`);
  }
  return Object.freeze({
    address: readText(environment, variables.address),
    namespace: readText(environment, variables.namespace),
    taskQueue: readText(environment, variables.taskQueue),
    identity: readText(environment, variables.identity),
    healthPort: readInteger(environment, variables.healthPort, 65_535),
    scriptTimeoutMs: readInteger(environment, variables.scriptTimeoutMs, maximumTimeoutMs),
    effects: parseConfiguredEffects(readText(environment, variables.effects), variables.effects),
  });
}

function readText(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0 || value.trim() !== value || !value.isWellFormed()) {
    throw new TypeError(`${name} must be an exact well-formed nonempty string`);
  }
  return value;
}

function readInteger(environment: NodeJS.ProcessEnv, name: string, maximum: number): number {
  const encoded = environment[name];
  if (encoded === undefined || !/^[1-9][0-9]*$/u.test(encoded) || !Number.isSafeInteger(Number(encoded)) || Number(encoded) > maximum) {
    throw new RangeError(`${name} must be a positive decimal integer of at most ${String(maximum)}`);
  }
  return Number(encoded);
}

/** The handlers `text` declares; any deviation from the wire form, an unknown field included, refuses all of them. */
export function parseConfiguredEffects(text: string, label: string): readonly ConfiguredEffect[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError(`${label} must be valid JSON`);
  }
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array of effect handlers`);
  const effects = value.map((entry: unknown, index) => parseEffect(entry, `${label}[${String(index)}]`));
  const descriptors = new Set<string>();
  for (const effect of effects) {
    const key = descriptorKey(effect.protocol, effect.operation);
    if (descriptors.has(key)) throw new TypeError(`${label} declares ${key} twice`);
    descriptors.add(key);
  }
  return effects;
}

function parseEffect(entry: unknown, label: string): ConfiguredEffect {
  const record = exactRecord(entry, ["protocol", "operation", "result"], ["technicalFailures"], label);
  const technicalFailures = record["technicalFailures"] ?? 0;
  if (typeof technicalFailures !== "number" || !Number.isSafeInteger(technicalFailures) || technicalFailures < 0) {
    throw new RangeError(`${label}.technicalFailures must be a nonnegative safe integer`);
  }
  return {
    protocol: requireName(record["protocol"], `${label}.protocol`),
    operation: requireName(record["operation"], `${label}.operation`),
    technicalFailures,
    result: parseResult(record["result"], `${label}.result`),
  };
}

function parseResult(value: unknown, label: string): ConfiguredResult {
  const kind = (value as { kind?: unknown } | null)?.kind;
  switch (kind) {
    case ConfiguredResultKind.Success: {
      const record = exactRecord(value, ["kind", "localPatch"], [], label);
      return { kind, localPatch: parseBindings(record["localPatch"], `${label}.localPatch`) };
    }
    case ConfiguredResultKind.BpmnError: {
      const record = exactRecord(value, ["kind", "code", "message", "localPatch"], [], label);
      const message = record["message"];
      if (message !== null && (typeof message !== "string" || !message.isWellFormed())) {
        throw new TypeError(`${label}.message must be a well-formed string or null`);
      }
      return { kind, code: requireName(record["code"], `${label}.code`), message, localPatch: parseBindings(record["localPatch"], `${label}.localPatch`) };
    }
    case ConfiguredResultKind.TechnicalFailure:
      exactRecord(value, ["kind"], [], label);
      return { kind };
    default:
      throw new TypeError(`${label}.kind must be one of ${JSON.stringify(Object.values(ConfiguredResultKind))}`);
  }
}

/** A binding names its variable and carries the typed value in the scenario contract's form; the kernel checks the value itself. */
function parseBindings(value: unknown, label: string): readonly Binding[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const bindings = value.map((entry: unknown, index): Binding => {
    const entryLabel = `${label}[${String(index)}]`;
    const record = exactRecord(entry, ["name", "value"], [], entryLabel);
    const typed = record["value"];
    if (typeof typed !== "object" || typed === null || Array.isArray(typed) || typeof (typed as { kind?: unknown }).kind !== "string") {
      throw new TypeError(`${entryLabel}.value must be a typed value naming its kind`);
    }
    return { name: requireName(record["name"], `${entryLabel}.name`), value: typed as Binding["value"] };
  });
  if (new Set(bindings.map((binding) => binding.name)).size !== bindings.length) throw new TypeError(`${label} repeats a name`);
  return bindings;
}

/** `value` as an object with every `required` member and at most the `optional` ones besides. */
function exactRecord(value: unknown, required: readonly string[], optional: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const missing = required.filter((key) => !keys.includes(key));
  const unknown = keys.filter((key) => !required.includes(key) && !optional.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    throw new TypeError(`${label} must have the fields ${JSON.stringify(required)} and at most ${JSON.stringify(optional)}`);
  }
  return record;
}

function requireName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be a nonempty well-formed string`);
  }
  return value;
}

/** Protocol and operation are URNs and may contain any delimiter, so the key is the JSON encoding of the exact pair. */
function descriptorKey(protocol: string, operation: string): string {
  return JSON.stringify([protocol, operation]);
}

/**
 * The effect handler that answers each declared descriptor with its configured result. An undeclared descriptor throws,
 * which is a transport failure Temporal retries, so the Process stays open at its effect instead of committing a result
 * no configuration declared.
 */
export function configuredEffectHandler(effects: readonly ConfiguredEffect[]): EffectHandler {
  const declared = new Map(effects.map((effect) => [descriptorKey(effect.protocol, effect.operation), effect]));
  return async (request) => {
    const effect = declared.get(descriptorKey(request.protocol, request.operation));
    if (effect === undefined) throw new Error(`no effect handler is configured for ${request.protocol}/${request.operation}`);
    if (request.failures < effect.technicalFailures) return { kind: EffectResultKind.TechnicalFailure };
    return effectResult(effect.result);
  };
}

function effectResult(result: ConfiguredResult): EffectResult {
  switch (result.kind) {
    case ConfiguredResultKind.Success:
      return { kind: EffectResultKind.Success, outputs: result.localPatch };
    case ConfiguredResultKind.BpmnError:
      return { kind: EffectResultKind.BusinessFailure, code: result.code, message: result.message, outputs: result.localPatch };
    case ConfiguredResultKind.TechnicalFailure:
      return { kind: EffectResultKind.TechnicalFailure };
  }
}
