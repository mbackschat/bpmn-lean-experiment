# Scoped runtime data specification

## Status

**Implemented current pre-release contract.**

## Role

This capsule owns the implemented atomic replacement of the flat Semantic Process runtime-variable representation with explicit Process and Activity-local scope ownership. It changes no BPMN source admission, mapping language, canonical observation, effect result, or CIB profile meaning.

Exact implementation status belongs in the [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), immediate sequencing belongs in [PLAN.md](../PLAN.md), and the runtime representation boundary belongs in [the Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md).

## Question

Can the implemented data-mapping slices represent Process and Activity-local bindings as different owned scopes, with Activity-local state keyed by complete semantic effect-occurrence identity and removed atomically on effect completion, without changing the public Process-variable observation or adding a second runtime representation?

The discriminator is two active effect occurrences that may use the same local variable name. Completing one occurrence must read and remove only the scope owned by that complete occurrence; a representation keyed only by element ID, activation ordinal, or variable name is insufficient.

## Required scope

- one `ScopedVariables` runtime value containing one Process scope and zero or more Activity-local scopes;
- one Activity-local owner per active effect occurrence, identified by the complete tuple `(processInstanceId, elementId, activation)`;
- effect activation creates the owned local scope from evaluated input mappings;
- effect completion validates the result patch against the matching owned local scope, applies output mappings to Process scope, and removes only that local scope;
- successful and matching-BPMN-Error effect results use the same scope lookup, patch validation, Process write, and cleanup mechanism;
- canonical `variables` continues to expose only Process-scope bindings;
- `openEffects[].arguments` continues to expose the immutable committed effect arguments and is not a general projection of Activity-local state;
- every affected Lean theorem and example is restated over explicit scope ownership;
- every TypeScript runtime construction and transition uses the replacement shape directly;
- the Temporal adapter persists and replays the replacement core state without interpreting or separately projecting Activity-local scope.

## Excluded scope

Nested Sub-Process, Event Sub-Process, Call Activity, transaction, compensation, event, execution-listener, multi-instance, and participant scopes are excluded. Scope shadowing, parent traversal, general expression lookup, Process input, User Task form data, public Activity-local observation, mutable Worker access, and any new variable value kind are excluded.

No compatibility reader, root-scope wrapper, migration function, format counter, Workflow patch branch, or parallel legacy runtime shape is permitted under the pre-release evolution policy.

## Runtime replacement

The TypeScript contract is:

```ts
type ProcessVariableScope = DeepReadonly<{
  bindings: VariableBinding[];
}>;

type ActivityVariableScope = DeepReadonly<{
  owner: EffectOccurrenceId;
  bindings: VariableBinding[];
}>;

type ScopedVariables = DeepReadonly<{
  process: ProcessVariableScope;
  activities: ActivityVariableScope[];
}>;
```

`RuntimeState.processVariables` is removed and replaced by `RuntimeState.variables: ScopedVariables`. The Lean runtime makes the same replacement with distinct `ProcessVariableScope`, `ActivityVariableScope`, and `ScopedVariables` structures.

Activity scopes retain deterministic activation order and are selected only by the complete occurrence tuple. Duplicate owners are invalid. Bindings within each scope retain the existing canonical variable-name order and duplicate-name refusal.

An effect wait retains its immutable public arguments because they are part of committed effect intent, transport identity, and `openEffects`. Its owned Activity-local scope is the private evaluation environment. Activation creates both from the same evaluated input mapping. Completion reads the private scope, merges the validated patch transiently, evaluates the program-owned output mapping, writes Process scope, and removes the private scope in one semantic transition.

The replacement does not change `scenario.schema.json`, `StateObservation.variables`, any retained CIB evidence, or the content-bound command and effect-transport encodings.

## Stable rules

### `SDATA-PROCESS-01`

Process bindings have one explicit Process owner. Only Process bindings enter canonical `variables`, and they survive effect-local cleanup through Process completion.

### `SDATA-ACTIVITY-01`

Every active mapped effect occurrence owns exactly one Activity-local scope whose owner is the complete semantic effect-occurrence identity. Bare element ID, bare activation ordinal, host identity, and variable name are not scope identities.

### `SDATA-COMPLETE-01`

Matching effect completion validates and evaluates only against the Activity-local scope owned by the submitted occurrence, updates Process scope through committed output mappings, and removes only that owned scope atomically.

### `SDATA-OBSERVE-01`

Activity-local bindings are not part of the canonical public variable observation. Committed effect arguments retain their existing explicit `openEffects` projection; no other local binding is projected.

### `SDATA-REFUSE-01`

An absent, duplicate, or mismatched Activity-local owner prevents effect completion with exact runtime-state preservation. A patch cannot fall back to Process scope or another occurrence's local scope.

## Lean migration inventory

The pre-replacement census contains 48 production theorems and 66 production examples. Thirty-seven theorems and all 66 examples depend directly or transitively on `RuntimeState`, its fixtures, evaluator results, or exact observations and therefore must continue to elaborate against the replacement type. The migration may discharge unchanged propositions by recompilation, but it may not insert a root-only conversion or restate a variable proposition without explicit Process or Activity-local ownership.

The scoped-data-specific proof obligations are:

- effect activation creates the exact occurrence-owned scope;
- executable completion is sound with respect to a declarative relation that names both the owned Activity-local scope and resulting Process scope;
- completion removes exactly the submitted occurrence's scope;
- the existing direct-local-patch-to-Process-scope account remains a checked non-law;
- canonical projection ignores private Activity-local bindings;
- full-occurrence mismatch and missing-scope cases preserve the exact state.

## TypeScript migration boundary

Every `RuntimeState` literal, semantic transition, scenario projection, test fixture, Temporal state holder, and diagnostic consumer uses `ScopedVariables` directly. The focused red witness was the mapped Service Task waiting state: it required empty Process bindings plus one complete-occurrence-owned Activity scope. The completion witness requires the mapped Process binding and no Activity scope.

The two-occurrence discriminator constructs distinct complete owners with the same local binding name and proves that completing one cannot read or remove the other. An observation witness adds a private local binding not present in committed arguments and proves that it does not enter canonical `variables` or `openEffects`.

## Targeted preservation gate

This representation replacement triggers the targeted preservation gate even though it admits no new source.

- Closure bound: the capsule adds no semantic transition. An executable focused guard establishes the exact mapped-effect start closure length and proves it remains below `semanticProcessClosureLimit`, currently 8.
- Multiple-enabledness: internal-operation enabledness does not inspect scoped data. An executable guard compares enabled/disabled results for states that differ only in scoped data. The capsule creates no newly reachable multiple-enabled state and makes no selector choice.
- Lowering: checked graph and Semantic Process program equality are unchanged because scoped data is runtime-only.
- Observation: exact scenario traces remain unchanged, and the local non-observability witness separates the replacement from a public-scope leak.

## Temporal hosting/refinement preflight

| Concern | Hosting decision | Required evidence |
|---|---|---|
| Durable ingress | Start and `completeEffect` remain the only relevant semantic inputs | Existing content-bound stimulus and accepted-result guards remain green |
| Wait and effect | The Workflow schedules an Activity only from the unchanged committed `openEffects` intent | Request and transport-key bytes remain unchanged |
| Runtime state relation | Workflow-held semantic state contains the exact replacement `ScopedVariables`; the adapter does not normalize, flatten, or interpret it | Live execution and replay agree on unchanged canonical traces |
| Local lifecycle | Input mappings create the local scope inside core closure; accepted completion maps and removes it inside one pure `applyStimulus` call | Waiting and completion focused witnesses plus replay |
| Projection | Query, receipt, and differential output project Process bindings only | Private-local mutation is absent from canonical state |
| Delivery and retry | Activity attempts and replay stutter over the same committed local scope and effect intent | Existing retry, Worker replacement, idempotency, and replay gates remain green |
| Ordering and concurrency | One Workflow loop serializes stimuli; complete occurrence identity selects the owned local scope | Two-owner discriminator and existing full-identity refusal law |
| Cancellation and failure | Unsupported cancellation and exhausted Activity behavior remain adapter failures; neither leaks or cleans semantic local state through host policy | Existing failure guards remain green |
| History and versioning | No new Temporal Command, payload, public schema, Continue-As-New state, or retained history baseline is introduced | Event History command facts and live replay remain unchanged |

The nearest host counterexample is an adapter that flattens Activity-local bindings into Process variables before or after the Activity. The canonical non-observability witness and direct-patch-to-Process-scope non-law reject that account. Continue-As-New remains excluded.

## Rule-to-evidence matrix

| Rule | Lean | TypeScript core | CIB Seven | Temporal | Negative witness |
|---|---|---|---|---|---|
| `SDATA-PROCESS-01` | Explicit Process scope in evaluator, laws, and observations | Replacement state and Process-only projection | Final Process variables remain engine-observed under existing profiles | Query and receipt preserve Process-only projection | Direct local patch does not equal mapped Process result |
| `SDATA-ACTIVITY-01` | Activation and complete-owner laws | Exact owner type and two-owner test | No independent semantic-local-scope claim | Same committed scope survives Activity retry/replay | Element-only or activation-only owner collision |
| `SDATA-COMPLETE-01` | Declarative completion relation and soundness bridge | Patch, mapping, and cleanup transition | Existing successful and caught-error host facts only | Activity result advances only through the core | Completing one owner leaves the other untouched |
| `SDATA-OBSERVE-01` | Process-only observation theorem | Private-local projection mutation | No new evidence or lane claim | Query/receipt contain no local state | Add a private local binding and require unchanged canonical output |
| `SDATA-REFUSE-01` | Missing/mismatched owner state-preservation law | Missing-owner and cross-owner rejection | No semantic completion-ingress claim | Adapter derives the occurrence from committed intent | Fallback to Process or another local scope |

CIB remains the source or host-realization lane for the existing mapping profiles and does not independently validate the project-owned scoped runtime representation.

## Runtime-only constructs

| Construct | Derivation and owner | Public projection | Lifecycle |
|---|---|---|---|
| Process variable scope | Semantic core from start and accepted mappings | Canonical `variables` | Created empty, updated by semantic mappings, retained through completion |
| Activity variable scope | Semantic core from effect input mappings and complete occurrence identity | None generally; committed inputs remain explicit effect arguments | Created with effect activation, patched and removed atomically on matching completion |
| Scope owner | Complete semantic effect occurrence | None beyond the already public effect occurrence | Same lifetime as the Activity-local scope |
| Transient patched local environment | Semantic core from owned bindings plus validated result patch | None | Exists only during one pure completion transition |

## Versioning and evidence consequences

This is an atomic internal pre-release replacement. It changes the Lean and TypeScript runtime state shapes and Temporal's replayed in-memory state but not a current shared wire schema or retained history baseline. All producers, consumers, fixtures, and proofs change together. Existing scenario bytes, canonical results, retained CIB evidence, effect requests, command identities, and transport keys remain byte-identical.

## Stop conditions

Stop for owner direction if the replacement requires public Activity-local observation, a scope owner weaker than complete occurrence identity, a new semantic transition, a new variable value or expression interpretation, a canonical wire change, retained-evidence replacement, a Temporal Command change, Continue-As-New, a dependency change, or weakening any existing mapping/error/refusal claim.

## Owner decision

The owner selected atomic replacement rather than an additive root-scope wrapper. Activity-local state remains non-public, local ownership uses complete semantic effect occurrence identity rather than activation ordinal, and every affected theorem is restated over explicit ownership rather than re-admitted as a root-only claim.
