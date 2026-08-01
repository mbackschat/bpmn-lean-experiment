# Compositional BPMN admission and lowering proposal

## Status

**Status:** Owner-approved on 2026-07-28, then superseded as a staged production-admission programme on 2026-07-30; completed Stages 1 through 3b remain frozen experimental results; no composed profile or widened production admission was adopted

## Current disposition

The owner intentionally replaced this proposal's universal observational-preservation prerequisite with the [targeted preservation gate](PLAN.md#approved-decisions). This is a revision of the approved decision question, required-evidence item 7, and approved decision 6 below; the prerequisite was real and was not introduced only by the experiment record.

The closure-limit and unsupported multiple-enabledness obligations formerly assigned to Stages 3c–3e remain mandatory. They transfer to every affected admission or representation capsule through the targeted gate. The programme's auditable Stages 2c through 3b total 930 new or materially rewritten nonblank Lean lines. Stage 1, Stage 2, and Stage 2b lack committed intermediate baselines, so aggregate consumption against the historical 1,800-line ceiling is not reproducible.

## Historical decision question

Should the project replace named whole-model topology checks with a profile-conditional structured-composition rule for already implemented BPMN mechanisms, while preserving exact lowering and closing observational checked-source preservation before widened admission ships?

The historical recommendation was **yes, under the bounded structured-composition account below**. The 2026-07-30 disposition withdraws that staged production recommendation without approving arbitrary acyclic admission. The grammar and proof results below remain a bounded experiment record, not current production intent.

## Why this decision is forced now

The source layer already projects supported BPMN nodes and Sequence Flows independently, and lowering already maps each checked node by source/target endpoint to a reusable Semantic Process operation. Named whole-model matchers in TypeScript and Lean now constrain BPMN coverage more than the implemented mechanisms do.

Deleting those matchers without a replacement would be unsound. The strongest discriminator is closure, not identifier order: every segment selected below reaches a semantic wait after at most four internal steps, independently of chain length, while an arbitrary acyclic cascade of automatic forks can require more than the fixed closure fuel of eight.

Arbitrary acyclic admission would also assign unreviewed meaning to uncontrolled Activity fan-in. BPMN21-268 records that multiple uncontrolled incoming Sequence Flows may activate an Activity multiple times; this project has not selected or evidenced that account.

The [frozen checked-source experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md#frozen-experiment-policy) originally required observational lowering preservation to close before admission widened beyond fixture-pinned topologies. This proposal approved that prerequisite independently in its decision question and required evidence. The 2026-07-30 owner decision supersedes it with targeted per-capsule preservation while retaining the closure-limit and multiple-enabledness safeguards.

## Required scope

The first composed profile admits one private executable Process with:

- exactly one None Start Event and one None End Event;
- one or more serial segments;
- each segment either one admitted wait node or one exact balanced two-User-Task parallel region;
- any number of distinct serial User Task nodes and balanced User Task regions;
- at most one exact `PT1S` Intermediate Catch Timer in the entire Process;
- at most one exact payload-free Service Task protocol/handler binding in the entire Process;
- unconditional Sequence Flows with distinct IDs and exact source/target references;
- a finite acyclic graph in which every node and Flow is reachable from Start and can reach End;
- exact per-node arity, source-shape, namespace, parser-warning, and exact-byte checks;
- no simultaneous internal transition except the reviewed pair of disjoint User Task activations;
- one new composed profile with an explicitly selected feature set, exclusions, comparison mode, CIB relationships, observation boundary, and pinned oracle environment.

In compact summary form:

```text
Process          ::= NoneStart Segment+ NoneEnd
Segment          ::= Wait | ParallelUserPair
Wait             ::= UserTask | TimerPT1S | PayloadFreeServiceTask
ParallelUserPair ::= ParallelFork (UserTask || UserTask) ParallelJoin

Global constraint: count(TimerPT1S) ≤ 1 ∧ count(PayloadFreeServiceTask) ≤ 1
```

The grammar is explanatory shorthand, not the normative representation or validator. The intended normative admission proposition is the conjunction of exact node arity, reference integrity, reachability, co-reachability, acyclicity, supported node kinds, global Timer/effect cardinalities, and exact gateway region shape. A declarative relation over those graph facts must show that each admitted source has one complete, non-overlapping decomposition, stated up to exchange of the two parallel branches. The Stage 2 executable parser does not establish that result: it currently chooses branch order from the Sequence Flow list.

The existing checked graph remains the source contract. No region AST, topology opcode, generated source, runtime compatibility branch, or second authoritative representation is introduced.

## Exact arity contract

TypeScript source admission must add explicit, diagnostic-producing checks before the existing whole-topology matcher is removed:

| Node kind | Incoming | Outgoing |
|---|---:|---:|
| None Start Event | 0 | 1 |
| None End Event | 1 | 0 |
| User Task | 1 | 1 |
| Intermediate Catch Timer | 1 | 1 |
| Service Task | 1 | 1 |
| Diverging Parallel Gateway | 1 | 2 |
| Converging Parallel Gateway | 2 | 1 |

Lean already has the corresponding checked-node arity predicate. The TypeScript lowering helper that expects a single Flow is not an admission check: a thrown `TypeError` is an infrastructure failure and cannot substitute for a source rejection with a precise diagnostic.

## Profile-conditional admission

Admission must become a function of the declared semantic profile before any shape is widened.

- Each existing generic profile retains its current exact topology and feature surface.
- The new composed profile alone selects the structured grammar in this document.
- The two exact A12 profile compilers remain separately dispatched and gain no generic composed surface.
- TypeScript checked-source admission, Lean `checkedWellFormed`, TypeScript `isWellFormedSemanticProcessProgram`, and TypeScript `hasSupportedExecutionSurface` must all enforce the same profile-selected capability. Temporal continues to enter only through `supportsSemanticProcessExecution`.
- The existing TypeScript lock that admits a structurally compatible unknown profile is replaced with a rejection lock; a profile string is semantic authority, not an inert identity label.

This closes a latent current defect: the generic compiler can otherwise accept a balanced User Task parallel program while stamped with the timer profile, despite that profile excluding User Tasks and gateways.

## Composed profile construction

All four constituent `2.2.0` profiles pin the same CIB Seven revision and byte-identical environment, so their configuration facts are jointly satisfiable. The new artifact is nevertheless a reviewed composition, not a JSON union:

- `features` is a selected set of the mechanisms admitted by this grammar;
- `excluded` is recomputed for the composed boundary, because unioning constituent exclusions would exclude the features being composed;
- `comparison.semanticConcurrency` is `true` because the admitted whole model may contain one parallel region; this does not assert concurrency in each serial segment;
- relationships are selected as `CIB-AGR-0001`, `CIB-AGR-0002`, `CIB-AGR-0003`, `CIB-AGR-0004`, `CIB-OP-0001`, `CIB-CFG-0001`, `CIB-EXT-0001`, and `CIB-CFG-0002`, subject to their existing fidelity limits;
- candidate deviation `CIB-DEV-0001` remains disclosed by the parallel capsule but is not imported into the composed compatibility claim.

The artifact begins with `status: "draft"` during red implementation. Before retained composed evidence is adopted, its exact content is frozen as an immutable calibration artifact. That artifact status does not graduate the semantic capsule or establish a production deployment/history compatibility baseline.

## Optional scope

None in the first implementation. A longer admitted chain does not authorize another node kind, Timer, Service Task, expression, mapping language, trigger, or CIB extension.

## Excluded scope

- a second Timer or Service Task effect, sequential Timer clock accumulation, effect repetition, and every Timer/effect race;
- arbitrary directed acyclic graphs, unstructured or nested parallelism, loops, multiple starts or ends, implicit Activity fan-out/fan-in, and simultaneous automatic transitions outside the reviewed disjoint User Task pair;
- zero-segment `None Start → None End`;
- conditional/default Sequence Flow, Exclusive/Inclusive/Event-Based/Complex Gateway, messages/correlation, nested scopes, Sub-Processes, Call Activities, event subprocesses, compensation, and multi-instance behavior;
- the profile-scoped boundary-error route, because its attached scope and interrupt relation is not an ordinary serial graph segment;
- A12 CreateDocument mappings, other target-specific source shapes, or an A12 adapter;
- general expressions, variables, mappings, scripts, assignments, or Service Task bindings;
- a new dependency, wire format, IL operation, Temporal Workflow, previously unreviewed CIB behavior, broad CIB compatibility claim, or percentage-complete claim.

The exact boundary-error and CreateDocument compilers remain bounded adoption/profile paths. Three separate source compilers are a temporary pre-release shape, not a target architecture; reassess their shared data/scope boundary when general mappings and scope mechanisms are admitted.

## Competing accounts

| Account | Benefit | Failure mode | Decision |
|---|---|---|---|
| Keep named whole-model topologies | Smallest immediate proof and test surface | Every composition creates another compiler/admission branch | Reject as roadmap architecture |
| Admit every acyclic graph over current node kinds | Maximizes syntactic reuse | Unbounded automatic closure, unreviewed uncontrolled fan-in, and incompatible multiple-enabledness accounts | Reject |
| Admit the structured grammar above | Removes fixture matching while preserving a fixed closure bound and reviewed waits | Requires profile-conditional validation and reopened preservation proof | Select |
| Introduce a region/tree wire representation | Makes structured composition explicit | Creates a second authoritative representation and obscures exact Sequence Flow identity | Reject for this implementation |

## Source-admission contract

Admission proves graph properties instead of recognizing selected identifiers or model names. The source result remains the canonical `CheckedProcess`: exact source identity, Process ID, sorted checked nodes, and sorted Sequence Flows.

The validator establishes:

1. reference integrity and global identifier uniqueness;
2. exact one-Start/one-End boundary and per-kind arities;
3. reachability from Start and co-reachability to End;
4. acyclicity;
5. one complete decomposition into serial wait segments and exact two-User-Task parallel regions, plus a proof that the graph facts determine it up to parallel-branch exchange;
6. the global one-Timer and one-Service-Task bounds;
7. absence of conditional/default Flow and unsupported executable content;
8. the stable closure bound and permitted multiple-enabledness property.

Both a `conditionExpression` and a gateway `default` reference receive dedicated hostile-source witnesses; raw-object own-key enumeration is not accepted as proof that reference-valued defaults are absent.

A failure is a source admission rejection with a precise diagnostic, never a runtime semantic outcome or thrown lowering error. Canonical sorting is serialization behavior only.

## Lowering and program-validation contract

Existing endpoint-indexed lowering is retained:

- one control place per Sequence Flow;
- None Start → `initiate`;
- User Task → `awaitUserTask`;
- exact timer → `awaitTimer`;
- exact payload-free Service Task → `awaitEffect`;
- diverging Parallel Gateway → `duplicate`;
- converging Parallel Gateway → `synchronize`;
- None End → `terminate`.

Lowering selects inputs and outputs by checked source/target endpoints, never positional order. It does not perform reachability, choose runtime scheduling, execute closure, or reconstruct the decomposition.

Under the historical programme, Lean `programWellFormed`, TypeScript `isWellFormedSemanticProcessProgram`, and TypeScript `hasSupportedExecutionSurface` would independently check the corresponding profile, reference, reachability, acyclicity, producer/consumer, arity, cardinality, and stable-closure obligations before widened admission shipped. The targeted gate retains these obligations for any capsule that makes the relevant structures reachable. Exact equality with checked-source lowering remains required, but is not their only source of structural facts.

## Execution and closure contract

For the selected grammar, each internal-closure state has either no enabled transition, one enabled transition, or the reviewed disjoint pair of User Task activations.

The historical programme named `structuredClosureStepsLeFour` as the required Lean lemma proving that closure from any admitted stable boundary performs at most four internal steps:

- at Process start, the longest case is `initiate → duplicate → awaitUserTask → awaitUserTask`;
- between segments, the longest case is `synchronize → duplicate → awaitUserTask → awaitUserTask`.

The fixed production closure fuel of eight therefore remains unchanged. A long schema-valid cascade of automatic gateways is retained as an admission-negative witness: it exceeds the structural grammar and is rejected before evaluation rather than absorbed by more fuel.

TypeScript must reject unsupported multiple-enabledness instead of selecting the lowest operation ID. Lean retains a declarative closure relation distinct from the executable selector. These requirements now belong to the targeted gate for each capsule that makes such a state reachable; they did not disappear when later proof stages were superseded.

Under unique control-place producer/consumer facts, enabled disjoint internal operations are expected to commute at the canonical projection. Prove this as a positive law with exact hypotheses, or return with a real public non-commuting counterexample. Internal first-step order alone is not a separating observation and cannot justify admission policy.

No new Temporal mechanism is required. The Workflow continues to host committed semantic-core state, timers, and effects under existing contracts.

## Language-specific discipline

TypeScript uses immutable checked data, closed discriminated validation results, small pure graph predicates, exhaustive switches, and `unknown`-to-domain narrowing at the import boundary. It must not introduce a class hierarchy, builder, registry, generic processor, optional-boolean mode bag, or unchecked cast for this grammar.

Lean expresses structured admission as an inductive derivation over checked graph facts, with a total executable decision procedure and a soundness theorem. The proof route is induction on that structured-admission derivation, not unrestricted raw-graph induction.

The existing `BpmnSemantics/Experiments/CheckedSourceSemantics.lean` is split by responsibility before extension. A closed preservation theorem graduates to a production module such as `BpmnSemantics/SemanticProcess/Preservation.lean` and is imported by the ordinary conformance gate; only mutation discriminators remain in `Experiments/`.

Neither language copies the other’s internal representation. They agree through checked graph identity, exact lowering, scenarios, and canonical observations.

## Staged proof effort boundary

The historical approval set an aggregate ceiling of approximately 1,800 additional or materially rewritten nonblank Lean lines. That aggregate is not auditable: Stage 1, Stage 2, and Stage 2b have no committed intermediate baselines, while the auditable Stages 2c through 3b total 930 lines. The recorded stage ceilings also do not sum to the approved aggregate once Stage 4's 700 lines are included. The individual anchored stage figures remain valid; no exact aggregate-consumption claim is retained.

Work stops at each stage if its named obligation does not close within its sub-budget:

| Stage | Obligation | Ceiling |
|---|---|---:|
| 1 | Split the frozen source module; prove constant-`"operation:"` prefix order preservation and two-segment `enabledTransitions` correspondence | 250 |
| 2 | Fuel-bounded reachability/co-reachability/acyclicity, unique structured decomposition, executable-decider soundness, and strengthened program validation | 500 |
| 3a | Single-token frontier flow bridge, order-independent isolation, graph-fact extraction, exact enabled-list characterization, and non-vacuity witnesses | 300 |
| 3b | Two-token parallel-frontier localization up to `List.Perm`, shared token-absence refactor, order discriminators, and kernel witnesses | 340 |
| 3c–3e | Deferred original Stage 3 obligations: direct Timer/effect clauses, closure-selector soundness, commutation, closure fuel stability, and `structuredClosureStepsLeFour` | Not authorized; ceiling unset |
| 4 | State mapping, full enabled/closure correspondence, admission/observation preservation, and stimulus-list induction | 700 |

Stage 1 is the early kill decision because the previous experiment stopped at enabled-transition correspondence. Lean lowering does not sort operations while TypeScript does, so the prefix/order lemma must close on a two-segment chain before graph infrastructure is funded.

Stage 1 completed without changing production semantics, representations, observation, or visibility. The direct source account was split into state, transition, and scenario modules; a general constant-prefix order theorem elaborates; and the direct selector agrees with the lowered production operation evaluator on operation identity and successor state at every automatic boundary of a two-segment User Task chain.

Stage 2 reached its stop condition on 2026-07-29. Its graph-validation half is retained: a reusable fuel-bounded validator checks reachability, co-reachability, cycles, and exact control-place producer/consumer shape, and standalone `programWellFormed` uses it. The experimental executable parser checks source arity and references, finite graph predicates, the serial-wait/balanced-pair shape, nonempty composition, exact `PT1S` and payload-free probe surfaces, and global one-Timer/one-Service-Task bounds. Kernel-checked witnesses cover the admitted serial/parallel shapes, the four excluded wait surfaces, zero segments, a disconnected cycle, a second Timer, a finite cycle, and a disconnected program.

The original Stage 2 decomposition half was not adopted. The reviewed `StructuredChain` proposition related only a list to its own cons structure, the former soundness theorem repackaged the executable predicates, and the former uniqueness theorem proved only that one deterministic function call cannot return two different values. Sequence Flow list permutation can exchange the parser's left/right task fields without changing the graph. Those declarations and claims were removed.

Stage 2b retained genuine `SegmentAt` and inductive `ChainFrom` relations over checked graph facts, parser soundness from the executable tail parser into `ChainFrom`, and graph-derived decomposition uniqueness expressed through an order-insensitive parallel-segment equivalence. The executable reachability result also has a non-tautological soundness bridge into an inductive edge-path relation. Independent review accepted those results and the stop. The round remained below its 250-line ceiling, but no exact Stage 2b delta is claimed because Stage 2 and Stage 2b shared an uncommitted tree and therefore have no reproducible intermediate baseline. The remaining ceiling could not honestly prove that finite vertex fuel detects every declarative path and therefore could not derive declarative acyclicity from a negative bounded search. No theorem yet bridges the whole `parseProcess?`/`structuredDecomposition?` wrapper—including single Start, matching End, and complete node coverage—to `ChainFrom`. Equating “not detected within fuel” with “no path exists” would reproduce the circular proof defect this stage exists to remove. The useful declarations remain experimental, no production source-admission or execution behavior was widened, TypeScript program validation remains weaker than Lean's standalone graph backstop, and Stage 3 is not authorized.

Owner-approved Stage 2c closed the whole-process boundary from commit `d025e3d` under a 230-new-nonblank-line ceiling. The 229-line proof module keeps parser state private and exports one `WholeProcessDecompositionFacts` proposition containing the graph/profile facts, unique Start and End, a nonempty graph-derived chain, complete distinct node coverage, complete Sequence Flow coverage, and unique Flow-source ownership. The separately quantified canonical-chain corollary compares the parsed chain with any independently supplied `ChainFrom` derivation. The experiment modules are split by graph, executable decomposition, declarative chain, whole-process coverage, and witness responsibility; no module approaches the source-hygiene limit.

Stage 2d completed at 127 new or materially rewritten nonblank Lean lines under its separate 150-line ceiling and was independently accepted after two required amendments. The default gate now compiles the proof experiment, and the saturation certificate computes each source's reached set once rather than once per edge membership test. It replaces unsound reliance on a negative bounded search with an executable saturation certificate, proves that every declarative path lies in a certified closed reached set, and derives declarative return-path exclusion and reachability antisymmetry for accepted graphs. The retained fuel-one three-node cycle separates the predicates: the old bounded predicate accepts, the saturation-certified predicate rejects, and both reject at vertex-count control fuel. All seven accepted program witnesses remain explicit and green. Vertex-count fuel adequacy is deferred to optional Stage 2e because it establishes decider completeness against false rejection rather than admission soundness.

Independent review returned the original bundled Stage 3 for revision after compiled probes showed that its Timer, effect, closure, commutation, and four-step obligations could not fit the former 350-line ceiling. The owner authorized only revised Stage 3a from commit `bb6b149`: the source-state and graph Flow vocabularies now have direct bridges, reusable distinct-key and list-order-independent `filterMap` isolation laws expose the required collection reasoning, `sourceGraphWellFormed` yields the exact identifier and arity facts used by the proof, and `enabledTransitionsAtSingleToken` characterizes the enabled list solely from graph and runtime-frontier facts. Kernel-checked parallel-process witnesses establish that a token before the fork enables exactly the fork while one branch-output token before the join enables nothing. The graph bridge, collection laws, and graph-fact extraction contain 109 nonblank lines; the standalone compiling checkpoint includes its closing namespace line and therefore records 110. Independent review accepted the theorem, witnesses, scope, and 277-line accounting with no blocker. Reusing the existing parallel fixture instance identifier removes one duplicated line, so the post-review implementation closes at 276 new or materially rewritten nonblank Lean lines under the 300-line ceiling.

| Stage 3a Lean file | Independently reviewed snapshot | Post-review checkpoint |
|---|---:|---:|
| `CheckedSourceFrontier.lean` | 211 | 211 |
| `CheckedSourceFrontierConformance.lean` | 61 | 60 |
| `CheckedSourceRelationMain.lean` delta | +5 / −0 | +5 / −0 |
| Total new or materially rewritten nonblank lines | 277 | 276 |

The ceiling convention counts nonblank added or materially rewritten Lean lines against the named anchor. A partial layer counts its content declarations; when recorded as a standalone compiling-module checkpoint, it also counts the module-closing `end`. Following Stage 1 and Stage 2d, byte-identical relocations of existing code are excluded from the count, whether the relocation crosses modules or stays inside one; the published figure names the exclusion and its size.

The owner authorized Stage 3b from commit `362f91f` under a 340-new-or-materially-rewritten-nonblank-Lean-line ceiling. A shared refactor extracts permutation-aware token absence, incoming-Flow untokenedness, and arity-based node disabling while preserving the accepted Stage 3a theorem statements and axiom footprints. The new `enabledTransitionsAtTwoTokens` theorem states that a well-formed two-token frontier aimed at two distinct member nodes yields a `List.Perm` of the two nodes' `fireNode?` contributions; exact equality is kernel-refuted both by reversing only the graph's node collection and by exchanging the theorem's anchors on the unmodified fixture. The `filterMap` pair-isolation route adds the explicitly reviewed `Classical.choice` axiom through Lean core's erase/permutation lemmas. The forked frontier supplies a quantified both-branch witness, a half-ready join supplies a one-contribution witness, and ready-join plus initiation-pending witnesses refute the theorem's own permutation conclusion at those two argument instances, showing the distinct-target and settled-initiation hypotheses are load-bearing.

| Stage 3b Lean file | Baseline at `362f91f` | Amended checkpoint | Added / removed | Relocated, excluded | New or materially rewritten |
|---|---:|---:|---:|---:|---:|
| `CheckedSourceFrontier.lean` | 211 | 245 | 62 / 28 | 11 | 51 |
| `CheckedSourceParallelFrontier.lean` | 0 | 113 | 113 / 0 | 0 | 113 |
| `CheckedSourceFrontierConformance.lean` | 60 | 192 | 134 / 2 | 0 | 134 |
| `CheckedSourceRelationMain.lean` | 32 | 32 | 0 / 0 | 0 | 0 |
| Total | 303 | 582 | 309 / 30 | 11 | 298 |

The excluded 11 lines are the byte-identical `disabledOffFrontier` docstring, nine-line signature, and `sourceGraphFacts` binding, relocated below the extracted `nodeDisabled` inside the same module; Git renders that relocation as delete-plus-add rather than as context. Both the raw 309 and the convention-applied 298 sit under the 340-line ceiling, so the exclusion does not decide ceiling compliance.

Stage 3a establishes the single-token frontier and Stage 3b establishes only two-token localization up to permutation. Stage 3b does not prove that either target fires, exactly-two enabledness, closure-selector soundness, commutation, closure fuel stability, the four-step bound, Timer/effect source semantics, source-to-program correspondence, or any production-admission result. In particular, `closeSupported` currently advances the head of `enabledTransitions` after accepting an independent pair, so the experiment still inherits `source.nodes` order as its internal scheduling choice; the permutation theorem deliberately does not bless or compose with that choice. The original Stage 3 bundle is superseded; Stages 3c–3e, optional Stage 2e, Stage 4, and every production admission change require separate owner decisions.

No hand-written source module may exceed the 600-nonblank-line review target. Proof convenience may not change `closeSupported`, `enabledTransitions`, canonical observation, wire contracts, production semantics, or representations. Failure at a stage records the exact unresolved boundary and leaves admission unchanged.

## Separating witnesses

### Positive mixed composition

Admit and execute:

```text
None Start
  → User Task A
  → PT1S Intermediate Catch Timer
  → parallel fork
       ↘ User Task B ↘
       ↗ User Task C ↗
    parallel join
  → payload-free Service Task
  → None End
```

Lean and TypeScript execute the answer-free scenario independently. Temporal refines the same committed semantic results and derives Timer/effect stimuli only from committed state.

The composed profile gets one fresh content-bound whole-model CIB evidence envelope under the new profile ID. It is generated only by the explicit replacement command after the profile is frozen. A retained mutation removes the Timer wait after User Task A completion and must make the comparison fail. CIB supplies host realization and existing per-mechanism calibration; it does not define structured composition or become another semantic authority.

### Negative structure and source witnesses

Admission rejects:

- `None Start → None End` with no segment;
- a cycle, disconnected node, or node that cannot reach End;
- wrong arity on each supported non-gateway node;
- an unbalanced fork or join;
- a long cascade of automatic gateways whose closure would exceed eight;
- sibling fork operations created by an outer fork whose two branches each begin with a fork;
- a parallel region containing a Timer or Service Task;
- a second Timer or a second Service Task anywhere in the Process;
- uncontrolled multiple incoming Sequence Flows to an Activity;
- both a conditional Flow and a gateway default-Flow reference;
- a boundary-event source, as a cheap upstream defense rather than a discriminator;
- one changed source/target endpoint with canonical array order preserved.

### Multiple-enabledness divergence

An over-broad admission mutation retains a graph with unsupported simultaneous enabled operations. Lean reports `ambiguousChoice`; TypeScript currently progresses by sorted operation ID. This is retained under its honest claim: it exposes incompatible implementation accounts outside admitted structure. It does not by itself distinguish structured admission from arbitrary acyclic admission.

### Lowering discriminator

Retain the renamed positional-record counter-model from the checked-source experiment. The widened preservation theorem quantifies over this structured grammar, endpoint lowering agrees with the direct source account, and fixture-coincidental positional pairing still diverges on the adversarial renamed graph.

## Historical required evidence before adoption

1. The BPMN ledger records the structured-chain, closure-bound, controlled fan-in, and profile-composition requirements and exact exclusions.
2. Profile-conditional TypeScript and Lean source admission retains every existing profile boundary, accepts the mixed witness only under the composed profile, and rejects every hostile witness with a diagnostic.
3. The new composed profile contains the selected features, resolved exclusions, global concurrency flag, exact relationships, fidelity limits, oracle revision, and environment.
4. The mixed scenario has fresh content-bound CIB evidence and a meaningful Timer-wait projection mutation; existing evidence remains byte-identical.
5. TypeScript and Lean standalone program validation owns the widened structural facts.
6. Stage 1 closes before graph implementation proceeds, and every later proof stage closes within its budget.
7. **Superseded:** the final production preservation theorem would have proved observational lowering preservation over the selected structured-admission derivation. The current targeted gate instead requires the smallest source-to-result preservation result for each affected admission or representation capsule.
8. **Transferred:** the closure-limit check, the disjoint-step commutation or explicit-choice account, the long-gateway rejection, the uncontrolled-fan-in rejection, and consistent Lean/TypeScript treatment of newly reachable multiple-enabledness belong to the targeted gate.
9. Lean and TypeScript have exact mixed-scenario agreement, including kind-first canonical wait ordering; the nearest checked non-law remains explicit.
10. Temporal runs and replays the mixed program through the existing semantic-lifetime Workflow with exact timer/effect mechanism evidence.
11. The positional-lowering discriminator, source-hygiene limits, feedback budgets, and complete repository gate remain green without a new dependency or budget change.

## Stop conditions

Stop and return for owner direction if:

- the mixed graph requires a new semantic operation or new meaning for an existing operation;
- a second Timer/effect or new clock-composition proposition becomes necessary;
- exact BPMN semantics requires a shape outside this grammar;
- canonical identifier order would become semantic scheduling;
- any proof stage exceeds its approved sub-budget or requires production-semantic changes;
- independent program validation requires a wire-contract change;
- generic compilation needs A12 source, names, types, or runtime code;
- a new CIB extension, relationship, dependency, feedback-budget change, or Temporal mechanism is required.

## Historical approved decisions

1. Approve structured composition and reject arbitrary acyclic admission.
2. Approve the revised grammar: `Segment+`, globally at most one Timer and one Service Task, explicit TypeScript arity checks, unique decomposition, closure bound four, and profile-conditional admission.
3. Approve one explicitly composed `2.2.0` profile with selected—not unioned—features, exclusions, comparison mode, relationships, and one fresh retained CIB envelope.
4. Approve reopening and first splitting the checked-source experiment, with graduation of any closed theorem out of `Experiments/`.
5. Approve the revised witness set: mixed model, long-gateway closure rejection, BPMN21-268 uncontrolled fan-in rejection, honest Lean/TypeScript ambiguity divergence, positive disjoint-step commutation law, and retained positional-lowering discriminator.
6. Approve the four-stage 1,800-line ceiling and stage-1 early kill gate. **Superseded on 2026-07-30:** completed anchored stages remain recorded, but no later stage or universal theorem is scheduled.
7. Keep Exclusive Gateway and conditional Sequence Flow next after this admission work is adopted and reviewed; do not begin that capsule here.
