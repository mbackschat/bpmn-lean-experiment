module

public import Kernel.Hooks

/-! # Flow: starts, gateways and Links

Owns matching on `GatewayKind` and `Leave`, and is the only module that adds flow tokens (guard 17): every occurrence
leaves through `outflow`. Gateway semantics follow [BPMN 2.0.2 §13.4](../../docs/reference/bpmn-2.0.2/README.md):

- Exclusive (§13.4.2): the first true candidate in document order, else the default.
- Parallel (§13.4.1): a gateway with more than one incoming flow waits until every incoming flow holds a token in
  the same scope occurrence, consumes one token from each and emits on every outgoing flow.
- Inclusive (§13.4.3): a join fires once at least one incoming flow holds a token and no token still upstream in
  the same scope occurrence can reach an incoming flow that holds none; it consumes one token from each filled
  flow. A split takes every true candidate, else the default.
- Event-Based (§13.4.4): the gateway's occurrence stays open and `Hooks.armGateway` opens the arms; the arm that fires
  completes it.

Each token that reaches a join is its own occurrence, parked in `state.slots.parked` until the join fires; then every
consumed occurrence completes, one with the outgoing flows and the others with none, since a join ends one activity
instance per joined execution (CIB `ParallelGatewayActivityBehavior`, `PvmExecutionImpl.leaveActivityViaTransitions`).

An element's own selection (`ownFlows`) is an inclusive choice over its outgoing flows, which only an Activity's or a
Scope's may condition. A diverging gateway or an Activity that finds no outgoing flow rolls the command back.

A parked Inclusive join also fires when no token arrives at it: Table 13.3 activates it by the state, and `Step.settle`
offers the parked joins again once the closure is otherwise quiescent (`Step.reoffer?`).
-/

public section

namespace Kernel.Feature.Flow

def signalComplete (state : State) (id : Nat) (leave : Leave) : State :=
  state.signal (.complete id leave [] .outward)

/-- A candidate's condition, read from its Sequence Flow; an unconditioned candidate holds. A failing or non-Boolean
condition rolls the command back, as CIB's `UelExpressionCondition` does (CIB-OP-0004); Simple Boolean never fails. -/
def condition (ctx : Ctx) (context : EvalContext) (candidate : FlowId) : Except Failure Bool :=
  match ctx.program.flow? candidate with
  | none => .error (.semanticFailure "gateway-candidate-without-flow")
  | some flow =>
    match flow.condition with
    | none => .ok true
    | some condition =>
      match ctx.evaluate context condition with
      | .value (.bool value) => .ok value
      | .value _ => .error (.rolledBack "condition-not-boolean")
      | .failure code => .error (.rolledBack code)
      | .unsupported code => .error (.unsupported code)

/-- The flows an inclusive choice takes: every candidate whose condition holds, else the default; with neither the
command rolls back with `noFlow`. A choice without candidates takes all of `outgoing`, which are unconditioned. -/
def inclusiveChoice (ctx : Ctx) (context : EvalContext) (candidates : List FlowId) (default : Option FlowId)
    (outgoing : List FlowId) (noFlow : String) : Except Failure (List FlowId) := do
  if candidates.isEmpty then return outgoing
  let chosen ← candidates.filterM (condition ctx context)
  match chosen, default with
  | [], some flow => .ok [flow]
  | [], none => .error (.rolledBack noFlow)
  | flows, _ => .ok flows

/-- The flows an element's own selection takes. Several outgoing flows of an Activity form a parallel split, conditioned
ones an inclusive split, and a mix of both (BPMN 2.0.2 §13.3.1, Figure 13.1): every flow whose condition holds or that
has none, the default only when no other flow is taken (§10.3.1 `default`), and, when it takes none, Table 13.3's
exception, read as a rollback (CIB-INT-0012; CIB `BpmnActivityBehavior#performOutgoingBehavior`). Admission puts
conditions and a default only on Activities' and Scopes' flows, so every other element takes all its flows. -/
def ownFlows (ctx : Ctx) (element : Element) (context : EvalContext) : Except Failure (List FlowId) :=
  let default := element.envelope?.bind (·.defaultFlow)
  inclusiveChoice ctx context (element.outgoing.filter (some · != default)) default element.outgoing
    "activity-no-outgoing-flow"


/-- The first candidate whose condition holds. -/
def firstTrue (ctx : Ctx) (context : EvalContext) : List FlowId → Except Failure (Option FlowId)
  | [] => .ok none
  | candidate :: rest => do
    if ← condition ctx context candidate then .ok (some candidate) else firstTrue ctx context rest

def exclusive (ctx : Ctx) (candidates : List FlowId) (default : Option FlowId) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let chosen ← firstTrue ctx (state.evalContext occurrence.scope) candidates
  match chosen <|> default with
  | some flow => .ok (signalComplete state occurrence.id (.flows [flow]))
  | none => .error (.rolledBack "exclusive-gateway-no-outgoing-flow")

/-- The flows an inclusive split takes. A gateway that lists no candidates is a pure join. -/
def inclusiveFlows (ctx : Ctx) (candidates : List FlowId) (default : Option FlowId) (outgoing : List FlowId)
    (scope : ScopeOccurrenceId) (state : State) : Except Failure (List FlowId) :=
  inclusiveChoice ctx (state.evalContext scope) candidates default outgoing "inclusive-gateway-no-outgoing-flow"

/-- `Hooks.select`. Under `ConditionOrder.beforeOutputs` a completion's outgoing conditions are evaluated before its
output writes, from inside the scope occurrence it still owns, which holds an Activity's locals (CIB-INT-0011); under
BPMN order `outflow` resolves the leave after the writes. -/
def select (ctx : Ctx) (occurrence : Occurrence) (leave : Leave) (state : State) : Except Failure Leave :=
  match ctx.program.options.conditionOrder, leave with
  | .afterOutputs, _ => .ok leave
  | .beforeOutputs, .flows _ => .ok leave
  | .beforeOutputs, .raised => .ok leave
  | .beforeOutputs, .outgoing =>
    match ctx.program.element? occurrence.element with
    | none => .error (.semanticFailure "outflow-without-element")
    | some element => do
      let inside := ((state.scopes.find? (·.occurrence == some occurrence.id)).map (·.id)).getD occurrence.scope
      .ok (.flows (← ownFlows ctx element (state.evalContext inside)))

/-- The flows a position held by `element` continues on: its outgoing flows and, under the standards reach, its Boundary
Events' flows, since an attached Event can still fire (BPMN 2.0.2 §10.5.4); CIB's `isReachable` follows outgoing
transitions only (CIB-INT-0020). -/
def leaving (ctx : Ctx) (element : Element) : List FlowId :=
  match element.envelope?, ctx.program.options.inclusiveJoinReach with
  | some envelope, .withBoundaries => envelope.outgoing ++ envelope.boundaries.flatMap (·.outgoing)
  | some envelope, .outgoingOnly => envelope.outgoing
  | none, _ => element.outgoing

/-- The Link catch Events named `name` on the level of `header`'s element. -/
def linkCatches (program : Program) (header : Header) (name : String) : List (Header × EventPayload) :=
  (program.siblings header).filterMap fun element =>
    element.event?.bind fun (header, payload) =>
      if payload.linkCatch? == some name then some (header, payload) else none

/-- The flows a token continues on after reaching `element`; a throwing Link continues at its catching Links. -/
def successors (ctx : Ctx) (element : Element) : List FlowId :=
  match element.event?.bind fun (header, payload) => payload.linkThrow?.map (header, ·) with
  | some (header, name) => (linkCatches ctx.program header name).flatMap (·.2.outgoing)
  | none => leaving ctx element

/-- Whether a token on one of `start` can reach one of `targets` without passing through `gateway`. -/
def reaches (ctx : Ctx) (gateway : ElementId) (targets start : List FlowId) : Bool :=
  let program := ctx.program
  let rec go (fuel : Nat) (frontier seen : List FlowId) : Bool :=
    match fuel, frontier with
    | _, [] => false
    -- The fuel bounds every visit of every flow by every edge into it, so it is never exhausted; running out
    -- answers "reachable", which only keeps the join waiting.
    | 0, _ :: _ => true
    | fuel + 1, flow :: rest =>
      if targets.contains flow then true
      else if seen.contains flow then go fuel rest seen
      else
        let next := match program.target? flow with
          | some target =>
            if target == gateway then [] else ((program.element? target).map (successors ctx)).getD []
          | none => []
        go fuel (rest ++ next) (flow :: seen)
  go ((program.flows.length + 1) * (program.flows.length + 1)) start []

/-- The flows from which the remaining work of scope occurrence `scope` continues, excluding the tokens parked at
`gateway`: queued tokens, the elements of open items and child scope occurrences, and tokens parked at other
joins. A passive item keeps nothing alive and is no position; a boundary item is no element, and its host's
position covers the boundary's flows as far as `leaving` follows them. -/
def positions (ctx : Ctx) (state : State) (gateway : ElementId) (scope : ScopeOccurrenceId) :
    List FlowId :=
  let program := ctx.program
  let continuing (element : ElementId) := ((program.element? element).map (successors ctx)).getD []
  let queued := (state.tokens.filter (·.busyScope == scope)).filterMap (·.arrivalFlow?)
  let items := (state.openItems.filter fun item => item.scope == scope && !item.passive)
    |>.flatMap (continuing ·.element)
  let children := (state.scopes.filter (·.parent == some scope)).flatMap fun child =>
    (child.element.map continuing).getD []
  let parked := (state.slots.parked.filter fun waiting =>
      waiting.scope == scope && program.target? waiting.flow != some gateway).flatMap fun waiting =>
    ((program.target? waiting.flow).map continuing).getD []
  queued ++ items ++ children ++ parked

def park (state : State) (waiting : Parked) : State :=
  { state with slots := { state.slots with parked := state.slots.parked ++ [waiting] } }

def filled (state : State) (incoming : List FlowId) (scope : ScopeOccurrenceId) : List FlowId :=
  incoming.filter fun flow => state.slots.parked.any fun waiting => waiting.flow == flow && waiting.scope == scope

/-- The occurrences a firing join consumes: the first parked on each filled flow. -/
def consumed (state : State) (incoming : List FlowId) (scope : ScopeOccurrenceId) : List Parked :=
  incoming.filterMap fun flow => state.slots.parked.find? fun waiting => waiting.flow == flow && waiting.scope == scope

def unpark (state : State) (consumed : List Parked) : State :=
  { state with slots := { state.slots with parked := state.slots.parked.filter (!consumed.contains ·) } }

/-- Park the occurrence at a join, unless `Step.reoffer?` offers one already parked, and fire when `ready` holds; a gateway
with one incoming flow passes it on. When the join fires, the offered occurrence, if consumed, is the one that leaves
with the flows and the others end with none. -/
def join (occurrence : Occurrence) (incoming : List FlowId) (state : State) (ready : State → Bool)
    (flows : State → Except Failure (List FlowId)) : Outcome := do
  let some flow := occurrence.incoming | .error (.semanticFailure "gateway-without-flow")
  if incoming.length ≤ 1 then .ok (signalComplete state occurrence.id (.flows (← flows state)))
  else
    let parked := if state.slots.parked.any (·.occurrence == occurrence.id) then state
      else park state { occurrence := occurrence.id, flow, scope := occurrence.scope }
    if !ready parked then .ok parked
    else
      let consumed := consumed parked incoming occurrence.scope
      let unparked := unpark parked consumed
      let selected ← flows unparked
      let firing :=
        if consumed.any (·.occurrence == occurrence.id) then occurrence.id
        else (consumed.getLast?.map (·.occurrence)).getD occurrence.id
      let others := (consumed.map (·.occurrence)).filter (· != firing)
      .ok (signalComplete (others.foldl (signalComplete · · (.flows [])) unparked) firing (.flows selected))

def arriveGateway (ctx : Ctx) (header : Header) (payload : GatewayPayload) (occurrence : Occurrence) (state : State) :
    Outcome :=
  let scope := occurrence.scope
  match payload.kind with
  | .exclusive candidates default => exclusive ctx candidates default occurrence state
  | .parallel =>
    join occurrence payload.incoming state
      (fun parked => (filled parked payload.incoming scope).length == payload.incoming.length)
      (fun _ => .ok payload.outgoing)
  | .inclusive candidates default =>
    join occurrence payload.incoming state
      (fun parked =>
        let empty := payload.incoming.filter (!(filled parked payload.incoming scope).contains ·)
        !reaches ctx header.id empty (positions ctx parked header.id scope))
      (inclusiveFlows ctx candidates default payload.outgoing scope)
  -- Admission admits only a non-instantiating gateway (`gateway.eventBased.instantiate`).
  | .eventBased _ => .ok (state.signal (.armGateway occurrence.id header.id scope))

/-- The order a split's tokens are queued in. `Step.settle` takes the newest token first under
`BranchSchedule.declarationDepthFirst`, so the flows are queued reversed and the first-declared branch runs first, each to
its next wait, join or end, as CIB reverses its outgoing executions for a LIFO queue (CIB-OP-0016). -/
def queued (ctx : Ctx) (flows : List FlowId) : List FlowId :=
  match ctx.program.options.branchSchedule with
  | .orderInvariant => flows
  | .declarationDepthFirst => flows.reverse

/-- `Hooks.outflow`: the only place flow tokens are added. An element's own selection is `ownFlows`, read after the
completion's writes. -/
def outflow (ctx : Ctx) (occurrence : Occurrence) (leave : Leave) (state : State) : Outcome :=
  match leave with
  | .flows selected => .ok (state.emit (queued ctx selected) occurrence.scope)
  | .outgoing =>
    match ctx.program.element? occurrence.element with
    | some element => do
      let selected ← ownFlows ctx element (state.evalContext occurrence.scope)
      .ok (state.emit (queued ctx selected) occurrence.scope)
    | none => .error (.semanticFailure "outflow-without-element")
  | .raised => .error (.semanticFailure "outflow-of-raised-occurrence")

/-- A throwing Link continues at the catching Link of the same name in the same process level or Sub-Process
(BPMN 2.0.2 §10.5.6); a catching Link reached by a flow passes the token on. -/
def arriveLink (ctx : Ctx) (header : Header) (payload : EventPayload) (occurrence : Occurrence) (state : State) :
    Outcome :=
  match payload.linkThrow? with
  | some name =>
    match linkCatches ctx.program header name with
    | [(_, target)] => .ok (signalComplete state occurrence.id (.flows target.outgoing))
    | [] => .error (.semanticFailure "link-without-catch")
    | _ :: _ :: _ => .error (.semanticFailure "link-ambiguous-catch")
  | none => .ok (signalComplete state occurrence.id .outgoing)

end Kernel.Feature.Flow
