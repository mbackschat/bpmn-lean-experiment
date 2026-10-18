# Nested embedded scope control proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the engine admit ordinary embedded Sub-Processes nested up to three definition levels whose bodies compose User Tasks through paired Parallel fork/join blocks and terminal unjoined forks to separate None Ends, so that every scope completes exactly at its owned quiescence, continues exactly once at its own parent, and leaves concurrent work outside it untouched?

This is the second batch of the embedded and called scope family in [PLAN](../PLAN.md#exact-resume-point) and serves the control clauses of `PC-SCOPE-01` and the human-branch, nested-region and separate-End clauses of `PC-CF-03` in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). It does not close either row: mixed automated activities need concurrent-effect hosting that [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) refuses for any program combining a token split with an effect or Timer wait, and selected Exclusive decisions inside scopes need a data and expression binding this profile lacks. Both stay named later increments.

The [nested scope-data capsule](NESTED-EMBEDDED-SCOPE-DATA-PROPOSAL.md) planned later family increments as amendments to itself. This increment grows the control profile instead, because the data profile admits only serial chains: its admission walk, Start capacity journey and frame commutation charge all assume no token split, so concurrency there is a separate data increment (`PC-DATA-04` concurrent owners). Scope-local data and concurrency compose only in that later increment.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3.5 defines the embedded Sub-Process as a scope containing Flow Elements. Clause 13.3.4 instantiates it when a token arrives, executes its contents as a normal Process, and completes it only when no token remains inside and no contained Activity is active, then continues through its outgoing Sequence Flow. Clause 10.6.4 defines the Parallel Gateway, and Clause 13.4.1 with Table 13.1 activates it once at least one token is on each incoming flow, consuming exactly one token from each incoming flow and producing one on each outgoing flow. A None End consumes its token without completing anything else. Consult the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

The standard settles every selected behavior, so no new CIB relationship is required. The profile keeps naming [`CIB-AGR-0007`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0007--ordinary-embedded-sub-process-quiescent-completion), still bound only to its one-level fixture; the new schedules are standards-only, and a CIB probe of one nested model is optional calibration, not acceptance.

## Required, optional and excluded scope

Required: one root Process with one None Start and one None End; finite acyclic flow; complete ownership and same-scope Sequence Flow closure; every embedded Sub-Process has exactly one incoming and one outgoing flow and a child body with one None Start; definition depth at most three below the root; and ordinary User Tasks with one incoming and one outgoing flow whose completion accepts only an empty patch.

Optional: any number of User Tasks and Sub-Processes per scope; paired Parallel blocks of two or more branches, nested in any order inside branches and Sub-Process bodies; and, in a child body only, one terminal unjoined Parallel fork whose two or more branches each reach their own None End. A branch may contain a Sub-Process, so work outside a scope can run concurrently with it.

Excluded: Exclusive, Inclusive, Event-Based or mixed gateways; unpaired, crossing or cross-scope blocks; more than one End at the root or a terminal fork there; implicit Activity fan-in or fan-out; Service, Script, Send, Receive or other Tasks; data mappings, scope-local data and completion values; boundary and intermediate Events; Event Sub-Processes, Terminate Ends, Calls, Multi-Instance, loops, Transactions and Compensation; and a new public command or observation field.

Acyclicity and element uniqueness mean each Sub-Process activates at most once per instance, so the element-identifier task identity of the [embedded specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#runtime-state-identity-and-ownership) stays unique; `PC-SCOPE-02` reopens it. The restrictions narrow admission only: later increments add gateways, tasks or data without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-embedded-subprocess-completion-draft` grows in place under the [cumulative profile rule](../../contracts/README.md): its retained fixture keeps its exact admission, commands and observations, and only additional models become admissible. Its exact operation and node multisets in [Program](../../packages/semantic-core/src/semantic-program-profile-shape.ts) and [checked](../../packages/semantic-core/src/checked-process-profile-shape.ts) shape are replaced by the structural capability below, which must accept that fixture. Start, User Task completion and every observation keep their current wire shapes.

## Representation and runtime ownership

Lowering reuses the existing operations: `initiate`, `awaitUserTask`, `duplicate`, `synchronize`, `enterScope`, `reachNoneEnd` and `completeScope`. There is no new opcode, Program field, runtime collection or synthetic occurrence. Tokens, User Task occurrences and child scope occurrences keep their owner links, so a `synchronize` consumes only tokens of its own scope occurrence, and a `completeScope` removes only its occurrence and places the single continuation token at that occurrence's parent output. Because each definition scope has at most one live occurrence, place-based token counting and occurrence-based ownership coincide here; the checkpoint must verify that both languages count join tokens per owning occurrence rather than per place.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md): generic scoped-graph validation plus one structural capability, not a list of model predicates. In a private analysis graph that keeps edge multiplicity, contract per scope, innermost scope first:

1. a User Task, or a Sub-Process whose child body has contracted, with one incoming and one outgoing edge becomes an edge;
2. a Parallel fork and join become one edge when every outgoing edge of the fork leads directly to the join, these are exactly the join's incoming edges, there are at least two, and each has one external edge in and out;
3. in a child body only, a fork whose every outgoing edge leads directly to a distinct None End that has no other incoming edge becomes one edge to a single End.

A scope admits when only its Start, one edge and its End remain. Both languages decide this independently from their own graph and refuse leftovers, bypasses, crossings and cross-scope edges. The nearest wrong algorithm treats a terminal fork's first End as completing its scope; the second nearest joins at the wrong scope level and lets a nested completion satisfy an outer join.

Automatic closure stays bounded by `semanticProcessClosureLimit = 8` (`scenarioClosureLimit` in Lean). From initiation and from every task completion, count each internal step that one closure executes until it arms User Tasks or completes the root. Unlike an Exclusive choice, a fork runs every branch in the same closure, so its cost is its own step plus the sum of its branches, and scope entry and completion each count. A definition whose bound exceeds the limit is refused before Workflow start.

## Stable rules

- `NSC-ADMIT-01`: admission accepts exactly the structurally contracting definitions above within the depth and closure bounds and refuses every excluded construct before Workflow start.
- `NSC-ENTER-01`: a token reaching a Sub-Process creates one child occurrence owned by the current occurrence and one entry token in it.
- `NSC-END-01`: a None End in a child body consumes only its branch's token; it completes nothing while the occurrence owns other work.
- `NSC-QUIESCE-01`: a child occurrence completes exactly when it owns no token, User Task or child occurrence, and the completion emits one token at that occurrence's parent output.
- `NSC-JOIN-01`: a join continues once, only after a token from every incoming flow in its own occurrence has arrived; a completion inside a nested scope cannot satisfy an outer join early.
- `NSC-OUTSIDE-01`: completing or progressing work in one branch leaves every sibling task, token and child occurrence unchanged.
- `NSC-REFUSE-01`: a command for a completed or absent task occurrence is rejected with the committed state preserved.

## Separating witnesses

All differ at the public boundary of open User Tasks and Process status.

- An onboarding model: a root fork with *Order equipment* on one branch and *Confirm start date* followed by *Workplace setup* on the other, then a root join and *Welcome meeting*. Setup's terminal fork ends *Assign desk* and *Accounts* at separate Ends, and *Accounts*, a second-level Sub-Process, ends *Create mailbox* and *Grant VPN* at separate Ends. After *Create mailbox* completes, *Grant VPN*, *Assign desk* and *Order equipment* stay open and *Welcome meeting* is absent; it appears only after all four complete, in every tested order. A first-End mutant drops *Grant VPN* or opens *Welcome meeting* early. Its largest closure, completing *Confirm start date*, is seven steps (two entries, two forks, three armings).
- A three-level audit model with a join inside a second-level body followed by serial work in it and in its parent: completing the inner scope continues inside its parent and not at the root. A wrong-parent mutant that puts the continuation at the root opens *Close audit* while the parent's *Sign off* is still unarmed.
- Reversed completion orders of each journey end in the same final observation.
- Refusals: depth four, an unpaired fork, a join fed from two scopes, a terminal fork at the root, an Exclusive Gateway, a Service Task and a burst over the closure limit are each refused before start.

## Lean assurance lane

Checked, with one inherited proved law. [`completeScopeState_selected_update`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) already shows that every successful scope completion was quiescent and names its exact rewrite, which covers `NSC-END-01` and `NSC-QUIESCE-01` for every admitted Program. A new Lean owner implements the contraction admission and the summed closure bound executably; finite `decide +kernel` witnesses fix each retained model's admission, journey prefixes, mutants and refusals. Deliberately open: a quantified progress law that every admitted definition reaches completion under every completion order, recorded as an unresolved boundary rather than claimed. The structured-composition proof owners stay untouched because their quantified laws assume one scope and no Parallel.

## Temporal hosting and refinement preflight

Ingress stays Start and User Task Update; waits are concurrent passive User Tasks, which [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) already admits for token splits without effect or Timer waits. Nested ownership stays Workflow state interpreted by the pure core, never Child Workflows. There is no new Timer, Activity, Signal, cancellation or projection mechanism, so the increment adds no hosting mechanism and needs no separate refinement witness: the complete pipeline's Temporal target, with its isolation run and history replay, covers the new schedules. Risks are ordering and deduplication of concurrent completions, which existing per-occurrence Update identity already decides.

## Evidence and acceptance

The two models carry the witnesses as answer-free scenarios with registered pipeline cases and seeded mutations, a corpus row, the About disclosure and a runnable Product 1 example. Acceptance: Lean, core and Temporal agree on every schedule in the complete pipeline, the structural admission refuses every listed exclusion in both languages, and the retained one-level fixture keeps its exact evidence.

## Versioning consequences

Under the [pre-release wire policy](../../contracts/README.md#evolution-policy) nothing changes shape: the profile identity, the operation set and every schema stay current, and no reader or migration is added. Before the first edit, `node scripts/what-binds.ts` on every grown path names the binding guards. The decisive ones are listed here.

- Profile and registration: [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts), [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts), [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) and the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts).
- Structure: [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

- TypeScript core: a new structural owner beside [Program profile shapes](../../packages/semantic-core/src/semantic-program-profile-shape.ts) and [checked profile shapes](../../packages/semantic-core/src/checked-process-profile-shape.ts), which replace this profile's multisets with a call to it, and [profile dispatch](../../packages/semantic-core/src/semantic-process-profile.ts).
- Source: embedded Sub-Process and Parallel Gateway source admission for this profile, through [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) without new lowering rules.
- Lean: one new admission owner and one conformance owner; the existing embedded conformance module stays unchanged.
- Registration: profile README and exclusions, scenarios, pipeline cases, corpus, About and example.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
