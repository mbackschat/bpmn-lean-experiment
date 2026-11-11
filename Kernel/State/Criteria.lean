module

public import Kernel.State

/-! # API correlation criteria

Whether a Message delivery's API criterion (`MessageCorrelation.apiCriteria`, CIB-EXT-0025) holds for an item waiting
in a scope occurrence, over the waiting instance's own state (PC-MESSAGE-08). Part of the State layer, above
`Kernel.State`: pure reads that every feature receiving a Message (subscriptions and Receive Tasks) applies alike.
-/

public section

namespace Kernel

/-- Exact equality of kind and value: `41` never equals `"41"`, nor `1.0` `1.00`, and list and map entries compare in
order. -/
def sameKindAndValue : Value → Value → Bool
  | .null, .null => true
  | .bool left, .bool right => left == right
  | .int left, .int right => left == right
  | .decimal left scale, .decimal right scale' => left == right && scale == scale'
  | .string left, .string right => left == right
  | .stringList left, .stringList right => left == right
  | .list left, .list right =>
    left.length == right.length && (left.attach.zip right).all fun (⟨item, _⟩, other) => sameKindAndValue item other
  | .map left, .map right =>
    left.length == right.length && (left.attach.zip right).all fun (⟨entry, _⟩, other) =>
      entry.1 == other.1 && sameKindAndValue entry.2 other.2
  | _, _ => false
termination_by left => sizeOf left
decreasing_by
  all_goals simp_wf
  · have := List.sizeOf_lt_of_mem ‹_ ∈ left›; omega
  · have := List.sizeOf_lt_of_mem ‹entry ∈ left›
    cases entry; simp_all; omega

namespace State

/-- Whether `criterion` holds for an item waiting in `scope`: `processVariable` names a variable the instance root holds
and `localVariable` one `scope` holds itself, never one of an enclosing scope, each with an equal value
(`sameKindAndValue`); `businessKey` the instance's own key, a called instance's own; `processInstance` its public
identifier. A null matches a present null, and an absent name nothing. -/
def criterionHolds (state : State) (scope : ScopeOccurrenceId) (criterion : CorrelationMatch) : Bool :=
  let root := state.instanceRoot scope
  let holds (owner : ScopeOccurrenceId) (name : String) : Bool :=
    match (state.variables.find? (·.scope == owner)).bind (·.entries.find? (·.1 == name)) with
    | some (_, value) => sameKindAndValue value criterion.expected
    | none => false
  let names (actual : Option String) : Bool :=
    match criterion.expected, actual with
    | .string expected, some actual => expected == actual
    | _, _ => false
  match criterion.target with
  | .processVariable name => holds root name
  | .localVariable name => holds scope name
  | .businessKey => names ((state.slots.instances.find? (·.root == root)).bind (·.businessKey))
  | .processInstance => names (some (state.instanceOf scope))

/-- Whether every one of a delivery's API `criteria` holds for an item waiting in `scope` (`criterionHolds`), the empty
list included. CIB's criteria are a map, so two naming one target are `criteria-duplicate`. -/
def criteriaHold (state : State) (scope : ScopeOccurrenceId) (criteria : List CorrelationMatch) : Except Failure Bool :=
  let targets := criteria.map (reprStr ·.target)
  if targets.eraseDups.length != targets.length then .error (.rejected "criteria-duplicate")
  else .ok (criteria.all (state.criterionHolds scope))

end State

end Kernel
