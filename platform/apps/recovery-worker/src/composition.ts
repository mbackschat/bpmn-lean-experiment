import { randomUUID } from "node:crypto";

import { PostgresqlExactArtifactStore } from "@bpmn-lean/platform-artifact-store";
import {
  IncidentAuditEventFactory,
  PostgresqlAuditRepository,
  PostgresqlIncidentAuditRepository,
} from "@bpmn-lean/platform-audit";
import {
  ConfirmedProcessInstancePublicationService,
  DefinitionStartService,
  DefinitionsRecoveryFamily,
  PostgresqlConfirmedRegistrationRecoveryStep,
  PostgresqlConfirmedProcessInstanceRepository,
  PostgresqlDefinitionRepository,
  PostgresqlDefinitionScheduleRecoveryStep,
  PostgresqlDefinitionsRecoveryCandidateSource,
  PostgresqlDirectStartRecoveryStep,
  PostgresqlMessageStartRecoveryStep,
} from "@bpmn-lean/platform-definitions";
import {
  createBpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  BpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";
import {
  IncidentActionAuditOutboxService,
  IncidentActionReconciliationService,
  IncidentMutationService,
  OperatePostgresqlRecoveryFamily,
  PostgresqlExecutionRecoveryStep,
  PostgresqlFlowNodeOccurrenceRecoveryStep,
  PostgresqlIncidentActionRepository,
  PostgresqlIncidentAuditRecoveryStep,
  PostgresqlIncidentSnapshotRecoveryStep,
  PostgresqlOperateRecoveryCandidateSource,
  PostgresqlProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  PostgresqlRecoveryLeaseStore,
  RecoveryHandlerOutcomeKind,
} from "@bpmn-lean/platform-recovery-runtime";
import type {
  RecoveryLeaseStore,
} from "@bpmn-lean/platform-recovery-runtime";
import {
  PostgresqlWorkAuditRecoveryStep,
  PostgresqlWorkRecoveryCandidateSource,
  PostgresqlWorkRepository,
  PostgresqlWorkSnapshotRecoveryStep,
  WorkPostgresqlRecoveryFamily,
} from "@bpmn-lean/platform-work";

import {
  snapshotRecoveryWorkerConfig,
} from "./config.js";
import type {
  RecoveryWorkerConfig,
} from "./config.js";
import {
  createRecoveryLoops,
  handleDefinitionsRecoveryStep,
  mapOperateRecoveryStep,
  mapWorkSnapshotRecoveryStep,
  prepareIncidentActionRecovery,
  RecoveryWorkerFamily,
} from "./family-loops.js";
import type {
  RecoveryFamilyBinding,
  SupervisedRecoveryLoop,
} from "./family-loops.js";
import {
  checkRecoveryWorkerReadiness,
} from "./readiness.js";
import type {
  RecoveryWorkerReadinessOptions,
} from "./readiness.js";
import {
  RecoveryWorkerRuntime,
} from "./runtime.js";
import type {
  RecoveryRunReporter,
} from "./runtime.js";

export type RecoveryWorkerCompositionOverrides = Readonly<{
  createPostgresqlRuntime?: (config: RecoveryWorkerConfig) => PostgresqlRuntime;
  createEngineRuntime?: (config: RecoveryWorkerConfig) => BpmnEngineGatewayRuntime;
  checkReadiness?: (options: RecoveryWorkerReadinessOptions) => Promise<void>;
  createLoops?: (
    runtime: PostgresqlRuntime,
    engineRuntime: BpmnEngineGatewayRuntime,
    config: RecoveryWorkerConfig,
    store: RecoveryLeaseStore,
  ) => readonly SupervisedRecoveryLoop[];
  report?: RecoveryRunReporter;
}>;

/** Creates both caller-owned runtimes, proves bounded readiness, then wires the closed loop set. */
export async function createRecoveryWorker(
  configValue: RecoveryWorkerConfig,
  overrides: RecoveryWorkerCompositionOverrides = {},
): Promise<RecoveryWorkerRuntime> {
  const config = snapshotRecoveryWorkerConfig(configValue);
  const createDatabase = overrides.createPostgresqlRuntime ?? createDatabaseRuntime;
  const database = createDatabase(config);
  let engine: BpmnEngineGatewayRuntime | null = null;
  try {
    const createEngine = overrides.createEngineRuntime ?? createEngineGatewayRuntime;
    engine = createEngine(config);
    const store = new PostgresqlRecoveryLeaseStore(database);
    await (overrides.checkReadiness ?? checkRecoveryWorkerReadiness)({
      runtime: database,
      engineRuntime: engine,
      leaseStore: store,
      workerId: new TextEncoder().encode(config.workerId),
      leaseDurationMs: config.leaseDurationMs,
      createLeaseToken: randomUUID,
      createReadinessItemKey: () => new TextEncoder().encode(randomUUID()),
    });
    const loops = (overrides.createLoops ?? createDomainRecoveryLoops)(
      database,
      engine,
      config,
      store,
    );
    return new RecoveryWorkerRuntime(
      loops,
      engine,
      database,
      overrides.report,
    );
  } catch (error: unknown) {
    await closeOwners(engine === null ? [database] : [engine, database]);
    throw error;
  }
}

function createDatabaseRuntime(config: RecoveryWorkerConfig): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString: config.postgresqlRuntimeUrl,
    applicationName: `bpmn-platform-recovery-worker:${config.workerId}`,
    maxConnections: config.postgresqlMaxConnections,
    connectionTimeoutMs: config.postgresqlConnectionTimeoutMs,
    idleTimeoutMs: config.postgresqlIdleTimeoutMs,
    queryTimeoutMs: config.postgresqlQueryTimeoutMs,
    statementTimeoutMs: config.postgresqlStatementTimeoutMs,
    lockTimeoutMs: config.postgresqlLockTimeoutMs,
    idleInTransactionSessionTimeoutMs:
      config.postgresqlIdleInTransactionTimeoutMs,
  });
}

function createEngineGatewayRuntime(
  config: RecoveryWorkerConfig,
): BpmnEngineGatewayRuntime {
  return createBpmnEngineGatewayRuntime({
    maxSourceBytes: config.maxSourceBytes,
    parserDeadlineMs: config.parserDeadlineMs,
    temporalAddress: config.temporalAddress,
    temporalNamespace: config.temporalNamespace,
    temporalTaskQueue: config.temporalTaskQueue,
    temporalConnectTimeoutMs: config.temporalConnectTimeoutMs,
  });
}

function createDomainRecoveryLoops(
  database: PostgresqlRuntime,
  engine: BpmnEngineGatewayRuntime,
  config: RecoveryWorkerConfig,
  store: RecoveryLeaseStore,
): readonly SupervisedRecoveryLoop[] {
  return createRecoveryLoops({
    store,
    bindings: createDomainRecoveryBindings(database, engine, config),
    workerId: new TextEncoder().encode(config.workerId),
    batchSize: config.batchSize,
    leaseDurationMs: config.leaseDurationMs,
    itemDeadlineMs: config.itemDeadlineMs,
    retryDelayMs: config.retryDelayMs,
    concurrency: config.concurrencyPerFamily,
    pollingDelayMs: config.pollingDelayMs,
    createLeaseToken: randomUUID,
  });
}

function createDomainRecoveryBindings(
  database: PostgresqlRuntime,
  engine: BpmnEngineGatewayRuntime,
  config: RecoveryWorkerConfig,
): readonly RecoveryFamilyBinding[] {
  const definitionsCandidates = new PostgresqlDefinitionsRecoveryCandidateSource(database);
  const operateCandidates = new PostgresqlOperateRecoveryCandidateSource(database);
  const workCandidates = new PostgresqlWorkRecoveryCandidateSource(database);
  const artifacts = new PostgresqlExactArtifactStore(database);
  const definitions = new PostgresqlDefinitionRepository(database);
  const confirmedRepository = new PostgresqlConfirmedProcessInstanceRepository(database);
  const operate = new PostgresqlProcessInstanceRepository(database);
  const work = new PostgresqlWorkRepository(database);
  const confirmedPublications = new ConfirmedProcessInstancePublicationService({
    repository: confirmedRepository,
    operate: {
      recordConfirmedProcessInstance: async (publication) => {
        await operate.recordConfirmed(publication);
      },
    },
    work,
  });
  const directStartHost = new DefinitionStartService(
    engine.gateway,
    artifacts,
    definitions,
    randomUUID,
    confirmedPublications,
  ).directStartRecoveryHost();
  const incidentActions = new PostgresqlIncidentActionRepository(database);
  const incidentAudit = new PostgresqlIncidentAuditRepository(database);
  const incidentOutbox = new IncidentActionAuditOutboxService(
    incidentActions,
    incidentAudit,
  );
  const recoveryOnlyAggregation = {
    currentSnapshot: async () => {
      throw new Error("interactive incident aggregation is unavailable in recovery-worker");
    },
    registration: async () => {
      throw new Error("interactive incident aggregation is unavailable in recovery-worker");
    },
  };
  const incidentMutations = new IncidentMutationService({
    aggregation: recoveryOnlyAggregation,
    repository: incidentActions,
    recovery: incidentActions,
    gateway: engine.processOperations,
    outbox: incidentOutbox,
    auditEvents: new IncidentAuditEventFactory({
      generateId: randomUUID,
      now: () => new Date(),
    }),
  });
  const incidentReconciliation = new IncidentActionReconciliationService(
    incidentActions,
    incidentMutations,
    incidentOutbox,
  );

  const confirmed = new PostgresqlConfirmedRegistrationRecoveryStep({
    runtime: database,
    operate: {
      recordConfirmedProcessInstance: async (session, publication) => {
        await operate.recordConfirmed(session, publication);
      },
    },
    work,
  });
  const directStart = new PostgresqlDirectStartRecoveryStep({
    runtime: database,
    host: directStartHost,
  });
  const schedules = new PostgresqlDefinitionScheduleRecoveryStep({
    runtime: database,
    artifacts,
    host: engine.scheduleHost,
    locators: engine.processWork,
  });
  const messageStart = new PostgresqlMessageStartRecoveryStep({
    runtime: database,
    artifacts,
    host: engine.messageStartHost,
    locators: engine.processWork,
  });
  const incidentAuditStep = new PostgresqlIncidentAuditRecoveryStep({
    source: incidentActions,
    sink: incidentAudit,
  });
  const execution = new PostgresqlExecutionRecoveryStep({
    runtime: database,
    gateway: engine.processExecution,
  });
  const occurrences = new PostgresqlFlowNodeOccurrenceRecoveryStep({
    runtime: database,
    gateway: engine.processFlowNodeOccurrences,
  });
  const incidentSnapshot = new PostgresqlIncidentSnapshotRecoveryStep({
    runtime: database,
    gateway: engine.processOperations,
    maxIncidentsPerProcess: config.maxIncidentsPerProcess,
  });
  const workAudit = new PostgresqlWorkAuditRecoveryStep({
    source: work,
    sink: new PostgresqlAuditRepository(database),
  });
  const workSnapshot = new PostgresqlWorkSnapshotRecoveryStep({
    runtime: database,
    gateway: engine.processWork,
    catalogs: {
      readHumanTaskCatalog: async (reference) =>
        await definitions.getHumanTaskCatalog(reference),
    },
    maxTasks: config.maxWorkTasksPerProcess,
  });

  return [
    definitionsBinding(
      RecoveryWorkerFamily.DefinitionsConfirmedRegistration,
      DefinitionsRecoveryFamily.ConfirmedRegistration,
      definitionsCandidates,
      confirmed.prepare.bind(confirmed),
      config.candidateLimit,
    ),
    definitionsBinding(
      RecoveryWorkerFamily.DefinitionsDirectStart,
      DefinitionsRecoveryFamily.DirectStart,
      definitionsCandidates,
      directStart.prepare.bind(directStart),
      config.candidateLimit,
    ),
    definitionsBinding(
      RecoveryWorkerFamily.DefinitionsSchedule,
      DefinitionsRecoveryFamily.Schedule,
      definitionsCandidates,
      schedules.prepare.bind(schedules),
      config.candidateLimit,
    ),
    definitionsBinding(
      RecoveryWorkerFamily.DefinitionsMessageStart,
      DefinitionsRecoveryFamily.MessageStart,
      definitionsCandidates,
      messageStart.prepare.bind(messageStart),
      config.candidateLimit,
    ),
    {
      family: RecoveryWorkerFamily.OperateIncidentAction,
      listCandidateKeys: async () => await operateCandidates.listCandidateKeys(
        OperatePostgresqlRecoveryFamily.IncidentAction,
        config.candidateLimit,
      ),
      handle: async (lease) => await prepareIncidentActionRecovery(
        incidentReconciliation,
        lease.itemKey,
      ),
    },
    {
      family: RecoveryWorkerFamily.OperateIncidentAudit,
      listCandidateKeys: async () => await operateCandidates.listCandidateKeys(
        OperatePostgresqlRecoveryFamily.IncidentAudit,
        config.candidateLimit,
      ),
      handle: async (lease) => {
        const result = await incidentAuditStep.prepare(
          lease.itemKey,
          config.auditBatchSize,
        );
        return { kind: RecoveryHandlerOutcomeKind.Complete, apply: result.apply };
      },
    },
    operateBinding(
      RecoveryWorkerFamily.OperateCommittedExecution,
      OperatePostgresqlRecoveryFamily.CommittedExecution,
      operateCandidates,
      execution.prepare.bind(execution),
      config,
    ),
    operateBinding(
      RecoveryWorkerFamily.OperateFlowNodeOccurrence,
      OperatePostgresqlRecoveryFamily.FlowNodeOccurrence,
      operateCandidates,
      occurrences.prepare.bind(occurrences),
      config,
    ),
    operateBinding(
      RecoveryWorkerFamily.OperateIncidentSnapshot,
      OperatePostgresqlRecoveryFamily.IncidentSnapshot,
      operateCandidates,
      incidentSnapshot.prepare.bind(incidentSnapshot),
      config,
    ),
    {
      family: RecoveryWorkerFamily.WorkAudit,
      listCandidateKeys: async () => await workCandidates.listCandidateKeys(
        WorkPostgresqlRecoveryFamily.WorkAudit,
        config.candidateLimit,
      ),
      handle: async (lease) => {
        const result = await workAudit.prepare(lease.itemKey, config.auditBatchSize);
        return { kind: RecoveryHandlerOutcomeKind.Complete, apply: result.apply };
      },
    },
    {
      family: RecoveryWorkerFamily.WorkSnapshot,
      listCandidateKeys: async () => await workCandidates.listCandidateKeys(
        WorkPostgresqlRecoveryFamily.WorkSnapshot,
        config.candidateLimit,
        config.projectionMaxAgeMs,
      ),
      handle: async (lease) => mapWorkSnapshotRecoveryStep(
        await workSnapshot.prepare(lease.itemKey),
      ),
    },
  ];
}

function definitionsBinding(
  family: RecoveryWorkerFamily,
  sourceFamily: DefinitionsRecoveryFamily,
  source: PostgresqlDefinitionsRecoveryCandidateSource,
  prepare: Parameters<typeof handleDefinitionsRecoveryStep>[0],
  limit: number,
): RecoveryFamilyBinding {
  return {
    family,
    listCandidateKeys: async () => await source.listCandidateKeys(sourceFamily, limit),
    handle: async (lease, context) => await handleDefinitionsRecoveryStep(
      prepare,
      lease.itemKey,
      context,
    ),
  };
}

function operateBinding(
  family: RecoveryWorkerFamily,
  sourceFamily: OperatePostgresqlRecoveryFamily,
  source: PostgresqlOperateRecoveryCandidateSource,
  prepare: (itemKey: Uint8Array) => ReturnType<PostgresqlExecutionRecoveryStep["prepare"]>,
  config: RecoveryWorkerConfig,
): RecoveryFamilyBinding {
  return {
    family,
    listCandidateKeys: async () => await source.listCandidateKeys(
      sourceFamily,
      config.candidateLimit,
      sourceFamily === OperatePostgresqlRecoveryFamily.IncidentSnapshot
        ? config.projectionMaxAgeMs
        : undefined,
    ),
    handle: async (lease) => mapOperateRecoveryStep(await prepare(lease.itemKey)),
  };
}

async function closeOwners(
  owners: readonly Readonly<{ close(): void | Promise<void> }>[],
): Promise<void> {
  let firstFailure: unknown;
  for (const owner of owners) {
    try {
      await owner.close();
    } catch (error: unknown) {
      firstFailure ??= error;
    }
  }
  if (firstFailure !== undefined) throw firstFailure;
}
