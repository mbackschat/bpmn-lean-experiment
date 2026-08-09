import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { FileArtifactStore } from "@bpmn-lean/platform-artifact-store";
import {
  DefinitionDeploymentService,
  DefinitionHttpRoutes,
  SqliteDefinitionRepository,
} from "@bpmn-lean/platform-definitions";
import { BpmnEngineGateway } from "@bpmn-lean/platform-engine-gateway";

import {
  snapshotPlatformServerConfig,
} from "./config.js";
import type { PlatformServerConfig } from "./config.js";
import {
  createPlatformHttpServerFromValidatedOrigin,
} from "./http-adapter.js";
import { NodePlatformServerRuntime } from "./runtime.js";
import type { PlatformServerRuntime } from "./runtime.js";

/** Creates the M1 modular-monolith runtime from published package entry points. */
export async function createPlatformServer(
  config: PlatformServerConfig,
): Promise<PlatformServerRuntime> {
  const snapshot = snapshotPlatformServerConfig(config);
  await mkdir(snapshot.dataDirectory, { recursive: true });

  const compiler = new BpmnEngineGateway({
    maxSourceBytes: snapshot.maxSourceBytes,
    parserDeadlineMs: snapshot.parserDeadlineMs,
  });
  const artifacts = new FileArtifactStore(
    join(snapshot.dataDirectory, "artifacts"),
  );
  const repository = new SqliteDefinitionRepository(
    join(snapshot.dataDirectory, "definitions.sqlite"),
  );
  try {
    const service = new DefinitionDeploymentService(
      compiler,
      artifacts,
      repository,
    );
    const definitionRoutes = new DefinitionHttpRoutes(service, {
      maxSourceBytes: snapshot.maxSourceBytes,
    });
    const server = createPlatformHttpServerFromValidatedOrigin({
      publicOrigin: snapshot.publicOrigin,
      routes: [(request) => definitionRoutes.handle(request)],
    });
    return new NodePlatformServerRuntime(server, repository, snapshot);
  } catch (error: unknown) {
    repository.close();
    throw error;
  }
}
