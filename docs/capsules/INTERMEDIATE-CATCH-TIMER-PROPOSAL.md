# Intermediate Catch Timer proposal

## Status

**Draft for owner review.** This proposal completes the approved timer hosting/refinement preflight and recommends one bounded semantic capsule. It does not authorize or describe an implemented surface. Production Lean, TypeScript, BPMN-source, wire, CIB-runner, and Temporal behavior remain unchanged until the owner approves this account.

## Question

Can the project admit one BPMN 2.0.2 Intermediate Catch Timer Event in normal flow while keeping timer meaning in the semantic core and using Temporal only for a durable physical wakeup?

The proposed discriminator is:

```text
None Start Event
  → Intermediate Catch Timer Event with literal timeDuration PT1S
  → None End Event
```

## Recommendation

Approve this capsule with the exact source subset, semantic time account, and evidence obligations below.

The semantic core owns activation of the timer occurrence, its logical deadline, eligibility of a timer-firing stimulus, control-flow progress, logical-time advancement, duplicate or stale refusal, and public observation. The Temporal adapter observes a committed semantic timer wait, schedules one durable timer for the remaining duration, and feeds a content-bound timer-firing stimulus back to the semantic core only after that timer resolves.

Temporal elapsed time is evidence that the physical minimum delay occurred. It is not BPMN state. Physical delivery latency after the deadline is refinement stutter: the adapter supplies the semantic deadline, not Workflow wall-clock arrival time, as the firing stimulus's logical time.

## Claim boundary

If evidence closes, the capsule will establish only this proposition:

> In the admitted acyclic single-token Process, reaching the exact `PT1S` Intermediate Catch Timer Event creates one timer occurrence at logical deadline 1000 ms; an exact firing at that deadline consumes the wait and permits the token to continue to the none End Event; the Temporal adapter durably waits before delivering that firing and reproduces the same observations under Worker restart and replay.

It will not establish general ISO-8601 duration support, expression evaluation, absolute dates, cycles, repeating timers, boundary timers, timer Start Events, event-based gateways, timer races, cancellation, arbitrary clock precision, or BPMN Process Execution Conformance.

## Source basis

The normative source is BPMN 2.0.2 Clause 10:

- Section 10.5.4 states that a catching Intermediate Event in normal flow retains the token until its trigger occurs and then continues along the outgoing Sequence Flow.
- Table 10.89 classifies the Timer Intermediate Event in normal flow as a catching delay mechanism.
- Section 10.5.5 and Table 10.101 define `timeDuration` as a mutually exclusive TimerEventDefinition expression whose value conforms to the ISO-8601 interval format.
- Table 10.122 defines `timerEventDefinition` with the `timeDate`, `timeDuration`, and `timeCycle` choice.

Resolved OMG issue BPMN2-168 introduced `timeDuration` as a relative point in time and records the ISO-8601 result constraint. It did not standardize engine clock precision, scheduler latency, or a universal expression language. The exact source provenance and local normative corpus are recorded in [SOURCES.md](../SOURCES.md).

The official CMOF and XSD facts establish `IntermediateCatchEvent`, contained Event Definitions, `TimerEventDefinition`, and the optional composite `timeDuration` expression. They do not select the executable subset or define the runtime clock account.

## Proposed source profile

### Required source

The admitted document must contain exactly:

- one executable private Process;
- one none Start Event;
- one Intermediate Catch Event with exactly one contained TimerEventDefinition;
- exactly one `timeDuration` child whose trimmed text is the literal `PT1S`;
- one none End Event;
- exactly two Sequence Flows forming the stated linear topology;
- no parser warnings, extension elements, conditions, data, expressions other than that exact literal, or additional Flow Nodes.

The profile rejects `timeDate`, `timeCycle`, empty TimerEventDefinitions, referenced EventDefinitions, alternative lexical spellings, zero or negative durations, fractional values, variables, and expression-language metadata. This is deliberate profile narrowing, not a claim that other valid BPMN forms are malformed.

### Source normalization

The checked BPMN graph preserves the source-facing distinction:

```ts
type CheckedIntermediateCatchTimerEvent = Readonly<{
  kind: "intermediateCatchTimerEvent";
  id: string;
  durationLiteral: "PT1S";
}>;
```

The source compiler validates the exact literal and lowers it to the semantic duration `1000` ms. The checked graph retains the literal so Lean can independently validate the only admitted normalization rather than trusting a TypeScript-computed number.

The `bpmn-moddle` object and TimerEventDefinition expression remain private to `@bpmn-lean/bpmn-source`.

## Proposed Semantic Process IL

The source element lowers to a semantic wait mechanism rather than a generic BPMN event opcode:

```ts
type AwaitTimerOperation = Readonly<{
  kind: "awaitTimer";
  id: string;
  origin: {
    kind: "bpmnElement";
    elementId: string;
  };
  input: string;
  output: string;
  timer: {
    elementId: string;
    durationMs: 1000;
  };
}>;
```

The admitted program contains `initiate`, `awaitTimer`, and `terminate`, with one control place for each Sequence Flow. This operation is reusable only as the mechanism “wait for a relative semantic deadline.” It does not encode catching/throwing, boundary attachment, interruption, repetition, scope propagation, or calendar behavior as dormant flags.

The [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md) must gain the new checked node, operation, lowering rule, well-formedness obligations, runtime wait, and exact proof boundary in the implementation change. The frozen checked-source experiment is not extended by this capsule.

## Semantic time and timer identity

### Logical clock

The Process instance begins at logical time `0`. Activating the admitted timer at logical time `t` creates deadline `t + 1000`, with safe non-negative integer arithmetic required at every wire and TypeScript boundary.

This capsule has no competing external interaction, so the only admitted logical-time transition is from `0` to `1000`. Host clock origin, UTC time, Workflow Task timestamp, Timer Event timestamp, and delivery latency are not canonical observations.

### Timer occurrence

The timer is a runtime occurrence, not only a BPMN element:

```ts
type TimerOccurrenceId = Readonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;
```

The first activation is ordinal `1`. The occurrence also owns its output control place and logical deadline. Definition identity, occurrence identity, semantic command identity, CIB job identity, and Temporal timer sequence remain distinct.

### Timer-firing stimulus

The evaluator receives:

```ts
type FireTimerStimulus = Readonly<{
  kind: "fireTimer";
  commandId: string;
  timerId: TimerOccurrenceId;
  logicalTimeMs: number;
}>;
```

This is a typed semantic command to the evaluator, but it is not an enabled caller interaction and is never exposed as a Signal or Update in the proposed production adapter. Reusing `CommandOutcome` records whether the semantic input committed or was rejected; it does not reclassify the BPMN Timer Event as a User Task or application API command.

The production adapter derives a deterministic content-bound command ID from the full timer occurrence and deadline. It must not use a Temporal Run ID, timer sequence number, Event ID, or physical timestamp.

## Proposed semantic rules

### `TIMER-WAIT-01` — activate one relative timer

When `awaitTimer` has an input token and no occurrence for that firing exists, it consumes exactly one input token and creates exactly one timer occurrence with deadline `logicalTimeMs + durationMs`.

Internal closure stops at the timer wait. It does not advance logical time or create the output token.

### `TIMER-FIRE-01` — fire the exact occurrence at its deadline

A `fireTimer` stimulus commits if and only if the Process is running, the full timer occurrence identity is active, and `logicalTimeMs` equals the occurrence deadline.

Commit removes the timer occurrence, advances semantic logical time to that deadline, adds one token to the operation output, and resumes internal closure. In the admitted topology the token reaches the none End Event and the Process completes.

### `TIMER-REFUSE-01` — refuse ineligible firing without state change

A firing with a different Process instance, element, activation, or logical time is rejected with exact state preservation. A distinct command for an already consumed occurrence is stale and is likewise rejected without recreating the timer or advancing time.

Repeating the identical command ID and identical payload follows the existing duplicate-command contract. Reusing an ID with different timer content is an identity conflict at the owning command-ingress boundary.

### `TIMER-OBSERVE-01` — project the committed timer wait

The waiting state projects:

- `status: "running"`;
- one active wait with `kind: "timer"` and multiplicity `1`;
- one open timer with its full occurrence identity and logical deadline `1000`;
- no open User Task and no enabled caller interaction;
- logical time `0`.

The completed state has no active wait or open timer and logical time `1000`.

`openTimers` is a new required canonical state field. During pre-release, every producer, consumer, schema, retained result, and existing fixture must add the empty value atomically. The field is required because `activeWaits` alone cannot attest occurrence identity or deadline calculation.

## Runtime-only and synthetic constructs

| Construct | Source or derivation | Owner and lifetime | Public projection |
|---|---|---|---|
| Control places | Deterministic lowering of Sequence Flows | Semantic program; immutable | Not directly public |
| Timer occurrence | `awaitTimer` activation plus semantic Process instance | Semantic runtime; removed on exact firing | `activeWaits` and `openTimers` |
| Activation ordinal | Per-element semantic activation count | Semantic runtime | Timer occurrence identity |
| Logical deadline | Activation logical time plus normalized duration | Semantic runtime | `openTimers.deadlineMs` |
| Timer-firing command ID | Full occurrence plus deadline through canonical typed encoding and SHA-256 | Adapter command ingress; retained only under the existing lifecycle contract | Command observation, never enabled interaction |
| CIB job ID and due date | Pinned CIB engine | Oracle host only; removed with deployment cleanup | Job ID excluded; due-date delta used as raw evidence |
| Temporal timer sequence and history Events | Temporal SDK and Service | Adapter host and Event History | Refinement evidence only |

## CIB Seven preflight

The pinned CIB source creates a wait-state execution and a `timer-intermediate-transition` job for this construct. Its duration calendar resolves a duration relative to the engine clock, and the timer job signals the waiting execution to leave the Intermediate Catch Event.

The retained oracle probe must:

1. fix the CIB engine clock to a recorded baseline before starting the Process;
2. deploy and start the exact BPMN bytes with automatic job execution disabled under existing `CIB-CFG-0001`;
3. require one active execution at the Timer Event and exactly one timer job;
4. require the job due date to equal the fixed baseline plus 1000 ms;
5. prove the job is not executable before its due date;
6. move the controlled clock exactly to the due date, require the job to become executable, and only then execute it;
7. require job removal, Process completion, and clean teardown.

Direct administrative `executeJob` before the due date is not timer-semantic evidence because that API can bypass scheduler eligibility. The probe must keep clock advancement and job execution as explicit harness scheduling inputs.

Before a semantic profile is created, the observed relationship must be classified in [CIB-BPMN-RELATION-REGISTER.md](../CIB-BPMN-RELATION-REGISTER.md). This proposal does not allocate an unreviewed placeholder identifier. The expected account is normative agreement for the wait and due transition plus the already recorded configuration-specific manual scheduler realization, but the executable probe decides the recorded classification.

## Temporal hosting/refinement preflight

### Host composition

After applying the start command, the Workflow asks the semantic core for committed pending timer intents. For the one admitted intent it:

1. validates the occurrence and deadline projection;
2. calculates `remainingMs = deadlineMs - semanticState.logicalTimeMs`;
3. schedules `Workflow.sleep(remainingMs)`;
4. awaits the durable timer;
5. constructs the content-bound `fireTimer` stimulus from the committed occurrence and its exact semantic deadline;
6. applies that stimulus through the ordinary semantic-core command boundary;
7. requires the admitted firing to commit, then follows the existing semantic-lifetime completion and receipt contract.

The adapter never parses `PT1S`, reads the checked BPMN graph, derives a second deadline, or advances the core merely because a callback ran.

### Physical and semantic time

Temporal `sleep` is a durable minimum-duration wakeup. The Event History's timer-started and timer-fired Events are the authority that the physical wait occurred.

When the timer resolves after its requested duration, the adapter supplies `deadlineMs`, not `Date.now()`, as semantic logical time. This keeps Worker outage and Service scheduling latency observationally silent. It is sound only for this capsule because no message, User Task, Activity, cancellation, or competing timer can race with the wakeup.

Any future capsule with a time-sensitive race must reopen the logical-clock mapping and make event order and time sampling explicit semantic inputs.

### Lifecycle, ordering, and duplicates

- The Workflow remains open while the semantic timer occurrence is active.
- No Update handler transports the timer firing.
- Workflow completion occurs only after the firing commits, internal closure reaches semantic completion, and accepted handlers have drained under the existing lifecycle specification.
- Replay reconstructs the same timer command from the recorded timer Events and does not create a second semantic firing.
- A duplicate callback is not expected from Temporal replay. Pure Lean/core witnesses still require identical-command stability and distinct-command stale refusal so adapter mistakes cannot create extra progress.
- There is no caller-order or handler-interleaving question in the admitted topology. This absence is part of the profile, not a general timer guarantee.

### Required live-history witness

One full local-server witness is sufficient and mandatory:

1. start the admitted Workflow and observe the exact semantic timer wait;
2. fetch history until it contains the timer-started Event with a 1000 ms duration;
3. stop the Worker before semantic completion;
4. allow the timer to become due while no Worker is polling;
5. start a replacement Worker and require exact Process completion and receipt;
6. reconcile the timer command observation and terminal state with the receipt and timer history;
7. replay the completed history;
8. clean the server and cache-owned test state according to the existing gate.

The retained adapter mutation bypasses `Workflow.sleep` and immediately applies the otherwise valid deadline firing. The pure semantic trace would still look correct, so the live-history assertion must fail because no durable timer-started/timer-fired pair exists. This is the separating witness for the adapter mechanism.

### Full server and time-skipping treatment

The full local development server remains the required refinement target. The admitted one-second duration adds one bounded physical second to the existing warm gate and is expected to remain within the 15-second warm and 45-second cold budgets.

The time-skipping server is an optional acceleration/calibration lane, not a second semantic authority and not a substitute for the full-server witness. During red implementation, measure a second time-skipping witness separately. Add it to default verification only if the complete gate remains inside the existing budgets without changing an assertion. Otherwise retain it as an explicitly named optional timer-calibration gate or omit it; do not weaken the full-server duration, history, restart, or replay evidence to accommodate CI.

## Separating witnesses

| Witness | Intended account | Realistic wrong account it separates |
|---|---|---|
| Waiting state after start | Token is retained at one timer occurrence with deadline 1000 | Event passes through immediately or deadline is absent |
| Firing at logical time 999 | Rejected with exact state preservation | Host callback alone authorizes progress |
| Exact firing at 1000 | Wait is consumed, time advances to 1000, Process completes | Timer remains a permanent wait or output token is omitted |
| Wrong activation at 1000 | Rejected with exact state preservation | BPMN element ID alone identifies an occurrence |
| Distinct stale firing after consumption | Rejected without reactivation | Timer firing is repeatable or recreates the wait |
| CIB due-date probe | Due transition is relative to controlled clock and job execution follows eligibility | Administrative job execution is mistaken for timer semantics |
| Temporal bypass mutation | Missing durable timer history fails refinement although pure outcome matches | Workflow may synthesize deadline completion without waiting |
| Worker-down-at-due witness | Timer survives Worker absence and completes after restart/replay | In-memory `setTimeout` or Worker-local callback implements durability |

## Evidence required before graduation

The proposal graduates to `INTERMEDIATE-CATCH-TIMER-SPEC.md` only when all of the following are green in one atomic pre-release change:

- the reviewed BPMN requirement rows and exact CIB relationship classification;
- one immutable semantic profile naming its reviewed relationship IDs;
- exact BPMN source, checked-graph, Semantic Process program, scenario, result, and retained CIB-evidence schemas and content bindings;
- strict source admission and deterministic lowering of the exact literal;
- a Lean declarative timer relation, separate executable evaluator, evaluator-soundness theorem, exact firing law, refusal/state-preservation law, and early-firing checked non-law;
- independent TypeScript semantic-core behavior for every separating semantic witness;
- the controlled-clock CIB probe and meaningful deadline-projection mutation;
- canonical `openTimers` projection and mutations of occurrence identity and deadline;
- the full-server Temporal history, Worker-restart, receipt reconciliation, replay, cleanup, and bypass mutation;
- exact differential comparison under explicit per-witness evidence relations;
- applicable focused gates, the complete repository gate, feedback budgets, and epistemic-closure review;
- same-change updates to the Semantic Process IL specification, requirement ledger, CIB register, profile and scenario registries, wire-contract registry, testing specification, implementation map, plan, and documentation registry.

## Exclusions

This capsule excludes:

- any duration literal other than exact `PT1S`;
- expression evaluation or variables;
- `timeDate`, `timeCycle`, calendar units, time zones, recurrence, and catch-up policy;
- Timer Start Events, Boundary Timer Events, event subprocesses, and event-based gateways;
- multiple timers, timer/message or timer/Activity races, cancellation, interruption, and scope propagation;
- caller-triggered timer APIs, Signals, or Updates;
- Temporal Schedules, Cron, Start Delay, Workflow timeouts, and Activity timeouts as BPMN timer substitutes;
- production observation API selection;
- retained Event History baselines, version patches, migration, and compatibility readers;
- extension of the frozen checked-source relation experiment.

## Reopen conditions

Reopen this account before admitting:

- any second duration lexical form or expression language;
- a competing semantic input whose order relative to a timer can change behavior;
- more than one active timer occurrence;
- cancellation, interruption, boundary attachment, repetition, or scope propagation;
- a production requirement to expose physical lateness or absolute time;
- a Temporal hosting mechanism that cannot derive its timer exclusively from committed semantic-core state.
