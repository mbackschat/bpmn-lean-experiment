import BpmnSemantics.SemanticProcess.InternalDataArmingPreparation

/-! # Complete Activity-data arming footprints

The prepared data arm owns its Activity record and Activity-local scope in addition to its User Task
wait. Shared Process input reads remain independent under the Internal Commutation contract.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- CDATA-OWNER-01: interface inputs are immutable during their scope lifetime. Internal creation
and disposal change that same scope; external output completion is outside internal batching.
The owner atom protects the interface census as well as the selected input value. -/
def dataArmingInputAtom (owner : ScopeOccurrenceId) : ActivityDataInputSource → InternalStateAtom
  | .property propertyId => .processVariable propertyId
  | .processDataInput _ => .scopeOccurrence owner

theorem process_input_atom_is_not_property (owner : ScopeOccurrenceId) (port propertyId : String) :
    dataArmingInputAtom owner (.processDataInput port) ≠ .processVariable propertyId := by
  simp [dataArmingInputAtom]

def footprintOfDataPatch (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) : InternalTransitionFootprint :=
  let ordinary := footprintOfPatch patch.arm
  let activity := activityOwnerForRecord patch.record
  let scope := InternalStateAtom.activityVariableScope (.activityOccurrence activity)
  let counter := InternalStateAtom.activation .activity patch.record.activityElementId
  let record := InternalStateAtom.activityOccurrence activity
  let claims := (activityBodyTaskClaims patch.record.body).map
    InternalStateAtom.activityBodyTaskClaim
  { ordinary with
    reads := canonicalStateAtomSet
      (ordinary.reads ++ (contract.data.inputAssociation?.toList.map fun input =>
        dataArmingInputAtom patch.arm.owner input.source) ++ [counter, record, scope] ++ claims)
    writes := canonicalStateAtomSet
      (ordinary.writes ++ [counter, record, scope] ++ (patch.bindings.map fun binding =>
        .activityVariable (.activityOccurrence activity) binding.name) ++ claims) }

theorem ordinary_arming_reads_publication_time (patch : InternalArmingPatch) :
    InternalStateAtom.logicalTime ∈ (footprintOfPatch patch).reads := by
  cases writeEq : patch.write <;>
    simp [footprintOfPatch, writeEq, canonicalStateAtomSet, mem_sortBy]

theorem ordinary_reads_subset_data_reads (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) :
    (footprintOfPatch patch.arm).reads ⊆ (footprintOfDataPatch contract patch).reads := by
  intro atom member
  simp [footprintOfDataPatch, canonicalStateAtomSet, mem_sortBy, member]

theorem ordinary_writes_subset_data_writes (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) :
    (footprintOfPatch patch.arm).writes ⊆ (footprintOfDataPatch contract patch).writes := by
  intro atom member
  simp [footprintOfDataPatch, canonicalStateAtomSet, mem_sortBy, member]

theorem data_arming_reads_source (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (input : DirectActivityDataInput)
    (selected : contract.data.inputAssociation? = some input) :
    dataArmingInputAtom patch.arm.owner input.source ∈
      (footprintOfDataPatch contract patch).reads := by
  simp [footprintOfDataPatch, selected, canonicalStateAtomSet, mem_sortBy]

theorem data_arming_reads_property_source (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (input : DirectActivityDataInput) (propertyId : String)
    (selected : contract.data.inputAssociation? = some input)
    (endpoint : input.source = .property propertyId) :
    .processVariable propertyId ∈ (footprintOfDataPatch contract patch).reads := by
  simpa [endpoint, dataArmingInputAtom] using data_arming_reads_source contract patch input selected

theorem data_arming_reads_process_input_owner (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (input : DirectActivityDataInput) (port : String)
    (selected : contract.data.inputAssociation? = some input)
    (endpoint : input.source = .processDataInput port) :
    .scopeOccurrence patch.arm.owner ∈ (footprintOfDataPatch contract patch).reads := by
  simpa [endpoint, dataArmingInputAtom] using data_arming_reads_source contract patch input selected

theorem data_arming_does_not_write_process (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (name : String) :
    .processVariable name ∉ (footprintOfDataPatch contract patch).writes := by
  cases writeEq : patch.arm.write <;>
    simp [footprintOfDataPatch, footprintOfPatch, writeEq, canonicalStateAtomSet, mem_sortBy]

theorem data_arming_writes_activity_counter (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) :
    .activation .activity patch.record.activityElementId ∈
      (footprintOfDataPatch contract patch).writes := by
  simp [footprintOfDataPatch, canonicalStateAtomSet, mem_sortBy]

theorem data_arming_writes_activity_record (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) :
    .activityOccurrence (activityOwnerForRecord patch.record) ∈
      (footprintOfDataPatch contract patch).writes := by
  simp [footprintOfDataPatch, canonicalStateAtomSet, mem_sortBy]

theorem data_arming_writes_body_claim (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (task : OccurrenceId)
    (claimed : task ∈ activityBodyTaskClaims patch.record.body) :
    .activityBodyTaskClaim task ∈ (footprintOfDataPatch contract patch).writes := by
  simp [footprintOfDataPatch, canonicalStateAtomSet, mem_sortBy, claimed]

theorem data_arming_writes_local_scope (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) :
    .activityVariableScope (.activityOccurrence (activityOwnerForRecord patch.record)) ∈
      (footprintOfDataPatch contract patch).writes := by
  simp [footprintOfDataPatch, canonicalStateAtomSet, mem_sortBy]

theorem effect_and_activity_scope_atoms_distinct (effect : EffectOccurrenceId)
    (activity : ActivityOccurrenceId) :
    InternalStateAtom.activityVariableScope (.effectOccurrence effect) ≠
      .activityVariableScope (.activityOccurrence activity) := by
  simp

theorem activity_and_wait_counter_atoms_distinct (kind : InternalWaitKind)
    (left right : NodeId) :
    InternalStateAtom.activation .activity left ≠ .activation kind.activationKind right := by
  cases kind <;> simp [InternalWaitKind.activationKind]

theorem listsDisjoint_of_subsets {α : Type} [DecidableEq α]
    {left right largerLeft largerRight : List α}
    (leftSubset : left ⊆ largerLeft) (rightSubset : right ⊆ largerRight)
    (separated : listsDisjoint largerLeft largerRight = true) :
    listsDisjoint left right = true := by
  simp only [listsDisjoint, List.all_eq_true, Bool.not_eq_true',
    List.contains_eq_mem, decide_eq_false_iff_not] at separated ⊢
  intro atom member found
  exact separated atom (leftSubset member) (rightSubset found)

theorem stateReadSetsDisjoint_of_subsets
    {writes reads largerWrites largerReads : List InternalStateAtom}
    (writeSubset : writes ⊆ largerWrites) (readSubset : reads ⊆ largerReads)
    (separated : stateReadSetsDisjoint largerWrites largerReads = true) :
    stateReadSetsDisjoint writes reads = true := by
  simp only [stateReadSetsDisjoint, Bool.and_eq_true] at separated ⊢
  refine ⟨listsDisjoint_of_subsets writeSubset readSubset separated.1, ?_⟩
  by_cases present : InternalStateAtom.activityPopulation ∈ reads
  · have largerPresent := readSubset present
    have noWrites := separated.2
    simp only [List.contains_eq_mem, largerPresent, decide_true, Bool.not_true,
      Bool.false_or, Bool.not_eq_true', List.any_eq_false] at noWrites
    apply Bool.or_eq_true_iff.mpr
    right
    simp only [Bool.not_eq_true', List.any_eq_false]
    intro atom member
    have absent := noWrites atom (writeSubset member)
    cases atom <;> simp_all
  · simp [List.contains_eq_mem, present]

theorem footprintsNonInterfering_of_subsets
    (left right largerLeft largerRight : InternalTransitionFootprint)
    (leftReads : left.reads ⊆ largerLeft.reads)
    (leftWrites : left.writes ⊆ largerLeft.writes)
    (leftPublications : left.publications ⊆ largerLeft.publications)
    (rightReads : right.reads ⊆ largerRight.reads)
    (rightWrites : right.writes ⊆ largerRight.writes)
    (rightPublications : right.publications ⊆ largerRight.publications)
    (separated : footprintsNonInterfering largerLeft largerRight = true) :
    footprintsNonInterfering left right = true := by
  simp only [footprintsNonInterfering, Bool.and_eq_true] at separated ⊢
  exact ⟨⟨⟨stateReadSetsDisjoint_of_subsets leftWrites rightReads separated.1.1.1,
    stateReadSetsDisjoint_of_subsets rightWrites leftReads separated.1.1.2⟩,
    listsDisjoint_of_subsets leftWrites rightWrites separated.1.2⟩,
    listsDisjoint_of_subsets leftPublications rightPublications separated.2⟩

theorem data_ordinary_noninterfering_arms (contract : InternalDataArmingContract)
    (data : InternalDataArmingPatch) (ordinary : InternalArmingPatch)
    (separated : footprintsNonInterfering (footprintOfDataPatch contract data)
      (footprintOfPatch ordinary) = true) :
    footprintsNonInterfering (footprintOfPatch data.arm) (footprintOfPatch ordinary) = true := by
  exact footprintsNonInterfering_of_subsets _ _ _ _
    (ordinary_reads_subset_data_reads contract data)
    (ordinary_writes_subset_data_writes contract data) (fun _ member => member)
    (fun _ member => member) (fun _ member => member) (fun _ member => member) separated

theorem data_data_noninterfering_arms (leftContract rightContract : InternalDataArmingContract)
    (left right : InternalDataArmingPatch)
    (separated : footprintsNonInterfering (footprintOfDataPatch leftContract left)
      (footprintOfDataPatch rightContract right) = true) :
    footprintsNonInterfering (footprintOfPatch left.arm) (footprintOfPatch right.arm) = true := by
  exact footprintsNonInterfering_of_subsets _ _ _ _
    (ordinary_reads_subset_data_reads leftContract left)
    (ordinary_writes_subset_data_writes leftContract left) (fun _ member => member)
    (ordinary_reads_subset_data_reads rightContract right)
    (ordinary_writes_subset_data_writes rightContract right) (fun _ member => member) separated

end BpmnSemantics.SemanticProcess.InternalCommutation
