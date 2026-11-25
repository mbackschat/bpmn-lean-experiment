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

/-- Whether the scope occurrence `scope` belongs to a Multi-Instance body occurrence, as a Multi-Instance instance's
parent does. -/
def ownedByBody (state : State) (scope : ScopeOccurrenceId) : Bool :=
  (((state.scopes.find? (·.id == scope)).bind (·.occurrence)).bind state.occurrence?).any
    (·.role == .multiInstanceBody)

/-- `scope` as published, `none` for the instance root, which `variables` publishes, or the invariant code that says its
name is not there. A scope occurrence with an element and no occurrence of its own is a restored compensation context
while a run holds it (`Compensations.restoredIn?`), and otherwise a Multi-Instance instance's, whose parent belongs to
the body occurrence and which hosts its instance occurrence once begun. A name that is not there is never published as
an activation 0, which names no occurrence, nor as another role. -/
def publishedScope (state : State) (scope : ScopeOccurrence) (variables : List (String × Value)) :
    Except String (Option PublishedScope) :=
  let processInstanceId := state.instanceOf scope.id
  match scope.calledInstance, scope.element, scope.occurrence with
  | some _, _, _ => .ok (some { processInstanceId, element := none, activation := 0, role := .processInstance, variables })
  | none, none, _ => .ok none
  | none, some _, some id =>
    match state.occurrence? id with
    | some owner =>
      .ok (some { processInstanceId, element := some owner.element, activation := owner.activation, variables
                  role := if owner.role == .multiInstanceBody then .multiInstanceBody else .activity })
    | none => .error "published-scope-owner-gone"
  | none, some element, none =>
    match state.slots.compensation.restoredIn? scope.id with
    | some record =>
      let subject := record.occurrence
      .ok (some { processInstanceId := subject.processInstanceId, element := some subject.element
                  activation := subject.activation, role := contextRole subject.role, variables })
    | none =>
      if !scope.parent.any (ownedByBody state) then .error "published-scope-unnamed"
      else match state.occurrences.find? fun occurrence => occurrence.scope == scope.id && occurrence.element == element with
        | some hosted =>
          .ok (some { processInstanceId, element := some element, activation := hosted.activation
                      role := .multiInstanceInstance, variables })
        | none => .error "published-instance-not-begun"

/-- Every variable scope other than the instance root that holds a variable, by public element identifiers, in
canonical order. When a scope's name is not there the least of the invariant codes is the failure, and otherwise two
scopes publishing one identity is, so a failure too reads no storage order (KD7). -/
def publishedScopes (program : Program) (state : State) : Except Failure (List PublishedScope) :=
  let named := state.scopes.filterMap fun scope =>
    match state.ownVariables scope.id with
    | [] => none
    | entries => some (publishedScope state scope entries)
  match named.filterMap fun | .error code => some code | .ok _ => none with
  | first :: rest =>
    .error (.semanticFailure .invariant (rest.foldl (fun least code => if code < least then code else least) first))
  | [] =>
    let published := named.filterMap fun
      | .ok found => found.map fun published => { published with element := published.element.map program.publicId }
      | .error _ => none
    let ordered := published.mergeSort PublishedScope.le
    if (ordered.zip (ordered.drop 1)).any fun (a, b) => a.sameIdentity b then
      .error (.semanticFailure .invariant "published-scope-identity-twice")
    else .ok ordered

end Kernel.Publish
