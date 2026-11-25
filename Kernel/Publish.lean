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
a `multiInstanceInstance` has no occurrence of its own and is named by the instance occurrence it hosts. A restored
compensation context, a handler's or a group's, is named by the subject occurrence whose snapshot it restores (its
record's `Compensable.occurrence`): `compensationContext` for an Activity's or a Multi-Instance instance's,
`multiInstanceBodyCompensationContext` for a Multi-Instance body's, whose first instance shares its element and
activation. A called instance's root is a `processInstance`. -/
inductive ScopeRole where
  | processInstance
  | activity
  | multiInstanceBody
  | multiInstanceInstance
  | multiInstanceBodyCompensationContext
  | compensationContext
  deriving DecidableEq, Repr

def scopeRoleName : ScopeRole → String
  | .processInstance => "processInstance"
  | .activity => "activity"
  | .multiInstanceBody => "multiInstanceBody"
  | .multiInstanceInstance => "multiInstanceInstance"
  | .multiInstanceBodyCompensationContext => "multiInstanceBodyCompensationContext"
  | .compensationContext => "compensationContext"

def scopeRoleRank : ScopeRole → Nat
  | .processInstance => 0
  | .activity => 1
  | .multiInstanceBody => 2
  | .multiInstanceInstance => 3
  | .multiInstanceBodyCompensationContext => 4
  | .compensationContext => 5

/-- The role of a restored context whose subject occurrence the counter `role` numbered. -/
def contextRole : ActivationRole → ScopeRole
  | .element => .compensationContext
  | .multiInstanceBody => .multiInstanceBodyCompensationContext

/-- A variable scope other than the instance root, by its process instance, the element and activation of the
occurrence that names it (none for a `processInstance`) and its role, with its variables in name order. -/
structure PublishedScope where
  processInstanceId : String
  element : Option ElementId
  activation : Nat
  role : ScopeRole
  variables : List (String × Value)

/-- Canonical order: process instance, element (none first), activation, role. The four are the scope's identity, which
no two published scopes share (`publishedScopes` fails otherwise), so the order is total and never reads the order the
state stores scopes in (KD7). -/
def PublishedScope.le (a b : PublishedScope) : Bool :=
  let name (scope : PublishedScope) := (scope.element.map (·.value)).getD ""
  if a.processInstanceId != b.processInstanceId then decide (a.processInstanceId < b.processInstanceId)
  else if name a != name b then decide (name a < name b)
  else if a.activation != b.activation then decide (a.activation < b.activation)
  else decide (scopeRoleRank a.role ≤ scopeRoleRank b.role)

/-- Whether `a` and `b` publish one identity. -/
def PublishedScope.sameIdentity (a b : PublishedScope) : Bool :=
  a.processInstanceId == b.processInstanceId && a.element == b.element && a.activation == b.activation &&
    scopeRoleRank a.role == scopeRoleRank b.role

/-- `scope` as published, `none` for the instance root, which `variables` publishes. A scope occurrence with an element
and no occurrence of its own is a restored compensation context while a run holds it (`Compensations.restoredIn?`), and
otherwise a Multi-Instance instance's, which hosts its instance occurrence once begun. A name that is not there is an
invariant failure, never an activation 0, which names no occurrence. -/
def publishedScope (state : State) (scope : ScopeOccurrence) (variables : List (String × Value)) :
    Except Failure (Option PublishedScope) :=
  let processInstanceId := state.instanceOf scope.id
  match scope.calledInstance, scope.element, scope.occurrence with
  | some _, _, _ => .ok (some { processInstanceId, element := none, activation := 0, role := .processInstance, variables })
  | none, none, _ => .ok none
  | none, some _, some id =>
    match state.occurrence? id with
    | some owner =>
      .ok (some { processInstanceId, element := some owner.element, activation := owner.activation, variables
                  role := if owner.role == .multiInstanceBody then .multiInstanceBody else .activity })
    | none => .error (.semanticFailure .invariant "published-scope-owner-gone")
  | none, some element, none =>
    match state.slots.compensation.restoredIn? scope.id with
    | some record =>
      match record.occurrence with
      | some subject =>
        .ok (some { processInstanceId := subject.processInstanceId, element := some subject.element
                    activation := subject.activation, role := contextRole subject.role, variables })
      | none => .error (.semanticFailure .invariant "published-context-without-subject")
    | none =>
      match state.occurrences.find? fun occurrence => occurrence.scope == scope.id && occurrence.element == element with
      | some hosted =>
        .ok (some { processInstanceId, element := some element, activation := hosted.activation
                    role := .multiInstanceInstance, variables })
      | none => .error (.semanticFailure .invariant "published-instance-not-begun")

/-- Every variable scope other than the instance root that holds a variable, by public element identifiers, in
canonical order; an invariant failure when a scope's name is not there or two scopes publish one identity. -/
def publishedScopes (program : Program) (state : State) : Except Failure (List PublishedScope) := do
  let published ← state.scopes.filterMapM fun scope =>
    match state.ownVariables scope.id with
    | [] => .ok none
    | entries => return (← publishedScope state scope entries).map fun published =>
      { published with element := published.element.map program.publicId }
  let ordered := published.mergeSort PublishedScope.le
  if (ordered.zip (ordered.drop 1)).any fun (a, b) => a.sameIdentity b then
    .error (.semanticFailure .invariant "published-scope-identity-twice")
  else .ok ordered

end Kernel.Publish
