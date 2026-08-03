# Runnable Temporal BPMN MVP specification

## Status

**Implemented current pre-release product contract; not an immutable release or production-history baseline.** The product surface spans every registered semantic profile through one driver keyed to published enabled interactions. Exact implemented and absent evidence belongs in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

## Product question

What is the smallest end-to-end product that lets a user run any admitted BPMN model durably on an ordinary Temporal server while honestly documenting its bounded feature set and avoiding a premature task UI, form renderer, identity system, or global task inbox?

## Implemented MVP

The repository ships one command-line-driven runtime that connects to a caller-supplied Temporal address, starts a Worker for the generic BPMN Process Workflow, admits exact BPMN XML before Workflow creation, starts one semantic Process instance, answers the external interactions that instance publishes, and waits until the Process completes or fails infrastructurally.

Product acceptance covers every registered semantic profile. One example configuration exists per profile, reusing the registered scenario BPMN source unchanged, and the runtime uses the same source compiler, Semantic Process program, semantic core, production Process Workflow, Update and Signal command boundaries, and Temporal replay-safe code as the maintained evidence path. A separate model-specific Workflow or generated TypeScript file is not an MVP shortcut.

The supported subset is explicit. A document outside its named profile returns typed pre-start admission rejection; the runtime never silently ignores an unsupported BPMN construct or Camunda/CIB extension.

## Public operating contract

One documented non-test command accepts:

- a BPMN XML file path, a source identity, a selected semantic-profile identity, and exact byte and parser-deadline limits;
- a semantic Process-instance identity and initial closed string/null Process variables;
- a Temporal address, Namespace, Task Queue, and identity;
- a declared interaction plan;
- declared deterministic effect handlers.

```ts
type MvpInteractionResponse =
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

type MvpEffectHandler = Readonly<{
  protocol: string;
  operation: string;
  result: EffectExecutionResult;
}>;
```

Both discriminators are canonical `StimulusKind` values rather than product-local aliases, so matching a response against a published interaction needs no translation table. An empty interaction plan is legal and is exactly what a model whose only waits are host-resolved requires; an empty handler list is legal for any model without effect waits. `EffectExecutionResult` is reused whole, so a declared handler can express the typed business-error arm an interrupting boundary Error route requires as well as ordinary success, and configuration cannot invent a result the semantic core would reject.

The command connects to an already running Temporal service. It does not start an embedded or ephemeral Temporal server, choose frontend ports, or bind a server port. A connection failure reports the supplied address and remains infrastructure failure. Local demonstrations may run Temporal separately, but port allocation and server lifecycle remain outside the BPMN Worker.

The command reports at least source and profile admission rejection before Workflow creation, the stable semantic Process address after start, each committed canonical state it observed, every interaction it submitted with the typed semantic result, each host wait it observed, the final Process state, and infrastructure failure separately from semantic outcomes.

The initial command may run one Worker and one Process instance in one foreground process. Multi-process deployment, packaging, daemon supervision, authentication, TLS provisioning, Temporal Cloud administration, production retention, and horizontal scaling are not required for this MVP.

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

The production Worker registers one `executeBpmnEffect` Activity implementation resolving declared handlers by neutral protocol and operation. An undeclared descriptor throws rather than fabricating a success the semantic core would commit; the approved Activity retry policy owned by the [Service Task effect specification](capsules/SERVICE-TASK-EFFECT-SPEC.md) then exhausts and surfaces one typed adapter failure. The harness effect probe remains harness-only and is never promoted into the product path.

## Pre-start admission

Two distinct gates run before any Workflow exists and neither may widen. Source and profile admission runs first, inside compilation, and rejects a document outside its selected profile before any connection. Host capability runs second and rejects a program shape this adapter cannot serve; every registered profile passes it today, so that gate guards future widening rather than a live restriction. A profile that needs a rejected wait-set shape is a stop condition routed to an owner capability decision, never something the driver works around.

## Running the maintained demonstration

Install the repository dependencies, then make an ordinary Temporal service available. The BPMN command never starts a server or binds a server port. For a local demonstration, start Temporal separately in one terminal; the example configurations address `localhost:7233`:

```sh
temporal server start-dev --headless
```

If the service uses another address, Namespace, or Task Queue, copy and edit the explicit `temporal` object in the chosen example. `process.instanceId` is semantic identity and must be new for each execution retained by that Temporal Namespace because Workflow ID reuse is deliberately rejected.

Run any per-profile example in another terminal:

```sh
./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/user-task-discovery-completion.json
```

The command compiles the BPMN file before connecting, then emits typed JSON records for source admission, Process identity, each observed state, the selected form input, the configured delay, the semantic result of each interaction, and the completed receipt. Temporal SDK Worker logs may appear between these product records. Exit code `0` means completed, `1` means infrastructure failure, `2` means source or host admission rejection, `3` means interaction refusal, and `64` means malformed command configuration.

The unsupported example needs no Temporal service and proves pre-connect rejection:

```sh
./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/unsupported.json
```

It emits `sourceAdmissionRejected` with the source diagnostics and exits `2`; the command never opens a Temporal connection for that model.

## Acceptance evidence

Product evidence separates two claims and must not be reported as one.

Admission and configuration are checked for every registered profile without a Temporal service: each example loads under strict validation, compiles from exact source, satisfies host capability and semantic start admission, and declares a handler for every effect its program awaits. The oracle is the registered profile set, so a profile without a product example fails that check rather than silently shrinking the advertised surface.

Live durable execution is checked once per distinct host interaction mechanism: the completion Update, two concurrent published tasks answered in declared plan order, a host-resolved durable timer with an empty plan, Message delivery through the published subscription identity, and the effect Activity's declared success and business-error arms. Models that only reuse an evidenced mechanism are deliberately not re-run live.

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

## Ordering consequence

Uncovered BPMN mechanisms are scheduled primarily by their presence in CIB Seven `2.2.0` executable behavior, under the durable ordering rule in [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering). Widening the product surface further is not a semantic increment: a new profile reaches the product through its example configuration and the existing driver, not through new product code.

## Reopen conditions

Reopen this specification before adding a UI or task inbox, identity or authorization, another variable type, BPMN or CIB form metadata, task assignment extensions, an embedded Temporal server, concurrent Process instances in one command, production history compatibility, a real external effect integration, a response that carries its own occurrence identity, or any command path that bypasses the semantic command boundary.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `df44937` | `fork-turns-none` | `approve-with-required-edits` | `482bbd6` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `1e6f88f` | `fork-turns-none` | `approve-with-required-edits` | `9e66b5e` |

This receipt is carried voluntarily. This specification belongs to the closed pre-policy grandfather set and the executable guard therefore requires no receipt from it, but the graduating change deleted the proposal that recorded these reviews, so the evidence would otherwise be lost. The closure stage was corrected across two same-reviewer audits: `7b0c46b` closed the eight original findings and `9e66b5e` closed the two follow-on documentation-consistency findings the first correction introduced. The semantic-checkpoint stage was classified as not required because the graduated contract changes no wire or schema shape, no checked graph or Semantic Process IL, no runtime or public observation, no admission or profile capability, no transition family or proof boundary, and no scope, cancellation, or concurrency semantics; the closure reviewer affirmed that classification against the implemented range.
