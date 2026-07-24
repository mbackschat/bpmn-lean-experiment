# Project design

The project’s durable goal is a Temporal adapter that imports BPMN 2.0.2 Process diagrams and fully satisfies OMG BPMN Process Execution Conformance. That normative goal is implemented and assured through a versioned CIB Seven semantic profile, an executable Lean reference interpreter, a pure TypeScript semantic core, and continuous differential and refinement testing.

The BPMN and CIB targets are related but not interchangeable. BPMN 2.0.2 defines the normative Process Execution Conformance obligation. A versioned CIB Seven profile defines a concrete behavioral-compatibility claim for a pinned release and observation boundary where the standard is ambiguous, non-operational, configuration-dependent, extended, or observably different.

The complete architecture contract is the [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md), and the exact standard-facing goal is owned by the [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md). This document owns only the project-local constitution and the first delivery boundary.

The preserved handoff calls the TypeScript component a “reducer.” The project now calls the same component the **semantic core**, describes it formally as a semantic transition system, and names its public transition operation `applyStimulus`. This vocabulary change avoids an unnecessary Redux association and does not alter the component boundary.

## Decision

Build independent implementations that agree through a neutral profile, scenario vocabulary, canonical observations, and evidence. CIB Seven remains a complete external oracle rather than a reusable semantic kernel. Lean turns the standard, profile decisions, and observed behavior into an executable operational account with machine-checked properties. TypeScript provides the production semantic core without Temporal or CIB dependencies. Temporal provides durable hosting and hidden orchestration work without becoming a BPMN semantic authority.

Lean’s purpose is not merely to document an already finished adapter. It should accelerate implementation by making ambiguous rules, state distinctions, preservation obligations, counterexamples, generated traces, and refinement relations executable before they are duplicated in TypeScript and Temporal.

## Assurance roles and Lean value

Correctness is not one binary property in this architecture. Each component answers a different question, and no agreement vote can replace the missing lane:

| Component | Strongest question it can answer | What it cannot establish alone |
|---|---|---|
| BPMN clauses and semantic profile | What behavior is required or deliberately selected? | That an implementation performs it |
| Pinned CIB Seven | What did the selected compatibility oracle do under the declared environment and observation boundary? | Universal BPMN correctness or project semantics |
| Lean reference interpreter | What does the selected operational account mean, and which laws hold for every represented state satisfying their hypotheses? | Correctness of CIB, XML parsing, TypeScript, Temporal, databases, or effects |
| TypeScript semantic core | Does the production transition implementation independently realize the selected behavior for tested inputs? | Universal correspondence with Lean or durable-host correctness |
| Temporal adapter | Does the tested durable host preserve core-visible behavior under Query, Update, duplicate delivery, and replay? | BPMN meaning that is absent from the semantic core |
| Differential and refinement pipeline | Do the independent observable results and durable-host projections agree for the maintained evidence? | Universal equivalence outside the declared corpus and hypotheses |

Lean is valuable when it converts a semantic risk into a reusable quantified law. The first interaction capsule’s [`task_identity_mismatch_is_rejected`](../BpmnSemantics/SequentialUserTask.lean) theorem quantifies over the model, active Process instance and activation, submitted task occurrence, command identity, and logical time. Given a mismatch in any semantic identity component, it proves rejection, exact state preservation, an empty semantic microtrace, and no closure-bound involvement. The narrower wrong-activation theorem is a corollary. Removing any identity check from command admission makes the general theorem fail, which guards the semantic mechanism rather than one fixture.

Concrete `by decide` trace theorems remain useful executable witnesses, but they are not presented as general laws. Likewise, determinism merely inherited from implementing a transition as a function is not a substantive assurance result. A retained Lean law should quantify over a meaningful class of states or inputs, expose its exact hypotheses, rule out a realistic defect, survive reuse by another witness, and fail under a mutation of the protected semantic mechanism.

Formalization also provides architectural value before a theorem is finished: it forces definition identity apart from runtime occurrence identity, external command admission apart from internal closure, committed outcomes apart from harness exhaustion, and semantic state apart from CIB and Temporal host identity. These distinctions are transferred into the executable IR, TypeScript core, observation contract, and adapter boundary.

The current Lean account is intentionally bounded. It does not parse BPMN XML, prove the compiler, consume arbitrary executable IR, or machine-check TypeScript or Temporal refinement. Those gaps are maintained explicitly in the [implementation map](IMPLEMENTATION-MAP.md). A future correspondence bridge must be evidenced rather than inferred from matching names or serialized examples.

## BPMN ingestion and execution decision

The production architecture is an **interpreter/evaluator in TypeScript, not a BPMN-to-TypeScript code generator**.

```text
BPMN 2 XML
  → source-preserving BPMN model
  → schema, reference, and profile validation
  → normalized executable IR as versioned data
  → TypeScript semantic-core transitions
  → Temporal durability and effect hosting
```

Parsing and deployment admission occur outside deterministic Temporal Workflow execution. The admitted executable IR is immutable or content-addressed and carries the exact source-model and semantic-profile identity needed for replay. A generic Workflow hosts that representation and serializes external inputs through the semantic core; Temporal Activities, timers, messages, and child operations implement declared effects and waits only after the semantic core has assigned their BPMN meaning.

This choice keeps one inspectable data representation aligned across Lean, TypeScript, CIB probes, differential traces, and retained histories. It also avoids compiling each model into a new Workflow Definition whose generated control flow, SDK calls, deployment version, and replay compatibility could become accidental semantics. Profile migration, parser evolution, semantic-core evolution, and Worker deployment remain separate version dimensions.

Code generation is not prohibited. A generated TypeScript view may later serve debugging, static specialization, performance, or deployment packaging, but it remains a derived artifact. It may replace interpretation only after explicit equivalence and replay evidence and must never become the semantic authority by construction.

Milestone 0 first exercised the hosting boundary with an explicit sequential model. The approved first ingestion slice now captures the actual BPMN XML bytes and hash, imports a private structural view with isolated `bpmn-moddle@10.0.0`, compiles only the sequential Process to source/profile/compiler-identified project IR, and supplies that data to both the pure core and Temporal. A general BPMN source model/compiler, full CMOF binding, and deployment store remain explicitly absent.

## MVP feasibility conclusion

The bounded sequential User Task slice demonstrates that the architecture is technically feasible as a fast development loop: exact BPMN bytes can be admitted once, CIB and Lean can remain independent semantic references, the production TypeScript transition system can stay pure, and one generic Temporal Workflow can host its state through replay-safe versioned IR. The maintained batch amortizes the expensive reference and host boundaries rather than multiplying their startup cost per witness.

This result validates the separation of responsibilities, not the scalability of the semantic model to all BPMN. The current control state has no general token, scope, race, effect, or variable model; the compiler recognizes one topology; Lean’s batch emitter uses compiled-in capsule scenarios; and Temporal has not yet exercised Activities, timers, cancellation, Worker restart, or Continue-As-New. The evidence therefore supports advancing one separating semantic capsule at a time while retaining the same pipeline, not broadening the public claim.

The next feature should be selected for the distinct semantic and representation risk it exposes. General infrastructure is introduced only when that feature provides a second real consumer and a mutation or counterexample capable of distinguishing competing designs. The current recommendation and exact resume point belong in the [plan](PLAN.md).

## Milestone 0 delivery boundary

Required now:

- retain the verified foundation and source boundaries;
- establish the complete fast walking-skeleton pipeline defined in [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md);
- use actual BPMN XML for the none-start → User Task → none-end slice;
- capture and compile that exact XML outside Workflow execution without exposing parser objects;
- calibrate pinned CIB Seven behavior through public APIs;
- execute the same neutral scenario in Lean and a pure TypeScript semantic core;
- host the semantic core through a Temporal adapter without moving semantics into Temporal;
- compare canonical traces and replay retained history;
- measure and meet the warm and cold feedback budgets.

Excluded from this first delivery:

- claims of BPMN conformance or CIB compatibility;
- BPMN features outside the single sequential User Task slice;
- CIB Seven extraction, forking, or runtime linkage from Lean or the semantic core;
- production Temporal deployment concerns;
- broad conformance, MIWG, or CIB-suite execution before the walking skeleton is fast.

## Success criteria

Milestone 0 is complete when:

1. a new contributor can resume from repository documentation without chat history;
2. the single scenario executes through CIB, Lean, the semantic core, and Temporal;
3. all targets agree through the canonical observation contract;
4. an injected semantic disagreement is classified correctly;
5. retained Temporal history replays deterministically;
6. repeated runs prove isolation and cleanup;
7. the measured semantic and full-pipeline feedback loops meet their budgets;
8. no public claim or dependency crosses its declared boundary.

The exact current state is maintained in the [implementation map](IMPLEMENTATION-MAP.md), while the next owner decisions and work sequence are maintained in the [plan](PLAN.md).
