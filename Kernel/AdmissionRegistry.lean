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

def subscriptionData (subscription : Subscription) : Option String :=
  Admission.Data.mappings subscription.outputs

def boundaryData (boundaries : List Boundary) : Option String :=
  boundaries.findSome? (subscriptionData ·.subscription)

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

/-- `throws` lists the program's Compensation throws. -/
def element (program : Program) (throws : List Element) : Element → Option String
  | .activity header payload =>
    Admission.Data.origin header <|> Admission.Data.envelope payload.envelope <|>
      (payload.work.call?.bind fun work => Admission.Data.mappings work.inputs <|> Admission.Data.mappings work.outputs) <|>
      Admission.Work.activity program payload <|>
      activityOrigin program header payload <|>
      payload.envelope.multiInstance.bind
        (Admission.MultiInstance.activity (Admission.Work.instanceBody payload.work) payload.envelope) <|>
      Admission.Subscriptions.boundaries program.options.errorCatchVariables false payload.envelope.boundaries <|>
      boundaryData payload.envelope.boundaries <|>
      Admission.Scopes.nestedCompensation program throws header payload.envelope
  | .scope header payload =>
    Admission.Data.origin header <|> Admission.Data.envelope payload.envelope <|>
      Admission.Scopes.scope program header payload <|>
      (Admission.Scopes.eventSubProcess? payload).bind (fun (start, interrupting) =>
        Admission.Subscriptions.eventSubProcess start interrupting) <|>
      Admission.Subscriptions.boundaries program.options.errorCatchVariables (Admission.Scopes.isTransaction payload)
        payload.envelope.boundaries <|>
      boundaryData payload.envelope.boundaries <|>
      Admission.Scopes.nestedCompensation program throws header payload.envelope
  | .event header payload =>
    Admission.Data.origin header <|>
      match payload.role with
      | .catch subscription => Admission.Subscriptions.catchEvent subscription <|> subscriptionData subscription
      | .throw record => Admission.Propagation.throwRecord (inTransaction program header) record
      | .linkCatch _ => Admission.Flow.link program header payload
      | .linkThrow _ => Admission.Flow.link program header payload
  | .gateway header payload =>
    Admission.Data.origin header <|> Admission.Flow.gateway program payload
  | .start header payload =>
    Admission.Data.origin header <|> Admission.Flow.start program header <|>
      payload.subscription.bind fun subscription =>
        Admission.Subscriptions.start program.options.errorCatchVariables header.parent.isSome subscription <|>
          subscriptionData subscription

/-- Whether the program's shape reaches an abnormal scope end: a Terminate in a Sub-Process or an interrupting Event
Sub-Process. -/
def abnormalScope (program : Program) : Bool :=
  program.elements.any fun element =>
    (thrown element).any (fun (header, reading) => header.parent.isSome && reading.terminates) ||
    element.scope?.any fun (_, payload) => (Admission.Scopes.interruptingStart payload).isSome

/-- A flow's condition, then where it may sit. -/
def flow (program : Program) (entry : Flow) : Option String :=
  Admission.Data.flowCondition entry <|> Admission.Flow.conditionalOutflow program entry

/-- A called process is bound at assembly to the one definition the program carries, so its definition names no
binding of its own (PC-SCOPE-03). -/
def calledProcess (process : CalledProcess) : Option String :=
  let definition := process.definition
  if definition.version.isSome || definition.versionTag.isSome || definition.deployment.isSome ||
      definition.tenant.isSome then some "process.definition.binding"
  else none

/-- The first refusal: references, profile options, then called-process bindings, flows and elements in program
order. -/
def admit (program : Program) : Option String :=
  Admission.Flow.references program <|> Admission.Scopes.references program <|>
    Admission.Profile.options (abnormalScope program) program.options <|>
    program.processes.findSome? calledProcess <|>
    program.flows.findSome? (flow program) <|>
    program.elements.findSome? (element program (program.elements.filter compensationThrow))

end Kernel.AdmissionRegistry
