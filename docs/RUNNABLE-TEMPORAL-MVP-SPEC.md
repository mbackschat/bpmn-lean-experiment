# Temporal engine runner specification

## Status

**Implemented current pre-release product contract; not an immutable release or production-history baseline.** The product surface spans every registered semantic profile through one driver keyed to published enabled interactions. Exact implemented and absent evidence belongs in the [Temporal hosting implementation map](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md).

## Scope

This specification owns the engine-side product runner that executes any admitted BPMN model durably on an ordinary Temporal server while keeping its bounded feature set explicit and excluding a task UI, form renderer, identity system, and global task inbox.

## Implemented product surface

The repository ships one command-line-driven runtime that connects to a caller-supplied Temporal address, starts a Worker for the generic BPMN Process Workflow, admits exact BPMN XML before Workflow creation, starts one semantic Process instance, answers the external interactions that instance publishes, and waits until the Process completes or fails infrastructurally.

Product acceptance covers every registered semantic profile. At least one example configuration exists per profile, reusing the registered scenario BPMN source unchanged, and the runtime uses the same source compiler, Semantic Process program, semantic core, production Process Workflow, Update and Signal command boundaries, and Temporal replay-safe code as the maintained evidence path.

A profile may carry more than one example when one declared plan cannot reach both arms of a race. The Event-Based Gateway profile is the first such case: a plan either answers the published Message or declines it so the timer wins, never both, so its two examples mirror the two registered scenarios rather than duplicating one. The runner never substitutes a model-specific Workflow or generated TypeScript file for the shared execution path.

The supported subset is explicit. A document outside its named profile returns typed pre-start admission rejection; the runtime never silently ignores an unsupported BPMN construct or Camunda/CIB extension.

## Public operating contract

One documented non-test command accepts:

- a BPMN XML file path, a source identity, a selected semantic-profile identity, and exact byte and parser-deadline limits;
- one closed Process-start configuration: the existing semantic instance plus initial closed string/null Process variables, an exact Message Start Event identity and operation-addressed channel, or an exact Timer Start Event identity;
- a Temporal address, Namespace, Task Queue, and identity;
- a declared interaction plan;
- declared deterministic effect handlers.

```ts
type EngineRunnerInteractionResponse =
  | Readonly<{
      kind: StimulusKind.CompleteUserTaskInstance;
      elementId: string;
      delayMs: number;
      inputVariableNames: readonly string[];
      submittedValues: readonly VariableBinding[];
    }>
  | Readonly<{
      kind: StimulusKind.DeliverMessage;
      channel: MessageChannel;
      delayMs: number;
    }>;

type EngineRunnerEffectHandler = Readonly<{
  protocol: string;
  operation: string;
  result: EffectExecutionResult;
}>;
```

Both discriminators are canonical `StimulusKind` values rather than product-local aliases, so matching a response against a published interaction needs no translation table. An empty interaction plan is legal and is exactly what a model whose only waits are host-resolved requires; an empty handler list is legal for any model without effect waits. `EffectExecutionResult` is reused whole, so a declared handler can express the typed business-error arm an interrupting boundary Error route requires as well as ordinary success, and configuration cannot invent a result the semantic core would reject.

The `process` configuration is a strict union of exactly `{ instanceId, initialVariables }` for manual start, exactly `{ instanceId, startEventId, channel }` for Message start, and exactly `{ instanceId, startEventId }` for Timer start. The key sets are mutually exclusive and the shared compiled-program-to-start constructor handles them exhaustively. The union deliberately has no added tag because existing manual example bytes are preserved; an optional-field mode bag is rejected. A Message-start channel mismatch or Timer-start Start Event mismatch rejects before Temporal connection or Workflow start.

The command connects to an already running Temporal service. It does not start an embedded or ephemeral Temporal server, choose frontend ports, or bind a server port. A connection failure reports the supplied address and remains infrastructure failure. Local demonstrations may run Temporal separately, but port allocation and server lifecycle remain outside the BPMN Worker.

The command reports at least source and profile admission rejection before Workflow creation, the stable semantic Process address after start, each committed canonical state it observed, every interaction it submitted with the typed semantic result, each host wait it observed, the final Process state, and infrastructure failure separately from semantic outcomes. Exit code `0` means completed, `1` means infrastructure failure, `2` means source or host admission rejection, `3` means interaction refusal, and `64` means malformed command configuration.

The runner may run one Worker and one Process instance in one foreground process. Multi-process deployment, packaging, daemon supervision, authentication, TLS provisioning, Temporal Cloud administration, production retention, and horizontal scaling are excluded.

## Interaction driver

The driver is blind to BPMN topology, profiles, and element roles. It reads the canonical `enabledInteractions` set and the open host waits of each committed state, matches them against the declared plan, and submits ordinary production commands.

Precedence per committed state is load-bearing and not interchangeable:

1. answer the first unconsumed response whose interaction is currently enabled;
2. otherwise keep waiting while any timer or effect wait is open, because a host-resolved wait may still withdraw the enabled interactions — an armed Event-Based Gateway publishes a Message interaction that a timer winner is expected to cancel, so refusing here would reject a legitimate Process;
3. otherwise refuse, distinguishing an enabled interaction nobody answers from a Process that can no longer progress at all.

Declared response order — never observation order — decides between two simultaneously enabled interactions, so host iteration order can never present itself as BPMN behavior. Each response is consumed at most once, so a stale repeat is a refusal rather than a second command.

Occurrence identity is taken, never constructed. A response selects which published interaction to answer; the driver then submits the complete occurrence identity that interaction carried, including its activation. No product code assembles a task, subscription, or activation identity, derives an activation ordinal, or substitutes a caller-owned address. When one response matches more than one currently enabled occurrence of the same element or channel, the driver refuses that ambiguity rather than choosing.

A bounded observation loop reads at most 600 committed states at a 250-millisecond polling cadence. That bound is a harness safety boundary so a host wait that never resolves cannot poll forever; exceeding it is a product refusal and never a BPMN outcome. One consequence is deliberate: with a host wait open, omitting a response reads as "let the host-resolved wait win", so a forgotten response in a model that also has an open timer degrades from a prompt unmatched-interaction refusal to a slow observation-limit refusal.

## Simulated actor and effect boundary

Configured responses and effect handlers are explicit host simulations, not BPMN meaning and not CIB human-resource or integration compatibility. A completion response simulates a person reading committed Process variables and submitting form values; an effect handler simulates an external service returning a fixed result. Neither performs I/O, reads a clock, derives values from wall time, or generates business values.

Neither mutates semantic state directly. Initial input and completion data remain the separately reviewed extensions owned by the [Process-start data specification](capsules/PROCESS-START-DATA-SPEC.md) and [User Task completion-data specification](capsules/USER-TASK-COMPLETION-DATA-SPEC.md), and every answer travels through the same content-bound command a real client would use. The configured delay is not a BPMN Timer Event, produces no Temporal timer in the Process Workflow, and is absent from canonical state. If the command process exits during a delay, the Process and its waits remain durably waiting on Temporal, and a replacement may submit the same content-bound command safely.

The production Worker registers one `executeBpmnEffect` Activity implementation resolving declared handlers by neutral protocol and operation. An undeclared descriptor throws rather than fabricating a success the semantic core would commit. Existing profiles apply the approved retry policy owned by the [Service Task effect specification](capsules/SERVICE-TASK-EFFECT-SPEC.md) and surface exhausted execution as typed adapter failure. The registered incident successor instead selects one attempt and may return the profile-owned payload-free `technicalFailure` result; the Workflow, not the Activity, converts its first occurrence into the semantic report command. The harness effect probe remains harness-only and is never promoted into the product path.

## Pre-start admission

Two distinct gates run before any Workflow exists and neither may widen. Source and profile admission runs first, inside compilation, and rejects a document outside its selected profile before any connection. Host capability runs second and rejects a program shape this adapter cannot serve; every registered profile passes it today, so that gate guards future widening rather than a live restriction. A profile that needs a rejected wait-set shape is a stop condition routed to an owner capability decision, never something the driver works around.

## Acceptance evidence

Product evidence separates two claims and must not be reported as one.

Admission and configuration are checked for every registered profile without a Temporal service: each example loads under strict validation, compiles from exact source, satisfies host capability and semantic start admission, and declares a handler for every effect its program awaits. The oracle is the registered profile set and it binds in both directions: a profile without any product example fails rather than silently shrinking the advertised surface, and an example naming an unregistered profile fails rather than advertising a surface the engine does not have.

Live durable execution is checked once per distinct host interaction or start mechanism: the completion Update, incident retry Update, exact Message Start while no Worker polls, exact Timer Start through a test-owned one-action Schedule while no Worker polls, two concurrent published tasks answered in declared plan order, a host-resolved durable timer with an empty plan, Message delivery through the published subscription identity, the effect Activity's declared success, business-error, and successor-only technical-failure arms, and a host timer winning against an enabled interaction the plan declines. The incident witness publishes one committed incident, survives Worker replacement, restores the same effect, completes, and replays; separate witnesses retain a post-retry host failure without a second incident and a two-command retry race. The Message Start witness later observes and completes the exact User Task with no Signal Event and replays its history. The Timer Start witness is separate from runner orchestration: it proves service-owned scheduled Workflow creation, opaque returned execution identity, the later exact User Task, absence of Workflow Timer and Signal families, action exhaustion, and replay, while the runner example proves strict configuration and ordinary start construction for the already-resolved trigger. The timer-race mechanism is distinct from the empty-plan timer because an interaction is enabled and must be withdrawn by the timer's victory, which exercises the driver's keep-waiting precedence branch. Models that only reuse an evidenced mechanism are deliberately not re-run live.

Both halves compose the already-evidenced compiler, program, semantic core, Workflow, and client. Neither is an independent semantic evidence lane, and neither supports a BPMN conformance or broad CIB compatibility claim.

## Explicit exclusions

- browser or desktop UI, form rendering, schema-driven widgets, validation messages, attachments, and comments;
- users, groups, assignees, candidates, claims, delegation, authorization, authentication, and audit identity;
- global task discovery, Search Attributes, task-list persistence, and an external task read model;
- random actor behavior, human escalation or reminder policy, and any response carrying an explicit activation to resolve an ambiguous match;
- real external integration, and any interpretation of an effect result beyond returning the declared one;
- BPMN data associations, form metadata, Camunda form extensions, and general variable types beyond the approved string/null patch;
- production release packaging, retained production Event Histories, Workflow versioning support windows, migration, rollback, or availability claims;
- multiple concurrent Process instances in one command, multi-process deployment, and daemon supervision;
- Collaboration, Participants, Message Flow, Human Performer and Resource Role coverage by implication.

## Reopen conditions

Reopen this specification before adding a UI or task inbox, identity or authorization, another variable type, BPMN or CIB form metadata, task assignment extensions, an embedded Temporal server, concurrent Process instances in one command, production history compatibility, a real external effect integration, a response that carries its own occurrence identity, or any command path that bypasses the semantic command boundary.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `df44937` | `fork-turns-none` | `approve-with-required-edits` | `482bbd6` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `1e6f88f` | `fork-turns-none` | `approve-with-required-edits` | `9e66b5e` |

This receipt is carried voluntarily. This specification belongs to the closed pre-policy grandfather set and the executable guard therefore requires no receipt from it, but the graduating change deleted the proposal that recorded these reviews, so the evidence would otherwise be lost. The closure stage was corrected across two same-reviewer audits: `7b0c46b` closed the eight original findings and `9e66b5e` closed the two follow-on documentation-consistency findings the first correction introduced. The semantic-checkpoint stage was classified as not required because the graduated contract changes no wire or schema shape, no checked graph or Semantic Process IL, no runtime or public observation, no admission or profile capability, no transition family or proof boundary, and no scope, cancellation, or concurrency semantics; the closure reviewer affirmed that classification against the implemented range.
