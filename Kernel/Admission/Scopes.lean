module

public import Kernel.IL.Types

/-! # Admission of Scopes and scope membership. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Scopes

/-- Whether the Activity is begun by its parent Scope's implicit start. -/
def implicitChild (program : Program) (header : Header) : Bool :=
  match header.parent with
  | none => false
  | some parent =>
    let children := program.children (some parent)
    !children.any (·.start?.isSome) && children.any fun child => child.header.id == header.id && program.beginsImplicitly child

/-- A Scope without a none start Event begins its Activities without incoming flow; a Gateway or Event without one would
also begin (§13.3.4), which the kernel has no token for. -/
def implicitStart (program : Program) (header : Header) : Option String :=
  let children := program.children (some header.id)
  if children.any (·.start?.isSome) then none
  else if children.any fun child => program.beginsImplicitly child && child.activity?.isNone && child.scope?.isNone then
    some "scope.implicitStart"
  else none

/-- The Transaction a Scope is, `none` for any other Scope. -/
def transaction? (payload : ScopePayload) : Option TransactionScope :=
  match payload.kind with
  | .transaction record => some record
  | .embedded => none
  | .eventSubProcess _ _ => none

/-- The start subscription of an Event Sub-Process and whether it interrupts, `none` for any other Scope. -/
def eventSubProcess? (payload : ScopePayload) : Option (Subscription × Bool) :=
  match payload.kind with
  | .eventSubProcess start interrupting => some (start, interrupting)
  | .embedded => none
  | .transaction _ => none

/-- A Transaction's method is carried only by BPMN; the kernel runs the compensate method (`BpmnParse#parseTransaction`
reads no such attribute). -/
def transaction (payload : ScopePayload) : Option String :=
  (transaction? payload).bind fun record =>
    if record.method == .compensate then none else some "scope.transaction.method"

def isTransaction (payload : ScopePayload) : Bool :=
  (transaction? payload).isSome

/-- Whether an element is a Transaction. -/
def transactionElement (program : Program) (id : ElementId) : Bool :=
  ((program.element? id).bind (·.scope?)).any fun (_, payload) => isTransaction payload

/-- The start subscription of an interrupting Event Sub-Process, `none` for any other Scope. -/
def interruptingStart (payload : ScopePayload) : Option Subscription :=
  (eventSubProcess? payload).bind fun (start, interrupting) => if interrupting then some start else none

/-- An Event Sub-Process is outside normal flow (BPMN 2.0.2 §10.3.5); a boundary on it would lead its exception flow
into the parent's normal flow, which §13.5.4 does not give. -/
def eventSubProcessBoundary (payload : ScopePayload) : Option String :=
  if (eventSubProcess? payload).isSome && !payload.envelope.boundaries.isEmpty then some "scope.eventSubProcess.boundary"
  else none

/-- A local variable is declared by an input mapping; a declared local without one has no initial value the
kernel could choose. An embedded Sub-Process may loop, which `Kernel.Admission.MultiInstance` admits (PC-MI-04 to
PC-MI-06); a looping Transaction (PC-TX) or Event Sub-Process, which BPMN 2.0.2 §10.3.5 starts by its event, is
refused. -/
def scope (program : Program) (header : Header) (payload : ScopePayload) : Option String :=
  let declared := payload.envelope.inputs.map (·.target)
  if payload.envelope.multiInstance.isSome && (isTransaction payload || (eventSubProcess? payload).isSome) then
    some "scope.multiInstance"
  else if payload.localVariables.any (!declared.contains ·) then some "scope.localVariableWithoutInput"
  else eventSubProcessBoundary payload <|> transaction payload <|> implicitStart program header

/-- Every parent is a Scope that lists the element as a child, every child a Scope lists, an element or a boundary of
one, sits in that Scope, a called process lists only process-level children, and a compensation handler names an
element: an element outside its parent's list, or listed by a Scope it does not sit in, would be begun or cleared by one
owner and not the other. -/
def membership (program : Program) : Option String :=
  let parentOf (id : ElementId) : Option (Option ElementId) :=
    match program.element? id with
    | some element => some element.header.parent
    | none => (program.boundary? id).map (·.1.header.parent)
  let member (element : Element) : Bool :=
    element.header.parent.all fun parent =>
      ((program.element? parent).bind (·.scope?)).any (·.2.children.contains element.header.id)
  let lists (element : Element) : Bool :=
    element.scope?.all fun (header, payload) =>
      payload.children.all fun child => parentOf child == some (some header.id)
  let handler (element : Element) : Bool :=
    (element.envelope?.bind (·.compensationHandler)).all fun id => (program.element? id).isSome
  let called (process : CalledProcess) : Bool :=
    process.children.all fun child => parentOf child == some none
  if program.elements.all member && program.elements.all lists && program.elements.all handler &&
      program.processes.all called then none
  else some "il.reference"

/-- Whether `id` lies in the subtree of `ancestor`, itself included. -/
def within (program : Program) (ancestor : ElementId) : Nat → Option ElementId → Bool
  | 0, _ => false
  | _, none => false
  | fuel + 1, some id => id == ancestor || within program ancestor fuel ((program.element? id).bind (·.header.parent))

/-- When a Sub-Process completes, the records retained in it pass to its compensation handler or, without one, to its
parent (BPMN 2.0.2 §13.5.5); that implicit and recursive compensation is contradictory while BPMN21-403 is open. A
subject is refused when the Scope retaining it can hand its records on: to the parent occurrence, where a Compensation
throw shares that parent, or to the Scope's handler, whose body throws Compensation (PC-COMPENSATION-03).
`throws` lists the Compensation throws. -/
def handOn (program : Program) (throws : List Element) : Nat → Option ElementId → Option String
  | 0, _ => none
  | _, none => none
  | fuel + 1, some scope =>
    match program.element? scope with
    | none => none
    | some retaining =>
      match retaining.envelope?.bind (·.compensationHandler) with
      | some handler =>
        if throws.any fun thrower => within program handler (program.elements.length + 1) (some thrower.header.id) then
          some "compensation.recursive"
        else none
      | none =>
        if throws.any (·.header.parent == retaining.header.parent) then some "compensation.implicit"
        else handOn program throws fuel retaining.header.parent

def nestedCompensation (program : Program) (throws : List Element) (header : Header) (envelope : Envelope) :
    Option String :=
  if envelope.compensationHandler.isSome then handOn program throws (program.elements.length + 1) header.parent
  else none

end Kernel.Admission.Scopes
