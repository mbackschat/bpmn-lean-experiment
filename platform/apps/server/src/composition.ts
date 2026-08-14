import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { FileArtifactStore } from "@bpmn-lean/platform-artifact-store";
import { BpmnAutoLayoutPresentationAdapter } from "@bpmn-lean/platform-bpmn-presentation";
import {
  AuditEventFactory,
  AuditSearchService,
  IncidentAuditEventFactory,
  IncidentAuditSearchService,
  SqliteAuditRepository,
  SqliteIncidentAuditRepository,
} from "@bpmn-lean/platform-audit";
import {
  FakeActorResolver,
  OperationsAuthorizationPolicy,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";
import {
  ConfirmedProcessInstanceOperateBootstrap,
  ConfirmedProcessInstancePublicationService,
  DefinitionDeploymentService,
  DefinitionHttpRoutes,
  DefinitionScheduleHttpRoutes,
  DefinitionScheduleService,
  DefinitionStartService,
  MessageStartPublicationHttpRoutes,
  MessageStartPublicationService,
  DefinitionPresentationService,
  SqliteDefinitionRepository,
  SqliteDefinitionScheduleRepository,
  SqliteConfirmedProcessInstanceRepository,
  SqliteDefinitionPresentationRepository,
  SqliteMessageStartPublicationRepository,
} from "@bpmn-lean/platform-definitions";
import {
  createBpmnEngineGatewayRuntime,
  definitionScheduleHostId,
  definitionScheduleWorkflowIdBase,
  messageStartPublicationCommandId,
  messageStartPublicationProcessInstanceId,
  messageStartPublicationWorkflowId,
} from "@bpmn-lean/platform-engine-gateway";
import {
  IncidentActionAuditOutboxService,
  IncidentActionReconciliationService,
  IncidentAggregationService,
  IncidentHttpRoutes,
  IncidentMutationService,
  ExecutionPublicationHttpRoutes,
  ExecutionPublicationReconciliationService,
  ProcessInstanceHttpRoutes,
  ProcessInstanceSearchService,
  SqliteExecutionPublicationRepository,
  SqliteIncidentActionRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import {
  SqliteWorkRepository,
  WorkAuditOutboxService,
  WorkAuditService,
  WorkHttpRoutes,
  WorkMutationService,
  WorkService,
  WorkTaskDetailService,
} from "@bpmn-lean/platform-work";

import {
  snapshotPlatformServerConfig,
} from "./config.js";
import type { PlatformServerConfig } from "./config.js";
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

const presentationGenerationDeadlineMs = 1_000;

/** Creates the M1 modular-monolith runtime from published package entry points. */
export async function createPlatformServer(
  config: PlatformServerConfig,
): Promise<PlatformServerRuntime> {
  const snapshot = snapshotPlatformServerConfig(config);
  await mkdir(snapshot.dataDirectory, { recursive: true });

  const engineRuntime = createBpmnEngineGatewayRuntime({
    maxSourceBytes: snapshot.maxSourceBytes,
    parserDeadlineMs: snapshot.parserDeadlineMs,
    temporalAddress: snapshot.temporalAddress,
    temporalNamespace: snapshot.temporalNamespace,
    temporalTaskQueue: snapshot.temporalTaskQueue,
    temporalConnectTimeoutMs: snapshot.temporalConnectTimeoutMs,
  });
  const artifacts = new FileArtifactStore(
    join(snapshot.dataDirectory, "artifacts"),
  );
  const databaseFile = join(snapshot.dataDirectory, "definitions.sqlite");
  const processInstanceDatabaseFile = join(
    snapshot.dataDirectory,
    "process-instances.sqlite",
  );
  const workDatabaseFile = join(snapshot.dataDirectory, "work.sqlite");
  const auditDatabaseFile = join(snapshot.dataDirectory, "audit.sqlite");
  const incidentAuditDatabaseFile = join(
    snapshot.dataDirectory,
    "incident-audit.sqlite",
  );
  const resources: CloseableResource[] = [engineRuntime];
  try {
    const repository = new SqliteDefinitionRepository(databaseFile);
    resources.push(repository);
    const presentationRepository = new SqliteDefinitionPresentationRepository(
      databaseFile,
    );
    resources.push(presentationRepository);
    const scheduleRepository = new SqliteDefinitionScheduleRepository(databaseFile);
    resources.push(scheduleRepository);
    const publicationRepository = new SqliteMessageStartPublicationRepository(
      databaseFile,
    );
    resources.push(publicationRepository);
    const confirmedRepository = new SqliteConfirmedProcessInstanceRepository(
      databaseFile,
    );
    resources.push(confirmedRepository);
    const processInstanceRepository = new SqliteProcessInstanceRepository(
      processInstanceDatabaseFile,
    );
    resources.push(processInstanceRepository);
    const executionPublicationRepository =
      new SqliteExecutionPublicationRepository(processInstanceDatabaseFile);
    resources.push(executionPublicationRepository);
    const processInstances = new ProcessInstanceSearchService(
      processInstanceRepository,
    );
    const incidents = new IncidentAggregationService({
      repository: processInstanceRepository,
      gateway: engineRuntime.processOperations,
    });
    const incidentActions = new SqliteIncidentActionRepository(
      processInstanceDatabaseFile,
    );
    resources.push(incidentActions);
    const work = new SqliteWorkRepository(workDatabaseFile);
    resources.push(work);
    const auditRepository = new SqliteAuditRepository(auditDatabaseFile);
    resources.push(auditRepository);
    const auditSearch = new AuditSearchService(auditRepository);
    const incidentAuditRepository = new SqliteIncidentAuditRepository(
      incidentAuditDatabaseFile,
    );
    resources.push(incidentAuditRepository);
    const incidentAuditSearch = new IncidentAuditSearchService(
      incidentAuditRepository,
    );
    const actors = new FakeActorResolver({
      id: snapshot.fakeActorId,
      groups: [...snapshot.fakeActorGroups],
    });
    const authorization = new TaskAuthorizationPolicy();
    const operationsAuthorization = new OperationsAuthorizationPolicy(
      snapshot.operationsGroupId,
    );
    const executionPublicationReconciliation =
      new ExecutionPublicationReconciliationService({
        registrations: processInstanceRepository,
        publications: executionPublicationRepository,
        gateway: engineRuntime.processExecution,
      });
    const auditOutbox = new WorkAuditOutboxService(work, auditRepository);
    auditOutbox.reconcileAll();
    const incidentAuditOutbox = new IncidentActionAuditOutboxService(
      incidentActions,
      incidentAuditRepository,
    );
    const incidentMutations = new IncidentMutationService({
      aggregation: incidents,
      repository: incidentActions,
      gateway: engineRuntime.processOperations,
      outbox: incidentAuditOutbox,
      auditEvents: new IncidentAuditEventFactory({
        generateId: randomUUID,
        now: () => new Date(),
      }),
    });
    const incidentReconciliation = new IncidentActionReconciliationService(
      incidentActions,
      incidentMutations,
      incidentAuditOutbox,
    );
    await new ConfirmedProcessInstanceOperateBootstrap({
      repository: confirmedRepository,
      operate: processInstances,
    }).bootstrap();
    await incidentReconciliation.reconcileAll();
    const confirmedInstances = new ConfirmedProcessInstancePublicationService({
      repository: confirmedRepository,
      operate: processInstances,
      work,
    });
    const service = new DefinitionDeploymentService(
      engineRuntime.gateway,
      artifacts,
      repository,
    );
    const startService = new DefinitionStartService(
      engineRuntime.gateway,
      artifacts,
      repository,
      randomUUID,
      confirmedInstances,
    );
    const presentationService = new DefinitionPresentationService({
      definitions: repository,
      artifacts,
      presentations: presentationRepository,
      adapter: new BpmnAutoLayoutPresentationAdapter(),
      maxSourceBytes: snapshot.maxSourceBytes,
      generationDeadlineMs: presentationGenerationDeadlineMs,
    });
    await startService.reconcileAll();
    const scheduleService = new DefinitionScheduleService({
      artifacts,
      definitions: repository,
      schedules: scheduleRepository,
      host: engineRuntime.scheduleHost,
      identities: {
        processInstanceId: randomUUID,
        hostScheduleId: definitionScheduleHostId,
        configuredWorkflowIdBase: definitionScheduleWorkflowIdBase,
      },
      now: Date.now,
      confirmedInstances,
      locators: engineRuntime.processWork,
    });
    await scheduleService.reconcileAll();
    const publicationService = new MessageStartPublicationService({
      artifacts,
      definitions: repository,
      publications: publicationRepository,
      host: engineRuntime.messageStartHost,
      identities: {
        processInstanceId: messageStartPublicationProcessInstanceId,
        commandId: messageStartPublicationCommandId,
        workflowId: messageStartPublicationWorkflowId,
      },
      confirmedInstances,
      locators: engineRuntime.processWork,
    });
    await publicationService.reconcileAll();
    const definitionRoutes = new DefinitionHttpRoutes(
      service,
      startService,
      { maxSourceBytes: snapshot.maxSourceBytes },
      presentationService,
    );
    const scheduleRoutes = new DefinitionScheduleHttpRoutes(
      scheduleService,
      service,
    );
    const publicationRoutes = new MessageStartPublicationHttpRoutes(
      publicationService,
    );
    const processInstanceRoutes = new ProcessInstanceHttpRoutes(
      processInstances,
    );
    const executionPublicationRoutes = new ExecutionPublicationHttpRoutes({
      actors,
      authorization: operationsAuthorization,
      reconciliation: executionPublicationReconciliation,
      publications: executionPublicationRepository,
    });
    const incidentRoutes = new IncidentHttpRoutes({
      actors,
      authorization: operationsAuthorization,
      aggregation: incidents,
      mutations: incidentMutations,
      audit: incidentAuditSearch,
      outbox: incidentAuditOutbox,
    });
    const workService = new WorkService({
      repository: work,
      gateway: engineRuntime.processWork,
      actors,
      authorization,
      limits: {
        maxProcesses: snapshot.maxWorkProcesses,
        maxTasks: snapshot.maxWorkTasks,
      },
    });
    const workDetails = new WorkTaskDetailService({
      work: workService,
      gateway: engineRuntime.processWork,
    });
    const workMutations = new WorkMutationService({
      work: workService,
      details: workDetails,
      actors,
      repository: work,
      gateway: engineRuntime.processWork,
      outbox: auditOutbox,
      auditEvents: new AuditEventFactory({
        generateId: randomUUID,
        now: () => new Date(),
      }),
    });
    const workAudit = new WorkAuditService({
      actors,
      authorization,
      outbox: auditOutbox,
      audit: auditSearch,
    });
    const workRoutes = new WorkHttpRoutes({
      tasks: {
        listTasks: () => workService.listTasks(),
        getTaskDetail: (taskId) => workDetails.getTaskDetail(taskId),
        claimTask: (taskId, request) =>
          workMutations.claimTask(taskId, request),
        releaseTask: (taskId, request) =>
          workMutations.releaseTask(taskId, request),
        completeTask: (actionId, request) =>
          workMutations.completeTask(actionId, request),
      },
      audit: workAudit,
      outbox: auditOutbox,
    });
    const server = createPlatformHttpServerFromValidatedOrigin({
      publicOrigin: snapshot.publicOrigin,
      routes: [
        (request) => incidentRoutes.handle(request),
        (request) => workRoutes.handle(request),
        (request) => executionPublicationRoutes.handle(request),
        (request) => processInstanceRoutes.handle(request),
        (request) => publicationRoutes.handle(request),
        (request) => scheduleRoutes.handle(request),
        (request) => definitionRoutes.handle(request),
      ],
    });
    return new NodePlatformServerRuntime(
      server,
      resources,
      snapshot,
    );
  } catch (error: unknown) {
    try {
      await closeResources(resources);
    } catch (cleanupError: unknown) {
      throw new AggregateError(
        [error, cleanupError],
        "Platform server composition and cleanup both failed",
      );
    }
    throw error;
  }
}
