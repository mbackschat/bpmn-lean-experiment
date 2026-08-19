# Interchange admission proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Current boundary

This proposal selects the first `INTERCHANGE-ADMISSION` tranche. The context-cold review of immutable proposal target `db18ea3` returned `approve-with-required-edits`. Its decisive counterexample found that the semantic-core value-domain gate currently admits string/null Process data for profiles whose artifacts exclude variables, including both the preserved-notation and Timer/User Task composition profiles. That is an existing profile-contract defect and a prerequisite to this composition, not behavior this proposal may preserve. Three same-reviewer corrections through `f773977` closed the review findings, and owner approval was recorded on 2026-08-19.

Implementation preflight then exposed a conflict the reviewed proposal had not accounted for: four value-domain profiles and the preserved-notation predecessor are content-bound by the non-updatable cyclic-control-flow preservation baseline. Adding feature atoms in place changed those profile digests and made the complete BPMN-source package gate fail before the new composition existed. The corrected proposal preserves those exact artifacts and replaces in-place atom reconciliation with the closed legacy-declaration rule below. Context-cold review of immutable target `adec37e` returned `approve` with no findings, and the owner approved implementation on 2026-08-19. The first exact interchange requirement is `BPMN-STRUCT-DIAGRAM-INTERCHANGE-01` in the [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md#reviewed-requirements), with the admission consequence **preserve**.

The source compiler already implements the reviewed preservation mechanism under `bpmn-2.0.2-user-task-preserved-notation-draft`. The current interchange gap is composition: that capability is unavailable to the CIB Seven User Task Process-data profile used to calibrate external whole models. Before composition, two declaration defects must close: external variable writes must follow an exhaustive profile-and-surface value-domain contract, and the already-preserved standard Definitions metadata must gain an explicit requirement-ledger row plus an exact declaration that does not replace the frozen predecessor artifact. This proposal otherwise reuses the reviewed mechanism and its five existing structural requirements. It does not reinterpret Diagram Interchange, Collaboration, Lanes, Artifacts, Documentation, User Task lifecycle, or Process data.

The first executable checkpoint now registers the composed profile and answer-free notation-bearing Process-data scenario, retains content-bound CIB Seven evidence, reuses the exact semantic-core User Task Process-data account, and registers the source/twin non-interference and cross-target pipeline cases. Both predecessor profiles remain separating negatives. The context-cold semantic-checkpoint review of immutable target `55e31d4` returned `approve-with-required-edits`: the executable preservation dispatch and public artifact declarations were aligned but not independently bound. Correction `dbf5fe7` added a complete artifact-to-dispatch guard with both drift directions and the frozen predecessor declaration exception, and the same reviewer returned `approve`. Lean registration at `234c284`, live Temporal Worker-replacement/history/replay evidence at `3654b43`, and the exact five-row external-CIB diagnostic reclassification at `e9714a8` complete the planned implementation lanes without changing the selected BPMN/CIB account. Owner-authorized correction `ed121e3` inventories the one Structured Human Work topology theorem whose imported String parser cannot reduce under kernel decision, and its clean narrow module build is green. The first complete-gate attempt at `7bb3d22` exited `1` after exposing one stale Call Activity proof oracle that invented an implicitly String-capable profile. Correction `1f8d2af` separates an explicitly declared registered positive from an unregistered fail-closed negative, and its narrow Lean and source-policy gates are green. Closure evidence remains pending because no complete gate has passed and no closure review has run.

[PRESERVE-ONLY-ADMISSION-SPEC.md](PRESERVE-ONLY-ADMISSION-SPEC.md) owns preservation meaning, [PROFILE-PARAMETERIZED-ADMISSION-SPEC.md](PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) owns executable profile composition, the [CIB-BPMN relationship register](CIB-BPMN-RELATION-REGISTER.md) owns CIB calibration, and [executable model corpus research](research/EXECUTABLE-BPMN-MODEL-CORPUS-RESEARCH.md) owns the external blocker ranking.

## Decision

Add one named profile, `cibseven-2.2.0-user-task-process-data-preserved-notation-draft`, that composes:

- the exact executable operation, graph, string/null Process-start data, string/null User Task completion data, observation, environment, and CIB relationship boundary of `cibseven-2.2.0-user-task-process-data-draft`; and
- the exact standard preservation capability of `bpmn-2.0.2-user-task-preserved-notation-draft`.

The composition is registered as one closed profile identity. A caller does not select an execution profile and an independent preservation overlay. This prevents unreviewed arbitrary combinations and keeps admitted meaning content-bound to one profile ID.

Before registering that successor, replace the semantic core's permissive value-domain default with a total profile-by-surface contract. Every registered profile and each external write surface, Process start, User Task completion, and effect completion, maps by exhaustive enum-based dispatch to one closed admitted value-kind set. An empty set admits only an empty patch. A missing profile or surface case is a compile-time or fail-closed error, never string/null permission by default. Each nonempty cell must have one exact public declaration: a surface-specific feature atom in its profile artifact, or one closed legacy declaration whose immutable artifact digest is derived from the existing cyclic-control-flow baseline and whose profile README names the surface and value kinds exactly.

This table is the complete nonempty matrix. Every omitted profile/surface cell is empty.

| Registered profile | Surface | Admitted value kinds | Exact public declaration after prerequisite reconciliation |
|---|---|---|---|
| `cibseven-2.0.0-mapped-success-service-task-draft` | Effect completion | String | Frozen artifact features `string-variable`, `local-variable-output-mapping`, and `successful-effect-result`, plus the exact profile README declaration |
| `cibseven-2.0.0-mapped-boundary-error-service-task-draft` | Effect completion | String, Null | Frozen artifact features `string-and-null-variables`, `local-variable-output-mapping`, and `typed-bpmn-error-result`, plus the exact profile README declaration |
| `bpmn-2.0.2-simple-boolean-exclusive-gateway-draft` | Process start | String, Null | Frozen artifact feature `simple-boolean-expression-v1`, exclusions of Boolean, number, and nested Process values, plus the exact profile README declaration |
| `bpmn-2.0.2-inclusive-gateway-selected-branches-draft` | Process start | String, Null | Frozen artifact feature `simple-boolean-expression-v1`, exclusions of data writes and non-selected value families, plus the exact profile README declaration |
| `cibseven-2.2.0-service-task-incident-cancellation-draft` | Process start | String | `string-process-start-variable` |
| `cibseven-2.2.0-user-task-process-data-draft` and the new preserved-notation successor | Process start | String, Null | `process-start-string-null-data` |
| `cibseven-2.2.0-user-task-process-data-draft` and the new preserved-notation successor | User Task completion | String, Null | `user-task-string-null-completion-data` |
| `bpmn-2.0.2-user-task-cycle-draft` | User Task completion | String, Null | `user-task-string-null-completion-data` |
| `cibseven-2.2.0-user-task-boolean-completion-data-draft` and `cibseven-2.2.0-user-task-assignment-form-metadata-draft` | Process start | String, Null | `process-start-string-null-data` |
| `cibseven-2.2.0-user-task-boolean-completion-data-draft`, `cibseven-2.2.0-user-task-assignment-form-metadata-draft`, and `cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft` | User Task completion | String, Null, Boolean | `user-task-string-null-boolean-completion-data` |
| `bpmn-2.0.2-bpmn-lean-structured-human-work-draft` | Process start | String, Null | `process-start-string-null-data` |
| `bpmn-2.0.2-bpmn-lean-structured-human-work-draft` | User Task completion | String, Null, Boolean, Integer, StringList | `user-task-string-null-boolean-completion-data`, `user-task-integer-completion-data`, and `user-task-ordered-string-list-completion-data` |

The table does not infer capability from scenario payloads. Each cell restates an already-approved owner: the Simple Boolean language's String/Null Process context for Exclusive and Inclusive selection, the cyclic-control-flow specification's String/Null completion patch, the two mapped-effect specifications' Activity-local results, the incident-cancellation specification's selected String start binding, and the existing Process-data and Human Work accounts. The Structured Human Work artifact currently records only the negative Process-start exclusion for Integer and StringList; prerequisite reconciliation adds the exact positive `process-start-string-null-data` atom required by its existing String/Null account before executable dispatch changes. This declaration repair does not add a value kind or write surface to any approved semantic account. In particular, the preserved-notation and Timer/User Task composition profiles remain empty at all three surfaces, and the parallel metadata profile remains empty at Process start.

The four legacy value-domain exceptions are closed to the mapped-success, mapped-boundary-Error, Simple Boolean Exclusive Gateway, and Inclusive Gateway profile IDs above. Their expected artifact digests are read from the existing immutable cyclic-control-flow baseline rather than copied into another manifest. Each profile README must name the same surface and value kinds as this table, and the executable consistency guard must reject a changed digest, missing declaration, changed declaration, fifth exception, or exception for a profile absent from that baseline. Every other current or future nonempty cell requires the exact surface-specific artifact atom. No caller selects this exception and no production runtime reads Markdown.

Production source may internally map several registered profiles to one enum-valued preservation capability. That internal reuse is not a second public profile language, wire field, manifest, or source of truth. A profile artifact remains the public machine-readable declaration; only the four frozen value-domain artifacts above use their existing feature/exclusion set plus exact profile README text as one closed compatibility declaration.

## Required, optional, and excluded

Required:

- a fail-closed, exhaustive profile-by-surface Process-data value-domain contract that removes undeclared string/null acceptance before composition;
- one supported structural requirement, `BPMN-STRUCT-DEFINITIONS-METADATA-01`; an exact predecessor README declaration that preserves its baseline-bound profile artifact; and the `retained-definitions-metadata` feature in the new successor profile for standard Definitions `name`, `exporter`, and `exporterVersion`;
- one new CIB Seven User Task Process-data profile with the exact preservation bundle below;
- unchanged contract-conforming old-profile behavior, caller bytes, and source-admission diagnostics, while undeclared variable-bearing caller bytes are intentionally rejected;
- exact-source retention with preserved material excluded from the checked graph, Semantic Process program, runtime state, and public observation;
- one source/twin witness using nonempty string/null start and completion data;
- exact CIB, Lean, TypeScript, differential, Temporal, and replay evidence appropriate to the already-selected behavior;
- external-corpus diagnostics regenerated under the new closest profile without accepting a model whose executable shape remains unsupported;
- a generalized non-interference guard for every profile that selects the standard preservation capability.

Optional:

- none for this tranche.

Excluded:

- any new BPMN transition, Process-data value kind, checked node, Semantic Process operation, runtime field, public observation, or Temporal primitive;
- execution of Collaboration, Participant, Message Flow, Lane, Artifact, Documentation, or Diagram Interchange;
- public access to normalized preserved subtrees;
- a caller-selected preservation overlay or arbitrary profile-capability product;
- Camunda or other foreign source metadata, including `camunda:historyTimeToLive`;
- data objects, data stores, references, associations, transformations, and assignments;
- broader User Task cardinality, a second unbound executable Process, or acceptance of any currently rejected external whole model;
- BPMN Process Execution Conformance, general CIB compatibility, export, or diagram-rendering claims;
- Product 2 behavior.

## Execute, preserve, reject

The profile partitions the parsed source before checked projection. The public compilation result remains only `Accepted` or `Rejected`.

| Consequence | Exact selected surface |
|---|---|
| Execute | One private executable None Start to User Task to None End Process; one User Task occurrence; string/null Process-start variables; string/null completion patch; the existing User Task and Process-data result algebra. |
| Preserve | BPMN Diagram Interchange; definitional Collaboration, Participants, and Message Flows; Lane Sets and Lanes; Associations, Groups, and Text Annotations; Documentation at every `BaseElement` locus; standard Definitions `name`, `exporter`, and `exporterVersion` under `BPMN-STRUCT-DEFINITIONS-METADATA-01`. |
| Reject | Every unlisted executable node or property; all foreign elements and attributes; `mustUnderstand="true"` not understood by the profile; data notation; an unrelated executable Process; malformed or wrong-typed references; every profile or graph cardinality mismatch. |

Preservation remains closed and recursive. A container is preserved only when every descendant is preserved, every declared inert reference resolves to the required target type, and no descendant carries executable meaning. The default remains rejection.

`camunda:historyTimeToLive` is not safe inert metadata in this tranche. It is a source-level CIB configuration choice, while `CIB-CFG-0001` records the pinned host environment and default history TTL. The attribute remains rejected until a separate classified requirement selects its exact source spelling, value, and consequence. Rejecting it prevents the standard-preservation bundle from becoming a blanket vendor-extension bypass.

`BPMN-STRUCT-DEFINITIONS-METADATA-01` owns only the standard `Definitions` attributes `name`, `exporter`, and `exporterVersion`, grounded in BPMN 2.0.2 Clause 8.2.1 and Table 8.1 plus the corresponding CMOF properties and XSD `tDefinitions` attributes. Production already retains those values in exact source bytes. The prerequisite adds the requirement-ledger and preservation-specification declarations, requires the frozen predecessor's README to name the exact retained attributes, and leaves that profile artifact byte-identical to the cyclic-control-flow baseline. The new successor alone adds the `retained-definitions-metadata` feature atom. Neither path widens the parser, checked graph, runtime, or observation surface.

## Profile contract

The new profile has one executable-oracle authority: pinned CIB Seven `2.2.0` at the existing revision and environment. It carries the same relationship set as its process-data predecessor:

- `CIB-AGR-0001` and `CIB-AGR-0002` for the bounded sequential Process and User Task lifecycle;
- `CIB-EXT-0005` and `CIB-EXT-0006` for string/null completion and start data;
- `CIB-OP-0001` for private host-task identity mapping;
- `CIB-CFG-0001` for the pinned oracle environment.

No new CIB relationship is needed. The standard preservation requirements are independently owned by the BPMN requirement ledger and the existing preservation specification. CIB execution of the composed scenario checks that the selected executable behavior remains available with the notation present; it does not make CIB the authority for Diagram Interchange meaning.

The profile's executable checked graph and Semantic Process operation multiset are identical to the current CIB Seven User Task Process-data profile. The exact source digest and semantic profile ID remain distinct by design. Old profiles continue to reject every source shape they reject today.

## Public contract

The only new public value is the registered semantic profile ID:

```ts
type InterchangeAdmissionProfile =
  "cibseven-2.2.0-user-task-process-data-preserved-notation-draft";
```

No compilation-result union changes. An accepted result still has empty diagnostics and exposes only exact source identity plus the executed project-owned representation. Preserved material remains reachable only through the already-retained exact source bytes.

No Product 1 start, command, observation, terminal result, Workflow, Run, or recovery shape changes. No Product 2 contract changes.

## Corpus consequence

The external CIB model rows move from `cibseven-2.2.0-user-task-process-data-draft` to the new closest profile and receive freshly generated normalized diagnostic digests. This is an admission-analysis change, not an acceptance claim.

The expected global mechanism reach and the narrower CIB diagnostic effect are exact and separately counted:

- Diagram Interchange occurs in four deduplicated clone families and five physical rows globally; it ceases to be a blocker in three CIB clone families and four physical CIB rows;
- definitional Collaboration presentation occurs in three clone families and four physical rows globally; it ceases to be a blocker in two CIB clone families and three physical CIB rows;
- Lane presentation occurs in two clone families and three physical rows globally; it ceases to be a blocker in one CIB clone family and two physical CIB rows;
- standard Definitions provenance and the other selected notation cease to be blockers where present;
- every model remains rejected for at least one foreign-metadata, executable-shape, task-metadata, data, or unsupported-mechanism reason.

The additional family in each 4/3/2 global count is the registered OMG Incident family. It remains bound to its existing profile, fails UTF-8 encoding before classification, and keeps its exact diagnostic digest. Physical files, clone families, and CIB rows remain separate denominators. A smaller diagnostic set is not BPMN support, CIB compatibility, model execution, or Product 2 catalog eligibility.

## Evidence strategy

The prerequisite red is the mechanism-wide profile discriminator the cold review reproduced: the preserved-notation and Timer/User Task composition profiles declare variables excluded, yet the current value-domain gate admits nonempty string/null Process-start and User Task-completion patches under both. The correction must reject those patches while retaining empty patches and every value-domain cell an existing artifact explicitly declares. Only after that red is green does the composition red apply: the existing CIB Process-data profile rejects the notation-bearing source, while the corrected preserved-notation profile rejects its nonempty data surface.

The first green reuses the exact [preserved-notation BPMN source](../scenarios/user-task-preserved-notation/process.bpmn) and adds a separate answer-free scenario for the new profile with nonempty start data, one overwritten or added string value, and one present null completion value. The executed-only twin is authored independently and compiled under the same new profile. After normalizing only exact source identity, both must have the same checked execution projection, Semantic Process program, and semantic trace.

The evidence lanes remain independent and finite:

- source admission checks the closed recursive preserve/reject partition and typed refusals for the registered fixture and perturbation denominator;
- an exhaustive profile-by-surface value-domain guard enumerates every registered profile independently of production dispatch, requires each admitted kind to have either its exact surface-specific artifact atom or one of the four digest-bound legacy declarations, and checks both undeclared-data counterexamples plus changed-digest, changed-README, and fifth-exception mutations;
- the generalized seeded non-interference guard enumerates every preservation-enabled profile independently of production classification and checks that notation cannot reach the executed projection for the registered source/twin and perturbation denominator;
- Lean and the pure TypeScript core execute the existing User Task Process-data account under the new profile identity;
- pinned CIB Seven executes the exact notation-bearing source with the same selected string/null public-service behavior and produces new content-bound evidence;
- the differential pipeline compares the same answer-free scenario across declared targets;
- Temporal starts the new profile through the existing product path and checks Worker replacement, terminal result, history, replay, data, and occurrence identity without inspecting notation;
- the corpus guard checks that every updated external row still rejects and that each changed blocker digest is explicit.

The source/twin fixtures and seeded mutations are authored independently of the production preservation classifier. These checks quantify over no BPMN documents beyond the registered finite fixture and perturbation families. They do not prove generalized parser or semantic non-interference.

The new profile does not need a new Lean semantic theorem. It does need the ordinary narrow Lean gate for its registered profile and scenario because a profile ID that Lean cannot admit is not a completed composition.

## Temporal hosting preflight

Admission still completes before Workflow start. Preserved content never enters the Semantic Process program, so it adds no durable ingress, wait, timer, effect, cancellation, lifecycle, ordering, concurrency, deduplication, retry, replay, or projection mechanism.

The new scenario uses the existing Process-start command and User Task completion Update. The state relation, stable waits, committed observation, and terminal result are unchanged. Exact source and semantic profile identity change intentionally; Workflow and Run identity remain private. The existing pre-start host-capability gate receives the same executable program shape and must return the same result as for the executed-only twin.

## Compatibility and evolution

This is an additive pre-release successor. It does not widen or replace an evidence-bound profile in place. The five baseline-bound artifacts touched by the earlier attempted reconciliation, the four value-domain profiles plus the preserved-notation predecessor, remain byte-identical to their cyclic-control-flow baseline entries. Existing scenario, evidence, public example, and contract-conforming caller bytes remain valid and retain their current profile identity. Variable-bearing caller bytes that relied on the undeclared permissive default are deliberately rejected by the prerequisite correction.

The shared internal preservation capability and the external variable-write value domain are selected by separate enum-based exhaustive switches over registered profile IDs. Unknown profiles and registered profiles without preservation reject the notation exactly as before; profiles without an explicitly declared value-domain cell accept only an empty patch at that surface. A second public capability-composition language is deferred unless repeated named successors demonstrate that the closed profile catalog is no longer maintainable.

## Implementation constraints

The current preservation owner, [preserved-element-classification.ts](../packages/bpmn-source/src/preserved-element-classification.ts), is near its owner limit. Reuse must extract the cohesive standard-notation capability rather than grow a second classifier or duplicate its lists. The current [pipeline case catalog](../packages/differential/test/pipeline-cases.ts) is at its owner limit and must not grow; the new case belongs in a separate registered case owner. `node scripts/what-binds.ts` remains the authority for the exact guards, registries, and current headroom when implementation begins.

The implementation must not alter [semantic-profile.schema.json](../contracts/schemas/semantic-profile.schema.json) to admit two authorities or a caller-selected overlay. It must not add a second preservation or value-domain manifest, replace the cyclic-control-flow baseline, or add an allowlist that bypasses its profile-digest comparison. The existing baseline artifact is the sole digest source for the four legacy value-domain declarations and the preserved-notation predecessor. Profile artifacts plus the exact legacy README clauses form the public declaration, while the registered capability switches remain executable dispatch.

## Review and implementation boundary

Proposal review is required because this adds a semantic profile and an admission capability composition. Owner approval is required after proposal review and before production changes.

A semantic-checkpoint review is required after the first complete executable profile/scenario checkpoint because registered admission changes. Closure review follows the ordinary policy. No combined checkpoint and closure is assumed by this proposal.

## Reopen conditions

Reopen before preserving any construct that can change execution; before admitting foreign source content; before accepting a second unbound executable Process; before letting notation reach checked source, IL, runtime, or public observation; before changing the selected CIB relationships or value domain; before making preservation caller-selectable; before adding a fifth legacy value-domain declaration or changing one of its frozen profile digests; or if the independent source/twin and seeded-defect guard cannot discriminate a leak.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `adec37e` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `55e31d4` | `fork-turns-none` | `approve-with-required-edits` | `dbf5fe7` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The earlier proposal stage used three correction rounds through `f773977`. Implementation then falsified its in-place artifact-reconciliation premise against the immutable cyclic-control-flow baseline. This redesign retains the selected semantics and public profile addition but changes the declaration evidence strategy, so it requires a new context-cold proposal review rather than another warm correction audit.
