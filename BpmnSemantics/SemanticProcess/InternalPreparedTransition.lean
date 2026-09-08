import BpmnSemantics.SemanticProcess.InternalLocalControlArmingCommutation

/-! Complete finite mixed preparations follow the predecessor-only
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive PreparedInternalTransition where
  | arming (prepared : PreparedInternalArming)
  | localControl (prepared : PreparedInternalLocalControl)
  deriving Repr, DecidableEq

def PreparedInternalTransition.operation : PreparedInternalTransition → SemanticOperation
  | .arming prepared => prepared.operation
  | .localControl prepared => prepared.operation

def PreparedInternalTransition.apply (state : RuntimeState) :
    PreparedInternalTransition → RuntimeState
  | .arming prepared => prepared.apply state
  | .localControl prepared => prepared.selection.apply state

def PreparedInternalTransition.stateFootprint :
    PreparedInternalTransition → InternalTransitionStateFootprint
  | .arming prepared => prepared.stateFootprint
  | .localControl prepared => prepared.footprint

def PreparedInternalTransition.Prepared (program : Program) (state : RuntimeState) :
    PreparedInternalTransition → Prop
  | .arming prepared => prepared.Prepared program state
  | .localControl prepared =>
      prepareInternalLocalControl? program state prepared.operation = some prepared

instance (program : Program) (state : RuntimeState) (prepared : PreparedInternalTransition) :
    Decidable (prepared.Prepared program state) := by
  cases prepared <;> unfold PreparedInternalTransition.Prepared <;> infer_instance

/-- Existing arming publication conflicts remain checked. Local instantaneous anchors receive
their distinct indices only after the selected account's unique-alternative batch sort. -/
def PreparedInternalTransition.Independent (left right : PreparedInternalTransition) : Prop :=
  match left, right with
  | .arming first, .arming second => first.Independent second
  | _, _ => localControlStateFootprintsNonInterfering left.stateFootprint right.stateFootprint = true

instance (left right : PreparedInternalTransition) : Decidable (left.Independent right) := by
  cases left <;> cases right <;> unfold PreparedInternalTransition.Independent <;> infer_instance

theorem PreparedInternalTransition.independent_symm {left right : PreparedInternalTransition}
    (separated : left.Independent right) : right.Independent left := by
  cases left <;> cases right
  · exact PreparedInternalArming.independent_symm separated
  all_goals exact localControlStateFootprintsNonInterfering_symm _ _ separated

def prepareInternalTransition? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalTransition :=
  match internalLocalControlOrigin? operation with
  | some _ =>
      if program.compensationEventSubProcessSnapshots.isSome then none
      else (prepareInternalLocalControl? program state operation).map .localControl
  | none => (prepareInternalArming? program state operation).map .arming

def applyPreparedInternalTransition? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) : Option RuntimeState :=
  if program.compensationEventSubProcessSnapshots.isSome then none
  else if prepared.Prepared program state then some (prepared.apply state) else none

def prepareInternalTransitionBatch? (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) : Option (List PreparedInternalTransition) := do
  if operations.length < 2 then none else pure ()
  let prepared ← operations.mapM (prepareInternalTransition? program state)
  if prepared.Pairwise (fun left right => left.operation.id ≠ right.operation.id) ∧
      prepared.Pairwise PreparedInternalTransition.Independent then some prepared else none

def applyInternalTransitionBatch (state : RuntimeState)
    (prepared : List PreparedInternalTransition) : RuntimeState :=
  prepared.foldl PreparedInternalTransition.apply state

theorem prepareInternalTransition_sound (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalTransition)
    (found : prepareInternalTransition? program state operation = some prepared) :
    prepared.Prepared program state ∧ prepared.operation = operation ∧
      program.compensationEventSubProcessSnapshots = none := by
  cases originFound : internalLocalControlOrigin? operation with
  | none =>
      simp only [prepareInternalTransition?, originFound] at found
      obtain ⟨arm, selected, rfl⟩ := Option.map_eq_some_iff.mp found
      exact prepareInternalArming_sound program state operation arm selected
  | some origin =>
      cases snapshots : program.compensationEventSubProcessSnapshots with
      | some _ => simp [prepareInternalTransition?, originFound, snapshots] at found
      | none =>
          simp only [prepareInternalTransition?, originFound, snapshots, Option.isSome_none,
            Bool.false_eq_true, ↓reduceIte] at found
          obtain ⟨localPrepared, selected, rfl⟩ := Option.map_eq_some_iff.mp found
          have operationEq : localPrepared.operation = operation := by
            obtain ⟨selection, _, _, _, _, selectedOperation, _, _, _, _, _, _, _, _, _, rfl⟩ :=
              prepareInternalLocalControl_facts program state operation localPrepared selected
            exact selectInternalLocalControl_operation state operation selection selectedOperation
          refine ⟨?_, operationEq, rfl⟩
          change prepareInternalLocalControl? program state localPrepared.operation = some localPrepared
          rw [operationEq]
          exact selected

private theorem prepareInternalTransitionList_sound (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) (prepared : List PreparedInternalTransition)
    (found : operations.mapM (prepareInternalTransition? program state) = some prepared) :
    (∀ member ∈ prepared, member.Prepared program state) ∧
      prepared.map PreparedInternalTransition.operation = operations := by
  induction operations generalizing prepared with
  | nil =>
      simp at found
      cases found
      simp
  | cons operation rest ih =>
      simp only [List.mapM_cons] at found
      obtain ⟨head, headFound, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨tail, tailFound, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      obtain ⟨headPrepared, headOperation, _⟩ := prepareInternalTransition_sound program state
        operation head headFound
      obtain ⟨tailPrepared, tailOperations⟩ := ih tail tailFound
      exact ⟨by simpa using And.intro headPrepared tailPrepared,
        by simp [headOperation, tailOperations]⟩

/-- Classification retains every member and its exact operation in caller order, with complete
predecessor preparation, distinct alternatives, and all-pairs separation. -/
theorem prepareInternalTransitionBatch_sound (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) (prepared : List PreparedInternalTransition)
    (found : prepareInternalTransitionBatch? program state operations = some prepared) :
    2 ≤ prepared.length ∧
      (∀ member ∈ prepared, member.Prepared program state) ∧
      prepared.Pairwise (fun left right => left.operation.id ≠ right.operation.id) ∧
      prepared.Pairwise PreparedInternalTransition.Independent ∧
      prepared.map PreparedInternalTransition.operation = operations := by
  unfold prepareInternalTransitionBatch? at found
  split at found
  · simp at found
  · next sufficient =>
      dsimp only [Pure.pure, Bind.bind, Option.bind] at found
      obtain ⟨members, allFound, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · next classified =>
          cases found
          obtain ⟨allPrepared, sameOperations⟩ :=
            prepareInternalTransitionList_sound program state operations prepared allFound
          have sameLength := congrArg List.length sameOperations
          simp only [List.length_map] at sameLength
          exact ⟨by omega, allPrepared, classified.1, classified.2, sameOperations⟩
      · simp at found

theorem prepareInternalTransition_snapshots_refused (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (snapshots : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some snapshots) :
    prepareInternalTransition? program state operation = none := by
  cases origin : internalLocalControlOrigin? operation <;>
    simp [prepareInternalTransition?, origin, prepareInternalArming?, declared]

end BpmnSemantics.SemanticProcess.InternalCommutation
