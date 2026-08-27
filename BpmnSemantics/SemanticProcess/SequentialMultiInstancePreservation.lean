import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition

/-! # Sequential Multi-Instance well-formedness preservation

That every sequential Multi-Instance rewrite carries `controllersOwnLiveActivity` from its pre-state
to its post-state. The account is
[the Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md),
rules `SMI-ENTER-01`, `SMI-ITERATE-01`, `SMI-COMPLETE-01`, and `SMI-CANCEL-01`.

This closes a specific dependency rather than the whole runtime invariant. "One controller owns
exactly one live Activity record" is what makes the capsule's *active is at most one* law true, and
`generatedInstanceCount_eq_active_add_completed` consumes it as a hypothesis rather than proving it.
Evaluator soundness cannot supply it: each relation arm concludes with the post-state the evaluator
produced, so an arm cannot fail apart from the evaluator it certifies. A preservation result can,
which is why this owner exists separately from
[the transition bridge](SequentialMultiInstanceTransition.lean).

The three identity predicates involved compare one triple, namely Process instance, Activity element,
and activation. `controllerNamesActivityOccurrence` compares a controller against a record,
`sameSequentialMultiInstanceController` two controllers, and `sameActivityOccurrence` two records.
That agreement is what makes the two removing rewrites provable at all: a controller that survives
`SMI-COMPLETE-01` or `SMI-CANCEL-01` differs from the removed controller on the triple, so it cannot
have named the removed record either, and its own record survives with it.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- A controller distinct from the removed one never named a record that removal matches.

The step the removing rewrites turn on. Both filters are keyed on the same triple, so `candidate`
carries the removed record's identity, the removed controller carries it too, and the surviving
controller is known to differ from that controller. -/
private theorem name_of_removed_record_false
    (surviving target : SequentialMultiInstanceController)
    (record candidate : ActivityOccurrence)
    (targetNames : controllerNamesActivityOccurrence target record = true)
    (distinct : sameSequentialMultiInstanceController surviving target = false)
    (removed : sameActivityOccurrence candidate record = true) :
    controllerNamesActivityOccurrence surviving candidate = false := by
  cases named : controllerNamesActivityOccurrence surviving candidate with
  | false => rfl
  | true =>
      exfalso
      simp only [controllerNamesActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at named targetNames
      simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at removed
      have sameTriple : sameSequentialMultiInstanceController surviving target = true := by
        simp only [sameSequentialMultiInstanceController, Bool.and_eq_true, beq_iff_eq]
        exact ⟨⟨named.1.1.trans (removed.1.1.trans targetNames.1.1.symm),
            named.1.2.trans (removed.1.2.trans targetNames.1.2.symm)⟩,
          named.2.trans (removed.2.trans targetNames.2.symm)⟩
      rw [sameTriple] at distinct
      exact Bool.noConfusion distinct

/-- Removing the named record leaves every surviving controller's own record untouched. -/
private theorem filter_removed_record
    (surviving target : SequentialMultiInstanceController) (record : ActivityOccurrence)
    (targetNames : controllerNamesActivityOccurrence target record = true)
    (distinct : sameSequentialMultiInstanceController surviving target = false) :
    ∀ occurrences : List ActivityOccurrence,
      (occurrences.filter fun candidate => !sameActivityOccurrence candidate record).filter
          (controllerNamesActivityOccurrence surviving) =
        occurrences.filter (controllerNamesActivityOccurrence surviving) := by
  intro occurrences
  induction occurrences with
  | nil => rfl
  | cons head rest ih =>
      cases matched : sameActivityOccurrence head record with
      | true =>
          have absent : controllerNamesActivityOccurrence surviving head = false :=
            name_of_removed_record_false surviving target record head targetNames distinct matched
          simp [matched, absent, ih]
      | false => simp [List.filter_cons, matched, ih]

/-- The shared shape of `SMI-COMPLETE-01` and `SMI-CANCEL-01`: one controller and the one record it
names leave together, and nothing else about the pair changes. -/
private theorem controllersOwnLiveActivity_of_paired_removal
    (controllers : List SequentialMultiInstanceController)
    (occurrences : List ActivityOccurrence)
    (target : SequentialMultiInstanceController) (record : ActivityOccurrence)
    (targetNames : controllerNamesActivityOccurrence target record = true)
    (invariant : controllers.all fun controller =>
      decide ((occurrences.filter (controllerNamesActivityOccurrence controller)).length = 1) = true) :
    (controllers.filter fun candidate =>
        !sameSequentialMultiInstanceController candidate target).all fun controller =>
      decide (((occurrences.filter fun candidate =>
        !sameActivityOccurrence candidate record).filter
          (controllerNamesActivityOccurrence controller)).length = 1) = true := by
  rw [List.all_eq_true] at invariant ⊢
  intro controller member
  obtain ⟨present, distinct⟩ := List.mem_filter.mp member
  rw [filter_removed_record controller target record targetNames (by simpa using distinct)]
  exact invariant controller present

/-- Storing a result changes only `outputSlots`, which the naming triple does not read. -/
private theorem name_of_stored (candidate target : SequentialMultiInstanceController)
    (result : String) (record : ActivityOccurrence) :
    controllerNamesActivityOccurrence
        (if sameSequentialMultiInstanceController candidate target then
          { candidate with outputSlots := candidate.outputSlots ++ [result] } else candidate)
        record =
      controllerNamesActivityOccurrence candidate record := by
  by_cases hit : sameSequentialMultiInstanceController candidate target = true
  · simp [hit, controllerNamesActivityOccurrence]
  · simp [hit]

/-- `SMI-ITERATE-01` turns the body over and stores one result; neither moves the naming triple. -/
theorem iteratedState_preserves_controllersOwnLiveActivity
    (state : RuntimeState) (record : ActivityOccurrence) (wait : UserTaskWait)
    (body : OccurrenceId) (target : SequentialMultiInstanceController) (result : String)
    (wellFormed : controllersOwnLiveActivity state = true) :
    controllersOwnLiveActivity (iteratedState state record wait body target result) = true := by
  have carried := (controllersOwnLiveActivity_replacedState state record wait body).trans wellFormed
  simp only [controllersOwnLiveActivity, iteratedState] at carried ⊢
  rw [List.all_eq_true] at carried ⊢
  intro candidate member
  simp only [storeIterationResult, List.mem_map] at member
  obtain ⟨original, present, rfl⟩ := member
  have inherited := carried original present
  simp only [decide_eq_true_eq] at inherited ⊢
  rw [List.filter_congr fun r _ => name_of_stored original target result r]
  exact inherited

/-- The canonical insert changes where a record sits, never how many a predicate selects. -/
private theorem length_filter_insertActivityOccurrence (predicate : ActivityOccurrence → Bool)
    (record : ActivityOccurrence) : ∀ occurrences : List ActivityOccurrence,
    ((insertActivityOccurrence record occurrences).filter predicate).length =
      ((record :: occurrences).filter predicate).length := by
  intro occurrences
  induction occurrences with
  | nil => rfl
  | cons head rest ih =>
      cases before : activityOccurrenceBefore record head with
      | true => simp [insertActivityOccurrence, before]
      | false =>
          cases headSelected : predicate head <;> cases recordSelected : predicate record <;>
            simp [insertActivityOccurrence, before, headSelected,
              recordSelected, ih] at ih ⊢ <;>
            omega

/-- The identity bound, read at one Activity record. -/
private theorem activation_le_count_of_identityBound (state : RuntimeState)
    (bounded : runtimeStateIdentityBound state = true)
    (record : ActivityOccurrence) (present : record ∈ state.activityOccurrences) :
    record.activation ≤
      activityActivationCount state { value := record.activityElementId.value } := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounded
  simpa using List.all_eq_true.mp bounded.2 record present

/-- The controller `SMI-ENTER-01` mints names no record that was already there.

The identity bound is what makes this true rather than merely plausible: the minted activation is one
above the element's recorded count, and no present record is numbered above that count. -/
private theorem entered_names_no_present_record
    (arm : SequentialMultiInstanceArm) (state : RuntimeState) (instanceId : SemanticId)
    (items : List String) (bounded : runtimeStateIdentityBound state = true)
    (record : ActivityOccurrence) (present : record ∈ state.activityOccurrences) :
    controllerNamesActivityOccurrence (enteredController arm state instanceId items) record =
      false := by
  cases named :
      controllerNamesActivityOccurrence (enteredController arm state instanceId items) record with
  | false => rfl
  | true =>
      exfalso
      have bound := activation_le_count_of_identityBound state bounded record present
      simp only [controllerNamesActivityOccurrence, enteredController, Bool.and_eq_true,
        beq_iff_eq] at named
      rw [← named.1.2, ← named.2] at bound
      have normalized : activityActivationCount state
            { value := ({ value := arm.taskId.value } : NodeId).value } =
          activityActivationCount state arm.taskId := rfl
      rw [normalized] at bound
      omega

/-- Naming is an equality of one triple, so it transfers along any two controllers that agree. -/
private theorem name_transfer (left right : SequentialMultiInstanceController)
    (record shared : ActivityOccurrence)
    (leftRecord : controllerNamesActivityOccurrence left record = true)
    (leftShared : controllerNamesActivityOccurrence left shared = true)
    (rightShared : controllerNamesActivityOccurrence right shared = true) :
    controllerNamesActivityOccurrence right record = true := by
  simp only [controllerNamesActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at *
  exact ⟨⟨rightShared.1.1.trans (leftShared.1.1.symm.trans leftRecord.1.1),
      rightShared.1.2.trans (leftShared.1.2.symm.trans leftRecord.1.2)⟩,
    rightShared.2.trans (leftShared.2.symm.trans leftRecord.2)⟩

/-- Adding a controller together with one freshly identified record it names keeps the invariant.

Stated over an arbitrary minted pair rather than over the entry rewrite, because what makes it true
is only that the record's identity is new: no controller already present can reach it, and the new
controller reaches nothing that was already there. -/
private theorem controllersOwnLiveActivity_of_minted_pair
    (state : RuntimeState) (minted : SequentialMultiInstanceController)
    (record : ActivityOccurrence)
    (mints : controllerNamesActivityOccurrence minted record = true)
    (fresh : ∀ present ∈ state.activityOccurrences,
      controllerNamesActivityOccurrence minted present = false)
    (wellFormed : controllersOwnLiveActivity state = true) :
    ((minted :: state.sequentialMultiInstanceControllers).all fun controller =>
      ((insertActivityOccurrence record state.activityOccurrences).filter
        (controllerNamesActivityOccurrence controller)).length = 1) = true := by
  simp only [controllersOwnLiveActivity] at wellFormed
  rw [List.all_eq_true] at wellFormed ⊢
  intro controller member
  simp only [decide_eq_true_eq]
  rw [length_filter_insertActivityOccurrence]
  rcases List.mem_cons.mp member with rfl | present
  · have empty : state.activityOccurrences.filter
        (controllerNamesActivityOccurrence controller) = [] :=
      List.filter_eq_nil_iff.mpr fun present member => by
        simp [fresh present member]
    simp [mints, empty]
  · have inherited := wellFormed controller present
    simp only [decide_eq_true_eq] at inherited
    obtain ⟨owned, singleton⟩ := List.length_eq_one_iff.mp inherited
    have selected : owned ∈ state.activityOccurrences.filter
        (controllerNamesActivityOccurrence controller) := by
      rw [singleton]; simp
    have ownedMember := (List.mem_filter.mp selected).1
    have ownedNamed := (List.mem_filter.mp selected).2
    have absent : controllerNamesActivityOccurrence controller record = false := by
      cases named : controllerNamesActivityOccurrence controller record with
      | false => rfl
      | true =>
          exact absurd (name_transfer controller minted owned record ownedNamed named mints)
            (by rw [fresh owned ownedMember]; exact Bool.noConfusion)
    simp [absent, inherited]

/-- `SMI-ENTER-01` on a nonempty collection mints one controller and the one record it names.

The identity bound is load-bearing rather than bookkeeping: without it the minted activation could
collide with a record already present, and the entry would leave a controller naming two. -/
theorem firstIterationEntryState_preserves_controllersOwnLiveActivity
    (arm : SequentialMultiInstanceArm) (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (items : List String)
    (bounded : runtimeStateIdentityBound state = true)
    (wellFormed : controllersOwnLiveActivity state = true) :
    controllersOwnLiveActivity (firstIterationEntryState arm state instanceId owner items) =
      true := by
  simp only [controllersOwnLiveActivity, firstIterationEntryState, activateBoundedUserTask]
  exact controllersOwnLiveActivity_of_minted_pair state
    (enteredController arm state instanceId items) _
    (by simp [controllerNamesActivityOccurrence, enteredController,
      SequentialMultiInstanceArm.innerTask])
    (fun present member =>
      entered_names_no_present_record arm state instanceId items bounded present member)
    wellFormed

/-- `SMI-ENTER-01` on an empty collection touches neither collection the invariant reads. -/
theorem emptyCollectionEntryState_preserves_controllersOwnLiveActivity
    (arm : SequentialMultiInstanceArm) (state : RuntimeState) (owner : ScopeOccurrenceId)
    (wellFormed : controllersOwnLiveActivity state = true) :
    controllersOwnLiveActivity (emptyCollectionEntryState arm state owner) = true := by
  simpa [controllersOwnLiveActivity, emptyCollectionEntryState] using wellFormed

/-- `SMI-COMPLETE-01` removes the controller together with the one record it names. -/
theorem finalCompletionState_preserves_controllersOwnLiveActivity
    (arm : SequentialMultiInstanceArm) (state : RuntimeState) (record : ActivityOccurrence)
    (body : OccurrenceId) (target : SequentialMultiInstanceController) (items : List String)
    (targetNames : controllerNamesActivityOccurrence target record = true)
    (wellFormed : controllersOwnLiveActivity state = true) :
    controllersOwnLiveActivity (finalCompletionState arm state record body target items) = true := by
  simpa [controllersOwnLiveActivity, finalCompletionState] using
    controllersOwnLiveActivity_of_paired_removal state.sequentialMultiInstanceControllers
      state.activityOccurrences target record targetNames
      (by simpa [controllersOwnLiveActivity] using wellFormed)

/-- `SMI-CANCEL-01` removes the same pair, by the outer deadline rather than the final result. -/
theorem interruptionState_preserves_controllersOwnLiveActivity
    (arm : SequentialMultiInstanceArm) (state : RuntimeState) (record : ActivityOccurrence)
    (body : OccurrenceId) (deadline : TimerWait) (target : SequentialMultiInstanceController)
    (targetNames : controllerNamesActivityOccurrence target record = true)
    (wellFormed : controllersOwnLiveActivity state = true) :
    controllersOwnLiveActivity (interruptionState arm state record body deadline target) = true := by
  simpa [controllersOwnLiveActivity, interruptionState] using
    controllersOwnLiveActivity_of_paired_removal state.sequentialMultiInstanceControllers
      state.activityOccurrences target record targetNames
      (by simpa [controllersOwnLiveActivity] using wellFormed)

end BpmnSemantics.SemanticProcess
