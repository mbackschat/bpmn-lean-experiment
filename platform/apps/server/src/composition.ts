import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { FileArtifactStore } from "@bpmn-lean/platform-artifact-store";
import {
  ConfirmedProcessInstancePublicationService,
  DefinitionDeploymentService,
  DefinitionHttpRoutes,
  DefinitionScheduleHttpRoutes,
  DefinitionScheduleService,
  DefinitionStartService,
  MessageStartPublicationHttpRoutes,
  MessageStartPublicationService,
  SqliteDefinitionRepository,
  SqliteDefinitionScheduleRepository,
  SqliteConfirmedProcessInstanceRepository,
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
  SqliteConfirmedProcessWorkRepository,
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
  const resources: CloseableResource[] = [engineRuntime];
  try {
    const repository = new SqliteDefinitionRepository(databaseFile);
    resources.push(repository);
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
    const work = new SqliteConfirmedProcessWorkRepository(workDatabaseFile);
    resources.push(work);
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
    const server = createPlatformHttpServerFromValidatedOrigin({
      publicOrigin: snapshot.publicOrigin,
      routes: [
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
