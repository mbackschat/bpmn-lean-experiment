# Sequential Multi-Instance Sub-Process proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and boundary

Can a sequential Multi-Instance Activity repeat an ordinary embedded work graph containing human and automated work, preserve each body's data and occurrence identity, and continue its parent exactly once after natural or selected early completion?

This is one increment toward [Practical CIB7 Coverage](../PRACTICAL-CIB7-COVERAGE-TARGET.md), not closure of the Multi-Instance family. [Source and executable research](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#sequential-multi-instance-sub-process-account) establishes the CIB observations. No production implementation or hosting claim follows from the probes. Existing Task-only profiles retain their meaning.

## Normative and CIB basis

BPMN 2.0.2 §§10.3.5 and 13.3.4 supply embedded scope and quiescent completion; §13.3.7 supplies one-time cardinality, sequential generation and completion-condition evaluation after body completion. §§13.2, 13.3.2 and 13.4.1 supply flow, Task and Parallel Gateway behavior. Use the [Markdown reference route](../reference/bpmn-2.0.2/README.md); XSD/CMOF settle ownership and source structure.

Candidate `CIB-AGR-0013` in the [relationship register](../CIB-BPMN-RELATION-REGISTER.md) covers the observed repeated-body lifecycle. Candidate `CIB-EXT-0017` covers declared body input mappings, nearest enclosing writes, local shadowing and present null. Existing `CIB-EXT-0015` supplies the selected direct Service mapping subset, within its recorded restrictions; extending its root-only ownership requires the new relationship, not an implicit widening. CIB's synchronous delegate transaction is not the project's durable effect boundary.

The input collection is read-only during this increment. This is an enforced admission restriction, not a claim that CIB snapshots collections. CIB fixes the total and re-reads later items; the probe distinguishes replacement/growth and shrinking-command rollback. The runtime representation below keeps total, binding and current item distinct so admitting mutation later need not reinterpret an accepted model. Mutable collections and their effect-result rollback/refinement remain explicit unfinished practical depth.

## Required, optional and excluded scope

Required: one private executable root Process; one sequential MI embedded Sub-Process; one named Process String-list collection and a distinct item variable; arbitrary document-unique element IDs; a finite acyclic body containing at least one User Task and one mapped-success Service Task; and ordinary parent continuation. Admit serial and structured parallel composition, including separate branch None Ends. Parent flow is a serial chain of supported tasks around the one MI occurrence. The body has one None Start and one or more None Ends; every path reaches an End.

Optional: multiple tasks and nested paired Parallel regions inside that body; body-local input mappings using string literals or enclosing references (including present null); User Task string/null completion patches; and one completion condition that is exactly a named Boolean Process variable reference. That variable is supplied at Start and may be set by a User Task completion. The condition is evaluated only after the complete body has quiesced. No condition means natural completion. Service mappings use the existing direct literal/enclosing-input and explicit local-result subset; named handlers use the public caller-supplied Activity contract.

Bounds reuse [the existing collection limits](../../packages/semantic-core/src/sequential-multi-instance-contract.ts): at most 16 items, 512 UTF-8 bytes per item and 8,192 canonical collection bytes. Every automatic resumption must fit the unchanged eight-step closure bound. Bodies may be arbitrarily long across human/effect waits within the source admission limits; an eight-step burst is not an eight-task model limit.

Excluded here: parallel outer instances, nested MI or embedded scopes, Calls, cycles, Exclusive/Inclusive/Event-Based branching, boundary Events, Error/Escalation, Compensation, Transactions, MI output aggregation, collection writes, arbitrary collection/predicate expressions, Java API compatibility, async-before equivalence and general incident recovery. These remain distinct practical obligations where CIB supports them. Source warnings reject admission. Ordinary Task-only profiles, including their standards-only output mediator, are not reinterpreted as CIB Sub-Process behavior.

## Source and admission contract

Candidate identity: `cibseven-2.2.0-sequential-multi-instance-subprocess-draft`, private until all acceptance obligations close. Select `isSequential=true`, a CIB collection name or exact `${name}` reference, and a distinct CIB element-variable name. Reject loop cardinality combined with the collection, MI output parameters, undeclared scope crossings and unsupported attributes. Body input parameters are distinct names with string literals or exact enclosing references. The existing `VariableMapping` has no null-literal arm; present null is supported through an enclosing reference or a User Task completion value. All inputs evaluate in the same pre-entry enclosing context; one input cannot consume an earlier input declaration. The item name, collection name, completion-condition name and handler names cannot be redeclared as body locals or Activity output targets.

Recognize the graph structurally: contract one-in/one-out tasks and serial edges; contract a fork and its matching join only when all intervening branches are fully consumed and have no bypass or cross-edge. For separate None Ends, use a private analysis sink to check complete branch coverage; do not emit a runtime join or pretend the first End completes the scope. Preserve multiplicity. Reject leftover vertices, incomplete/crossing regions and additional starts. No business ID or fixture-name predicate is permitted.

Independently compute reachable control frontiers and the maximum automatic burst between externally completed waits. Task/effect completion resumes only its owned branch; parallel siblings survive. Reject a graph exceeding the bound before Start. Start must supply the collection, optional Boolean condition variable and every enclosing scalar referenced by body initialization, regardless of matching body-input target names. For reads inside the initialized body, declared body locals and the current item need no additional Process binding; other enclosing references must be supplied at Start. Present null is a supplied binding, not an absent one. This deliberately conservative availability rule avoids guessing which branch writes first. Completion patches cannot write the collection, item or handler names; they may write the selected condition name only with a Boolean value. Mapping targets retain the stricter protected-name set above, including the condition name. A rejected patch changes no state, identity counter or publication.

## Definition and runtime account

The checked graph adds a distinct sequential-MI Sub-Process variant referencing its child definition scope. Lowering introduces the following entry/completion pair; existing body Task, fork/join and None End operations remain ordinary scoped operations. The child's completion operation names its entry, so it cannot independently select a parent continuation or repetition policy.

```ts
import type { VariableMapping } from "../../packages/semantic-core/src/semantic-value-contract.js";

type EnterSequentialMultiInstanceScopeOperation = Readonly<{
  kind: "enterSequentialMultiInstanceScope";
  id: string;
  input: string;
  childEntry: string;
  childScopeId: string;
  normalOutput: string;
  collectionName: string;
  itemName: string;
  bodyInputs: readonly VariableMapping[];
  completionBooleanName: string | null;
}>;

type CompleteSequentialMultiInstanceScopeOperation = Readonly<{
  kind: "completeSequentialMultiInstanceScope";
  id: string;
  entryOperationId: string;
}>;
```

An outer Activity occurrence owns the repetition controller and exactly one active child scope when the total is positive. Reuse fresh scope issuance and the complete [quiescence predicate](../../packages/semantic-core/src/semantic-process-scope-runtime.ts). The controller stores fixed total and completed count independently of Task outputs. The outer Activity's child-scope body is the authoritative current-child reference; do not duplicate it in a second controller field.

```ts
import type { ActivityOccurrenceId } from "../../packages/semantic-core/src/activity-occurrence.js";

type SequentialScopeController = Readonly<{
  id: ActivityOccurrenceId;
  total: number;
  completed: number;
  currentItem: string;
}>;
```

Collection/item names resolve from the immutable entry operation; the controller does not duplicate them. The item is captured when its body is generated. Body-local bindings are stored in an occurrence-keyed `variables.scopes` collection alongside existing Activity locals and callable-Process interfaces. They have one exact live child owner, unique canonical names and no inherited values copied into them. A lookup searches the current Activity, body declarations, current MI item, then enclosing Process as applicable; present null stops lookup. User completion writes the nearest existing mutable body/Process binding, or creates a Process binding when absent. Only the selected condition variable accepts Boolean; other submitted values are string/null. Service output evaluates its explicit supplied local result and applies the same enclosing write rule. No output fallback to a same-named parent is admitted. Input snapshots and completion writes are atomic.

Entry consumes the parent token once. Empty input produces the parent continuation without child, controller or local data. Positive input issues one outer Activity and child occurrence, binds item zero, initializes body locals and offers its entry token. Child Task/effect activation uses monotone occurrence counters and retains the child owner. A Task ending does not increment the repetition count.

At child quiescence, one completion operation disposes that child's bindings and lifecycle record, increments completed, and tests natural exhaustion or the selected condition. On either terminal arm it removes the controller/outer occurrence and emits one parent token. Otherwise it reads the next indexed item from the named collection, issues a fresh child and initializes its locals; it emits no parent token. An ordinary `completeScope` must not also own this child completion. The declarative relation has separate empty-entry, positive-entry, next-body and terminal constructors; evaluator dispatch and constructor selection are checked independently of the laws below.

No engine-internal construct becomes a BPMN Activity: the controller is synthetic private state; the outer MI Activity and inner Sub-Process bodies derive from the one source Activity with distinct occurrence roles. Body scopes, tokens and local frames have one owner and are deleted together. Public IDs contain no CIB execution IDs, Temporal Run IDs or Activity attempt numbers.

## Public observations and commands

Reuse Start, content-bound User Task completion and effect-result commands. Each Task and effect publishes its exact current identity. A fresh command addressing any previous body's interaction rejects with exact predecessor-state and publication preservation; transport deduplication does not turn an old identity into the current one.

Generalize MI progress with a mandatory `bodyKind` discriminator, `userTask` or `subProcess`, replacing all current producers/readers atomically. Existing Task iteration fields retain their meaning. A Sub-Process iteration exposes its loop counter, engine-issued body scope identity, current item, body-local bindings and the exact owned User Task/effect IDs. These memberships are core projections, never reconstructed by the platform. It exposes no general scope tree or private controller. E1 records outer and body births/ends separately and binds every inner occurrence to its body. E2 and command responses use committed data only.

```ts
import type { ScopeOccurrenceId } from "../../packages/semantic-core/src/semantic-process-state.js";
import type { EffectOccurrenceId, UserTaskInstanceId, VariableBinding } from "../../packages/semantic-core/src/contract.js";

type OpenSubProcessIteration = Readonly<{
  loopCounter: number;
  body: ScopeOccurrenceId;
  item: VariableBinding;
  bindings: readonly VariableBinding[];
  userTaskIds: readonly UserTaskInstanceId[];
  effectIds: readonly EffectOccurrenceId[];
}>;
```

Retain existing standard progress-counter meanings: planned is the entry total; completed counts finished bodies; active is one while a body exists; generated is completed plus active; pending is total minus generated; terminated is zero for an open controller. CIB `nrOfInstances` corresponds to planned, not generated. Closing the controller removes its open-progress row. No partial or final output collection is invented; selected Process writes remain visible and body locals disappear on turnover.

## Rules and evidence matrix

| Rule | Meaning and layer | Lean/core discriminator | CIB and Temporal evidence |
|---|---|---|---|
| `SMIS-ENTER-01` | BPMN count-once, empty completion and one active body | Zero/two items; no zero-item identity issuance; total never changes | Existing lifecycle probe; empty hosted run and exact publications |
| `SMIS-END-01` | BPMN body quiescence, then one next body or parent continuation | Both inner branch orders; first-End mutation; duplicate child-completion refusal | Existing two-order probe; replacement with a sibling still open |
| `SMIS-DATA-01` | Selected CIB local initialization, nearest enclosing writes and null | Same-name parent/body bindings, missing-parent rejection, present-null acceptance, declaration-order independence, reinitialization and null | Existing data probe/control; exact state across rollover |
| `SMIS-IDENTITY-01` | Project occurrence ownership and stale refusal | Fresh body/Task/effect IDs; earlier-body result cannot settle later work | Public Task staleness probe; delayed old result and retry identity |
| `SMIS-EARLY-01` | BPMN condition after whole-body completion | Boolean condition patch accepted, non-Boolean rejected; true while one branch waits cannot advance; terminal arm issues no next child | Existing early-completion probe; same explicitly ordered commands |
| `SMIS-ADMIT-01` | Project bounds and disclosed restrictions | Renaming/permutations, crossed region, collection-write and eight/nine-step negatives | Source/IL agreement; pre-start host refusal while unqualified |
| `SMIS-PUBLISH-01` | Project committed lifecycle/data/progress | Exact E1/E2, scope membership, wrong-owner projection mutation | Full paginated publications and all-Run replay |

Initialization discriminators must reject `status=${status}` without Process `status`, accept the same reference when the Process binding is present null, and require Process `a` for `a="seed", b=${a}` regardless of input declaration order. A newly declared local never supplies another input's pre-entry reference.

All rows need independent TypeScript implementation and Lean/TS full-state, observation and refusal agreement. CIB finite probes are account evidence, not Lean proofs or host refinement. Retained expected results stay physically separate from neutral input scenarios.

## Lean assurance lane

Lane shape: proved

Evidence: extend the quiescence basis in [ScopeCompletion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) with a separate repetition account; existing Task-only [SequentialMultiInstance](../../BpmnSemantics/SemanticProcess/SequentialMultiInstance.lean) is a boundary comparison, not a proof of Sub-Process behavior. New quantified ownership, turnover and frame laws are required; none is currently established by these probes.

Prove from admitted source and actual Start reachability: one active child per controller; fixed total and bounded completed count; no parent continuation while owned work remains; fresh next-body issuance; removal of exactly the completed body's locals; preservation of Process and sibling state except declared writes; and one terminal parent continuation. Derive resumption to a real wait or completion within the computed burst bound after every valid completion. Hypotheses may require an explicit well-formed result and current identity, but may not assume the successor, successful evaluator return or desired input availability. No universal fairness, external-handler termination or arbitrary BPMN liveness claim is made.

Nearest non-laws: one child End does not complete the body; sequential outer generation does not imply one inner wait; missing local declaration does not imply local ownership. Check these separately from dispatcher soundness. Budget at most three new focused proof owners at the existing 800-nonblank-line review target, plus cohesive shared lemmas; reassess at the ownership/data bridge before broad assembly. If the bound cannot close, record the exact unresolved theorem rather than weakening it or adding per-model proofs. Lean remains one process tree, one CPU and 3 GiB without additional swap.

## Temporal hosting and refinement preflight

One Temporal Workflow hosts the parent and every body; no Child Workflow is introduced. Durable ingress remains Start/User Task Update and Activity-result delivery. Passive User Task waits coexist with the admitted effect waits. Schedule each effect from its committed argument snapshot and occurrence key; process results through the same serialized semantic command boundary as human commands. Arrival order is explicit, never inferred from Promise enumeration. Multiple enabled internal steps require the existing proved preparation/choice mechanism, not array-order dispatch.

The state relation preserves exact source/profile identity, outer and child ownership, counts, current item, all data frames, pending effects, command recovery and complete E1/E2. Continue-As-New must serialize the current controller/frame/identity high-water marks together; retry preserves one semantic effect key, whereas the same Service Task in the next body receives a new key. Duplicate, delayed and replayed results cannot mutate a later body. Technical Activity failure retains the existing explicit host-failure boundary and does not become early completion or a BPMN Error. No exactly-once external-side-effect claim is made.

No timer, subscription or boundary-cancellation mechanism is selected here. Early completion occurs only after the current body is quiescent, so it prevents future sequential bodies rather than cancelling unfinished current work. Mutable collection writes are rejected at ingress and by static mapping admission; the demonstrated missing-next-item rollback is therefore outside admitted executions, not suppressed by retry. Later mutation support must revisit the case where a durable effect result is followed by a failed next-item lookup.

The smallest witness uses a two-item invoice batch with parallel human checks, mapped validation and human confirmation. Replace a Worker after one check, carry a pending validation through Continue-As-New, finish the first body, reject an old completion after the second starts, finish the second and verify one parent continuation. Compare complete publications, current data, every effect request/result and replay every Run. Add zero-input, true-condition and technical-failure controls. Preflight supplies no green qualification: public start must remain explicitly unavailable until functional recovery/replay and independent closure pass.

## Versioning consequences

Apply the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy): current formats change atomically, with no legacy reader or fallback representation. Update checked source, IL, strict shared/Lean readers, schemas, runtime serialization, command/publication projections, scenario artifacts, CIB projectors where selected, continuation admission, tests and platform consumers in the same representation increment. Revalidate every old Task-only observation against its unchanged semantic meaning and new discriminator. Tests use fresh Temporal histories; no durable-history compatibility is claimed.

Producer/consumer routes are the [source package](../../packages/bpmn-source/README.md), [shared wire contracts](../../contracts/README.md), [Lean scope account](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean), [semantic-core exports](../../packages/semantic-core/src/index.ts), [Temporal source owners](../../packages/temporal-adapter/SOURCE-MAP.md), [CIB projections](../../runners/cibseven/SOURCE-MAP.md) and [corpus admission](../../model-corpus/README.md). The executable consumer, schema and publication censuses below own the exhaustive concrete switch/reader inventories; editing only the four headroom owners is insufficient.

### Owners this implementation grows

Mechanically inspected owners and their measured headroom are below. A structural split is required only if planned growth would exceed the measured target; these figures cease to apply when the owner changes and must be recomputed before editing.

| Owner | Headroom before 800 nonblank lines |
|---|---:|
| [IL contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 135 |
| [Runtime state](../../packages/semantic-core/src/semantic-process-state.ts) | 346 |
| [Scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 539 |
| [Public contract](../../packages/semantic-core/src/contract.ts) | 311 |

The `what-binds` inventory requires [operation consumers](../../scripts/semantic-operation-consumer-census.test.ts), [runtime cleanup completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [Activity ownership](../../scripts/activity-occurrence-writer-census.test.ts), [shared schema coverage](../../scripts/contract-schema-coverage.test.ts), [publication coverage](../../scripts/execution-publication-contract-coverage.test.ts), [Lean/source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [artifact relationship references](../../scripts/contract-artifact-projections.test.ts) and [reviewability](../../scripts/document-reviewability.test.ts). These are constraints on implementation, not proposed exemptions. Run binding discovery again for concrete new source/Lean/host paths before editing them.

## Acceptance and epistemic closure

Close only with applicable proofs, independent Lean/TS execution, source/IL negative admission, the selected CIB relation and retained answer-free comparisons, required review stages, functional Temporal recovery/replay, and usable whole-process acceptance. Public promotion atomically adds the profile, [corpus](../../model-corpus/README.md) model/pipeline binding, capability/restriction row, generated map and Product 2 disclosure. Reuse existing business Activity interfaces; a test-only delegate does not satisfy public handler delivery.

The nearest unsupported claim is general MI Sub-Process support: parallel outer bodies, mutable collections, interruption, deeper nesting and wider predicates remain open. Shared XML lowering and a shared interpretation are common-mode risks; independent raw-graph/IL negatives, CIB controls and deliberate wrong-owner/first-End/stale-result mutations address them. Compare baseline-to-closure cost with the ordinary embedded-scope and mixed-task increments in the [cost ledger](../CAPSULE-COST-LEDGER.md); unknown authoring cost remains unknown.

## Implementation progress

The private [body topology checker](../../packages/semantic-core/src/structured-parallel-body-analysis.ts) consumes each node and edge once using an explicit region stack. Its [tests](../../packages/semantic-core/test/structured-parallel-body-analysis.test.ts) separate serial/nested parallel/separate-End bodies from crossing regions, partial joins, implicit forks/merges, cycles and disconnected material. Parallel edge multiplicity is retained. The private [burst analysis](../../packages/semantic-core/src/parallel-body-burst-analysis.ts) counts entry, resumption and terminal body operations, including parallel activation and delayed joins; [an independent frontier interpreter](../../packages/semantic-core/test/parallel-body-burst-analysis.test.ts) checks concrete schedules and eight/nine-step discriminators. Child Start is elided as in existing lowering; MI entry/completion and parent continuation costs must be composed separately. These components have no source/IL admission caller yet and establish no repeated-scope execution, Lean burst proof or hosting evidence.

The private [TypeScript storage](../../packages/semantic-core/src/scope-variable-data.ts) and [Lean storage laws](../../BpmnSemantics/SemanticProcess/ScopeVariableData.lean) add complete-occurrence body frames, pre-entry mapping, present-null shadowing, nearest-existing writes and exact disposal. [Lean discriminators](../../BpmnSemantics/ScopeVariableDataConformance.lean) and [TypeScript tests](../../packages/semantic-core/test/scope-variable-data.test.ts) cover the same missing-parent, declaration-order, owner-collision, null and turnover controls. Shared completion/cancellation/call cleanup includes the new collection; retained-root Terminate preserves its frame. Continuation ingress requires the field without a legacy default and refuses nonempty body data; shared MI ownership/profile validation remains part of admission work. This is storage evidence only: source/IL selection, command policy, MI execution, complete Lean/TS scenario agreement and hosted recovery remain open.

The private [source declaration reader](../../packages/bpmn-source/src/sequential-multi-instance-subprocess-source.ts) projects collection/item names, exact completion-variable references and canonical body inputs. Its [parsed-XML controls](../../packages/bpmn-source/test/sequential-multi-instance-subprocess-source.test.ts) cover both BPMN expression representations, protected names, unsupported MI forms, output rejection and initialization dependencies independent of local declarations. Parameter text follows CIB Seven 2.2.0 `BpmnParseUtil.parseParamValueProvider` trimming; empty source text denotes an excluded null literal. The shared mapping reader preserves existing Service-profile restrictions. Complete graph admission, checked-source/IL dispatch and execution remain open.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `1c665017` | `fork-turns-none` | `approve-with-required-edits` | `49c720fb` |
| Semantic checkpoint | `038fa643` | `fork-turns-none` | `approve` | `not-required` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
