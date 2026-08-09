# Definitions module

This module owns M1 definition admission orchestration, durable metadata, process-local version ordinals, and exact-source retrieval. The [engine gateway](../../foundation/engine-gateway/README.md) remains the sole admission authority, and the [artifact store](../../foundation/artifact-store/README.md) remains the exact-byte storage mechanism.

`DefinitionDeploymentService.deploy` snapshots every caller-owned input before its first asynchronous boundary. A rejected compilation returns the engine source identity and diagnostics without writing content or metadata. An accepted compilation publishes the exact bytes under the engine-computed SHA-256 before `SqliteDefinitionRepository` allocates and inserts the next positive version for that BPMN process ID inside `BEGIN IMMEDIATE`.

Artifact publication precedes metadata insertion so an artifact conflict cannot create a definition record. A later metadata failure may leave harmless content-addressed orphan bytes. This module deliberately does not delete or prune those bytes and does not deduplicate identical accepted deployments.

The public read boundary lists and retrieves definition metadata and retrieves fresh exact-source bytes. Metadata that points at a missing artifact raises `DefinitionArtifactIntegrityError`; callers never receive an incomplete deployed definition.

`DefinitionHttpRoutes` contributes the M1 public Fetch-compatible HTTP boundary without opening a server socket. It validates a closed deployment query and selected XML media types, enforces the configured source-byte ceiling against both `Content-Length` and actual streamed bytes, snapshots stream chunks before producers can mutate them, and invokes admission only after validation. It publishes only [the public platform contracts](../../contracts/README.md), retrieves exact source bytes with digest-bound identity headers, returns `null` for paths owned by another module, and turns unexpected service or integrity failures into a generic response.

The module does not parse BPMN XML, interpret diagnostics, expose engine-private representations, start processes, provide server composition or UI behavior, or own assurance reports. Multipart uploads, CORS, authentication, expected-digest preconditions, pagination, and static serving remain outside this contribution. See [the M1 showcase](../../../showcase/m1-definition-deployment/README.md).
