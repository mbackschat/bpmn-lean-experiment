# Timer Start Event proposal

## Status

**Correction review pending; fresh owner approval is required before live work resumes.** The owner approved the original proposal on 2026-08-11, and the corrected first green semantic checkpoint is independently approved. Checkpoint target `7ac0307` received `approve-with-required-edits`; correction `ba3bbf8` closed the stale IL contract and missing XSD regression binding. Commit `8aa0cc3` atomically registered the profile, answer-free scenario and differential evidence, and runnable example. The live one-action Temporal Schedule witness then proved that the pinned service returns an execution Workflow ID distinct from the configured semantic-instance-derived base ID. The proposed correction below consumes that opaque service-returned execution identity instead of incorrectly treating the configured base as the execution ID. Live evidence and closure remain paused until the correction is independently reviewed and the owner approves it. Product 2 scheduling remains excluded. This proposal selects one top-level Timer Start Event with the exact relative-duration expression `PT1S`, one resolved timer occurrence, and one fresh private executable Process instance. It does not select Product 2 schedule management, deployment activation policy, recurring schedules, calendar expressions, catch-up, overlap, pause/resume, payload, multiple Start Events, Event Sub-Process start, CIB Seven Timer Start compatibility, or a public scheduling API.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `1c5c702` | `fork-turns-none` | `approve-with-required-edits` | `276bee8` |
| Semantic checkpoint | `7ac0307` | `fork-turns-none` | `approve-with-required-edits` | `ba3bbf8` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question

May one exact top-level Timer Start Event instantiate one new Process when its resolved `PT1S` timer occurrence fires, then enter the existing sequential User Task lifecycle without turning Temporal Schedule state or Product 2 deployment policy into BPMN semantic state?

The recommendation is **yes, under the exact source, semantic, host, and evidence boundary below**. The semantic core receives one resolved timer occurrence. The later Product 2 scheduling increment will own schedule creation, exact definition-version binding, activation, deactivation, retry, and operator controls.

## Selection basis

[PLAN.md](../PLAN.md#ordered-work) resumes M2 selection after closing cyclic control flow and Message Start Event. The remaining engine candidates are Timer Start Event, Terminate End Event, and a configured generic Task. Timer Start is selected because it is the most frequent remaining mechanism in the pinned CIB Seven breadth corpus, reuses the established timer and triggered-start boundaries, and directly unlocks the next Product 2 definition-scheduling increment. Terminate End opens scope-wide cancellation, while generic Task still lacks a selected execution binding.

The existing [Intermediate Catch Timer specification](INTERMEDIATE-CATCH-TIMER-SPEC.md) already owns exact `PT1S` lexical admission and normalization to 1000 milliseconds. Reusing that duration representation is correct. Reusing its `awaitTimer`, `openTimers`, or `FireTimer` lifecycle would be wrong because no Process instance exists before a top-level Timer Start occurrence.

The implemented [Message Start Event specification](MESSAGE-START-EVENT-SPEC.md) establishes that a triggered top-level Start Event is distinct from manual `startProcess`, retains exact Start Event identity, and creates no running-instance subscription. Timer Start reuses only the genuinely identical root-occurrence and outgoing-token mechanics. It adds a separate closed timer-start node, operation, and stimulus instead of optional mode fields.

## Normative basis

BPMN 2.0.2 is the semantic authority for this standards-only capsule.

- Clause 10.5.2 states that each Start Event occurrence generates a new Process instance, that a Start Event has no incoming Sequence Flow, and that triggering it produces one token on each outgoing Sequence Flow.
- Clause 10.5.2 and Table 10.84 define Timer Start as a Process trigger at a specific time or on a recurring schedule.
- Clause 10.5.5 and Table 10.101 define mutually exclusive `timeDate`, `timeCycle`, and `timeDuration` TimerEventDefinition forms.
- Clause 10.5.6 owns the common catching-Event occurrence and outgoing-flow handling applied after the Timer trigger is selected.
- Clause 13.2 retains the Process token and completion account after the Start Event produces outgoing control.
- Clause 13.5.1 owns the Process-level Start Event execution context.

The normative CMOF and XSD `StartEvent`, `CatchEvent`, `TimerEventDefinition`, `FormalExpression`, `SequenceFlow`, `timeDate`, `timeCycle`, `timeDuration`, and `isInterrupting` facts constrain source structure. Table 10.84 describes Timer Start using a time-date or cycle, while Table 10.101 explicitly permits `timeDuration` whenever the trigger is a Timer. This proposal reads Table 10.101 as permitting the exact duration form and treats the origin from which that duration is scheduled as a host activation detail, not Process runtime state. BPMN does not standardize deployment-time schedule objects, schedule identifiers, version replacement, catch-up windows, overlap policy, or operator controls. Those are host and product policy.

The standard permits time-date and cycle expressions, multiple Start Events, multiple outgoing Sequence Flows, Event Sub-Process starts, and broader expression languages. This profile defers those conforming cases. Its checked and IL representations retain exact Start Event identity, timer definition, and all outputs so later coverage can broaden admission without reinterpreting programs accepted here.

The proposal adds `BPMN-TIMER-START-01` to the [BPMN requirement ledger](../BPMN-REQUIREMENT-LEDGER.md). It remains `unsupported` until implementation and closure evidence graduate this proposal.

- Ledger citation lock for `BPMN-TIMER-START-01`: Clauses 10.5.2, 10.5.5, 10.5.6, 13.2, and 13.5.1 plus Tables 10.84 and 10.101

## Selected account and rejected alternatives

The representative model is:

```text
Timer Start Event (PT1S) -> User Task -> None End Event
```

One externally resolved timer occurrence creates one semantic Process instance, commits the trigger command, and reaches exactly one fresh User Task occurrence. Completing that occurrence reaches the existing None End completion.

The competing accounts are:

1. **Model deployment as a running semantic Process waiting on `awaitTimer`.** Rejected. Before Timer Start fires there is no BPMN Process instance, runtime state, token, or open Timer occurrence.
2. **Treat Timer Start as manual `startProcess`.** Rejected. That erases Start Event identity and timer definition, so an unrelated start path can instantiate a timer-start definition.
3. **Put due time, schedule ID, definition version, and Temporal policy into the semantic stimulus.** Rejected. Those facts belong to resolution and hosting, not BPMN execution after one Timer Start occurrence is selected.
4. **Resolve whichever definition is latest when the occurrence fires.** Rejected for Product 2. It conflicts with the platform's exact stored definition-version boundary and would silently retarget an active schedule after deployment.
5. **Resolve one due occurrence to one exact definition and Start Event before semantic execution, then use a distinct closed Timer-start stimulus.** Selected.

The primary negative changes `startEventId` while keeping the Process and instance identities fixed. It must reject with exact state preservation and zero Temporal Workflow starts. The host witness separately binds the scheduled action to the exact compiled program identity; definition-version resolution is not performed inside this capsule.

## Exact source profile

One immutable standards-only profile is proposed as `bpmn-2.0.2-timer-start-event-draft`. It admits one BPMN document with:

- one private executable top-level Process;
- one Timer Start Event, one User Task, one None End Event, and two distinct Sequence Flows in one finite acyclic line;
- no incoming Sequence Flow and exactly one conditionless outgoing Sequence Flow on the Start Event;
- exactly one inline TimerEventDefinition on that Start Event;
- exactly one `timeDuration` FormalExpression whose exact lexical body is `PT1S`;
- no `timeDate`, `timeCycle`, second TimerEventDefinition, referenced EventDefinition, data output, output set, Data Association, payload, parser warning, extension element, additional root element, or foreign executable content;
- no explicit `isInterrupting`. The property applies to Event Sub-Process Start Events and the profile rejects it rather than assigning it a top-level meaning;
- no `parallelMultiple`, incoming flow, conditional outgoing flow, nested Process, Event Sub-Process, or additional Start Event;
- arbitrary well-formed source identifiers. No fixture ID or product name participates in admission.

Missing, empty, malformed, repeated, unresolved, or wrong-kind TimerEventDefinition fields reject. `timeDate` and `timeCycle` remain valid BPMN forms outside this exact profile, not malformed Timer Start semantics.

The profile capability fixes the exact node and operation multiset. Reusable graph admission retains distinct identities, reference closure, producer and consumer ownership, legal arity, reachability, co-reachability, whole-graph acyclicity, finite closure, and one root-scope completion.

No fifth compilation-dispatch path is added. The new profile uses generic structural compilation and one exact Start Event projection beside the existing None and Message Start projections. Product-specific mapped readers, overlay readers, and payload-free Service Task dispatch remain unchanged.

## Checked graph and lowering

The checked graph gains a closed node alternative:

```ts
type CheckedTimerStartEvent = DeepReadonly<{
  kind: CheckedNodeKind.TimerStartEvent;
  id: string;
  durationLiteral: "PT1S";
}>;
```

The existing source readers keep their caller-specific TimerEventDefinition contracts. Timer Start and Intermediate Catch Timer require `timeDuration` to be a `FormalExpression`; the Timer Boundary Event readers intentionally accept the modelled `Expression` value produced when `xsi:type` is absent. The implementation may share only a scalar exact-`PT1S` body predicate after each caller has applied its own expression-subtype, placement, arity, interruption, and event-kind rules. It must not replace those policies with one raw-moddle projector. Raw moddle objects stay inside `@bpmn-lean/bpmn-source`.

The node lowers to a separate operation:

```ts
type InitiateTimerOperation = OperationBase & DeepReadonly<{
  kind: SemanticOperationKind.InitiateTimer;
  timer: { durationMs: 1000 };
  outputs: [string, ...string[]];
}>;
```

`origin.elementId` is the exact Timer Start Event identity. The reusable operation has a nonempty canonical collection of distinct output control places, no input, no wait, no subscription, no payload, no variable patch, and no host schedule field. Lowering derives outputs solely from validated Sequence Flow endpoints and normalizes only `PT1S` to 1000 milliseconds. The selected profile requires exactly one output.

The existing `initiate`, `initiateMessage`, and `awaitTimer` operations remain byte-for-byte unchanged. A shared triggered-start helper may produce root-owned output tokens only after its type-specific external admission establishes initiation pending. The discriminants and admission predicates remain exhaustive and separate.

## Trigger stimulus and runtime semantics

The external semantic input is a resolved Timer Start occurrence, not the later Product 2 scheduling API:

```ts
type TriggerTimerStartStimulus = DeepReadonly<{
  kind: StimulusKind.TriggerTimerStart;
  commandId: string;
  processId: string;
  instanceId: string;
  startEventId: string;
}>;
```

The stimulus deliberately carries no due timestamp, duration, Temporal Schedule ID, Workflow ID, definition version, tenant, payload, or initial variables. Those values are either already bound in the selected immutable program or belong to the resolver and host.

The stimulus commits if and only if:

- the runtime is `notStarted`;
- `processId` equals the program Process ID;
- exactly one root definition scope exists for that Process;
- exactly one `initiateTimer` operation has `origin.elementId = startEventId` and `durationMs = 1000`;
- the selected profile and program admit Timer Start execution.

Commit creates one root scope occurrence owned by `instanceId`, sets activation `1`, creates an empty Process-variable scope, changes the Process to `running`, and sets the existing private `initiationPending` flag. Internal closure then fires the matching `initiateTimer`, clears the flag, and creates one root-owned token on every operation output. The selected profile has exactly one start operation and one output, so the existing boolean retains enough information.

No open Timer occurrence is added to runtime state and no logical clock advances. The wait happened outside the not-yet-existing Process. A future profile with several start operations is a stop condition because `initiationPending: boolean` would lose which start operation was selected.

Canonical observation publishes the existing Process status, root-owned control consequences, and downstream User Task occurrence. It publishes no Timer Start subscription, due time, schedule identity, Workflow identity, or host acknowledgement.

## Stable semantic rules

| Rule ID | Proposition |
|---|---|
| `TSTART-SOURCE-01` | The selected source contains one top-level Timer Start Event with one inline `timeDuration` FormalExpression whose exact body is `PT1S`, `0 -> 1` conditionless Sequence Flow arity, and no other timer, payload, or Event Sub-Process property. |
| `TSTART-TRIGGER-01` | From `notStarted`, one resolved Timer Start occurrence commits only when Process ID and Start Event ID equal the admitted `initiateTimer` operation in the selected profile. |
| `TSTART-FLOW-01` | After a committed trigger, `initiateTimer` clears initiation pending and produces one root-owned token on every distinct output without creating a Timer wait or changing variables. The selected profile admits exactly one output. |
| `TSTART-REFUSE-01` | Wrong start kind, Process ID, Start Event ID, profile, root binding, timer definition, or non-`notStarted` state rejects and returns the exact input runtime state by identity. |
| `TSTART-INSTANCE-01` | Two separately admitted occurrences with distinct semantic instance IDs create distinct root scope occurrences and cannot alias one Process instance. |
| `TSTART-OBSERVE-01` | After initiation and internal closure, the representative Timer Start program exposes the same downstream User Task and empty Process-variable observation as corresponding None and Message Start programs after identity normalization. |
| `TSTART-CLOSURE-01` | The representative committed start has exactly two internal steps, `initiateTimer` then `awaitUserTask`; limit `2` reaches the stable User Task wait, limit `1` reports exact overflow, every intermediate state has exactly one enabled internal operation, and the stable running state exposes that User Task as its resumption surface. |
| `TSTART-SCHEDULE-01` | The host may resolve the selected `PT1S` timer through a one-action Temporal Schedule whose action carries the exact compiled program and resolved stimulus, but schedule state and timing policy are not semantic state and cannot alter the committed semantic result. |

`TSTART-TRIGGER-01` and `TSTART-FLOW-01` are vendor-neutral BPMN rules. `TSTART-SCHEDULE-01` is a refinement constraint, not BPMN meaning.

## Lean lane, laws, non-laws, and witnesses

The Lean lane is **proved**. New cohesive owners hold Timer Start admission, transition, and conformance facts. Existing near-limit execution and lowering owners receive only exhaustive dispatch or extracted shared mechanics.

The required proved facts are:

- exact checked-node and program admission for one Timer Start Event and exact normalized duration;
- generic canonical nonempty output admission and selected-profile exact-one output admission;
- lowering preserves Start Event ID, `PT1S -> 1000`, and the complete output list;
- Timer-start evaluator soundness with respect to its declarative relation;
- exact cross-kind refusal between Timer, Message, and None starts with input-state identity preservation;
- two distinct semantic instance IDs create distinct root occurrences;
- exact two-operation closure `initiateTimer -> awaitUserTask` reaches one stable wait;
- closure limit `2` succeeds and limit `1` returns the exact over-limit outcome;
- no state in the representative closure has more than one enabled internal operation;
- the stable User Task wait is preserved without open Timer state;
- after explicit identity normalization, the complete downstream observation agrees with the corresponding None and Message start programs;
- strict checked, program, and scenario decoding accepts the exact shape and rejects missing, extra, malformed, empty, duplicate-key, wrong-kind, and cross-kind values;
- the frozen CheckedSource experiments reject the new node, operation, and stimulus unless they already consume only unrelated generic structure.

The checked non-laws are:

- evaluator soundness does not prove all BPMN Timer expressions, recurrence, wall-clock scheduling, or scheduler fairness;
- `PT1S -> 1000` does not define when deployment activates a Timer Start schedule;
- a one-action Temporal Schedule does not prove the semantic core owns schedule policy;
- distinct semantic instance IDs do not prove exactly-once product delivery after an ambiguous client response;
- the one-output fixture does not prove multiple Start Events or recurring Timer Start behavior.

## Temporal hosting and refinement preflight

The durable ingress is Workflow start with a pre-admitted `TriggerTimerStart` value. It is not a Signal, Update, Workflow Timer, or running-instance command. The finite conformance host uses a test-owned one-action Temporal Schedule whose action starts the exact Process Workflow.

The smallest live witness is:

1. compile the exact Timer Start definition and construct its exact resolved trigger;
2. create a one-action Schedule for one UTC due instant computed as schedule activation plus `PT1S`, with an exact configured Workflow-ID base derived from the semantic instance ID;
3. keep the Worker absent until after the due occurrence so the Temporal service, not test sleep or Worker code, owns start durability;
4. poll the Schedule description after the due occurrence, assert the stored action retains the configured base and exactly one action was taken, and obtain the opaque execution Workflow ID and first Run ID from that service-returned recent action;
5. start the Worker, use the returned execution identity to observe the exact User Task, complete it, and reach the canonical terminal result;
6. fetch history through the returned execution identity, assert no Workflow Timer or Signal family, and replay it exactly.

Delivery and deduplication are host facts. The semantic command identity includes the complete resolved stimulus. The Schedule action stores the exact semantic-instance-derived Workflow-ID base, while the Schedule result returns the opaque execution Workflow ID and first Run ID. The witness uses those returned values for every Workflow operation and never reconstructs service naming policy. A separating negative attempts to address the configured base as the execution ID and must fail before any semantic interaction. The one-action Schedule and its single returned action establish one execution for this finite witness; the configured base alone is not claimed to prevent a second Workflow. Accepted-and-response-lost retry remains a host/client outcome and is not claimed as a BPMN result. Schedule overlap, catch-up, pause, backfill, jitter, and recurring action policy are excluded.

The correction is bound to Temporal CLI `1.8.1`, its embedded Temporal Server `1.31.2`, and TypeScript SDK `1.21.0`. The pinned server explains why its returned execution ID differs from the configured base, but neither the test nor production code asserts or reconstructs that implementation-specific string transformation. The installed client exposes the actual Workflow ID and first Run ID through `ScheduleDescription.info.recentActions`; no separate Schedule-result API exists. Consuming that service result is the established SDK boundary and avoids coupling engine code to a server-side naming algorithm.

The relation preserved by hosting equates the admitted input and resulting public semantic state with direct semantic-core execution. Temporal Schedule description is evidence that the start was service-scheduled, not a semantic observation. Schedule service state is not reconstructed from Workflow Event History.

Pre-Schedule admission and post-Schedule action integrity are distinct boundaries. A wrong Process or Start Event supplied before Schedule creation must create neither Schedule nor Workflow. Once the service has stored a `startWorkflow` action, the project has no pre-Workflow callback: a test-owned mutation of that stored action may create one Workflow, after which the witness must observe either exact semantic rejection for a mismatched trigger or exact definition-identity disagreement for a coherently replaced program. A timing mutation that invokes direct Workflow start instead of the Schedule action must be detected by the absent Schedule action and history ordering.

## Definition scheduling boundary

Product 2 scheduling is the next platform increment after this engine capsule closes. It is not part of this proposal's semantic implementation.

The later public contract must consume an engine-published Timer Start capability projection. Product 2 may not inspect private checked graphs or IL. That projection must contain only the information required to create an exact schedule, including immutable definition version and Start Event identity, and must not publish semantic implementation values.

The existing platform version boundary implies exact pinning: an active schedule is bound to one stored definition version. Deploying a newer version does not silently retarget it. Explicit product activation, replacement, or deactivation owns schedule lifecycle. The later platform increment must specify and test this policy through its public contract; this semantic capsule neither implements nor claims that product behavior.

The later Product 2 increment owns schedule persistence, API shape, idempotency keys, activation state, deletion/replacement, operator visibility, missed-run policy, and authorization. This capsule preserves the engine information it will need but does not design those surfaces.

## Rule-to-evidence matrix

| Rule | BPMN/profile evidence | Lean | TypeScript | Temporal | Separating negative or mutation |
|---|---|---|---|---|---|
| `TSTART-SOURCE-01` | Exact XSD-valid BPMN plus source negatives | Checked admission and lowering equality | Independent source projection and lowering | Compiled program used by live witness | Timer kind, expression form, placement, arity, and explicit-property mutations |
| `TSTART-TRIGGER-01` | Start Event identity and selected profile | Exact admission and state identity | Exact admission and state identity | Zero starts for wrong identity | Wrong Start Event with same Process and instance IDs |
| `TSTART-FLOW-01` | One outgoing Sequence Flow | Relation, evaluator soundness, exact closure | Independent relation/evaluator and closure | User Task reached after service-owned start | Manual/Message arm substitution and output swap |
| `TSTART-REFUSE-01` | Cross-kind profile boundary | Exhaustive refusal theorems | Exhaustive refusal tests | Pre-start fake-client and live wrong-kind checks | Every identity and state component varied independently |
| `TSTART-INSTANCE-01` | Each trigger creates a new instance | Distinct root-occurrence theorem | Distinct state witness | Distinct configured bases and service-returned execution IDs in isolated runs | Instance-ID alias mutation |
| `TSTART-OBSERVE-01` | Same downstream Process behavior | Complete normalized observation equality | Independently normalized observation equality | Canonical stable and terminal states | Timer-state leak mutation |
| `TSTART-CLOSURE-01` | Finite selected profile | Exact two-step trace, limit 2/1, unique enabledness, stable wait | Independent trace, overflow, enabledness, and resumption checks | Stable User Task Query after start | Skip initiation, extra enabled operation, and hidden stable-wait mutations |
| `TSTART-SCHEDULE-01` | No host-policy claim | Not applicable to semantic transition | Direct core result is the reference | One-action Schedule, exact program input, Worker absence, history inspection, replay | Direct-start-before-action and scheduled-program-identity mutations |

The registered scenario is standards-only, answer-free, and has `cib: null`. Its first stimulus is the resolved Timer Start occurrence followed by one User Task completion. Differential evidence compares Lean, TypeScript, and Temporal; it makes no CIB compatibility claim.

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| `initiationPending` | Existing private runtime flag set by admitted Process start | None | True only between one admitted exact start and its matching internal initiation; exact-one start operation makes the boolean information-preserving. |
| semantic instance ID | Supplied by the resolved trigger | Existing semantic instance identity | Distinct from definition identity and Temporal Workflow identity. |
| Temporal Schedule ID | Product/test host addressing | None in semantic state | Exists outside the Process Workflow and does not choose semantic outcomes. |
| configured Temporal Workflow-ID base | Derived from semantic instance identity by project host policy | None | Stored in the Schedule action, but not treated as the service execution ID. |
| Temporal execution Workflow ID and first Run ID | Returned by the Schedule action result | None | Used for Workflow addressing, history inspection, and replay without reconstructing server naming policy. |
| schedule action count and description | Temporal service evidence | Test evidence only | Inspected separately from Workflow Event History and never fed into the semantic core. |

No timer occurrence, logical due time, scheduler cursor, open timer, catch-up counter, or recurrence state is added to semantic runtime.

## Layer ownership

- BPMN source admission owns exact TimerEventDefinition shape and placement.
- Checked source owns Start Event identity and exact duration lexeme.
- Semantic Process IL owns normalized duration and output topology.
- Lean and the pure TypeScript semantic core independently own resolved-trigger admission and Process initiation.
- Temporal owns durable scheduled Workflow creation and replay without defining BPMN behavior.
- Product 2 later owns schedule lifecycle and exact-version activation through the engine's published contract.
- CIB Seven is neither semantic authority nor execution target for this standards-only slice.
- A12 is outside the repository's product and licence boundary.

## Required, optional, and excluded

Required:

- exact top-level `PT1S` Timer Start source admission;
- separate checked, IL, and stimulus variants;
- generic nonempty outputs with profile-local exact-one cardinality;
- exact cross-kind and identity refusal before Process creation;
- proved Lean relation, evaluator, soundness, closure, stable-wait, and strict-wire facts;
- independent TypeScript semantics and mutations;
- one registered answer-free standards scenario and runnable example;
- one test-owned one-action Temporal Schedule witness with Worker absence, no Workflow Timer/Signal, history inspection, and replay;
- frozen pre-M2 preservation and all atomic catalog guards.

Optional only if it adds no semantic or public claim:

- a diagnostic that reports the service-provided Schedule description and run-specific history byte size;
- one direct developer example using the exact registered profile.

Excluded:

- `timeDate`, `timeCycle`, recurrence, calendar, timezone, daylight-saving, jitter, catch-up, overlap, backfill, pause, resume, and operator controls;
- multiple or mixed Start Events, Event Sub-Process start, several outputs in the selected profile, payload, initial variables, and correlation;
- open Timer runtime state, logical-time advancement, or Workflow Timer semantics before Process creation;
- Product 2 scheduling API, persistence, authorization, or UI;
- silent latest-definition retargeting;
- CIB Seven compatibility evidence or relationship changes;
- A12 adoption, source, terminology, or dependency;
- Terminate End Event, configured generic Task, and unrelated M2 families.

## CIB relationship

No new CIB relationship, probe, profile delta, or retained result is created. The scenario has `cib: null`. No CIB behavior is semantic evidence for this capsule.

## Preservation obligation and common-mode risks

Every source/profile/scenario registration present in immutable pre-M2 baseline `7529150bf3a83de7e36734cf8d401924a0811b7d` retains its exact source bytes, profile bytes, admission result, checked graph, lowered program, scenario projection, and registry origin. The committed cyclic-control-flow baseline fixture and verifier remain read-only. Timer Start is an additive post-baseline registration.

Primary common-mode risks are:

- source and lowering both reuse one faulty fixture duration;
- Lean and TypeScript both treat Timer Start as manual start;
- the scheduled action carries a different program identity from the reviewed fixture;
- a one-action Schedule is created but the test directly starts the Workflow, leaving the host seam unused;
- schedule identity or due time leaks into semantic state or canonical observation;
- `initiationPending: boolean` is reused after admission broadens to several start operations;
- the profile lands without its scenario, example, or exact differential inventory entry.

Separating evidence uses independently constructed source twins, direct checked/program values, exact state-identity negatives, checked-to-IL drift mutations, fake start counters, a real Schedule action carrying exact program identity while the Worker is absent, no-Workflow-Timer/no-Signal history, and the immutable baseline oracle.

The nearest realistic unsupported claim is a recurring or calendar Timer Start schedule bound across definition replacement. It requires explicit schedule occurrence identity, exact-version policy, missed-run and overlap behavior, and perhaps a different product representation. None is inferred from this one-action capsule.

## Versioning consequences

Pre-release replace-in-place policy applies. Checked-node, Semantic Process operation, and stimulus unions widen atomically across strict JSON Schemas, Lean and TypeScript decoders, exhaustive switches, admission, lowering, scenario sequencing, Temporal protocol, Workflow start, client, runner, artifact consistency, profile/scenario registries, and evidence.

Existing `startProcess`, `triggerMessageStart`, `initiate`, `initiateMessage`, `awaitTimer`, `FireTimer`, runtime state, canonical observations, and all pre-existing artifacts gain no field and retain exact serialized bytes. No retained cross-version Temporal history corpus exists, so cross-version replay remains unclaimed.

### Owners this implementation grows

The owner inventory is mechanically derived with `node scripts/what-binds.ts`; [document reviewability](../../scripts/document-reviewability.test.ts) rechecks each figure. A fresh Red measurement governs extraction before implementation.

| Owner | Headroom to 600 nonblank lines | Consequence |
|---|---:|---|
| [semantic stimulus contract](../../packages/semantic-core/src/contract.ts) | 345 | Add one closed Timer-start variant without changing existing starts. |
| [semantic-core public exports](../../packages/semantic-core/src/index.ts) | 559 | Export only the new closed contract and cohesive admission helper needed by source lowering. |
| [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) | 370 | Add exact Timer Start identity and duration. |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 210 | Add one timer-bound initiation operation. |
| [semantic command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 311 | Delegate one exhaustive arm to a cohesive Timer-start owner. |
| [Message Start semantic owner](../../packages/semantic-core/src/semantic-process-message-start.ts) | 481 | Preserve channel-specific admission and cross-kind refusal after extracting shared root-token mechanics. |
| [triggered-start mechanics](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 484 | Own the root-token mechanics shared by Message and Timer starts. |
| [Timer Start semantic owner](../../packages/semantic-core/src/semantic-process-timer-start.ts) | 485 | Own exact Timer admission and execution. |
| [Semantic Process admission](../../packages/semantic-core/src/semantic-process-admission.ts) | 256 | Keep exact cross-kind start pairing fail closed. |
| [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 140 | Validate duration and canonical nonempty outputs. |
| [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 104 | Recognize the new root operation under existing finite graph laws. |
| [profile capability](../../packages/semantic-core/src/semantic-process-profile.ts) | 33 | Register the exact capability without changing existing catalog values. |
| [graph policy](../../packages/semantic-core/src/semantic-process-graph-policy.ts) | 538 | Assign the existing whole-graph acyclic policy. |
| [runtime dispatcher](../../packages/semantic-core/src/semantic-process-runtime.ts) | 240 | Add one delegated internal operation arm. |
| [stimulus identity](../../packages/semantic-core/src/stimulus.ts) | 226 | Validate and compare every resolved trigger field. |
| [scenario admission](../../packages/semantic-core/src/scenario.ts) | 203 | Admit Timer Start only as the first stimulus. |
| [root-definition selection](../../packages/bpmn-source/src/root-definition-selection.ts) | 341 | Select the exact Timer Start root without changing other dispatch paths. |
| [projected flow-element keys](../../packages/bpmn-source/src/projected-flow-element-keys.ts) | 328 | Register one Timer Start projection shape. |
| [checked-element projection](../../packages/bpmn-source/src/checked-element-projection.ts) | 220 | Add Timer Start while retaining its FormalExpression rule. |
| [Timer Start source](../../packages/bpmn-source/src/timer-start-event-source.ts) | 540 | Own the caller-specific exact source projection. |
| [singleton containment admission](../../packages/bpmn-source/src/singleton-containment-admission.ts) | 506 | Reject repeated singleton XML children before moddle can overwrite them. |
| [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 282 | Recognize Timer Start as a root `0 -> 1` node. |
| [Semantic Process lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 61 | Delegate Timer Start lowering to its cohesive owner. |
| [Timer Start lowering](../../packages/bpmn-source/src/timer-start-event-lowering.ts) | 553 | Derive canonical origin and outputs from validated endpoints. |
| [contract artifact consistency](../../scripts/contract-artifact-consistency.ts) | 4 | Add only the exhaustive `initiateTimer` delegation while keeping this owner at or below 600. |
| [start-operation artifact consistency](../../scripts/start-operation-artifact-consistency.ts) | 494 | Extend the existing cohesive None/Message Start binding owner with Timer origin/duration/output consistency. |
| [contract artifact projection](../../scripts/contract-artifacts.ts) | 16 | Add only the exhaustive Timer-start classifier arm; any new projection responsibility requires extraction first. |
| [contract artifact cases](../../scripts/contract-artifact-cases.ts) | 397 | Register the standards-only scenario with no CIB target. |
| [differential pipeline cases](../../packages/differential/test/pipeline-cases.ts) | 28 | Add a capsule-owned case module and only register it from this near-limit catalog. |
| [Temporal protocol contracts](../../packages/temporal-adapter/protocol/src/contracts.ts) | 418 | Widen the exact Workflow-start input union. |
| [Temporal command identity](../../packages/temporal-adapter/protocol/src/command-identity.ts) | 439 | Include every Timer-start stimulus field. |
| [Temporal host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 398 | Classify `initiateTimer` as passive internal initiation. |
| [Temporal process client](../../packages/temporal-adapter/client/src/process-client.ts) | 135 | Preserve pre-start admission and exact Workflow identity; extract if the fresh measurement would cross 600. |
| [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 48 | Widen only the initial input contract; any behavior requires extraction first. |
| [Workflow export](../../packages/temporal-adapter/workflow/src/workflows.ts) | 561 | Widen only the exact start-input type. |
| [testkit scenario admission](../../packages/temporal-adapter/testkit/src/scenario-admission.ts) | 580 | Widen the closed start union. |
| [testkit Workflow start](../../packages/temporal-adapter/testkit/src/runner-workflow-start.ts) | 556 | Pass the admitted start variant to the existing Workflow start path. |
| [scenario sequencing](../../packages/temporal-adapter/testkit/src/scenario-stimulus-sequencing.ts) | 557 | Treat Timer Start as first-only. |
| [runner support](../../packages/temporal-adapter/testkit/src/runner-support.ts) | 179 | Recognize the checkpoint trigger without Product 2 scheduling. |
| [runnable MVP config](../../packages/temporal-adapter/runner/cli/runnable-mvp-config.ts) | 368 | Add a third closed start config, not optional mode fields. |
| [runnable start constructor](../../packages/temporal-adapter/runner/cli/runnable-mvp-start.ts) | 562 | Map the exact config exhaustively to the resolved stimulus. |
| [Lean scenario wire](../../BpmnSemantics/Scenario.lean) | 386 | Add the exact Timer-start stimulus. |
| [Lean semantic contract](../../BpmnSemantics/SemanticProcessContract.lean) | 130 | Add checked and IL variants without crossing the owner limit. |
| [Lean checked admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) | 288 | Validate exact Timer Start shape. |
| [Lean checked graph](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean) | 470 | Add root arity and identity. |
| [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 273 | Own exact node/operation/output cardinality. |
| [Lean structural admission](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) | 298 | Validate generic nonempty outputs and root ownership. |
| [Lean graph validation](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 174 | Add outputs, scope ownership, and reachability. |
| [Lean transition dispatch](../../BpmnSemantics/SemanticProcess/Transition.lean) | 278 | Delegate one exhaustive arm to a cohesive Timer-start relation. |
| [Lean Message Start admission](../../BpmnSemantics/SemanticProcess/MessageStartAdmission.lean) | 547 | Preserve exact Message-channel admission after sharing pairwise start-kind checks. |
| [Lean Message Start semantics](../../BpmnSemantics/SemanticProcess/MessageStart.lean) | 482 | Share only root-occurrence and output-token mechanics while retaining the complete Message-specific relation. |
| [Lean Timer Start semantics](../../BpmnSemantics/SemanticProcess/TimerStart.lean) | 553 | Own the declarative relation, evaluator, and soundness result. |
| [Lean Timer Start admission](../../BpmnSemantics/SemanticProcess/TimerStartAdmission.lean) | 567 | Own exact external trigger admission. |
| [Lean execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 48 | Add only exhaustive dispatch and imports. |
| [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 78 | Delegate Timer Start lowering. |
| [Lean lowering identity](../../BpmnSemantics/SemanticProcess/LoweringIdentity.lean) | 589 | Share canonical endpoint-derived identities. |
| [Lean Timer Start lowering](../../BpmnSemantics/SemanticProcess/TimerStartLowering.lean) | 576 | Own exact endpoint lowering and preservation. |
| [Lean scenario admission](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 288 | Enforce exact first-stimulus/program pairing. |
| [Lean checked decoder](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean) | 360 | Decode the exact closed node. |
| [Lean program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 156 | Decode the exact closed operation. |
| [Lean scenario decoder](../../BpmnSemantics/SemanticProcessJson/Scenario.lean) | 485 | Decode the exact closed first stimulus. |
| [Lean JSON support](../../BpmnSemantics/SemanticProcess/JsonSupport.lean) | 428 | Reuse strict nonempty identity and safe scalar decoding without creating timer-specific string rules. |
| [Lean JSON executable](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 284 | Encode and discover the third closed start family. |
| [Lean JSON conformance](../../BpmnSemantics/SemanticProcessJsonConformance.lean) | 452 | Lock the strict checked, program, and scenario wire shapes. |
| [Lean Timer Start conformance](../../BpmnSemantics/TimerStartConformance.lean) | 200 | Prove the selected admission, lowering, execution, closure, observation, and refusal account. |
| [Lean Semantic Process umbrella](../../BpmnSemantics/SemanticProcess.lean) | 574 | Import the independently buildable Timer Start mechanism only. |
| [Lean conformance executable](../../BpmnSemantics/ConformanceMain.lean) | 584 | Import the new conformance evidence only. |
| [Lean library umbrella](../../BpmnSemantics.lean) | 574 | Import the new public conformance module only. |
| [checked-source decomposition experiment](../../BpmnSemantics/Experiments/CheckedSourceDecomposition.lean) | 431 | Reject Timer Start explicitly in exhaustive decomposition. |
| [checked-source transition experiment](../../BpmnSemantics/Experiments/CheckedSourceTransition.lean) | 290 | Reject the new node, operation, and stimulus in the frozen evaluator. |
| [checked-source graph experiment](../../BpmnSemantics/Experiments/CheckedSourceGraph.lean) | 515 | Reject Timer Start in frozen root and arity predicates. |
| [checked-source chain experiment](../../BpmnSemantics/Experiments/CheckedSourceChain.lean) | 406 | Keep supported-chain classification exhaustive and fail closed. |
| [checked-source coverage experiment](../../BpmnSemantics/Experiments/CheckedSourceCoverage.lean) | 350 | Keep coverage proofs exhaustive without claiming Timer Start support. |
| [checked-source scenario experiment](../../BpmnSemantics/Experiments/CheckedSourceScenario.lean) | 445 | Classify command identity and reject frozen experiment execution. |
| [checked-source frontier experiment](../../BpmnSemantics/Experiments/CheckedSourceFrontier.lean) | 331 | Add an explicit fail-closed arm if its exhaustive frontier consumer widens. |

Strict [checked-process schema](../../contracts/schemas/checked-process.schema.json), [Semantic Process schema](../../contracts/schemas/semantic-process.schema.json), and [scenario schema](../../contracts/schemas/scenario.schema.json) change atomically but are not hand-written source headroom owners.

Existing focused test owners also change where their inventories widen:

| Test owner | Headroom to 600 nonblank lines | Obligation |
|---|---:|---|
| [projected flow-element keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | 155 | Register the exact projector in the closed consumer matrix. |
| [checked graph admission](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts) | 338 | Lock `0 -> 1`, root placement, reachability, and cross-kind start closure. |
| [Timer Start source](../../packages/bpmn-source/test/timer-start-event-source.test.ts) | 286 | Lock exact projection and the complete excluded source matrix. |
| [singleton containment](../../packages/bpmn-source/test/singleton-containment-admission.test.ts) | 514 | Lock repeated singleton rejection across all affected Timer and condition readers. |
| [definition artifact negatives](../../scripts/contract-definition-artifacts.test.ts) | 125 | Reject origin, duration, and output drift. |
| [Message Start schema contract](../../scripts/message-start-contract-schema.test.ts) | 374 | Widen the existing closed Process-start union assertion from two exact variants to three. |
| [start-operation artifact consistency](../../scripts/start-operation-artifact-consistency.test.ts) | 413 | Reject Timer origin, duration, output, and canonical-order drift. |
| [Timer Start semantic core](../../packages/semantic-core/test/timer-start-event.test.ts) | 73 | Lock the selected runtime and admission account. |
| [Timer Start immutability](../../packages/semantic-core/type-test/timer-start-event.type-test.ts) | 550 | Lock deep compile-time immutability. |
| [command identity](../../packages/temporal-adapter/testkit/test/command-identity.test.ts) | 334 | Lock every trigger field. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | 30 | Lock exact Timer-start passive-host admission. |
| [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | 429 | Construct the correct start arm for every registered example. |
| [runnable MVP](../../packages/temporal-adapter/testkit/test/runnable-mvp.test.ts) | 218 | Lock strict Timer-start config while preserving old branches. |
| [external runtime](../../packages/temporal-adapter/testkit/test/external-temporal-runtime.test.ts) | 462 | Keep its existing fixture explicitly manual after the config union widens. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | 295 | Lock the additive profile/case inventory and exact standards-only target shape. |

The seven experiment owners above are the current repository-built exhaustive consumers found by the node, operation, and stimulus discriminant sweep. No experiment gains Timer Start semantics. The implementation repeats the sweep after the unions widen and treats any new consumer as part of the same atomic change.

The profile, scenario, BPMN fixture, and runnable example are one atomic registration. [profiles/README.md](../../profiles/README.md), [scenarios/README.md](../../scenarios/README.md), [profile-parameterized admission](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), [runnable MVP specification](../RUNNABLE-TEMPORAL-MVP-SPEC.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [Temporal lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [implementation map](../IMPLEMENTATION-MAP.md), [testing specification](../TESTING-SPEC.md), and [plan](../PLAN.md) update atomically at closure.

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [document reviewability](../../scripts/document-reviewability.test.ts) | Recompute every owner figure and require proposal routing. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | Keep `BPMN-TIMER-START-01`, citation, disposition, and capsule aligned. |
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) and [contract artifacts](../../scripts/contract-artifacts.test.ts) | Cover every new union arm and reject malformed exact shapes. |
| [definition artifact consistency](../../scripts/contract-definition-artifacts.test.ts) | Bind checked Start Event origin/duration/outputs to the lowered operation. |
| [projected keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | Close the shared projection consumer inventory. |
| [frozen cyclic baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation.test.ts) | Preserve every pre-M2 source, profile, checked, IL, and registry-origin value. |
| [Activity boundary Timer source](../../packages/bpmn-source/test/activity-boundary-timer-source.test.ts), [Sub-Process boundary Timer source](../../packages/bpmn-source/test/subprocess-boundary-timer-source.test.ts), and [non-interrupting boundary Timer source](../../packages/bpmn-source/test/non-interrupting-boundary-timer-source.test.ts) | Preserve admission when `xsi:type` is absent and moddle supplies a generic `Expression`, while Timer Start independently requires FormalExpression. |
| [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts), [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts), and [differential pipeline](../../packages/differential/test/pipeline.test.ts) | Land profile, scenario, example, targets, and ordered inventories atomically. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | Admit the passive User Task wait and reject unsupported host shapes before start. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts) | Keep Schedule/client, Workflow, Worker, runner, and testkit dependencies in owned packages. |
| [platform boundary](../../scripts/platform-product-boundary.test.ts) | Keep Product 2 outside private checked/IL/runtime values. |
| [A12 boundary](../../scripts/a12-boundary.test.ts) and [A12 preservation](../../scripts/a12-preservation.test.ts) | Keep A12 outside this standards-only mechanism. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) and [corpus policy](../../scripts/bpmn-corpus-policy.test.ts) | Validate the fixture and retain the pinned normative corpus. |
| [normative references](../../scripts/normative-reference-resolution.test.ts) | Resolve every named clause, table, CMOF, and XSD anchor. |
| [source hygiene](../../scripts/source-hygiene.test.ts), [Lean contracts](../../scripts/lean-source-contracts.test.ts), and [what-binds](../../scripts/what-binds.test.ts) | Keep cohesive owners, exhaustive switches, and registries within bounds. |
| [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Prevent optional start mode bags, host schedule facts in semantic state, and a second semantic core. |
| [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Bind each governed review to immutable targets and routed sections. |
| [Markdown links](../../scripts/markdown-links.test.ts) | Resolve every owner, guard, requirement, and evidence link. |

## Epistemic closure and cost boundary

Closure may establish only one exact top-level `PT1S` Timer Start profile, its independent Lean and TypeScript semantics, and one-action Temporal Schedule refinement. It does not establish general timer expressions, recurring schedules, definition activation policy, CIB compatibility, Product 2 scheduling, or full Process Execution Conformance.

The nearest realistic counterexample is an active recurring schedule whose bound definition receives a newer deployed version. A resolver that silently switches to latest changes the executable program without changing the schedule identity. The selected exact-version boundary makes that behavior rejectable later instead of treating it as an implementation detail.

Meaningful mutations are: treat Timer Start as manual start; compare no Start Event ID; normalize a non-`PT1S` expression; impose Timer Start's FormalExpression rule on an existing boundary reader; lower a stale output; open a runtime Timer; invoke Workflow start directly instead of the Schedule action; mutate the stored action after pre-Schedule admission; leak Schedule ID into observation; and omit one atomic registration. Each must reach a public, semantic, artifact, or durable-host discriminator.

At closure, [CAPSULE-COST-LEDGER.md](../CAPSULE-COST-LEDGER.md) records commit-bounded code and documentation churn against Message Start Event, the nearest completed increment that changed checked source, start IL, Lean, TypeScript, strict wires, registered evidence, and Temporal Workflow-start hosting.

## Stop conditions

Stop and return to research or owner decision if:

- BPMN requires the selected `timeDuration` to choose a deployment origin that cannot be separated from Process semantics;
- exact Start Event and duration identity cannot survive source, checked graph, IL, public engine capability projection, and pre-start host admission;
- implementation requires changing existing start, timer-wait, runtime, or observation values rather than adding closed variants;
- several start operations become admitted while runtime retains only `initiationPending: boolean`;
- the one-action Schedule witness cannot start durably while the Worker is absent without a Workflow Timer or Signal;
- a wrong Process or Start Event cannot reject before Schedule creation, or post-Schedule action tampering cannot be distinguished as semantic rejection or definition-identity disagreement;
- Product 2 would need private checked graph or IL access to schedule the exact version;
- the frozen baseline changes or atomic registration guards cannot accept exactly one new profile and scenario;
- any A12 or unreviewed CIB behavior becomes necessary;
- an owner would cross 600 nonblank lines without a cohesive extraction, or the first Lean change cannot pass the one-CPU, no-swap, 3 GiB resource audit.

## Owner decisions after review

Owner approval is requested for these exact decisions:

1. Select one top-level exact-`PT1S` Timer Start Event with `0 -> 1` arity and the linear User Task witness.
2. Add separate `TimerStartEvent`, `InitiateTimer`, and `TriggerTimerStart` variants while preserving None, Message, and Intermediate Catch Timer values byte-for-byte.
3. Treat the semantic input as one resolved Timer Start occurrence carrying exact Process, semantic instance, and Start Event identity, with no schedule or due-time field.
4. Use a test-owned one-action Temporal Schedule for durable hosting, with an exact semantic-instance-derived configured Workflow-ID base, a service-returned execution Workflow ID used for subsequent addressing, no Workflow Timer or Signal, and Worker-absence and replay evidence.
5. Keep Product 2 schedule API, lifecycle, and exact-version enforcement in the next platform increment while preserving exact compiled-program identity through this engine capsule.
6. Use a proved Lean lane and require a conditional semantic checkpoint before registered evidence and live Temporal work.
7. Keep Timer Start standards-only with no new CIB relationship or A12 dependency.

The owner approved decisions 1 through 7 on 2026-08-11 and authorized implementation from reviewed correction target `eaaf944`. Decision 4 above now contains a material correction to the configured-base versus service-returned execution identity boundary. That corrected decision requires an independent cold review and fresh owner approval before the live Schedule lane resumes.
