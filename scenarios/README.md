# Neutral scenarios

This directory contains implementation-neutral BPMN resources, semantic stimuli, provenance, and requested observations. Target scenario documents never contain expected outcomes or traces.

The current [User Task discovery and completion capsule](user-task-discovery-completion/README.md) owns one exact BPMN file and three separating scenarios: exact completion, wrong activation, and stale completion. The [parallel fork/join scenarios](parallel-fork-join/README.md) add one content-addressed balanced source plus explicit A-then-B and B-then-A completion orders under their separate normative draft profile.

Document shape is owned by the current [shared wire contracts](../contracts/README.md); semantic meaning is owned by the selected profile and capsule. Because the project is pre-release, a contract change replaces all scenario producers and consumers atomically instead of preserving parallel prototype formats.

A scenario must have the same meaning for CIB Seven, Lean, the TypeScript semantic core, and Temporal. It must not expose CIB database entities, Lean constructors, Temporal histories, future commands as current capabilities, or other host internals.

Each CIB evidence artifact references SHA-256 digests of its exact scenario and profile files. Verification loads evidence only after target input has been separated and never rewrites evidence during an ordinary run.
