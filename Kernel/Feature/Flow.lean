module

public import Kernel.Hooks

/-! # Flow: starts, gateways and Links

Owns matching on `GatewayKind`. Gateway semantics follow [BPMN 2.0.2 §13.4](../../docs/reference/bpmn-2.0.2/README.md):

- Exclusive (§13.4.2): the first true candidate in document order, else the default.
- Parallel (§13.4.1): a gateway with more than one incoming flow waits until every incoming flow holds a token in
  the same scope occurrence, consumes one token from each and emits on every outgoing flow.
- Inclusive (§13.4.3): a join fires once at least one incoming flow holds a token and no token still upstream in
  the same scope occurrence can reach an incoming flow that holds none; it consumes one token from each filled
  flow. A split takes every true candidate, else the default.
- Event-Based (§13.4.4): the token is consumed and `Hooks.armGateway` opens the arms.

A diverging gateway that finds no outgoing flow rolls the command back, as the frozen evaluator's closure does
(`internal-choice-schedule.ts`, the exclusive-choice-without-default baseline).

Waiting tokens are parked in `state.slots.parked` on the incoming flow they arrived on, so `Step` keeps their scope
occurrence alive.
-/

public section

namespace Kernel.Feature.Flow

/-- A start Event emits on its outgoing flows whether it is a none start or a triggered one: a triggered start's
trigger is already consumed by the input that names it. -/
def startProcess (_ : Ctx) (_ : Header) (payload : StartPayload) (state : State) : Outcome :=
  .ok (state.emit payload.outgoing State.root)

def condition (ctx : Ctx) (variables : List (String × Value)) (candidate : ConditionalFlow) :
    Except Failure Bool :=
  match candidate.condition with
  | none => .ok true
  | some condition =>
    match ctx.evaluate variables condition with
    | .value (.bool value) => .ok value
    | .value _ => .error (.semanticFailure "condition-not-boolean")
    | .needsHost => .error (.unsupported "host-evaluation")
    | .failure code => .error (.semanticFailure code)

/-- The first candidate whose condition holds; an unconditioned candidate holds. -/
def firstTrue (ctx : Ctx) (variables : List (String × Value)) :
    List ConditionalFlow → Except Failure (Option FlowId)
  | [] => .ok none
  | candidate :: rest => do
    if ← condition ctx variables candidate then .ok (some candidate.flow) else firstTrue ctx variables rest

def exclusive (ctx : Ctx) (candidates : List ConditionalFlow) (default : Option FlowId) (scope : ScopeOccurrenceId)
    (state : State) : Outcome := do
  let chosen ← firstTrue ctx (state.visible scope) candidates
  match chosen <|> default with
  | some flow => .ok (state.emit [flow] scope)
  | none => .error (.rolledBack "exclusive-gateway-no-outgoing-flow")

/-- An inclusive split. A gateway that lists no candidates is a pure join whose outgoing flows are unconditioned
(the lowering lists candidates only for a diverging gateway), so it emits on all of them. -/
def inclusiveSplit (ctx : Ctx) (candidates : List ConditionalFlow) (default : Option FlowId) (outgoing : List FlowId)
    (scope : ScopeOccurrenceId) (state : State) : Outcome := do
  if candidates.isEmpty then return state.emit outgoing scope
  let variables := state.visible scope
  let chosen ← candidates.filterM (condition ctx variables)
  match chosen.map (·.flow), default with
  | [], some flow => .ok (state.emit [flow] scope)
  | [], none => .error (.rolledBack "inclusive-gateway-no-outgoing-flow")
  | flows, _ => .ok (state.emit flows scope)

/-- The flows leaving an element, its boundaries' flows included. -/
def leaving (element : Element) : List FlowId :=
  match element.envelope? with
  | some envelope => envelope.outgoing ++ envelope.boundaries.flatMap (·.outgoing)
  | none =>
    ((element.event?.map (·.2.outgoing)) <|> (element.gateway?.map (·.2.outgoing)) <|>
      (element.start?.map (·.2.outgoing))).getD []

/-- The Link catch Events named `name` among the siblings of `parent`. -/
def linkCatches (program : Program) (parent : Option ElementId) (name : String) : List (Header × EventPayload) :=
  (program.children parent).filterMap fun element =>
    element.event?.bind fun (header, payload) =>
      if payload.linkCatch? == some name then some (header, payload) else none

/-- The flows a token continues on after reaching `element`; a throwing Link continues at its catching Links. -/
def successors (program : Program) (element : Element) : List FlowId :=
  match element.event?.bind fun (header, payload) => payload.linkThrow?.map (header, ·) with
  | some (header, name) => (linkCatches program header.parent name).flatMap (·.2.outgoing)
  | none => leaving element

/-- Whether a token on one of `start` can reach one of `targets` without passing through `gateway`. -/
def reaches (program : Program) (gateway : ElementId) (targets start : List FlowId) : Bool :=
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
            if target == gateway then [] else ((program.element? target).map (successors program)).getD []
          | none => []
        go fuel (rest ++ next) (flow :: seen)
  go ((program.flows.length + 1) * (program.flows.length + 1)) start []

/-- The flows from which the remaining work of scope occurrence `scope` continues, excluding the tokens parked at
`gateway`: queued tokens, the elements of open items and child scope occurrences, and tokens parked at other
joins. A passive item keeps nothing alive and is no position; a boundary item is no element, and its host's
position already covers the boundary's flows. -/
def positions (program : Program) (state : State) (gateway : ElementId) (scope : ScopeOccurrenceId) :
    List FlowId :=
  let continuing (element : ElementId) := ((program.element? element).map (successors program)).getD []
  let queued := (state.tokens.filter (·.scope == scope)).map (·.flow)
  let items := (state.openItems.filter fun item => item.scope == scope && !item.passive)
    |>.flatMap (continuing ·.element)
  let children := (state.scopes.filter (·.parent == some scope)).flatMap fun child =>
    (child.element.map continuing).getD []
  let parked := (state.slots.parked.filter fun token =>
      token.scope == scope && program.target? token.flow != some gateway).flatMap fun token =>
    ((program.target? token.flow).map continuing).getD []
  queued ++ items ++ children ++ parked

def park (state : State) (arrival : Arrival) : State :=
  { state with slots := { state.slots with parked := state.slots.parked ++ [{ flow := arrival.flow, scope := arrival.scope }] } }

/-- Remove one parked token from each of `flows` in `scope`. -/
def unpark (state : State) (flows : List FlowId) (scope : ScopeOccurrenceId) : State :=
  let parked := flows.foldl (fun parked flow =>
    let (before, after) := parked.span fun token => !(token.flow == flow && token.scope == scope)
    before ++ after.drop 1) state.slots.parked
  { state with slots := { state.slots with parked } }

def filled (state : State) (incoming : List FlowId) (scope : ScopeOccurrenceId) : List FlowId :=
  incoming.filter fun flow => state.slots.parked.any fun token => token.flow == flow && token.scope == scope

/-- Park the arrival at a join and fire when `ready` holds; a gateway with one incoming flow passes it on. -/
def join (incoming : List FlowId) (arrival : Arrival) (state : State) (ready : State → Bool)
    (fire : State → Outcome) : Outcome :=
  if incoming.length ≤ 1 then fire state
  else
    let parked := park state arrival
    if ready parked then fire (unpark parked (filled parked incoming arrival.scope) arrival.scope)
    else .ok parked

def arriveGateway (ctx : Ctx) (header : Header) (payload : GatewayPayload) (arrival : Arrival) (state : State) :
    Outcome :=
  let scope := arrival.scope
  match payload.kind with
  | .exclusive candidates default => exclusive ctx candidates default scope state
  | .parallel =>
    join payload.incoming arrival state
      (fun parked => (filled parked payload.incoming scope).length == payload.incoming.length)
      (fun state => .ok (state.emit payload.outgoing scope))
  | .inclusive candidates default =>
    join payload.incoming arrival state
      (fun parked =>
        let empty := payload.incoming.filter (!(filled parked payload.incoming scope).contains ·)
        !reaches ctx.program header.id empty (positions ctx.program parked header.id scope))
      (inclusiveSplit ctx candidates default payload.outgoing scope)
  | .eventBased _ => .ok (state.signal (.armGateway header.id scope))

/-- A throwing Link continues at the catching Link of the same name in the same process level or Sub-Process
(BPMN 2.0.2 §10.5.6); a catching Link reached by a flow passes the token on. -/
def arriveLink (ctx : Ctx) (header : Header) (payload : EventPayload) (arrival : Arrival) (state : State) :
    Outcome :=
  match payload.linkThrow? with
  | some name =>
    match linkCatches ctx.program header.parent name with
    | [(_, target)] => .ok (state.emit target.outgoing arrival.scope)
    | [] => .error (.semanticFailure "link-without-catch")
    | _ :: _ :: _ => .error (.semanticFailure "link-ambiguous-catch")
  | none => .ok (state.emit payload.outgoing arrival.scope)

end Kernel.Feature.Flow
