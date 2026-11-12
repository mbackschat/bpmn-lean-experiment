module

public import Kernel.Hooks

/-! # Subscriptions: Conditional Events

A Conditional catch, boundary, Event Sub-Process start or Event-Based Gateway arm is evaluated when it is armed and
whenever a write is offered to it ([specification](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#conditions));
it fires through a `Signal.fire`, so a firing that cancels another item first leaves that item's pending firing nothing
to fire. `Kernel.Feature.Subscriptions` arms and fires the items; this module owns when they fire.
-/

public section

namespace Kernel.Feature.Subscriptions

/-- `ownScope` of an open item: its host's own scope, else the item's scope. -/
def homeScope (state : State) (item : OpenItem) : ScopeOccurrenceId :=
  match item.attachedTo with
  | some host => state.ownScope host item.scope
  | none => item.scope

/-- A predicate's reading. An unknown variable or property makes it false where the read is reached, as CIB's
`UelExpressionCondition.tryEvaluate` swallows `PropertyNotFoundException` (`:57-67`); a non-Boolean result, `null`
included (`:51`), and any other failure roll the input back. -/
def predicateHolds (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) (condition : Expression) : Except Failure Bool :=
  match ctx.evaluate (state.evalContext ctx.program scope) condition with
  | .value (.bool value) => .ok value
  | .value _ => .error (.rolledBack "condition-not-boolean")
  | .failure code =>
    if code == "unknown-variable" || code == "juel.propertyNotFound" then .ok false else .error (.rolledBack code)
  | .unsupported code => .error (.unsupported code)

/-- Evaluate an open Conditional item: under `eachWrite` it fires whenever the predicate holds, under `edge` only when
it holds after an evaluation that did not, which the item records. The flag says whether the item fires; its firing is
enqueued once the evaluation's contests are resolved (`resolveContests`). -/
def evaluateItem (ctx : Ctx) (item : OpenItem) (trigger : ConditionTrigger) (state : State) :
    Except Failure (State × Bool) := do
  let some detail := item.kind.view.conditional | .ok (state, false)
  let value ← predicateHolds ctx state (homeScope state item) trigger.condition
  match ctx.program.options.conditionalRetrigger with
  | .eachWrite => .ok (state, value)
  | .edge =>
    let recorded := { state with openItems := state.openItems.map fun open_ =>
      if open_.id == item.id then { open_ with kind := .conditional { detail with lastValue := some value } } else open_ }
    .ok (recorded, value && detail.lastValue != some true)

/-- What an item does once open: a Conditional one is evaluated at once, where no filter applies
(`ConditionalEventDefinition.java:112-113`). The flag says whether it fires. -/
def armed (ctx : Ctx) (subscription : Subscription) (item : OpenItem) (state : State) : Except Failure (State × Bool) :=
  match subscription.trigger.condition? with
  | some trigger => evaluateItem ctx item trigger state
  | none => .ok (state, false)

/-- Enqueue the firing of each of `items`, in order, for the offered write `write` (`none` at arming). A firing goes
through `Signal.fire`, so one that an earlier firing withdrew finds nothing to fire. -/
def fireAll (write : Option WriteEvent) (items : List OpenItem) (state : State) : State :=
  items.foldl (fun state item => state.signal (.fire item.id (.condition write))) state

/-- What firing an item withdraws at once, the same removal its firing makes (`fireBoundary`, `fireCatch`,
`fireEventStart`). -/
inductive Withdrawal where
  /-- An interrupting boundary: whatever its host occurrence's cancellation removes, the host's other boundaries and
  everything inside the host. -/
  | host (occurrence : Nat)
  /-- An Event-Based Gateway arm: its gateway's arms. -/
  | arms (gateway : Nat)
  /-- An interrupting Event Sub-Process start: everything inside its scope occurrence. -/
  | inside (scope : ScopeOccurrenceId)

/-- Apply a withdrawal to `state`. -/
def Withdrawal.withdrawFrom : Withdrawal → State → State
  | .host occurrence, state => state.withdrawOccurrence occurrence
  | .arms gateway, state => state.disarm gateway
  | .inside scope, state => state.withdrawInside scope

/-- Whether the withdrawal is an Event-Based Gateway arm's. -/
def Withdrawal.disarms : Withdrawal → Bool
  | .arms _ => true
  | .host _ | .inside _ => false

/-- The scope occurrences a withdrawal's interruption removes once its queued cancellation or begin runs: those the
host occurrence owns and everything inside them, or the scope occurrence an Event Sub-Process start interrupts and
everything inside it, its own tokens included; disarming removes none. -/
def Withdrawal.region (state : State) : Withdrawal → List ScopeOccurrenceId
  | .host occurrence => (state.scopes.filter (·.occurrence == some occurrence)).flatMap fun scope => state.subtree scope.id
  | .arms _ => []
  | .inside scope => state.subtree scope

/-- What firing `item` withdraws; `none` for an item whose firing withdraws nothing else: a non-interrupting boundary or
start, or a catch Event. -/
def withdrawal (ctx : Ctx) (item : OpenItem) : Option Withdrawal :=
  match ctx.program.boundary? item.element, item.attachedTo with
  | some (_, boundary), some host => if boundary.interrupting then some (.host host) else none
  | some _, none => none
  | none, some gateway => some (.arms gateway)
  | none, none =>
    let interrupting := (ctx.program.element? item.element).bind (·.start?) |>.bind (·.1.parent)
      |>.bind ctx.program.element? |>.bind (·.scope?) |>.bind fun (_, payload) => (ctx.eventStart payload).map (·.2)
    if item.passive && interrupting == some true then some (.inside item.scope) else none

/-- The open items other than `item` that firing `item` would withdraw from `state`, by identity. -/
def withdrawnBy (ctx : Ctx) (state : State) (item : OpenItem) : List Nat :=
  match withdrawal ctx item with
  | none => []
  | some withdraw =>
    let kept := (withdraw.withdrawFrom state).openItems.map (·.id)
    (state.openItems.filter fun open_ => open_.id != item.id && !kept.contains open_.id).map (·.id)

/-- The refusal of a contest the ranking leaves undecided: the Event-Based Gateway code when it holds an arm. -/
def contestCode (ctx : Ctx) (contest : List OpenItem) : String :=
  if contest.any fun item => (withdrawal ctx item).any (·.disarms) then "gateway-arms-simultaneous"
  else "conditions-simultaneous"

/-- The contest of an item: the items of `fired` connected to `members` by `linked`, in evaluation order. -/
def contestOf (linked : OpenItem → OpenItem → Bool) (fired : List OpenItem) : Nat → List OpenItem → List OpenItem
  | 0, members => members
  | fuel + 1, members =>
    let grown := fired.filter fun item => members.any fun member => member.id == item.id || linked member item
    if grown.length == members.length then members else contestOf linked fired fuel grown

/-- The firings of one contest (SUBSCRIPTIONS-SPEC "Conditions", CIB-LIM-0053): the members
whose interrupting firing an earlier write of the micro-step already enqueued (`pending`) first, then, entry by entry of
the input's ranking, every live member whose element the entry names, a firing withdrawing what it cancels. The
contest is decided when every member fired or was withdrawn; otherwise, or when two members one entry names withdraw
one another, no order the kernel may take separates them and the input is `unsupported`. -/
def walk (ctx : Ctx) (withdraws : OpenItem → OpenItem → Bool) (pending contest : List OpenItem) :
    Except Failure (List OpenItem) := do
  let fire (progress : List OpenItem × List OpenItem) (member : OpenItem) : List OpenItem × List OpenItem :=
    (progress.1.filter fun other => other.id != member.id && !withdraws member other, progress.2 ++ [member])
  let first := pending.foldl (fun progress member =>
    if progress.1.any (·.id == member.id) then fire progress member else progress) (contest, [])
  let (live, firings) ← ctx.conditionChoices.foldlM (fun progress choice => do
    let listed := progress.1.filter fun member => ctx.program.publicId member.element == choice.element
    -- dynamic-only: which Conditions hold at one evaluation is the run's data
    if listed.any fun member => listed.any (withdraws member ·) then throw (.unsupported (contestCode ctx contest))
    pure (listed.foldl fire progress)) first
  -- dynamic-only: which Conditions hold at one evaluation is the run's data
  if live.isEmpty then pure firings else throw (.unsupported (contestCode ctx contest))

/-- Whether a firing of `sequence` interrupts the scope occurrence in which another, earlier in it, continues: its
handler begins there or its boundary's token leaves into it, and the kernel runs the interruption's removal before that
work reaches its first wait, where CIB runs each firing to its wait first (CIB-LIM-0055). -/
def overtakes (ctx : Ctx) (state : State) (sequence : List OpenItem) : Bool :=
  sequence.zipIdx.any fun (later, index) =>
    let region := ((withdrawal ctx later).map (·.region state)).getD []
    (sequence.take index).any fun earlier => earlier.id != later.id && region.contains earlier.scope

/-- The firings of one evaluation (one arming, or one offered write) in order. Of `fired`, the items it found true in
evaluation order, two compete when firing one withdraws the other (`withdrawnBy`), and a contest is a connected set of
competing items: which fires and in which order is a choice neither BPMN (§13.4.4 gives simultaneous triggers no
order) nor CIB (CIB-LIM-0053) makes, so the input's ranking decides it (`walk`) and the kernel takes none. An
uncontested item fires at its place in evaluation order, a contest at the place of its first member. `earlier` are
the firings earlier writes of the micro-step enqueued; an item one of their withdrawing firings (`pending`) withdraws,
a member of this evaluation's contests or not, takes part in none: that firing runs first and leaves it nothing to
fire. A sequence in which a firing interrupts where an earlier one continues is `unsupported` (`overtakes`). -/
def resolveContests (ctx : Ctx) (state : State) (earlier fired : List OpenItem) : Except Failure (List OpenItem) := do
  let pending := earlier.filter fun item => (withdrawal ctx item).isSome
  let gone := pending.flatMap (withdrawnBy ctx state)
  let fired := fired.filter fun item => !gone.contains item.id
  let takes := fired.map fun item => (item.id, withdrawnBy ctx state item)
  let withdraws (member other : OpenItem) : Bool := ((takes.lookup member.id).getD []).contains other.id
  let (firings, _) ← fired.foldlM (fun (firings, handled) item => do
    if handled.contains item.id then pure (firings, handled)
    else
      match contestOf (fun a b => withdraws a b || withdraws b a) fired fired.length [item] with
      | [only] => pure (firings ++ [only], handled ++ [only.id])
      | contest => pure (firings ++ (← walk ctx withdraws pending contest), handled ++ contest.map (·.id)))
    (([] : List OpenItem), ([] : List Nat))
  -- dynamic-only: which Conditions hold at one evaluation is the run's data
  if overtakes ctx state (earlier ++ firings) then throw (.unsupported "interrupted-before-wait")
  pure firings

/-- The Conditional trigger of the element `id`'s subscription, if it has one. -/
def conditionOf? (ctx : Ctx) (id : ElementId) : Option ConditionTrigger :=
  (subscription? ctx id).bind (·.trigger.condition?)

/-- The Conditional trigger of an open item's subscription, if it has one. -/
def itemCondition? (ctx : Ctx) (item : OpenItem) : Option ConditionTrigger :=
  conditionOf? ctx item.element

/-- `Hooks.competes`: whether some element or boundary whose public identity is `element` opens a Conditional item, a
catch, an Event-Based Gateway arm, a boundary or an Event Sub-Process start, interrupting or not. -/
def competes (ctx : Ctx) (element : ElementId) : Bool :=
  ctx.program.elements.any fun declared =>
    (declared.header.id :: ((declared.envelope?.map (·.boundaries.map (·.id))).getD [])).any fun id =>
      ctx.program.publicId id == element && (conditionOf? ctx id).isSome

/-- Whether a write passes a Conditional item's `camunda:variableName` and `camunda:variableEvents` filters. -/
def passes (trigger : ConditionTrigger) (write : WriteEvent) : Bool :=
  trigger.variableName.all (· == write.name) &&
    (trigger.variableEvents.isEmpty || trigger.variableEvents.contains write.kind.name)

/-- Whether `scope` lies in `owner`'s subtree, no called instance's root between them: CIB offers a write to the
subscriptions under the scope that owns the variable (`VariableListenerInvocationListener.java:75-80`), whatever
shadows it there, and a called instance has its own variables. -/
def inSubtree (state : State) (owner scope : ScopeOccurrenceId) : Bool :=
  let rec go (fuel : Nat) (current : ScopeOccurrenceId) : Bool :=
    match fuel with
    | 0 => false
    | fuel + 1 =>
      if current == owner then true
      else if state.calledRoot current then false
      else match (state.scopes.find? (·.id == current)).bind (·.parent) with
        | some parent => go fuel parent
        | none => false
  go (state.scopes.length + 1) scope

/-- How deep an item's subscription sits: an Event Sub-Process start on its scope, any other item one level below. -/
def depth (state : State) (item : OpenItem) : Nat :=
  let rec go (fuel : Nat) (current : ScopeOccurrenceId) (levels : Nat) : Nat :=
    match fuel, (state.scopes.find? (·.id == current)).bind (·.parent) with
    | 0, _ | _, none => levels
    | fuel + 1, some parent => go fuel parent (levels + 1)
  go state.scopes.length item.scope (if item.passive then 0 else 1)

/-- `Hooks.written`: offer each write, in order, to the open Conditional items in the subtree of the scope that owns
the variable whose filters it passes, outermost first and then in opening order, CIB's top-down walk
(`ExecutionEntity.java:1731-1755`), and fire what each write's contests resolve to. All writes of a micro-step land
before they are offered, so a later write can find true again an item whose interrupting firing an earlier one
enqueued: that firing runs first and decides the later write's contest, as the explicit write order makes it do. -/
def offerWrites (ctx : Ctx) (writes : List WriteEvent) (state : State) : Outcome := do
  let (state, _) ← writes.foldlM (fun (state, earlier) write => do
    let offered := state.openItems.filterMap fun item =>
      (itemCondition? ctx item).bind fun trigger =>
        if passes trigger write && inSubtree state write.scope (homeScope state item) then some (item, trigger) else none
    let ordered := offered.mergeSort fun (left, _) (right, _) =>
      depth state left < depth state right || (depth state left == depth state right && left.id ≤ right.id)
    let (state, fired) ← ordered.foldlM (fun (state, fired) (item, trigger) => do
      let (state, fires) ← evaluateItem ctx item trigger state
      pure (state, if fires then fired ++ [item] else fired)) (state, [])
    let firings ← resolveContests ctx state earlier fired
    pure (fireAll (some write) firings state, earlier ++ firings))
    (state, ([] : List OpenItem))
  pure state

end Kernel.Feature.Subscriptions
