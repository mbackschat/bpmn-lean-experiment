# Runnable MVP product-surface proposal

## Status

**Draft on 2026-08-03; not owner-approved and not implemented.** This proposal graduates into the existing [runnable Temporal MVP specification](RUNNABLE-TEMPORAL-MVP-SPEC.md) rather than creating a second product-contract owner; read that specification for the product surface that runs today, and this document for the intended extension that does not.

## Product question

What must the product command own so that every semantic profile this repository already proves can be run durably by a user through the same production compiler, semantic core, and Workflow, without adding BPMN meaning, a user interface, a task inbox, an identity layer, or any deployment or production-history claim?

## Measured gap

The semantic surface and the product surface have diverged. The differential pipeline demonstrates fifteen registered profiles and their fifteen answer-free scenario families, while the product command runs exactly one.

| Boundary | Proven through the maintained gates | Runnable through the product command |
|---|---|---|
| Semantic profiles | fifteen registered in `packages/semantic-core/src/semantic-process-profile.ts` | one, `cibseven-2.2.0-user-task-process-data-draft` |
| Canonical wait kinds | `userTask`, `message`, `timer`, `effect` | `userTask` only |
| External interaction commands | user-task completion and message delivery | user-task completion only |

Four product-layer mechanisms are missing. None of them is a semantic gap.

1. The production Worker registers no Activities. `packages/temporal-adapter/src/external-temporal-runtime.ts` states this in its own module documentation, so the three effect-bearing profiles owned by the [Service Task effect specification](capsules/SERVICE-TASK-EFFECT-SPEC.md), [CreateDocument data specification](capsules/CREATE-DOCUMENT-DATA-SPEC.md), and [boundary Error specification](capsules/BOUNDARY-ERROR-SPEC.md) have no product execution path; their `executeBpmnEffect` Activity task cannot be dispatched by this Worker.
2. The command hardcodes exactly one User Task interaction. `dummyUserTask` is a required configuration field, the actor drives one occurrence, and it deliberately refuses a second simultaneous task, so the two concurrent User Tasks in the [parallel fork/join](capsules/PARALLEL-FORK-JOIN-SPEC.md) and [embedded Sub-Process completion](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) profiles cannot be driven.
3. Message delivery exists in the production client as `submitMessageDelivery` but no command path calls it, so the [Intermediate Catch Message](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md), [Message-addressed Receive Task](capsules/RECEIVE-TASK-MESSAGE-SPEC.md), and Message-won [Event-Based Gateway](capsules/EVENT-BASED-GATEWAY-SPEC.md) paths are unreachable from the product.
4. Observation is one snapshot. The command reads the trace once, requires a single stable running state, and then waits for the Workflow result, so no model with more than one successive stable wait can be driven.

One mechanism is already correct and must be preserved rather than replaced: the command calls `assessBpmnProcessAdmission` before connecting, so the generic pre-start host-capability predicate in `packages/temporal-adapter/src/host-admission.ts` already rejects wait-set shapes this host cannot serve. That satisfies the separation required by the host-capability decision in [PLAN.md](PLAN.md#approved-decisions): an unsupported composition must be a deterministic pre-start admission result, never a Workflow crash or a hang.

## Selected account

### The plan is keyed to enabled interactions, not to profiles

The canonical state observation already publishes `enabledInteractions` as a closed union of `completeUserTaskInstance` and `deliverMessage`, and the project's semantic invariants already make enabled external interactions part of the observation contract. The driver therefore consumes that published set instead of recognizing models, profiles, or topologies.

The loop is: read the committed canonical state; return the receipt when the Process is terminal; otherwise select the first unconsumed configured response whose interaction is currently enabled and submit it through the ordinary production command; otherwise, when a `timer` or `effect` wait is open and no interaction is enabled, keep waiting durably; otherwise report a typed stalled-configuration refusal.

Three consequences are deliberate. Declared plan order — not scan order over the observation — decides between two simultaneously enabled interactions, so a host scheduling choice never masquerades as BPMN semantics. Each configured response is consumed at most once, so a stale repeat is a refusal rather than a second command. An enabled interaction with no matching unconsumed response is a refusal, never a guessed or auto-generated completion.

This replaces the single-task assumption with no new semantic mechanism: user-task waits resolve through the existing content-bound completion Update, message waits through the existing `submitMessageDelivery` Signal ingress, timer waits through the Workflow's own committed-state-derived durable timer, and effect waits through the Activity registered below.

### Product configuration contract

```ts
type MvpInteractionResponse =
  | Readonly<{
      kind: "completeUserTask";
      elementId: string;
      delayMs: number;
      inputVariableNames: readonly string[];
      submittedValues: readonly VariableBinding[];
    }>
  | Readonly<{
      kind: "deliverMessage";
      channel: MessageChannel;
      delayMs: number;
    }>;

type MvpEffectHandler = Readonly<{
  protocol: string;
  operation: string;
  result: EffectExecutionResult;
}>;

type RunnableMvpConfig = DeepReadonly<{
  kind: "runnableTemporalMvp";
  bpmn: { file: string; sourceId: string; semanticProfile: string; limits: BpmnLimits };
  process: { instanceId: string; initialVariables: VariableBinding[] };
  temporal: ExternalTemporalRuntimeOptions;
  interactions: MvpInteractionResponse[];
  effectHandlers: MvpEffectHandler[];
}>;
```

`interactions` replaces `dummyUserTask`; an empty list is legal and is exactly what a pure timer model requires. `effectHandlers` is empty for every profile without effect waits. Both remain strictly validated against the existing exact-object, canonical-string, and well-formed-stimulus rules, and both keep the project's canonical Unicode-scalar ordering requirements. `result` reuses the existing `EffectExecutionResult` union so the configuration cannot invent a result shape the semantic core does not accept, and `MessageChannel` is reused unchanged so no product-local address format appears.

### Product effect execution

The production runtime registers one implementation of the existing `EffectActivities` interface, resolving `executeBpmnEffect` against the configured handler for the request's neutral protocol and operation and returning the declared `EffectExecutionResult`.

This is an explicit deterministic host simulation, exactly parallel in status to the dummy User Task actor: it is not a real external integration, not a CIB Seven effect-compatibility claim, and not evidence about any production service. The handler performs no I/O, derives nothing from wall-clock time, and generates no business values. A request whose protocol and operation have no configured handler fails as a typed adapter failure rather than a fabricated success, and the harness `EffectProbeActivityRegistry` remains test-only and is not promoted into the product path.

The implementation must determine and then document the exact observable behavior when an effect-bearing model is started against a Worker with no matching handler, and must report it as a typed infrastructure failure rather than an unexplained wait.

### Reporting, examples, and evidence

Product records extend to the new interaction kinds while preserving the current event and exit classification: source and host admission rejection before connecting, the semantic Process address, each committed stable canonical state, every submitted interaction and its typed semantic result, effect execution outcomes, the terminal receipt, and infrastructure failure kept separate from semantic outcomes.

The milestone is executable rather than prose: one example configuration per runnable profile, reusing the existing scenario BPMN files without copying or forking them, and an acceptance test that loads each real configuration through the same command orchestration. A profile that cannot run must be listed with its exact reason rather than silently omitted.

## Required, optional, excluded

Required: the enabled-interaction driver and its plan-order rule; multiple and concurrent user-task interactions; message delivery; durable timer waiting without host action; product effect Activity registration with configured deterministic handlers; per-profile example configurations and acceptance coverage; typed refusals for unmatched, stale, and unhandled cases; graduation into the existing MVP specification with `IMPLEMENTATION-MAP.md`, `PLAN.md`, and cost-ledger updates in the same change.

Optional: a convenience default that derives a trivial plan when a model has exactly one enabled interaction; richer product record formatting; per-interaction timeout configuration beyond the existing deadlines.

Excluded: every current MVP exclusion remains, including user interface, form rendering, identity, authorization, task discovery, and production packaging. Also excluded: new BPMN semantics, new IL operations, new profiles, new CIB relationships, changes to canonical observation or wire contracts, real external service integration, multi-instance or long-running Worker modes, concurrent Process instances in one command, and any retained Event History, versioning, or migration mechanism.

## Host capability and refinement boundary

This proposal adds no semantic transition family, so it opens no Lean obligation, no new relation, and no new proof. It adds one host mechanism — Activity registration in the production Worker — whose semantic effect contract is already owned and evidenced by the Service Task capsule.

The capability boundary stays where it is: `assessBpmnProcessAdmission` remains the single pre-start gate, and this work must not widen it. If any example configuration turns out to need a wait-set shape the current host rejects, that is a stop condition and a separate capability decision, not something the driver may work around.

The evidence status of this increment is composition, not independence. Reusing the proven compiler, core, Workflow, and client is the point; the acceptance lane must not be presented as a second independent semantic lane, and the disposable-history and no-retained-fixture rules of the pre-release policy continue to apply unchanged.

## Evidence plan

Focused gates: `./scripts/pnpm.sh run check:harness-types`, `./scripts/pnpm.sh run test:temporal`, and the source-hygiene guard for the changed CLI and adapter owners. Complete gate: `./scripts/verify.sh` once at integration, plus `git diff --check`.

Acceptance evidence runs each example configuration against a separately started ordinary Temporal service, as today. The negative controls are an unsupported model rejected before any connection, an unmatched enabled interaction, a stale repeated response, and an effect request with no configured handler.

## Risks and nearest wrong accounts

The nearest wrong account is a driver that scans the observation and completes whatever it finds, which would turn host iteration order into apparent BPMN behavior for concurrent tasks; the declared plan order exists precisely to refuse that. The second is a configured effect handler presented as compatibility or integration evidence; it is a simulation with the same status as the dummy actor. The third is widening pre-start admission to make an example run. The fourth is duplicating the harness runner's scenario machinery into the product, which would create a second execution account; the product path must consume only production client functions.

A residual risk is that the product config grows into a general scenario language. The boundary is that configuration may only name interactions the canonical observation already enables and results the semantic core already accepts.

## Versioning consequences

Under the pre-release policy this is one atomic replacement: `dummyUserTask` is removed rather than deprecated, every example and test moves in the same change, and no compatibility reader, format counter, or migration path is added. The `DummyUserTaskResponse` shape survives as the `completeUserTask` variant's payload so the reviewed completion-data contract is unchanged.

The existing MVP specification's reopen conditions explicitly require reopening before multiple simultaneous dummy tasks, which this proposal does; that is the intended trigger, not an exception to it.

## Owner questions

1. Approve the enabled-interaction driver, the deterministic product effect handler, and the atomic removal of `dummyUserTask` as the product contract?
2. Confirm that graduation replaces the bounded contract inside [RUNNABLE-TEMPORAL-MVP-SPEC.md](RUNNABLE-TEMPORAL-MVP-SPEC.md) and keeps that filename, with the review receipt carried into it voluntarily?
3. Confirm that a profile requiring a wait-set shape the current host rejects is a stop condition rather than in-scope work?

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `df44937` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The semantic-checkpoint stage is recorded as not required because this contract changes no wire or schema shape, no checked graph or Semantic Process IL, no runtime or public observation, no admission or profile capability, no transition family or proof boundary, and no scope, cancellation, or concurrency semantics. If implementation contradicts that assessment, the checkpoint stage must be opened before the next lane rather than reclassified at closure.
