module

public import BpmnSemantics.SemanticProcess.InternalCommutationRegion
public import BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity

/-! # Regional dependency atoms

The snapshot atom extension and its 2026-09-01 resource measurements in CAPSULE-COST-LEDGER.md
keep additional families outside the legacy inductive. Regional preparation follows that boundary
while retaining owner facts for legacy wait and local-data keys that do not themselves carry a scope.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalRegionalStateAtom where
  | ordinary (atom : InternalStateAtom)
  | owned (atom : InternalStateAtom) (owner : ScopeOccurrenceId)
  | activityAssociation (record : ActivityOccurrence)
  | occurrenceRegion (region : InternalOccurrenceRegion)
  | initiationPending
  | endIncrement
  | endCount
  deriving Repr, DecidableEq

structure InternalRegionalStateFootprint where
  reads : List InternalRegionalStateAtom
  writes : List InternalRegionalStateAtom
  deriving Repr, DecidableEq

/-- A legacy preparation already identifies the runtime owner of its waits and local data.
Retaining that fact makes region conflicts explicit without changing legacy atom constructors. -/
def liftRegionalStateAtom (owner : ScopeOccurrenceId) (atom : InternalStateAtom) : InternalRegionalStateAtom :=
  match atom with
  | .wait .. | .openWaitAnchor .. | .activityVariableScope .. | .activityVariable ..
  | .activityOccurrence .. | .activityBodyTaskClaim .. => .owned atom owner
  | .controlToken .. | .tokenOwners .. | .scopeOccurrence .. | .runtimeControl ..
  | .logicalTime | .activation .. | .processVariable .. | .selectedBranch ..
  | .selectedBranchOwners .. | .scopeParent .. | .callAssociation ..
  | .scopeVariableScope .. | .sequentialScopeController .. | .activityPopulation => .ordinary atom

def liftRegionalStateFootprint (owner : ScopeOccurrenceId) (footprint : InternalTransitionStateFootprint) :
    InternalRegionalStateFootprint :=
  { reads := footprint.reads.map (liftRegionalStateAtom owner)
    writes := footprint.writes.map (liftRegionalStateAtom owner) }

def regionalActivityBodyTasks : ActivityBody → List OccurrenceId
  | .userTask task => [task]
  | .parallelUserTasks first rest => first :: rest
  | .childScope _ | .parallelChildScopes .. => []

def regionalActivityAssociationsConflict (left right : ActivityOccurrence) : Bool :=
  sameActivityOccurrence left right ||
    (regionalActivityBodyTasks left.body).any (regionalActivityBodyTasks right.body).contains ||
    (activityBodyScopeClaims left.body).any (activityBodyScopeClaims right.body).contains ||
    left.attachedHandlers.any right.attachedHandlers.contains

def regionalOwnsOrdinaryAtom (region : InternalOccurrenceRegion) : InternalStateAtom → Bool
  | .activityPopulation => true
  | .controlToken owner _ | .scopeOccurrence owner | .selectedBranch owner _
  | .scopeVariableScope owner | .sequentialScopeController _ owner => region.contains owner
  | .scopeParent occurrence parent => region.contains occurrence || parent.any region.contains
  | .callAssociation record => region.ownsCall record
  | .tokenOwners _ | .runtimeControl _ | .logicalTime | .activation .. | .processVariable _
  | .selectedBranchOwners _ | .wait .. | .openWaitAnchor _ | .activityVariableScope _
  | .activityVariable .. | .activityOccurrence _ | .activityBodyTaskClaim _ => false

def regionalOwnsAtom (region : InternalOccurrenceRegion) : InternalRegionalStateAtom → Bool
  | .ordinary atom => regionalOwnsOrdinaryAtom region atom
  | .owned atom owner => region.contains owner || regionalOwnsOrdinaryAtom region atom
  | .activityAssociation record => region.contains record.owner ||
      match record.body with
      | .childScope child => region.contains child
      | .parallelChildScopes first rest => (first :: rest).any fun iteration => region.contains iteration.scope
      | .userTask _ | .parallelUserTasks .. => false
  | .occurrenceRegion other => occurrenceRegionsOverlap region other
  | .initiationPending | .endIncrement | .endCount => false

def regionalActivityTouchesLegacyAtom (record : ActivityOccurrence) : InternalStateAtom → Bool
  | .activityPopulation => true
  | .activityOccurrence identity => identity == activityOwnerForRecord record
  | .activityBodyTaskClaim task => (regionalActivityBodyTasks record.body).contains task
  | _ => false

def regionalStateAtomsConflict (left right : InternalRegionalStateAtom) : Bool :=
  match left, right with
  | .endIncrement, .endIncrement => false
  | .endIncrement, .endCount | .endCount, .endIncrement => true
  | .activityAssociation left, .activityAssociation right => regionalActivityAssociationsConflict left right
  | .activityAssociation record, .ordinary atom | .activityAssociation record, .owned atom _
  | .ordinary atom, .activityAssociation record | .owned atom _, .activityAssociation record =>
      regionalActivityTouchesLegacyAtom record atom
  | .ordinary .activityPopulation, .owned (.activityOccurrence _) _
  | .owned (.activityOccurrence _) _, .ordinary .activityPopulation
  | .ordinary .activityPopulation, .ordinary (.activityOccurrence _)
  | .ordinary (.activityOccurrence _), .ordinary .activityPopulation => true
  | .ordinary left, .ordinary right | .ordinary left, .owned right _
  | .owned left _, .ordinary right | .owned left _, .owned right _ => left == right
  | _, _ => left == right ||
      match left, right with
      | .occurrenceRegion region, atom => regionalOwnsAtom region atom
      | atom, .occurrenceRegion region => regionalOwnsAtom region atom
      | _, _ => false

def regionalAtomListsDisjoint (left right : List InternalRegionalStateAtom) : Bool :=
  left.all fun atom => !(right.any (regionalStateAtomsConflict atom))

def regionalStateFootprintsIndependent (left right : InternalRegionalStateFootprint) : Bool :=
  regionalAtomListsDisjoint left.writes right.reads &&
    regionalAtomListsDisjoint right.writes left.reads &&
    regionalAtomListsDisjoint left.writes right.writes

def lexBefore [DecidableEq α] (before : α → α → Bool) : List α → List α → Bool
  | [], [] => false
  | [], _ :: _ => true
  | _ :: _, [] => false
  | left :: lefts, right :: rights => if left = right then lexBefore before lefts rights else before left right

def bodyRank : ActivityBody → Nat
  | .userTask _ => 0
  | .parallelUserTasks .. => 1
  | .childScope _ => 2
  | .parallelChildScopes .. => 3

def bodyBefore (left right : ActivityBody) : Bool :=
  if bodyRank left ≠ bodyRank right then bodyRank left < bodyRank right
  else match left, right with
    | .userTask left, .userTask right => occurrenceBefore left right
    | .parallelUserTasks left lefts, .parallelUserTasks right rights =>
        if lefts.length ≠ rights.length then lefts.length < rights.length
        else lexBefore occurrenceBefore (left :: lefts) (right :: rights)
    | .childScope left, .childScope right => scopeBefore left right
    | .parallelChildScopes left lefts, .parallelChildScopes right rights =>
        if lefts.length ≠ rights.length then lefts.length < rights.length
        else lexBefore (fun left right =>
          if left.scope ≠ right.scope then scopeBefore left.scope right.scope
          else if left.loopCounter ≠ right.loopCounter then left.loopCounter < right.loopCounter
          else left.item < right.item) (left :: lefts) (right :: rights)
    | _, _ => false

def commutationHandlerBefore : ActivityHandler → ActivityHandler → Bool
  | .timer left, .timer right | .message left, .message right => occurrenceBefore left right
  | .timer _, .message _ => true
  | .message _, .timer _ => false

def regionalActivityAssociationBefore (left right : ActivityOccurrence) : Bool :=
  if left.processInstanceId ≠ right.processInstanceId then left.processInstanceId.value < right.processInstanceId.value
  else if left.activityElementId ≠ right.activityElementId then left.activityElementId.value < right.activityElementId.value
  else if left.activation ≠ right.activation then left.activation < right.activation
  else if left.owner ≠ right.owner then scopeBefore left.owner right.owner
  else if left.body ≠ right.body then bodyBefore left.body right.body
  else if left.attachedHandlers.length ≠ right.attachedHandlers.length then left.attachedHandlers.length < right.attachedHandlers.length
  else lexBefore commutationHandlerBefore left.attachedHandlers right.attachedHandlers

def regionalAtomRank : InternalRegionalStateAtom → Nat
  | .ordinary _ => 0
  | .owned .. => 1
  | .activityAssociation _ => 2
  | .occurrenceRegion _ => 3
  | .initiationPending => 4
  | .endIncrement => 5
  | .endCount => 6

def regionalStateAtomBefore (left right : InternalRegionalStateAtom) : Bool :=
  if regionalAtomRank left ≠ regionalAtomRank right then regionalAtomRank left < regionalAtomRank right
  else match left, right with
    | .ordinary left, .ordinary right => stateAtomBefore left right
    | .owned left leftOwner, .owned right rightOwner =>
        if left ≠ right then stateAtomBefore left right else scopeBefore leftOwner rightOwner
    | .activityAssociation left, .activityAssociation right => regionalActivityAssociationBefore left right
    | .occurrenceRegion left, .occurrenceRegion right =>
        if left.root ≠ right.root then scopeBefore left.root right.root
        else if left.members.length ≠ right.members.length then left.members.length < right.members.length
        else lexBefore scopeBefore left.members right.members
    | _, _ => false

def canonicalRegionalStateAtoms (atoms : List InternalRegionalStateAtom) : List InternalRegionalStateAtom :=
  sortBy regionalStateAtomBefore atoms.eraseDups

/-- Relative End increments commute, but observing the absolute total conflicts with either increment. -/
theorem regionalEnd_increment_dependency :
    regionalStateAtomsConflict .endIncrement .endIncrement = false ∧
    regionalStateAtomsConflict .endIncrement .endCount = true ∧
    regionalStateAtomsConflict .endCount .endIncrement = true := by
  simp [regionalStateAtomsConflict]

/-- A child insertion depends on its parent even when the child's own identity is outside the region. -/
theorem regionalScope_parent_dependency (region : InternalOccurrenceRegion) (child parent : ScopeOccurrenceId)
    (inside : region.contains parent = true) :
    regionalStateAtomsConflict (.occurrenceRegion region) (.ordinary (.scopeParent child (some parent))) = true := by
  simp [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom, inside]

theorem canonicalRegionalStateAtoms_mem (atoms : List InternalRegionalStateAtom) (atom : InternalRegionalStateAtom) :
    atom ∈ canonicalRegionalStateAtoms atoms ↔ atom ∈ atoms := by
  simp [canonicalRegionalStateAtoms, mem_sortBy]

/-- High-water counters stay global even when the same element appears inside a removed region. -/
theorem regionalActivation_not_owned (region : InternalOccurrenceRegion) (owner : ScopeOccurrenceId)
    (kind : InternalActivationKind) (element : NodeId) :
    regionalStateAtomsConflict (.occurrenceRegion region) (liftRegionalStateAtom owner (.activation kind element)) = false := by
  simp [regionalStateAtomsConflict, liftRegionalStateAtom, regionalOwnsAtom, regionalOwnsOrdinaryAtom]

theorem regionalWait_owner_dependency (region : InternalOccurrenceRegion) (owner : ScopeOccurrenceId)
    (kind : InternalWaitKind) (occurrence : OccurrenceId) (inside : region.contains owner = true) :
    regionalStateAtomsConflict (.occurrenceRegion region) (liftRegionalStateAtom owner (.wait kind occurrence)) = true := by
  simp [regionalStateAtomsConflict, liftRegionalStateAtom, regionalOwnsAtom, inside]

/-- Owner metadata cannot make the same wait identity independent of itself. -/
theorem regionalWait_key_dependency (leftOwner rightOwner : ScopeOccurrenceId)
    (kind : InternalWaitKind) (occurrence : OccurrenceId) :
    regionalStateAtomsConflict (liftRegionalStateAtom leftOwner (.wait kind occurrence))
      (liftRegionalStateAtom rightOwner (.wait kind occurrence)) = true := by
  simp [regionalStateAtomsConflict, liftRegionalStateAtom]

theorem regionalActivity_child_dependency (region : InternalOccurrenceRegion) (record : ActivityOccurrence)
    (child : ScopeOccurrenceId) (body : record.body = .childScope child)
    (inside : region.contains child = true) :
    regionalStateAtomsConflict (.occurrenceRegion region) (.activityAssociation record) = true := by
  simp [regionalStateAtomsConflict, regionalOwnsAtom, body, inside]

theorem regionalActivity_shared_task_dependency (left right : ActivityOccurrence) (task : OccurrenceId)
    (leftMember : task ∈ regionalActivityBodyTasks left.body) (rightMember : task ∈ regionalActivityBodyTasks right.body) :
    regionalStateAtomsConflict (.activityAssociation left) (.activityAssociation right) = true := by
  have shared : (regionalActivityBodyTasks left.body).any (regionalActivityBodyTasks right.body).contains = true :=
    List.any_eq_true.mpr ⟨task, leftMember, by simpa using rightMember⟩
  simp [regionalStateAtomsConflict, regionalActivityAssociationsConflict, shared]

theorem regionalActivity_shared_handler_dependency (left right : ActivityOccurrence) (handler : ActivityHandler)
    (leftMember : handler ∈ left.attachedHandlers) (rightMember : handler ∈ right.attachedHandlers) :
    regionalStateAtomsConflict (.activityAssociation left) (.activityAssociation right) = true := by
  have shared : left.attachedHandlers.any right.attachedHandlers.contains = true :=
    List.any_eq_true.mpr ⟨handler, leftMember, by simpa using rightMember⟩
  simp [regionalStateAtomsConflict, regionalActivityAssociationsConflict, shared]

theorem regionalActivity_handler_tags_remain_distinct (left right : ActivityOccurrence) (occurrence : OccurrenceId) :
    regionalActivityAssociationsConflict { left with attachedHandlers := [.timer occurrence] }
      { right with attachedHandlers := [.message occurrence] } =
    regionalActivityAssociationsConflict { left with attachedHandlers := [] }
      { right with attachedHandlers := [] } := by
  simp [regionalActivityAssociationsConflict, sameActivityOccurrence]

theorem regionalWait_outside_is_independent (region : InternalOccurrenceRegion) (owner : ScopeOccurrenceId)
    (kind : InternalWaitKind) (occurrence : OccurrenceId) (outside : region.contains owner = false) :
    regionalStateAtomsConflict (.occurrenceRegion region) (liftRegionalStateAtom owner (.wait kind occurrence)) = false ∧
    regionalStateAtomsConflict (liftRegionalStateAtom owner (.wait kind occurrence)) (.occurrenceRegion region) = false := by
  simp [regionalStateAtomsConflict, liftRegionalStateAtom, regionalOwnsAtom, regionalOwnsOrdinaryAtom, outside]

theorem regionalEnd_increment_footprints_commute :
    regionalStateFootprintsIndependent { reads := [.endIncrement], writes := [.endIncrement] }
      { reads := [.endIncrement], writes := [.endIncrement] } = true := by
  simp [regionalStateFootprintsIndependent, regionalAtomListsDisjoint, regionalStateAtomsConflict]

theorem regionalSharedProcess_reads_commute (property : String) :
    regionalStateFootprintsIndependent { reads := [.ordinary (.processVariable property)], writes := [] }
      { reads := [.ordinary (.processVariable property)], writes := [] } = true := by
  simp [regionalStateFootprintsIndependent, regionalAtomListsDisjoint]

/-- Lifting preserves keyed conflicts and the declaration-population dependency required by scoped reads. -/
theorem regionalLift_preserves_key_conflict (leftOwner rightOwner : ScopeOccurrenceId)
    (left right : InternalStateAtom) :
    regionalStateAtomsConflict (liftRegionalStateAtom leftOwner left) (liftRegionalStateAtom rightOwner right) =
      (match left, right with
      | .activityPopulation, .activityOccurrence _
      | .activityOccurrence _, .activityPopulation => true
      | _, _ => left == right) := by
  cases left <;> cases right <;> rfl

/-- The existing data-arming identity key and a complete regional Activity record name one resource. -/
theorem regionalActivity_legacy_identity_dependency (record : ActivityOccurrence) (owner : ScopeOccurrenceId) :
    regionalStateAtomsConflict (.activityAssociation record)
      (liftRegionalStateAtom owner (.activityOccurrence (activityOwnerForRecord record))) = true := by
  simp [regionalStateAtomsConflict, liftRegionalStateAtom, regionalActivityTouchesLegacyAtom]

theorem regionalActivity_legacy_body_dependency (record : ActivityOccurrence) (owner : ScopeOccurrenceId)
    (task : OccurrenceId) (member : task ∈ regionalActivityBodyTasks record.body) :
    regionalStateAtomsConflict (.activityAssociation record)
      (liftRegionalStateAtom owner (.activityBodyTaskClaim task)) = true := by
  simpa [regionalStateAtomsConflict, liftRegionalStateAtom, regionalActivityTouchesLegacyAtom] using member

theorem regionalActivity_legacy_dependency_symmetric (record : ActivityOccurrence)
    (owner : ScopeOccurrenceId) (atom : InternalStateAtom) :
    regionalStateAtomsConflict (.activityAssociation record) (liftRegionalStateAtom owner atom) =
      regionalStateAtomsConflict (liftRegionalStateAtom owner atom) (.activityAssociation record) := by
  cases atom <;> rfl

theorem activityPopulation_read_conflicts_with_insertion (id : ActivityOccurrenceId) :
    stateReadSetsDisjoint [.activityOccurrence id] [.activityPopulation] = false := by
  simp [stateReadSetsDisjoint]
theorem differentActivityKeys_read_independent (left right : ActivityOccurrenceId) (different : left ≠ right) :
    stateReadSetsDisjoint [.activityOccurrence left] [.activityOccurrence right] = true := by
  simp [stateReadSetsDisjoint, listsDisjoint, different]
theorem activityPopulation_association_conflict (record : ActivityOccurrence) :
    regionalStateAtomsConflict (.ordinary .activityPopulation) (.activityAssociation record) = true := rfl
theorem activityAssociation_population_conflict (record : ActivityOccurrence) :
    regionalStateAtomsConflict (.activityAssociation record) (.ordinary .activityPopulation) = true := rfl
theorem activityPopulation_region_conflict (region : InternalOccurrenceRegion) :
    regionalStateAtomsConflict (.ordinary .activityPopulation) (.occurrenceRegion region) = true := by
  simp [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom]

end BpmnSemantics.SemanticProcess.InternalCommutation
