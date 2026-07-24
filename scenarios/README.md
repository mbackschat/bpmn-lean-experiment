# Neutral scenarios

This directory contains implementation-neutral BPMN resources, stimuli, scheduler choices, provenance, and requested observations. Target scenario documents never contain expected outcomes or traces.

The [Milestone 0 sequential User Task scenario](m0-sequential-user-task/README.md) is the first walking-skeleton input. Its BPMN resource and external stimuli are fixed, and a separate immutable artifact retains the trace calibrated against the pinned CIB Seven M0.2 oracle.

The [User Task discovery and completion scenario](m1-user-task-discovery-completion/README.md) reuses that exact BPMN resource and adds the first structured semantic task occurrence and exact completion command.

A scenario declares both its document `schemaVersion` and independent `traceSchemaVersion`. The [shared wire contracts](../contracts/README.md) own serialization shape; the selected semantic profile owns meaning.

A scenario must be consumable with the same meaning by the CIB Seven driver, Lean interpreter, and pure TypeScript semantic core. It must not expose CIB database entities, Lean constructors, Temporal histories, or other host-specific internals unless an approved profile explicitly makes them observable.

Each retained CIB evidence artifact references the SHA-256 digest of its exact scenario file. The verification harness loads evidence only after target input has been separated and never rewrites evidence during an ordinary run.
