module

public import Kernel.Admission.Data
public import Kernel.Admission.Flow
public import Kernel.Admission.Profile
public import Kernel.Admission.Work
public import Kernel.Admission.MultiInstance
public import Kernel.Admission.Propagation
public import Kernel.Admission.Scopes
public import Kernel.Admission.Subscriptions

/-! # Admission registry: the first refusal of any element, in program order. Only `Kernel.Run` imports it. -/

public section

namespace Kernel.AdmissionRegistry

/-- Whether an element is some Activity's or Scope's compensation handler. -/
def isHandler (program : Program) (id : ElementId) : Bool :=
  program.elements.any fun element => (element.envelope?.bind (·.compensationHandler)) == some id

/-- Refusals an Activity owes because of how it begins or of what its handler restores. -/
def activityOrigin (program : Program) (header : Header) (payload : ActivityPayload) : Option String :=
  let handler := isHandler program header.id
  if handler && !payload.envelope.inputs.isEmpty then some "activity.compensationHandler.input"
  else if handler && !Admission.Work.beginsWithoutToken payload.work then some "compensation.handlerWork"
  -- CIB skips a compensation handler's loop marks (`BpmnParse.java:2416`), which `Step.marks` would read.
  else if handler && payload.envelope.multiInstance.isSome then some "compensation.handlerMultiInstance"
  else if Admission.Scopes.implicitChild program header && !Admission.Work.beginsWithoutToken payload.work then
    some "scope.implicitStart"
  else none

/-- The site of an expression in `id`'s scope. -/
def site (program : Program) (id : Option ElementId) : Admission.Data.Site :=
  { counters := Admission.MultiInstance.countersAt program id }

def targets (mappings : List Mapping) : List String := mappings.map (·.target)

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

/-- What an element throws, if it is a throw Event. -/
def thrown (element : Element) : Option (Header × Admission.Propagation.Reading) :=
  element.event?.bind fun (header, payload) =>
    match payload.role with
    | .throw record => some (header, Admission.Propagation.reading record)
    | .catch _ => none
    | .linkCatch _ => none
    | .linkThrow _ => none

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

/-- `throws` lists the program's Compensation throws. -/
def element (program : Program) (throws : List Element) : Element → Option String
  | .activity header payload =>
    Admission.Data.origin header <|> envelopeData program header payload.envelope <|>
      (payload.work.call?.bind fun work =>
        Admission.Data.mappings program.options.evaluator (site program (some header.id)) work.inputs <|>
          Admission.Data.mappings program.options.evaluator (site program (some header.id)) work.outputs) <|>
      Admission.Work.activity program payload <|>
      activityOrigin program header payload <|>
      payload.envelope.multiInstance.bind
        (Admission.MultiInstance.activityLoop program.options Admission.Data.loopExpression
          (Admission.Work.instanceBody payload.work) payload.envelope) <|>
      outputTargets program header (payload.envelope.outputs ++ ((payload.work.call?.map (·.outputs)).getD [])) <|>
      Admission.Subscriptions.boundaries program.options.errorCatchVariables false payload.envelope.boundaries <|>
      boundaryData program header payload.envelope.boundaries <|>
      Admission.Scopes.nestedCompensation program throws header payload.envelope
  | .scope header payload =>
    Admission.Data.origin header <|> envelopeData program header payload.envelope <|>
      Admission.Scopes.scope program header payload <|>
      -- A Sub-Process instance submits no output data item, so `submits` is false (PC-MI-10).
      payload.envelope.multiInstance.bind
        (Admission.MultiInstance.activityLoop program.options Admission.Data.loopExpression (some false) payload.envelope) <|>
      outputTargets program header payload.envelope.outputs <|>
      (Admission.Scopes.eventSubProcess? payload).bind (fun (start, interrupting) =>
        Admission.Subscriptions.eventSubProcess start interrupting) <|>
      Admission.Subscriptions.eventSubProcessDeclarations (eventSubProcessStarts (program.children (some header.id))) <|>
      Admission.Subscriptions.boundaries program.options.errorCatchVariables (Admission.Scopes.isTransaction payload)
        payload.envelope.boundaries <|>
      boundaryData program header payload.envelope.boundaries <|>
      Admission.Scopes.nestedCompensation program throws header payload.envelope
  | .event header payload =>
    Admission.Data.origin header <|>
      match payload.role with
      | .catch subscription =>
        Admission.Subscriptions.catchEvent subscription <|> subscriptionData program (some header.id) subscription
      -- A Multiple throw Event (BPMN 2.0.2 §10.5.1); pinned CIB keeps one definition (CIB-LIM-0008) (PC-BASIC-04).
      | .throw record =>
        (if payload.alternativeThrows.isEmpty then none else some "event.multipleDefinitions") <|>
          Admission.Propagation.throwRecord (inTransaction program header) record
      | .linkCatch _ => Admission.Flow.link program header payload
      | .linkThrow _ => Admission.Flow.link program header payload
  | .gateway header payload =>
    Admission.Data.origin header <|> Admission.Flow.gateway program payload
  | .start header payload =>
    Admission.Data.origin header <|> Admission.Flow.startCombination program header <|>
      payload.subscription.bind fun subscription =>
        Admission.Subscriptions.start program.options.errorCatchVariables header.parent.isSome subscription <|>
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

/-- A flow's condition, evaluated in its source's enclosing scope, then where it may sit, then whether its branch races
a sibling's write. -/
def flow (program : Program) (entry : Flow) : Option String :=
  let here := site program ((program.element? entry.source).bind (·.header.parent))
  Admission.Data.flowCondition program.options.evaluator here entry <|> Admission.Flow.conditionalOutflow program entry <|>
    Admission.Flow.concurrentWrite program entry

/-- A called process is bound at assembly to the one definition the program carries, so its definition names no
binding of its own (PC-SCOPE-03). -/
def calledProcessBinding (process : CalledProcess) : Option String :=
  let definition := process.definition
  if definition.version.isSome || definition.versionTag.isSome || definition.deployment.isSome ||
      definition.tenant.isSome then some "process.definition.binding"
  else none

/-- A process not marked executable (BPMN 2.0.2 Table 10.1 `isExecutable`) has no execution meaning; pinned
`BpmnParse:560-574` deploys none (CIB-LIM-0008) (PC-BASIC-04). -/
def executable (program : Program) : Option String :=
  if !program.executable || program.processes.any (!·.executable) then some "process.notExecutable" else none

/-- The first refusal: references, profile options, a process not marked executable, the carried DMN resources, then
called-process bindings, the process levels' Event Sub-Processes, flows and elements in program order. -/
def admit (program : Program) : Option String :=
  Admission.Flow.references program <|> Admission.Scopes.membership program <|>
    Admission.Profile.options (abnormalScope program) (loops program) program.options <|>
    executable program <|>
    Admission.Work.Decision.resources program <|>
    program.processes.findSome? calledProcessBinding <|>
    processEventSubProcesses program <|>
    program.flows.findSome? (flow program) <|>
    program.elements.findSome? (element program (program.elements.filter compensationThrow))

end Kernel.AdmissionRegistry
