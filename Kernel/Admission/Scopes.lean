module

public import Kernel.IL.Types

/-! # Admission of Scopes. A refusal carries a stable code. -/

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

/-- A Transaction's method is carried only by BPMN; the kernel runs the compensate method (`BpmnParse#parseTransaction`
reads no such attribute). -/
def transaction (payload : ScopePayload) : Option String :=
  match payload.kind with
  | .transaction record =>
    if record.method == .compensate then none else some "scope.transaction.method"
  | .embedded => none
  | .eventSubProcess _ _ => none

/-- The start subscription of an interrupting Event Sub-Process, `none` for any other Scope. -/
def interruptingStart (payload : ScopePayload) : Option Subscription :=
  match payload.kind with
  | .eventSubProcess start true => some start
  | .eventSubProcess _ false => none
  | .embedded => none
  | .transaction _ => none

/-- A local variable is declared by an input mapping; a declared local without one has no initial value the
kernel could choose. -/
def scope (program : Program) (header : Header) (payload : ScopePayload) : Option String :=
  let declared := payload.envelope.inputs.map (·.target)
  if payload.envelope.multiInstance.isSome then some "scope.multiInstance"
  else if payload.localVariables.any (!declared.contains ·) then some "scope.localVariableWithoutInput"
  else transaction payload <|> implicitStart program header

end Kernel.Admission.Scopes
