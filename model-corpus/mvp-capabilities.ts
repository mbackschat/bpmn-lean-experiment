export const BpmnCapabilitySupport = {
  BoundedStandard: "boundedStandard",
  ProjectExtension: "projectExtension",
} as const;

export type BpmnCapabilitySupport =
  typeof BpmnCapabilitySupport[keyof typeof BpmnCapabilitySupport];

export const CibCapabilityEvidenceKind = {
  ExactSelectedProfile: "exactSelectedProfile",
  NotApplicable: "notApplicable",
  NotSelected: "notSelected",
} as const;

export type CibCapabilityEvidence =
  | Readonly<{
    kind: typeof CibCapabilityEvidenceKind.ExactSelectedProfile;
    pipelineCaseId: string;
    version: "2.2.0";
  }>
  | Readonly<{
    kind:
      | typeof CibCapabilityEvidenceKind.NotApplicable
      | typeof CibCapabilityEvidenceKind.NotSelected;
  }>;

export type MvpBpmnCapability = Readonly<{
  id: string;
  family: string;
  element: string;
  support: BpmnCapabilitySupport;
  restriction: string;
  cibEvidence: CibCapabilityEvidence;
}>;

const exactCib = (pipelineCaseId: string): CibCapabilityEvidence => Object.freeze({
  kind: CibCapabilityEvidenceKind.ExactSelectedProfile,
  pipelineCaseId,
  version: "2.2.0",
});

const notSelected = Object.freeze({
  kind: CibCapabilityEvidenceKind.NotSelected,
}) satisfies CibCapabilityEvidence;

const notApplicable = Object.freeze({
  kind: CibCapabilityEvidenceKind.NotApplicable,
}) satisfies CibCapabilityEvidence;

export const mvpBpmnCapabilities = Object.freeze([
  {
    id: "process",
    family: "Process structure",
    element: "Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Executable finite graphs only in registered profiles; this is not general BPMN graph admission. The nested scope-data profile also admits a Process without an embedded Sub-Process, at its root alone or beside a called Process, in every form it admits with one; the embedded completion profile, the only other profile reaching these analyses, still requires a Sub-Process or a Call.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "sequenceFlow",
    family: "Process structure",
    element: "Sequence Flow",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Profile-owned control flow; conditions use only the exact Simple Boolean subset where selected.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "noneStartEvent",
    family: "Start Events",
    element: "None Start Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Ordinary starts only inside the bounded registered Process shapes. Under the nested scope-data profile, a Process root None Start outside every fork region may leave on two or more unconditioned flows, and the start command opens all of them.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "messageStartEvent",
    family: "Start Events",
    element: "Message Start Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One top-level operation-addressed, payload-free start with one target; no fanout or correlation keys.",
    cibEvidence: notSelected,
  },
  {
    id: "timerStartEvent",
    family: "Start Events",
    element: "Timer Start Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One top-level PT1S start from one resolved occurrence; no recurrence or calendar form.",
    cibEvidence: notSelected,
  },
  {
    id: "noneEndEvent",
    family: "End Events",
    element: "None End Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Ordinary completion only inside the bounded registered Process and scope shapes. The nested scope-data profile also admits several incoming flows at the None End of its Process root body when that body routes through Exclusive Gateways and never forks: each arriving token ends there on its own, never waiting for another flow; Ends inside Sub-Process bodies or the called Process keep one incoming flow. Under that profile the root body and Sub-Process bodies may also hold several None Ends reached from Parallel branches; each ends its own branch, and the scope completes only once no branch is live.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "errorEndEvent",
    family: "End Events",
    element: "Error End Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact-code throw inside a directly enclosed Sub-Process with one exact parent handler.",
    cibEvidence: exactCib("subprocess-error-propagation-trigger-first"),
  },
  {
    id: "terminateEndEvent",
    family: "End Events",
    element: "Terminate End Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One nested Terminate End cancels only its containing Sub-Process occurrence before parent continuation.",
    cibEvidence: notSelected,
  },
  {
    id: "cancelEndEvent",
    family: "End Events",
    element: "Cancel End Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "A Cancel End directly inside a Transaction with a Cancel boundary raises Cancel from its scope occurrence: the Transaction's interior is cleared, its completed eligible work compensated, and its normal outflow never fires. A Cancel throw whose direct parent is not a Transaction, or whose Transaction has no Cancel boundary, is refused (throw.cancel.outsideTransaction, throw.cancel.uncaught).",
    cibEvidence: notSelected,
  },
  {
    id: "userTask",
    family: "Activities",
    element: "User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Occurrence-bound wait and completion; string/null normally, with one Boolean and one literal group/form profile. Under the nested scope-data profile, a User Task without data, boundary or Multi-Instance variants may merge several incoming flows in the Process root of a re-entry graph, each arriving token starting a fresh occurrence. With one incoming flow, it may instead leave on two or more unconditioned flows outside every fork region, its completion taking all of them.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "directDataInputUserTask",
    family: "Activities",
    element: "User Task with a direct Data Input",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One required scalar DataInput in one InputSet, filled by one direct Data Input Association from one Process Property, with an empty OutputSet; an absent source is unavailable data and explicit null is available.",
    cibEvidence: notSelected,
  },
  {
    id: "directDataInputOutputUserTask",
    family: "Activities",
    element: "User Task with direct Data Input and Output",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One required String/null input and output per User Task occurrence, using distinct Process Properties or, only within the bounded scalar Call profile, its owning called Process interface. Acyclic serial or paired Exclusive composition admits only supplied or definitely written later inputs. The portable handoff profile instead carries one structured item from a None Start through exactly two serial User Tasks, the second reading the first's output, to a None End through three Process Properties: a String of at most 1,024 UTF-8 bytes, Null, Boolean, an Integer in 0..2^53−1, an exact Decimal with a signed 64-bit coefficient and scale 0..6, or a Map whose fields may nest Lists and Maps, but never a root List, within four container levels, 32 members per container, 256 value nodes and 16,384 canonical bytes. A hosted Start whose successful journey cannot fit the capacity envelope is refused; the browser offers no form editor for these values; Message, effect, Call, Multi-Instance and expression use of them is excluded. Accepted completion atomically writes the declared output and disposes the local input scope.",
    cibEvidence: notSelected,
  },
  {
    id: "directDataOutputUserTask",
    family: "Activities",
    element: "User Task with a direct Data Output",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One required scalar DataOutput in one OutputSet with an empty InputSet, filled by the completion under its exact DataOutput id and written by one direct Data Output Association into one Process Property; entry never waits for data, and a completion that omits the output is refused.",
    cibEvidence: notSelected,
  },
  {
    id: "sequentialMultiInstanceUserTask",
    family: "Activities",
    element: "Sequential Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One generated User Task at a time in item order, over a collection read once on entry or a cardinality; each instance holds its item and submits exactly its output data item. The output collection, in item order and in the input's form, is written atomically only when every slot is filled, and an early completion or an interrupting boundary writes none. No count or byte bound: the Multi-Instance refusal codes are the restrictions, among them a User Task loop without its output data item and an output mapping on the Activity.",
    cibEvidence: notSelected,
  },
  {
    id: "parallelMultiInstanceUserTask",
    family: "Activities",
    element: "Parallel Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Every generated User Task begins on entry, over a collection read once on entry or a cardinality; each instance holds its item and submits exactly its output data item in any completion order, and the completion condition is evaluated after each completion. The output collection, in item order and in the input's form, is written only when every slot is filled; an early completion or an interrupting boundary ends the remaining instances and writes none. No count or byte bound: the Multi-Instance refusal codes are the restrictions.",
    cibEvidence: notSelected,
  },
  // Owned by PC-MI-01–12, PC-TX-03 and PC-AUTO-06; the kernel's admission decides every loop form it describes.
  {
    id: "multiInstanceActivity",
    family: "Activities",
    element: "Multi-Instance Activity",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Sequential and parallel Multi-Instance loops on User, Service, Receive, Script and Call Activities and on embedded Sub-Processes and Transactions, over a collection or a cardinality, with an optional completion condition and nested in any mode. The number of instances is fixed on entry; a sequential collection is read again before each later instance only where the profile follows CIB. Each instance runs in a scope of its own holding its item; the output collection is written only when every instance has filled its slot, and an early completion ends the remaining instances without one. Boundaries belong to the whole Activity. Standard loops, looping Event Sub-Processes and output mappings are refused, and under an order-invariant schedule so is a parallel loop whose instances may meet one another's writes.",
    cibEvidence: notSelected,
  },
  {
    id: "serviceTask",
    family: "Activities",
    element: "Service Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Exact registered bindings only: payload-free effects, bounded scalar mappings, one generation-1 incident account, or overlay-bound named operations with immutable enclosing String/null inputs and complete local results in serial or single-control mixed task graphs. The portable effect-data profile instead admits a serial chain of Service Tasks without Human Tasks whose handler results carry one structured item per output: a String of at most 1,024 UTF-8 bytes, Null, Boolean, Integer, exact Decimal, or a Map whose fields may nest Lists and Maps, but never a root List, within 16,384 canonical bytes. Inputs receive copies, so a handler changes Process data only through its result. A hosted Start is refused when the reserved result of a task or the successful journey cannot fit the capacity envelope; earlier profiles refuse structured results. The embedded completion profile also admits data-free overlay-bound Service Tasks wherever it admits a User Task in nested and concurrent Sub-Process bodies, never in a called body or beside a Call, at most 32 counted once per merge branch like its task bound; their Activities run concurrently with each other and with human work, and in a Program with scope data they may map exact ${name} inputs and outputs resolved along their own Sub-Process occurrence's chain. Under the nested scope-data profile, such a Service Task without a BPMN Error route may merge several incoming flows in the Process root of a re-entry graph, each arriving token starting a fresh occurrence, or, with one incoming flow, leave on two or more unconditioned flows outside every fork region, its completion taking all of them. No general JUEL or Java delegate compatibility.",
    cibEvidence: exactCib("service-task-effect-success"),
  },
  {
    id: "sendTask",
    family: "Activities",
    element: "Send Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Under the nested scope-data profile only: a Send Task performed by a handler the source overlay binds through camunda:delegateExpression, with camunda:asyncBefore and input parameters, wherever that profile admits a mapped Service Task. It executes as that Service Task's effect, whose published arguments carry the send data, such as the recipient and the correlation key, and its handler result must be empty, since no output is admitted on a Send Task. No Message is constructed and no Message Flow, messageRef or operationRef is read; mail, external, class and expression implementations and every other profile are refused. Like that Service Task, it may merge several incoming flows in the Process root of a re-entry graph, or split onto several unconditioned outgoing flows.",
    cibEvidence: notSelected,
  },
  {
    id: "receiveTask",
    family: "Activities",
    element: "Receive Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One direct-Message, payload-free, non-instantiating Receive Task; or, under its own profile, one root Receive Task without a Message that only a delivery naming its published wait occurrence resumes; no buffering or correlation.",
    cibEvidence: exactCib("message-addressed-receive-task"),
  },
  {
    id: "configuredTask",
    family: "Activities",
    element: "Task with BPMN Lean task definition",
    support: BpmnCapabilitySupport.ProjectExtension,
    restriction: "One exact project extension binding to the existing Probe effect; not a general BPMN Task execution claim.",
    cibEvidence: notApplicable,
  },
  {
    id: "abstractTask",
    family: "Activities",
    element: "Abstract Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Under the nested scope-data profile only: a plain Task with only an id and a name, one incoming flow and one unconditioned, non-default outgoing flow, on the serial path of the Process root or a Sub-Process body, on a Choice branch or cycle of a re-entry root graph, or on a Parallel branch of the Process root or a Sub-Process body. Several incoming flows are admitted in the Process root of a re-entry graph, where each arriving token passes the Task once on its own, and several unconditioned outgoing flows wherever a Parallel fork of that arity is admitted, where one activation puts a token on each; never both at once. It passes the token on at once and publishes one occurrence that starts and ends in that step, a fresh one on each re-entry. A Parallel branch that reaches its join may hold only such Tasks, and so may a branch that ends at its own None End, whether or not a Sub-Process of the model declares locals; a Call never follows only such Tasks from its body's Start. A model holding one is admitted only when every automatic burst stays within eight steps. No called Processes, merges under a fork, conditioned or default outgoing flows, asynchronous continuations, mappings, listeners, Multi-Instance or boundary Events.",
    cibEvidence: notSelected,
  },
  {
    id: "manualTask",
    family: "Activities",
    element: "Manual Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Exactly the Abstract Task account: the engine neither distributes nor waits for the manual work, and passes the token on at once with one instantaneous occurrence, as CIB Seven does. The source kind is kept; no assignment, form or completion command exists for it.",
    cibEvidence: notSelected,
  },
  {
    id: "callActivity",
    family: "Activities",
    element: "Call Activity",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One in-document called Process, empty data, normal return, no recursion, deployment resolution, or Child Workflow identity. The embedded completion profile also admits empty-data Calls in Process root bodies, repeated serially, concurrent on Parallel branches and nested to depth three, each called body a serial chain of one to three User Tasks or Calls; one closure invokes a definition at most once, two branches never share a Call-bearing definition, and empty-data Calls inside Sub-Processes and cycles are refused.",
    cibEvidence: notSelected,
  },
  {
    id: "callActivityScalarData",
    family: "Activities",
    element: "Call Activity with scalar data",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One in-document called Process with one String-or-null input and output, isolated interfaces and normal return; no child Properties, repeated or concurrent Calls, recursion or deployment resolution.",
    cibEvidence: notSelected,
  },
  {
    id: "callActivityVariableMappings",
    family: "Activities",
    element: "Call Activity with variable mappings",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Under the nested scope-data profile, up to two Calls of one in-document Process of one to three serial User Tasks, each on the caller's root serial path or on the serial path of an embedded Sub-Process body at depth one or two. Each camunda:in copies a named value, read along the Call's own enclosing Sub-Processes and then the Process, into the called instance at invocation, an absent source becoming a present null; called tasks read and write only their own Call's copied names and never reach caller data. At normal return each camunda:out writes a named called value from the Call's position, so a target that an enclosing Sub-Process declares lands in that Sub-Process's local, a never-set source becoming a present null; a second Call of the same Process gets its own called instance and task activations. Expressions, variables=\"all\", local mappings, business keys, version binding, a third Call, nested Calls, called Service Tasks, Gateways or Sub-Processes, boundary Events, Multi-Instance, cancellation and recursion are excluded; without Parallel branches a hosted Start whose copied values cannot fit the capacity envelope is refused. Both Calls may also sit on concurrent Parallel branches inside a Sub-Process body, never as a branch body's first step, in the forking body itself or beside a Service Task, each copying structured values into and out of its own called instance in either completion order. The embedded completion profile also admits mapped Calls in a model with scope-local data: on concurrent Parallel branches of the root body and, never as a body's first step, on the serial path of a Sub-Process body at depth one or two that is not a merge target; each call reads its inputs and writes its outputs through its own caller occurrence, whatever the completion order, with bounded String or null values. There a fork never leads straight into two Calls of one Process, one Process is never called both with and without mappings, and a model with a Call holds no Service Task. Under the nested scope-data profile a root-body cycle may invoke the same Call again: each invocation gets a fresh called instance holding only its own copied inputs, and a completion addressed to an earlier called instance is rejected unchanged.",
    cibEvidence: notSelected,
  },
  {
    id: "embeddedSubProcess",
    family: "Activities",
    element: "Embedded Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Embedded Sub-Processes in a Process, a called Process or another Sub-Process, at any depth and with any content the kernel admits. Each arrival creates a fresh scope occurrence and re-entry through a cycle a fresh activation whose locals initialize from its inputs; a Sub-Process completes exactly when it owns no token, wait, begun occurrence or child scope, and then continues its parent once; a command addressed to an earlier activation is rejected. A declared local needs an input mapping (scope.localVariableWithoutInput); under scopeStart = required, the cibseven profiles' reading, a Sub-Process without a start Event is refused (scope.withoutStart), and under the standards reading the children it begins implicitly must be Activities or Scopes (scope.implicitStart). Looping and boundary forms are the Multi-Instance and boundary rows'.",
    cibEvidence: exactCib("embedded-subprocess-completion-a-then-b"),
  },
  {
    id: "transaction",
    family: "Activities",
    element: "Transaction Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "A Sub-Process whose caught Cancel clears its running work and compensates its completed eligible work before its Cancel boundary takes control, at any depth and looping too, a looping body's Cancel compensating its own instance. Its method is omitted or ##Compensate, and under the cibseven profiles ##Store and ##Image run as ##Compensate; a protocol URI is refused (scope.transaction.method).",
    cibEvidence: notSelected,
  },
  // Owned by the Event Sub-Process rows PC-ERROR-02, PC-ESCALATION-03, PC-MESSAGE-06/07, PC-SIGNAL-03, PC-TIMER-07,
  // PC-CONDITION-05 and PC-COMPENSATION-01–05; the kernel's admission decides every trigger and placement it describes.
  {
    id: "eventSubProcess",
    family: "Activities",
    element: "Event Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Event Sub-Processes in a Process, a called Process or an embedded Sub-Process, started by an Error, Escalation, Message, Signal, Timer, Conditional or Compensation Start Event. A start is armed while its enclosing scope runs and goes with it; an interrupting start cancels that scope's ordinary work and keeps its data for the handler, and a non-interrupting one starts a further handler beside that work on every trigger. A non-interrupting Error start, a Compensation Event Sub-Process at Process level, a looping Event Sub-Process and a boundary on one are refused, and under the standards reading so is every interrupting Event Sub-Process.",
    cibEvidence: notSelected,
  },
  {
    id: "transactionCancelBoundaryEvent",
    family: "Boundary Events",
    element: "Interrupting Transaction Cancel Boundary Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One interrupting Cancel boundary per Transaction, which takes control only after every compensation handler of the cancellation has completed; a handler failure fails the instance and neither the boundary nor the normal flow continues. A second Cancel boundary, one on anything but a Transaction and a non-interrupting one are refused (boundary.cancel.duplicate, boundary.cancel.host, boundary.cancel.nonInterrupting).",
    cibEvidence: notSelected,
  },
  {
    id: "compensationBoundaryEvent",
    family: "Compensation",
    element: "Compensation Boundary Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "A Compensation boundary on an Activity or Sub-Process, associated with one handler marked isForCompensation and without Sequence Flow. Only successfully completed work is retained, in the scope occurrence it completed in, and the handler restores no context. A second handler of one subject, a handler not marked isForCompensation and a handler with Sequence Flow are refused (compensation.handlerCount, compensation.handlerNotForCompensation, compensation.handlerFlow).",
    cibEvidence: notSelected,
  },
  {
    id: "compensationIntermediateThrowEvent",
    family: "Compensation",
    element: "Compensation Intermediate Throw Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "A Compensation throw at any level: without activityRef it compensates every eligible record retained in its own scope occurrence, with one only that Activity's, which must be visible from it; the thrower continues once every handler has completed, handlers running in reverse dependency order. An asynchronous throw and an activityRef naming no visible Activity are refused (throw.compensation.asynchronous, throw.compensation.activityLevel, throw.compensation.notActivity).",
    cibEvidence: notSelected,
  },
  {
    id: "compensationEventSubProcess",
    family: "Compensation",
    element: "Compensation Event Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "A Compensation Event Sub-Process inside a Sub-Process, run when that completed Sub-Process is compensated, with any handler body the kernel admits; it restores its parent's variables as they were when the parent completed. One at Process level and a second handler of one subject are refused (compensation.processEventSubProcess, CIB-LIM-0044; compensation.handlerCount).",
    cibEvidence: notSelected,
  },
  {
    id: "compensationHandlerServiceTask",
    family: "Compensation",
    element: "Compensation handler Service Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "A Service Task that is a compensation handler, marked isForCompensation or in a Compensation Event Sub-Process body. It begins in a context scope occurrence of its own, its effect stays asynchronous where CIB runs it inside the triggering command (CIB-LIM-0042), and an Error it leaves uncaught fails the instance or, under the cibseven profiles, propagates from the scope the trigger ran in.",
    cibEvidence: notSelected,
  },
  {
    id: "exclusiveGateway",
    family: "Gateways",
    element: "Exclusive Gateway",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Simple Boolean v1 only: exact two-condition splits and bounded cycle merge, acyclic paired two-condition/default regions with scalar Human Task handoff, or single-control mixed task graphs with ordered conditions, required default, pass-through merges and task-separated cycles. Admitted resumptions close within eight automatic steps; cyclic termination is not guaranteed. The embedded completion profile also admits an identity-only converging merge of one Parallel fork's task branches into an embedded Sub-Process, which passes each arriving token on its own. The nested scope-data profile admits Choices with one or more conditions and a default, tested in declaration order, and pass-through merges in the Process root body only, where a cycle may re-enter an earlier Sub-Process or Call when a User or Service Task outside the called Process separates it, never in a model that also forks. There a Choice may also omit its default when it has two or more conditional flows; when every condition is false, the Start or User Task completion whose closure reached it rolls back, leaving no instance or the task open, and a Choice that a Service or Send Task's result could reach in the same command is refused.",
    cibEvidence: notSelected,
  },
  {
    id: "parallelGateway",
    family: "Gateways",
    element: "Parallel Gateway",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Balanced two-branch fork/join in its registered profiles; the subscription profile additionally admits acyclic divergent fork forests within its complete-burst bound. The bounded Transaction profile uses one two-way split into one-or-two-Task branches ending at Cancel and None respectively. The embedded completion profile admits paired forks and joins of two or more branches inside Sub-Process bodies, and in a child body only terminal unjoined forks to separate None Ends, or a fork whose task branches all end at one Exclusive merge into a Sub-Process; those branches may hold data-free Service Tasks whose Activities run concurrently. The nested scope-data profile admits the same paired forks and joins inside Sub-Process bodies and in the Process root body, never into a merge, with structured data on their branches; a model whose root body forks holds no Call in it. There a fork's branches may also end unjoined at their own None Ends, in the root body or a Sub-Process body, and a scope completes only when its last branch has ended; such a branch may reach its End without a User or Service Task whether or not a Sub-Process of the model declares locals.",
    cibEvidence: exactCib("parallel-fork-join-a-then-b"),
  },
  {
    id: "inclusiveGateway",
    family: "Gateways",
    element: "Inclusive Gateway",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Two Simple Boolean conditions plus default, direct User Task branches, and the paired selected-subset join. The nested scope-data profile admits paired Inclusive regions of two or more branches in the Process root body only, each output with one Simple Boolean v1 condition or none, an absent condition always taken, and a default only on a split whose outputs are all conditioned; every true branch runs, the default only when none is, and the join waits for every selected branch. Branches hold the root body content a Parallel fork admits, nested Parallel regions included, and each reaches a User Task, Service Task or Sub-Process first. An Inclusive Gateway in a Sub-Process or called body, on a branch of another Inclusive region or beside one on a sibling branch of a fork, beside a Choice, a cycle or a Call Activity, or in a pass-through, unpaired or unstructured region is refused.",
    cibEvidence: notSelected,
  },
  {
    id: "eventBasedGateway",
    family: "Gateways",
    element: "Event-Based Gateway",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One non-instantiating race between an operation-addressed Message catch and an exact PT1S Timer catch.",
    cibEvidence: notSelected,
  },
  {
    id: "intermediateCatchMessageEvent",
    family: "Intermediate Catch Events",
    element: "Message Intermediate Catch Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One operation-addressed, payload-free subscription; no Message Flow, key, buffering, or global correlation.",
    cibEvidence: notSelected,
  },
  {
    id: "messagePayloadCatchEvent",
    family: "Intermediate Catch Events",
    element: "Message Intermediate Catch Event with a direct Data Output",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One operation-addressed subscription with one required scalar DataOutput in one OutputSet and one direct Data Output Association into a Process Property; String and explicit null payloads are written, while an absent payload is refused and leaves the subscription live. The portable Message-payload profile instead admits one structured item: a String of at most 1,024 UTF-8 bytes, Null, Boolean, Integer, exact Decimal, or a Map whose fields may nest Lists and Maps, but never a root List, within 16,384 canonical bytes, and writes a copy of it to the Property. Process Start and User Task completion carry no values there, a hosted Start is refused when the reserved payload delivery cannot fit the capacity envelope, and the browser offers no delivery form for these values; earlier profiles refuse structured payloads.",
    cibEvidence: notSelected,
  },
  {
    id: "messageKeyCorrelation",
    family: "Message correlation",
    element: "Definition-scoped Message key correlation",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One complete definition-scoped address and one non-empty String key derived from the incoming payload and a Process Property; a publication advances exactly one matching Process instance and preserves every instance on zero or ambiguous matches.",
    cibEvidence: notSelected,
  },
  {
    id: "intermediateCatchTimerEvent",
    family: "Intermediate Catch Events",
    element: "Timer Intermediate Catch Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "ISO 8601 durations, extended dates with an explicit zone, and undated or Cron cycles over UTC, as `Kernel.Timer.classify` admits (the Timers account of the subscriptions semantics specification); other forms are refused.",
    cibEvidence: exactCib("intermediate-catch-timer-pt1s"),
  },
  {
    id: "noneIntermediateThrowEvent",
    family: "Intermediate Throw Events",
    element: "None Intermediate Throw Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Under the nested scope-data profile only: an Intermediate Throw Event without an EventDefinition, with only an id and a name, wherever that profile admits a pass-through Abstract Task, with the same incoming and outgoing flows. It passes the token on at once and publishes one occurrence that starts and ends in that step, a fresh one on each re-entry; with several outgoing flows that one activation puts a token on each. No Event that both merges and splits, asynchronous continuations, listeners, called Processes, Multi-Instance bodies or throw triggers.",
    cibEvidence: notSelected,
  },
  {
    id: "linkIntermediateEventPair",
    family: "Intermediate Throw Events",
    element: "Link Intermediate Throw and Catch Event pair",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Under the nested scope-data profile only: one throw and one catch of each Link name in one scope of the executed Process, the throw with one incoming flow and the catch with one unconditioned outgoing flow. The pair behaves exactly as the Sequence Flow it replaces and publishes no occurrence or wait. Several throws of one name are admitted only where their catch leads to a merging User, Service or Send Task in the Process root. No other several throws of one name, chains, source or target references, asynchronous continuations, listeners, called Processes or Multi-Instance bodies.",
    cibEvidence: notSelected,
  },
  {
    id: "timerBoundaryEvent",
    family: "Boundary Events",
    element: "Timer Boundary Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "A Timer boundary on any Activity or Sub-Process host, interrupting or not, in any duration, date or cycle form the kernel admits; the rows below state the outcomes of particular hosts. The Timer refusal codes are its restrictions (timer.duration, timer.date, timer.cycle, timer.cron), and a boundary on an Event Sub-Process is refused (scope.eventSubProcess.boundary).",
    cibEvidence: notSelected,
  },
  {
    id: "messageBoundaryEvent",
    family: "Boundary Events",
    element: "Message Boundary Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "A Message boundary on any Activity or Sub-Process host, interrupting or not, addressed by its Message's name; the rows below state the User Task's outcomes. An unnamed Message and two subscriptions of one name in one CIB event scope are refused (message.unnamed, message.duplicateName).",
    cibEvidence: notSelected,
  },
  {
    id: "errorBoundaryEvent",
    family: "Boundary Events",
    element: "Error Boundary Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "An Error boundary on any Activity or Sub-Process host, catching an Error raised inside its host by exact code before a catch-all one; the rows below state particular hosts. An Error always interrupts, so a non-interrupting one is refused (boundary.error.nonInterrupting).",
    cibEvidence: exactCib("mapped-boundary-error-service-task-caught"),
  },
  {
    id: "interruptingUserTaskBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S deadline that withdraws its attached User Task.",
    cibEvidence: notSelected,
  },
  {
    id: "interruptingUserTaskBoundaryMessageEvent",
    family: "Boundary Events",
    element: "Interrupting Message Boundary Event on User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One operation-addressed, payload-free withdrawal Message withdraws the active User Task; exact task completion withdraws the subscription, and either stale loser is refused.",
    cibEvidence: notSelected,
  },
  {
    id: "interruptingSequentialMultiInstanceBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on sequential Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "An interrupting Timer on the whole sequential Multi-Instance User Task, in any Timer form the kernel admits: one deadline for the Activity, kept through task turnover rather than one per instance. Firing cancels the active instance, generates no further item, writes no output collection and follows only the boundary flow.",
    cibEvidence: notSelected,
  },
  {
    id: "interruptingParallelMultiInstanceBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on parallel Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "An interrupting Timer on the whole parallel Multi-Instance User Task, in any Timer form the kernel admits: one deadline for the Activity, kept across concurrent progress rather than one per instance. Firing cancels every remaining instance, writes no output collection and follows only the boundary flow.",
    cibEvidence: notSelected,
  },
  {
    id: "nonInterruptingUserTaskBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Non-interrupting Timer Boundary Event on User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S firing that preserves the host and spawns one handler branch.",
    cibEvidence: notSelected,
  },
  {
    id: "nonInterruptingUserTaskBoundaryMessageEvent",
    family: "Boundary Events",
    element: "Non-interrupting Message Boundary Event on User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One payload-free operation-addressed boundary preserves its User Task and subscription across repeated deliveries, with overlapping handler occurrences; host completion withdraws future triggers, while containing-scope cancellation removes owned work.",
    cibEvidence: notSelected,
  },
  {
    id: "recurringUserTaskBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Recurring non-interrupting Timer Boundary Event on User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Exact R/PT1S cycle with fresh Timer identity and one logical-second deadline increment per firing; one Timer and one boundary per definition, passive handlers, and completion-first ordering within one host activation batch.",
    cibEvidence: notSelected,
  },
  {
    id: "recurringSubProcessBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Recurring non-interrupting Timer Boundary Event on Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Exact R/PT1S cycle on the sole depth-one embedded Sub-Process; repeated handlers remain in the parent, body completion withdraws future triggers, and inner Terminate preserves outside work.",
    cibEvidence: notSelected,
  },
  {
    id: "nonInterruptingSubProcessBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Non-interrupting Timer Boundary Event on Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S firing on the sole depth-one embedded Sub-Process; its handler survives ordinary body completion, and containing-region cancellation follows exact ownership.",
    cibEvidence: notSelected,
  },
  {
    id: "interruptingSubProcessBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S deadline on a depth-one Sub-Process; the subscription profile also permits bounded passive fork forests and independent outside work.",
    cibEvidence: notSelected,
  },
  {
    id: "serviceTaskBoundaryErrorEvent",
    family: "Boundary Events",
    element: "Error Boundary Event on Service Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "The legacy mapped Service Task binding or single-control mixed task graphs with at most one interrupting exact-code Error boundary per Service Task. Match only the active occurrence's attached route, require complete String/null local results on success and Error, and clean its exact owner atomically. No catch-all, ancestor propagation or technical-failure conversion.",
    cibEvidence: exactCib("mapped-boundary-error-service-task-caught"),
  },
  {
    id: "subProcessBoundaryErrorEvent",
    family: "Boundary Events",
    element: "Error Boundary Event on Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact-code handler attached to the directly enclosing Sub-Process; no ancestor or catch-all search.",
    cibEvidence: exactCib("subprocess-error-propagation-trigger-first"),
  },
] satisfies ReadonlyArray<MvpBpmnCapability>);

export type MvpBpmnCapabilityId =
  typeof mvpBpmnCapabilities[number]["id"];

export const mvpCapabilityCatalog = Object.freeze({
  standard: Object.freeze({
    name: "BPMN",
    version: "2.0.2",
    target: "Process Execution Conformance",
  }),
  compatibilityBaseline: Object.freeze({
    product: "CIB Seven",
    version: "2.2.0",
  }),
  capabilities: mvpBpmnCapabilities,
});

/**
 * A restriction the kernel states by refusing a model: the stable refusal code, what the code refuses, and where its
 * reason is recorded, as a semantics document name under `docs/kernel/semantics/` or a register entry ID, joined by `;`.
 * The text is the cited restriction table's cell or register entry, shortened.
 *
 * A source the kernel admits claims capabilities; a source it refuses claims the restriction its code names. The
 * corpus guard (`scripts/executable-model-corpus.ts`) requires a row for every refusal code a claiming witness exhibits
 * and refuses a row whose code no retained scenario exhibits. The About page does not read these rows yet.
 */
export type MvpBpmnRestriction = Readonly<{
  refusalCode: string;
  restriction: string;
  basis: string;
}>;

const refusal = (refusalCode: string, restriction: string, basis: string): MvpBpmnRestriction =>
  Object.freeze({ refusalCode, restriction, basis });

export const mvpBpmnRestrictions: ReadonlyArray<MvpBpmnRestriction> = Object.freeze([
  refusal("boundary.cancel.duplicate", "A second Cancel boundary on one Transaction.", "COMPENSATION-SEMANTICS-SPEC"),
  refusal("boundary.cancel.host", "A Cancel boundary on an element that is not a Transaction (§10.5.5, §10.3.5).", "COMPENSATION-SEMANTICS-SPEC"),
  refusal("boundary.cancel.nonInterrupting", "A non-interrupting Cancel boundary (§10.5.5, §10.3.5).", "COMPENSATION-SEMANTICS-SPEC"),
  refusal("boundary.error.nonInterrupting", "A non-interrupting Error boundary: an Error always interrupts (Tables 10.86 and 10.87, §13.5.4).", "PROPAGATION-SEMANTICS-SPEC; CIB-LIM-0018"),
  refusal("boundary.escalation.duplicate", "Two Escalation boundaries of one host declaring one code: §10.5.6 allows one handler per Event Declaration.", "PROPAGATION-SEMANTICS-SPEC; CIB-LIM-0021"),
  refusal("boundary.escalation.host", "An Escalation boundary on a host other than a User Task, a Call Activity, a Sub-Process or a Transaction: pinned CIB refuses the deployment (BpmnParse.java:3335-3342) although §10.5.6 restricts no host.", "PROPAGATION-SEMANTICS-SPEC"),
  refusal("compensation.handlerCount", "More than one compensation handler of one Activity or Scope: two Compensation boundaries, two Compensation Event Sub-Processes, or one of each.", "COMPENSATION-SEMANTICS-SPEC; CIB-LIM-0044"),
  refusal("compensation.handlerFlow", "A compensation handler marked isForCompensation that has a Sequence Flow (§10.7.1, Table 10.3).", "COMPENSATION-SEMANTICS-SPEC"),
  refusal("compensation.handlerNotForCompensation", "An element a compensation Association names that is not marked isForCompensation (§10.7.1, Table 10.3): CIB reads a handler from the mark alone.", "COMPENSATION-SEMANTICS-SPEC"),
  refusal("compensation.implicit", "A compensable Activity whose records a completed Sub-Process would hand to its parent beside a Compensation throw or a Transaction's Cancel End, unless implicitCompensation = everySubProcess keeps them as the Sub-Process's group.", "COMPENSATION-SEMANTICS-SPEC; CIB-INT-0036"),
  refusal("compensation.processEventSubProcess", "A Compensation Event Sub-Process at Process level.", "COMPENSATION-SEMANTICS-SPEC; CIB-LIM-0044"),
  refusal("event.multipleDefinitions", "An Event with several event definitions, a Multiple Event (§10.5.1): pinned CIB keeps one, chosen by a precedence that depends on the position, and erases the rest.", "FLOW-SEMANTICS-SPEC; CIB-LIM-0008"),
  refusal("event.parallelMultiple", "A Parallel Multiple Event (parallelMultiple=\"true\", §10.5.1), which pinned CIB never reads.", "FLOW-SEMANTICS-SPEC; CIB-LIM-0008"),
  refusal("expression.juel.computedMethod", "A JUEL method call on a bracket target: only the closed list of methods is admitted.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("expression.juel.division", "The JUEL operators / and div: over Integers the result is a Double, outside the portable domain.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("expression.juel.engineContext", "A JUEL identifier execution, task, caseExecution, externalTask or authenticatedUserId, ${execution} included: CIB resolves them before any variable (VariableScopeElResolver.java:51-90), and the kernel has no task bean.", "EXPRESSION-SEMANTICS-SPEC; CIB-LIM-0012"),
  refusal("expression.juel.floatLiteral", "A floating literal in a JUEL text: a Double is outside the portable domain.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("expression.juel.function", "Any JUEL function call; CIB registers currentUser, currentUserGroups, now and dateTime.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("expression.juel.method", "A JUEL method call of an unlisted name or argument count, mutating methods included: only the closed list of methods is admitted.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("expression.juel.multiInstanceCounter", "A Multi-Instance counter name (loopCounter, nrOfInstances, nrOfActiveInstances, nrOfCompletedInstances) in a JUEL text: refused at every site unless the profile selects cibLocals, and under cibLocals still outside every instance and in a loop's own count expressions.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("expression.juel.syntax", "JUEL text the reader cannot parse at the pinned grammar: CIB refuses the deployment too.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("flow.condition.foreign", "A Sequence Flow condition outside the profile's evaluator: a profile selects one evaluator, Simple Boolean or the JUEL core level.", "FLOW-SEMANTICS-SPEC"),
  refusal("gateway.eventBased.instantiate", "An instantiating Exclusive or a Parallel Event-Based Gateway (§10.6.6), which pinned CIB never reads.", "FLOW-SEMANTICS-SPEC; CIB-LIM-0008"),
  refusal("gateway.eventBased.linkArm", "An Event-Based Gateway arm that is a catching Link: §10.6.6 lists Link among the invalid triggers, and CIB refuses it at parse.", "FLOW-SEMANTICS-SPEC"),
  refusal("gateway.eventBased.receiveArm", "An Event-Based Gateway arm that is not a catch Event, a Receive Task included: pinned CIB refuses every arm that is not an intermediate catch at parse.", "FLOW-SEMANTICS-SPEC"),
  refusal("gateway.exclusive.singleConditionWithoutDefault", "An Exclusive Gateway whose one outgoing flow is conditioned, with no default: CIB refuses it at parse.", "FLOW-SEMANTICS-SPEC"),
  refusal("gateway.exclusive.unconditionedFlow", "A diverging Exclusive Gateway with two unconditioned non-default flows, or one beside a default: CIB refuses both at parse.", "FLOW-SEMANTICS-SPEC"),
  refusal("link.catch", "A throwing Link without exactly one catching Link of its name among its siblings (§10.5.5).", "FLOW-SEMANTICS-SPEC"),
  refusal("link.duplicateCatch", "Two catching Links of one name anywhere in the program: CIB refuses a second catch of one name across the resource.", "FLOW-SEMANTICS-SPEC; CIB-AGR-0018"),
  refusal("message.correlation.modeled", "A correlated catch under messageCorrelation = apiCriteria: CIB executes no modeled correlation key.", "SUBSCRIPTIONS-SEMANTICS-SPEC; CIB-LIM-0002"),
  refusal("message.duplicateName", "Two Message subscriptions of one CIB event scope and start mark with one name, a literal by its text and an expression by its parsed form.", "SUBSCRIPTIONS-SEMANTICS-SPEC; CIB-LIM-0022"),
  refusal("message.unnamed", "A Message without a name or with a blank one, where Messages are addressed by name.", "SUBSCRIPTIONS-SEMANTICS-SPEC; CIB-LIM-0022"),
  refusal("multiInstance.concurrentInstances", "Under BranchSchedule.orderInvariant, a parallel loop whose instances may meet one another's writes or removals: §13.3.7 fixes no order among the instances, so this is a conservative, forward-compatible restriction.", "MULTI-INSTANCE-SEMANTICS-SPEC"),
  refusal("multiInstance.counterTarget", "Under cibLocals, a target named like a Multi-Instance counter written inside an instance.", "MULTI-INSTANCE-SEMANTICS-SPEC; CIB-LIM-0020"),
  refusal("multiInstance.mappings", "An output mapping on a Multi-Instance Activity, a CIB deployment error; under the standards binding also an input mapping.", "MULTI-INSTANCE-SEMANTICS-SPEC"),
  refusal("multiInstance.ownInputReadsInstance", "Under loopReferences, a looping Activity's own input mapping that reads a counter name or the item name.", "MULTI-INSTANCE-SEMANTICS-SPEC; CIB-LIM-0019"),
  refusal("profile.abnormalScopeEnd.withoutOutflow", "Under the standards reading, a program with a Terminate End inside a Sub-Process or at a called process's level, or any interrupting Event Sub-Process: the kernel has only the normal continuation.", "SCOPES-SEMANTICS-SPEC; CIB-INT-0007"),
  refusal("reader.conditionExpressionType", "An explicit xsi:type=\"tExpression\" on a Sequence Flow condition: a CIB deployment error, and BPMN calls that type non-executable too.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("reader.eventDefinitionRef", "An Event naming a root-level EventDefinition (eventDefinitionRef), which pinned CIB never resolves.", "ADMISSION-SEMANTICS-SPEC; CIB-LIM-0008"),
  refusal("reader.unknownExtension", "Extension content the reader has no faithful IL field for, such as a camunda:list or camunda:map parameter value.", "ADMISSION-SEMANTICS-SPEC"),
  refusal("scope.eventSubProcess.boundary", "A Boundary Event on an Event Sub-Process: it is outside normal flow (§10.3.5), so the boundary's exception flow has nowhere to lead (§13.5.4).", "SCOPES-SEMANTICS-SPEC; CIB-LIM-0005"),
  refusal("scope.eventSubProcess.errorDuplicateCode", "Two Error Event Sub-Processes of one scope with the same code (§10.5.6).", "PROPAGATION-SEMANTICS-SPEC"),
  refusal("scope.eventSubProcess.escalationDuplicate", "Two Escalation Event Sub-Processes of one scope declaring one code: §10.5.6 allows one handler per Event Declaration.", "PROPAGATION-SEMANTICS-SPEC; CIB-LIM-0021"),
  refusal("scope.withoutStart", "Under scopeStart = required, an embedded Sub-Process or Transaction without a start Event: CIB cannot deploy or enter it.", "SCOPES-SEMANTICS-SPEC; CIB-LIM-0024"),
  refusal("signal.duplicateName", "Two Signal subscriptions of one CIB event scope and start mark with one name.", "SUBSCRIPTIONS-SEMANTICS-SPEC; CIB-LIM-0026"),
  refusal("source.loopBodyWhitespace", "A Multi-Instance loop body with a whitespace-only text node, which bpmn-moddle drops.", "EXPRESSION-SEMANTICS-SPEC"),
  refusal("source.reference", "A reference that does not resolve inside the document, by the QName rule of the flow semantics.", "ADMISSION-SEMANTICS-SPEC"),
  refusal("source.schema", "A document the pinned OMG BPMN20.xsd rejects.", "ADMISSION-SEMANTICS-SPEC"),
  refusal("start.condition", "A root Conditional start under conditionalStart = refused: Table 10.84 puts its environment outside the standard.", "SUBSCRIPTIONS-SEMANTICS-SPEC"),
  refusal("start.condition.duplicate", "Two root Conditional starts of one process level with one parsed predicate.", "SUBSCRIPTIONS-SEMANTICS-SPEC; CIB-LIM-0027"),
  refusal("start.error.nonInterrupting", "A non-interrupting Error Event Sub-Process: an Error always interrupts (Tables 10.86 and 10.87, §13.5.4).", "PROPAGATION-SEMANTICS-SPEC; CIB-LIM-0018"),
  refusal("start.messageNameExpression", "A root Message start whose name is an expression: CIB refuses it at deployment.", "SUBSCRIPTIONS-SEMANTICS-SPEC"),
  refusal("start.rootCombination", "A second None or Timer Start of a process: pinned CIB parses one.", "FLOW-SEMANTICS-SPEC"),
  refusal("start.subProcessCombination", "A second start of a Sub-Process: pinned CIB parses one.", "FLOW-SEMANTICS-SPEC"),
  refusal("throw.cancel.outsideTransaction", "A Cancel throw whose direct parent is not a Transaction (§10.5.5).", "PROPAGATION-SEMANTICS-SPEC"),
  refusal("throw.cancel.uncaught", "A Cancel throw whose Transaction has no Cancel boundary: the boundary directs the flow after the cancellation (§10.3.5).", "PROPAGATION-SEMANTICS-SPEC; CIB-LIM-0043"),
  refusal("throw.compensation.activityLevel", "A Compensation throw whose activityRef names an element not visible from it (Tables 10.88 and 10.89).", "COMPENSATION-SEMANTICS-SPEC"),
  refusal("throw.compensation.asynchronous", "A Compensation throw with waitForCompletion = false, which CIB runs synchronously.", "COMPENSATION-SEMANTICS-SPEC; CIB-LIM-0041"),
  refusal("throw.compensation.notActivity", "A Compensation throw whose activityRef names no Activity (Table 10.94).", "COMPENSATION-SEMANTICS-SPEC; CIB-EXT-0046"),
  refusal("timer.cron", "A Cron timer outside the Quartz subset, or a malformed one where malformed timers are refused.", "SUBSCRIPTIONS-SEMANTICS-SPEC"),
  refusal("timer.cycle", "A dated, zero-count, signed-count or nominal-period cycle, or a malformed one where malformed timers are refused.", "SUBSCRIPTIONS-SEMANTICS-SPEC"),
  refusal("timer.date", "A date outside the supported subset (zone-less, before 1970, sub-millisecond, other ISO formats), or a malformed one where malformed timers are refused.", "SUBSCRIPTIONS-SEMANTICS-SPEC"),
  refusal("timer.duration", "A duration outside the supported subset, or an expression outside the Events level; at a root start also one with years or months.", "SUBSCRIPTIONS-SEMANTICS-SPEC; CIB-LIM-0003"),
  refusal("work.call.calledProcessMissing", "A Call whose called element is not a literal naming exactly one eligible carried Process other than the root.", "WORK-SEMANTICS-SPEC; CIB-INT-0034; CIB-LIM-0032"),
  refusal("work.call.cycle", "A Call on a carried process whose bound callee leads back to that process.", "WORK-SEMANTICS-SPEC; CIB-LIM-0034"),
  refusal("work.call.multiInstanceCounterOutput", "A Call output targeting nrOfInstances, nrOfActiveInstances or nrOfCompletedInstances: CIB drops it.", "WORK-SEMANTICS-SPEC; CIB-LIM-0004"),
  refusal("work.call.multiInstanceDataInput", "Under the standards binding, a looping Call with an input Data Association: a conservative restriction.", "MULTI-INSTANCE-SEMANTICS-SPEC"),
  refusal("work.call.tenant", "A Call's tenant, or a carried definition bound to a tenant.", "WORK-SEMANTICS-SPEC; CIB-LIM-0033"),
  refusal("work.handlerKeyName", "A declared name equal to a bound delegate token.", "WORK-SEMANTICS-SPEC; CIB-LIM-0017"),
  refusal("work.receive.instantiate", "A Receive Task with instantiate=\"true\", which pinned CIB never reads.", "FLOW-SEMANTICS-SPEC; CIB-LIM-0008"),
  refusal("work.rule.decisionMissing", "A decisionRef that no carried resource declares.", "DECISION-SEMANTICS-SPEC"),
  refusal("work.script.language", "A scriptFormat other than javascript, ecmascript or js, ignoring ASCII case, the absent one included.", "SCRIPT-SEMANTICS-SPEC"),
  refusal("work.send", "A Send Task that is not exactly the configured-service form: a delegate expression with no messageRef, operationRef, output parameter or result variable.", "WORK-SEMANTICS-SPEC; CIB-EXT-0023"),
  refusal("work.service.unboundImplementation", "Service work without protocol and operation, a declared CIB implementation no binding matches included: no handler to invoke, and CIB deploys it and fails it when it runs.", "WORK-SEMANTICS-SPEC; CIB-LIM-0051"),
  refusal("work.user.formField", "A form field without an id, or of a type other than string, long, boolean and date.", "WORK-SEMANTICS-SPEC"),
]);
