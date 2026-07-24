# Shared wire contracts

This directory owns language-neutral schemas for artifacts and canonical values that cross Java, Lean, TypeScript, and harness boundaries. The schemas constrain serialization and version routing; they do not define BPMN semantics.

Version dimensions remain independent:

| Dimension | Owner |
|---|---|
| Semantic-profile document format | `profiles/*/profile.json` → `schemaVersion` |
| Semantic meaning and compatibility identity | `profiles/*/profile.json` → `id` |
| Scenario document format | `scenarios/**/scenario*.json` → `schemaVersion` |
| Canonical trace shape | `scenarios/**/*.json` → `traceSchemaVersion` |
| Retained CIB evidence envelope | `scenarios/**/*.cibseven-evidence.json` and `scenarios/**/cibseven-evidence.json` → `schemaVersion` |
| Executable IR | IR document → `schemaVersion`, compiler identity, and semantic-profile identity |
| Temporal replay compatibility | adapter patch/version markers and retained Event Histories |

The current profile-document schema remains `0.1.0` for both draft profiles because adding a new semantic profile did not change the profile file format. Scenario and trace schemas advance from `0.1.0` to `0.2.0` because the interaction capsule adds a structured command, open-task projection, state-derived enabled interaction, and explicit rejection-state observation.

Neutral scenario documents contain only target inputs. Retained CIB evidence is a separate immutable artifact bound to the exact scenario bytes, semantic profile, trace projection, pinned producer environment, and CIB revision. Target runners never receive that evidence; ordinary verification reads and compares it but never regenerates it.

Schema validation is a boundary guard, not correspondence evidence. The maintained Ajv Draft 2020-12 gate validates profiles, answer-free scenarios, canonical results, and retained CIB evidence; checks cross-artifact identities and content hashes; and includes mutations for answer smuggling, stale scenario evidence, and invalid task-instance projection. CIB calibration, Lean properties, TypeScript behavior, Temporal refinement, and differential comparison remain separate claim lanes.

## Schemas

- [semantic-profile.schema.json](schemas/semantic-profile.schema.json) validates draft profile artifacts.
- [scenario.schema.json](schemas/scenario.schema.json) validates answer-free retained `0.1.0` and interaction `0.2.0` scenario inputs.
- [cibseven-evidence.schema.json](schemas/cibseven-evidence.schema.json) validates the retained producer/projection envelope and routes its result by trace version.
- [canonical-result-v0.1.schema.json](schemas/canonical-result-v0.1.schema.json) validates retained lifecycle results.
- [canonical-result-v0.2.schema.json](schemas/canonical-result-v0.2.schema.json) validates interaction results.
