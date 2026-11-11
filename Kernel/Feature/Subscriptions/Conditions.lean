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
  match ctx.evaluate (state.evalContext scope) condition with
  | .value (.bool value) => .ok value
  | .value _ => .error (.rolledBack "condition-not-boolean")
  | .failure code =>
    if code == "unknown-variable" || code == "juel.propertyNotFound" then .ok false else .error (.rolledBack code)
  | .unsupported code => .error (.unsupported code)

/-- Evaluate an open Conditional item and fire it when the profile's rule says so: under `eachWrite` whenever the
predicate holds, under `edge` only when it holds after an evaluation that did not, which the item records. `write` is
the offered write, `none` at arming, where no filter applies (`ConditionalEventDefinition.java:112-113`). -/
def evaluateItem (ctx : Ctx) (write : Option WriteEvent) (item : OpenItem) (trigger : ConditionTrigger)
    (state : State) : Outcome := do
  let some detail := item.kind.view.conditional | .ok state
  let value ← predicateHolds ctx state (homeScope state item) trigger.condition
  let fire (state : State) : State := state.signal (.fire item.id (.condition write))
  match ctx.program.options.conditionalRetrigger with
  | .eachWrite => .ok (if value then fire state else state)
  | .edge =>
    let recorded := { state with openItems := state.openItems.map fun open_ =>
      if open_.id == item.id then { open_ with kind := .conditional { detail with lastValue := some value } } else open_ }
    .ok (if value && detail.lastValue != some true then fire recorded else recorded)

/-- What an item does once open: a Conditional one is evaluated at once. -/
def armed (ctx : Ctx) (subscription : Subscription) (item : OpenItem) (state : State) : Outcome :=
  match subscription.trigger.condition? with
  | some trigger => evaluateItem ctx none item trigger state
  | none => .ok state

/-- The Conditional trigger of an open item's subscription, if it has one. -/
def itemCondition? (ctx : Ctx) (item : OpenItem) : Option ConditionTrigger :=
  (subscription? ctx item).bind (·.trigger.condition?)

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
(`ExecutionEntity.java:1731-1755`). -/
def offerWrites (ctx : Ctx) (writes : List WriteEvent) (state : State) : Outcome :=
  writes.foldlM (fun state write =>
    let offered := state.openItems.filterMap fun item =>
      (itemCondition? ctx item).bind fun trigger =>
        if passes trigger write && inSubtree state write.scope (homeScope state item) then some (item, trigger) else none
    let ordered := offered.mergeSort fun (left, _) (right, _) =>
      depth state left < depth state right || (depth state left == depth state right && left.id ≤ right.id)
    ordered.foldlM (fun state (item, trigger) => evaluateItem ctx (some write) item trigger state) state) state

end Kernel.Feature.Subscriptions
