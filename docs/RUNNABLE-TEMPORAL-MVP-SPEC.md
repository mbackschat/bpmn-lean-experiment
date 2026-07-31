# Runnable Temporal BPMN MVP specification

## Status

**Implemented current pre-release product contract on 2026-07-31; not an immutable release or production-history baseline.**

## Product question

What is the smallest end-to-end product that lets a user run an admitted BPMN model durably on an ordinary Temporal server while honestly documenting its bounded feature set and avoiding a premature task UI, form renderer, identity system, or global task inbox?

## Implemented MVP

The repository ships one command-line-driven runtime that connects to a caller-supplied Temporal address, starts a Worker for the generic BPMN Process Workflow, admits exact BPMN XML before Workflow creation, starts one semantic Process instance, exposes its current canonical state by known Process-instance identity, and waits until the Process completes or fails infrastructurally.

The first product acceptance model is the existing private executable `None Start Event → User Task → None End Event` shape plus the implemented initial-data and completion-data extensions in the [Process-start data specification](capsules/PROCESS-START-DATA-SPEC.md) and [User Task completion-data specification](capsules/USER-TASK-COMPLETION-DATA-SPEC.md). The runtime must use the same source compiler, Semantic Process program, semantic core, production Process Workflow, Update command boundary, and Temporal replay-safe code as the maintained evidence path. A separate model-specific Workflow or generated TypeScript file is not an MVP shortcut.

The supported subset is explicit. A document outside the named profile returns typed pre-start admission rejection; the runtime never silently ignores an unsupported BPMN construct or Camunda/CIB extension.

## Public operating contract

One documented non-test command accepts:

- a BPMN XML file path;
- a selected semantic-profile identity;
- a semantic Process-instance identity;
- a Temporal address, Namespace, and Task Queue;
- initial closed string/null Process variables;
- the optional dummy User Task actor configuration below.

The command connects to an already running Temporal service. It does not start an embedded or ephemeral Temporal server, choose frontend ports, or bind a server port. A connection failure reports the supplied address and remains infrastructure failure. Local demonstrations may run Temporal separately, but port allocation and server lifecycle remain outside the BPMN Worker.

The command reports at least:

- source/profile admission rejection before Workflow creation;
- the stable semantic Process address after start;
- each committed stable canonical state needed to see the active User Task and its Process variables;
- the exact semantic completion result produced by the User Task Update;
- the final completed Process state;
- infrastructure failure separately from semantic outcomes.

The initial command may run one Worker and one Process instance in one foreground process. Multi-process deployment, packaging, daemon supervision, authentication, TLS provisioning, Temporal Cloud administration, production retention, and horizontal scaling are not required for this MVP.

## Dummy User Task actor

The dummy actor is an explicit MVP host profile, not BPMN User Task meaning and not CIB human-resource compatibility. It simulates a person entering values into a form and submitting that form through the real User Task completion command.

The actor and its exact known-Process detail Query are implemented. The Query accepts the complete active task occurrence and canonical caller-selected Process-variable names; the actor checks the same sole occurrence again after the host delay before it submits.

```ts
type DummyVariableValue =
  | Readonly<{ kind: "string"; value: string }>
  | Readonly<{ kind: "null" }>;

type DummyUserTaskResponse = Readonly<{
  elementId: string;
  delayMs: number;
  inputVariableNames: readonly string[];
  submittedValues: readonly Readonly<{
    name: string;
    value: DummyVariableValue;
  }>[];
}>;
```

`elementId` selects the admitted User Task definition. `delayMs` is a positive JavaScript-safe integer and represents simulated thinking time; the documented demo uses 3000 milliseconds. `inputVariableNames` selects Process variables returned to the simulated form. `submittedValues` is the simulated user input returned by form submission. Names are nonempty and unique, and arrays use the project’s canonical Unicode-scalar ordering.

When the selected User Task becomes active, the MVP:

1. expose the exact open-task occurrence and the selected committed Process-variable inputs;
2. keep the User Task semantically active throughout the configured delay;
3. keep the semantic User Task durably active on Temporal while the foreground dummy actor waits through a nonblocking host timer;
4. submit the configured values through the same content-bound User Task completion Update available to a real client;
5. let the semantic core validate the exact task occurrence and atomically apply the approved completion-data patch before outgoing closure;
6. report the Update’s typed semantic result and resulting canonical state.

The dummy actor drives only one active User Task at a time in the MVP. It refuses a second simultaneous task, an unconfigured or mismatched task, malformed configuration, and a task that changes during the delay rather than guessing or auto-completing.

The response values are deterministic configuration. The MVP introduces no random person behavior, wall-clock-derived data, hidden default fields, or generated business values.

## Required semantic boundary

The dummy actor does not mutate semantic state directly. Initial form input and completion data are separately reviewed CIB-profile extensions owned by the [Process-start data specification](capsules/PROCESS-START-DATA-SPEC.md) and [User Task completion-data specification](capsules/USER-TASK-COMPLETION-DATA-SPEC.md). Their pinned CIB Seven `2.2.0` observations and atomic wire/Lean/core/Temporal replacements are complete, so the MVP may read initial input and submit simulated form values only through those exact semantic commands.

The host delay is not a BPMN Timer Event, does not produce a Temporal timer in the Process Workflow, and is absent from canonical BPMN state. It is explicit foreground-actor behavior that produces one ordinary external completion command. If the actor process exits during the delay, the Process and User Task remain durably waiting on Temporal; restarting or replacing the actor may submit the same content-bound command safely.

## Running the maintained demonstration

Install the repository dependencies, then make an ordinary Temporal service available. The BPMN command never starts a server or binds a server port. For a local demonstration, start Temporal separately in one terminal; the default accepted config addresses `localhost:7233`:

```sh
temporal server start-dev --headless
```

If the service uses another address, Namespace, or Task Queue, copy and edit the explicit `temporal` object in [`examples/temporal-mvp/accepted.json`](../examples/temporal-mvp/accepted.json). `process.instanceId` is semantic identity and must be new for each execution retained by that Temporal Namespace because Workflow ID reuse is deliberately rejected.

Run the accepted model in another terminal:

```sh
./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/accepted.json
```

The command compiles the BPMN file before connecting, emits typed JSON records for source admission, Process identity, the stable task wait and Process variables, selected form input, the configured 3000-millisecond delay, the semantic completion result, and the completed receipt. Temporal SDK Worker logs may appear between these product records. Exit code `0` means completed, `1` means infrastructure failure, `2` means source or host admission rejection, `3` means actor or semantic completion refusal, and `64` means malformed command configuration.

The unsupported example needs no Temporal service and proves pre-connect rejection:

```sh
./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/unsupported.json
```

It emits `sourceAdmissionRejected` with the source diagnostics and exits `2`; the command never opens a Temporal connection for that model.

## Acceptance evidence

The maintained command and gates establish that one fresh checkout can:

1. start or connect to a local Temporal service without the BPMN runtime binding any server port;
2. run the foreground BPMN Worker against that service;
3. submit the exact acceptance BPMN file and initial variables;
4. observe the active User Task and selected form inputs;
5. observe a real configured delay while the task remains active;
6. observe the configured simulated user values committed through the real completion Update;
7. observe Process completion and final Process variables;
8. rerun the same semantic fixture through the existing differential and same-gate replay evidence without a separate execution account.

The acceptance documentation must list the exact supported BPMN and variable subset and show an unsupported model receiving typed admission rejection.

## Explicit exclusions

- browser or desktop UI, form rendering, schema-driven widgets, validation messages, attachments, and comments;
- users, groups, assignees, candidates, claims, delegation, authorization, authentication, and audit identity;
- global task discovery, Search Attributes, task-list persistence, and an external task read model;
- multiple simultaneous dummy tasks, random actor behavior, and human escalation or reminder policy;
- BPMN data associations, form metadata, Camunda form extensions, and general variable types beyond the approved string/null patch;
- production release packaging, retained production Event Histories, Workflow versioning support windows, migration, rollback, or availability claims;
- Collaboration, Participants, Message Flow, Human Performer and Resource Role coverage by implication.

## Ordering consequence

This runnable vertical product increment is complete. Uncovered BPMN mechanisms are now scheduled primarily by their presence in CIB Seven `2.2.0` executable behavior, under the durable ordering rule in [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering). The bounded embedded Sub-Process Error-propagation follow-on is now implemented under its separate [specification](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md).

## Closure review

The reproducible command-and-product boundary is `9b58437..32df044`: hand-written TypeScript changed by `+950/-132` nonblank lines and documentation changed by `+58/-22`; elapsed time is unknown. The exact established claim is that the maintained one-User-Task config runs the admitted source through the production compiler, semantic core, generic Workflow, external Worker connection, exact detail Query, real completion Update, and completed receipt while the repository process owns no Temporal server port. The closest unsupported claim is production deployment, a second simultaneous task, any other BPMN profile, general form or human-resource support, retained-history compatibility, or unattended recovery of the foreground actor.

The product path intentionally shares the already evidenced compiler, program, semantic core, Workflow, and Process-variable account; it is composition evidence rather than another independent semantic lane. Product records depend only on exact source/config input, admitted definition and runtime state, explicit actor configuration, and separated Temporal host identity. The maintained parallel source, widened or malformed config, multiple/changing task, and noncommitted completion paths are the nearest public counterexamples. This increment adds no Lean proposition because it introduces no semantic transition; the Process-start and completion-data capsules own the reused Lean laws and CIB relationships. The pre-release gate retains no production history, and the existing outside-core completion mutation remains the material refinement discriminator.

This product increment is not materially smaller in code than the preceding completion-data capsule because it adds the first strict operating config, product event/result union, command/exit boundary, and external orchestration owner. Before returning to semantic breadth, the live acceptance test was made to load the real accepted config and call the command orchestration, replacing its duplicate manual compile/start/actor path rather than preserving a second product account.

## Reopen conditions

Reopen this specification before adding a UI or inbox, identity or authorization, multiple simultaneous dummy tasks, another variable type, BPMN or CIB form metadata, task assignment extensions, an embedded Temporal server, production history compatibility, or any completion path that bypasses the semantic command boundary.
