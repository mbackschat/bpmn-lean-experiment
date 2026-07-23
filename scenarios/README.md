# Neutral scenarios

This directory contains implementation-neutral BPMN resources, stimuli, scheduler choices, provenance, and expected observations.

The [Milestone 0 sequential User Task scenario](m0-sequential-user-task/README.md) is the first walking-skeleton input. Its BPMN resource and external stimuli are fixed, and its expected trace is calibrated against the pinned CIB Seven M0.2 oracle.

A scenario must be consumable with the same meaning by the CIB Seven driver, Lean interpreter, and pure TypeScript reducer. It must not expose CIB database entities, Lean constructors, Temporal histories, or other host-specific internals unless an approved profile explicitly makes them observable.
