# Shared wire contracts

This directory owns the language-neutral JSON Schemas for the artifacts that cross the Lean kernel, the TypeScript kernel, the Temporal host, the CIB Seven runner and the platform. They are cut along the kernel's axes ([kernel architecture](../docs/kernel/ARCHITECTURE-SPEC.md#contracts)): generic stimuli, one typed open-wait list and BPMN-level publication facts, so a new coverage row changes data, not shape. Schemas define transport shape; the [kernel semantics documents](../docs/kernel/semantics/ADMISSION-SEMANTICS-SPEC.md) and the semantic profiles define meaning.

The kernel program itself has no schema here: the reader in [`@bpmn-lean/bpmn-source`](../packages/bpmn-source/README.md) emits it and the kernel codecs decode it, under the [IL specification](../docs/kernel/IL-SPEC.md).

## Evolution policy

The project is pre-release and keeps exactly one current representation of each wire contract. A breaking change replaces its producers, consumers, fixtures, schemas and tests atomically. Legacy readers, embedded format counters, compatibility switches, migrations and retained Temporal history baselines are absent until a first durable release boundary is approved.

Each document carries a stable structural discriminator (`kind`). JSON Schema `$id` identifies the current schema itself. A semantic profile's `id` identifies its reviewed behavioural meaning and its normative and executable-oracle authorities; changing that meaning or authority requires a new profile identity even when the JSON shape is unchanged. There are three profiles, the [BPMN 2.0.2 standards profile, the CIB Seven 2.2.0 cumulative profile and its scope-chain extension](../profiles/README.md), and another cumulative profile only when one decision point needs a second value.

## Schemas

| Schema | Contract |
|---|---|
| [vocabulary.schema.json](schemas/vocabulary.schema.json) | The kernel vocabulary for the whole target: element, work, trigger, throw, gateway, scope, input, start, delivery, wait, status, outcome and refusal-code enumerations and the profile options. Generated from the Lean kernel's declarations by [`scripts/kernel-vocabulary.ts`](../scripts/kernel-vocabulary.ts); never edited by hand. |
| [scenario.schema.json](schemas/scenario.schema.json) | An answer-free scenario: exact BPMN resource and profile identity, one `start` stimulus followed by `command`, `deliver`, `timerFire` and `effectResult` stimuli addressed to an occurrence `{processInstanceId, elementId, activation}`, optional explicit logical time, host-environment `options`, and provenance (normative references plus a pinned CIB revision with references, or `not-applicable` with none). |
| [engine-population-scenario.schema.json](schemas/engine-population-scenario.schema.json) | The population form for mechanisms across process instances: several definitions, each step at an optional logical time `at`, `deploy` steps, per-instance stimuli and the commands `publish` (Message, by channel or name, with criteria and a mode), `broadcast` (Signal, by name or `signalRef`), `evaluateConditions` and `timerStart`, the fan-out commands with an optional explicit discovery `order`; no expected result. |
| [engine-population-result.schema.json](schemas/engine-population-result.schema.json) | A population run's answer: each deployment's versions and outcome (`deployed` or `deploymentRefused`), each command's resolution (`committed`, `failed`, `fanOut` with per-receiver `delivered`, `started`, `skipped` or `failed` entries, `noMatch`, `ambiguous`, `rejected` or `unsupported`) with its ordinal and logical time, the instance inputs that did not commit and every instance's state. |
| [canonical-result.schema.json](schemas/canonical-result.schema.json) | A target's result: the scenario outcome (semantic `committed`, `rolledBack`, `rejected`, `semanticFailure` or `unsupported`, kept apart from harness and infrastructure failures) and a trace of deployment, command and state observations, each state with status, logical time, scoped variables and the typed `openWaits` list. |
| [cibseven-evidence.schema.json](schemas/cibseven-evidence.schema.json) | Retained CIB Seven evidence: content digests of the exact scenario and profile bytes, the pinned producer and projection, raw runtime and history observations, and the canonical result. |
| [semantic-profile.schema.json](schemas/semantic-profile.schema.json) | A semantic profile: identity, status, claim, the BPMN normative references, the CIB Seven oracle and environment retained evidence is checked against (a profile claims them only while retained evidence binds it), and the selected relation references. |
| [bpmn-source-overlay.schema.json](schemas/bpmn-source-overlay.schema.json) | A data-only source overlay: exact identity, one profile, effect bindings and inert attribute declarations; no executable extension. |
| [semantic-publication.schema.json](schemas/semantic-publication.schema.json) | The committed execution publication the host derives from the kernel journal: one revision per kernel micro-step with its role (input, signal, flow arrival or scope quiescence), element, source element type and owning scope occurrence; no IL operation kinds. |
| [flow-node-occurrence-publication.schema.json](schemas/flow-node-occurrence-publication.schema.json) | Started, completed and cancelled flow-node occurrences with one deterministic commit instant per committed batch. |

Neutral scenarios contain no expected answer. CIB evidence is a separate immutable verifier input bound to the exact scenario and profile bytes; target runners never receive it, and ordinary verification never regenerates it. The [scenario discovery](../packages/differential/test/scenario-discovery.ts) pairs each scenario with its evidence by file name and refuses evidence bound to other bytes.

Schema validation is a boundary guard, not correspondence evidence. The Ajv Draft 2020-12 gate in [`scripts/contract-artifacts.ts`](../scripts/contract-artifacts.ts) validates every artifact and checks content identities and relation references; Lean, the TypeScript kernel, the Temporal host and the CIB comparison remain separate evidence lanes ([engineering policy](../docs/kernel/ENGINEERING-POLICY.md#contracts-and-evidence)).

## Exact scalar and JSON boundary

Every wire integer represented as a JavaScript `number` is an integer in `0..9007199254740991`, with stricter bounds where the field requires them. Its raw JSON token must match `0|[1-9][0-9]*`; negative zero, fractions and exponent spellings are refused even when conversion would produce an in-range integer. A closed wire document has no other numeric spelling, so a noncanonical numeral is a transport refusal.

Canonical identifiers are exact, non-normalized strings of Unicode scalar values, ordered lexicographically by scalar value, not by UTF-16 code units, locale, UTF-8 bytes or normalized text; canonically ordered arrays use this order.

Wire readers decode UTF-8 fatally, refuse duplicate object keys after escape decoding and unpaired surrogate encodings, and keep decoded member names as own properties. Unknown or missing fields, values outside closed enumerations, `null` where absence is required and absence where an explicit nullable field is required, invalid numeric tokens and non-canonical array order are all boundary refusals, applied before typed decoding in Lean and TypeScript alike.
