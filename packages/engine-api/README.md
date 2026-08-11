# Engine API

`@bpmn-lean/engine-api` is product 1's narrow entry point for product 2. It exposes compilation identity, admission diagnostics, and the public Timer Start capability projection without exposing the checked BPMN graph or Semantic Process program.

Exact-definition start recompiles caller-snapshotted bytes, verifies the stored source, digest, profile, and Process identity before any Temporal start, and projects only source identity, definition identity, semantic Process-instance identity, or an opaque pre-start failure. The SDK Workflow handle and admitted program remain private. Committed-state observation and command submission remain absent until their consumers land. [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#product-2-dependency-direction) owns the cross-product boundary.

Definition scheduling recompiles exact bytes and verifies source, byte length, digest, profile, Process, Start Event, and normalized duration before creating, inspecting, or pausing a one-action Timer Start Schedule. It compares the complete private Schedule occurrence, action, arguments, retry, and policies, then returns only pending, started, missed, rejection, or integrity results. Pause requires a pause-confirmed description before returning, and deletion remains handle-free.
