import BpmnSemantics.SemanticProcess.InternalBoundedScopePreparation
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparationFrames
import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies

/-! Complete preparation frames retain the child selector, all issuance domains, and publication.
The [complete-family outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#complete-operation-family-census)
must derive these read equalities from footprint separation for each mixed operation.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- The joint footprint contains the entire existing child footprint, so its separation can
reuse the ordinary child-entry frame and canonical-equality laws without a synthetic Program. -/
theorem boundedScope_child_independent (selected : InternalBoundedScopeSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence)
    (otherOwner : ScopeOccurrenceId) (other : InternalTransitionStateFootprint)
    (independent : regionalStateFootprintsIndependent
      (boundedScopeStateFootprint selected instanceId owner)
      (liftRegionalStateFootprint otherOwner other) = true) :
    localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint selected.creation instanceId owner) other = true := by
  let child := internalScopeCreationStateFootprint selected.creation instanceId owner
  have reads (atom : InternalStateAtom) (member : atom ∈ child.reads) :
      liftRegionalStateAtom selected.creation.owner atom ∈
        (boundedScopeStateFootprint selected instanceId owner).reads := by
    apply (canonicalRegionalStateAtoms_mem _ _).mpr
    exact List.mem_append_left _ (List.mem_map.mpr ⟨atom, member, rfl⟩)
  have writes (atom : InternalStateAtom) (member : atom ∈ child.writes) :
      liftRegionalStateAtom selected.creation.owner atom ∈
        (boundedScopeStateFootprint selected instanceId owner).writes := by
    apply (canonicalRegionalStateAtoms_mem _ _).mpr
    exact List.mem_append_left _ (List.mem_map.mpr ⟨atom, member, rfl⟩)
  have disjoint (left right : List InternalStateAtom)
      (absent : ∀ atom, atom ∈ left → atom ∈ right → False) : listsDisjoint left right = true := by
    apply List.all_eq_true.mpr
    intro atom member
    simpa using absent atom member
  have writeRead : listsDisjoint child.writes other.reads = true := by
    apply disjoint
    intro atom written read
    have conflict := regional_independent_read_write _ _ independent _ _
      (writes atom written) (List.mem_map.mpr ⟨atom, read, rfl⟩)
    simp [regionalLift_preserves_key_conflict] at conflict
  have readWrite : listsDisjoint other.writes child.reads = true := by
    apply disjoint
    intro atom written read
    have conflict := regional_independent_write_read _ _ independent _ _
      (List.mem_map.mpr ⟨atom, written, rfl⟩) (reads atom read)
    simp [regionalLift_preserves_key_conflict] at conflict
  have writeWrite (atom : InternalStateAtom) (written : atom ∈ child.writes)
      (otherWritten : atom ∈ other.writes) : False := by
    have conflict := regional_independent_write_write _ _ independent _ _
      (writes atom written) (List.mem_map.mpr ⟨atom, otherWritten, rfl⟩)
    simp [regionalLift_preserves_key_conflict] at conflict
  exact Bool.and_eq_true_iff.mpr ⟨Bool.and_eq_true_iff.mpr
    ⟨Bool.and_eq_true_iff.mpr ⟨writeRead, disjoint _ _ writeWrite⟩, readWrite⟩,
      disjoint _ _ (fun atom otherWritten written => writeWrite atom written otherWritten)⟩

theorem boundedScope_other_child_independent (other : InternalRegionalStateFootprint)
    (selected : InternalBoundedScopeSelection) (instanceId : SemanticId) (owner : RuntimeScopeOccurrence)
    (independent : regionalStateFootprintsIndependent other
      (boundedScopeStateFootprint selected instanceId owner) = true) :
    regionalStateFootprintsIndependent other
      (liftRegionalStateFootprint selected.creation.owner
        (internalScopeCreationStateFootprint selected.creation instanceId owner)) = true := by
  have reads (atom : InternalRegionalStateAtom)
      (member : atom ∈ (liftRegionalStateFootprint selected.creation.owner
        (internalScopeCreationStateFootprint selected.creation instanceId owner)).reads) :
      atom ∈ (boundedScopeStateFootprint selected instanceId owner).reads := by
    exact (canonicalRegionalStateAtoms_mem _ _).mpr (List.mem_append_left _ member)
  have writes (atom : InternalRegionalStateAtom)
      (member : atom ∈ (liftRegionalStateFootprint selected.creation.owner
        (internalScopeCreationStateFootprint selected.creation instanceId owner)).writes) :
      atom ∈ (boundedScopeStateFootprint selected instanceId owner).writes := by
    exact (canonicalRegionalStateAtoms_mem _ _).mpr (List.mem_append_left _ member)
  have disjoint (left right : List InternalRegionalStateAtom)
      (absent : ∀ a ∈ left, ∀ b ∈ right, regionalStateAtomsConflict a b = false) :
      regionalAtomListsDisjoint left right = true := by
    simp only [regionalAtomListsDisjoint, List.all_eq_true, Bool.not_eq_true', List.any_eq_false]
    intro a am b bm
    simp only [absent a am b bm, Bool.false_eq_true, not_false_eq_true]
  exact Bool.and_eq_true_iff.mpr ⟨Bool.and_eq_true_iff.mpr
    ⟨disjoint _ _ (fun a am b bm => regional_independent_read_write _ _ independent a b am (reads b bm)),
      disjoint _ _ (fun a am b bm => regional_independent_write_read _ _ independent a b (writes a am) bm)⟩,
    disjoint _ _ (fun a am b bm => regional_independent_write_write _ _ independent a b am (writes b bm))⟩

theorem selectInternalBoundedScope_read_frame (before after : RuntimeState)
    (contract : InternalBoundedScopeContract) (selected : InternalBoundedScopeSelection)
    (found : selectInternalBoundedScope? before contract = some selected)
    (entry : selectInternalScopeCreation? after contract.entryOperation =
      selectInternalScopeCreation? before contract.entryOperation)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (timer : timerActivationCount after contract.timer.elementId =
      timerActivationCount before contract.timer.elementId)
    (activity : activityActivationCount after ⟨contract.origin.elementId.value⟩ =
      activityActivationCount before ⟨contract.origin.elementId.value⟩) :
    selectInternalBoundedScope? after contract = some selected := by
  obtain ⟨selection, selectedEntry, rfl⟩ := selectInternalBoundedScope_facts before contract selected found
  simp [selectInternalBoundedScope?, entry, selectedEntry, makeInternalBoundedScopeSelection,
    time, timer, activity]

theorem prepareInternalBoundedScope_read_frame (program : Program) (before after : RuntimeState)
    (contract : InternalBoundedScopeContract) (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program before contract = some prepared)
    (selection : selectInternalBoundedScope? after contract = some prepared.selection)
    (control : after.control = before.control) (time : after.logicalTimeMs = before.logicalTimeMs)
    (owner : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = prepared.selection.creation.owner)) =
      before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = prepared.selection.creation.owner)))
    (input : after.tokens.filter (fun token => decide
        (token.placeId = prepared.selection.creation.input && token.owner = prepared.selection.creation.owner)) =
      before.tokens.filter (fun token => decide
        (token.placeId = prepared.selection.creation.input && token.owner = prepared.selection.creation.owner)))
    (entry : after.tokens.filter (fun token => decide
        (token.placeId = prepared.selection.creation.entry && token.owner = prepared.selection.creation.created.id)) =
      before.tokens.filter (fun token => decide
        (token.placeId = prepared.selection.creation.entry && token.owner = prepared.selection.creation.created.id)))
    (counter : internalScopeCreationCounterSafe after prepared.selection.creation =
      internalScopeCreationCounterSafe before prepared.selection.creation)
    (joint : boundedScopeJointResourcesAvailable program after contract prepared.selection =
      boundedScopeJointResourcesAvailable program before contract prepared.selection) :
    prepareInternalBoundedScope? program after contract = some prepared := by
  obtain ⟨selected, instanceId, ownerRecord, definition, start, delta,
    _, running, snapshots, operations, ownerExact, definitionFound, checks, jointBefore,
    startFound, deltaFound, rfl⟩ := prepareInternalBoundedScope_facts program before contract prepared found
  dsimp only [makeInternalBoundedScopePreparation] at selection owner input entry counter joint
  have available : internalScopeCreationTokensAvailable after selected.creation =
      internalScopeCreationTokensAvailable before selected.creation := by
    have equal := congr (congrArg (fun count present =>
      decide (0 < count) && SemanticProcessJson.isSafeWireNat count && !present)
      (congrArg List.length input))
      (scopeCreation_any_population_frame before.tokens after.tokens _ entry)
    exact equal
  have checked : internalScopeCreationPredecessorChecks program after contract.entryOperation
      selected.creation contract.origin definition = true := by
    simpa only [internalScopeCreationPredecessorChecks, time, counter, available] using checks
  have runningAfter : runningInstance? after = some instanceId := by
    simpa only [runningInstance?, control] using running
  have ownerAfter := owner.trans ownerExact
  simp only [prepareInternalBoundedScope?, selection, runningAfter, snapshots, operations,
    definitionFound, checked, joint, jointBefore, startFound, deltaFound,
    makeInternalBoundedScopePreparation, time, bind, Option.bind, ne_eq, not_true_eq_false,
    Bool.not_true, Bool.false_eq_true, Bool.false_or, ↓reduceIte]
  exact congrArg (fun population : List RuntimeScopeOccurrence =>
    match population with
    | [record] => some (makeInternalBoundedScopePreparation before selected instanceId record start delta)
    | _ => none) ownerAfter

end BpmnSemantics.SemanticProcess.InternalCommutation
