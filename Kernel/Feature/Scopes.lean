module

public import Kernel.Hooks

/-! # Scopes: Sub-Processes, Transactions and Event Sub-Processes

Owns matching on `ScopeKind`. Entering a Scope evaluates its input mappings against the variables visible from the
parent occurrence and makes them the new occurrence's local variables, arms the Scope's boundaries and Event
Sub-Process starts, and begins its start Event inside the occurrence. A re-entered Scope is a fresh occurrence with a
fresh activation and freshly evaluated locals.

An idle Scope evaluates its output mappings against the variables visible inside the occurrence and completes through
the pipeline, which leaves the occurrence, writes the outputs from the parent outward and takes the Scope's outgoing
flows. A Transaction that completes normally completes like an embedded Sub-Process; its cancellation belongs to
`Kernel.Feature.Propagation` and `Kernel.Feature.Compensation`.
-/

public section

namespace Kernel.Feature.Scopes

/-- `Ctx.eventStart`: the start subscription and interrupting flag of an Event Sub-Process. -/
def eventStart (payload : ScopePayload) : Option (Subscription × Bool) :=
  match payload.kind with
  | .eventSubProcess start interrupting => some (start, interrupting)
  | .embedded => none
  | .transaction _ => none

/-- The start Event that begins an occurrence of `scope`: the triggered start of an Event Sub-Process, the none start
of any other Scope. -/
def innerStart? (ctx : Ctx) (scope : ElementId) (payload : ScopePayload) : Option ElementId :=
  let starts : List (Header × StartPayload) := (ctx.program.children (some scope)).filterMap Element.start?
  let chosen : Option (Header × StartPayload) := match payload.kind with
    | .eventSubProcess _ _ => starts.find? (·.2.subscription.isSome)
    | .embedded => starts.find? (·.2.subscription.isNone)
    | .transaction _ => starts.find? (·.2.subscription.isNone)
  chosen.map (·.1.id)

/-- The children that begin when a Scope without a start Event is entered (`Program.beginsImplicitly`). A Gateway or
Event among them is refused (`scope.implicitStart` at admission). -/
def implicitStart (ctx : Ctx) (scope : ElementId) : Except Failure (List ElementId) :=
  (ctx.program.children (some scope)).foldlM (fun begun child =>
    if !ctx.program.beginsImplicitly child then .ok begun
    else if child.activity?.isSome || child.scope?.isSome then .ok (begun ++ [child.header.id])
    else .error (.unsupported "scope-implicit-start")) []

def enter (ctx : Ctx) (header : Header) (payload : ScopePayload) (occurrence : Occurrence) (entry : ScopeEntry)
    (state : State) : Outcome := do
  let locals ← ctx.requireMappings (state.evalContext occurrence.scope) payload.envelope.inputs
  let (state, scope) := state.enterScope header.id occurrence.scope (locals ++ entry.locals) (some occurrence.id)
  let state :=
    if payload.envelope.boundaries.isEmpty || payload.envelope.multiInstance.isSome then state
    else state.signal (.arm occurrence.id header.id occurrence.scope)
  let state := state.signal (.armScope scope)
  match innerStart? ctx header.id payload with
  | some start => .ok (state.signal (.begin { element := start, scope, reserved := entry.inner }))
  | none =>
    match ← implicitStart ctx header.id with
    | [] => .error (.semanticFailure "scope-without-start-event")
    | begun => .ok (begun.foldl (fun state element => state.signal (.begin { element, scope })) state)

/-- A Scope's occurrence began. An interrupting Event Sub-Process first clears its parent occurrence, its other Event
Sub-Process starts included ([BPMN 2.0.2 §13.5.4](../../docs/reference/bpmn-2.0.2/README.md)), keeping its own
occurrence and its start Event's reservation; the parent's own boundaries stay armed in the grandparent until the
parent completes. -/
def arriveScope (ctx : Ctx) (header : Header) (payload : ScopePayload) (occurrence : Occurrence) (entry : ScopeEntry)
    (state : State) : Outcome :=
  match payload.kind with
  | .embedded => enter ctx header payload occurrence entry state
  | .transaction _ => enter ctx header payload occurrence entry state
  | .eventSubProcess _ interrupting =>
    if occurrence.incoming.isSome then .error (.semanticFailure "flow-into-event-subprocess")
    else
      let cleared := if interrupting then state.clearInside occurrence.scope (occurrence.id :: entry.inner.toList) else state
      enter ctx header payload occurrence entry cleared

def completeScope (ctx : Ctx) (_ : Header) (payload : ScopePayload) (scope : ScopeOccurrence) (owner : Occurrence)
    (state : State) : Outcome := do
  let outputs ← ctx.requireMappings (state.evalContext scope.id) payload.envelope.outputs
  .ok (state.signal (.complete owner.id .outgoing outputs .outward))

end Kernel.Feature.Scopes
