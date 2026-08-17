const defaults = Object.freeze({
  maxSourceBytes: 1_048_576,
  parserDeadlineMs: 1_000,
  temporalAddress: "127.0.0.1:7233",
  temporalNamespace: "default",
  temporalTaskQueue: "bpmn-semantic",
  temporalConnectTimeoutMs: 5_000,
  postgresqlMaxConnections: 16,
  postgresqlConnectionTimeoutMs: 5_000,
  postgresqlIdleTimeoutMs: 30_000,
  postgresqlQueryTimeoutMs: 5_000,
  postgresqlStatementTimeoutMs: 5_000,
  postgresqlLockTimeoutMs: 2_000,
  postgresqlIdleInTransactionTimeoutMs: 5_000,
  candidateLimit: 1_000,
  batchSize: 100,
  leaseDurationMs: 30_000,
  itemDeadlineMs: 10_000,
  retryDelayMs: 1_000,
  concurrencyPerFamily: 1,
  pollingDelayMs: 250,
  auditBatchSize: 100,
  maxWorkTasksPerProcess: 1_000,
  maxIncidentsPerProcess: 1_000,
});

const limits = Object.freeze({
  safe: Number.MAX_SAFE_INTEGER,
  durationMs: 86_400_000,
  connections: 1_000,
  candidateLimit: 1_000,
  batchSize: 1_000,
  concurrency: 1_000,
  auditBatchSize: 1_000,
  projectionItems: 10_000,
  workerIdBytes: 1_024,
});

export type RecoveryWorkerConfig = Readonly<{
  postgresqlRuntimeUrl: string;
  workerId: string;
  /** Age at which the worker proactively replaces a completed projection generation. */
  projectionRefreshAfterMs: number;
  maxSourceBytes: number;
  parserDeadlineMs: number;
  temporalAddress: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
  temporalConnectTimeoutMs: number;
  postgresqlMaxConnections: number;
  postgresqlConnectionTimeoutMs: number;
  postgresqlIdleTimeoutMs: number;
  postgresqlQueryTimeoutMs: number;
  postgresqlStatementTimeoutMs: number;
  postgresqlLockTimeoutMs: number;
  postgresqlIdleInTransactionTimeoutMs: number;
  candidateLimit: number;
  batchSize: number;
  leaseDurationMs: number;
  itemDeadlineMs: number;
  retryDelayMs: number;
  concurrencyPerFamily: number;
  pollingDelayMs: number;
  auditBatchSize: number;
  maxWorkTasksPerProcess: number;
  maxIncidentsPerProcess: number;
}>;

/**
 * Reads a credential-bearing environment once and returns an immutable value snapshot.
 * Projection refresh age is intentionally distinct from the API's accepted maximum age so
 * deployments can rebuild before readers reach their fail-closed freshness boundary.
 */
export function readRecoveryWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RecoveryWorkerConfig {
  const config: RecoveryWorkerConfig = {
    postgresqlRuntimeUrl: readRequired(environment, "PLATFORM_POSTGRESQL_RUNTIME_URL"),
    workerId: readRequired(environment, "PLATFORM_RECOVERY_WORKER_ID"),
    projectionRefreshAfterMs: readInteger(
      environment,
      "PLATFORM_PROJECTION_REFRESH_AFTER_MS",
      undefined,
      limits.durationMs,
    ),
    maxSourceBytes: readInteger(
      environment,
      "PLATFORM_MAX_SOURCE_BYTES",
      defaults.maxSourceBytes,
      limits.safe,
    ),
    parserDeadlineMs: readInteger(
      environment,
      "PLATFORM_PARSER_DEADLINE_MS",
      defaults.parserDeadlineMs,
      limits.durationMs,
    ),
    temporalAddress: readOptional(
      environment,
      "PLATFORM_TEMPORAL_ADDRESS",
      defaults.temporalAddress,
    ),
    temporalNamespace: readOptional(
      environment,
      "PLATFORM_TEMPORAL_NAMESPACE",
      defaults.temporalNamespace,
    ),
    temporalTaskQueue: readOptional(
      environment,
      "PLATFORM_TEMPORAL_TASK_QUEUE",
      defaults.temporalTaskQueue,
    ),
    temporalConnectTimeoutMs: readInteger(
      environment,
      "PLATFORM_TEMPORAL_CONNECT_TIMEOUT_MS",
      defaults.temporalConnectTimeoutMs,
      limits.durationMs,
    ),
    postgresqlMaxConnections: readInteger(
      environment,
      "PLATFORM_POSTGRESQL_MAX_CONNECTIONS",
      defaults.postgresqlMaxConnections,
      limits.connections,
    ),
    postgresqlConnectionTimeoutMs: readInteger(
      environment,
      "PLATFORM_POSTGRESQL_CONNECTION_TIMEOUT_MS",
      defaults.postgresqlConnectionTimeoutMs,
      limits.durationMs,
    ),
    postgresqlIdleTimeoutMs: readInteger(
      environment,
      "PLATFORM_POSTGRESQL_IDLE_TIMEOUT_MS",
      defaults.postgresqlIdleTimeoutMs,
      limits.durationMs,
    ),
    postgresqlQueryTimeoutMs: readInteger(
      environment,
      "PLATFORM_POSTGRESQL_QUERY_TIMEOUT_MS",
      defaults.postgresqlQueryTimeoutMs,
      limits.durationMs,
    ),
    postgresqlStatementTimeoutMs: readInteger(
      environment,
      "PLATFORM_POSTGRESQL_STATEMENT_TIMEOUT_MS",
      defaults.postgresqlStatementTimeoutMs,
      limits.durationMs,
    ),
    postgresqlLockTimeoutMs: readInteger(
      environment,
      "PLATFORM_POSTGRESQL_LOCK_TIMEOUT_MS",
      defaults.postgresqlLockTimeoutMs,
      limits.durationMs,
    ),
    postgresqlIdleInTransactionTimeoutMs: readInteger(
      environment,
      "PLATFORM_POSTGRESQL_IDLE_IN_TRANSACTION_TIMEOUT_MS",
      defaults.postgresqlIdleInTransactionTimeoutMs,
      limits.durationMs,
    ),
    candidateLimit: readInteger(
      environment,
      "PLATFORM_RECOVERY_CANDIDATE_LIMIT",
      defaults.candidateLimit,
      limits.candidateLimit,
    ),
    batchSize: readInteger(
      environment,
      "PLATFORM_RECOVERY_BATCH_SIZE",
      defaults.batchSize,
      limits.batchSize,
    ),
    leaseDurationMs: readInteger(
      environment,
      "PLATFORM_RECOVERY_LEASE_DURATION_MS",
      defaults.leaseDurationMs,
      limits.durationMs,
    ),
    itemDeadlineMs: readInteger(
      environment,
      "PLATFORM_RECOVERY_ITEM_DEADLINE_MS",
      defaults.itemDeadlineMs,
      limits.durationMs,
    ),
    retryDelayMs: readInteger(
      environment,
      "PLATFORM_RECOVERY_RETRY_DELAY_MS",
      defaults.retryDelayMs,
      limits.durationMs,
    ),
    concurrencyPerFamily: readInteger(
      environment,
      "PLATFORM_RECOVERY_CONCURRENCY_PER_FAMILY",
      defaults.concurrencyPerFamily,
      limits.concurrency,
    ),
    pollingDelayMs: readInteger(
      environment,
      "PLATFORM_RECOVERY_POLLING_DELAY_MS",
      defaults.pollingDelayMs,
      limits.durationMs,
    ),
    auditBatchSize: readInteger(
      environment,
      "PLATFORM_RECOVERY_AUDIT_BATCH_SIZE",
      defaults.auditBatchSize,
      limits.auditBatchSize,
    ),
    maxWorkTasksPerProcess: readInteger(
      environment,
      "PLATFORM_RECOVERY_MAX_WORK_TASKS_PER_PROCESS",
      defaults.maxWorkTasksPerProcess,
      limits.projectionItems,
    ),
    maxIncidentsPerProcess: readInteger(
      environment,
      "PLATFORM_RECOVERY_MAX_INCIDENTS_PER_PROCESS",
      defaults.maxIncidentsPerProcess,
      limits.projectionItems,
    ),
  };
  return snapshotRecoveryWorkerConfig(config);
}

/** Revalidates programmatic input before creating either credential-owning runtime. */
export function snapshotRecoveryWorkerConfig(
  value: RecoveryWorkerConfig,
): RecoveryWorkerConfig {
  requirePostgresqlUrl(value.postgresqlRuntimeUrl);
  requireText(value.workerId, "workerId");
  if (new TextEncoder().encode(value.workerId).byteLength > limits.workerIdBytes) {
    throw new RangeError("workerId exceeds 1024 UTF-8 bytes");
  }
  for (const [name, maximum] of [
    ["projectionRefreshAfterMs", limits.durationMs],
    ["maxSourceBytes", limits.safe],
    ["parserDeadlineMs", limits.durationMs],
    ["temporalConnectTimeoutMs", limits.durationMs],
    ["postgresqlMaxConnections", limits.connections],
    ["postgresqlConnectionTimeoutMs", limits.durationMs],
    ["postgresqlIdleTimeoutMs", limits.durationMs],
    ["postgresqlQueryTimeoutMs", limits.durationMs],
    ["postgresqlStatementTimeoutMs", limits.durationMs],
    ["postgresqlLockTimeoutMs", limits.durationMs],
    ["postgresqlIdleInTransactionTimeoutMs", limits.durationMs],
    ["candidateLimit", limits.candidateLimit],
    ["batchSize", limits.batchSize],
    ["leaseDurationMs", limits.durationMs],
    ["itemDeadlineMs", limits.durationMs],
    ["retryDelayMs", limits.durationMs],
    ["concurrencyPerFamily", limits.concurrency],
    ["pollingDelayMs", limits.durationMs],
    ["auditBatchSize", limits.auditBatchSize],
    ["maxWorkTasksPerProcess", limits.projectionItems],
    ["maxIncidentsPerProcess", limits.projectionItems],
  ] as const) {
    requireInteger(value[name], name, maximum);
  }
  requireText(value.temporalAddress, "temporalAddress");
  requireText(value.temporalNamespace, "temporalNamespace");
  requireText(value.temporalTaskQueue, "temporalTaskQueue");
  if (value.candidateLimit < value.batchSize) {
    throw new RangeError("candidateLimit must be greater than or equal to batchSize");
  }
  if (value.itemDeadlineMs >= value.leaseDurationMs) {
    throw new RangeError("itemDeadlineMs must be less than leaseDurationMs");
  }
  return Object.freeze({ ...value });
}

function readRequired(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) {
    throw new TypeError(`${name} must be a nonempty string`);
  }
  return value;
}

function readOptional(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const value = environment[name] ?? fallback;
  if (value.length === 0) throw new TypeError(`${name} must be a nonempty string`);
  return value;
}

function readInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number | undefined,
  maximum: number,
): number {
  const encoded = environment[name];
  if (encoded === undefined) {
    if (fallback === undefined) throw new TypeError(`${name} is required`);
    return fallback;
  }
  if (!/^[1-9][0-9]*$/u.test(encoded)) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  const value = Number(encoded);
  requireInteger(value, name, maximum);
  return value;
}

function requireInteger(value: number, name: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be a positive safe integer at most ${maximum}`);
  }
}

function requireText(value: string, name: string): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${name} must be nonempty well-formed Unicode`);
  }
}

function requirePostgresqlUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("postgresqlRuntimeUrl must be a valid PostgreSQL URL");
  }
  if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
      parsed.hostname.length === 0) {
    throw new TypeError("postgresqlRuntimeUrl must be a valid PostgreSQL URL");
  }
}
