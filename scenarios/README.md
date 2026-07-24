# Neutral scenarios

This directory contains implementation-neutral BPMN resources, stimuli, scheduler choices, provenance, and expected observations.

The [Milestone 0 sequential User Task scenario](m0-sequential-user-task/README.md) is the first walking-skeleton input. Its BPMN resource and external stimuli are fixed, and its expected trace is calibrated against the pinned CIB Seven M0.2 oracle.

The [User Task discovery and completion scenario](m1-user-task-discovery-completion/README.md) reuses that exact BPMN resource and adds the first structured semantic task occurrence and exact completion command.

A scenario must be consumable with the same meaning by the CIB Seven driver, Lean interpreter, and pure TypeScript semantic core. It must not expose CIB database entities, Lean constructors, Temporal histories, or other host-specific internals unless an approved profile explicitly makes them observable.
