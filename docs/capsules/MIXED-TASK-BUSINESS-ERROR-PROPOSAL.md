# Mixed-task business Error proposal

## Status

Lifecycle: draft
Review: pending

## Question and basis

Can a named Service Task reject business work through its modeled interrupting Error boundary, then enter ordinary human/automated branching and rework, without losing data or confusing repeated occurrences?

This extends the approved [mixed-task account](MIXED-TASK-CONTROL-FLOW-PROPOSAL.md), preserving its root Process, single control unit, String/null mapping, Simple Boolean v1 and eight-step automatic-burst boundaries. It reuses the existing [typed Error result and atomic completion mechanism](BOUNDARY-ERROR-SPEC.md#semantic-transition); it does not inherit that capsule's A12 binding or `2.0.0` release claim. At baseline `b44fc88a`, adding an exact-code boundary to the admitted invoice rejects at the existing root-definition admission restriction. `/tmp/business-error-admission-gap` records the refusal; the modified XML separately passes the pinned XSD.

BPMN 2.0.2 Clause 13.3.3 treats a Service Task fault as an interrupting Error; Clause 13.5.3 consumes the event, cancels the attached Activity and follows its boundary flow. Table 8.41 supplies exact Error code matching; Tables 10.90, 10.91 and 10.92 establish boundary attachment and interruption. The existing [Markdown reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow) suffices. Bare BPMN does not prescribe CIB output mappings during cancellation.

The pinned CIB7 `2.2.0` [eight-probe experiment](../experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md#business-failure-follow-up) establishes caught-path mapping, local-null precedence, repeated work, technical rollback, parent fallback and missing-result failure. The proposed register classifications are `CIB-AGR-0012` for the bounded catch and `CIB-EXT-0016` for caught-path mapping; inherited input/result restrictions remain `CIB-EXT-0015`. The [relationship register](../CIB-BPMN-RELATION-REGISTER.md) distinguishes observed evidence from pending profile selection. The unmatched cleanup defect is not selected behavior.

## Required contract and exclusions

The candidate private profile is `cibseven-2.2.0-mixed-task-business-error-draft`. Inherit the mixed-task model family and source overlay. Additionally admit zero or one interrupting Error boundary on each Service Task, with at least one boundary in the model. Each boundary has one ErrorEventDefinition referencing an existing root Error with a nonempty exact code, no incoming flow and one unconditional outgoing flow. Omitted/default-true interruption is accepted; explicit false rejects. Ordinary task degrees remain one incoming and one normal outgoing. Error routes may rejoin, return through task-separated cycles, or enter any otherwise admitted continuation; they are not restricted to a designated recovery task.

Multiple Service Tasks and repeated occurrences are required scope. Different boundaries may reference the same root Error, and independent Error declarations may carry the same code. Match the result against the active effect's attached route, never a Process-wide code lookup. Root Errors must be referenced; unsupported executable attributes, catch-all definitions, multiple handlers on one task, incoming boundary flows and conditional boundary outputs reject. All source declaration IDs are unique, while references may repeat; shared Error references must retain identical declaration metadata. Existing profile admission remains unchanged.

Both success and business Error results supply exactly the distinct local names required by that Service Task's output mappings, including the empty set when no outputs exist. Values retain String/null, canonical validation and the current scalar limits. Missing locals never fall back to Process state, even though CIB permits that broader lookup. The required nullable nonempty message remains command-bound evidence, not a matching key or Process variable. Workers cannot select an output edge or write Process state.

On a matching Error for the exact active occurrence, one atomic transition validates the patch, installs local results, applies declared outputs, removes the intent/wait and its exact local owner, abandons the normal output and produces only the boundary output. A success follows only the normal output. Stale identity, absent/duplicate/wrong local owner, unmatched code and invalid patch refuse with exact predecessor-state preservation. Refusal is a profile safety boundary, not CIB-compatible unhandled-Error execution. Technical exceptions, retries and exhausted attempts never manufacture a business Error.

Optional within this account: multiple output targets sharing one local source, adjacent automated tasks, empty mappings, shared Error declarations and direct boundary-to-Merge continuation. Excluded practical obligations remain explicit: catch-all/multiple handlers, Error End/Event Sub-Process or ancestor/Call propagation, concurrency, nested scopes, Multi-Instance, incidents, structured data, error-code/message variables, cancellation and compensation. This increment does not claim unconditional termination or finish Practical CIB7 Coverage.

## Representation, admission and progress

Reuse checked `bpmnErrorRoute`, IL `awaitEffect.bpmnErrorRoute`, the existing typed result, command identity and runtime collections unchanged. A boundary remains attached definition metadata, not a separately armed wait or new internal operation. The checked flow still names the boundary as its source; analysis derives its producer from the exact attached Service Task. Lowering preserves boundary, ErrorEventDefinition, Error and Sequence Flow provenance. Raw checked/IL admission independently rejects aliased declarations, conflicting shared Error codes, cross-task route ownership and duplicate/missing producers or consumers.

Generalize the shared analysis around a wait vertex's declared continuation set. A User Task has one continuation; a Service Task has its normal continuation and optionally its boundary continuation. Profile-specific source/shape checks retain the old single-output restrictions. Full reachability and co-reachability include every continuation. Cutting all outgoing wait edges must leave a DAG; an error-only internal cycle still rejects. This remains a single-token graph, with alternatives rather than an implicit split.

The writer-barrier algorithm cuts every continuation of a Service Task that guarantees a mapped name. This is sound because both accepted result arms supply the complete required local set and execute the same output mapping. Analyze all branches without predicting codes or conditions. A normal-path-only writer cannot initialize a reader reachable from an earlier Error exit; a writer's own inputs still precede its outputs. User patches guarantee no write.

Keep the existing rank costs: wait arming one, None End plus completion two, other internal vertices one plus maximum successor. Bound Start and **every** normal/error continuation by eight, rather than inspecting only a task's first output. This bounds resumption after any accepted command, not total iteration count. Stable Running states still expose exactly one completable User Task or effect; terminal states retain the inherited completed observation.

Runtime-only constructs remain inherited: effect intent/argument snapshot and local owner belong to one activation until accepted completion; the typed Error exists as command/evidence data; its route belongs to immutable definition data; the produced boundary token uses an ordinary control place. Public E1/E2 and observation schemas gain no field or host identifier.

## Rules and decisive evidence

| Rule / layer | Required claim | Independent discriminators |
|---|---|---|
| `MBERR-CATCH-01` / BPMN | Only the active Service Task's exact-code attached route interrupts normal completion. | Two Service Tasks sharing one Error code but distinct recovery routes; success/Error alternatives; code and attachment substitutions. |
| `MBERR-MAP-01` / CIB overlay | Validated error-local results map before exact-owner cleanup. | Null versus absence and parent fallback; fan-out, empty outputs, missing/extra/duplicate locals and stale local owners. CIB supplies the selected mapping account, not independent corroboration of that account. |
| `MBERR-DATA-01` / profile | All reached inputs exist on normal and exceptional paths. | Error bypasses the only normal-path writer; an earlier guaranteed writer covers both paths; a back-edge write cannot initialize first entry. |
| `MBERR-PROGRESS-01` / profile | Actual execution preserves one control unit and every accepted resumption closes within its bound. | Normal burst fits but error burst is nine; exact-eight Error burst; error-only internal cycle; repeated human/automation recovery with fresh identities. |
| `MBERR-REFUSE-01` / profile | Invalid completion preserves full state, traces and publications. | Stale first effect against second occurrence, wrong code, invalid patch and malformed ownership; compare complete E1/E2, not just selected task names. |
| `MBERR-HOST-01` / hosting | Durable typed results retain route, patch and occurrence through recovery/replay. | Later live recovery witness below; failing the Activity instead of returning an Error must not open its boundary. |

Lean proves the quantified operational obligations below; TypeScript independently executes source/raw-graph and command discriminators. Differential evidence compares exact lowering, complete results and E1/E2 for both. CIB evidence compares only engine-observed input/result, task route and cleanup under the pinned probe configuration, not project effect identities or transaction timing. Temporal and public-corpus lanes remain deferred until separately qualified. Retain a whole invoice correction journey and a second journey with two automated checks sharing an Error declaration; ID renaming and unordered declaration permutations must preserve behavior, while candidate ordering remains significant.

## Lean assurance lane

Lane shape: proved

Evidence: planned generalization of the existing evaluator and declarative [transition account](../../BpmnSemantics/SemanticProcess/Transition.lean); no new transition family is selected. Existing evaluator-result dispatcher soundness is not counted as a progress theorem. Generalize reusable continuation/graph facts rather than copy the mixed-task interpreter or prove one invoice topology.

From independently admitted Program, exact checked lowering and an actual committed Start, prove input availability, root ownership, canonical data, one control unit and fresh issuance through actual internal steps and either primitive valid completion arm. A reached effect with a matching route and valid local patch must commit through public admission and produce only the error successor with mapped data and exact cleanup. No premise may assume successful completion, prepared successor, available input or the desired output state. Refusal preserves the predecessor. Actual scheduled closure reaches one completable wait or completion within the derived bound after Start and every accepted completion.

Nearest checked non-laws: an endless external rework schedule need not terminate; a raw nonempty patch need not be valid; CIB parent fallback is not admitted result completeness; structural reachability does not guarantee an exit will be selected. Mutate the deciding mechanisms: omit error edges from writer barriers or maximum-burst analysis, retain the normal output on Error, or match by code globally instead of active occurrence. Each mutation must fail a separating witness.

Effort bound: at most two additional focused proof owners, each at most 800 nonblank lines, plus cohesive generalization of the existing four assembly owners without weakening their old-profile statements. Reassess after the continuation/data bridge before runtime assembly; if the bound does not fit, record the exact unresolved obligation and revise the shared proof decomposition rather than add model cases. Lean remains one process tree, one CPU and 3 GiB without extra swap. New kernel fixtures first compile under that bound; cold aggregate-library and performance investigations remain deferred.

## Temporal hosting and refinement preflight

Ingress remains Start and content/occurrence-bound User Task/effect completion. Effects use committed argument snapshots and stable occurrence keys; a business Error is a successful Activity result carrying the existing typed arm. No new timer, subscription, child Workflow, concurrent wait set or cancellation mechanism is introduced. A matching result is committed exactly once through ordinary command deduplication; retries preserve identity and repeated business work obtains a new identity. Transport failure remains host failure. Existing unmapped-result adapter failure remains a safety disposition, not CIB unmatched behavior.

The state relation equates immutable definition identity, committed core state, effect/local ownership, Process bindings, accepted-command recovery and complete publications. Queue ordering, late delivery, duplicate delivery, result retention, retry and replay must preserve that relation. Public state cannot expose a partially applied patch or both continuations. General Workflow cancellation and exactly-once external side effects are not claimed.

The smallest later live witness returns a mapped Error, corrects the invoice, revisits the same Service Task, forces rollover with its second effect pending, replaces the Worker, recovers that request/result, refuses the first occurrence's stale completion, follows the second result's route and replays every Run. A transport-failure control must never create modeled recovery. The private profile receives typed qualification-unavailable refusal until this witness passes; preflight does not grant hosted support.

## Versioning consequences

Pre-release evolution applies. Add one private profile and classified relationship references; preserve every existing profile, wire field, command digest and accepted result. No legacy reader or durable-history equivalence is introduced. Public promotion later adds whole models, exact pipeline bindings, capability/restriction rows, corpus map and platform disclosure atomically under the [corpus contract](../../model-corpus/README.md#admission-and-product-readiness-gate).

### Owners this implementation grows

| Owner | Headroom before 800 nonblank lines |
|---|---:|
| [Graph analysis](../../packages/semantic-core/src/mixed-task-control-flow-analysis.ts) | 656 |
| [Graph admission](../../packages/semantic-core/src/mixed-task-control-flow-admission.ts) | 641 |
| [Business source projection](../../packages/bpmn-source/src/serial-business-task-source.ts) | 672 |
| [Admission laws](../../BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmissionLaws.lean) | 505 |
| [Data proofs](../../BpmnSemantics/SemanticProcess/MixedTaskControlFlowDataProofs.lean) | 80 |
| [Lifecycle proofs](../../BpmnSemantics/SemanticProcess/MixedTaskControlFlowLifecycleProofs.lean) | 56 |
| [Progress proofs](../../BpmnSemantics/SemanticProcess/MixedTaskControlFlowProgressProofs.lean) | 21 |
| [Command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) | 5 |

These measured margins constrain the first implementation plan. Extract a cohesive existing responsibility before planned growth exceeds its margin; rerun bindings for every concrete added/growing path. Required guards include [schema coverage](../../scripts/contract-schema-coverage.test.ts), [artifact relationships](../../scripts/contract-artifact-projections.test.ts), [operation consumers](../../scripts/semantic-operation-consumer-census.test.ts), [Lean imports](../../scripts/lean-import-boundaries.test.ts), [module cost](../../scripts/lean-module-cost.test.ts), [test selection](../../scripts/test-selection-coverage.test.ts), [documentation reviewability](../../scripts/document-reviewability.test.ts) and [public corpus coverage](../../model-corpus/test/executable-model-corpus.test.ts). The source/core/contracts/differential and bounded complete Lean gates precede checkpoint review; unchanged CIB evidence is reused until the claimed comparison changes.

## Review and closure

Cold proposal review precedes semantic implementation. The first green semantic checkpoint needs independent review; closure additionally needs hosted refinement, retained whole-model evidence and truthful public registration. Shared interpretation and fixture lowering remain common-mode risks; independent raw-graph mutations, exact outputs and the two-task shared-code counterexample address them. Nearest unsupported claims remain ancestor/catch-all propagation, business-error concurrency, incidents and unconditional termination. Record baseline-to-closure cost against mixed-task composition in the [cost ledger](../CAPSULE-COST-LEDGER.md); unknown authoring time stays unknown.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
