import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { FileArtifactStore } from "@bpmn-lean/platform-artifact-store";
import { BpmnAutoLayoutPresentationAdapter } from "@bpmn-lean/platform-bpmn-presentation";
import {
  AuditEventFactory,
  AuditSearchService,
  SqliteAuditRepository,
} from "@bpmn-lean/platform-audit";
import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";
import {
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
  ProcessInstanceHttpRoutes,
  ProcessInstanceSearchService,
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
    const processInstances = new ProcessInstanceSearchService(
      processInstanceRepository,
    );
    const work = new SqliteWorkRepository(workDatabaseFile);
    resources.push(work);
    const auditRepository = new SqliteAuditRepository(auditDatabaseFile);
    resources.push(auditRepository);
    const auditSearch = new AuditSearchService(auditRepository);
    const actors = new FakeActorResolver({
      id: snapshot.fakeActorId,
      groups: [...snapshot.fakeActorGroups],
    });
    const authorization = new TaskAuthorizationPolicy();
    const auditOutbox = new WorkAuditOutboxService(work, auditRepository);
    auditOutbox.reconcileAll();
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
        (request) => workRoutes.handle(request),
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
