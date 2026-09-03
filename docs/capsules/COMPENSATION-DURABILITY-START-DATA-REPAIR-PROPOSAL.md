# Compensation durability start-data repair proposal

## Status

Lifecycle: draft
Review: pending

## Prior authority and defect

The independently approved [Compensation trigger and handler proposal](COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md) requires an Event Sub-Process handler with `restoredProcessBinding` to receive exactly one frozen value from its declared Process binding. Missing, duplicate, or extra values make trigger construction invalid. The independently approved [Compensation source and lowering proposal](COMPENSATION-SOURCE-LOWERING-PROPOSAL.md) lowers the exact `Property_TravelDetails -> DataInput_TravelDetails` association into that contract, but deliberately selected an empty Process-start value domain for its source-only host-refusal checkpoint.

The later durability stage removed the host-refusal boundary without first making the lowered Program reachable. The real compiled source starts and reaches all three ordinary User Tasks, but the final branch completion at the parallel join is rejected in both completion orders: the promoted `SubProcess_ArrangeGroundTravel` snapshot contains no `Property_TravelDetails`, so `handlerArguments` cannot construct the required compensation argument and the whole transition preserves the pre-command state. The hand-built semantic fixture carries a seeded completion context and therefore did not expose this source-to-runtime contradiction.

This is a semantic admission defect, not a Temporal scheduling defect. The exact invariant is: every admitted start of this checkpoint Program must install the one Process binding that every reachable required restored-input handler will later read. A default `null`, reconstruction from current state, handler omission, or host-side argument synthesis would violate the already approved missing-source refusal and frozen-snapshot rules.

## Question and bounded outcome

What is the smallest correction that makes the exact lowered Compensation source Program executable through its approved trigger semantics without widening handler meaning, source shape, or public capability?

This proposal selects one exact String-valued Process-start binding whose name is derived from the sole `restoredProcessBinding.sourceName` in the admitted Program. For the current source that is `Property_TravelDetails`. Both semantic accounts reject an empty patch, a wrong name, another binding, duplicate bindings, or a non-String value before creating runtime state. The existing Process-start installation then places the admitted binding in Process scope, ordinary Sub-Process completion freezes it, and compensation activation copies that frozen value under the already lowered `argumentName`, `DataInput_TravelDetails`.

The BPMN source bytes, checked graph, Semantic Process Program, trigger transition, snapshot transition, Activity request, public observation, and terminal receipt do not change. The checkpoint profile remains unregistered and carries no public Product 1 capability. The repair permits only the already approved private durability witness to reach the scheduler that is being implemented under the trigger proposal's reviewed Temporal preflight.

## Required, optional, and excluded functionality

**Required:** the checkpoint profile's Process-start value-kind cell changes from empty to String-only in TypeScript and Lean; a Program-sensitive admission predicate derives the complete required source-name set from `compensationExecution.subjects` whose body input is `restoredProcessBinding`; for the exact checkpoint it admits one and only one canonical binding with that name and a String value; both pre-start support assessment and command dispatch call the same predicate; two real-source traces complete the parallel branches in opposite orders and reach the same B/C compensation frontier with the exact frozen argument; Product 1 assessment and start reject every malformed start before `client.start` and admit the exact start once.

**Optional:** the positive witnesses may use different nonempty String contents to prove that the value is transported rather than hard-coded.

**Excluded:** Null, Boolean, Integer, String-list, multiple start bindings, optional start data, defaults, expressions, assignments, Activity output, source XML changes, general Process-property initialization, wider Compensation data mapping, current-state reconstruction, another handler input, registered profile or scenario, CIB behavior, public capability, Product 2, and any change to Temporal scheduling, retry, cancellation, Continue-As-New, Worker replacement, replay, or receipt semantics.

This restriction is checkpoint-specific and does not state the general meaning of BPMN Compensation or Process Properties. A later registered profile may widen start data or handler mappings through a new reviewed contract without reinterpreting a Program admitted here, because this checkpoint identity and its exact start predicate remain closed.

## Stable rule and transition boundary

`COMPSTART-DATA-01`: for the exact Compensation source checkpoint profile, an ordinary Process start is admitted if and only if the Program has the already admitted Compensation declaration and the canonical start patch contains exactly one String binding for every distinct `restoredProcessBinding.sourceName`, with no other binding. Admission derives names from immutable Program definition data, not from display names, source traversal, a Temporal request, current RuntimeState, or the fixed fixture literal.

This rule changes only external start admission. On success the existing start transition installs the supplied patch unchanged; the approved snapshot and handler rules later decide when it is frozen and restored. On failure the existing command contract returns `rejected` with exact pre-command state. No new RuntimeState field, operation, stimulus, command outcome, effect result, or observation is introduced.

## Cross-target invariant matrix

| Fact | TypeScript semantic core | Lean account | Source compiler | Temporal/Product 1 |
|---|---|---|---|---|
| Required binding identities | Derived from distinct restored-input `sourceName` values | Derived from the same Program declaration | Preserves the already checked Property identity | Receives only the admitted start; never invents a binding |
| Required current cardinality | Exactly one canonical binding | Exactly one canonical binding | Exact checkpoint still lowers one restored input | Rejects malformed starts before Workflow creation |
| Admitted value kind | String only | String only | No value is embedded in BPMN bytes | Transports the exact String unchanged |
| Snapshot and argument value | Existing transitions freeze and restore the supplied value | Existing relations freeze and restore the supplied value | Existing `sourceName`/`argumentName` lowering unchanged | Schedules only the resulting committed wait |
| Explicit non-requirements | No general start-data or handler-data widening | No new general theorem beyond this exact admission | No XML, checked, Program, or digest change | No public profile registration or capability claim |

## Separating witnesses and laws

The primary red witness compiles the exact BPMN source, starts it with the formerly admitted empty patch, completes `ReserveHotel`, `ArrangeGroundTravel`, then `IssueInsurance`, and observes that the last completion is rejected with no compensation wait. The independent second instance completes `IssueInsurance` first and `ArrangeGroundTravel` last and observes the same final rejection. These traces predict the same mechanism because whichever branch arrives last fires the join and trigger over the same missing snapshot binding.

After correction, the empty start must reject before runtime creation. The positive traces start with exactly `{ name: "Property_TravelDetails", value: { kind: "string", value: ... } }`, then reach the same two-member maximal compensation frontier in both ordinary completion orders. The `DataInput_TravelDetails` argument must equal the earlier frozen String even if a diagnostic state mutation gives current Process scope a different value before trigger activation; the existing delayed-restoration witness remains the authority for that non-reconstruction law.

Mutations replace the binding name with `DataInput_TravelDetails`, add an unrelated String binding, duplicate the source binding, remove it, or change only its value kind. Each must reject with exact state preservation. A Program mutation changing the restored source name changes the required start name rather than continuing to accept the fixture literal, proving Program-derived identity.

The longest internal closure does not change: the same Program topology and operations execute after start, and this proposal adds only a pre-transition predicate. Existing closure-bound, multiple-enabled parallel-state, compensation-frontier, stable-resumption, and terminal-completeness evidence therefore remains applicable. The real-source positive trace is the new discriminator that the formerly unreachable stable path now reaches its explicit effect resumption surface.

## Lean assurance lane

The Lean lane is **checked** for the exact admission correction. Lean changes the checkpoint Process-start domain to String-only, adds the same Program-derived exact binding predicate to command admission, decides the positive binding and the empty, wrong-name, extra, duplicate, and wrong-kind refusals, and keeps the existing source lowering and Compensation runtime proofs unchanged. No new `native_decide` exception is selected. The first changed target build stays root-owned under the unchanged 3 GiB memory ceiling.

## BPMN and CIB boundary

BPMN 2.0.2 remains authoritative for the Process Property, DataInput, direct DataInputAssociation, Compensation Event Sub-Process, and handler attachment already selected by the source proposal. BPMN does not prescribe this project's external start-command representation. `COMPSTART-DATA-01` is therefore a checkpoint profile admission decision that supplies a value to the already modeled Property; it is not a claim that BPMN standardizes a String-only environment or that CIB Seven does so.

No CIB target or relationship is selected. The registered CIB Process-start extension and its profile remain unchanged, and no CIB evidence is reused as proof of this standards-only source checkpoint.

## Temporal hosting and refinement preflight

Durable ingress remains the ordinary Product 1 start command. The repair adds no wait, timer, Signal, Update, Activity, cancellation action, lifecycle state, projection, or replay branch. Before Workflow creation, semantic admission requires the exact Program-derived binding. The initial Workflow argument and every Continue-As-New successor already carry the complete RuntimeState, so the installed Process binding and the later frozen snapshot are preserved by exact state transport rather than reconstructed from Event History or Activity arguments.

The scheduler may create compensation Activities only from committed `compensationHandlerEffectWaits`; the B wait therefore carries `DataInput_TravelDetails` with the frozen start String through the existing content-bound compensation transport tuple. Retry repeats the same request and key. Worker replacement and replay must recover the same state and bytes. Pre-schedule Continue-As-New carries the unscheduled wait; in-flight Continue-As-New remains forbidden. C failure, B cancellation drain, and terminal receipt semantics are unchanged because the start value does not select handler outcome.

The smallest live witness starts the exact compiled source with one valid binding, completes its ordinary tasks, observes concurrent B/C Activity scheduling with the restored B argument, and completes A only after B. It is combined with the already required forced pre-schedule continuation, Worker replacement, retry/response-loss, semantic failure/cancellation, and replay witnesses. The nearest host counterexample is accepting an empty or wrong-name start and failing only when the final ordinary task reaches the trigger; the pre-start assessment and zero-`client.start` tests must reject that class.

## Versioning consequences

| Claim | Decisive evidence |
|---|---|
| Root mechanism | Opposite parallel completion orders both fail at the final join before correction and both reach the same compensation frontier after it |
| Exact start contract | TypeScript and Lean accept one Program-derived String binding and reject empty, wrong, extra, duplicate, and wrong-kind patches |
| Source/Program preservation | Existing exact checked and Program fixtures and source SHA remain byte-identical |
| Frozen restoration | The real compiled source produces the exact B argument from the completion-time snapshot, with a current-value mutation unable to replace it |
| Product 1 pre-start safety | Assessment and client tests reject malformed starts with zero `client.start` calls and admit the exact start once |
| Temporal refinement | Live exact-source concurrency, continuation, replacement, retry, cancellation-drain, terminal receipt, and replay evidence required by the trigger proposal |

The implementation grows [semantic profile value-domain admission](../../packages/semantic-core/src/semantic-profile-value-domain.ts), [semantic execution admission](../../packages/semantic-core/src/semantic-process-admission.ts), [semantic command admission](../../packages/semantic-core/src/semantic-command-admission.ts), [Lean value-domain admission](../../BpmnSemantics/SemanticProcess/ValueDomain.lean), [Lean command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean), [Lean checkpoint conformance](../../BpmnSemantics/CompensationSourceCompatibilityConformance.lean), and the [Product 1 source admission witness](../../packages/temporal-adapter/testkit/test/compensation-source-host-refusal.test.ts). The exact predicate belongs in a bounded sibling owner rather than duplicating profile logic across the two TypeScript callers.

Mechanically routed guards include [documentation reviewability](../../scripts/document-reviewability.test.ts), [semantic review packets](../../scripts/semantic-review-packet.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [test selection coverage](../../scripts/test-selection-coverage.test.ts), [pre-release architecture](../../scripts/pre-release-architecture.test.ts), and [source hygiene](../../scripts/source-hygiene.test.ts). The [semantic-core README](../../packages/semantic-core/README.md), [semantic-core source map](../../packages/semantic-core/SOURCE-MAP.md), [Temporal adapter README](../../packages/temporal-adapter/README.md), [Temporal source map](../../packages/temporal-adapter/SOURCE-MAP.md), routed implementation maps, and [PLAN](../PLAN.md) change only when implementation makes their current statements false.

### Owners this implementation grows

| Owner | Current headroom | Structural condition |
|---|---:|---|
| [Semantic profile value domain](../../packages/semantic-core/src/semantic-profile-value-domain.ts) | 541 | value-kind dispatch only |
| [Semantic execution admission](../../packages/semantic-core/src/semantic-process-admission.ts) | 371 | one predicate call only |
| [Semantic command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 364 | one predicate call only |
| [Lean value domain](../../BpmnSemantics/SemanticProcess/ValueDomain.lean) | 675 | value-kind dispatch only |
| [Lean command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) | 249 | predicate definition and one dispatch branch only |
| [Lean checkpoint conformance](../../BpmnSemantics/CompensationSourceCompatibilityConformance.lean) | 773 | exact positive and negative decisions only |
| [Product 1 source witness](../../packages/temporal-adapter/testkit/test/compensation-source-host-refusal.test.ts) | 650 | exact start and malformed pre-start cases only |

The new TypeScript predicate starts in its own bounded owner. Every figure is the measured nonblank-line remainder below the 800-line review target. If these measured conditions change before implementation, rerun `what-binds` and redesign before crossing the threshold; no size-limit exception is selected.

### Pre-release contract consequence

This is a pre-release correction to an unregistered checkpoint profile. Existing registered profile artifacts, source bytes, checked bytes, Program bytes, public protocol, and durable history schemas remain unchanged. Starts previously accepted only for this internal checkpoint with empty or otherwise String-only unrelated bindings become rejected; no supported external client loses a contract because the profile has no public registration or capability.

The established claim after closure is exact-source reachability of the already approved Compensation semantics and their dedicated Temporal scheduler from one required String Process binding. The nearest unsupported claim is a registered or public Compensation profile. Principal common-mode risks are deriving the required name from the fixture in both implementations, testing only the hand-built seeded state, or letting host admission compensate for weaker semantic admission. Program-name mutation, both branch orders, independent Lean construction, and zero-start Product 1 evidence separate those accounts.

Implementation stops if the correction requires source XML changes, a default value, optional data, another value kind, a general mapping rule, runtime argument synthesis, a new public surface, or any weakening of missing-source refusal. Closure records the commit-bounded cost against the source/lowering checkpoint because it changes the same TypeScript/Lean admission seam, then updates the original source proposal's obsolete empty-domain/host-refusal status as historical checkpoint scope without rewriting its approved rules.

## Stage boundary

After proposal approval, implementation first makes the TypeScript and Lean exact start predicate red then green, proves both real-source completion orders reach the same compensation frontier, and updates Product 1 pre-start refusal. Only then may the in-progress durability scheduler count the exact source as live evidence. This repair and the scheduler may share the eventual semantic-checkpoint commit because neither is a coherent advertised capability alone; closure still requires the trigger proposal's complete live Temporal, replacement, continuation, retry, cancellation, receipt, replay, documentation, and independent review obligations.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
