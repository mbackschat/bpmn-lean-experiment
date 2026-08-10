# Engine API

`@bpmn-lean/engine-api` is product 1's narrow entry point for product 2. It exposes compilation identity and admission diagnostics without exposing the checked BPMN graph or Semantic Process program.

Exact-definition start recompiles caller-snapshotted bytes, verifies the stored source, digest, profile, and Process identity before any Temporal start, and projects only source identity, definition identity, semantic Process-instance identity, or an opaque pre-start failure. The SDK Workflow handle and admitted program remain private. Committed-state observation and command submission remain absent until their consumers land. [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#product-2-dependency-direction) owns the cross-product boundary.
