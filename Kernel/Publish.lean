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

/-- The instance root's variables, in name order (`State.ownVariables`). -/
def variables (state : State) : List (String × Value) :=
  state.ownVariables State.root

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

/-- A published scope with the scope occurrence it was read from, whose depth and order position break a tie. -/
structure RankedScope where
  published : PublishedScope
  depth : Nat
  position : Issue

/-- Canonical order: process instance, element (none first), activation, role. Two scope occurrences may publish one
identity (a compensated Multi-Instance body's restored context and its instance's), so a tie is broken by the scope
tree, the enclosing one first, then by order position (DC25), as `Host.hostView` orders open waits; never by the order
the state stores them in (KD7). -/
def PublishedScope.le (left right : RankedScope) : Bool :=
  let (a, b) := (left.published, right.published)
  let name (scope : PublishedScope) := (scope.element.map (·.value)).getD ""
  if a.processInstanceId != b.processInstanceId then decide (a.processInstanceId < b.processInstanceId)
  else if name a != name b then decide (name a < name b)
  else if a.activation != b.activation then decide (a.activation < b.activation)
  else if scopeRoleRank a.role != scopeRoleRank b.role then decide (scopeRoleRank a.role < scopeRoleRank b.role)
  else if left.depth != right.depth then decide (left.depth < right.depth)
  else Issue.notAfter UnitKey.breadth.val left.position right.position

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
def publishedScopes (program : Program) (state : State) : List PublishedScope :=
  ((state.scopes.filterMap fun scope =>
    match state.ownVariables scope.id with
    | [] => none
    | entries => (publishedScope state scope entries).map fun published =>
      { published := { published with element := published.element.map program.publicId }
        depth := scope.id.segments.length, position := scope.position }).mergeSort PublishedScope.le).map (·.published)

end Kernel.Publish
