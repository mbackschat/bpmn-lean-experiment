module

public import Kernel.State

/-! # Publish

What the public state observation of the [canonical result](../contracts/schemas/canonical-result.schema.json) reads
from runtime state besides `Kernel.Host`'s view: the status name, the instance root's variables and every other variable
scope with its variables, each in name order, so that variables keep their scope. The open waits and the failure come
from `Kernel.Host.hostView`, which `Kernel.Run` renders.
-/

public section

namespace Kernel.Publish

def statusName : InstanceStatus → String
  | .running => "running"
  | .completed => "completed"
  | .cancelled => "cancelled"
  | .failed => "failed"

def byName (entries : List (String × Value)) : List (String × Value) :=
  entries.mergeSort fun left right => decide (left.1 ≤ right.1)

/-- The instance root's variables, ordered by name. -/
def variables (state : State) : List (String × Value) :=
  byName (((state.variables.find? (·.scope == State.root)).map (·.entries)).getD [])

/-- What a published variable scope is. A scope is named by the occurrence it belongs to: `activity` is an Activity
occurrence's own scope (a Sub-Process's, or an Activity's local variables), `multiInstanceBody` a Multi-Instance body's;
a `multiInstanceInstance` and a `compensationContext` (the restored context a compensation handler runs in) have no
occurrence of their own and are named by the one they host. A called instance's root is a `processInstance`. -/
inductive ScopeRole where
  | processInstance
  | activity
  | multiInstanceBody
  | multiInstanceInstance
  | compensationContext
  deriving DecidableEq, Repr

def scopeRoleName : ScopeRole → String
  | .processInstance => "processInstance"
  | .activity => "activity"
  | .multiInstanceBody => "multiInstanceBody"
  | .multiInstanceInstance => "multiInstanceInstance"
  | .compensationContext => "compensationContext"

def scopeRoleRank : ScopeRole → Nat
  | .processInstance => 0
  | .activity => 1
  | .multiInstanceBody => 2
  | .multiInstanceInstance => 3
  | .compensationContext => 4

/-- A variable scope other than the instance root, by its process instance, the element and activation of the
occurrence that names it (none for a `processInstance`) and its role, with its variables in name order. -/
structure PublishedScope where
  processInstanceId : String
  element : Option ElementId
  activation : Nat
  role : ScopeRole
  variables : List (String × Value)

/-- Canonical order: process instance, element (none first), activation, role. -/
def PublishedScope.le (left right : PublishedScope) : Bool :=
  let name (scope : PublishedScope) := (scope.element.map (·.value)).getD ""
  if left.processInstanceId != right.processInstanceId then decide (left.processInstanceId < right.processInstanceId)
  else if name left != name right then decide (name left < name right)
  else if left.activation != right.activation then decide (left.activation < right.activation)
  else decide (scopeRoleRank left.role ≤ scopeRoleRank right.role)

def ownedByBody (state : State) (scope : ScopeOccurrenceId) : Bool :=
  (((state.scopes.find? (·.id == scope)).bind (·.occurrence)).bind state.occurrence?).any
    (·.role == .multiInstanceBody)

/-- `scope` as published, `none` for the instance root, which `variables` publishes. -/
def publishedScope (state : State) (scope : ScopeOccurrence) (variables : List (String × Value)) :
    Option PublishedScope :=
  let processInstanceId := state.instanceOf scope.id
  match scope.calledInstance, scope.element, scope.occurrence with
  | some _, _, _ => some { processInstanceId, element := none, activation := 0, role := .processInstance, variables }
  | none, none, _ => none
  | none, some element, some id =>
    let owner := state.occurrence? id
    some { processInstanceId, element := some ((owner.map (·.element)).getD element)
           activation := (owner.map (·.activation)).getD 0, variables
           role := if owner.any (·.role == .multiInstanceBody) then .multiInstanceBody else .activity }
  | none, some element, none =>
    let hosted := state.occurrences.find? fun occurrence => occurrence.scope == scope.id && occurrence.element == element
    some { processInstanceId, element := some element, activation := (hosted.map (·.activation)).getD 0, variables
           role := if scope.parent.any (ownedByBody state) then .multiInstanceInstance else .compensationContext }

/-- Every variable scope other than the instance root that holds a variable, by public element identifiers, in
canonical order. -/
def scopes (program : Program) (state : State) : List PublishedScope :=
  (state.scopes.filterMap fun scope =>
    match ((state.variables.find? (·.scope == scope.id)).map (·.entries)).getD [] with
    | [] => none
    | entries => (publishedScope state scope (byName entries)).map fun published =>
      { published with element := published.element.map program.publicId }).mergeSort PublishedScope.le

end Kernel.Publish
