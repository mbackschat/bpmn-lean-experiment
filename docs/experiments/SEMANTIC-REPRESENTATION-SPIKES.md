# Semantic representation spikes

**Status:** Executed, provisional candidates retained

**Purpose:** Test foundational representation distinctions before selecting the production BPMN source model, executable IR, runtime state, or reducer transition system.

**Non-claim:** These experiments do not implement BPMN semantics, establish CIB Seven compatibility, select a parser, or change the approved Milestone 0 feature profile.

The source research and architectural assessment are in [Semantic representations and execution models](../research/SEMANTIC-REPRESENTATIONS.md). The executable candidates are in [SemanticRepresentations.lean](../../BpmnSemantics/Experiments/SemanticRepresentations.lean), and the focused gate is [SemanticRepresentationsMain.lean](../../BpmnSemantics/Experiments/SemanticRepresentationsMain.lean).

## Method

The spike follows the sibling Lean experiment’s risk-spike discipline: write competing accounts and a separating witness before generalizing a representation. Retain the weaker account only when it functions as a deliberate countermodel proving that the witness can detect the relevant loss of information.

## Experiment 1: source model versus executable IR

### Question

Can a small data-only executable IR discard XML presentation concerns while retaining the semantic identities and provenance needed by execution, diagnostics, Lean, TypeScript, and Temporal serialization?

### Candidate

The source candidate retains source locations, documentation, extension attributes, and diagram bounds. The compiler validates node identity and references, then emits executable nodes, resolved flows, explicit order, scope relations, and source or synthetic provenance.

### Separating witness

The sequential source document contains three nodes, two flows, source locations, and documentation. The compiled model must contain three executable nodes, two resolved flows, and source provenance for every node without embedding source-presentation data in the executable type.

### Result

The witness passes. This proves representational capacity for the tiny example, not that the field set or compiler boundary is complete.

### Still undecided

- BPMN parser and source-model library
- preservation policy for unknown extensions and BPMN-DI
- QName and import resolution
- exact normalized-model schema
- which indexes are serialized versus derived
- semantic digest and compiler-version policy

## Experiment 2: distinct scope relations

### Question

Can the executable node type represent flow ownership and event ownership as independent relations?

### Candidate

`ScopeRelations` contains separate `flowScope` and `eventScope` identities. A boundary-event-shaped witness assigns the Process as flow scope and the attached Task as event scope.

### Result

The witness passes and rules out an IR with only one undifferentiated parent pointer.

### Limit

The witness demonstrates capacity only. It deliberately does not claim that its boundary-event ownership assignment is the complete BPMN or CIB Seven rule. Later probes must determine whether the final IR needs a richer relation vocabulary such as containment, execution scope, event scope, variable scope, cancellation region, and compensation scope.

## Experiment 3: join arrival count versus edge provenance

### Question

Is a count of executions or tokens at a gateway sufficient to represent join readiness?

### Competing accounts

```text
count-only:
  arrivals at gateway >= number of incoming flows

edge-provenance:
  every incoming flow has at least one offered token
```

### Separating witness

The gateway has incoming flows `Flow_Left` and `Flow_Right`. Two tokens arrive through `Flow_Left`; none arrives through `Flow_Right`.

```text
             Flow_Left ── token 1 ─┐
                         token 2 ──┼──▶ Join
            Flow_Right ── no token ┘
```

### Result

The deliberately weak count-only account returns ready. The edge-provenance account returns not ready. The focused gate requires both results, so removing the discriminatory weakness from the countermodel or losing provenance from the stronger candidate fails the experiment.

### Consequence

An arrival count cannot be the sole normative join state when readiness depends on incoming-flow identity. CIB Seven’s execution-count implementation remains relevant compatibility evidence because it can differ on this witness. The project has not yet selected a universal token or offer representation.

## Experiment 4: command closure over microsteps

### Question

Can the external command boundary remain separate from internal execution while using data-only definition and runtime state?

### Candidate

The sequential witness has a shared executable model and separate runtime state containing scope instances, tokens, User Task waits, and Process status. `applyStimulus` admits one external stimulus, while `closeInternal` performs bounded internal steps until stable.

```text
start command
  ├─ take Start → User Task flow
  ├─ create User Task wait
  └─ stable running state

complete User Task command
  ├─ complete wait
  ├─ take User Task → End flow
  ├─ consume End token
  └─ stable completed state
```

### Result

The start command closes after two microevents at one active wait. The completion command closes after three microevents at Process completion. The closure bound produces an experiment-level `internalStepBoundExceeded` result rather than inventing a BPMN incident.

### Limit

The deterministic sequential transition code is intentionally too small to serve as production semantics. It does not define rollback, concurrency, event races, variables, effects, jobs, or CIB behavior.

## Red/green evidence

The red build was run before the candidate implementation existed:

```text
lake build checkSemanticRepresentationSpike
```

It failed because `BpmnSemantics.Experiments.SemanticRepresentations` was absent.

After implementing the candidate module:

```text
lake build checkSemanticRepresentationSpike
lake exe checkSemanticRepresentationSpike
```

Both commands passed, and the executable reported `Semantic representation spike checks passed.`

The measured warm focused build completed in 0.20 seconds, and the measured warm executable gate completed in 0.40 seconds on 2026-07-23. These timings cover only the local Lean spike.

## Provisional findings

- Preserve a source-facing model and a separate executable IR.
- Treat normalization as a compiler boundary with validation and provenance, not object deserialization.
- Keep definition state separate from runtime instance state.
- Do not overload one object as node definition, token, scope instance, and persistence record.
- Retain flow-arrival identity until a later proof or observation shows it can be safely projected away.
- Represent internal closure separately from the external command and commit boundary.
- Keep bounded-exploration exhaustion outside BPMN semantic failure.
- Treat dual scopes as the minimum capacity test, not necessarily the final scope algebra.

None of these findings selects a production schema. They define information that a candidate must not erase prematurely.

## Executed M0.2 PVM projection

The first read-only projector is implemented in [PvmDefinitionProjector.java](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/PvmDefinitionProjector.java) and covered by [CibSevenScenarioRunnerTest.java](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java). It executes inside a CIB command context, resolves the deployed definition from the deployment cache, recursively enumerates flow and event activities, preserves outgoing-transition order, normalizes the generated root definition identity back to the source Process ID, and emits only diagnostics.

For the sequential User Task model, the projected topology is `StartEvent_1 → UserTask_Approve → EndEvent_1`; behavior classes are `NoneStartEventActivityBehavior`, `UserTaskActivityBehavior`, and `NoneEndEventActivityBehavior`; every activity has the source Process as flow scope; ordinary flow activities have no PVM event scope; and the None End Event’s internal activity type is `noneEndEvent`. The absent event-scope values and normalized end-event type correct provisional expectations without changing the canonical public trace.

This result supports preserving distinct flow-scope and optional event-scope relations, but it does not yet justify a final scope algebra. Defaults, synthetic nodes, nested scope behavior, scope flags, boundary Event attachment, Event Sub-Processes, and multi-instance normalization remain untested.

## Next experiments

### PVM definition projection extensions

After the walking skeleton establishes a project compiler output, compare it structurally with the implemented diagnostic projection while retaining the public CIB trace as the compatibility evidence. Add scope flags, defaults, synthetic nodes, boundary Event, Event Sub-Process, and multi-instance fixtures only when a named diagnostic question requires them; they remain outside the product profile.

### Source-preservation comparison

After a BPMN ingestion dependency is approved, compare CIB Model API, `bpmn-moddle`, and the smallest viable standards-preserving front end on unknown extensions, BPMN-DI, QName imports, source locations, duplicate IDs, and parse/serialize/import stability.

### Runtime representation discriminator

Compare at least two runtime accounts on one boundary-event cancellation case and one multi-instance case:

- explicit token, activity-instance, and scope-instance records;
- activation and edge-offer records inspired by fUML.

The witness must expose cleanup ownership and multiplicity, not just the final Process status.

### Global event-selection discriminator

When the Events profile is opened, compare independent local message-handler mutation with a centralized enabled-transition selection step on simultaneous Timer and Message delivery. The candidate must preserve a single declared winner, losing-subscription cancellation, deterministic replay, and CIB-observable command serialization.

## Stop condition

Do not generalize the experiment types or import them into production semantics merely because the current witnesses pass. Generalization begins only when the CIB projection, BPMN requirement, or a second completed semantic consumer demands the same distinction and result domain.
