# Call Activity scalar data boundaries proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and boundary

Can one statically resolved in-document Call Activity transfer a required scalar input to a distinct called Process, receive its required scalar output only on normal return, and preserve caller/called data isolation through the independent Lean and TypeScript accounts?

This is the second owner-selected semantic increment in [PLAN](../PLAN.md#ordered-work), outside the frozen MUE acceptance scope. The [existing Call specification](CALL-ACTIVITY-SPEC.md) remains the implemented empty-data contract. This proposal selects no implementation or public support until independent account review passes. Private semantic work precedes hosting qualification and registration under the owner-selected semantics window; those deferred lanes remain closure obligations.

## Normative basis and interpretation

Use the pinned [Markdown reading copy and normative machine-readable artifacts](../reference/bpmn-2.0.2/README.md#reading-workflow). Clause 10.3.6 requires corresponding Call Activity and CallableElement DataInputs, DataOutputs, InputSets and OutputSets. Clause 10.4.1, **Call Activity Mapping**, maps corresponding Call and callable ports automatically, without an explicit DataAssociation between them. Their separately contained declarations have distinct XML IDs; matching does not mean reusing those IDs. Clause 13.3.4 supplies called-instance completion and caller continuation.

Clause 10.4.1, **Data Associations**, explicitly describes copying Process DataInputs into Activity inputs and Activity outputs into Process DataOutputs. Its **DataOutputAssociation** account permits any accessible ItemAwareElement as the target. Clause 10.4.2 supplies direct-copy semantics, input availability and output write-back. Caller associations must target/source the Call Activity's own ports; the standard's expanded diagram does not authorize a caller association directly into the called Process.

There is an internal wording inconsistency: Clause 10.4.1, **Data Output**, says only Activity/Event-contained DataOutputs may be association targets, contradicting the explicit Process-output destination above. The reading copy contains both passages; this is not an extraction gap. The proposed interpretation follows the explicit data-flow purpose and general accessible-target rule: a task-owned output association may target its containing Process's DataOutput. It does not permit cross-Process associations. Independent proposal review must assess this choice; no general conformance or resolved-OMG-issue claim is made.

The singleton interface restriction makes correspondence unambiguous without inventing a general name-based port matcher. Both interfaces have one required non-collection input and output, one singleton InputSet and OutputSet, no optional/while-executing members, no set-pairing references, no ItemDefinition or DataState, and no transformations or assignments. These semantic attributes and relationships match. IDs remain globally distinct; optional names are descriptive and do not determine correspondence. Multiple-port matching remains deferred rather than inferred from this restriction.

The requirement is `BPMN-CALL-DATA-01`, distinct from the existing empty-data `BPMN-CALL-ACTIVITY-01`. It remains unsupported in the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) until a reviewed executable disposition exists. The value boundary reuses the [composed Activity data account](ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md): bounded string or explicit null is available; an absent binding is unavailable.

## Required, optional and excluded scope

Required: exactly two private executable Processes and the namespace-qualified static binding from the existing Call profile. The caller is None Start → Call Activity → data-bearing User Task → None End. The called Process is None Start → data-bearing User Task → None End. The Call and called Process each declare the matching scalar interface above. Each User Task has one composed direct input/output interface. All declaration, association, node and flow identities are arbitrary valid globally distinct IDs; references resolve by identity and exact owner.

The caller has distinct request, result and receipt Properties. Its Call input association reads request and fills the Call input. Its Call output association writes result. Its following task reads result and writes receipt through its own Task ports. The called Process has no Properties: its task input association reads the called Process DataInput, and its output association writes the called Process DataOutput. No association crosses a Process boundary. The automatic Call/Callable correspondence is the only data transfer across it.

Optional: display names; additional unused caller Properties; initial values for any declared caller Property, provided request is present and every value is an admitted scalar. An initial result permits a discriminator for premature overwrite. No undeclared start name is accepted. Caller associations, called ports and task ports may be renamed independently while preserving their references; the resulting execution must follow those references.

Excluded: general called-Process Properties, variable inheritance or copy-all, nested or repeated calls, recursion, dynamic binding, imports, deployment/version/tenant resolution, Global Tasks, another topology, gateways, loops, Multi-Instance, boundary Events, exceptional return, BPMN cancellation, Compensation, effects, subscriptions, general expression evaluation, collections, optional/while-executing ports, missing-input reevaluation ingress, new commands/value kinds, platform forms, and a CIB Call compatibility claim. Admitted definitions and interface meanings remain extensible by later profiles without reinterpreting this one.

## Public contract and data flow

The selected path is:

```text
caller request Property → Call DataInput → called Process DataInput → called Task DataInput
called Task DataOutput → called Process DataOutput → Call DataOutput → caller result Property
caller result Property → caller Task DataInput; caller Task DataOutput → caller receipt Property
```

Start accepts the exact initial caller bindings and requires request to be available before committing. It reaches the called task under the existing derived semantic instance ID. Completion requires exactly one scalar binding named by that task's own DataOutput ID. The called result remains distinct from caller Properties until normal return; return requires both exact called-root quiescence and an available required Process output. The caller task then exposes its copied result. Caller completion writes receipt and reaches ordinary terminal state. Each rejected command preserves the complete input state and publishes nothing.

Canonical top-level instance identity and variables remain those of the caller. An open called task publishes only its own copied Task DataInput through the existing `inputs` field. Called Process interface storage is private. The existing task-detail request may select caller Properties only for a task owned by the hosting caller instance; a called task returns no caller `inputVariables`, even when requested names match. Its published Task inputs remain available. This restriction follows semantic ownership, not the Workflow address used to route the request.

No new stimulus, public outcome, wait kind or lifecycle event is selected. E1/E2 must retain the called occurrence identity and actual order of invocation, task completion, normal return and caller continuation. Public support requires the existing compile/start/observe/command path; the platform may not reconstruct called data from private state or Temporal history.

## Checked representation and runtime ownership

Preserve the checked definition forest, paired invoke/return operations and distinct called root. Extend their data contract with an explicit empty-interface or scalar-interface variant; the empty-data profile retains its meaning. The checked scalar declaration preserves both interface owners, all port/set identities and membership, matching attributes, and both Call associations. Lowering retains the exact caller Property endpoints, Call ports, corresponding called ports and required-output obligation. Lean independently checks owner/reference closure, global identity separation, singleton correspondence and exact lowering before execution.

The existing direct Activity descriptors currently name only Properties. Replace that endpoint restriction with a closed typed alternative: a task input reads either a containing Process Property or a containing Process DataInput; a task output writes either a containing Process Property or a containing Process DataOutput. Do not put port IDs into fields still named `sourcePropertyId` or `targetPropertyId`. This extends the existing composed task mechanism; it does not add a Call-specific task evaluator or a topology-dispatch operation. Existing profiles continue to select only their existing Property arms.

Add a required `processInterfaces` collection to the current `ScopedVariables` representation, with this explicit element type:

```ts
type ProcessInterfaceScope = DeepReadonly<{
  owner: ScopeOccurrenceId;
  inputs: VariableBinding[];
  outputs: VariableBinding[];
}>;
```

For this profile, each live called root has exactly one such scope, one immutable input binding and zero or one output binding. The owner is the full called-root occurrence, including semantic instance, definition scope and activation. Bindings use declared port IDs. Empty outputs mean unavailable; a present null is available. Interfaces sort by complete owner and bindings by the existing canonical name order. Each interface binding is authoritative only in its owned scope; neither the caller Property store nor the hidden call record mirrors that mutable interface. The input transfer is a snapshot into a distinct semantic data item, not a shared binding.

The existing Process Property store remains the hosting caller's store. A Property endpoint cannot fall back to it from a called owner. Interface endpoints select exactly one matching scope for the current owner, and never search another instance, walk to a parent, or resolve by display name. General per-instance Properties require a later account; separating interfaces now preserves their distinct meaning without prematurely migrating every unrelated Property consumer.

Invocation copies the caller request through the Call's input port into the new called interface in the same transition that creates the called root and call record. The wrapper input is transient within that atomic transfer; no new stable Call-local scope is needed. Task activation copies the selected Process input into the existing Activity-local scope. Task and Activity identities derive from the token owner, not root `state.control`. Task completion fills the exact called Process output and disposes only its own Activity-local scope. The Process interface survives until return.

Normal return copies the selected Process output through the Call's output port into the associated caller Property, removes the exact called interface/root/call record, and emits one caller token atomically. Interface storage is passive data, not live work: it must not itself block quiescence. Missing or duplicate owners/output disable an internal return without partial changes; malformed injected states do not become an accepted completion or a silently defaulted output. The admitted complete trace must establish that this stranded state is unreachable for the selected inputs and commands.

Every generic frame, preparation, scheduler patch, decoder, continuation and cancellation-removal path must preserve or dispose the new collection by its declared ownership. Regional cancellation remains unadmitted here, but its generic removal contract must not leave data for a removed called instance. Host cancellation fabricates no BPMN return or output. These changes preserve all pre-existing theorem propositions and registered behavior; weakening a theorem to exclude newly introduced storage is not migration evidence.

## Stable rules and separating witnesses

| Rule | Required proposition | Nearest wrong account |
|---|---|---|
| `CDATA-MATCH-01` | Exact owned singleton interfaces correspond automatically; caller associations stop at Call ports. | Shared IDs, name matching, mismatched sets, a direct caller-to-called association. |
| `CDATA-INPUT-01` | Invocation snapshots only the associated available request into the fresh called interface. | Inherited caller map, absent-as-null, wrong source or overwrite before invocation. |
| `CDATA-OWNER-01` | Task reads/writes select its complete semantic owner and typed endpoint. | Root-owned called task, Property/port alias, another called instance's input. |
| `CDATA-OUTPUT-01` | Called task completion fills only its Process output; caller writes occur only on exact normal return. | Early caller write, missing-output return, writing under the submitted Task port ID. |
| `CDATA-RETURN-01` | Return removes the exact interface and call once and creates one caller continuation. | Passive data blocks quiescence, broad deletion, stale duplicate return. |
| `CDATA-OBSERVE-01` | Root variables and selected task inputs remain distinct; task-detail cannot expose caller Properties to a called task. | Flattened interface values, root-variable fallback by requested name. |
| `CDATA-REFUSE-01` | Wrong occurrence, output ID, value domain or cardinality rejects without mutation/publication. | Accepting a Process-output ID as a Task completion field or consuming the active input on refusal. |
| `CDATA-RESUME-01` | Every admitted start and accepted completion closes to the next exact task or terminal state within the existing bound. | Data preserved in raw evaluator but lost by preparation, or an enabled return omitted by scheduling. |

Use supplier onboarding as the retained whole-model witness: a caller supplies a supplier summary, the called due-diligence task records a decision, and the caller's final review reads that decision and records an onboarding receipt. Distinct names/IDs for every port and Property make accidental flat-map copying observable. Seed an unrelated caller Property and an initial result to distinguish preservation from premature output. String and null cases are both required.

## Lean assurance lane

Lane shape: proved

Evidence: the existing [Call relations](../../BpmnSemantics/SemanticProcess/CallActivity.lean), [composed task relations](../../BpmnSemantics/SemanticProcess/ActivityDataInputOutput.lean), and [scoped data primitives](../../BpmnSemantics/SemanticProcess/Data.lean) are the starting owners, not evidence for the new account. The implementation must add quantified laws tied to the actual invocation, task and return evaluators: exact input transfer, owner isolation, caller-frame preservation before return, required-output gating, exact target write, single disposal/continuation and rejected-command preservation. Every changed transition has a declarative relation and evaluator-soundness bridge with its exact premises.

The effort bound is two new cohesive law owners, at most 800 nonblank lines each, plus one bounded conformance owner for finite traces. One owns interface selection/copy/write/isolation and one owns invocation/normal-return framing/disposal. Reuse existing identity/pairing and Activity lifecycle laws rather than re-proving them. Existing proof owners remain within their reviewed limits; a necessary extraction preserves propositions and lands separately. Reassess before adding another proof owner, weakening a claim, or exceeding the 3 GiB/no-extra-swap execution bound.

Quantified laws may assume structural Program validity and explicitly stated unique current owner/association hypotheses; their conclusions may not appear as premises. Separate finite admitted-source traces establish those hypotheses at the selected execution boundaries and cover actual scheduled closure. Check exact 3/3/2 internal steps for start, called completion and caller completion, with one-less-fuel rejection and no publication. No global reachability, arbitrary-call progress, fairness or cross-language equivalence theorem is claimed. Full predecessor proofs must still elaborate unchanged in meaning.

## Temporal hosting and refinement preflight

Durable ingress remains one content-bound start plus exact occurrence-addressed completion Updates. The caller ID selects one hosting Workflow; the called task ID selects its distinct semantic occurrence. No Child Workflow, Activity, Signal, Timer, new retry mechanism or external effect is required. The pure core owns interface matching, value transfer, readiness, return and projection. Temporal carries the exact Program, private interface collection, task-local data, call/root association, publications and command-recovery state.

The state relation requires equality of those semantic facts across Worker replacement, Continue-As-New and replay. FIFO accepted-input ordering and content-bound deduplication remain unchanged. A duplicate transport completion recovers its committed result; a new stale command is semantically rejected. The topology has one active task and at most one internal successor at each admitted phase; foreign command identities and duplicate interface owners cannot create a second continuation.

The smallest production witness starts the actual supplier model with request and an unrelated caller value, queries the called task input and checks task-detail isolation, forces a stable rollover, replaces the Worker, rejects wrong/omitted output, accepts the correct called output, and observes the caller's copied result. It recovers the exact retry, completes the caller, checks the receipt and replays every Run. A termination branch before called completion must produce no caller result or BPMN return. Mutations erase the called owner, flatten interface data, drop carried interface state, or apply copy-back before normal return.

Semantic admission and host capability remain separate. The new profile is private and deterministically refused by production host admission until this complete witness is green. Live qualification, profile/scenario registration and corpus disclosure remain deferred under the semantics priority; their absence prevents promotion and closure. Private source/core/Lean execution is evidence only for the semantic account.

## Evidence strategy and cross-target invariants

| Claim | Normative/profile basis | Lean | Independent TypeScript | CIB Seven | Temporal and mutation |
|---|---|---|---|---|---|
| Interface correspondence | `CDATA-MATCH-01`, Clauses 10.3.6/10.4.1 and recorded conflict | Checked declarations and exact lowering | Parser-object ownership, QName and source negatives | No Call-data claim | Wrong port/owner/direction refuses before start. |
| Input and owner isolation | `CDATA-INPUT-01`, `CDATA-OWNER-01`, direct copy | Quantified transfer/frame laws | Independent complete-state expectations | Absent | Flattening and root-ID substitution disagree. |
| Output and return | `CDATA-OUTPUT-01`, `CDATA-RETURN-01`, Clauses 10.4.2/13.3.4 | Required-output and atomic return laws | Before/after caller value and exact disposal assertions | Absent | Rollover/replacement/retry/replay; early-write and retained-interface mutations. |
| Projection and refusal | `CDATA-OBSERVE-01`, `CDATA-REFUSE-01` | Exact projection and state-preservation witnesses/laws | Called task-detail negative and unchanged public shapes | Inherited User Task facts only | Requested caller-secret name yields no called-task Property projection. |
| Bounded resumption | `CDATA-RESUME-01` | Finite actual-scheduler 3/3/2 and exhaustion witnesses | Same answer-free schedules with independent assertions | Absent | Passive-task host predicate and no fabricated return on termination. |

Both semantic targets must agree on explicit endpoint kinds, interface owner and canonical order, distinct input/output identities, absence versus null, derived called task identity, unchanged caller bindings before return, exact associated caller write, cleanup, refused-command preservation and terminal receipt identity. Neither must establish called Properties, recursion, another source topology, general port matching, CIB deployment semantics or live hosting before its separate qualification. Shared XML projection and the reviewed interpretation remain common-mode risks; expected results stay outside neutral inputs.

Source discriminators include independent global renaming and omitted/changed names, declaration permutation, cross-Process association references, duplicate ID across every retained data role, swapped directions, missing/extra/optional ports or sets, set membership mismatch, collections, ItemDefinitions, assignments and transformations. Checked/IL negatives independently alias owners or change the matched called port while retaining superficially valid control topology. Synthetic runtime witnesses use two distinct owner tuples with equal binding names to challenge owner filtering without claiming admitted repeated-call execution.

## Versioning consequences

`what-binds` was run for the new document and the concrete source, data, Call and task-detail owners on 2026-10-03 at baseline `8d0d88bb`. The [source-hygiene guard](../../scripts/source-hygiene.test.ts) enforces limits. A new Process-interface owner keeps selection and canonical lifecycle cohesive; it must not become a second variable representation or an engine-specific mapping subsystem.

### Owners this implementation grows

| Owner | Remaining headroom to the 800-line review target | Constraint |
|---|---|---|
| [Call source reader](../../packages/bpmn-source/src/call-activity-source.ts) | 440 | Keep QName/control admission separate from reusable scalar-interface reading. |
| [Runtime state](../../packages/semantic-core/src/semantic-process-state.ts) | 363 | Declare the interface collection; put its operations in a cohesive data owner. |
| [Call runtime](../../packages/semantic-core/src/semantic-process-call-runtime.ts) | 378 | Extend actual invoke/return and exact cleanup, including prepared patches. |
| [Lean data](../../BpmnSemantics/SemanticProcess/Data.lean) | 509 | Preserve existing Property/local meanings while adding a distinct Process-interface owner. |
| [Lean Call](../../BpmnSemantics/SemanticProcess/CallActivity.lean) | 210 | Separate interface laws before growth would exceed the target. |
| [Lean composed laws](../../BpmnSemantics/SemanticProcess/ActivityDataInputOutput.lean) | 208 | Keep existing propositions while extending endpoints and identity; do not raise its cap. |
| [Lean composed runtime](../../BpmnSemantics/SemanticProcess/ActivityDataInputOutputRuntime.lean) | 624 | Own the existing atomic evaluators and exact task/interface joins. |
| [Task detail](../../packages/temporal-adapter/protocol/src/user-task-detail.ts) | 710 | Resolve requested variables by semantic ownership. |

### Atomic consumers and guards

The input/output contract owners, [input](../../packages/semantic-core/src/activity-data-input-contract.ts) and [output](../../packages/semantic-core/src/activity-data-output-contract.ts), own the typed endpoint replacement. The [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifact](../../scripts/contract-definition-artifacts.test.ts), [metamodel admission](../../packages/bpmn-source/test/metamodel-default-admission.test.ts) and [projected key](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) guards must cover the new Process/Call interfaces and keep every excluded parser key blocking.

The [Activity writer census](../../scripts/activity-occurrence-writer-census.test.ts), [Activity joins](../../scripts/activity-occurrence-join.test.ts), [collection-removal guard](../../scripts/runtime-collection-removal-completeness.test.ts), [internal-commutation census](../../scripts/internal-commutation-census.test.ts), [operation-consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and [canonical ordering](../../scripts/canonical-ordering.test.ts) constrain the new storage, owner-derived task creation, prepared transitions and removal. Changed footprint classifications must remain complete; the new profile does not admit concurrent batches merely because storage is keyed.

The producer/consumer migration includes checked/IL TypeScript and Lean declarations, JSON schemas and both decoders, source reader and admission, both lowerings, standalone Program and exact-definition admission, initialization/value-domain/command selectors, task input/output evaluators, Call preparation/application, well-formedness and framing laws, canonical projection and E1/E2 publication, Workflow continuation codec, task-detail protocol, artifacts, fixture builders and all directly affected proofs. [Shared contracts](../../contracts/README.md), [source ownership](../../packages/bpmn-source/README.md), [core ownership](../../packages/semantic-core/SOURCE-MAP.md) and [Temporal ownership](../../packages/temporal-adapter/SOURCE-MAP.md) must remain synchronized. Run `what-binds` again for each concrete added/grown implementation owner before editing it.

## Closure and compatibility boundary

Apply the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy): replace changed current internal contracts and all producers/consumers atomically, with no legacy reader, optional compatibility field, migration branch or durable-history promise. Existing source/profile meanings and canonical results remain unchanged. Exact checked/IL artifact bytes may change only through the explicit contract migration; retained CIB semantic evidence is not refreshed. The new private profile identity is `bpmn-2.0.2-call-activity-data-boundaries-draft`.

No CIB data relationship is selected. The pinned parser's `parseInputParameter` and `parseOutputParameter` read extension `in`/`out` mappings, while this account uses standard interfaces and direct associations. The [source pin](../SOURCES.md#cib-seven) and [existing Call compatibility boundary](CALL-ACTIVITY-SPEC.md#normative-and-compatibility-basis) govern that comparison; source inspection supplies no executable CIB agreement or deviation. Future profile metadata may retain `CIB-AGR-0001` and `CIB-OP-0001` only for their inherited User Task lifecycle/interaction claims.

Before public support, register the supplier whole model, exact profile/scenarios/pipeline binding, capability/restriction row, generated corpus map and About disclosure atomically after hosted evidence passes. Reconcile the requirement disposition and every affected implementation map. The mandatory semantic checkpoint precedes downstream hosting/registration; closure remains a separate independent review. Keep the established claim (bounded interface transfer) separate from the nearest unsupported claim (general per-instance variables and repeated calls).

At closure, record commit-bounded code/document churn in the [cost ledger](../CAPSULE-COST-LEDGER.md), compared with the [composed Activity data capsule](ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md) and the original Call boundary. Cost does not justify weakening isolation, retained predecessor propositions or exact evidence. Local performance tests remain skipped under external CPU load; mandatory correctness and memory-bound proof checks remain applicable.

## Current implementation boundary

The existing composed Activity evaluators now live in [their runtime owner](../../BpmnSemantics/SemanticProcess/ActivityDataInputOutputRuntime.lean), while their relations and proofs remain in [the original law owner](../../BpmnSemantics/SemanticProcess/ActivityDataInputOutput.lean). The extraction preserves evaluator bodies and theorem propositions; it establishes no Call data behavior. Typed endpoints, Process interfaces and the new transfer laws remain unimplemented.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `b1d41150` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The independent proposal review approved `b1d41150` on 2026-10-03 with no findings. Packet digest: `1b4ca92f6681998ba866e6e16f3e479021e96e5cdbfb68acac10cce653b2ffaf`. The reviewer checked the normative interpretation, singleton correspondence, actual scheduler and task-detail consumers, migration obligations and bounded proof effort. Its nine focused documentation/review files passed 100 tests, and `doctor.sh verify` passed; receipts `/tmp/call-data-proposal-review-docs` and `/tmp/call-data-proposal-review-doctor` were separately asserted. Approval authorizes implementation only; scheduled preservation, live hosting and public support remain unestablished.
