module

public import Kernel.Admission.Data
public import Kernel.Admission.Flow
public import Kernel.Admission.Profile
public import Kernel.Admission.Work
public import Kernel.Admission.MultiInstance
public import Kernel.Admission.Propagation
public import Kernel.Admission.Scopes
public import Kernel.Admission.Subscriptions
public import Kernel.Admission.Subscriptions.Starts

/-! # Admission registry: the first refusal of any element, in program order. Only `Kernel.Run` imports it. -/

public section

namespace Kernel.AdmissionRegistry

/-- Whether an element is some Activity's or Scope's compensation handler. -/
def isHandler (program : Program) (id : ElementId) : Bool :=
  program.elements.any fun element => ((element.envelope?.map (·.compensationHandlers)).getD []).contains id

/-- Refusals an Activity owes because of how it begins or of what its handler restores. -/
def activityOrigin (program : Program) (header : Header) (payload : ActivityPayload) : Option String :=
  let handler := isHandler program header.id
  if handler && !payload.envelope.inputs.isEmpty then some "activity.compensationHandler.input"
  else if handler && !Admission.Work.beginsWithoutToken payload.work then some "compensation.handlerWork"
  -- CIB skips a compensation handler's loop marks (`BpmnParse.java:2416`), which `marks` (`Kernel.State.Journal`) would read.
  else if handler && payload.envelope.multiInstance.isSome then some "compensation.handlerMultiInstance"
  else if Admission.Scopes.implicitChild program header && !Admission.Work.beginsWithoutToken payload.work then
    some "scope.implicitStart"
  else none

/-- The site of an expression in `id`'s scope. -/
def site (program : Program) (id : Option ElementId) : Admission.Data.Site :=
  { counters := Admission.MultiInstance.countersAt program id, scopeItems := Admission.Data.scopedItems program }

def targets (mappings : List Mapping) : List String := mappings.map (·.target)

/-- How a subscription in the scope of `id` reads an expression of its trigger: the Core JUEL table at that site. -/
def subscriptionReading (program : Program) (id : Option ElementId) : Admission.Subscriptions.Reading :=
  { juel := fun nodes => Admission.Data.juelNodes nodes (site program id), name := Admission.Data.juelName (site program id) }

/-- A subscription's outputs read and write in the scope of `id`. -/
def subscriptionData (program : Program) (id : Option ElementId) (subscription : Subscription) : Option String :=
  Admission.Data.mappings program.options.evaluator (site program id) subscription.outputs <|>
    Admission.MultiInstance.counterTarget (Admission.MultiInstance.countersAt program id) (targets subscription.outputs)

/-- A boundary belongs to its host's body, so its outputs are in the scope enclosing the host. -/
def boundaryData (program : Program) (host : Header) (boundaries : List Boundary) : Option String :=
  boundaries.findSome? (subscriptionData program host.parent ·.subscription)

/-- An element's own data: its envelope's mappings and its Call's, each at its site, and the outputs it writes in its
scope, which `counterTarget` checks after `activityLoop` has refused a looping element's own outputs. A looping
element's own inputs may not read its instance (`ownInputNames`). -/
def envelopeData (program : Program) (header : Header) (envelope : Envelope) : Option String :=
  let here := site program (some header.id)
  let inputs := { here with hidden := (envelope.multiInstance.map (Admission.MultiInstance.ownInputNames program.options)).getD [] }
  Admission.Data.envelope program.options.evaluator inputs here envelope

def outputTargets (program : Program) (header : Header) (outputs : List Mapping) : Option String :=
  Admission.MultiInstance.counterTarget (Admission.MultiInstance.countersAt program (some header.id)) (targets outputs)

/-- Whether an element sits directly in a Transaction. -/
def inTransaction (program : Program) (header : Header) : Bool :=
  header.parent.any (Admission.Scopes.transactionElement program)

/-- How a throw Event in `header`'s place reads its trigger's expressions and its mappings. -/
def throwSite (program : Program) (header : Header) : Admission.Propagation.ThrowSite :=
  let reading := subscriptionReading program (some header.id)
  { signalAddress := Admission.Subscriptions.signalAddress program.options reading false
    eventsExpression := Admission.Subscriptions.eventsExpression program.options reading
    mappings := Admission.Data.mappings program.options.evaluator (site program (some header.id))
    handlerKey := Admission.Work.handlerKey program }

/-- What an element throws, if it is a throw Event. -/
def thrown (element : Element) : Option (Header × ThrowView) :=
  element.event?.bind fun (header, payload) => payload.throw?.map fun record => (header, throwView record)

def compensationThrow (element : Element) : Bool :=
  (thrown element).any (·.2.compensates)

/-- The starts of the Event Sub-Processes among `elements`, in document order. -/
def eventSubProcessStarts (elements : List Element) : List (Subscription × Bool) :=
  elements.filterMap fun element => element.scope?.bind fun (_, payload) => Admission.Scopes.eventSubProcess? payload

/-- The Event Sub-Processes declared together at the root process level and at each called process's level; a Scope's
are taken with the Scope (`element`). -/
def processEventSubProcesses (program : Program) : Option String :=
  let level (elements : List Element) :=
    Admission.Subscriptions.eventSubProcessDeclarations (eventSubProcessStarts elements)
  level (program.children none) <|> program.processes.findSome? fun process =>
    level (process.children.filterMap program.element?)

/-- The process level holding the parentless element `id`: the root (`none`) or a called process's definition. -/
def processLevel (program : Program) (id : ElementId) : Admission.Subscriptions.EventScope :=
  .process ((program.processes.find? (·.children.contains id)).map (·.definition))

/-- The Event-Based Gateway a catch Event is an arm of, if a flow from one enters it. -/
def armOf (program : Program) (payload : EventPayload) : Option ElementId :=
  payload.incoming.findSome? fun flow => (program.source? flow).bind fun source =>
    ((program.element? source).bind (·.gateway?)).bind fun (header, gateway) =>
      if (Admission.Flow.routing gateway).waits then some header.id else none

/-- What `sites` reads of each subscription an element declares, if it is of the compared kind: a boundary's, a Receive
Task's own Message, an Event Sub-Process start's, a catch Event's and a root start's trigger. -/
structure Picks (α : Type) where
  attached : Boundary → Option α
  received : Work → Option α := fun _ => none
  handled : Subscription → Option α
  caught : Subscription → Option α
  started : Subscription → Option α

/-- An element's subscriptions of one kind in CIB's event scopes, each also declared with its start mark:
- a boundary in its host, or in the host's Multi-Instance body when the host loops (`BpmnParse.java:3290-3301`,
  `getMultiInstanceScope` `:3388-3393`, declared at `:3439`, `:3455`);
- a Receive Task's own Message in the Receive Task, which its boundaries share unless it loops (`:2753-2760`);
- an Event Sub-Process start in the scope holding the Event Sub-Process (`:1112`), unmarked
  (`parseEventDefinitionForSubprocess`, `:3499-3503`), so a boundary of that Sub-Process shares it;
- an Event-Based Gateway arm in the gateway (`:1526-1527`, parsed from the gateway at `:2132`), any other catch in
  itself (`:1529-1530`), declared at `:1596`, `:3520`;
- a root start in its process, marked (Message `:1026-1032`, Signal `:1033-1037`, `:3518`), apart from that level's
  Event Sub-Process starts.
A start nested in a Scope is taken with its Event Sub-Process. -/
def sites {α : Type} (program : Program) (picks : Picks α) (element : Element) : List (Admission.Subscriptions.Site α) :=
  let id := element.header.id
  let declared (scope : Admission.Subscriptions.EventScope) (start : Bool) (trigger : α) :
      Admission.Subscriptions.Site α := { scope, start, trigger }
  let attached := ((element.envelope?).map fun envelope =>
    let scope : Admission.Subscriptions.EventScope := if envelope.multiInstance.isSome then .body id else .element id
    envelope.boundaries.filterMap fun boundary => (picks.attached boundary).map (declared scope false)).getD []
  let received := ((element.activity?).bind fun (_, payload) => picks.received payload.work).map (declared (.element id) false)
  let handled := (element.scope?).bind fun (header, payload) => (Admission.Scopes.eventSubProcess? payload).bind
    fun (start, _) => (picks.handled start).map (declared (match header.parent with
      | some parent => .element parent
      | none => processLevel program id) false)
  let caught := (element.event?).bind fun (_, payload) => payload.catch?.bind fun subscription =>
    (picks.caught subscription).map (declared (match armOf program payload with
      | some gateway => .element gateway
      | none => .element id) false)
  let started := (element.start?).bind fun (header, payload) =>
    if header.parent.isNone then (payload.subscription.bind picks.started).map (declared (processLevel program id) true)
    else none
  attached ++ received.toList ++ handled.toList ++ caught.toList ++ started.toList

def messages : Picks MessageTrigger :=
  { attached := (·.subscription.trigger.message?), received := (·.receive?), handled := (·.trigger.message?),
    caught := (·.trigger.message?), started := (·.trigger.message?) }

/-- The Signals admission reads where it admits them: a boundary's and a catch Event's (`caught`), an Event Sub-Process
start's and a root start's (`triggered`). -/
def signals (options : ProfileOptions) : Picks SignalTrigger :=
  { attached := fun boundary => (Admission.Subscriptions.caught options {} boundary.subscription).signal
    handled := fun start => (Admission.Subscriptions.triggered options {} true start.trigger).signal
    caught := fun subscription => (Admission.Subscriptions.caught options {} subscription).signal
    started := fun start => (Admission.Subscriptions.triggered options {} false start.trigger).signal }

/-- The Signal names of the whole program: of every Signal it references, then of the subscriptions of each event
scope. -/
def signalDeclarations (program : Program) : Option String :=
  let subscribed := program.elements.flatMap (sites program (signals program.options))
  let throws := program.elements.filterMap fun element => (thrown element).bind (·.2.signal)
  Admission.Subscriptions.signalDefinitionNames program.options (subscribed.map (·.trigger) ++ throws) <|>
    Admission.Subscriptions.signalNames program.options subscribed

/-- `throws` lists the program's Compensation throws. -/
def element (program : Program) (throws : List Element) : Element → Option String
  | .activity header payload =>
    Admission.Data.origin program header <|> envelopeData program header payload.envelope <|>
      Admission.Work.handlerCount payload.envelope <|>
      (payload.work.call?.bind fun work =>
        Admission.Data.mappings program.options.evaluator (site program (some header.id)) work.inputs <|>
          Admission.Data.mappings program.options.evaluator (site program (some header.id)) work.outputs) <|>
      Admission.Work.activity program header payload <|>
      activityOrigin program header payload <|>
      payload.envelope.multiInstance.bind
        (Admission.MultiInstance.activityLoop program.options Admission.Data.loopExpression
          (Admission.Work.instanceBody payload.work) payload.envelope) <|>
      outputTargets program header (payload.envelope.outputs ++ ((payload.work.call?.map (·.outputs)).getD [])) <|>
      Admission.Subscriptions.boundaries program.options (subscriptionReading program header.parent)
        { transaction := false, escalation := payload.work.isUser || payload.work.call?.isSome } payload.envelope.boundaries <|>
      boundaryData program header payload.envelope.boundaries <|>
      Admission.Scopes.nestedCompensation program throws header payload.envelope
  | .scope header payload =>
    Admission.Data.origin program header <|> envelopeData program header payload.envelope <|>
      Admission.Work.handlerCount payload.envelope <|>
      Admission.Scopes.scope program header payload <|>
      -- A Sub-Process instance submits no output data item, so `submits` is false (PC-MI-10).
      payload.envelope.multiInstance.bind
        (Admission.MultiInstance.activityLoop program.options Admission.Data.loopExpression (some false) payload.envelope) <|>
      outputTargets program header payload.envelope.outputs <|>
      (Admission.Scopes.eventSubProcess? payload).bind (fun (start, interrupting) =>
        Admission.Subscriptions.eventSubProcess start interrupting) <|>
      Admission.Subscriptions.eventSubProcessDeclarations (eventSubProcessStarts (program.children (some header.id))) <|>
      Admission.Subscriptions.boundaries program.options (subscriptionReading program header.parent)
        { transaction := Admission.Scopes.isTransaction payload, escalation := true } payload.envelope.boundaries <|>
      boundaryData program header payload.envelope.boundaries <|>
      Admission.Scopes.nestedCompensation program throws header payload.envelope
  | .event header payload =>
    Admission.Data.origin program header <|>
      match payload.role with
      | .catch subscription =>
        Admission.Subscriptions.catchEvent program.options (subscriptionReading program (some header.id)) subscription <|>
          subscriptionData program (some header.id) subscription
      -- A Multiple throw Event (BPMN 2.0.2 §10.5.1); pinned CIB keeps one definition (CIB-LIM-0008) (PC-BASIC-04).
      | .throw record =>
        (if payload.alternativeThrows.isEmpty then none else some "event.multipleDefinitions") <|>
          Admission.Propagation.throwRecord program.options (throwSite program header) (inTransaction program header) record
      | .linkCatch _ => Admission.Flow.link program header payload
      | .linkThrow _ => Admission.Flow.link program header payload
  | .gateway header payload =>
    Admission.Data.origin program header <|> Admission.Flow.gateway program payload
  | .start header payload =>
    Admission.Data.origin program header <|> Admission.Flow.startCombination program header <|>
      payload.subscription.bind fun subscription =>
        Admission.Subscriptions.start program.options (subscriptionReading program (some header.id)) header.parent.isSome subscription <|>
          subscriptionData program (some header.id) subscription

/-- Whether the program's shape reaches an abnormal scope end: a Terminate in a Sub-Process or at a called process's
level (which ends the called instance, not the caller), or an interrupting Event Sub-Process. -/
def abnormalScope (program : Program) : Bool :=
  program.elements.any fun element =>
    (thrown element).any (fun (header, reading) =>
      (header.parent.isSome || program.inCalledProcess header.id) && reading.terminates) ||
    element.scope?.any fun (_, payload) => (Admission.Scopes.interruptingStart payload).isSome

/-- Whether the program has a Multi-Instance loop, which `Admission.Profile.multiInstance` reads. -/
def loops (program : Program) : Bool :=
  program.elements.any fun element => ((element.envelope?).bind (·.multiInstance)).isSome

/-- Whether a Sub-Process an Error can leave retains compensable work: an element with a compensation handler lies in
a Sub-Process. Any work may raise an Error, so every such Sub-Process counts. -/
def errorExit (program : Program) : Bool :=
  program.elements.any fun element =>
    element.header.parent.isSome && !((element.envelope?.map (·.compensationHandlers)).getD []).isEmpty

/-- Whether a Multi-Instance Task or Call has a compensation handler. -/
def loopedHandler (program : Program) : Bool :=
  program.elements.any fun element =>
    element.activity?.any fun (_, payload) =>
      payload.envelope.multiInstance.isSome && !payload.envelope.compensationHandlers.isEmpty

/-- Whether a looping element's instances race one another where they begin: the closure is
`Admission.Flow`'s, the loop's mode and condition `Admission.MultiInstance`'s. -/
def loopInstances (program : Program) (element : Element) : Option String :=
  (element.envelope?.bind (·.multiInstance)).bind fun loop =>
    let closure := Admission.Flow.instanceClosure program element
    Admission.MultiInstance.concurrentInstances program.options loop closure.races closure.completes

/-- A flow's condition, evaluated in its source's enclosing scope, then where it may sit, then whether its branch races
a sibling's write. -/
def flow (program : Program) (entry : Flow) : Option String :=
  let here := site program ((program.element? entry.source).bind (·.header.parent))
  Admission.Data.flowCondition program.options.evaluator here entry <|> Admission.Flow.conditionalOutflow program entry <|>
    Admission.Flow.concurrentWrite program entry

/-- A called process's deployment, version and version tag are the population's stamps, which `Population.deploy`
validates against its registry (PC-SCOPE-03); the population has one tenant, so a tenant stays refused
(CIB-LIM-0033). -/
def calledProcessBinding (process : CalledProcess) : Option String :=
  if process.definition.tenant.isSome then some "process.definition.binding" else none

/-- A process not marked executable (BPMN 2.0.2 Table 10.1 `isExecutable`) has no execution meaning; pinned
`BpmnParse:560-574` deploys none (CIB-LIM-0008) (PC-BASIC-04). -/
def executable (program : Program) : Option String :=
  if !program.executable || program.processes.any (!·.executable) then some "process.notExecutable" else none

/-- A refusal code, and the element or flow it names when that element's or flow's own check refused. -/
structure AdmissionRefusal where
  code : String
  element : Option String
  deriving DecidableEq, Repr

/-- A check of the whole program, which names no element. -/
def unlocated (code : Option String) : Option AdmissionRefusal :=
  code.map ({ code := ·, element := none })

/-- The first of `items` whose own check refuses, named by `id`. -/
def located {α : Type} (items : List α) (id : α → String) (check : α → Option String) : Option AdmissionRefusal :=
  items.findSome? fun item => (check item).map ({ code := ·, element := some (id item) })

/-- The first refusal: references, profile options, a process not marked executable, the carried DMN resources, then
called-process bindings, the process levels' Event Sub-Processes, flows and elements in program order, the instances of
each loop, the Conditional starts of each process level, then the Message and the Signal names of the whole program. A
flow's, an element's or a loop's own refusal names it, so a host can point at the refused element. -/
def admitLocated (program : Program) : Option AdmissionRefusal :=
  let elementId (element : Element) : String := element.header.id.value
  unlocated (Admission.Flow.references program) <|> unlocated (Admission.Scopes.membership program) <|>
    unlocated (Admission.Profile.options
      { abnormalScope := abnormalScope program, loops := loops program, errorExit := errorExit program
        loopedHandler := loopedHandler program } program.options) <|>
    unlocated (executable program) <|>
    unlocated (Admission.Work.Decision.resources program) <|>
    unlocated (program.processes.findSome? calledProcessBinding) <|>
    unlocated (processEventSubProcesses program) <|>
    located program.flows (·.id.value) (flow program) <|>
    located program.elements elementId (element program (program.elements.filter compensationThrow)) <|>
    located program.elements elementId (loopInstances program) <|>
    unlocated (Admission.Subscriptions.startConditions program) <|>
    unlocated (Admission.Subscriptions.messageNames program.options (program.elements.flatMap (sites program messages))) <|>
    unlocated (signalDeclarations program)

/-- The code of the first refusal (`admitLocated`). -/
def admit (program : Program) : Option String :=
  (admitLocated program).map (·.code)

end Kernel.AdmissionRegistry
