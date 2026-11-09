# Work semantics

What an Activity does once its occurrence has begun. [`Kernel.Feature.Work`](../../../Kernel/Feature/Work.lean) owns matching on the guarded type `Work` (`none`, `manual`, `user`, `receive`, `service`, `send`, `script`, `rule`, `call`), with [`Work.Call`](../../../Kernel/Feature/Work/Call.lean) for Call Activities and [`Work.Submission`](../../../Kernel/Feature/Work/Submission.lean) for the scope-chain submission rule; [`Kernel.Admission.Work`](../../../Kernel/Admission/Work.lean) admits it. How inputs, outputs and writes are evaluated is the [data semantics](data.md); boundaries, Errors and Multi-Instance bodies belong to the [subscriptions](subscriptions.md), [propagation](propagation.md) and [Multi-Instance](multi-instance.md) semantics.

## Interpretation

### Occurrences and commands

- Each token that reaches a task begins one occurrence of it; the occurrence's public identity is `(processInstanceId, elementId, activation)`, with `activation` counting the activations of that element in its process instance from 1 ([identity][uti-identity], [CSE-ARM-01][cse-rules]). Element identity alone never addresses an occurrence ([closure][uti-closure]). CIB task, job and execution identifiers, Temporal Workflow, Run and Update identifiers and UI keys are host identities and never part of it ([identity][uti-identity]).
- The kernel owns the occurrence, its published projection and the admission of the command that completes it; a host only transports the projection and the command ([decision][uti-decision]).
- A command that names another instance, element or activation, or an occurrence already consumed, is `rejected` and changes nothing (`unknown-user-task`, `unknown-effect`, `unknown-incident`; [EFFECT-REFUSE-01][effect-rules], [RECV-REFUSE-01][recv-rules], [CTASK-REFUSE-01][ctask-rules]).
- A completing task leaves through its one completion pipeline and takes every unconditioned outgoing flow in that step.
- An Activity that no token began (the implicit start of a Scope, a compensation handler) may only be a task without work, a User Task or a Service Task (`scope.implicitStart`, `compensation.handlerWork`); a Receive Task or Call begun that way is `unsupported`.
- `asyncBefore` and `asyncAfter` mark transaction boundaries: a closure that rolls back or fails after it crossed one is `unsupported` (`async-boundary-failure`), never a rollback of the whole input ([`Step.deferred`](../../../Kernel/Step.lean)).

### Tasks without work

- An Abstract Task (`bpmn:task`) completes upon activation (BPMN 2.0.2 §13.3.3); it is not underspecified work ([selection basis][ctask-basis], [normative basis][ptt-norm]). A Manual Task is non-operational (§13.1, §10.3.4.1) and is executed as an immediate pass-through that keeps its own source type ([normative basis][ptt-norm]).
- Each activation of either begins and ends one occurrence in one micro-step at the token's scope occurrence, opens no wait, effect or receipt and changes no data; a re-entered task publishes a fresh occurrence ([PTT-PASS-01, PTT-KIND-01, PTT-FRESH-01][ptt-rules], [public contract][ptt-contract]). The kernel runs both as `Work.none` and `Work.manual`.
- A `bpmn:task` carrying the project extension `bpmnLean:taskDefinition` (namespace `urn:bpmn-lean:bpmn:extensions:v1`) is a distinct extended Task type (§7.7, §8.3.3, Table 10.4), not an Abstract Task and never a Service Task: it waits for external work and completes when that work's result arrives ([normative basis][ctask-norm], [selected account][ctask-account], [CTASK-LOWER-01, CTASK-WAIT-01, CTASK-COMPLETE-01][ctask-rules]). The kernel carries it as `service` work whose header keeps the source type `task`. The handler type maps to a neutral effect descriptor as source data, never as runtime configuration ([source binding][ctask-binding], [source profile][ctask-source]). CIB ignores the extension and is not its oracle ([CIB relationship][ctask-cib]).

### User Tasks

- A User Task occurrence opens one User Task item that publishes its name, literal candidate groups, form fields as `(key, type)` pairs and its evaluated inputs; `completeUserTask` naming the occurrence completes it ([decision][uti-decision]). What a completion writes is the [data semantics' OutputSet rule](data.md#activity-data).
- Assignment and form metadata are passive: they never change identity, enabledness, completion admission, the submitted-value merge or the continuation ([UTMETA-PASSIVE-01][utmeta-rules], [PARMETA-PASSIVE-01][parmeta-rules]).
- The selected source is the CIB extension: `camunda:candidateGroups` and `camunda:formData/formField`, projected onto neutral candidate and field concepts so that a later standard source can project the same values without reinterpreting an admitted model. Standard Resource Roles, Human Performer, Potential Owner and Rendering stay deferred, because a Resource name does not say whether it denotes a user, group, role or organization and Rendering defines no field identity or type ([authority][utmeta-authority]). The exact lexical rules (alternate prefixes, boundary whitespace, no comma or expression opener) are source admission ([source profile][utmeta-source]).
- Concurrent User Tasks are independent: completing one removes only its own item and metadata, and accepted completions apply in command order; final data is order-independent only for disjoint submitted keys ([PARMETA-SIBLING-01, PARMETA-DATA-01][parmeta-rules], [public contract][parmeta-contract]).

### Receive Tasks

- A Receive Task waits for its Message and completes when that Message arrives (§10.3.3, Table 10.10, §13.3.3) ([normative basis][recv-norm], [contract][recv-contract]). Its activation opens exactly one Message subscription for the occurrence on the channel of its `messageRef`, the Message's identifier, with no synthesized Interface or Operation ([RECV-ADDRESS-01, RECV-WAIT-01][recv-rules]). A delivery naming that occurrence on that channel completes it once; it publishes as one `message` active wait, one open subscription and one `deliverMessage` interaction ([RECV-COMPLETE-01, RECV-OBSERVE-01][recv-rules]).
- The Message's name is a source fact; the channel identity is the Message identifier ([profile identity][recv-profile], [source profile][recv-source]). An omitted `implementation` means `##WebService` (XSD default); the kernel records that meaning and realizes no Web-service transport ([normative basis][recv-norm]).
- A Receive Task's delivery carries no payload: a delivery with one is `rejected` (`unexpected-message-payload`), a delivery on another channel too (`message-channel-mismatch`) ([exclusions][recv-excl]). Correlated and payload-bearing Receive Tasks are PC-HUM-03.
- Without `messageRef` the associated Message is unspecified, a gap BPMN leaves open. Following [CIB-INT-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0004--a-receive-task-without-a-message-waits-for-an-occurrence-addressed-trigger), the Task waits for an occurrence-addressed trigger on the unspecified channel (`messageId = none`); an unspecified delivery addresses only such a wait, a direct wait refuses it, and the trigger carries no variables ([normative basis][arecv-norm], [ARECV-WAIT-01, ARECV-RESUME-01, ARECV-REFUSE-01][arecv-rules]). The unspecified channel exists only at the Receive Task, its wait and the delivery; every other channel position refuses it ([ARECV-ADDRESS-02][arecv-rules], [public contract][arecv-contract], [admission][arecv-admission]).

### Service Tasks and effects

- A Service Task's activation invokes its service and its successful completion completes the Task (§10.3.3.1, Table 10.8, §13.3.3); `implementation` names the technology, not the business effect ([normative basis][effect-norm]).
- Each occurrence opens one effect item whose descriptor `(protocol, operation)` and arguments, the evaluated inputs, are committed when it opens and depend only on definition data and committed state; only the effect's result closes it ([EFFECT-WAIT-01, EFFECT-INTENT-01, EFFECT-RESULT-01][effect-rules], [required scope][effect-required]).
- The source binding (an `implementation` and `camunda:delegateExpression` pair, or a content-bound source overlay entry) maps to the neutral descriptor; a delegate token `${identifier}` binds the operation of the same name. No Camunda name, bean, Java class, CIB job or retry count enters the IL or state, and an unknown operation fails explicitly, never falling back to another handler ([source profile][effect-source], [public contract][sbt-contract]). An unbound Service Task is refused (`work.service.unboundImplementation`).
- An effect offers no user interaction; host attempts, retry counts, CIB incidents, job identities, Activity identities and transport keys never appear in observation ([EFFECT-OBSERVE-01][effect-rules]).
- The host derives the transport idempotency key from definition identity, the occurrence and the descriptor, never from attempt, Activity or Run identity; transport retry and its exhaustion are host outcomes, never BPMN outcomes ([runtime contract][effect-runtime], [approved decisions][effect-approved], [excluded scope][effect-excluded]). The kernel supplies only the identity and descriptor.
- Live occurrences of one Service Task, on concurrent tokens or in distinct scope occurrences, are distinct effects. A scope occurrence that holds an open effect is not idle (§13.3.4: a running Service Task is active), and committing one result changes only its own occurrence ([CSE-ARM-01, CSE-QUIESCE-01, CSE-ISOLATE-01, CSE-REFUSE-01][cse-rules], [normative basis][cse-norm], [public contract][cse-contract]).
- A result's success patch is the effect's OutputSet ([data](data.md#activity-data)). A business failure leaves the Activity `raised` and raises a BPMN Error with the occurrence as host ([propagation](propagation.md)); it writes outputs only when the profile maps them on the error path (`ProfileOptions.errorPathOutputs`). A technical failure has no BPMN meaning (§13.3.3 defines only a fault): it is `unsupported` (`effect-technical-failure`) unless the profile selects incidents.
- A continuation that an effect result reaches and that cannot go on rolls back, unless the profile selects `ContinuationFailure.incident`, which turns the result into a technical failure ([`Step.effectContinuation`](../../../Kernel/Step.lean)).

### Incidents

- Under `TechnicalFailure.incident`, a technical failure turns the open effect into an incident with the same identity, attachments, descriptor and arguments; the instance keeps running and the incident's scope occurrence is not idle ([INCIDENT-REPORT-01][incident-rules]). A retry restores the same effect occurrence without a new activation ([INCIDENT-RETRY-01][incident-rules]). One incident per effect occurrence is selected: a second technical failure after the retry is outside the profile (`repeated-effect-incident`) ([required functionality][incident-scope]).
- An incident never enters a BPMN Error route and a business result never creates an incident ([INCIDENT-SEPARATE-01][incident-rules]). The incident publishes as an open incident with a `retryIncident` interaction and no host cause, attempt or retry budget ([INCIDENT-OBSERVE-01][incident-rules]). A later BPMN fault account adds its own route without reinterpreting this one ([authority][incident-authority]).
- `cancelIncidentProcess` is an extra-model CIB operator command, not BPMN termination or cancellation (§10.5.1). It exists only for an incident of the root process instance, under a profile that selects it, and ends the instance `cancelled`, keeping its Process variables. It uses only the generic subtree removal, which a later standard cancellation must precede with its own compensation or rollback ([authority][icancel-authority], [public contract][icancel-contract]). A wrong root or incident, a duplicate and a command on a non-running instance are `rejected`; removing the incident while its instance keeps running is no transition ([ICANCEL-REFUSE-01][icancel-refuse]).

### Send Tasks

- A Send Task sends a Message populated from its Data Input and completes; `implementation` selects the technology (§10.3.3, Table 10.9, §13.3.3) ([normative basis][send-norm]). CIB reads no `messageRef`, `operationRef` or `implementation` and runs a Send Task with a delegate as a Service Task; under [CIB-EXT-0023](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0023--send-task-performed-by-a-configured-handler) the send is the configured handler's effect, its Message data are the handler's inputs, no Message is constructed and no Message Flow is read ([normative basis][send-norm], [SEND-EFFECT-01][send-rules]).
- Such a Send Task runs as an effect published exactly as a Service Task's ([public contract][send-contract]). It assigns no output (§13.3.3), so its result patch is empty ([SEND-DATA-01][send-rules]).
- A Send Task without a configured implementation is `send` work, refused until the Message-addressed send of PC-AUTO-04 ([admission][send-admission], [SEND-REFUSE-01][send-rules]).

### Script and Business Rule Tasks

- Script and Business Rule work is refused (`work.script`, `work.rule`). The owner decisions in the [proposal](../../LEAN-KERNEL-REWRITE-PROPOSAL.md#owner-decisions-on-the-path) direct PC-AUTO-05/06 (JavaScript in the TypeScript host's `vm`, result recorded like an effect result) and PC-AUTO-07/08 (DMN decision tables evaluated in the kernel). A Business Rule Task with a delegate implementation runs as `service` work.

### Call Activities

- Each Call activation starts its own instance of the called Process, which has the instantiation and completion semantics of a Sub-Process; the Call continues only when that instance completes normally, with no token left and nothing active (§10.3.6, §13.3.4) ([scope][call-scope], [normative basis][call-norm], [normative basis][calln-norm], [normative basis][cmcall-norm]). The called Process starts at its none Start Event; its non-empty starts are not used when it is called (§13.3.4) ([normative basis][call-norm]).
- The called element resolves to exactly one Process the program carries, never the root process and never through a deployment, version, tenant, import or local-name fallback ([CALL-RESOLVE-01][call-rules], [QName resolution][call-qname]). The kernel admits only a literal called element (`work.call.calledElementExpression`, `work.call.rootProcess`, `work.call.calledProcessMissing`) bound at program assembly to the latest version it carries; the binding is recorded per called instance and never re-resolved.
- Invocation consumes the token and creates one called root scope occurrence holding only the Call's input values, so the caller's variables are invisible inside it, and begins the called none Start ([CALL-INVOKE-01][call-rules], [CALLN-INVOKE-01][calln-rules]).
- Return happens only for the exact called instance once its root is idle, continues exactly that Call's occurrence once, whatever the completion order, and leaves every other called instance unchanged, including another of the same definition. A live nested call keeps its outer called root from being idle ([CALL-RETURN-01][call-rules], [CALLN-RETURN-01, CALLN-NEST-01, CALLN-OUTSIDE-01][calln-rules], [CMCALL-OWN-01, CMCALL-ISOLATE-01][cmcall-rules]).
- A called instance's identity is derived from the caller instance, the Call element and its activation, each part length-prefixed so nested identities never collide; it is distinct from the caller's and from every host identity ([CALL-IDENTITY-01][call-rules], [public identity][calln-contract], [`State.calledInstanceId`](../../../Kernel/State.lean)). Its tasks are addressed under that identity; an open called task publishes under the called identity and the caller's next task appears only after return ([CALL-OBSERVE-01][call-rules]).
- A completion addressed with the caller's identity, to a sibling called instance, or to a returned instance is `rejected` ([CALL-REFUSE-01][call-rules], [CALLN-REFUSE-01][calln-rules], [CMCALL-REFUSE-01][cmcall-rules]).
- Standard data across the Call boundary: the Call's Data Inputs and Outputs correspond to the called Process's (§10.3.6, §10.4.1 "Call Activity Mapping") without an association between them; their identifiers stay distinct. A task-owned output association may target its containing Process's DataOutput, the reading of §10.4.1's inconsistent "Data Output" wording that the selected interpretation follows; no association crosses a Process boundary ([normative basis][cdb-norm], [data flow][cdb-flow]). The kernel reads exactly one input and one output Data Association, never mixed with CIB variable mappings (`work.call.dataCorrespondence`). Canonical instance identity and variables stay the caller's and called interface storage is private ([data flow][cdb-flow]). No CIB relation is selected for standard Call data ([compatibility boundary][cdb-closure]).
- CIB variable mappings across a Call (`camunda:in`, `camunda:out`) are the [data semantics](data.md#call-variable-mappings).

### Superseded first-profile restrictions

The deleted implementation admitted each work kind only in exact first-profile topologies and placements, and refused shapes its scheduler could not order: one Receive Task or Service Task between a none Start and End, single-group single-field metadata, User Tasks only in two balanced branches, pass-through Tasks off forks, Service Tasks beside Calls, at most two Calls, the static concurrency rules `CALLN-ONCE-01` and `CALLN-SHARED-01`, and burst counts against a closure limit of eight ([ARECV scope][arecv-scope], [RECV source][recv-source], [RECV admission][recv-admission], [UTMETA scope][utmeta-scope], [PARMETA model][parmeta-model], [PARMETA scope][parmeta-scope], [PTT scope][ptt-scope], [PTT admission][ptt-admission], [CSE scope][cse-scope], [CSE admission][cse-admission], [CALLN scope][calln-scope], [CALLN admission][calln-admission], [CMCALL scope][cmcall-scope], [CMCALL admission][cmcall-admission], [CMCALL contract][cmcall-contract], [Call surface][call-surface], [Call owner decision][call-owner], [Call data scope][cdb-scope], [configured Task scope][ctask-scope], [effect excluded scope][effect-excluded], [incident scope][incident-scope], [cancellation scope][icancel-scope], [Send scope][send-scope], [interaction exclusions][uti-excl]). They bind nothing in the kernel: it orders every closure through one signal queue and admits every shape the codes below do not refuse. The construct exclusions they also list (business keys, version and tenant binding, `variables="all"`, called Event Sub-Processes, Script, Rule and unbound Send work, User Task fields outside candidate groups and form fields) stay refused by those codes.

## CIB relations

| Register entry | Role in the kernel |
|---|---|
| [CIB-AGR-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0001--sequential-process-and-user-task-lifecycle) | agreement: User Task lifecycle |
| [CIB-AGR-0002](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0002--active-user-task-discovery-and-basic-completion) | agreement: open User Task discovery and completion |
| [CIB-AGR-0009](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0009--message-addressed-receive-task-subscription-lifecycle) | agreement: Message-addressed Receive Task wait |
| [CIB-AGR-0020](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0020--a-user-service-or-send-task-starts-one-occurrence-per-arriving-token) | agreement: one occurrence per arriving token |
| [CIB-AGR-0023](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0023--a-user-service-or-send-tasks-completion-takes-every-unconditioned-outgoing-flow-in-its-one-step) | agreement: completion takes every unconditioned outgoing flow in one step |
| [CIB-INT-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0004--a-receive-task-without-a-message-waits-for-an-occurrence-addressed-trigger) | interpretation the kernel shares: addressless Receive Task |
| [CIB-EXT-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0001--exact-delegate-expression-service-task-binding) | extension: delegate-expression Service Task binding to the neutral descriptor |
| [CIB-EXT-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0003--exact-deferred-delegate-expression-and-typed-java-bpmn-error) | extension: deferred delegate token and typed business Error result (CIB 2.0.0) |
| [CIB-EXT-0008](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0008---bounded-mapped-boundary-service-task-binding-and-typed-bpmn-error) | extension: typed business Error result of a mapped Service Task (CIB 2.0.0) |
| [CIB-EXT-0011](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0011-one-literal-candidate-group-on-a-user-task) | extension: literal candidate group |
| [CIB-EXT-0012](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0012-one-typed-generated-form-field-on-a-user-task) | extension: typed generated-form field |
| [CIB-EXT-0013](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0013-failed-job-service-task-incident-and-retry) | `TechnicalFailure.incident`: failed-job incident and retry |
| [CIB-EXT-0014](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0014-public-external-deletion-of-one-incident-bearing-root-process) | `incidentProcessCancellation`: deleting an incident-bearing root instance |
| [CIB-EXT-0022](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0022--abstract-and-manual-tasks-as-immediate-pass-through) | extension: Abstract and Manual Task pass-through |
| [CIB-EXT-0023](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0023--send-task-performed-by-a-configured-handler) | extension: Send Task performed by a configured handler |
| [CIB-EXT-0026](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0026--a-continuation-failure-after-an-effect-result-fails-the-job) | `ContinuationFailure.incident` |
| [CIB-EXT-0027](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0027--an-asynchronous-continuation-commits-the-input-at-its-boundary) | `asyncBefore`/`asyncAfter` as transaction boundaries (`async-boundary-failure`) |
| [CIB-OP-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0001--cib-host-task-identity-mapped-to-project-semantic-task-identity) | operational mapping: CIB task identity to the occurrence identity |
| [CIB-OP-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0003--synchronous-caught-error-mapped-to-a-durable-typed-result) | operational mapping: synchronous caught Error to a typed effect result |
| [CIB-OP-0007](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0007---synchronous-mapped-boundary-error-mapped-to-a-durable-typed-result) | operational mapping: mapped boundary Error to a typed effect result |
| [CIB-OP-0008](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0008-cib-failed-job-incident-mapped-to-a-semantic-effect-incident) | operational mapping: failed-job incident to the effect's incident |
| [CIB-OP-0009](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0009-incident-scoped-external-termination-mapped-to-semantic-root-cancellation) | operational mapping: external deletion to root cancellation |
| [CIB-OP-0010](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0010-concurrent-async-before-service-task-continuations-mapped-to-concurrent-effect-occurrences) | operational mapping: per-token continuation jobs to concurrent effects |
| [CIB-OP-0011](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0011-cib-execution-waiting-at-an-addressless-receive-task-mapped-to-the-project-occurrence) | operational mapping: addressless Receive execution to its occurrence |
| [CIB-OP-0012](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0012--a-cib-generated-called-instance-identifier-mapped-to-the-projects-derived-call-identity) | operational mapping: CIB called instance identifier to the derived `call:` identity |
| [CIB-CFG-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0001--pinned-milestone-0-oracle-environment) | oracle environment for User Task lifecycle evidence |
| [CIB-CFG-0002](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0002--explicit-release-of-the-service-task-continuation-job) | oracle environment: explicit release of the Service Task continuation job |
| [CIB-CFG-0007](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0007---pinned-mapped-boundary-error-cib-seven-200-environment) | oracle environment for the mapped boundary Error (CIB 2.0.0) |
| [CIB-CFG-0008](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0008---explicit-failed-job-incident-creation) | oracle environment for failed-job incidents |

## Restrictions

| Refusal code | Refused | Reason or owning row |
|---|---|---|
| `work.user.assignee`, `work.user.candidateUsers`, `work.user.formKey`, `work.user.dueDate`, `work.user.followUpDate`, `work.user.priority`, `work.user.candidateGroupExpression` | User Task fields beyond literal candidate groups and form fields | PC-HUM-02; expression-valued fields wait for the M3 JUEL level |
| `work.receive.correlation`, `work.receive.messageExpression` | correlated Receive Task, Message named by an expression | PC-HUM-03 |
| `work.service.unboundImplementation` | Service work without protocol and operation | no handler to invoke |
| `work.send` | Send Task without a configured implementation | PC-AUTO-04 |
| `work.script` | Script Task | PC-AUTO-05, PC-AUTO-06 |
| `work.rule` | Business Rule Task without a delegate | PC-AUTO-07, PC-AUTO-08 |
| `work.call.calledElementExpression`, `work.call.rootProcess`, `work.call.calledProcessMissing` | called element not a literal carried Process other than the root | PC-SCOPE-03 for dynamic and deployed binding |
| `work.call.binding`, `work.call.businessKey`, `work.call.tenant`, `process.definition.binding` | version, deployment and tag binding, business key, tenant | PC-SCOPE-03 |
| `work.call.propagateAll` | `variables="all"` in either direction | no reviewed account |
| `work.call.dataCorrespondence` | standard Call data other than one input and one output Data Association | §10.3.6 correspondence the kernel can read |
| `call.calledEventSubProcess` | called Process with an Event Sub-Process | the raise search and `armScope` read the Call's children for a called root |
| `activity.inputMappings`, `activity.outputMappings` | mappings on work other than User and Service Tasks | nothing would carry or submit them |
| `activity.multiInstanceBody` | Multi-Instance on work other than a User Task | [Multi-Instance rows](multi-instance.md) |
| `activity.compensationHandler`, `activity.compensationHandler.input`, `compensation.handlerWork` | compensation on work the pipeline cannot complete | [compensation](compensation.md) |
| `scope.implicitStart` | a Receive Task or Call begun by a Scope's implicit start | no flow to wait on |
| dynamic: `effect-technical-failure` | technical failure without the incident profile | no BPMN meaning (§13.3.3) |
| dynamic: `repeated-effect-incident` | a second incident on one effect occurrence | PC-AUTO-03 |
| dynamic: `called-incident-cancellation` | `cancelIncidentProcess` for an incident inside a called instance | PC-AUTO-03, PC-SCOPE-06 |
| dynamic: `call-input-unavailable`, `call-output-unavailable` | an unavailable Data Association source at a Call | PC-DATA-09 |
| dynamic: `async-boundary-failure` | a failure after an input crossed `asyncBefore`/`asyncAfter` | PC-AUTO-03 |

Rejected commands: `unknown-user-task`, `unknown-effect`, `unknown-incident`, `unknown-occurrence`, `message-channel-mismatch`, `unexpected-message-payload`, `incident-process-cancellation-unavailable`, `error-path-outputs-not-accepted` and the submission codes of the [data semantics](data.md#restrictions).

## Open rows

| Row | Decision owed or not yet implemented |
|---|---|
| PC-HUM-01 | User Task inputs and results across serial, branch, rework, scoped and Multi-Instance compositions |
| PC-HUM-02 | assignee, candidate users, form key, dates, priority; metadata through compositions and delivery |
| PC-HUM-03 | correlated and payload-bearing Receive Tasks in every ownership |
| PC-HUM-05 (M1) | Manual Task in implicit split and merge; `Work.manual` already passes through |
| PC-HUM-06 | addressless Receive in repeated, embedded and Multi-Instance positions |
| PC-AUTO-01 | public named handlers across task and scope bodies |
| PC-AUTO-02 | business failure into the selected Error path without output leakage |
| PC-AUTO-03 | repeated incidents, retry and cancel in scoped and Multi-Instance automation, called-instance incident cancellation |
| PC-AUTO-04 | Message-addressed Send Task with recipient and correlation (`SendWork`) |
| PC-AUTO-05, PC-AUTO-06 | Script binding per the owner decision |
| PC-AUTO-07, PC-AUTO-08 | DMN decision binding per the owner decision |
| PC-SCOPE-03 (M8) | called-definition version, deployment, tag and tenant binding |
| PC-SCOPE-06 (M4) | exceptional Call return and propagated cancellation |

## Sources

[uti-decision]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/USER-TASK-INTERACTION-SPEC.md#semantic-decision
[uti-identity]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/USER-TASK-INTERACTION-SPEC.md#semantic-task-identity
[uti-closure]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/USER-TASK-INTERACTION-SPEC.md#closure-interpretation
[uti-excl]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/USER-TASK-INTERACTION-SPEC.md#explicit-exclusions
[utmeta-authority]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md#authority-and-forward-compatible-boundary
[utmeta-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md#selected-source-profile
[utmeta-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md#stable-semantic-rules
[utmeta-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md#required-optional-and-excluded-functionality
[parmeta-model]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md#exact-admitted-model
[parmeta-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md#public-contract-and-example
[parmeta-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md#stable-rules
[parmeta-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md#required-optional-and-excluded-functionality
[ptt-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-TASK-SPEC.md#normative-basis-and-cib-classification
[ptt-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-TASK-SPEC.md#required-optional-and-excluded-scope
[ptt-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-TASK-SPEC.md#profile-and-public-contract
[ptt-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-TASK-SPEC.md#admission
[ptt-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-TASK-SPEC.md#stable-rules
[ctask-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md#selection-basis
[ctask-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md#normative-basis-and-forward-compatible-boundary
[ctask-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md#cib-relationship
[ctask-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md#selected-account-and-rejected-alternatives
[ctask-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md#exact-source-profile
[ctask-binding]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md#profile-owned-source-binding
[ctask-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md#stable-semantic-rules
[ctask-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md#required-optional-and-excluded-functionality
[recv-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md#contract
[recv-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md#normative-basis
[recv-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md#selected-source-profile
[recv-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md#profile-identity-and-declared-targets
[recv-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md#semantic-process-admission
[recv-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md#stable-semantic-rules
[recv-excl]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md#exclusions-and-re-open-conditions
[arecv-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ADDRESSLESS-RECEIVE-TASK-SPEC.md#normative-basis-and-cib-classification
[arecv-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ADDRESSLESS-RECEIVE-TASK-SPEC.md#required-optional-and-excluded-scope
[arecv-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ADDRESSLESS-RECEIVE-TASK-SPEC.md#profile-and-public-contract
[arecv-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ADDRESSLESS-RECEIVE-TASK-SPEC.md#admission
[arecv-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ADDRESSLESS-RECEIVE-TASK-SPEC.md#stable-rules
[effect-required]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-EFFECT-SPEC.md#required-scope
[effect-excluded]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-EFFECT-SPEC.md#excluded-scope
[effect-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-EFFECT-SPEC.md#normative-basis
[effect-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-EFFECT-SPEC.md#source-profile
[effect-runtime]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-EFFECT-SPEC.md#semantic-runtime-contract
[effect-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-EFFECT-SPEC.md#stable-semantic-rules
[effect-approved]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-EFFECT-SPEC.md#approved-decisions
[sbt-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md#public-contract
[cse-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#normative-basis-and-cib-classification
[cse-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#required-optional-and-excluded-scope
[cse-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#profile-and-public-contract
[cse-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#admission
[cse-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#stable-rules
[incident-authority]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md#authority-and-forward-compatible-boundary
[incident-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md#stable-semantic-rules
[incident-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md#required-optional-and-excluded-functionality
[icancel-authority]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md#authority-and-forward-compatible-boundary
[icancel-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md#public-contract
[icancel-refuse]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md#icancel-refuse-01
[icancel-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md#required-optional-and-excluded-functionality
[send-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEND-TASK-SPEC.md#normative-basis-and-cib-classification
[send-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEND-TASK-SPEC.md#required-optional-and-excluded-scope
[send-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEND-TASK-SPEC.md#profile-and-public-contract
[send-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEND-TASK-SPEC.md#admission
[send-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SEND-TASK-SPEC.md#stable-rules
[call-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-SPEC.md#scope
[call-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-SPEC.md#normative-and-compatibility-basis
[call-qname]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-SPEC.md#exact-source-profile-and-qname-resolution
[call-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-SPEC.md#selected-rules
[call-surface]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-SPEC.md#required-optional-and-excluded-surface
[call-owner]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-SPEC.md#owner-decision
[calln-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#normative-basis-and-cib-classification
[calln-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#required-optional-and-excluded-scope
[calln-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#profile-and-public-contract
[calln-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#admission
[calln-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#stable-rules
[cmcall-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-MAPPED-CALLS-SPEC.md#normative-basis-and-cib-classification
[cmcall-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-MAPPED-CALLS-SPEC.md#required-optional-and-excluded-scope
[cmcall-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-MAPPED-CALLS-SPEC.md#profile-and-public-contract
[cmcall-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-MAPPED-CALLS-SPEC.md#admission
[cmcall-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-MAPPED-CALLS-SPEC.md#stable-rules
[cdb-norm]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md#normative-basis-and-interpretation
[cdb-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md#required-optional-and-excluded-scope
[cdb-flow]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md#public-contract-and-data-flow
[cdb-closure]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md#closure-and-compatibility-boundary
