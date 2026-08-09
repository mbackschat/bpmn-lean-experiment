# Artifact store

This package owns exact local artifact-byte storage and retrieval through content identity. `FileArtifactStore` validates each lowercase SHA-256 identity against a synchronous snapshot of the caller's bytes, then publishes to `<root>/sha256/<digest>` atomically without replacing an existing path.

An exact duplicate is idempotent. An occupied path with different bytes is an explicit conflict and remains untouched. Retrieval returns a fresh byte array, missing content returns `null`, and digest validation prevents caller-controlled path segments.

The package deliberately has no compilation, definition-version, metadata-index, deletion, pruning, encryption, directory-fsync, or remote-store responsibility. See [the architecture](../../../docs/ARCHITECTURE.md#foundation-packages) for its place in the platform and the [definition module](../../modules/definitions/README.md) for the owning M1 business workflow.
