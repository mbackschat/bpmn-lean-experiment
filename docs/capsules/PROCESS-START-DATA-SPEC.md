# Process-start data specification

## Status

**Implemented and evidence-closed draft specification on 2026-07-31; not an immutable compatibility profile.**

## Question and authority

For the bounded CIB Seven User Task profile, how does a caller supply initial Process data so the first active User Task can read selected form inputs without claiming BPMN Data Association, form, or human-resource semantics?

BPMN 2.0.2 owns the Process lifecycle but does not define CIB Seven's public `RuntimeService.startProcessInstanceByKey(processDefinitionKey, variables)` API or a universal start-map-to-Process-variable rule. This specification selects the pinned public-service behavior as extension [`CIB-EXT-0006`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0006--public-process-start-installs-initial-process-variables) under `CIB-CFG-0001`.

## Data and command contract

The existing start command now requires one canonical list in the already closed string/null variable domain:

```ts
interface StartProcessStimulus {
  readonly kind: "startProcess";
  readonly commandId: string;
  readonly processId: string;
  readonly instanceId: string;
  readonly initialVariables: readonly VariableBinding[];
}
```

Binding names are nonempty, unique, and ordered by Unicode scalar value. The empty list preserves every pre-existing no-data start case. Unknown fields, duplicate names, noncanonical ordering, unpaired surrogates, and value variants beyond string and explicit null fail at the wire boundary before they become semantic input.

## Stable rules

| Rule | Proposition | Layer |
|---|---|---|
| `PSTART-INSTALL-01` | A valid exact Process start installs exactly the canonical initial bindings in fresh Process scope before internal start closure reaches its first stable wait; it creates no Activity-local scope. | Selected CIB compatibility overlay implemented by the semantic core |
| `PSTART-REFUSE-01` | A start rejected for Process-identity mismatch or non-`notStarted` control preserves the complete pre-command state and installs no supplied binding. | Semantic command admission |
| `PSTART-OBSERVE-01` | Committed initial bindings appear only through the ordinary canonical Process-variable projection and later semantic reads; host request objects and unselected form fields remain absent. | Shared observation boundary |

The smallest positive witness starts the sequential User Task fixture with `requestTitle = "Review invoice 42"`; the first stable task wait and the final completed state both expose that binding. The negative witness submits `mustNotAppear = "guard"` with a different Process ID and observes exact `initialState` after rejection.

## Rule-to-evidence matrix

| Rule | Lean | CIB Seven | TypeScript semantic core | Temporal | Negative or mutation evidence |
|---|---|---|---|---|---|
| `PSTART-INSTALL-01` | `running_start_installs_only_process_bindings` is universal over instance identity and bindings; `exact_start_data_is_visible_at_first_wait` checks closure | The public phase-zero probe starts with a nonempty map and reads the exact map from the first task before completion | The sequential start test checks the exact first-wait state and retained scenario trace | The start list is embedded in the production Workflow arguments and replayed through the same core start transition | Empty-list starts preserve every other capsule; initial data does not alter the first wait's enabled-operation count |
| `PSTART-REFUSE-01` | `wrong_process_start_installs_no_data` | An unknown Process definition cannot create an instance; semantic stable identity remains the project's boundary | The wrong-Process test observes exact `initialState` | Semantic admission runs before Workflow creation, so rejected source or start input creates no Workflow | The discriminating `mustNotAppear` binding remains absent |
| `PSTART-OBSERVE-01` | Stable-state projection contains Process bindings and no Activity scope | The runner projects only names from the already committed start or completion command | Canonical scenario variables retain exact string/null values | The known-Process task-detail Query returns only caller-selected committed Process names | The existing Activity-local projection mutation remains excluded from canonical variables |

## Semantic Process and admission consequence

No BPMN source node, checked graph fact, Semantic Process operation, host wait kind, or topology predicate changes. The existing external start transition receives initial bindings and constructs the fresh scoped-variable state before ordinary internal closure. This is not a new runtime-transition family, so it requires no duplicate declarative relation; the existing start command family is widened and the universal fresh-state theorem locks its data invariant.

The selected profile remains node-kind plus profile multiset plus generic graph facts. Both empty and nonempty initial lists reach the same single User Task wait, with the same closure bound, unique enabled selection, host-capability result, and resumption account. No multiple wait set, stuck state, or adapter scheduling capability becomes reachable.

## Temporal hosting and refinement preflight

- Durable ingress is the existing explicit start argument supplied before Workflow creation, not an Update, Signal, Activity, timer, or future scenario command list.
- Semantic and Temporal host admission complete before `client.start`; an invalid Process identity or malformed start list creates no Workflow.
- The admitted start enters the Workflow's single semantic input queue before any external Query or completion handler becomes addressable. Only the main loop calls the semantic core and installs the data.
- The exact list is serializable Workflow history input and participates in the canonical typed start encoding used by identity tests. Replay therefore reconstructs the same first wait and variables.
- There is no start-data retry, ordering, cancellation, concurrency, or external-effect protocol beyond Temporal's existing Workflow-start identity boundary. User Task completion remains a distinct content-bound Update.
- The smallest refinement witness is the production sequential Workflow: start with `requestTitle`, Query the exact active task and selected input, complete it, validate the completed receipt, and replay the produced history.

The state relation remains exact semantic runtime state equality at the existing Query/receipt projection. The foreground dummy actor may read selected input after start but cannot modify it except through the separately specified exact completion command.

## Runtime-only and synthetic constructs

This capsule adds no runtime-only BPMN operation, occurrence identifier, activation counter, host ID, or synthetic graph node. `initialVariables` is explicit caller-owned semantic input. Temporal Workflow IDs, Run IDs, payload metadata, and Event History remain host facts and are never projected as BPMN state.

## Explicit exclusions

- BPMN Properties, Data Objects, ItemDefinitions, InputOutputSpecification, Assignments, transformations, and Data Associations;
- form definitions, form keys, generated or embedded forms, field validation, and UI metadata;
- task-local or transient variables, deletion, coercion, nested values, serialization formats, and values beyond string/null;
- Collaboration messages, Participants, Resource Roles, users, groups, assignment, authorization, authentication, and audit identity;
- restarting, reopening, or mutating an already started Process through this command;
- multiple simultaneous dummy tasks, a global task inbox, Search Attributes, and discovery by variable.

## Versioning consequences

This is a breaking pre-release start-command shape replacement. Every schema, decoder, encoder, scenario, Lean constructor, TypeScript producer and consumer, Java projector, retained CIB artifact, canonical identity test, Temporal Workflow argument, and differential runner changed atomically. The reviewed meaning received the new profile identity `cibseven-2.2.0-user-task-process-data-draft`; no legacy reader, empty-list default, migration branch, or retained production history was added.

The known consumer is the external-Temporal engine runner and its simulated form actor. Approval of the first durable production baseline still requires explicit history evolution, migration, rollback, and support-window decisions.

## Closure review

The reproducible implementation boundary is `416df39..07e7f17`: hand-written Lean, TypeScript, Java, and JavaScript changed by `+289/-77` nonblank lines and documentation changed by `+104/-36`; elapsed time is unknown. The exact established claim is atomic installation and ordinary Process-scope observation of one canonical string/null binding map on an accepted fresh start under selected CIB extension `CIB-EXT-0006`. The closest unsupported claim is BPMN data modeling, task-local input mapping, form semantics, variable deletion, a wider value domain, or mutation of an existing instance. The principal correlation risk is the shared admitted scenario/profile account; the independent public-service CIB probe observes the first task before completion, while Lean and TypeScript separately establish the start transition downstream of the admitted graph. Wrong Process identity, malformed or noncanonical bindings, state outside `notStarted`, and outside-core installation are the nearest executable counterexamples. This capsule is materially smaller in code than the preceding completion-data capsule because it reuses the scoped-data representation, public observation, Temporal start argument, runner projection, and replay mechanisms.

## Reopen conditions

Reopen before adding a value kind, deletion, local or transient scope, BPMN data construct, form metadata, variable-based discovery, start-on-message behavior, Process restart, multiple definitions in one command, or any host path that installs data outside the semantic start transition.
