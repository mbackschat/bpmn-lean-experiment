import { randomUUID } from "node:crypto";

import { PostgresqlExactArtifactStore } from "@bpmn-lean/platform-artifact-store";
import {
  AuditEventFactory,
  AuditSearchService,
  IncidentAuditEventFactory,
  IncidentAuditSearchService,
  PostgresqlAuditRepository,
  PostgresqlIncidentAuditRepository,
} from "@bpmn-lean/platform-audit";
import {
  BpmnAutoLayoutPresentationAdapter,
  projectHumanTaskCatalog,
} from "@bpmn-lean/platform-bpmn-definition-projection";
import {
  FlowNodeMetricsResultKind,
} from "@bpmn-lean/platform-contracts";
import {
  ConfirmedProcessInstancePublicationService,
  ConfirmedProcessInstanceState,
  DefinitionCorrelatedMessageHttpRoutes,
  DefinitionCorrelatedMessageService,
  DefinitionDeploymentService,
  DefinitionHttpRoutes,
  DefinitionPresentationService,
  DefinitionScheduleHttpRoutes,
  DefinitionScheduleService,
  DefinitionStartService,
  MessageStartPublicationHttpRoutes,
  MessageStartPublicationService,
  PostgresqlConfirmedProcessInstanceRepository,
  PostgresqlDefinitionPresentationRepository,
  PostgresqlDefinitionRepository,
  PostgresqlDefinitionScheduleRepository,
  PostgresqlMessageStartPublicationRepository,
} from "@bpmn-lean/platform-definitions";
import {
  createBpmnEngineGatewayRuntime,
  definitionScheduleHostId,
  definitionScheduleWorkflowIdBase,
  messageStartPublicationCommandId,
  messageStartPublicationProcessInstanceId,
  messageStartPublicationWorkflowId,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  BpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";
import {
  FakeActorResolver,
  OperationsAuthorizationPolicy,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";
import {
  ExecutionPublicationHttpRoutes,
  FlowNodeMetricsHttpRoutes,
  IncidentActionAuditOutboxService,
  IncidentHttpRoutes,
  IncidentMutationDeliveryMode,
  IncidentMutationService,
  OperatorAuditExportHttpRoutes,
  OperatorAuditExportService,
  PostgresqlExecutionProjectionReader,
  PostgresqlFlowNodeMetricsReader,
  PostgresqlIncidentActionRepository,
  PostgresqlIncidentMutationAggregation,
  PostgresqlIncidentSnapshotReader,
  PostgresqlIncidentSnapshotService,
  PostgresqlProcessInstanceRepository,
  PostgresqlProjectionReadKind,
  ProcessInstanceHttpRoutes,
  ProcessInstanceSearchService,
} from "@bpmn-lean/platform-operate";
import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  ExactCurrentWorkTaskReader,
  PostgresqlWorkRepository,
  PostgresqlWorkSnapshotReader,
  PostgresqlWorkSnapshotService,
  WorkAuditService,
  WorkHttpRoutes,
  WorkMutationService,
  WorkTaskDetailService,
} from "@bpmn-lean/platform-work";

import type {
  ValidatedPlatformServerConfig,
} from "./config.js";
import {
  createPlatformHttpServerFromValidatedOrigin,
} from "./http-adapter.js";
import {
  NodePlatformServerRuntime,
  closeResources,
} from "./runtime.js";
import type {
  CloseableResource,
  PlatformServerRuntime,
} from "./runtime.js";
import {
  checkSharedPlatformServerReadiness,
} from "./shared-readiness.js";
import type {
  SharedPlatformServerReadinessOptions,
} from "./shared-readiness.js";
import {
  createStaticAssetsRoute,
} from "./static-assets.js";

const presentationGenerationDeadlineMs = 1_000;
const maximumIncidentProcesses = 100;
const maximumIncidentsPerProcess = 1_000;
const maximumIncidents = 1_000;

const backgroundAuditDelivery = Object.freeze({
  reconcileAll: async (): Promise<void> => undefined,
});

export type SharedPlatformServerCompositionOverrides = Readonly<{
  createPostgresqlRuntime?: (
    config: ValidatedPlatformServerConfig,
  ) => PostgresqlRuntime;
  createEngineRuntime?: (
    config: ValidatedPlatformServerConfig,
  ) => BpmnEngineGatewayRuntime;
  checkReadiness?: (
    options: SharedPlatformServerReadinessOptions,
  ) => Promise<void>;
}>;

/** Creates one PostgreSQL-only API replica with no startup reconciliation or fleet query. */
export async function createSharedPlatformServer(
  config: ValidatedPlatformServerConfig,
  overrides: SharedPlatformServerCompositionOverrides = {},
): Promise<PlatformServerRuntime> {
  if (config.postgresqlRuntimeUrl === null || config.projectionMaxAgeMs === null) {
    throw new TypeError("shared platform server requires PostgreSQL and freshness configuration");
  }
  const createDatabase = overrides.createPostgresqlRuntime ?? createDatabaseRuntime;
  const database = createDatabase(config);
  let engine: BpmnEngineGatewayRuntime | null = null;
  try {
    engine = (overrides.createEngineRuntime ?? createEngineGatewayRuntime)(config);
    await (overrides.checkReadiness ?? checkSharedPlatformServerReadiness)({
      runtime: database,
      engineRuntime: engine,
    });
    return composeSharedPlatformServer(
      config,
      database,
      engine,
      config.projectionMaxAgeMs,
    );
  } catch (error: unknown) {
    await closeResources(engine === null ? [database] : [database, engine]);
    throw error;
  }
}

function composeSharedPlatformServer(
  config: ValidatedPlatformServerConfig,
  database: PostgresqlRuntime,
  engine: BpmnEngineGatewayRuntime,
  projectionMaxAgeMs: number,
): PlatformServerRuntime {
  const artifacts = new PostgresqlExactArtifactStore(database);
  const definitions = new PostgresqlDefinitionRepository(database);
  const presentations = new PostgresqlDefinitionPresentationRepository(database);
  const schedules = new PostgresqlDefinitionScheduleRepository(database);
  const messageStarts = new PostgresqlMessageStartPublicationRepository(database);
  const confirmed = new PostgresqlConfirmedProcessInstanceRepository(database);
  const processRepository = new PostgresqlProcessInstanceRepository(database);
  const processInstances = new ProcessInstanceSearchService(processRepository);
  const incidentActions = new PostgresqlIncidentActionRepository(database);
  const workRepository = new PostgresqlWorkRepository(database);
  const workAuditRepository = new PostgresqlAuditRepository(database);
  const incidentAuditRepository = new PostgresqlIncidentAuditRepository(database);
  const actors = new FakeActorResolver({
    id: config.fakeActorId,
    groups: [...config.fakeActorGroups],
  });
  const taskAuthorization = new TaskAuthorizationPolicy();
  const operationsAuthorization = new OperationsAuthorizationPolicy(
    config.operationsGroupId,
  );
  const confirmedInstances = new ConfirmedProcessInstancePublicationService({
    repository: confirmed,
    operate: processInstances,
    work: workRepository,
  });

  const definitionService = new DefinitionDeploymentService(
    engine.gateway,
    artifacts,
    definitions,
    { project: projectHumanTaskCatalog },
  );
  const startService = new DefinitionStartService(
    engine.gateway,
    artifacts,
    definitions,
    randomUUID,
    confirmedInstances,
  );
  const presentationService = new DefinitionPresentationService({
    definitions,
    artifacts,
    presentations,
    adapter: new BpmnAutoLayoutPresentationAdapter(),
    maxSourceBytes: config.maxSourceBytes,
    generationDeadlineMs: presentationGenerationDeadlineMs,
  });
  const scheduleService = new DefinitionScheduleService({
    artifacts,
    definitions,
    schedules,
    host: engine.scheduleHost,
    identities: {
      processInstanceId: randomUUID,
      hostScheduleId: definitionScheduleHostId,
      configuredWorkflowIdBase: definitionScheduleWorkflowIdBase,
    },
    now: Date.now,
    confirmedInstances,
    locators: engine.processWork,
  });
  const messageStartService = new MessageStartPublicationService({
    artifacts,
    definitions,
    publications: messageStarts,
    host: engine.messageStartHost,
    identities: {
      processInstanceId: messageStartPublicationProcessInstanceId,
      commandId: messageStartPublicationCommandId,
      workflowId: messageStartPublicationWorkflowId,
    },
    confirmedInstances,
    locators: engine.processWork,
  });
  const correlatedMessageService = new DefinitionCorrelatedMessageService({
    repository: definitions,
    artifacts,
    host: engine.correlatedMessageHost,
  });

  const incidentReader = new PostgresqlIncidentSnapshotReader({
    runtime: database,
    maxAgeMs: projectionMaxAgeMs,
    maxProcesses: maximumIncidentProcesses,
    maxIncidentsPerProcess: maximumIncidentsPerProcess,
    maxIncidents: maximumIncidents,
  });
  const incidentSnapshot = new PostgresqlIncidentSnapshotService(incidentReader);
  const incidentOutbox = new IncidentActionAuditOutboxService(
    incidentActions,
    incidentAuditRepository,
  );
  const incidentMutations = new IncidentMutationService({
    aggregation: new PostgresqlIncidentMutationAggregation({
      reader: incidentReader,
      repository: processRepository,
    }),
    repository: incidentActions,
    recovery: incidentActions,
    gateway: engine.processOperations,
    outbox: incidentOutbox,
    auditEvents: new IncidentAuditEventFactory({
      generateId: randomUUID,
      now: () => new Date(),
    }),
    deliveryMode: IncidentMutationDeliveryMode.BackgroundRecovery,
  });

  const workSnapshot = new PostgresqlWorkSnapshotService({
    reader: new PostgresqlWorkSnapshotReader({
      runtime: database,
      maxAgeMs: projectionMaxAgeMs,
      maxProcesses: config.maxWorkProcesses,
      maxTasks: config.maxWorkTasks,
    }),
    actors,
    authorization: taskAuthorization,
  });
  const exactWork = new ExactCurrentWorkTaskReader({
    candidates: workSnapshot,
    gateway: engine.processWork,
    actors,
    authorization: taskAuthorization,
    catalogs: {
      readHumanTaskCatalog: async (reference) =>
        await definitions.getHumanTaskCatalog(reference),
    },
  });
  const workDetails = new WorkTaskDetailService({
    work: exactWork,
    gateway: engine.processWork,
  });
  const workMutations = new WorkMutationService({
    work: exactWork,
    details: workDetails,
    actors,
    repository: workRepository,
    gateway: engine.processWork,
    outbox: backgroundAuditDelivery,
    auditEvents: new AuditEventFactory({
      generateId: randomUUID,
      now: () => new Date(),
    }),
  });

  const routes = createSharedRoutes({
    config,
    projectionMaxAgeMs,
    database,
    actors,
    taskAuthorization,
    operationsAuthorization,
    definitions,
    confirmed,
    workRepository,
    workAuditRepository,
    incidentAuditRepository,
    definitionService,
    startService,
    presentationService,
    scheduleService,
    messageStartService,
    correlatedMessageService,
    processInstances,
    incidentSnapshot,
    incidentMutations,
    workSnapshot,
    workDetails,
    workMutations,
  });
  const server = createPlatformHttpServerFromValidatedOrigin({
    publicOrigin: config.publicOrigin,
    routes,
  });
  const resources: CloseableResource[] = [database, engine];
  return new NodePlatformServerRuntime(server, resources, config);
}

type SharedRouteDependencies = Readonly<Record<string, unknown>> & Readonly<{
  config: ValidatedPlatformServerConfig;
  projectionMaxAgeMs: number;
  database: PostgresqlRuntime;
  actors: FakeActorResolver;
  taskAuthorization: TaskAuthorizationPolicy;
  operationsAuthorization: OperationsAuthorizationPolicy;
  definitions: PostgresqlDefinitionRepository;
  confirmed: PostgresqlConfirmedProcessInstanceRepository;
  workRepository: PostgresqlWorkRepository;
  workAuditRepository: PostgresqlAuditRepository;
  incidentAuditRepository: PostgresqlIncidentAuditRepository;
  definitionService: DefinitionDeploymentService;
  startService: DefinitionStartService;
  presentationService: DefinitionPresentationService;
  scheduleService: DefinitionScheduleService;
  messageStartService: MessageStartPublicationService;
  correlatedMessageService: DefinitionCorrelatedMessageService;
  processInstances: ProcessInstanceSearchService;
  incidentSnapshot: PostgresqlIncidentSnapshotService;
  incidentMutations: IncidentMutationService;
  workSnapshot: PostgresqlWorkSnapshotService;
  workDetails: WorkTaskDetailService;
  workMutations: WorkMutationService;
}>;

function createSharedRoutes(dependencies: SharedRouteDependencies) {
  const {
    config,
    projectionMaxAgeMs,
    database,
    actors,
    taskAuthorization,
    operationsAuthorization,
    definitions,
    confirmed,
    workRepository,
    workAuditRepository,
    incidentAuditRepository,
  } = dependencies;
  const definitionRoutes = new DefinitionHttpRoutes(
    dependencies.definitionService,
    dependencies.startService,
    { maxSourceBytes: config.maxSourceBytes },
    dependencies.presentationService,
  );
  const scheduleRoutes = new DefinitionScheduleHttpRoutes(
    dependencies.scheduleService,
    dependencies.definitionService,
  );
  const messageStartRoutes = new MessageStartPublicationHttpRoutes(
    dependencies.messageStartService,
  );
  const correlatedMessageRoutes = new DefinitionCorrelatedMessageHttpRoutes(
    dependencies.correlatedMessageService,
  );
  const processRoutes = new ProcessInstanceHttpRoutes(dependencies.processInstances);
  const executionRoutes = new ExecutionPublicationHttpRoutes({
    actors,
    authorization: operationsAuthorization,
    projectedReads: new PostgresqlExecutionProjectionReader({
      runtime: database,
      maxAgeMs: projectionMaxAgeMs,
    }),
  });
  const metricsReader = new PostgresqlFlowNodeMetricsReader({
    runtime: database,
    maxAgeMs: projectionMaxAgeMs,
  });
  const metricsRoutes = new FlowNodeMetricsHttpRoutes({
    actors,
    authorization: operationsAuthorization,
    aggregation: {
      get: async (reference) => {
        const definition = await definitions.get(reference);
        if (definition === null) return null;
        const result = await metricsReader.read(definition);
        switch (result.kind) {
          case PostgresqlProjectionReadKind.Available:
            return result.read;
          case PostgresqlProjectionReadKind.NotFound:
          case PostgresqlProjectionReadKind.Unavailable:
            return {
              kind: FlowNodeMetricsResultKind.Unavailable,
              reason: "flowNodeMetricsUnavailable",
            };
        }
      },
    },
  });
  const incidentRoutes = new IncidentHttpRoutes({
    actors,
    authorization: operationsAuthorization,
    aggregation: dependencies.incidentSnapshot,
    mutations: dependencies.incidentMutations,
    audit: new IncidentAuditSearchService(incidentAuditRepository),
    outbox: backgroundAuditDelivery,
  });
  const workAudit = new WorkAuditService({
    actors,
    authorization: taskAuthorization,
    outbox: backgroundAuditDelivery,
    audit: new AuditSearchService(workAuditRepository),
  });
  const workRoutes = new WorkHttpRoutes({
    tasks: {
      listTasks: () => dependencies.workSnapshot.listTasks(),
      getTaskDetail: (taskId) => dependencies.workDetails.getTaskDetail(taskId),
      claimTask: (taskId, request) =>
        dependencies.workMutations.claimTask(taskId, request),
      releaseTask: (taskId, request) =>
        dependencies.workMutations.releaseTask(taskId, request),
      completeTask: (actionId, request) =>
        dependencies.workMutations.completeTask(actionId, request),
    },
    audit: workAudit,
    outbox: backgroundAuditDelivery,
  });
  const operatorAuditRoutes = new OperatorAuditExportHttpRoutes({
    actors,
    authorization: operationsAuthorization,
    registrations: {
      getConfirmed: async (processInstanceId) => {
        const record = await confirmed.get(processInstanceId);
        return record?.state === ConfirmedProcessInstanceState.Confirmed
          ? record.instance
          : null;
      },
    },
    exports: new OperatorAuditExportService({
      workOutbox: backgroundAuditDelivery,
      incidentOutbox: backgroundAuditDelivery,
      workAudit: workAuditRepository,
      incidentAudit: incidentAuditRepository,
    }),
  });
  return [
    (request: Request) => operatorAuditRoutes.handle(request),
    (request: Request) => incidentRoutes.handle(request),
    (request: Request) => workRoutes.handle(request),
    (request: Request) => executionRoutes.handle(request),
    (request: Request) => metricsRoutes.handle(request),
    (request: Request) => processRoutes.handle(request),
    (request: Request) => messageStartRoutes.handle(request),
    (request: Request) => correlatedMessageRoutes.handle(request),
    (request: Request) => scheduleRoutes.handle(request),
    (request: Request) => definitionRoutes.handle(request),
    ...(config.webAssetDirectory === null
      ? []
      : [createStaticAssetsRoute(config.webAssetDirectory)]),
  ];
}

function createDatabaseRuntime(
  config: ValidatedPlatformServerConfig,
): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString: config.postgresqlRuntimeUrl!,
    applicationName: "bpmn-platform-api",
    maxConnections: 16,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 30_000,
    queryTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 5_000,
  });
}

function createEngineGatewayRuntime(
  config: ValidatedPlatformServerConfig,
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
