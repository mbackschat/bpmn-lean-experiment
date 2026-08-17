import {
  validatePublicOrigin,
} from "./public-origin.js";
import type { ValidatedPublicOrigin } from "./public-origin.js";

const defaultHost = "127.0.0.1";
const defaultPort = 3_000;
const defaultDataDirectory = ".data/platform";
const defaultMaxSourceBytes = 1024 * 1024;
const defaultParserDeadlineMs = 1_000;
const defaultTemporalAddress = "127.0.0.1:7233";
const defaultTemporalNamespace = "default";
const defaultTemporalTaskQueue = "bpmn-semantic";
const defaultTemporalConnectTimeoutMs = 5_000;
const defaultFakeActorId = "demo-user";
const defaultFakeActorGroups = ["reviewers", "operators"] as const;
const defaultOperationsGroupId = "operators";
const defaultMaxWorkProcesses = 100;
const defaultMaxWorkTasks = 1_000;

export const PlatformStorageMode = Object.freeze({
  Local: "local",
  Shared: "shared",
} as const);

export type PlatformStorageMode =
  typeof PlatformStorageMode[keyof typeof PlatformStorageMode];

export type PlatformServerConfig = Readonly<{
  storageMode: PlatformStorageMode;
  postgresqlRuntimeUrl: string | null;
  projectionMaxAgeMs: number | null;
  host: string;
  port: number;
  publicOrigin: string;
  dataDirectory: string;
  maxSourceBytes: number;
  parserDeadlineMs: number;
  temporalAddress: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
  temporalConnectTimeoutMs: number;
  fakeActorId: string;
  fakeActorGroups: readonly string[];
  operationsGroupId: string;
  maxWorkProcesses: number;
  maxWorkTasks: number;
}>;

export type ValidatedPlatformServerConfig = Readonly<
  Omit<PlatformServerConfig, "publicOrigin"> & {
    publicOrigin: ValidatedPublicOrigin;
  }
>;

/** Reads local-server configuration without retaining the caller's mutable environment object. */
export function readPlatformServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PlatformServerConfig {
  const storage = readStorageConfig(environment);
  const host = readNonemptyString(environment, "PLATFORM_HOST", defaultHost);
  const port = readPort(environment, "PLATFORM_PORT", defaultPort);
  return {
    ...storage,
    host,
    port,
    publicOrigin: readNonemptyString(
      environment,
      "PLATFORM_PUBLIC_ORIGIN",
      `http://${host}:${port}`,
    ),
    dataDirectory: readNonemptyString(
      environment,
      "PLATFORM_DATA_DIRECTORY",
      defaultDataDirectory,
    ),
    maxSourceBytes: readPositiveSafeInteger(
      environment,
      "PLATFORM_MAX_SOURCE_BYTES",
      defaultMaxSourceBytes,
    ),
    parserDeadlineMs: readPositiveSafeInteger(
      environment,
      "PLATFORM_PARSER_DEADLINE_MS",
      defaultParserDeadlineMs,
    ),
    temporalAddress: readNonemptyString(
      environment,
      "PLATFORM_TEMPORAL_ADDRESS",
      defaultTemporalAddress,
    ),
    temporalNamespace: readNonemptyString(
      environment,
      "PLATFORM_TEMPORAL_NAMESPACE",
      defaultTemporalNamespace,
    ),
    temporalTaskQueue: readNonemptyString(
      environment,
      "PLATFORM_TEMPORAL_TASK_QUEUE",
      defaultTemporalTaskQueue,
    ),
    temporalConnectTimeoutMs: readPositiveSafeInteger(
      environment,
      "PLATFORM_TEMPORAL_CONNECT_TIMEOUT_MS",
      defaultTemporalConnectTimeoutMs,
    ),
    fakeActorId: readNonemptyString(
      environment,
      "PLATFORM_FAKE_ACTOR_ID",
      defaultFakeActorId,
    ),
    fakeActorGroups: readFakeActorGroups(environment),
    operationsGroupId: readIdentifier(
      environment,
      "PLATFORM_OPERATIONS_GROUP_ID",
      defaultOperationsGroupId,
    ),
    maxWorkProcesses: readPositiveSafeInteger(
      environment,
      "PLATFORM_MAX_WORK_PROCESSES",
      defaultMaxWorkProcesses,
    ),
    maxWorkTasks: readPositiveSafeInteger(
      environment,
      "PLATFORM_MAX_WORK_TASKS",
      defaultMaxWorkTasks,
    ),
  };
}

export function snapshotPlatformServerConfig(
  config: PlatformServerConfig,
): ValidatedPlatformServerConfig {
  const normalized = {
    ...config,
    storageMode: config.storageMode ?? PlatformStorageMode.Local,
    postgresqlRuntimeUrl: config.postgresqlRuntimeUrl ?? null,
    projectionMaxAgeMs: config.projectionMaxAgeMs ?? null,
  };
  validateStorageConfig(normalized);
  requireNonempty(config.host, "host");
  requirePort(config.port, "port");
  const publicOrigin = validatePublicOrigin(config.publicOrigin);
  requireNonempty(config.dataDirectory, "dataDirectory");
  requirePositiveSafeInteger(config.maxSourceBytes, "maxSourceBytes");
  requirePositiveSafeInteger(config.parserDeadlineMs, "parserDeadlineMs");
  requireNonempty(config.temporalAddress, "temporalAddress");
  requireNonempty(config.temporalNamespace, "temporalNamespace");
  requireNonempty(config.temporalTaskQueue, "temporalTaskQueue");
  requirePositiveSafeInteger(
    config.temporalConnectTimeoutMs,
    "temporalConnectTimeoutMs",
  );
  requireNonempty(config.fakeActorId, "fakeActorId");
  const fakeActorGroups = snapshotFakeActorGroups(config.fakeActorGroups);
  requireIdentifier(config.operationsGroupId, "operationsGroupId");
  requirePositiveSafeInteger(config.maxWorkProcesses, "maxWorkProcesses");
  requirePositiveSafeInteger(config.maxWorkTasks, "maxWorkTasks");
  return { ...normalized, publicOrigin, fakeActorGroups };
}

function readStorageConfig(environment: NodeJS.ProcessEnv): Pick<
  PlatformServerConfig,
  "storageMode" | "postgresqlRuntimeUrl" | "projectionMaxAgeMs"
> {
  const storageMode = environment.PLATFORM_STORAGE_MODE ?? PlatformStorageMode.Local;
  switch (storageMode) {
    case PlatformStorageMode.Local:
      requireAbsent(environment, "PLATFORM_POSTGRESQL_RUNTIME_URL");
      requireAbsent(environment, "PLATFORM_PROJECTION_MAX_AGE_MS");
      return { storageMode, postgresqlRuntimeUrl: null, projectionMaxAgeMs: null };
    case PlatformStorageMode.Shared:
      return {
        storageMode,
        postgresqlRuntimeUrl: readRequiredNonemptyString(
          environment,
          "PLATFORM_POSTGRESQL_RUNTIME_URL",
        ),
        projectionMaxAgeMs: readRequiredPositiveSafeInteger(
          environment,
          "PLATFORM_PROJECTION_MAX_AGE_MS",
        ),
      };
    default:
      throw new TypeError("PLATFORM_STORAGE_MODE must be local or shared");
  }
}

function validateStorageConfig(config: PlatformServerConfig): void {
  switch (config.storageMode) {
    case PlatformStorageMode.Local:
      if (config.postgresqlRuntimeUrl !== null || config.projectionMaxAgeMs !== null) {
        throw new TypeError("local storage mode cannot carry shared storage configuration");
      }
      return;
    case PlatformStorageMode.Shared:
      if (config.postgresqlRuntimeUrl === null || config.projectionMaxAgeMs === null) {
        throw new TypeError("shared storage mode requires PostgreSQL and freshness configuration");
      }
      requireNonempty(config.postgresqlRuntimeUrl, "postgresqlRuntimeUrl");
      requirePositiveSafeInteger(config.projectionMaxAgeMs, "projectionMaxAgeMs");
      return;
  }
}

function readFakeActorGroups(environment: NodeJS.ProcessEnv): readonly string[] {
  const encoded = environment.PLATFORM_FAKE_ACTOR_GROUPS_JSON;
  if (encoded === undefined) return [...defaultFakeActorGroups];
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new TypeError("PLATFORM_FAKE_ACTOR_GROUPS_JSON must be a strict JSON array");
  }
  try {
    return snapshotFakeActorGroups(parsed);
  } catch (error: unknown) {
    throw new TypeError("PLATFORM_FAKE_ACTOR_GROUPS_JSON is invalid", { cause: error });
  }
}

function snapshotFakeActorGroups(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("fake actor groups must be a nonempty array");
  }
  const groups = value.map((group) => {
    if (typeof group !== "string" || group.length === 0 || !group.isWellFormed()) {
      throw new TypeError("fake actor group must be nonempty well-formed Unicode");
    }
    return group;
  });
  if (new Set(groups).size !== groups.length) {
    throw new TypeError("fake actor groups must be unique");
  }
  return Object.freeze(groups);
}

function readNonemptyString(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: string,
): string {
  const value = environment[name];
  if (value === undefined) {
    return defaultValue;
  }
  requireNonempty(value, name);
  return value;
}

function readRequiredNonemptyString(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name];
  if (value === undefined) throw new TypeError(`${name} is required`);
  requireNonempty(value, name);
  return value;
}

function readIdentifier(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: string,
): string {
  const value = environment[name] ?? defaultValue;
  requireIdentifier(value, name);
  return value;
}

function readPort(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  const value = environment[name];
  if (value === undefined) {
    return defaultValue;
  }
  if (!/^(?:0*[1-9][0-9]*)$/u.test(value)) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  const decoded = Number(value);
  requirePort(decoded, name);
  return decoded;
}

function readPositiveSafeInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  const value = environment[name];
  if (value === undefined) {
    return defaultValue;
  }
  if (!/^(?:0*[1-9][0-9]*)$/u.test(value)) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  const decoded = Number(value);
  requirePositiveSafeInteger(decoded, name);
  return decoded;
}

function readRequiredPositiveSafeInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
): number {
  const value = environment[name];
  if (value === undefined) throw new TypeError(`${name} is required`);
  if (!/^(?:0*[1-9][0-9]*)$/u.test(value)) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  const decoded = Number(value);
  requirePositiveSafeInteger(decoded, name);
  return decoded;
}

function requireAbsent(environment: NodeJS.ProcessEnv, name: string): void {
  if (environment[name] !== undefined) {
    throw new TypeError(`${name} is available only in shared storage mode`);
  }
}

function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a nonempty string`);
  }
}

function requireIdentifier(value: string, name: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${name} must be nonempty well-formed Unicode`);
  }
}

function requirePort(value: number, name: string): void {
  requirePositiveSafeInteger(value, name);
  if (value > 65_535) {
    throw new RangeError(`${name} must not exceed 65535`);
  }
}

function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
