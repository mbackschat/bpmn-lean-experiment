# Transaction cancellation proposal

## Status

Lifecycle: implemented-awaiting-closure
Review: approved-with-required-edits

## Question and bounded outcome

How does one admitted Transaction Sub-Process cancel its live work, compensate its completed eligible work, and release its Cancel Boundary Event only after compensation finishes?

The selected RC outcome is complete from exact BPMN XML through checked source, Semantic Process IL, Lean, TypeScript, production Temporal hosting, paired E1/E2 publication, and public engine commands. This proposal extends scope ownership of the existing Compensation mechanism; it does not select another general scheduling-proof programme. The [RC plan](../PLAN.md#mue-release-candidate-critical-path) remains the scope authority. Proposal approval authorizes implementation; it changes no current admission and claims no executed Transaction capability.

## Current implementation boundary

[`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](../ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md#transaction-cancellation) owns the approved manual-Program checkpoint, source/production-host integration, quantified scheduling, public registration and the remaining qualification boundary. The semantic checkpoint and closure reviews remain governed by the [review receipt](#independent-cold-review-receipt); proposal approval does not approve the implementation.

## Normative authority and interpretation boundary

The pinned BPMN 2.0.2 PDF, Clause 10.3.5, printed pages 176–180, specifies Transaction success, cancellation and hazard as distinct outcomes. Cancellation interrupts running Activities and compensates completed eligible Activities. The attached Cancel Boundary Event receives control after rollback and compensation finish. Ordinary interruption is not an implicit compensation trigger. Successful completion includes participant/protocol verification; ordinary Sub-Process quiescence alone does not implement that outcome.

Clause 10.5.5 restricts Cancel catching to a Transaction boundary and Cancel throwing to an End Event within a Transaction. Clause 13.3.4 supplies Sub-Process lifetime, while Clause 13.5.5 supplies completed-Activity eligibility and reverse dependency compensation. This capsule selects the explicit Cancel End route, not protocol messages, successful protocol completion, or hazard handling. The [normative source registry](../SOURCES.md) owns the pristine PDF and machine-readable artifacts; the PDF and `Semantic.xsd` were inspected directly, with converted Markdown used only for navigation.

The machine-readable `Semantic.xsd` definition `tTransaction` extends `tSubProcess`, and its `method` default is exactly `##Compensate`. `tTransactionMethod` admits that case-sensitive legacy token, `##Image`, `##Store`, and URI values. The printed prose/schema examples use other spellings. Admission selects omission or exact `##Compensate`; it neither case-folds nor treats the other spellings as aliases. [BPMN2-60](https://issues.omg.org/issues/BPMN2-60) records the resolved URI-method change. [BPMN21-404](https://issues.omg.org/issues/BPMN21-404) remains an open general cancellation-terminology issue; the explicit Transaction Cancel account is the boundary used here.

`TXC-CANCEL-01` and `TXC-JOIN-01` are vendor-neutral normative accounts. The finite source surface and capacities are profile restrictions. `TXC-FAIL-01` is a project interpretation extending the existing [Compensation failure account](COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#failure-and-nested-cancellation) to the selected child-owned trigger. It is not claimed as OMG-required hazard behavior or CIB behavior. No CIB Transaction/Compensation relationship is selected; the [relationship register](../CIB-BPMN-RELATION-REGISTER.md) must classify any later compatibility addition before implementation.

## Required scope and exclusions

Required is one depth-one, single-activation Transaction with one Cancel End, one interrupting Cancel Boundary Event, and one ordinary User Task with an explicit boundary Compensation handler. Its handler reuses the closed single-effect descriptor with empty arguments. Both the zero-eligible and one-eligible cancellation cases are required, including an unfinished User Task that must disappear without being compensated. A typed handler failure must reach the already published failed-Process outcome.

The source profile admits a role-based bounded graph: the root has a None Start, the Transaction, one User Task on the Cancel Boundary continuation, and two distinct None Ends. The Transaction's normal outgoing flow targets one root End; the continuation Task targets the other. Each End retains exactly one incoming flow. The normal route cannot be taken in the selected execution. Inside the Transaction, one None Start reaches a two-way Parallel split. Each branch is a linear chain of one or two ordinary User Tasks; one branch ends at the single Cancel End and the other at a None End. Exactly one Task on the non-Cancel branch is compensation-eligible. All flow conditions are absent, all node and flow identities are arbitrary admitted identifiers, and all scopes and references must resolve exactly.

This grammar allows the eligible Task to remain active, complete while another Task remains active, or complete with its branch already ended. The Cancel branch keeps the Transaction non-quiescent until cancellation. It is an explicit bounded graph restriction checked from node roles and capabilities, not a comparison with a fixture's IDs or a new whole-Program equality disjunct. Renamed models, branch serialization order, and both permitted chain lengths are admission witnesses.

The new standards-only profile admits no Process data, Task completion data, assignment/form metadata, Timer, Message, ordinary Service Task, loop, Multi-Instance, Call Activity, nested scope, Event Sub-Process, external cancellation command, additional trigger, or concurrent Transaction. Compensation handler failure has no catch route. Protocol configuration, Cancel messages, successful protocol completion, Error/hazard boundaries, Store/Image methods, implicit/recursive compensation, asynchronous compensation, and generalized Transaction conformance remain excluded. Optional functionality: none for this outcome.

The selected single eligible subject requires no new dependency inference: its occurrence-dependency set is empty. Existing multi-subject root Compensation and snapshot behavior retain their exact account and evidence. Admission can later widen through a separately reviewed profile without changing what cancellation means for these accepted models.

## Definition and runtime contract

Checked source preserves distinct Transaction, Cancel End and Cancel Boundary identities, attached-to references, method selection, and child definition scope. Raw parser objects remain private to the source boundary. A Cancel Boundary on an ordinary Sub-Process, a non-interrupting Cancel Boundary, an unattached or duplicate boundary, a Cancel End outside its Transaction, and any nonselected method are rejected before lowering.

The Semantic Process operation union adds the following closed arm. `output` is a place in the direct parent definition scope, unlike an ordinary child-local continuation. Its exact relation to the Transaction's Cancel Boundary is checked against lowering provenance and Program admission.

```ts
type CancelTransactionOperation = Readonly<{
  kind: "cancelTransaction";
  id: string;
  origin: Readonly<{ kind: "bpmnElement"; elementId: string }>;
  definitionScopeId: string;
  input: string;
  output: string;
  boundaryEventElementId: string;
}>;
```

The existing Compensation retention and execution declarations select the Transaction definition scope and this operation's ID. The operation's origin is the Cancel End. Program validation resolves exactly one enclosing Transaction and direct-parent Cancel Boundary continuation. The existing root `triggerCompensation` arm retains root-local output and root-global subject selection. Dispatch is by operation kind and checked ownership, never by a profile ID choosing different transition meanings.

Retention is initialized when the exact child scope occurrence is entered, not at Process start. Successful eligible User Task completion joins the live Task to its full owning scope occurrence before removing the Task; element ID or Process instance ID alone is insufficient. One declared scope still owns one register. The register remains through unrelated completions and has the existing canonical Activity identity and completion ordinal. Initialization and normal disposal for existing root profiles remain unchanged.

For a Program declaring child retention, the collection is present and contains exactly one register if and only if the selected child occurrence is live. It is empty before child entry, after empty cancellation or successful join while the parent is still running, and in terminal states. During compensation the live child owns one empty consumed register. Missing, duplicate, wrong-owner and orphan registers reject. Existing root declarations still require exactly one root-owned register throughout a running Process; Programs without a declaration retain physical omission. Lean and TypeScript validators and strict wire readers preserve these separate cases.

Runtime reuses scope occurrences, Activity retention, compensation triggers and handler effect waits. There is no second cancellation-state collection. An active child-owned trigger pins its exact Transaction scope; the existing scope-quiescence check already recognizes active triggers. Ordinary live work in that region has gone, but the scope remains until the join. A terminal trigger is a retained tombstone and may name a disposed child occurrence; validators must distinguish active-owner liveness from terminal identity/provenance validity.

Profile limits are one retained Activity record and 4096 canonical retention bytes, one retained trigger, one handler, and 20480 canonical trigger/wait bytes. Every limit is checked before committing the complete successor. These bounds do not override the independent full-state, publication, Activity, continuation, or terminal-result bounds. Existing declaration minimum checks and Unicode-aware canonical encoding remain authoritative; large admitted identifiers can cause explicit capacity refusal, never truncation or partial cancellation.

## Semantic rules

`TXC-RETAIN-01`: For a valid running Program and exact live Transaction occurrence, normal successful completion of its selected User Task inserts one eligible Activity occurrence into that owner's register. Interrupted or still-active work inserts nothing. Failed insertion preserves the complete pre-command state. A same-element record from another owner cannot be selected.

`TXC-CANCEL-01`: When the Cancel End input token is owned by the selected live Transaction, prepare one atomic successor from the pre-state: select that owner's eligible records; construct and capacity-check the complete compensation trigger/frontier; remove the Transaction's ordinary live work and consumed input; and consume the selected records exactly once. Retain the Transaction scope if a handler is active. A preparation, ownership, validity, capacity, closure or publication failure commits none of these changes. Generic region cleanup must not erase the records before selection or erase the newly constructed trigger.

`TXC-EMPTY-01`: With no eligible records, the same cancellation transition removes the Transaction scope and its empty register and emits exactly one token at the Cancel Boundary output owned by the direct parent. It creates no empty trigger. It never emits the Transaction's normal outgoing token. The boundary is taken even when the sole eligible Task was interrupted rather than completed.

`TXC-JOIN-01`: With one eligible record, the committed cancellation state contains one active child-owned trigger and its exact handler wait, no ordinary child work, and no parent continuation token. A successful exact effect completion marks the handler compensated and the trigger succeeded, removes the Transaction scope and register, and emits exactly one direct-parent-owned Cancel Boundary token in the same committed successor. The normal Transaction output remains absent. The tombstone retains identity without retaining a live scope or re-enabling the handler.

`TXC-FAIL-01`: A typed BPMN handler error applies the existing fail-fast Compensation Process-failure disposition to the selected child-owned trigger: failed handler and trigger, no remaining live scopes/work/effects, the existing typed failed control and terminal receipt, and no Cancel Boundary or normal continuation. This is an explicit extension of the project interpretation, not an implementation of a Transaction hazard boundary. Transport retries and infrastructure failures are not typed BPMN errors. Stale or duplicate effect results cannot release either continuation.

`TXC-FRAME-01`: Regional cancellation and successful join preserve state outside their exact occurrence region, except the specified direct-parent continuation and canonical global identity counters/publication deltas. Whole-Process failure instead has the explicit whole-Process disposition above. No theorem may treat that failure as regional preservation. Invalid or forged owner/parent/handler relations reject without mutation.

## Public contract and observations

Start and User Task completion use existing content-bound public commands. There is no public Cancel command: completion of the Cancel-branch Task reaches the admitted Cancel End. The enabled interactions before cancellation are the live ordinary User Tasks; during compensation they contain the existing handler effect; after successful join they contain the root continuation Task; after typed failure they contain the existing failed Process observation. Internal retention and trigger ownership are not new public API fields.

E1 publishes committed scope/token positions and the selected transition sequence only after stable closure. E2 keeps the Transaction occurrence open during compensation, closes interrupted ordinary Task occurrences as cancelled, publishes Cancel End occurrence lifecycle, and publishes the Compensation handler's existing lifecycle. The successful join closes the Transaction as cancelled and publishes the Cancel Boundary occurrence before the continuation Task starts. Empty compensation performs that same boundary lifecycle in the cancellation command. Failure uses the existing coarse cancelled occurrence lifecycle plus the exact failed-Process discriminator; it does not invent a public failed flow-node enum.

Every committed E1 transition needs its exact E2 companion, including the empty path and final join. Publication derives these facts from the selected semantic transition and checked provenance, not a state difference or Temporal history. Rejected commands advance neither accumulator. Product 2 consumes those published occurrences and the existing failed-Process contract; no Transaction-specific inference, storage discriminator, or UI workflow is selected.

## Internal scheduling and stable resumption

This profile admits only the following reachable internal frontiers. Prove the grammar-to-frontier restriction from the admitted Program; the representative model alone is not sufficient evidence.

| Phase | Reachable frontier and selected guarantee |
|---|---|
| Start and Transaction entry | Singleton start/entry/split transitions; entry initializes the child register atomically with its scope. |
| After the split | Exactly two ordinary User Task arming operations in the same child owner; preserve the existing independent prepared batch, exact canonical RuntimeState and accepted publication. |
| Ordinary completion | One next Task arming or one branch End operation; external completions are separate committed inputs. Retention insertion is part of the external completion, not a batchable sibling transition. |
| Cancel branch completion | One `cancelTransaction` transition; classify its full region, retention, trigger, identity and parent-output footprint. Overlapping work refuses batching. |
| Handler completion | Existing exact effect command plus atomic cancellation join or typed failure; no separate normal scope-completion step can win the join. |
| Parent continuation | One User Task arming and eventual ordinary root completion. |

Stable wait sets are one or two ordinary child User Tasks, one compensation effect with no ordinary live waits, one root continuation User Task, or a terminal completed/failed Process. The host must independently admit every set. At most one external stimulus is accepted into semantic closure at a time; simultaneous Task responses are explicit ordered inputs, not a new internal commutation claim.

The new operation receives an exhaustive family classification even though its selected reachable frontier is singleton. Manual scheduled Programs retain conflicting-region refusal and full-command rollback; scheduled Programs remain outside Temporal admission. Existing root Compensation and subscription proof domains remain unchanged. If implementation exposes any additional reachable frontier or mixed wait set, return the profile and scheduling account to review before admitting it.

## Temporal hosting and refinement preflight

The production Workflow main loop remains the only committed-state owner. Durable Update ingress carries existing Task/effect stimuli with exact occurrence identity, content binding, deduplication and response-loss recovery. Cancel is semantic closure of that command, not Workflow cancellation. No new Timer, Signal, external transaction coordinator or protocol service is required.

The state relation equates the host's committed core state and E1/E2 accumulators with the admitted interpreter result. Worker replacement, transport retry, Queries, replay and Continue-As-New stutter on semantic state. The child register, active scope, trigger/wait ownership and terminal tombstone must survive continuation exactly. Existing pre-schedule rollover fencing prevents carrying an already scheduled Activity as unscheduled work; the host must not infer a handler's success from Activity scheduling or cancellation acknowledgement.

The compensation Activity uses the existing descriptor, identity and retry/error classification. Success becomes an exact `CompleteEffect`; typed BPMN failure becomes the existing semantic error. Transport failure retains the existing retry/infrastructure behavior. Cancellation of in-flight host work and draining before terminal completion retain the current scheduler contract. Rejected semantic or host-capacity candidates preserve the previous state and both publications; host capacity remains distinct from semantic rejection.

The smallest live witness starts the business model, completes the eligible reservation, keeps its follow-up Task active, then requests cancellation through the other Task. It observes the active Task disappear, the Transaction remain open with its compensation effect, and the Cancel continuation remain absent. Force rollover before Activity scheduling and replace the Worker while compensation is outstanding; release the effect and observe exactly one parent continuation, complete it, retrieve the terminal receipt, and replay every Run. Separate empty, typed-failure, stale-result, duplicate-response and host-capacity schedules close their distinct outcomes.

Admission of the new source/profile into the compensation scheduler is a separate obligation from core validity. Current exact root-Compensation admission is not evidence for child ownership. Extend the managed Compensation host class only for the new operation under the new well-formed profile grammar; preserve the existing root-profile predicate. Unknown profiles, malformed attachments, mismatched child declarations, scheduled Programs, and added host-driven waits retain pre-start rejection. There is no Lean host-admission counterpart: Lean owns semantic admission, while the TypeScript adapter separately owns this production capability check. The production witness must traverse compile/start/command/publication APIs, with no private manual-Program bypass or answer-bearing runner input.

## Lean assurance lane

Lane shape: proved

Evidence: the existing [retention](../../BpmnSemantics/SemanticProcess/CompensationActivityRetention.lean) and [completion](../../BpmnSemantics/SemanticProcess/CompensationTriggerHandlerCompletion.lean) owners supply the root account to extend; the child-scoped laws listed below are required new evidence, not established results.

Lean independently defines the child-owned retention, cancellation and join relations and executable transitions, with constructor-selection soundness bridges recorded separately from semantic laws. Required quantified laws cover exact owner selection, interrupted-work exclusion, all-or-nothing refusal, absence of a continuation while compensation is active, exactly one parent continuation on successful join, no normal continuation, regional frame preservation under explicit disjointness hypotheses, and full failed-Process cleanup. Existing root-only theorems retain their hypotheses; widening a validator is not a proof that they generalize.

Prove the profile's reachable-frontier classification and the existing two-Task arming guarantee under the added child register. The cancellation operation's region/write footprint must be complete before private schedule refusal is claimed. Finite source-to-result and replay witnesses establish only their enumerated runs; they do not imply general compiler correctness, fairness, liveness, TypeScript equivalence or Temporal refinement.

The nearest checked non-law is that reaching a Cancel End immediately enables its boundary continuation: a pending compensation effect refutes it. Another is that every Task removed during cancellation is compensation-eligible: the unfinished reservation/follow-up Task refutes it. The effort boundary is this finite profile and these scoped laws, with the existing 3 GiB Lean memory ceiling; inability to close a required law leaves its exact claim open and blocks capability registration rather than selecting more proof infrastructure or weakening the law.

## Evidence strategy

The retained business model is reservation withdrawal: reserve a resource, leave a preparation Task open, and process a withdrawal decision concurrently. Compensation releases a completed reservation before the parent acknowledgement Task becomes available. Completing withdrawal first produces the empty-eligible case. This is the one full vertical mechanism witness; renamed/reshaped admitted models exercise the reusable validator without creating new semantic capsules.

| Rules or claim | Lean | TypeScript/source | Temporal/publication | Separating negative or mutation |
|---|---|---|---|---|
| Source scope/method | Checked and IL decoding witnesses | Exact parser identity, closed admission and deterministic lowering | Public compile/start | Wrong attachment, case-folded method, ordinary Sub-Process Cancel, unselected topology |
| `TXC-RETAIN-01` | Owner, insertion and refusal laws; child-register presence before entry, during compensation and after join | Red/green completion-owner join and matching presence/absence/forged-register cases; old-root behavior preserved | Rollover before Cancel preserves eligibility | Select by element only; retain interrupted Task |
| `TXC-CANCEL-01`, `TXC-FRAME-01` | Atomic selection/cleanup and regional frame | Complete collection census and adversarial owner state | Stable active handler and exact paired publication | Purge before selection; leak live Task; delete unrelated region |
| `TXC-EMPTY-01` | Exact empty cancellation law | No trigger and one parent token | Empty public journey and recovery | Omit boundary because no record; emit normal output |
| `TXC-JOIN-01` | Pinned scope and exact join laws | Delay result, success, duplicate/stale/forged result | Worker replacement, fenced rollover, replay, suffix pages | Early normal quiescence; child-owned parent token; boundary twice |
| `TXC-FAIL-01` | Existing failure law extended with explicit child hypotheses | Typed failure and no continuation | Failed receipt and existing Product 2 projection | Treat retry as BPMN error; release boundary after failure |
| Scheduling | Grammar/frontier classification and preserved arming result | Renaming, both chain lengths, both completion orders, conflicting-region refusal | No scheduled Program admission | Whole-fixture equality; omit register from entry footprint |
| Capacity | Canonical exact-fit/refusal laws | Count/byte boundaries and Unicode identities | Independent host candidate/publication/continuation refusal | Partial cleanup on overflow; conflate semantic and host capacity |

CIB is absent from every evidence row: no oracle equivalence is claimed. Neutral scenarios bind exact XML/profile bytes and explicit inputs with separate verifier expectations. Mutations must reach the named semantic/public/durable discriminator; a static rejection at an unrelated guard is not evidence for a later join or replay property.

## Versioning consequences

Apply the [single-current pre-release contract policy](../../contracts/README.md#evolution-policy) atomically across producers, schemas, readers, fixtures and tests; no legacy reader or speculative history migration is selected. Existing reviewed profile meanings and their immutable evidence remain unchanged. The new profile receives a new identity. Public E1/E2 and receipt shape stay closed; only admitted source and operation variants expand. Any need for another public field or changed old-profile behavior reopens this proposal.

| Boundary | Owners and deciding guards |
|---|---|
| Checked source and Program | [checked contract](../../packages/semantic-core/src/checked-process-contract.ts), [operation contract](../../packages/semantic-core/src/semantic-process-contract.ts), [source admission](../../packages/bpmn-source/src/checked-process-admission.ts), [graph arity/reachability](../../packages/bpmn-source/src/checked-process-graph-admission.ts), [node lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), [existing compensation lowering](../../packages/bpmn-source/src/compensation-source-lowering.ts), [checked schema](../../contracts/schemas/checked-process.schema.json), [IL schema](../../contracts/schemas/semantic-process.schema.json); [schema coverage](../../scripts/contract-schema-coverage.test.ts), [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts), [metamodel defaults](../../packages/bpmn-source/test/metamodel-default-admission.test.ts), [graph admission tests](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts), [lowering tests](../../packages/bpmn-source/test/semantic-process-lowering.test.ts) |
| Retention and transition | [retention](../../packages/semantic-core/src/compensation-activity-retention.ts), [producer join](../../packages/semantic-core/src/compensation-activity-retention-producers.ts), [retention declaration/state validation](../../packages/semantic-core/src/compensation-activity-retention-state-validation.ts), [declaration admission](../../packages/semantic-core/src/compensation-trigger-handler-program-admission.ts), [trigger](../../packages/semantic-core/src/compensation-trigger-handler-transition.ts), [completion](../../packages/semantic-core/src/compensation-trigger-handler-completion.ts), [state validation](../../packages/semantic-core/src/compensation-trigger-handler-runtime-state-validation.ts), [scope lifetime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts), [regional cleanup](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts); [collection removal census](../../scripts/runtime-collection-removal-completeness.test.ts), [Activity writer census](../../scripts/activity-occurrence-writer-census.test.ts), [Activity join](../../scripts/activity-occurrence-join.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [retention validity tests](../../packages/semantic-core/test/compensation-activity-retention.test.ts), [retention correction tests](../../packages/semantic-core/test/compensation-activity-retention-review-corrections.test.ts) |
| Lean account and wire | [retention/state validity](../../BpmnSemantics/SemanticProcess/CompensationActivityRetention.lean), [retention declaration validity](../../BpmnSemantics/SemanticProcess/CompensationActivityRetentionDeclaration.lean), [trigger](../../BpmnSemantics/SemanticProcess/CompensationTriggerHandlerTransition.lean), [completion](../../BpmnSemantics/SemanticProcess/CompensationTriggerHandlerCompletion.lean), [declaration](../../BpmnSemantics/SemanticProcess/CompensationTriggerHandlerDeclaration.lean), [JSON reader](../../BpmnSemantics/SemanticProcessJson/CompensationTriggerHandler.lean); [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [module cost](../../scripts/lean-module-cost.test.ts), [build coverage](../../scripts/build-coverage.test.ts), [retention conformance](../../BpmnSemantics/CompensationActivityRetentionConformance.lean) |
| Publication and host | [Compensation occurrences](../../packages/semantic-core/src/flow-node-occurrence-compensation.ts), [publication completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-compensation-completeness.ts), [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts), [scheduler](../../packages/temporal-adapter/workflow/src/compensation-frontier-scheduler.ts), [continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts), [program-bound publication validation](../../packages/temporal-adapter/protocol/src/flow-node-occurrence-publication-program-validation.ts); [publication coverage](../../scripts/execution-publication-contract-coverage.test.ts), [public surface](../../packages/temporal-adapter/protocol/test/semantic-publication-public-surface.test.ts), [scheduler tests](../../packages/temporal-adapter/workflow/test/compensation-frontier-scheduler.test.ts), [durability witness](../../packages/temporal-adapter/testkit/test/compensation-durability.temporal-test.ts), [host admission tests](../../packages/temporal-adapter/testkit/test/host-admission.test.ts), [Compensation host-refusal tests](../../packages/temporal-adapter/testkit/test/compensation-source-host-refusal.test.ts) |
| Capability and evidence | [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [profile registry](../../profiles/README.md), [scenario registry](../../scenarios/README.md), [corpus registry](../../model-corpus/README.md), routed [`implementation-status-router`](../IMPLEMENTATION-MAP.md), [IL specification](../SEMANTIC-PROCESS-IL-SPEC.md); [requirement consistency](../../scripts/requirement-ledger-consistency.test.ts), [corpus policy](../../scripts/bpmn-corpus-policy.test.ts), [executable corpus](../../model-corpus/test/executable-model-corpus.test.ts), [mechanism maturity](../../scripts/mechanism-maturity.test.ts) |

New scope/cancellation helpers and evidence modules belong beside these owners. Run `what-binds` on each concrete path before it is added or grown; its complete guard/registry output remains binding beyond this deciding inventory. Registration, retained whole model, pipeline binding, capability restriction row, generated corpus map and About disclosure move together only after the semantic and production outcome is green. The existing [Compensation capsule](COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md) continues to own the root account; its Transaction exclusions are superseded only for the new profile when this capsule is implemented and reviewed.

### Owners this implementation grows

These measurements were refreshed with the shared source-measure functions on 2026-09-26. The source review target is 800 nonblank lines; extraction is required only if the resulting owner would exceed its applicable bound. Recompute headroom when an owner changes; this table is not a permanent extraction instruction.

| Owner | Remaining lines before review target |
|---|---|
| [Operation contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 146 |
| [Retention](../../packages/semantic-core/src/compensation-activity-retention.ts) | 545 |
| [Handler completion](../../packages/semantic-core/src/compensation-trigger-handler-completion.ts) | 577 |
| [Scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 553 |
| [Region cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 574 |
| [Lean retention](../../BpmnSemantics/SemanticProcess/CompensationActivityRetention.lean) | 363 |
| [Lean completion](../../BpmnSemantics/SemanticProcess/CompensationTriggerHandlerCompletion.lean) | 293 |
| [Retention validation](../../packages/semantic-core/src/compensation-activity-retention-state-validation.ts) | 440 |
| [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 449 |
| [Source graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 416 |
| [Node lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 123 |
| [Lean retention declaration](../../BpmnSemantics/SemanticProcess/CompensationActivityRetentionDeclaration.lean) | 643 |

## Epistemic closure boundary and cost

This approved proposal establishes no executed Transaction capability. Closure requires the complete selected Start-to-publication outcome and the exact evidence rows above. The nearest unsupported claim remains successful protocol-controlled Transactions, followed by multi-subject dependency-aware Transaction compensation and hazard recovery. Neither existing root Compensation nor one green cancellation model establishes them.

Common-mode risks are a shared wrong source-role interpretation, dropping eligible records in generic cancellation, using root-only validators for child tombstones, normal scope completion racing compensation, and projecting the desired boundary from the fixture rather than transition evidence. Cross-language laws, non-target-owner witnesses, explicit empty/failure schedules, negative admission, and live paused-handler publication discriminate those risks separately.

Record commit-bounded code/document churn and command receipt span/union in the [capsule cost ledger](../CAPSULE-COST-LEDGER.md), comparing the existing Compensation source/hosting increment and failed-Process integration. The baseline is `ac0a2c1d`; elapsed closure time and closure cost are not yet measured. After each coherent outcome, reassess remaining internal scheduling strictly against this selected profile and the other RC capabilities.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `7ac97884658769e227b22f8c94bb8b4298e65a9f` | `fork-turns-none` | `approve-with-required-edits` | `9a5c3a4a20168f707870f20b011b47cf64bec820` |
| Semantic checkpoint | `ad6d0bc993ac7abdea3d3978e07092ffd2126851` | `fork-turns-none` | `approve` | `not-required` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The context-cold proposal review approved correction target `9a5c3a4a20168f707870f20b011b47cf64bec820` in its first same-reviewer audit on 2026-09-25. All required findings closed: distinct single-input root Ends, explicit child-register and host-admission owners/contracts, and the structural router link. Initial packet SHA-256: `775151f23ba25118cf6808834ae0bce4c1341e490e349bba7e5982836f6f284e`; correction packet: `1d3129333191c4fbbcf5c2e08b94ca969a29026445006810af8d04c5bae60fe4`. The complete infrastructure gate passed 594 checks in 56.79 seconds on the correction contents before commit, asserted receipt `/tmp/bpmn-transaction-proposal-correction-infrastructure`; its recorded Git head is the parent, so this is not clean-target qualification. No implementation, Lean or live-host result is implied.

The independent cold semantic-checkpoint reviewer approved `ad6d0bc993ac7abdea3d3978e07092ffd2126851` against baseline `b5ef19ca3b872aacc8a239f0e0a86b3a5051fcae` on 2026-09-26 with no required findings. Packet SHA-256: `de4be6edae1463f6029c1e00cd5d919bc466bf18c7709983dc9e096def9e1f05`; reviewed capsule SHA-256: `25d2cf4c855c557f257c0c48f34c2d4b50dbbf11fe81c8e59429700440b58c51`. The root-owned exact-target Transaction gate passed 37 checks, receipt `/tmp/bpmn-transaction-checkpoint-review-focused`. Review covered child ownership and retention lifetime, selection before cleanup, atomic empty/active cancellation and join, failure disposition, paired publication, and preservation of existing scheduling contracts. Independent transcriptions can share an incorrect account; conditional continuation-absence laws do not establish absence in every reachable state. Source/profile admission, grammar-to-frontier and two-Task guarantees, and production refinement remain open. The additional full verifier was stopped under the owner's revised cadence and is not complete qualification evidence. Reviewer `01a0de4c-cb49-7b22-b6bb-f05e3fbe7f88` is retained for eligible continuity.
