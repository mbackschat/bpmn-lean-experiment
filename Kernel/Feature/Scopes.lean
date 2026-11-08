module

public import Kernel.Hooks

/-! # Scopes: Sub-Processes, Transactions and Event Sub-Processes

Owns matching on `ScopeKind`. Entering a Scope activates its element, evaluates its input mappings against the
variables visible from the parent occurrence and makes them the new occurrence's local variables, arms the Scope's
boundaries and Event Sub-Process starts, and emits the outgoing flows of its start Event inside the occurrence. A
re-entered Scope is a fresh occurrence with a fresh activation and freshly evaluated locals.

Completing a Scope evaluates its output mappings against the variables visible inside the occurrence, leaves the
occurrence with everything in it, disarms its boundaries, writes the outputs from the parent outward and emits the
Scope's outgoing flows in the parent. A Transaction that completes normally completes like an embedded
Sub-Process; its cancellation belongs to `Kernel.Feature.Propagation`.
-/

public section

namespace Kernel.Feature.Scopes

/-- `Ctx.eventStart`: the start subscription and interrupting flag of an Event Sub-Process. -/
def eventStart (payload : ScopePayload) : Option (Subscription × Bool) :=
  match payload.kind with
  | .eventSubProcess start interrupting => some (start, interrupting)
  | .embedded => none
  | .transaction => none

/-- The start Event whose outgoing flows begin an occurrence of `scope`: the triggered start of an Event
Sub-Process, the none start of any other Scope. -/
def innerStart? (ctx : Ctx) (scope : ElementId) (payload : ScopePayload) : Option StartPayload :=
  let starts := (ctx.program.children (some scope)).filterMap fun child => child.start?.map (·.2)
  match payload.kind with
  | .eventSubProcess _ _ => starts.find? (·.subscription.isSome)
  | .embedded => starts.find? (·.subscription.isNone)
  | .transaction => starts.find? (·.subscription.isNone)

def enter (ctx : Ctx) (header : Header) (payload : ScopePayload) (parent : ScopeOccurrenceId)
    (extra : List (String × Value)) (state : State) : Outcome := do
  let locals ← ctx.evaluateMappings (state.visible parent) payload.envelope.inputs
  let (state, occurrence) := state.enterScope header.id parent (locals ++ extra)
  let state :=
    if payload.envelope.boundaries.isEmpty then state else state.signal (.arm occurrence.value header.id parent)
  let state := state.signal (.armScope occurrence)
  match innerStart? ctx header.id payload with
  | some start => .ok (state.emit start.outgoing occurrence)
  | none => .error (.semanticFailure "scope-without-start-event")

def arriveScope (ctx : Ctx) (header : Header) (payload : ScopePayload) (arrival : Arrival) (state : State) :
    Outcome :=
  if payload.envelope.multiInstance.isSome then .error (.unsupported "scope-multi-instance")
  else
    match payload.kind with
    | .embedded => enter ctx header payload arrival.scope [] state
    | .transaction => enter ctx header payload arrival.scope [] state
    | .eventSubProcess _ _ => .error (.semanticFailure "flow-into-event-subprocess")

def completeScope (ctx : Ctx) (_ : Header) (payload : ScopePayload) (occurrence : ScopeOccurrence)
    (state : State) : Outcome := do
  let parent ← match occurrence.parent with
    | some parent => .ok parent
    | none => .error (.semanticFailure "scope-occurrence-without-parent")
  let outputs ← ctx.evaluateMappings (state.visible occurrence.id) payload.envelope.outputs
  let left := (state.leaveScope occurrence.id).disarm occurrence.id.value
  let written := outputs.foldl (fun state binding => state.writeOutward parent binding) left
  .ok (written.emit payload.envelope.outgoing parent)

/-- `Signal.startEventSubProcess`. An interrupting Event Sub-Process first clears its parent occurrence, its other
Event Sub-Process starts included ([BPMN 2.0.2 §13.5.4](../../docs/reference/bpmn-2.0.2/README.md)); the
parent's own boundaries stay armed in the grandparent until the parent completes. -/
def startEventSubProcess (ctx : Ctx) (element : ElementId) (parent : ScopeOccurrenceId)
    (variables : List (String × Value)) (state : State) : Outcome :=
  match (ctx.program.element? element).bind (·.scope?) with
  | none => .error (.semanticFailure "event-subprocess-without-scope")
  | some (header, payload) =>
    match payload.kind with
    | .eventSubProcess _ interrupting =>
      enter ctx header payload parent variables (if interrupting then state.clearInside parent else state)
    | .embedded => .error (.semanticFailure "event-subprocess-not-event-subprocess")
    | .transaction => .error (.semanticFailure "event-subprocess-not-event-subprocess")

end Kernel.Feature.Scopes
