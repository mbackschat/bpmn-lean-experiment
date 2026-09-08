import BpmnSemantics.SemanticProcess.InternalDataArmingFootprint

/-! Complete retained preparations implement the predecessor-only finite-batch classification account. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive PreparedInternalArming where
  | ordinary (operation : SemanticOperation) (patch : InternalArmingPatch)
  | data (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
  deriving Repr, DecidableEq

def PreparedInternalArming.operation : PreparedInternalArming → SemanticOperation
  | .ordinary operation _ => operation
  | .data contract _ => contract.operation

def PreparedInternalArming.footprint : PreparedInternalArming → InternalTransitionFootprint
  | .ordinary _ patch => footprintOfPatch patch
  | .data contract patch => footprintOfDataPatch contract patch

def PreparedInternalArming.apply (state : RuntimeState) : PreparedInternalArming → RuntimeState
  | .ordinary _ patch => applyInternalArmingPatch state patch
  | .data _ patch => applyInternalDataArmingPatch state patch

def PreparedInternalArming.Prepared (program : Program) (state : RuntimeState) :
    PreparedInternalArming → Prop
  | .ordinary operation patch => prepareInternalArm? program state operation = some patch
  | .data contract patch => prepareInternalDataArmingContract? program state contract = some patch

instance (program : Program) (state : RuntimeState) (prepared : PreparedInternalArming) :
    Decidable (prepared.Prepared program state) := by
  cases prepared <;> unfold PreparedInternalArming.Prepared <;> infer_instance

def prepareInternalArming? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalArming := do
  if program.compensationEventSubProcessSnapshots.isSome then none else pure ()
  match dataArmingContract? operation with
  | some contract =>
      return .data contract (← prepareInternalDataArmingContract? program state contract)
  | none => return .ordinary operation (← prepareInternalArm? program state operation)

/-- The selected final-closure account checks the complete predecessor preparation, including data. -/
def applyPreparedInternalArming? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) : Option RuntimeState :=
  if program.compensationEventSubProcessSnapshots.isSome then none
  else if prepared.Prepared program state then some (prepared.apply state) else none

def PreparedInternalArming.Independent (left right : PreparedInternalArming) : Prop :=
  footprintsNonInterfering left.footprint right.footprint = true ∧
    footprintsNonInterfering right.footprint left.footprint = true

instance (left right : PreparedInternalArming) : Decidable (left.Independent right) :=
  inferInstanceAs (Decidable (_ ∧ _))

theorem PreparedInternalArming.independent_symm {left right : PreparedInternalArming}
    (independent : left.Independent right) : right.Independent left :=
  ⟨independent.2, independent.1⟩

def prepareInternalArmingBatch? (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) : Option (List PreparedInternalArming) := do
  if operations.length < 2 then none else pure ()
  let prepared ← operations.mapM (prepareInternalArming? program state)
  if prepared.Pairwise PreparedInternalArming.Independent then some prepared else none

def applyInternalArmingBatch (state : RuntimeState)
    (prepared : List PreparedInternalArming) : RuntimeState :=
  prepared.foldl PreparedInternalArming.apply state

theorem prepareInternalArming_sound (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalArming)
    (selected : prepareInternalArming? program state operation = some prepared) :
    prepared.Prepared program state ∧ prepared.operation = operation ∧
      program.compensationEventSubProcessSnapshots = none := by
  cases snapshots : program.compensationEventSubProcessSnapshots with
  | some _ => simp [prepareInternalArming?, snapshots] at selected
  | none =>
      cases decoded : dataArmingContract? operation with
      | none =>
          simp only [prepareInternalArming?, snapshots, Option.isSome_none, Bool.false_eq_true,
            if_false, decoded] at selected
          dsimp only [Pure.pure, Bind.bind, Option.bind] at selected
          obtain ⟨patch, found, selected⟩ := Option.bind_eq_some_iff.mp selected
          cases selected
          exact ⟨found, rfl, rfl⟩
      | some contract =>
          simp only [prepareInternalArming?, snapshots, Option.isSome_none, Bool.false_eq_true,
            if_false, decoded] at selected
          dsimp only [Pure.pure, Bind.bind, Option.bind] at selected
          obtain ⟨patch, found, selected⟩ := Option.bind_eq_some_iff.mp selected
          cases selected
          exact ⟨found, dataArmingContract_operation operation contract decoded, rfl⟩

private theorem prepareInternalArmingList_sound (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) (prepared : List PreparedInternalArming)
    (selected : operations.mapM (prepareInternalArming? program state) = some prepared) :
    (∀ member ∈ prepared, member.Prepared program state) ∧
      prepared.map PreparedInternalArming.operation = operations := by
  induction operations generalizing prepared with
  | nil =>
      simp at selected
      cases selected
      simp
  | cons operation rest ih =>
      simp only [List.mapM_cons] at selected
      obtain ⟨head, headSelected, selected⟩ := Option.bind_eq_some_iff.mp selected
      obtain ⟨tail, tailSelected, selected⟩ := Option.bind_eq_some_iff.mp selected
      cases selected
      obtain ⟨headPrepared, headOperation, _⟩ :=
        prepareInternalArming_sound program state operation head headSelected
      obtain ⟨tailPrepared, tailOperations⟩ := ih tail tailSelected
      exact ⟨by simpa using And.intro headPrepared tailPrepared,
        by simp [headOperation, tailOperations]⟩

/-- The executable classifier retains the entire caller list and every predecessor preparation. -/
theorem prepareInternalArmingBatch_sound (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) (prepared : List PreparedInternalArming)
    (selected : prepareInternalArmingBatch? program state operations = some prepared) :
    2 ≤ prepared.length ∧
      (∀ member ∈ prepared, member.Prepared program state) ∧
      prepared.Pairwise PreparedInternalArming.Independent ∧
      prepared.map PreparedInternalArming.operation = operations := by
  unfold prepareInternalArmingBatch? at selected
  split at selected
  · simp at selected
  · next sufficient =>
      dsimp only [Pure.pure, Bind.bind, Option.bind] at selected
      obtain ⟨members, allSelected, selected⟩ := Option.bind_eq_some_iff.mp selected
      split at selected
      · next independent =>
          cases selected
          obtain ⟨allPrepared, sameOperations⟩ :=
            prepareInternalArmingList_sound program state operations prepared allSelected
          have sameLength := congrArg List.length sameOperations
          simp only [List.length_map] at sameLength
          exact ⟨by omega, allPrepared, independent, sameOperations⟩
      · simp at selected

end BpmnSemantics.SemanticProcess.InternalCommutation
