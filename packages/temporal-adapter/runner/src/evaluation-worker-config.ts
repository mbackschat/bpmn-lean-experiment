import type { ExternalTemporalRuntimeOptions } from "@bpmn-lean/temporal-worker";

export type EvaluationWorkerConfig = Readonly<{
  temporal: ExternalTemporalRuntimeOptions;
  healthPort: number;
}>;

const healthPortMaximum = 65_535;

/** Reads the evaluation container contract once and returns an immutable value snapshot. */
export function loadEvaluationWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): EvaluationWorkerConfig {
  return Object.freeze({
    temporal: Object.freeze({
      address: readRequired(environment, "BPMN_TEMPORAL_ADDRESS"),
      namespace: readRequired(environment, "BPMN_TEMPORAL_NAMESPACE"),
      taskQueue: readRequired(environment, "BPMN_TEMPORAL_TASK_QUEUE"),
      identity: readRequired(environment, "BPMN_WORKER_IDENTITY"),
    }),
    healthPort: readHealthPort(environment),
  });
}

function readRequired(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name];
  if (
    value === undefined ||
    value.length === 0 ||
    value.trim() !== value ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${name} must be an exact well-formed nonempty string`);
  }
  return value;
}

function readHealthPort(environment: NodeJS.ProcessEnv): number {
  const encoded = environment.BPMN_WORKER_HEALTH_PORT;
  if (encoded === undefined || !/^[1-9][0-9]*$/u.test(encoded)) {
    throw new RangeError(
      "BPMN_WORKER_HEALTH_PORT must be a decimal TCP port from 1 through 65535",
    );
  }
  const port = Number(encoded);
  if (!Number.isSafeInteger(port) || port > healthPortMaximum) {
    throw new RangeError(
      "BPMN_WORKER_HEALTH_PORT must be a decimal TCP port from 1 through 65535",
    );
  }
  return port;
}
