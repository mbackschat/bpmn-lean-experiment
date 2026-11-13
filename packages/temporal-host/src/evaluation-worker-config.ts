/**
 * The evaluation Worker's configuration: its container environment, read once and checked completely before anything
 * connects. The business handlers it serves are `BPMN_WORKER_EFFECTS_JSON`, decoded by `configured-effects.ts`.
 */
import { parseConfiguredEffects, type ConfiguredEffect } from "./configured-effects.js";

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
