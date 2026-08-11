import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { FileArtifactStore } from "@bpmn-lean/platform-artifact-store";
import {
  DefinitionDeploymentService,
  DefinitionHttpRoutes,
  DefinitionScheduleHttpRoutes,
  DefinitionScheduleService,
  DefinitionStartService,
  SqliteDefinitionRepository,
  SqliteDefinitionScheduleRepository,
} from "@bpmn-lean/platform-definitions";
import {
  createBpmnEngineGatewayRuntime,
  definitionScheduleHostId,
  definitionScheduleWorkflowIdBase,
} from "@bpmn-lean/platform-engine-gateway";

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
  const resources: CloseableResource[] = [engineRuntime];
  try {
    const repository = new SqliteDefinitionRepository(databaseFile);
    resources.push(repository);
    const scheduleRepository = new SqliteDefinitionScheduleRepository(databaseFile);
    resources.push(scheduleRepository);
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
    );
    const definitionRoutes = new DefinitionHttpRoutes(
      service,
      startService,
      { maxSourceBytes: snapshot.maxSourceBytes },
    );
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
    });
    await scheduleService.reconcileAll();
    const scheduleRoutes = new DefinitionScheduleHttpRoutes(
      scheduleService,
      service,
    );
    const server = createPlatformHttpServerFromValidatedOrigin({
      publicOrigin: snapshot.publicOrigin,
      routes: [
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
