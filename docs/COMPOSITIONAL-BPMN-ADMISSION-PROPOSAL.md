# Compositional BPMN admission and lowering proposal

**Status:** Draft; assessment complete; owner decision required before implementation

## Decision question

Should the project replace its named whole-model topology checks with a bounded structural composition rule for already implemented BPMN mechanisms, while preserving exact lowering, avoiding accidental scheduler semantics, and reopening the checked-source preservation proof before widened admission ships?

The recommendation is **yes, under the selected structured-composition account below**. Do not implement arbitrary acyclic graph admission and do not begin another exact A12 model path.

## Why this decision is forced now

The current source layer already projects supported BPMN nodes and Sequence Flows independently, and lowering already maps each checked node to a reusable Semantic Process operation. The growth bottleneck is a second, whole-model check that recognizes only named fixtures: one sequential wait, one balanced two-User-Task fork/join, and two separately compiled target-shaped models. The semantic-core admission layer repeats the same shape lock over the lowered program.

Removing those locks without a replacement would be unsound. The TypeScript closure currently selects the canonically smallest enabled internal operation, while Lean admits one enabled operation or the specifically checked independent two-User-Task activation pair and rejects other simultaneous choices. For a wider graph, operation identifier order could therefore become observable TypeScript behavior even though BPMN never assigned it that authority.

The [frozen checked-source experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md#frozen-experiment-policy) also has an explicit reopen trigger: observational lowering preservation must close before admission widens beyond the fixture-pinned topologies. This proposal does not waive that condition.

## Required scope

The first compositional profile admits one private executable Process with:

- exactly one None Start Event and one None End Event;
- one or more serial segments;
- a serial segment that is either one admitted wait node or one exact balanced two-User-Task parallel region;
- wait nodes limited to the already reviewed plain User Task, exact `PT1S` Intermediate Catch Timer, or exact payload-free Service Task protocol/handler binding;
- unconditional Sequence Flows with distinct IDs and exact source/target references;
- a finite acyclic graph in which every node and Flow is reachable from the Start Event and can reach the End Event;
- the current per-node arity, source-shape, namespace, warning, and exact-byte profile checks;
- stable closure paths whose only simultaneous internal transitions are the already reviewed independent two-User-Task activations;
- one new composed draft semantic profile that names the selected union of already reviewed BPMN rules, existing CIB relationship IDs, source restrictions, observation boundary, and pinned oracle environment; combining capsule profiles is a fresh reviewed claim, not an automatic union of their IDs.

In compact form, the admitted graph language is:

```text
Process       ::= NoneStart Segment+ NoneEnd
Segment       ::= Wait | ParallelUserPair
Wait          ::= UserTask | TimerPT1S | PayloadFreeServiceTask
ParallelUserPair ::= ParallelFork (UserTask || UserTask) ParallelJoin
```

This grammar describes a checked property of the existing graph wire format. It does not introduce a second region AST, generated TypeScript, a topology opcode, or a runtime compatibility branch.

## Optional scope

None in the first implementation. In particular, admitting a longer chain is not authorization to add another node kind, expression form, trigger, mapping language, or CIB extension.

## Excluded scope

- arbitrary directed acyclic graphs, unstructured or nested parallelism, loops, multiple starts or ends, implicit Activity fan-out/fan-in, and simultaneous automatic transitions not covered by an existing commutation law;
- conditional/default Sequence Flow, Exclusive/Inclusive/Event-Based/Complex Gateway, messages/correlation, nested scopes, Sub-Processes, Call Activities, event subprocesses, compensation, and multi-instance behavior;
- the profile-scoped boundary-error route, because its attached scope/interrupt relation is not an ordinary serial graph segment;
- A12 CreateDocument mappings, other target-specific source shapes, or an A12 adapter;
- general expressions, variables, mappings, scripts, assignments, or Service Task bindings;
- a new dependency, wire format, IL operation, Temporal Workflow, previously unreviewed CIB behavior, broad CIB compatibility claim, or percentage-complete claim.

The exact boundary-error and CreateDocument compilers remain bounded adoption/profile paths until the corresponding general scope and data mechanisms are reviewed. They must not be used as reasons to leak target-specific records into the generic graph contract.

## Competing accounts

| Account | Benefit | Failure mode | Decision |
|---|---|---|---|
| Keep named whole-model topologies | Smallest immediate proof and test surface | Every new composition needs another compiler/admission branch; BPMN coverage grows model by model | Reject as the roadmap architecture |
| Admit every acyclic graph over current node kinds | Maximizes syntactic reuse | Makes current TypeScript operation-ID order an accidental scheduler, exceeds current Lean closure account, and admits unreviewed BPMN fan-in/fan-out behavior | Reject |
| Admit the structured composition grammar above | Removes whole-model fixture matching while reusing only closed mechanisms; has a statically bounded closure account | Requires a real graph validator, independent program validation, and reopening the preservation proof | Select |
| Introduce a region/tree wire representation | Makes structured composition explicit | Creates a second authoritative representation and obscures exact BPMN Sequence Flow identity | Reject for the first implementation |

## Source-admission contract

Admission proves the graph properties, rather than recognizing selected identifier sets or model names. The source result remains the existing canonical `CheckedProcess`: exact source identity, Process ID, sorted checked nodes, and sorted Sequence Flows.

The validator must establish:

1. reference integrity and global identifier uniqueness;
2. the one-Start/one-End boundary and the exact per-kind arities;
3. reachability from Start and co-reachability to End;
4. acyclicity;
5. a complete non-overlapping decomposition into serial wait segments and exact two-User-Task parallel regions;
6. absence of conditional/default flow and of unsupported or extra executable content;
7. a stable-closure bound for every segment, with no unresolved simultaneous internal transition.

A failure is source admission rejection with a precise diagnostic, never a runtime semantic outcome. Canonical sorting is serialization behavior only; it cannot decide flow, scheduling, or choice.

## Lowering contract

The existing element-local account is retained:

- one control place per admitted Sequence Flow, preserving exact Flow identity;
- None Start → `initiate`;
- User Task → `awaitUserTask`;
- exact timer → `awaitTimer`;
- exact payload-free Service Task → `awaitEffect`;
- diverging Parallel Gateway → `duplicate`;
- converging Parallel Gateway → `synchronize`;
- None End → `terminate`.

Lowering looks up inputs and outputs by checked source/target endpoints and never by positional order. It does not perform reachability, choose a runtime order, execute closure, or reconstruct the structured decomposition. Exact checked-source identity and exact lowering equality remain admission requirements.

Before widened program admission ships, standalone `programWellFormed` must independently check the corresponding reference, reachability, acyclicity, producer/consumer, arity, and stable-closure obligations. Exact equality with a checked-source lowering remains required, but must no longer be the only source of those program facts.

## Execution and closure contract

For the selected grammar, each stable state has either:

- no enabled internal transition;
- one enabled internal transition; or
- the already reviewed pair of disjoint User Task activations, whose canonical stable observation is order-independent.

The implementation must state and check that property directly. TypeScript must not select one of several unsupported enabled operations by identifier order. Lean must retain a declarative closure relation separate from the executable selector and prove that the selector is sound for the admitted structured graph.

The current fixed closure fuel may remain only if the admitted grammar proves that every stable closure stays within it. Otherwise the proposal returns for an explicit model-derived fuel contract; implementation may not silently raise the constant.

No new Temporal mechanism is required: the Workflow continues to host committed semantic-core state, timers, and effects under their existing contracts. A new mixed scenario is nevertheless required to prove that the existing host loop follows a program composed from more than one previously isolated segment.

## Language-specific design discipline

The TypeScript implementation uses immutable checked data, closed discriminated node/segment results, small pure graph predicates, exhaustive switches, and `unknown`-to-domain narrowing at the importer boundary. It must not introduce a class hierarchy, builder, registry, generic “processor,” optional-boolean mode bag, or unchecked cast to encode the grammar.

The Lean implementation expresses structured admission as an inductive proposition over checked graph facts, with a total executable decision procedure and a soundness theorem connecting the Boolean result to that proposition. Graph, lowering, closure, and observation lemmas stay in their owning modules. Concrete `by decide` fixtures lock examples and mutations; quantified reachability, decomposition, and closure properties require named lemmas with useful hypotheses.

Neither language copies the other language’s internal representation. They agree through the existing checked graph, Semantic Process contract, scenarios, and canonical observations.

## Feasibility and proof effort

The graph validator and existing node-local lowerer are the smaller part of this work. The dominant cost is the triggered preservation obligation: the frozen experiment still lacks enabled-transition, closure, admission, observation, and stimulus-run correspondence, and the mixed grammar also requires direct source-side Timer and Service Task clauses.

The recommended proof effort stop is approximately 1,800 additional or materially rewritten nonblank Lean lines across cohesive modules, with every module still respecting the repository’s 600-line review target. This reflects roughly one-and-a-half to three times the original 700-line experiment budget plus the two additional wait families. If the theorem has not closed within that bound, or proof convenience demands changing production semantics or representations, the acceptable result is a precise unresolved boundary and no widened admission. Independent review should challenge this estimate before owner approval.

## Separating witnesses

### Positive mixed-composition witness

Admit and execute a project-authored neutral model:

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

This model is outside every current named topology while using no new semantic mechanism. Exact observations must show each stable wait, the order-independent parallel pair, the timer’s existing logical-time contract, the existing effect intent/result contract, and final completion. Lean and TypeScript execute independently; Temporal refines the same committed results. Whole-model CIB execution may supply the existing timer and Service Task host observations, but it does not define the composition account or count as a new independent semantic authority.

### Negative structure witnesses

Each of the following must be schema-valid checked input and must fail admission for the intended reason:

- a cycle;
- a disconnected but otherwise valid-looking node;
- a node reachable from Start that cannot reach End;
- an unbalanced fork or join;
- nested parallel regions that enable two automatic fork operations concurrently;
- a parallel region containing a Timer or Service Task rather than the admitted User Task pair;
- a conditional Sequence Flow;
- a boundary-event source presented as an ordinary serial segment;
- the same graph with one source/target endpoint changed while canonical array order remains valid.

### Accidental-order witness

A deliberately over-broad admission mutation accepts the nested-parallel graph whose two internal forks are simultaneously enabled. The retained check must demonstrate that renaming operation IDs can change the current TypeScript first step while BPMN source structure is unchanged, and that the selected structured validator rejects the graph before execution. This proves why acyclic alone is insufficient.

### Lowering witness

Retain the renamed positional-pairing counter-model from the checked-source experiment. The widened preservation proof must quantify over the selected structured grammar, and the fixture-coincidental positional lowering must still diverge on its adversarial renamed graph while endpoint lowering agrees.

## Required evidence before adoption

1. Normative requirements and exact exclusions are added to the BPMN ledger; the composed semantic profile references only existing reviewed CIB relationships unless the on-demand gate identifies a genuinely new one.
2. TypeScript source admission accepts the mixed witness and rejects every structure mutation with a precise diagnostic.
3. Lean has an idiomatic declarative structured-admission proposition, executable checker soundness, strengthened `programWellFormed`, closure soundness, and useful laws for the mixed witness’s constituent mechanisms.
4. The frozen checked-source experiment is reopened by explicit owner approval, and observational lowering preservation closes for the selected structured grammar before widened admission ships.
5. Exact checked-source/lowering equality and the retained positional-lowering discriminator stay green.
6. Lean and TypeScript produce exact canonical agreement for the mixed scenario; the nearest checked non-law is retained.
7. Temporal runs the mixed program through the existing semantic-lifetime Workflow, derives timer/effect stimuli only from committed state, verifies durable history, and replays the execution.
8. Applicable retained CIB evidence remains content-bound; no evidence is regenerated merely because source admission changed.
9. A mutation that restores operation-ID-based choice or bypasses structured admission makes the focused gate fail.
10. Source-hygiene limits, feedback budgets, and the complete repository gate remain green without dependency or budget changes.

## Stop conditions

Stop and return for owner direction if:

- the selected mixed graph requires a new semantic operation or new meaning for an existing operation;
- exact BPMN semantics require admitting a shape outside the selected grammar;
- closure equivalence requires treating canonical identifier order as semantic choice;
- the preservation theorem cannot close within a separately approved effort bound;
- `programWellFormed` cannot establish the widened structural obligations without changing the wire contract;
- the generic compiler needs A12 source, types, names, or runtime code;
- a new CIB extension, dependency, profile beyond the approved composed artifact, feedback-budget change, or Temporal mechanism is required.

## Decisions requested

1. Approve the structured-composition account and reject arbitrary acyclic admission.
2. Approve the exact first grammar and exclusions above.
3. Approve one composed draft semantic-profile artifact whose meaning is the reviewed union described above; do not infer profile composition from matching engine versions.
4. Approve reopening the checked-source preservation experiment as a prerequisite, with a separately stated effort bound before implementation begins.
5. Approve the positive mixed model and negative/accidental-order witnesses as the acceptance discriminator.
6. Keep the Exclusive Gateway and conditional Sequence Flow capsule next after this admission decision is implemented and reviewed; do not begin that capsule as part of this proposal.
