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
    version: "2.0.0" | "2.2.0";
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

const exactCib = (
  pipelineCaseId: string,
  version: "2.0.0" | "2.2.0" = "2.2.0",
): CibCapabilityEvidence => Object.freeze({
  kind: CibCapabilityEvidenceKind.ExactSelectedProfile,
  pipelineCaseId,
  version,
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
    restriction: "One direct Transaction child Cancel End on one of two parallel one-or-two-User-Task branches. Cancels unfinished child work and compensates zero or one completed eligible Task; no root or ordinary Sub-Process Cancel End.",
    cibEvidence: notSelected,
  },
  {
    id: "userTask",
    family: "Activities",
    element: "User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Occurrence-bound wait and completion; string/null normally, with one Boolean and one literal group/form profile. Under the nested scope-data profile, a User Task without data, boundary or Multi-Instance variants may merge several incoming flows in the Process root of a re-entry graph, each arriving token starting a fresh occurrence.",
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
    restriction: "One ordered String-list snapshot, one active generated task at a time, at most sixteen items, and atomic index-ordered String-list output.",
    cibEvidence: notSelected,
  },
  {
    id: "parallelMultiInstanceUserTask",
    family: "Activities",
    element: "Parallel Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One ordered String-list snapshot, at most sixteen concurrent generated tasks, exact all-or-first completion policy, atomic index-ordered output only when every slot is filled, and no partial output on early closure.",
    cibEvidence: notSelected,
  },
  {
    id: "serviceTask",
    family: "Activities",
    element: "Service Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Exact registered bindings only: payload-free effects, bounded scalar mappings, one generation-1 incident account, or overlay-bound named operations with immutable enclosing String/null inputs and complete local results in serial or single-control mixed task graphs. The portable effect-data profile instead admits a serial chain of Service Tasks without Human Tasks whose handler results carry one structured item per output: a String of at most 1,024 UTF-8 bytes, Null, Boolean, Integer, exact Decimal, or a Map whose fields may nest Lists and Maps, but never a root List, within 16,384 canonical bytes. Inputs receive copies, so a handler changes Process data only through its result. A hosted Start is refused when the reserved result of a task or the successful journey cannot fit the capacity envelope; earlier profiles refuse structured results. The embedded completion profile also admits data-free overlay-bound Service Tasks wherever it admits a User Task in nested and concurrent Sub-Process bodies, never in a called body or beside a Call, at most 32 counted once per merge branch like its task bound; their Activities run concurrently with each other and with human work, and in a Program with scope data they may map exact ${name} inputs and outputs resolved along their own Sub-Process occurrence's chain. Under the nested scope-data profile, such a Service Task without a BPMN Error route may merge several incoming flows in the Process root of a re-entry graph, each arriving token starting a fresh occurrence. No general JUEL or Java delegate compatibility.",
    cibEvidence: exactCib("service-task-effect-success"),
  },
  {
    id: "sendTask",
    family: "Activities",
    element: "Send Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Under the nested scope-data profile only: a Send Task performed by a handler the source overlay binds through camunda:delegateExpression, with camunda:asyncBefore and input parameters, wherever that profile admits a mapped Service Task. It executes as that Service Task's effect, whose published arguments carry the send data, such as the recipient and the correlation key, and its handler result must be empty, since no output is admitted on a Send Task. No Message is constructed and no Message Flow, messageRef or operationRef is read; mail, external, class and expression implementations and every other profile are refused. Like that Service Task, it may merge several incoming flows in the Process root of a re-entry graph.",
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
    restriction: "Exact completion, Error, boundary Timer, Terminate and Compensation shapes at one level; no general Event Sub-Process. The embedded completion profile also admits ordinary Sub-Processes nested to depth three whose bodies hold only User Tasks, data-free overlay-bound Service Tasks, paired Parallel fork/join blocks and further Sub-Processes, plus terminal unjoined forks to separate None Ends in a child body; a Sub-Process completes exactly when it owns no token, User Task, open effect or child scope and then continues once at its own parent without touching concurrent work outside it. In a depth-one or depth-two body, the task branches of one Parallel fork may instead meet at an identity-only converging Exclusive Gateway that feeds a Sub-Process with a serial task body, followed by optional tasks and a None End; every arriving branch starts its own concurrent activation of that Sub-Process, which completes alone and continues once. A definition holds at most 128 User and Service Tasks, at most 32 of them Service Tasks, counting such a target and its successors once per branch, a Start or completion closure of more than eight steps or a hosting instance identity above 256 UTF-8 bytes is refused before Workflow start, and CIB agreement is retained only for the one-level fixture. In a Program with scope data or a mapped Service Task, every Sub-Process occurrence there, including concurrent occurrences of one definition, owns the locals its input parameters declare (a String literal of at most 1,024 UTF-8 bytes or an exact ${name} reference) and publishes them through output parameters; every read, write, input and output resolves along the performing occurrence's own parent chain, values are Strings of at most 1,024 UTF-8 bytes or present nulls, Calls are refused beside data, and a run whose data outgrows a hosted budget ends with a typed capacity failure instead of a Start refusal. Other Exclusive, Inclusive and Event-Based Gateways, Service Tasks with Error routes, structured data, Events, Multi-Instance and other repeated activation are excluded there. The nested scope-data profile instead admits ordinary Sub-Processes nested to depth three in one serial path of User Tasks, mapped Service Tasks and further Sub-Processes, each declaring up to eight locals through input parameters (a String literal of at most 1,024 UTF-8 bytes or an exact ${name} reference) and publishing them through output parameters that name a declared local; a read resolves to the nearest enclosing declaring frame, otherwise the Process, a write updates that owner and never creates a local, and every local retires with its Sub-Process. A User Task completion may name only declared locals, within 16,384 canonical bytes. A Sub-Process body or the Process root body there may also fork into paired Parallel branches, or into branches ending at their own None Ends, whose Sub-Processes each copy structured values into their own locals; an effect's arguments are fixed when it is armed, so a sibling's later write never reaches an open effect, and each branch publishes its outputs when its Sub-Process completes. In the Process root body, Exclusive Gateways with one or more Simple Boolean v1 conditions, tested in declaration order, and a default may route back through a cycle to an earlier Sub-Process or Call, provided a User or Service Task outside the called Process separates every cycle; each re-entry is a fresh activation whose locals initialize afresh from the enclosing values, whose tasks and effects take the next activation ordinal and whose outputs publish once at its own end, values it published before stay at the Process, and a completion addressed to an earlier activation is rejected unchanged. A model with root-body Exclusive Gateways whose automatic burst from Start or any resumption exceeds eight steps is refused at admission; a serial model of the profile has no such rule, so one whose completion closure exceeds eight steps is admitted and that completion rolls back on every attempt. Event-Based Gateways, Inclusive Gateways outside paired root regions, Exclusive Gateways inside a Sub-Process body or the called Process, forks in a model that also chooses, Calls in a forking Process root body, Parallel merge regions, Call Activities other than up to two mapped Calls of one Process on the root path or in a Sub-Process body at depth one or two, Events, Multi-Instance, other repeated activation and JUEL beyond ${name} are excluded; without Parallel branches or root-body Exclusive Gateways a hosted Start whose structured values cannot fit the capacity envelope is refused, and a run with Parallel branches or root-body Exclusive Gateways whose data outgrows a hosted budget ends with a typed capacity failure instead, iterations being bounded only by the hosted continuation and Run bounds, and only the retained models are measured clear of the untyped retained Run trace path. There a Sub-Process outside every fork region whose body None Start leaves on two or more unconditioned flows opens all of them when it is entered, and one that itself leaves on two or more unconditioned flows, with no default, opens all of them when it completes.",
    cibEvidence: exactCib("embedded-subprocess-completion-a-then-b"),
  },
  {
    id: "transaction",
    family: "Activities",
    element: "Transaction Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One depth-one, single-activation cancellation Transaction; method omitted or exactly ##Compensate. Two parallel branches of one or two ordinary User Tasks, one eligible Task on the non-Cancel branch, empty data and handler arguments. One retained record/4096 bytes and one trigger/handler/20480 bytes; no metadata, loops, nested scopes, protocol success, hazard handling, Store/Image methods or generalized Transactions.",
    cibEvidence: notSelected,
  },
  {
    id: "transactionCancelBoundaryEvent",
    family: "Boundary Events",
    element: "Interrupting Transaction Cancel Boundary Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One interrupting boundary attached to the exact Transaction in its direct parent. Emits one parent continuation after empty cancellation or successful single-handler compensation, followed by one acknowledgement User Task and its distinct None End. Typed handler failure emits no continuation; no non-interrupting Cancel catch or external Cancel command.",
    cibEvidence: notSelected,
  },
  {
    id: "compensationBoundaryEvent",
    family: "Compensation",
    element: "Compensation Boundary Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "The travel-cancellation profile selects two ordinary root User Task subjects; the bounded Transaction cancellation profile selects one ordinary Task on its non-Cancel branch. Boundary, Task, association and handler share that exact owner. Only completed eligible work is retained; no arbitrary nested Compensation context.",
    cibEvidence: notSelected,
  },
  {
    id: "compensationIntermediateThrowEvent",
    family: "Compensation",
    element: "Global synchronous Compensation Intermediate Throw Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One global blocking trigger activates the complete simultaneous maximal frontier in reverse dependency order; no targeted or asynchronous throws, concurrent triggers, Transactions, or CIB Compensation claim.",
    cibEvidence: notSelected,
  },
  {
    id: "compensationEventSubProcess",
    family: "Compensation",
    element: "Compensation Event Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One dormant handler nested in the completed ground-travel Sub-Process restores its frozen completion-time Process binding through one direct Data Input Association; no general Event Sub-Process admission.",
    cibEvidence: notSelected,
  },
  {
    id: "compensationHandlerServiceTask",
    family: "Compensation",
    element: "Single-effect Compensation handler Service Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One closed Compensation Activity effect protocol with empty result patches in the selected root account or the bounded Transaction's single child-owned handler with empty arguments. Handler failure commits typed Process failure and cancels active and pending siblings. No general handler graphs, output mappings, incidents or recovery.",
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
    restriction: "Exact `PT[nH][nM][nS]` durations from 1 ms to PT87660H with explicit logical-time firing; nominal, fractional, zero, dated and repeating forms are refused, and the boundary, race arm, Timer Start and repeatable catch keep their single literal.",
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
    restriction: "One exact PT5S outer-lifetime deadline preserved through task turnover; interruption withdraws the active task and publishes no partial output.",
    cibEvidence: notSelected,
  },
  {
    id: "interruptingParallelMultiInstanceBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on parallel Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT5S outer-lifetime deadline preserved across concurrent progress; interruption terminates every remaining task and publishes no partial output.",
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
    cibEvidence: exactCib("mapped-boundary-error-service-task-caught", "2.0.0"),
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
