# Shared wire contracts

This directory owns language-neutral JSON Schemas for artifacts and canonical values that cross Java, Lean, TypeScript, and harness boundaries. Schemas define transport shape; semantic profiles and capsules define meaning.

## Evolution policy

The project is pre-release and keeps exactly one current representation of each wire contract. A breaking contract change replaces its producers, consumers, fixtures, schemas, and tests atomically. Parallel legacy readers, embedded format counters, compatibility switches, migration functions, and retained Temporal history baselines are deliberately absent until a first durable release boundary is approved.

Each document has a stable structural discriminator such as `semanticProfile`, `scenario`, or `cibSevenScenarioEvidence`. JSON Schema `$id` identifies the current schema itself. A semantic profile’s `id` identifies its reviewed behavioral meaning and compatibility target; changing that meaning requires a new profile identity even when the JSON shape is unchanged.

This separation avoids routing every consumer through document-version switches while preserving the identity that actually matters to semantic claims. When production persistence or an immutable Temporal history baseline exists, compatibility must be designed from concrete retained artifacts and explicit migration/replay tests rather than speculative early formats.

## Artifact roles

| Artifact | Identity and responsibility |
|---|---|
| Semantic profile | Stable `kind`; versioned semantic `id`; pinned CIB release/configuration, selected feature surface, observation boundary, and CIB–BPMN relationship references |
| Scenario | Stable `kind`; answer-free model/profile identity, explicit start, User Task completion, and timer-firing stimuli, requested observations, and provenance |
| Canonical result | Outcome plus canonical observation trace including semantic task and timer occurrences; no target-specific host data |
| CIB evidence | Stable `kind`; content digests for exact profile and scenario bytes; pinned producer and projection identity; canonical result |
| Checked BPMN graph | Current `checkedProcess` contract; source-facing admitted graph with exact source/profile identity and no runtime semantics |
| Semantic Process program | Current `semanticProcess` contract; compiler/source/profile identity, typed control places and operations, and no mutable runtime state |
| Pipeline report | Stable `kind`; ephemeral verification report, provenance, comparisons, replay count, isolation, and timings |

Neutral scenarios contain no expected answer. CIB evidence is a separate immutable verifier input bound to the exact scenario and profile bytes. Target runners never receive it, and ordinary verification never regenerates it.

Schema validation is a boundary guard, not correspondence evidence. The maintained Ajv Draft 2020-12 gate validates artifacts, checks content identities and known CIB–BPMN relationships, and includes answer-smuggling, stale-evidence, and invalid-projection mutations. CIB calibration, Lean laws, TypeScript behavior, Temporal refinement, and differential comparison remain separate claim lanes.

## Portable semantic assertions

A target scenario contains only admitted model/profile identity and explicit semantic inputs. `fireTimer.logicalTimeMs` is one such answer-free semantic input. Lean and the semantic core apply it directly, CIB realizes it through controlled-clock advancement plus eligibility-gated job execution, and Temporal derives the identical typed stimulus exclusively from committed `openTimers` state without runner delivery. Target runners produce canonical results without receiving expected outcomes, rule verdicts, oracle traces, or comparison tolerances.

Portable assertions are verifier-side claims over canonical results or relations between results. A future assertion artifact must bind the exact scenario content digest, semantic profile, applicable canonical observation contract, and stable rule identifiers. A general assertion language remains deferred until repeated semantic capsules demonstrate the smallest useful contract.

## Schemas

- [semantic-profile.schema.json](schemas/semantic-profile.schema.json) validates the current draft profile artifact.
- [scenario.schema.json](schemas/scenario.schema.json) validates the seven answer-free User Task, balanced-parallel, and Intermediate Catch Timer scenarios.
- [canonical-result.schema.json](schemas/canonical-result.schema.json) validates the current canonical outcome and trace.
- [cibseven-evidence.schema.json](schemas/cibseven-evidence.schema.json) validates the content-bound retained CIB evidence envelope.
- [checked-process.schema.json](schemas/checked-process.schema.json) validates the admitted source-facing graph contract.
- [semantic-process.schema.json](schemas/semantic-process.schema.json) validates the immutable Semantic Process definition contract.

The checked BPMN graph and Semantic Process schemas freeze the artifact boundaries from [the Semantic Process IL spec](../docs/SEMANTIC-PROCESS-IL-SPEC.md). The bounded source compiler produces both artifacts, while the sequential, balanced-parallel, and Intermediate Catch Timer execution paths consume only the Semantic Process program. The schemas validate transport shape; they do not establish lowering correspondence or operational semantics.
