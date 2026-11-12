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

/-- The kernel runs a Transaction's compensate method (BPMN 2.0.2 Table 10.21); `compatibilityAsCompensate` runs the BPMN
1.1 compatibility methods `##Store` and `##Image` as it, as CIB, which reads no method (`BpmnParse.java:3902-3915`,
CIB-INT-0039). A protocol URI names a protocol-controlled Transaction, which PC-TX-01 excludes under every profile. -/
def transaction (methods : TransactionMethods) (payload : ScopePayload) : Option String :=
  (transaction? payload).bind fun record =>
    match record.method, methods with
    | .compensate, _ => none
    | .store, .compatibilityAsCompensate => none
    | .image, .compatibilityAsCompensate => none
    | .store, .compensateOnly => some "scope.transaction.method"
    | .image, .compensateOnly => some "scope.transaction.method"
    | .other _, _ => some "scope.transaction.method"

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

/-- Under `ScopeStart.required` (CIB-LIM-0024) an embedded Sub-Process or Transaction holds a start Event: CIB refuses
deploying a Sub-Process without one (`BpmnParse.java:967-968`) and fails entering such a Transaction, which has no
initial activity (`SubProcessActivityBehavior.java:41-43`). An Event Sub-Process always holds its triggering start. -/
def withoutStart (program : Program) (header : Header) (payload : ScopePayload) : Option String :=
  match program.options.scopeStart with
  | .implicit => none
  | .required =>
    if (eventSubProcess? payload).isNone && !(program.children (some header.id)).any (·.start?.isSome) then
      some "scope.withoutStart"
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
  else
    eventSubProcessBoundary payload <|> transaction program.options.transactionMethods payload <|> withoutStart program header payload <|>
      implicitStart program header

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
    ((element.envelope?.map (·.compensationHandlers)).getD []).all fun id => (program.element? id).isSome
  let called (process : CalledProcess) : Bool :=
    process.children.all fun child => parentOf child == some none
  if program.elements.all member && program.elements.all lists && program.elements.all handler &&
      program.processes.all called then none
  else some "il.reference"

/-- When a Sub-Process completes, the records retained in it pass to its compensation handler or, without one, to its
parent (BPMN 2.0.2 §13.5.5); that implicit compensation is contradictory while BPMN21-403 is open. A subject is refused
when the Scope retaining it hands its records to the parent occurrence, where a Compensation throw shares that parent,
unless `ImplicitCompensation.everySubProcess` keeps them there as the Scope's group (CIB-INT-0036). A Scope with a
handler keeps them for that handler, whose own throws compensate them recursively (§10.7.1). `throws` lists the
Compensation throws. -/
def handOn (program : Program) (throws : List Element) : Nat → Option ElementId → Option String
  | 0, _ => none
  | _, none => none
  | fuel + 1, some scope =>
    match program.element? scope with
    | none => none
    | some retaining =>
      match (retaining.envelope?.map (·.compensationHandlers)).getD [] with
      | [] =>
        match program.options.implicitCompensation with
        | .refused =>
          if throws.any (·.header.parent == retaining.header.parent) then some "compensation.implicit"
          else handOn program throws fuel retaining.header.parent
        | .everySubProcess => handOn program throws fuel retaining.header.parent
      | _ => none

def nestedCompensation (program : Program) (throws : List Element) (header : Header) (envelope : Envelope) :
    Option String :=
  if !envelope.compensationHandlers.isEmpty then handOn program throws (program.elements.length + 1) header.parent
  else none

/-- BPMN 2.0.2 §13.5.5: "If a Sub-Process A has a boundary Event connected to Activity B, then compensation of B MUST be
performed before compensation of A if that particular Event occurred." B's record shows only that B completed, so it
shows the Event occurred only when every incoming flow of B leaves a boundary of A; a compensable B with another
incoming flow beside one from a compensable A's boundary is refused, since its record cannot show which arrival it stems
from. -/
def boundaryDependency (program : Program) (envelope : Envelope) : Option String :=
  let hosts := envelope.incoming.map fun flow => ((program.source? flow).bind program.boundary?).map (·.1.header.id)
  let compensable (host : ElementId) : Bool :=
    ((program.element? host).bind (·.envelope?)).any fun hostEnvelope => !hostEnvelope.compensationHandlers.isEmpty
  if !envelope.compensationHandlers.isEmpty &&
      hosts.any fun host => host.any compensable && hosts.any (· != host) then
    some "compensation.dependency.boundary"
  else none

end Kernel.Admission.Scopes
