module

public import Kernel.IL.Types

/-! # Admission of throw Events. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Propagation

/-- Where a Compensation throw's `activityRef` names an element: at the throw's own level or, from inside a Compensation
Event Sub-Process, at its parent's level, where BPMN 2.0.2 Tables 10.88 and 10.89 make it visible; at the parent's level
of another kind of Event Sub-Process; or elsewhere. -/
inductive ReferenceLevel where
  | visible
  | eventSubProcessParent
  | elsewhere
  deriving DecidableEq

/-- The element a Compensation throw names: where it lies, and whether it is an Activity. -/
structure Reference where
  level : ReferenceLevel
  activity : Bool

/-- What a throw's admission asks of its site, which the registry fills from the other admissions at that site: a
Signal address's refusal (`Kernel.Admission.Subscriptions.signalAddress`, the one rule catches, starts and throws
share), an Events-level expression's refused as the given code, its mappings' refusal, a delegate token's
(`Kernel.Admission.Work.handlerKey`, CIB-LIM-0017), and where a Compensation throw's reference lies. -/
structure ThrowSite where
  signalAddress : Option QName → Option ValueSource → Option String := fun _ _ => none
  eventsExpression : String → Expression → Option String := fun _ _ => none
  mappings : List Mapping → Option String := fun _ => none
  handlerKey : Option String → Option String := fun _ => none
  reference : ElementId → Reference := fun _ => { level := .elsewhere, activity := false }

/-- A CIB business key expression: a String literal, else read at the Events level. -/
def businessKey (site : ThrowSite) : Expression → Option String
  | .literal _ => none
  | other => site.eventsExpression "throw.signal.businessKey" other

/-- A Signal throw (PC-SIGNAL-01). The `camunda:in` copies and business key are CIB's (CIB-EXT-0040), admitted with
the Signal payload CIB installs (`SignalPayload.variables`), refused where a Signal carries no data (BPMN 2.0.2
§10.5.1). Refused under every profile: `camunda:async`, whose delivery runs in separate jobs; `local="true"`, whose
locals depend on CIB's execution tree; and Data Input Associations, which CIB never executes. -/
def signalThrow (options : ProfileOptions) (site : ThrowSite) (record : SignalThrow) : Option String :=
  if record.asynchronous then some "throw.signal.asynchronous"
  else if record.localOnly then some "throw.signal.localVariables"
  else if record.payload.any (·.dialect == .dataAssociation) then some "throw.signal.dataInput"
  else
    let carried := match options.signalPayload with
      | .none =>
        if !record.payload.isEmpty || record.propagateAll.isSome then some "throw.signal.payload"
        else if record.businessKey.isSome then some "throw.signal.businessKey"
        else none
      | .variables => none
    carried <|> site.signalAddress record.signalRef record.name <|> site.mappings record.payload <|>
      record.businessKey.bind (businessKey site)

/-- A Message throw (PC-MESSAGE-09). BPMN 2.0.2 Tables 10.88 and 10.89 send a Message and name no transport, so the
standards profile refuses it bound, by a CIB handler attribute, or unbound, where passing on would drop the send;
`MessageThrowForms.cibForms` runs both of CIB's forms (CIB-EXT-0039, CIB-INT-0027). Its Data Input Associations are
refused under every profile: CIB never executes them. CIB resolves a bound throw's delegate token as a Service
Task's, so a declared name equal to it is refused as one (CIB-LIM-0017), and a token no binding matched, which the reader
carries as an empty operation, as an unbound Service Task is (CIB-LIM-0051). -/
def messageThrow (options : ProfileOptions) (site : ThrowSite) (record : MessageThrow) : Option String :=
  if !record.payload.isEmpty then some "throw.message.payload"
  else match options.messageThrowForms, record.binding with
    | .refused, some _ => some "throw.message.bound"
    | .refused, none => some "throw.message.unbound"
    | .cibForms, some binding =>
      if binding.protocol.isEmpty || binding.operation.isEmpty then some "throw.message.unboundImplementation"
      else site.handlerKey record.handlerKey
    | .cibForms, none => site.handlerKey record.handlerKey

/-- A Compensation throw's `activityRef` names an Activity visible from the throw (BPMN 2.0.2 §10.7.2, Table 10.94,
Tables 10.88 and 10.89). CIB resolves it from any Event Sub-Process at the parent's level (CIB-EXT-0047), which
`CompensationReferenceScope.eventSubProcessParent` admits, and deploys a reference to a non-Activity of the level, which
compensates nothing (CIB-EXT-0046); every other reference CIB refuses at deployment (`BpmnParse.java:1695-1720`). -/
def compensationReference (options : ProfileOptions) (reference : Reference) : Option String :=
  let resolved := if reference.activity then none else some "throw.compensation.notActivity"
  match reference.level, options.compensationReferenceScope with
  | .visible, _ => resolved
  | .eventSubProcessParent, .eventSubProcessParent => resolved
  | .eventSubProcessParent, .visible => some "throw.compensation.activityLevel"
  | .elsewhere, _ => some "throw.compensation.activityLevel"

/-- Where a throw sits for a Cancel End: not directly in a Transaction, or directly in one with or without a Cancel
boundary. -/
inductive CancelSite where
  | outside
  | uncaught
  | caught

/-- What a throw is read for besides its refusal: whether its raise may reach a catcher (an Error, Escalation or Cancel,
or a bound Message throw, whose effect may fail with a business Error), whether it begins compensation handlers (a
Compensation throw, or a Cancel End, which compensates its Transaction, §10.3.5). What its receivers install is
`Kernel.writes`'s. -/
structure Thrown where
  refusal : Option String := none
  raises : Bool := false
  compensates : Bool := false

/-- `cancelSite` says where the throw sits: a Cancel End is used only within a Transaction Sub-Process (BPMN 2.0.2
§10.3.5, §10.5.5 Cancel Event; `BpmnParse#parseEndEvents` refuses it elsewhere), whose Cancel boundary directs the flow
after the cancellation (§10.3.5); CIB deploys one without the boundary and rolls back the command that reaches it
(CIB-LIM-0043) (PC-TX-02). -/
def throwReading (options : ProfileOptions) (site : ThrowSite) (cancelSite : CancelSite) : Throw → Thrown
  | .none => {}
  | .error record =>
    { raises := true
      refusal := match record.message with
        | some (.expression _) => some "throw.error.message"
        | some (.literal _) => none
        | none => none }
  | .escalation _ => { raises := true }
  | .terminate => {}
  | .message record => { refusal := messageThrow options site record, raises := record.binding.isSome }
  | .signal record => { refusal := signalThrow options site record }
  | .compensation record =>
    { compensates := true
      refusal := (record.activity.bind fun target => compensationReference options (site.reference target)) <|>
        if !record.waitForCompletion then some "throw.compensation.asynchronous" else none }
  | .cancel =>
    { raises := true, compensates := true
      refusal := match cancelSite with
        | .outside => some "throw.cancel.outsideTransaction"
        | .uncaught => some "throw.cancel.uncaught"
        | .caught => none }

def throwRecord (options : ProfileOptions) (site : ThrowSite) (cancelSite : CancelSite) (record : Throw) :
    Option String :=
  (throwReading options site cancelSite record).refusal

end Kernel.Admission.Propagation
