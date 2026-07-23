# Formal-methods toolbox: TLA+, behavioral relations, and alternatives

## Status and disposition

This note evaluates which formal capabilities could strengthen the project’s assurance architecture. TLA+, simulation, and bisimulation are available options, not prescribed architecture. They may be used together, independently, or not at all when the existing Lean, differential, replay, and fault-injection pipeline answers the question more directly. This is a capability map, not an approved tool dependency, implemented specification, proof, or conformance claim.

The current disposition is:

1. Add no auxiliary formal tool to Milestone 0. Keep exact canonical trace equality for its sequential walking skeleton.
2. Keep Lean as the only normative BPMN semantics and proof layer.
3. Retain **observational, weak, stuttering-aware refinement** as the architecture’s candidate reducer-to-Temporal correctness relation, but do not claim it until the relation and observations are implemented and checked.
4. Treat simulation, trace inclusion, divergence-sensitive branching bisimulation, temporal model checking, process algebra, Petri-net analysis, and implementation-state exploration as selectable techniques.
5. Select a technique only for a named question, a separating defect it must expose, a feedback-time budget, and a defined correspondence back to Lean, the reducer, or the real Temporal adapter.
6. Remove an experimental tool if it does not find useful counterexamples or establish evidence more cheaply and clearly than the existing pipeline.

This sharpens the direction already present in the [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md#193-reducer-to-temporal-adapter), which requires weak, stuttering-aware adapter refinement.

## Why this project is a good candidate

The project contains two different kinds of complexity:

- BPMN semantic complexity: tokens, scope, subscriptions, gateways, lifecycle, command closure, errors, compensation, and profile-specific observations.
- Durable-host complexity: Workflow Tasks, replay, duplicate messages, retries, crashes, timers, Activity completion, cancellation, Continue-As-New, version changes, and hidden persistence steps.

Lean is a strong fit for stating BPMN operational semantics, proving invariants, and proving correspondence between a normative relation and an executable interpreter.

TLA+ is a strong fit for small concurrent or distributed protocols expressed as state variables, initial predicates, actions, temporal properties, and fairness assumptions. Leslie Lamport describes it as a high-level language especially for concurrent and distributed systems, while the TLC model checker explores finite instances and produces counterexample behaviors. [Specifying Systems](https://lamport.azurewebsites.net/tla/book.html) covers behaviors, refinement, liveness, fairness, composition, and TLC.

Bisimulation and simulation make “the two transition systems behave the same” precise. The choice of relation matters because the Temporal adapter deliberately adds internal work that must be hidden without hiding deadlock, duplicate semantic effects, lost commands, or infinite internal retry.

## The three assurance questions remain distinct

| Question | Primary method | Why |
|---|---|---|
| Is the chosen BPMN/profile meaning internally coherent? | Lean operational semantics, proofs, executable examples, and bounded exploration | This is the normative semantic account |
| Does the TypeScript reducer agree with Lean and pinned CIB Seven? | Neutral differential scenarios and, selectively, Lean-level simulation theorems | CIB is a black-box oracle and TypeScript is not extracted from Lean |
| Does the Temporal adapter preserve reducer behavior despite hidden durable work? | Stuttering refinement tests, replay, fault injection, and, if justified, a bounded protocol model or implementation-state explorer | This is the concurrency and durability boundary |

No auxiliary formal tool should answer the first question independently. Rewriting the complete BPMN semantics in Lean and another language would create two formal authorities and a permanent synchronization problem.

## What TLA+ contributes

### Exhaustive interleaving exploration in a finite model

TLC explicitly explores the states reachable in a finite configuration. It is well suited to checking small but hostile combinations such as:

- a message accepted before or after a Workflow Task starts;
- duplicate command delivery around a Worker crash;
- reducer advancement followed by an uncommitted Workflow Task completion;
- Activity side effect followed by lost Activity completion;
- cancellation racing with an Activity result;
- a timer firing while a completion message is accepted;
- Continue-As-New while messages or handler work remain in flight;
- replay from an empty cache;
- a retry or patch branch producing a different Temporal Command order.

Scenario tests sample schedules. A bounded model checker can enumerate all schedules within the declared finite state space.

### Safety properties

TLA+ and TLC can check invariants such as:

- one logical command produces at most one semantic commit;
- every committed command result corresponds to one reducer transition;
- a rolled-back or rejected command exposes no speculative semantic state;
- replay and cache eviction do not change the semantic projection;
- Continue-As-New preserves model, profile, state, deduplication, and pending-work identity;
- one event race has at most one semantic winner;
- no cancelled scope retains forbidden semantic work;
- no completed process retains active semantic entities;
- Search Attributes and other projections never drive reducer decisions.

These properties complement the Lean invariants because they apply to a deliberately lower-level adapter protocol model with crashes and hidden steps.

### Liveness and fairness

TLA+ directly represents temporal properties and weak or strong fairness assumptions. This is valuable because BPMN and adapter liveness is never unconditional.

Candidate conditional properties include:

- if a Worker continues polling and an accepted command remains enabled, the command is eventually committed, rejected, or failed;
- if a timer becomes due and delivery remains enabled, the reducer eventually receives one timer-fired stimulus;
- if an external effect eventually returns or reaches its terminal delivery policy, the semantic wait eventually resolves;
- an enabled semantic branch is not permanently starved under the scheduler assumption declared by the profile;
- Continue-As-New cannot permanently postpone an already accepted input.

TLC searches cycles in the behavior graph when checking liveness. A counterexample can expose an unfair or internally divergent execution that finite happy-path traces miss.

### Refinement mappings

TLA+ treats a lower-level specification as implementing a higher-level specification when the lower-level behavior implies the higher-level behavior, often under a refinement mapping from concrete state to abstract state.

For this project, the refinement mapping would forget Temporal-only state:

```text
concrete adapter state
  = reducer state
  + accepted-message queue
  + Workflow Task phase
  + replay/cache phase
  + Activity attempts
  + timer records
  + Run and Continue-As-New state
  + projection-delivery state

abstract state
  = reducer state
  + semantically pending inputs and effects
```

A crash, replay activation, persistence write, cache eviction, routing step, visibility update, or Continue-As-New administrative step may change concrete state while leaving the abstract projection unchanged. TLA+ specifications explicitly allow stuttering at the chosen visible variables, which closely matches this adapter requirement.

### Counterexamples as scenario seeds

TLC counterexamples should not remain tool-specific traces. A small exporter can eventually project a counterexample into:

- neutral semantic stimuli;
- explicit fault-schedule choices;
- logical-time choices;
- expected invariant violation or forbidden observation;
- exact model/profile/tool provenance.

The minimized result can then become a permanent Lean, reducer, Temporal, and differential regression scenario.

TLC also supports validating recorded implementation traces against a TLA+ specification. The TLA+ documentation correctly warns that trace validation is not exhaustive, but it could later provide another view of actual Temporal fault-injection histories. [TLC trace validation](https://docs.tlapl.us/using%3Atlc%3Atrace_validation)

## What TLA+ does not contribute

TLA+ does not automatically prove:

- that the TLA+ model matches the Lean BPMN semantics;
- that the TypeScript reducer implements either model;
- that the Temporal SDK or Service implements the adapter protocol model;
- that the BPMN XML parser is correct;
- CIB Seven compatibility;
- BPMN Process Execution Conformance;
- correctness outside the finite TLC configuration;
- exactly-once behavior for external Activity effects.

A TLC run establishes that no counterexample exists in the explored finite model, subject to the correctness of the specification, properties, configuration, and tool.

TLA+ is also not attractive for the project’s data-heavy expression, serialization, and XML-admission semantics. Lean and ordinary property/differential testing are a better fit there.

## TLA+ versus Lean bounded exploration

There is overlap, but the tools have different strengths.

| Concern | Lean | TLA+ and TLC |
|---|---|---|
| Normative typed semantics | Strong | Possible, but would duplicate the authority |
| Executable reference interpreter | Strong | Model execution is possible but not the production semantic contract |
| Universal theorem proving | Strong | TLAPS exists, but adding another proof stack has little value here |
| Exhaustive finite interleavings | Requires project code or finite enumeration | Native TLC strength |
| Temporal logic, fairness, and liveness | Possible but requires a developed library and proof structure | Native specification idiom and TLC support |
| Counterexample schedule generation | Requires custom exploration | Native model-checker output |
| Actual implementation trace validation | Requires a custom checker | TLC has a trace-validation path |
| One trusted proof language | Preserved | Lost if TLA+ becomes a second semantics authority |

The useful division is therefore Lean for semantic truth and proof, TLA+ for bounded protocol exploration.

## Behavioral relations available to the project

Let `A` be the abstract reducer transition system and `C` the concrete adapter transition system. Let `obsA` and `obsC` be their canonical observation projections, and let `α : C → A` be an abstraction mapping.

### Exact state equality

Exact state equality is unsuitable because Temporal necessarily adds histories, queues, attempts, Runs, timers, and projection state.

### Exact visible trace equality

Exact canonical trace equality is the right Milestone 0 relation because the walking skeleton is sequential and the observation order is explicitly fixed.

It remains a useful regression oracle, but it becomes too brittle or too weak once independent concurrency is introduced: exact total order can reject permitted interleavings, while a coarser trace projection can miss lost branching choices or deadlock.

### Trace inclusion

Concrete visible-trace inclusion in the abstract trace set is a natural safety refinement:

```text
visibleTraces(C) ⊆ visibleTraces(A)
```

It states that the adapter introduces no forbidden semantic behavior. It does not by itself establish that every supported abstract behavior is realizable or that branching and deadlock potential are preserved.

### Forward simulation

A forward simulation is asymmetric: every concrete step can be matched by an abstract step or permitted abstract stuttering while related states remain related.

This is the best default proof shape for “the adapter implements the reducer.” Refinement is intentionally directional; a production implementation may restrict nondeterministic choices without being behaviorally identical in every operational respect.

### Weak stuttering simulation

The adapter needs a weak or stuttering version because one visible reducer transition may correspond to many concrete steps.

A useful project relation should require:

1. Initial concrete states map to valid initial abstract states.
2. Related states have equal canonical semantic observations.
3. Every hidden concrete step preserves `α` or is matched by zero or more abstract hidden steps.
4. Every visible concrete step is matched by an allowed abstract visible transition with the same semantic label and outcome.
5. Every accepted supported abstract input remains realizable by the concrete system under declared environment assumptions.
6. The concrete system does not introduce a new semantic deadlock.
7. Infinite hidden concrete activity cannot permanently conceal required semantic progress.

Items 5–7 go beyond a minimal safety simulation and are essential for this project.

### Strong bisimulation

Strong bisimulation requires both systems to match each transition directly in both directions. It is categorically too strong for reducer-to-Temporal comparison because replay, persistence, retries, Workflow Tasks, and Continue-As-New have no one-step abstract counterparts.

### Weak bisimulation

Weak bisimulation hides sequences of internal `τ` actions before and after visible actions. It is closer to the adapter shape, but ordinary weak bisimulation can forget where a choice became committed.

That loss matters for event-based gateways, boundary-event races, cancellation, and concurrent task completion.

### Branching bisimulation

Branching bisimulation hides internal actions while preserving the branching possibilities of intermediate states. Van Glabbeek and Weijland introduced it specifically to preserve branching structure in the presence of silent actions and showed its relevance to action refinement. [Branching Time and Abstraction in Bisimulation Semantics](https://theory.stanford.edu/~rvg/abstraction/)

Workflow research has likewise used simulation and weak or branching bisimulation to compare labelled workflow nets, while requiring successful termination to remain distinguishable from deadlock. [Fundamentals of Control Flow in Workflows](https://pure.tue.nl/ws/files/1688655/612177.pdf)

This makes branching bisimulation a strong candidate for bounded comparisons involving:

- event-based gateways;
- interrupting versus non-interrupting boundary Events;
- parallel and inclusive joins;
- competing timer and message Events;
- cancellation and error propagation;
- subprocess cleanup;
- choices whose enabled alternatives are part of the observation contract.

### Divergence sensitivity

Any relation that simply hides internal `τ` steps risks equating harmless finite replay with infinite internal livelock.

For example, an adapter that endlessly fails and retries Workflow Tasks without changing reducer state can stutter forever. It is safety-equivalent to waiting, but it violates progress under the assumptions that should make the command advance.

The project therefore needs either:

- divergence-sensitive branching bisimulation;
- a separate no-new-divergence condition, such as a well-founded rank for hidden work; or
- explicit TLA+ liveness properties with the required fairness assumptions.

The choice depends on the artifact under test: a temporal model can state liveness directly, an LTS tool can check a divergence-sensitive relation, and Lean can prove a rank or progress theorem for a project-owned abstract relation.

## Bisimulation is not the default end-to-end claim

Bisimulation is symmetric. Implementation correctness is normally asymmetric.

The project needs two distinguishable obligations:

- **Soundness:** every visible adapter behavior is allowed by the reducer.
- **Realizability:** every supported reducer interaction can be realized by the adapter under stated environment and fairness assumptions.

Together they may resemble an observational equivalence in a closed bounded model, but calling the actual Temporal implementation bisimilar to Lean would overstate the evidence unless both transition systems and the relation are machine checked.

The preferred public term is therefore **observational stuttering refinement**. Use “bisimulation” only when a particular labelled transition-system relation has actually been defined and checked or proved.

## Proposed labelled transition-system contract

The shared formal vocabulary should eventually distinguish:

```text
SemanticLabel
  = start
  | commandAccepted(commandId)
  | commandOutcome(commandId, outcome)
  | waitOpened(waitId)
  | waitClosed(waitId)
  | timerFired(timerId)
  | effectRequested(effectId)
  | effectOutcome(effectId, outcome)
  | processCompleted

HiddenLabel
  = workflowTask
  | replay
  | cacheEviction
  | persist
  | transportRetry
  | activityAttempt
  | continueAsNew
  | projectionDelivery
```

The semantic profile determines the final visible/hidden partition. For example, a CIB compatibility profile that exposes job attempts cannot hide the corresponding retry step.

The relation should also compare enabled semantic stimuli, not only emitted observations. Two states with the same trace prefix but different available task completions or event alternatives are not equivalent at this project’s observation boundary.

## Candidate TLA+ target: the adapter protocol

If TLA+ is selected for a concrete experiment, its strongest initial target is the durability protocol around one tiny reducer interface. It should not parse BPMN or reproduce gateway semantics.

### Abstract variables

- semantic process state;
- enabled semantic inputs;
- applied command IDs;
- pending semantic effect intents;
- canonical observations.

### Concrete variables

- all abstract variables or their concrete representation;
- accepted but not yet reduced inputs;
- Workflow Task phase and commit status;
- Worker cache present or evicted;
- Activity attempt and completion state;
- timer-record state;
- current Run and Continue-As-New handoff;
- visibility projection status;
- replay position.

### Abstract actions

- start;
- accept supported semantic command;
- apply one reducer transition;
- deliver one semantic effect result;
- complete.

### Concrete actions

- accept Signal or Update;
- enqueue input;
- dispatch Workflow Task;
- replay history;
- invoke reducer;
- emit Temporal Command;
- persist Workflow Task completion;
- crash or evict cache;
- start or retry Activity;
- record Activity result;
- fire timer;
- request or complete cancellation;
- Continue-As-New;
- deliver projection.

### Initial invariants

- no duplicate semantic commit;
- reducer state changes only through the reducer action;
- uncommitted Workflow Task work is absent after crash/replay reconstruction;
- recorded completion reconstructs the same reducer state;
- Continue-As-New preserves all required semantic and deduplication state;
- visibility state is a projection and never an input to reducer decisions;
- canonical observations equal the abstraction mapping’s observations.

### Initial progress properties

Under explicit assumptions that a compatible Worker polls, accepted Tasks are eventually delivered, and external effects eventually terminate according to policy:

- every accepted command eventually receives one terminal semantic outcome;
- every due semantic timer eventually yields one reducer timer stimulus;
- finite replay and infrastructure retry cannot starve a ready reducer input;
- Continue-As-New cannot lose or indefinitely postpone accepted handler work.

## Candidate TLA+ evaluation experiment

There is no approved TLA+ spike. The following is a ready-made evaluation design if a later adapter question needs exhaustive interleaving, liveness, fairness, or refinement-mapping exploration and the existing test pipeline does not answer it cheaply.

Wait until M0.6 is green so the model can be challenged against an implemented abstraction boundary. A small evaluation could use the calibrated sequential User Task reducer interface but add hidden adapter faults:

- two logical command IDs;
- duplicate delivery of one command;
- one optional Worker crash or cache eviction;
- one optional Workflow Task completion loss;
- one forced Continue-As-New boundary;
- one visibility update;
- bounded replay and retry steps.

The evaluation would succeed only if:

1. TLC finds a deliberately seeded duplicate-commit bug.
2. TLC finds a deliberately seeded Continue-As-New state-loss bug.
3. The corrected model satisfies the declared safety invariants over the complete finite configuration.
4. A seeded hidden-livelock case violates the progress property.
5. The refinement mapping is explicit and small enough to review.
6. One counterexample is projected into the neutral scenario/fault vocabulary and reproduced by a test harness or documented as requiring a later fault-injection hook.
7. The focused check has a measured budget suitable for the extended assurance gate.

If the experiment cannot expose the seeded defects more clearly or cheaply than the existing Lean and test infrastructure, remove it and retain only the useful relation vocabulary and regression scenarios.

## Adjacent tool landscape

The question determines the tool. These options overlap, and a small time-boxed comparison on the same seeded defect is more informative than choosing by reputation.

| Option | Strongest fit here | Main cost or mismatch | Disposition |
|---|---|---|---|
| Lean | Normative typed semantics, executable reference interpretation, invariants, and unbounded theorems about project-owned transition systems | Concurrent counterexample exploration, fairness, and implementation-state exploration require project infrastructure | Already selected as the semantic authority |
| TLA+ with TLC | Small durable protocols, exhaustive finite interleavings, safety and liveness, fairness assumptions, stuttering refinement, and concrete counterexample behaviors | Another model must be related to Lean and code; finite checking is configuration-bounded | Candidate for an adapter-protocol question |
| Quint with Apalache | Typed, executable TLA-style specifications, simulation, model checking, and model-based test generation with syntax likely approachable to a TypeScript team | Newer language and ecosystem; the backend and boundedness still need explicit qualification | Candidate ergonomic alternative to handwritten TLA+ |
| P | Event-driven state machines, asynchronous messages, faults, safety/liveness checking, and implementation-oriented test generation or trace validation | Another programming model and toolchain; abstraction from the Temporal implementation must still be justified | Strong candidate for handler, delivery, and fault protocols |
| SPIN with Promela | Mature, fast explicit-state checking of concurrent processes, channels, assertions, progress, and LTL | Refinement mappings and rich data abstractions are less direct; introduces Promela | Candidate when message interleavings dominate |
| mCRL2 | Process algebra, generated labelled transition systems, strong/weak/branching-bisimulation checking, deadlock, and modal μ-calculus properties | Requires an explicit process-algebra model or trustworthy LTS export | Strong candidate when the actual question is behavioral equivalence |
| Alloy 6 or Electrum | BPMN metamodel relations, static admissibility, scope/reference constraints, and tiny bounded temporal structures | Less natural for long-running adapter protocols and implementation correspondence | Candidate for metamodel and admission questions |
| LoLA | Petri-net reachability, deadlock, soundness, and temporal properties for net-shaped control flow | Full BPMN and CIB behavior exceed low-level Petri nets; translation correctness becomes another obligation | Candidate for net-representable workflow soundness |
| FDR with CSP | Traces, failures, divergences, refinement, and deadlock with an exact process-algebra vocabulary | Licensing and ecosystem constraints; another semantic model | Conceptually strong, but not a default dependency |
| UPPAAL | Dense timed-automata questions and bounded real-time properties | Temporal durable timers do not provide exact real-time scheduling semantics; license constraints | Reserve for a future profile with material real-time bounds |
| PRISM | Probabilistic reliability, performance, cost, and stochastic schedulers | The current conformance claim is qualitative and deterministic | Reserve for future quantitative operational questions |

### TLA+ and TLC

TLC is mature, explicit-state, checks invariants and liveness over finite configurations, and produces concrete counterexample behaviors. TLA+ makes stuttering, temporal properties, fairness assumptions, and abstraction mappings first-class, which aligns well with the reducer-to-Temporal boundary. The project’s Java 21 runtime could host TLC without another runtime language. [Specifying Systems](https://lamport.azurewebsites.net/tla/book.html)

The latest stable GitHub release inspected on 2026-07-23 is `tlaplus/tlaplus` `v1.7.4`, released 2024-08-05 under MIT. This is research provenance, not a project pin.

### Quint and Apalache

[Quint](https://quint-lang.org/) provides a typed, executable specification language with TLA-style semantics, simulation, model checking, and model-based testing. It is worth comparing with direct TLA+ if developer feedback and integration into a TypeScript-heavy repository matter more than using the canonical notation.

[Apalache](https://apalache-mc.org/docs/apalache/index.html) translates verification problems into SMT constraints and supports bounded checking and inductiveness checking. Its documentation describes it as an experimental alternative to mature TLC, and bounded analysis covers finite executions up to a chosen length.

The latest stable release inspected on 2026-07-23 is `apalache-mc/apalache` `v0.58.3`, released 2026-07-09 under Apache-2.0.

### P and SPIN

[P](https://github.com/p-org/P) is designed around communicating event-driven state machines and systematic exploration of message interleavings and failures. Its ability to connect specifications with implementation testing or trace validation makes it especially relevant if the adapter is represented as handlers, queues, and fault points rather than as a declarative temporal formula.

[SPIN](https://spinroot.com/spin/whatispin.html) is a mature verifier for Promela process/channel models with assertions, progress and acceptance conditions, and LTL. It is a credible performance-oriented choice for an asynchronous protocol when a compact operational model is easier to review than a refinement mapping.

### mCRL2, FDR, and behavioral equivalence

[mCRL2](https://mcrl2.org/web/user_manual/index.html) directly supports process-algebra models, labelled-transition-system generation, behavioral-relation comparison including branching variants, deadlock checking, and modal properties. It may be more suitable than TLA+ when the central artifact is a finite reducer/adapter LTS and the question is genuinely simulation or bisimulation.

[FDR](https://cocotec.io/fdr/) checks CSP refinement in traces, failures, and failures-divergences models. That vocabulary is excellent for refusal, deadlock, and divergence questions, but its licensing and ecosystem must be evaluated before project use.

### Alloy, Electrum, and LoLA

[Alloy 6](https://alloytools.org/) combines relational modeling with mutable state and temporal operators. [Electrum](https://haslab.github.io/Electrum/) extends relational first-order temporal modeling with bounded and unbounded analysis. Both are potentially better than TLA+ for exploring the BPMN metamodel, scopes, references, static admissibility, and small structural evolution.

[LoLA](https://theo.informatik.uni-rostock.de/theo-forschung/tools/lola/) is a Petri-net analyzer for reachability, deadlock, and temporal properties. It fits net-representable BPMN control flow and workflow soundness, but it cannot silently stand in for full BPMN or CIB semantics.

### Specialized options

[UPPAAL](https://uppaal.org/) is relevant if a future profile introduces true timed-automata obligations such as explicit upper and lower real-time bounds. [PRISM](https://www.prismmodelchecker.org/) is relevant if probabilistic failure, reliability, or performance becomes a requirement. Neither answers the current deterministic conformance question.

TLAPS, Coq, Isabelle, or another general theorem prover would duplicate Lean’s assigned role unless a concrete missing proof capability justifies the extra trust and maintenance boundary.

## Selection test

Before adding any auxiliary formal tool, write down:

1. the exact semantic, concurrency, liveness, structural, or quantitative question;
2. a deliberately seeded defect the tool must expose;
3. the abstraction from Lean or implementation state into the model;
4. how a counterexample becomes a neutral scenario, fault schedule, or retained trace;
5. the focused and scheduled feedback budgets;
6. what evidence is gained beyond current Lean proofs and differential, replay, or fault tests;
7. the removal condition if the experiment fails to pay for itself.

A two-tool comparison is justified only when both address the same question and seeded defect. It is not necessary to standardize one auxiliary tool for every kind of problem.

## Pipeline integration

Any auxiliary formal experiment belongs in extended assurance unless its measured focused check fits the semantic-loop budget. None belongs in the Milestone 0 full-pipeline gate.

```text
BPMN/CIB research
  -> Lean semantic capsule and invariants
  -> TypeScript reducer differential tests
  -> optional question-specific exploration or equivalence check
  -> Temporal adapter and fault-injection tests
  -> retained-history replay
  -> observational stuttering-refinement report
```

A model or generated state space should be selected by semantic capsule and kept small in the focused loop. Large exhaustive sweeps belong in scheduled assurance.

Every result must record:

- tool, model, and translation revision;
- configuration constants and state-space bounds;
- checked invariants and temporal properties;
- fairness assumptions;
- explored states and distinct states;
- completion or counterexample;
- linked profile, requirement, scenario, Lean semantics, and adapter revision;
- whether the counterexample was reproduced against code.

## Proof and evidence boundaries

| Evidence | Honest claim |
|---|---|
| TLC completes one finite configuration | No violating behavior exists in that configured finite model |
| TLC finds a counterexample | The TLA+ model permits a violating behavior; code impact still requires reproduction or a justified refinement link |
| TLA+ refinement mapping model-checks | The configured concrete model refines the configured abstract model under the encoded mapping and properties |
| Lean proves a simulation theorem | The theorem holds for the stated Lean transition systems and assumptions |
| Temporal fault tests match the model | The tested implementation executions agree with the model projection |
| All of the above | Strong layered evidence, still not a machine-checked proof of the Temporal Service or TypeScript program |

No report should say “the Temporal adapter is proved correct” unless the actual executable bridge and trust assumptions justify that exact statement.

## Risks

### Duplicate formal semantics

The largest risk is reimplementing BPMN twice. Keep every auxiliary model restricted to the question-specific boundary and a tiny reducer-interface abstraction.

### Wrong abstraction mapping

A mapping can erase the defect it is supposed to detect. Canonical observations, enabled stimuli, command outcomes, active waits, and semantic identity must remain visible.

### Hidden divergence

Weak equivalence can hide infinite retry or replay. Every adopted relation needs divergence sensitivity or explicit progress properties.

### State explosion

Commands, tokens, task IDs, histories, and retries grow combinatorially. Use symmetry, tiny identifier sets, abstract history summaries, and capsule-specific bounds. Never model full Event History payloads.

### Accidental fairness

Overly strong fairness assumptions can prove desired liveness by assuming away the failure. Attach each assumption to one environment responsibility and check the corresponding no-fairness counterexample.

### Tool-result overclaim

Finite model checking is not an unbounded proof. The exact configuration is part of every result.

### Pipeline slowdown

An auxiliary tool is valuable only if counterexamples or evidence arrive quickly enough to influence design. Measure the focused experiment before adoption and keep slow exhaustive runs in extended assurance.

## Decisions by project phase

| Phase | Auxiliary method | Behavioral relation |
|---|---|---|
| Milestone 0 sequential walking skeleton | None | Exact canonical trace equality plus replay and fault examples |
| First adapter fault or concurrency question | Choose only if normal tests leave a material schedule, liveness, or equivalence gap | Candidate forward stuttering refinement with explicit progress properties |
| First concurrent BPMN capsule | LTS comparison, temporal model checking, or implementation exploration are all candidates | Causal observations; use a divergence-sensitive branching relation only if choice/deadlock preservation is the question |
| Mature semantic core | Capsule-specific bounded models, generated LTSs, or Lean exploration only where payoff justifies them | Lean-proved simulation or refinement where payoff justifies it |
| Production Temporal deployment | A model informs tests; it does not verify the Service | Replay, fault injection, trace validation, and refinement evidence |

## Open decisions

1. Which concrete post-M0 question, if any, cannot be answered efficiently by Lean and implementation tests alone.
2. The exact abstract and concrete state projections.
3. Which steps are visible under the BPMN standard profile and each CIB compatibility profile.
4. Whether realizability is checked as a second simulation, explicit enabled-input preservation, or test coverage rather than symmetric bisimulation.
5. The no-hidden-divergence technique: temporal liveness, a rank, divergence-sensitive branching bisimulation, or a combination.
6. The common format for projecting tool counterexamples into neutral fault schedules.
7. The exact tool artifact, checksum, license record, command, and performance budget if an experiment is approved.

## Final assessment

TLA+ has high potential at one narrow boundary: designing and model-checking the durable protocol that connects the pure reducer to Temporal under interleavings and faults. It is not uniquely required. P or SPIN may fit an event-driven protocol better, mCRL2 or FDR may fit an explicit equivalence question better, Alloy or Electrum may fit metamodel constraints better, and LoLA may fit net-shaped soundness questions better.

Bisimulation has high conceptual value, but “bisimulation” is not one property. Strong bisimulation is wrong for this architecture; ordinary weak bisimulation is too permissive around branching and divergence; symmetric equivalence is usually stronger than implementation correctness requires.

The architecture should continue to describe the intended adapter contract as observational, weak, stuttering-aware refinement with explicit progress obligations. This is vocabulary and a design target, not yet a proof or tool choice. Use a named bisimulation relation only when a particular finite transition system and relation are actually checked or proved.

## Primary sources

- Leslie Lamport, [Specifying Systems](https://lamport.azurewebsites.net/tla/book.html), especially behaviors and stuttering, proving implementation with refinement mappings, liveness and fairness, composition, and TLC
- Martín Abadi and Leslie Lamport, [The Existence of Refinement Mappings](https://lics.siglog.org/archive/1988/AbadiLamport-Theexistenceofrefin.html)
- TLA+ project, [TLA+ Wiki](https://docs.tlapl.us/) and [TLC trace validation](https://docs.tlapl.us/using%3Atlc%3Atrace_validation)
- Apalache project, [symbolic model-checker documentation](https://apalache-mc.org/docs/apalache/index.html) and [symbolic model-checking model](https://apalache-mc.org/docs/tutorials/symbmc.html)
- Informal Systems, [Quint](https://quint-lang.org/)
- P project, [P language repository and documentation](https://github.com/p-org/P)
- SPIN project, [What is SPIN?](https://spinroot.com/spin/whatispin.html)
- mCRL2 project, [user manual](https://mcrl2.org/web/user_manual/index.html)
- Cocotec, [FDR refinement checker](https://cocotec.io/fdr/)
- Alloy project, [Alloy](https://alloytools.org/), and HASLab, [Electrum](https://haslab.github.io/Electrum/)
- University of Rostock, [LoLA](https://theo.informatik.uni-rostock.de/theo-forschung/tools/lola/)
- [UPPAAL](https://uppaal.org/) and [PRISM](https://www.prismmodelchecker.org/)
- Rob van Glabbeek and Peter Weijland, [Branching Time and Abstraction in Bisimulation Semantics](https://theory.stanford.edu/~rvg/abstraction/)
- B. Kiepuszewski, A. H. M. ter Hofstede, and W. M. P. van der Aalst, [Fundamentals of Control Flow in Workflows](https://pure.tue.nl/ws/files/1688655/612177.pdf)
