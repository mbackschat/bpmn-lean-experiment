# Shared wire contracts

This directory owns language-neutral schemas for artifacts and canonical values that cross Java, Lean, TypeScript, and harness boundaries. The schemas constrain serialization and version routing; they do not define BPMN semantics.

Version dimensions remain independent:

| Dimension | Owner |
|---|---|
| Semantic-profile document format | `profiles/*/profile.json` → `schemaVersion` |
| Semantic meaning and compatibility identity | `profiles/*/profile.json` → `id` |
| Scenario document format | `scenarios/**/*.json` → `schemaVersion` |
| Canonical trace shape | `scenarios/**/*.json` → `traceSchemaVersion` |
| Executable IR | IR document → `schemaVersion`, compiler identity, and semantic-profile identity |
| Temporal replay compatibility | adapter patch/version markers and retained Event Histories |

The current profile-document schema remains `0.1.0` for both draft profiles because adding a new semantic profile did not change the profile file format. Scenario and trace schemas advance from `0.1.0` to `0.2.0` because the interaction capsule adds a structured command, open-task projection, state-derived enabled interaction, and explicit rejection-state observation.

Schema validation is a boundary guard, not correspondence evidence. CIB calibration, Lean properties, TypeScript behavior, Temporal refinement, and differential comparison remain separate claim lanes.

The maintained verification gate currently checks these schema documents for valid JSON and enforces the existing artifact invariants directly. Full Draft 2020-12 evaluation and a mutation-sensitive schema gate remain pending an approved direct validator dependency; no current status claim relies on that missing gate.

## Schemas

- [semantic-profile.schema.json](schemas/semantic-profile.schema.json) validates draft profile artifacts.
- [scenario.schema.json](schemas/scenario.schema.json) validates both retained `0.1.0` and interaction `0.2.0` scenarios and their calibrated canonical values.
- [canonical-result-v0.1.schema.json](schemas/canonical-result-v0.1.schema.json) validates retained lifecycle results.
- [canonical-result-v0.2.schema.json](schemas/canonical-result-v0.2.schema.json) validates interaction results.
