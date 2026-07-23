# Neutral scenarios

This directory will contain implementation-neutral BPMN resources, stimuli, scheduler choices, provenance, and expected observations after the first profile is approved.

No scenario exists yet because its profile identity, enabled stimuli, observation boundary, and canonical identity policy remain pending decisions in [docs/PLAN.md](../docs/PLAN.md).

A scenario must be consumable with the same meaning by the CIB Seven driver, Lean interpreter, and pure TypeScript reducer. It must not expose CIB database entities, Lean constructors, Temporal histories, or other host-specific internals unless an approved profile explicitly makes them observable.
