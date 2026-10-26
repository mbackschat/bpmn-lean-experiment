module

public import BpmnSemantics.SemanticProcess.InternalCommutationCore
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.InternalArmingOrder

/-! PMIS-SELECT-01 shares retained-anchor issuance checks with private command admission without importing transition publication back into admission. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

def occurrenceCounterRowsValid (counters : List (String × Nat)) : Bool :=
  decide (counters.map Prod.fst).Nodup && counters.all (fun counter =>
    !counter.1.isEmpty && SemanticProcessJson.isSafeWireNat counter.2)

/-- Issuance counters must dominate retained anchors, including suspended effects and their local frames. -/
def occurrenceReservationStateValid (state : RuntimeState) : Bool :=
  let compensation := state.compensationHandlerEffectWaits.map fun wait =>
    ({ processInstanceId := wait.id.processInstanceId, elementId := wait.id.elementId,
       activation := wait.id.activation } : OccurrenceId)
  let issued := fun (id : OccurrenceId) (count : Nat) =>
    0 < id.activation && SemanticProcessJson.isSafeWireNat id.activation && id.activation ≤ count
  occurrenceCounterRowsValid (state.activations.map fun row => (row.taskId.value, row.count)) &&
    occurrenceCounterRowsValid (state.effectActivations.map fun row => (row.elementId.value, row.count)) &&
    decide (openWaitAnchors state ++ compensation).Nodup &&
    decide (state.variables.activities.map (·.owner)).Nodup &&
    state.waits.all (fun wait => issued (userTaskWaitOccurrence wait) (activationCount state wait.task.id)) &&
    (state.effectWaits.map effectWaitOccurrence ++
      state.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait) ++ compensation).all
      (fun id => issued id (effectActivationCount state ⟨id.elementId.value⟩)) &&
    state.variables.activities.all (fun frame => match frame.owner with
      | .effectOccurrence id => issued ⟨id.processInstanceId, id.elementId, id.activation⟩
          (effectActivationCount state ⟨id.elementId.value⟩)
      | .activityOccurrence _ => true)

/-- String-key reservation lookup agrees with the native task counter, including an absent row. -/
theorem taskActivationCount_string_lookup (rows : List TaskActivation) (task : TaskDefinitionId) :
    (((rows.map fun row => (row.taskId.value, row.count)).find? (·.1 == task.value)).map Prod.snd).getD 0 =
      taskActivationCount rows task := by
  induction rows with
  | nil => rfl
  | cons row rows ih =>
      have same : row.taskId = task ↔ row.taskId.value = task.value := by
        cases row.taskId; cases task; simp
      by_cases equal : row.taskId = task
      · simp [taskActivationCount, equal]
      · have checked : (row.taskId.value == task.value) = false := by
          cases result : row.taskId.value == task.value <;> try rfl
          exact False.elim (equal (same.mpr (eq_of_beq result)))
        simp [taskActivationCount, equal, checked] at ih ⊢
        exact ih

/-- String-key reservation lookup agrees with the native element counter without discarding duplicate rows. -/
theorem elementActivationCount_string_lookup (rows : List (NodeId × Nat)) (element : NodeId) :
    (((rows.map fun row => (row.1.value, row.2)).find? (·.1 == element.value)).map Prod.snd).getD 0 =
      elementActivationCount rows element := by
  induction rows with
  | nil => rfl
  | cons row rows ih =>
      have same : row.1 = element ↔ row.1.value = element.value := by
        cases row.1; cases element; simp
      by_cases equal : row.1 = element
      · simp [List.find?, elementActivationCount, equal]
      · have checked : (row.1.value == element.value) = false := by
          cases result : row.1.value == element.value <;> try rfl
          exact False.elim (equal (same.mpr (eq_of_beq result)))
        simp [List.find?, elementActivationCount, equal, checked] at ih ⊢
        exact ih

/-- The effect counter uses the same exact string-key lookup as reserved arming. -/
theorem effectActivationCount_string_lookup (state : RuntimeState) (element : NodeId) :
    (((state.effectActivations.map fun row => (row.elementId.value, row.count)).find?
      (·.1 == element.value)).map Prod.snd).getD 0 = effectActivationCount state element := by
  simpa only [effectActivationCount, List.map_map, Function.comp_def] using
    elementActivationCount_string_lookup (state.effectActivations.map fun row => (row.elementId, row.count)) element

/-- Counter replacement validates keys and wire values independently of canonical row order. -/
private theorem counter_rows_replacement_valid (key : α → String) (count : α → Nat)
    (rows updated : List α) (replacement : α) (keep : α → Bool)
    (valid : occurrenceCounterRowsValid (rows.map fun row => (key row, count row)) = true)
    (nonempty : (key replacement).isEmpty = false)
    (safe : SemanticProcessJson.isSafeWireNat (count replacement) = true)
    (retained : ∀ row, keep row = true → key row ≠ key replacement)
    (permutation : updated.Perm (replacement :: rows.filter keep)) :
    occurrenceCounterRowsValid (updated.map fun row => (key row, count row)) = true := by
  obtain ⟨unique, typed⟩ := Bool.and_eq_true_iff.mp valid
  have originalUnique : (rows.map key).Nodup := by
    simpa only [List.map_map, Function.comp_def] using of_decide_eq_true unique
  have retainedUnique : ((rows.filter keep).map key).Nodup :=
    (List.filter_sublist.map key).nodup originalUnique
  have absent : key replacement ∉ (rows.filter keep).map key := by
    intro member
    obtain ⟨row, present, equal⟩ := List.mem_map.mp member
    exact retained row (List.mem_filter.mp present).2 equal
  have newUnique : (updated.map key).Nodup :=
    (permutation.map key).nodup_iff.mpr (List.nodup_cons.mpr ⟨absent, retainedUnique⟩)
  apply Bool.and_eq_true_iff.mpr
  refine ⟨?_, List.all_eq_true.mpr ?_⟩
  · simpa only [List.map_map, Function.comp_def] using (decide_eq_true newUnique)
  · intro pair present
    obtain ⟨row, member, rfl⟩ := List.mem_map.mp present
    have member := permutation.mem_iff.mp member
    rcases List.mem_cons.mp member with equal | old
    · subst row
      simp only [nonempty, Bool.not_false, safe, Bool.true_and]
    · exact List.all_eq_true.mp typed _
        (List.mem_map.mpr ⟨row, (List.mem_filter.mp old).1, rfl⟩)

private theorem counter_insertion_perm (before : α → α → Bool) (row : α) (rows : List α) :
    (canonicalInsertBy before row rows).Perm (row :: rows) := by
  have kept (values : List α) : values.filter (fun _ => true) = values :=
    List.filter_eq_self.mpr (fun _ _ => rfl)
  simpa only [kept] using filter_canonicalInsertBy_perm before (fun _ => true) row rows rfl

private theorem task_counter_insertion (row : TaskActivation) (rows : List TaskActivation) :
    insertTaskActivation row rows =
      canonicalInsertBy (fun left right => left.taskId.value < right.taskId.value) row rows := by
  induction rows with
  | nil => rfl
  | cons current rest ih => simp only [insertTaskActivation, canonicalInsertBy, ih, decide_eq_true_eq]

/-- A safe Human counter update preserves unique nonempty counter keys and safe values. -/
theorem occurrenceCounterRowsValid_setActivationCount (rows : List TaskActivation)
    (task : TaskDefinitionId) (count : Nat)
    (valid : occurrenceCounterRowsValid (rows.map fun row => (row.taskId.value, row.count)) = true)
    (nonempty : task.value.isEmpty = false)
    (safe : SemanticProcessJson.isSafeWireNat count = true) :
    occurrenceCounterRowsValid ((setActivationCount rows task count).map
      fun row => (row.taskId.value, row.count)) = true := by
  apply counter_rows_replacement_valid (fun row : TaskActivation => row.taskId.value) (·.count)
    rows _ ⟨task, count⟩ (fun row => decide (row.taskId ≠ task)) valid nonempty safe
  · intro row kept equal
    have different := of_decide_eq_true kept
    apply different
    change row.taskId.value = task.value at equal
    exact congrArg TaskDefinitionId.mk equal
  · unfold setActivationCount
    rw [task_counter_insertion]
    exact counter_insertion_perm _ _ _

/-- A safe Service counter update preserves the same row-validity contract as Human arming. -/
theorem occurrenceCounterRowsValid_setEffectActivationCount (rows : List EffectActivation)
    (element : NodeId) (count : Nat)
    (valid : occurrenceCounterRowsValid (rows.map fun row => (row.elementId.value, row.count)) = true)
    (nonempty : element.value.isEmpty = false)
    (safe : SemanticProcessJson.isSafeWireNat count = true) :
    occurrenceCounterRowsValid ((setEffectActivationCount rows element count).map
      fun row => (row.elementId.value, row.count)) = true := by
  apply counter_rows_replacement_valid (fun row : EffectActivation => row.elementId.value) (·.count)
    rows _ ⟨element, count⟩ (fun row => decide (row.elementId ≠ element)) valid nonempty safe
  · intro row kept equal
    have different := of_decide_eq_true kept
    apply different
    change row.elementId.value = element.value at equal
    exact congrArg NodeId.mk equal
  · exact counter_insertion_perm _ _ _

/-- Increasing only issuance counters preserves every retained anchor and local-frame bound. -/
theorem occurrenceReservationStateValid_counter_transport (before : RuntimeState)
    (activations : List TaskActivation) (effects : List EffectActivation)
    (valid : occurrenceReservationStateValid before = true)
    (humanRows : occurrenceCounterRowsValid (activations.map fun row => (row.taskId.value, row.count)) = true)
    (effectRows : occurrenceCounterRowsValid (effects.map fun row => (row.elementId.value, row.count)) = true)
    (humanMonotone : ∀ task, activationCount before task ≤
      activationCount { before with activations, effectActivations := effects } task)
    (effectMonotone : ∀ element, effectActivationCount before element ≤
      effectActivationCount { before with activations, effectActivations := effects } element) :
    occurrenceReservationStateValid { before with activations, effectActivations := effects } = true := by
  simp only [occurrenceReservationStateValid, Bool.and_eq_true, List.all_eq_true,
    decide_eq_true_eq] at valid ⊢
  rcases valid with ⟨⟨⟨⟨⟨⟨_, _⟩, anchors⟩, uniqueFrames⟩, humans⟩, effectBounds⟩, frames⟩
  refine ⟨⟨⟨⟨⟨⟨humanRows, effectRows⟩, anchors⟩, uniqueFrames⟩, ?_⟩, ?_⟩, ?_⟩
  · intro wait member
    obtain ⟨checks, bounded⟩ := humans wait member
    exact ⟨checks, Nat.le_trans bounded (humanMonotone wait.task.id)⟩
  · intro id member
    obtain ⟨checks, bounded⟩ := effectBounds id member
    exact ⟨checks, Nat.le_trans bounded (effectMonotone ⟨id.elementId.value⟩)⟩
  · intro frame member
    have bounded := frames frame member
    cases owner : frame.owner with
    | activityOccurrence id => trivial
    | effectOccurrence id =>
        simp only [owner, Bool.and_eq_true, decide_eq_true_eq] at bounded ⊢
        exact ⟨bounded.1, Nat.le_trans bounded.2 (effectMonotone ⟨id.elementId.value⟩)⟩

/-- A safe monotone Human counter replacement retains reservation validity for all existing families. -/
theorem occurrenceReservationStateValid_setActivationCount (before : RuntimeState)
    (task : TaskDefinitionId) (count : Nat)
    (valid : occurrenceReservationStateValid before = true)
    (nonempty : task.value.isEmpty = false)
    (safe : SemanticProcessJson.isSafeWireNat count = true)
    (monotone : activationCount before task ≤ count) :
    occurrenceReservationStateValid { before with
      activations := setActivationCount before.activations task count } = true := by
  have rows := valid
  simp only [occurrenceReservationStateValid, Bool.and_eq_true] at rows
  apply occurrenceReservationStateValid_counter_transport before
    (setActivationCount before.activations task count) before.effectActivations valid
  · exact occurrenceCounterRowsValid_setActivationCount _ _ _ rows.1.1.1.1.1.1 nonempty safe
  · exact rows.1.1.1.1.1.2
  · intro query
    by_cases same : query = task
    · subst query
      rw [activationCount_setActivationCount_self]
      exact monotone
    · rw [activationCount_setActivationCount_other before task query count same]
      exact Nat.le_refl _
  · intro element
    exact Nat.le_refl _

/-- A safe monotone Effect counter replacement retains incidents, Compensation anchors and local-frame bounds. -/
theorem occurrenceReservationStateValid_setEffectActivationCount (before : RuntimeState)
    (element : NodeId) (count : Nat)
    (valid : occurrenceReservationStateValid before = true)
    (nonempty : element.value.isEmpty = false)
    (safe : SemanticProcessJson.isSafeWireNat count = true)
    (monotone : effectActivationCount before element ≤ count) :
    occurrenceReservationStateValid { before with
      effectActivations := setEffectActivationCount before.effectActivations element count } = true := by
  have rows := valid
  simp only [occurrenceReservationStateValid, Bool.and_eq_true] at rows
  apply occurrenceReservationStateValid_counter_transport before before.activations
    (setEffectActivationCount before.effectActivations element count) valid
  · exact rows.1.1.1.1.1.1
  · exact occurrenceCounterRowsValid_setEffectActivationCount _ _ _ rows.1.1.1.1.1.2 nonempty safe
  · intro task
    exact Nat.le_refl _
  · intro query
    by_cases same : query = element
    · subst query
      rw [effectActivationCount_set_self]
      exact monotone
    · rw [effectActivationCount_set_other before element query count same]
      exact Nat.le_refl _

private theorem insertion_front_perm (left right : List α) (value : α) :
    (left ++ value :: right).Perm (value :: (left ++ right)) := by
  induction left with
  | nil => exact List.Perm.refl _
  | cons head tail ih =>
      exact (List.Perm.cons head ih).trans (List.Perm.swap _ _ _)

private theorem activity_scope_insertion_perm (frame : ActivityVariableScope)
    (frames : List ActivityVariableScope) :
    (insertActivityVariableScope frame frames).Perm (frame :: frames) := by
  induction frames with
  | nil => exact List.Perm.refl _
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      split
      · exact List.Perm.refl _
      · exact (List.Perm.cons current ih).trans (List.Perm.swap _ _ _)

/-- A fresh Human wait retains reservation validity, including the Compensation anchor census. -/
theorem occurrenceReservationStateValid_insertUserTaskWait (before : RuntimeState) (wait : UserTaskWait)
    (valid : occurrenceReservationStateValid before = true)
    (positive : 0 < wait.activation)
    (safe : SemanticProcessJson.isSafeWireNat wait.activation = true)
    (bounded : wait.activation ≤ activationCount before wait.task.id)
    (fresh : userTaskWaitOccurrence wait ∉ openWaitAnchors before ++
      before.compensationHandlerEffectWaits.map (fun retained =>
        (⟨retained.id.processInstanceId, retained.id.elementId, retained.id.activation⟩ : OccurrenceId))) :
    occurrenceReservationStateValid { before with waits := insertUserTaskWait wait before.waits } = true := by
  have inserted : (insertUserTaskWait wait before.waits).Perm (wait :: before.waits) := by
    rw [insertUserTaskWait_eq_canonicalInsertBy]
    exact counter_insertion_perm _ _ _
  simp only [occurrenceReservationStateValid, Bool.and_eq_true] at valid ⊢
  rcases valid with ⟨⟨⟨⟨⟨⟨humanRows, effectRows⟩, anchors⟩, uniqueFrames⟩, humans⟩, effects⟩, frames⟩
  refine ⟨⟨⟨⟨⟨⟨humanRows, effectRows⟩, ?_⟩, uniqueFrames⟩, ?_⟩, effects⟩, frames⟩
  · have permutation := (inserted.map userTaskWaitOccurrence).append_right
        (before.messageWaits.map messageWaitOccurrence ++ before.timerWaits.map timerWaitOccurrence ++
          before.effectWaits.map effectWaitOccurrence ++
          before.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait) ++
          before.compensationHandlerEffectWaits.map (fun retained =>
            (⟨retained.id.processInstanceId, retained.id.elementId, retained.id.activation⟩ : OccurrenceId)))
    apply decide_eq_true
    simp only [openWaitAnchors, List.append_assoc] at fresh anchors ⊢
    simp only [List.map_cons, List.cons_append, List.append_assoc] at permutation
    apply permutation.nodup_iff.mpr
    exact List.nodup_cons.mpr ⟨fresh, of_decide_eq_true anchors⟩
  · rw [all_insertUserTaskWait]
    apply Bool.and_eq_true_iff.mpr
    refine ⟨?_, humans⟩
    simp only [Bool.and_eq_true, decide_eq_true_eq]
    simp only [userTaskWaitOccurrence]
    exact ⟨⟨positive, safe⟩, bounded⟩

/-- A fresh Effect wait and fresh effect-local frame retain all reservation issuance bounds. -/
theorem occurrenceReservationStateValid_insertEffectWait (before : RuntimeState) (wait : EffectWait)
    (bindings : List VariableBinding) (valid : occurrenceReservationStateValid before = true)
    (positive : 0 < wait.activation)
    (safe : SemanticProcessJson.isSafeWireNat wait.activation = true)
    (bounded : wait.activation ≤ effectActivationCount before wait.elementId)
    (fresh : effectWaitOccurrence wait ∉ openWaitAnchors before ++
      before.compensationHandlerEffectWaits.map (fun retained =>
        (⟨retained.id.processInstanceId, retained.id.elementId, retained.id.activation⟩ : OccurrenceId)))
    (frameFresh : LocalDataOwner.effectOccurrence
      ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩ ∉ before.variables.activities.map (·.owner)) :
    occurrenceReservationStateValid { before with
      effectWaits := insertEffectWait wait before.effectWaits,
      variables := { before.variables with
        activities := insertActivityVariableScope
          ⟨.effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩, bindings⟩
          before.variables.activities } } = true := by
  let id := effectWaitOccurrence wait
  let compensation := before.compensationHandlerEffectWaits.map (fun retained =>
    (⟨retained.id.processInstanceId, retained.id.elementId, retained.id.activation⟩ : OccurrenceId))
  let left := before.waits.map userTaskWaitOccurrence ++ before.messageWaits.map messageWaitOccurrence ++
    before.timerWaits.map timerWaitOccurrence
  let right := before.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait) ++ compensation
  have inserted := (counter_insertion_perm effectWaitBefore wait before.effectWaits).map effectWaitOccurrence
  have effectPermutation := inserted.append_right right
  have anchorPermutation := (effectPermutation.append_left left).trans
    (insertion_front_perm left (before.effectWaits.map effectWaitOccurrence ++ right) id)
  have localPermutation := (activity_scope_insertion_perm
    ⟨.effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩, bindings⟩
    before.variables.activities).map (·.owner)
  simp only [occurrenceReservationStateValid, Bool.and_eq_true] at valid ⊢
  rcases valid with ⟨⟨⟨⟨⟨⟨humanRows, effectRows⟩, anchors⟩, uniqueFrames⟩, humans⟩, effects⟩, frames⟩
  refine ⟨⟨⟨⟨⟨⟨humanRows, effectRows⟩, ?_⟩, ?_⟩, humans⟩, ?_⟩, ?_⟩
  · apply decide_eq_true
    simp only [openWaitAnchors, List.append_assoc] at fresh anchors ⊢
    simp only [left, right, compensation, id, List.append_assoc] at anchorPermutation
    apply anchorPermutation.nodup_iff.mpr
    exact List.nodup_cons.mpr ⟨fresh, of_decide_eq_true anchors⟩
  · apply decide_eq_true
    exact localPermutation.nodup_iff.mpr (List.nodup_cons.mpr ⟨frameFresh, of_decide_eq_true uniqueFrames⟩)
  · apply List.all_eq_true.mpr
    intro occurrence member
    have aligned : occurrence ∈ (canonicalInsertBy effectWaitBefore wait before.effectWaits).map effectWaitOccurrence ++ right := by
      simpa only [right, compensation, List.append_assoc, insertEffectWait] using member
    rcases List.mem_cons.mp (effectPermutation.mem_iff.mp aligned) with equal | old
    · subst occurrence
      simp only [Bool.and_eq_true, decide_eq_true_eq]
      simp only [effectWaitOccurrence]
      exact ⟨⟨positive, safe⟩, bounded⟩
    · have retainedBound := List.all_eq_true.mp effects occurrence
      apply retainedBound
      dsimp only [right, compensation] at old
      simpa only [List.append_eq, List.append_assoc] using old
  · rw [all_insertActivityVariableScope]
    apply Bool.and_eq_true_iff.mpr
    refine ⟨?_, frames⟩
    simp only [Bool.and_eq_true, decide_eq_true_eq]
    exact ⟨⟨positive, safe⟩, bounded⟩

/-- Reservation issuance depends on anchors and counters, so token rewrites leave it unchanged. -/
theorem occurrenceReservationStateValid_tokens (before : RuntimeState) (tokens : List ControlToken) :
    occurrenceReservationStateValid { before with tokens } = occurrenceReservationStateValid before := rfl

/-- Effect preparation availability excludes the exact local owner required by reservation insertion. -/
theorem effect_write_available_owner_fresh (before : RuntimeState) (wait : EffectWait)
    (bindings : List VariableBinding)
    (available : (InternalArmingWrite.effect wait bindings).available before = true) :
    LocalDataOwner.effectOccurrence (effectWaitOccurrence wait) ∉ before.variables.activities.map (·.owner) := by
  intro member
  obtain ⟨frame, present, owner⟩ := List.mem_map.mp member
  have matching : activityScopeMatches (effectWaitOccurrence wait) frame = true := by
    simp only [activityScopeMatches, localDataOwnerMatches, owner, decide_true]
  have occupied := List.any_eq_true.mpr ⟨frame, present, matching⟩
  simp only [InternalArmingWrite.available, occupied, Bool.not_true, Bool.false_eq_true] at available

/-- Human and Effect arming retain the complete reservation invariant under monotone issuance and full-anchor freshness. -/
theorem applyInternalArmingPatch_reservation_valid (before : RuntimeState) (arm : InternalArmingPatch)
    (valid : occurrenceReservationStateValid before = true)
    (nonempty : arm.write.elementId.value.isEmpty = false)
    (positive : 0 < arm.write.occurrence.activation)
    (safe : SemanticProcessJson.isSafeWireNat arm.write.occurrence.activation = true)
    (monotone : match arm.write with
      | .userTask wait => activationCount before wait.task.id ≤ wait.activation
      | .effect wait _ => effectActivationCount before wait.elementId ≤ wait.activation
      | _ => False)
    (fresh : arm.write.occurrence ∉ openWaitAnchors before ++
      before.compensationHandlerEffectWaits.map (fun retained =>
        (⟨retained.id.processInstanceId, retained.id.elementId, retained.id.activation⟩ : OccurrenceId)))
    (available : arm.write.available before = true) :
    occurrenceReservationStateValid (applyInternalArmingPatch before arm) = true := by
  cases write : arm.write with
  | userTask wait =>
      simp only [write, InternalArmingWrite.elementId, InternalArmingWrite.occurrence,
        userTaskWaitOccurrence] at nonempty positive safe monotone fresh
      let issued := { before with activations := setActivationCount before.activations wait.task.id wait.activation }
      have issuedValid := occurrenceReservationStateValid_setActivationCount before wait.task.id
        wait.activation valid nonempty safe monotone
      have issuedBound : wait.activation ≤ activationCount issued wait.task.id := by
        rw [activationCount_setActivationCount_self]; exact Nat.le_refl _
      have inserted := occurrenceReservationStateValid_insertUserTaskWait issued wait issuedValid
        positive safe issuedBound fresh
      have stateEq : applyInternalArmingPatch before arm =
          { { issued with waits := insertUserTaskWait wait issued.waits } with
            tokens := removeToken before.tokens arm.input arm.owner } := by
        simp only [applyInternalArmingPatch, write]
        rfl
      rw [stateEq, occurrenceReservationStateValid_tokens]
      exact inserted
  | effect wait bindings =>
      have frameFresh := effect_write_available_owner_fresh before wait bindings (by simpa only [write] using available)
      simp only [write, InternalArmingWrite.elementId, InternalArmingWrite.occurrence,
        effectWaitOccurrence] at nonempty positive safe monotone fresh
      let issued := { before with effectActivations := setEffectActivationCount before.effectActivations wait.elementId wait.activation }
      have issuedValid := occurrenceReservationStateValid_setEffectActivationCount before wait.elementId
        wait.activation valid nonempty safe monotone
      have issuedBound : wait.activation ≤ effectActivationCount issued wait.elementId := by
        rw [effectActivationCount_set_self]; exact Nat.le_refl _
      have inserted := occurrenceReservationStateValid_insertEffectWait issued wait bindings issuedValid
        positive safe issuedBound fresh frameFresh
      have stateEq : applyInternalArmingPatch before arm =
          { { issued with
            effectWaits := insertEffectWait wait issued.effectWaits,
            variables := { issued.variables with
              activities := insertActivityVariableScope
                ⟨.effectOccurrence (effectWaitOccurrence wait), bindings⟩ issued.variables.activities } } with
            tokens := removeToken before.tokens arm.input arm.owner } := by
        simp only [applyInternalArmingPatch, write]
        rfl
      rw [stateEq, occurrenceReservationStateValid_tokens]
      exact inserted
  | message wait => simp only [write] at monotone
  | timer wait => simp only [write] at monotone

/-- Restricting retained waits and local frames preserves reservation validity independently of tokens, control and other data. -/
theorem occurrenceReservationStateValid_restrict (before after : RuntimeState)
    (valid : occurrenceReservationStateValid before = true)
    (humanCounters : after.activations = before.activations)
    (effectCounters : after.effectActivations = before.effectActivations)
    (humans : after.waits.Sublist before.waits)
    (messages : after.messageWaits.Sublist before.messageWaits)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (effects : after.effectWaits.Sublist before.effectWaits)
    (incidents : after.effectIncidents.Sublist before.effectIncidents)
    (compensation : after.compensationHandlerEffectWaits.Sublist before.compensationHandlerEffectWaits)
    (locals : after.variables.activities.Sublist before.variables.activities) :
    occurrenceReservationStateValid after = true := by
  have compensationSublist := compensation.map (fun wait =>
    (⟨wait.id.processInstanceId, wait.id.elementId, wait.id.activation⟩ : OccurrenceId))
  have effectSublist := ((effects.map effectWaitOccurrence).append
    (incidents.map (fun incident => effectWaitOccurrence incident.wait))).append compensationSublist
  have anchorSublist := (((((humans.map userTaskWaitOccurrence).append
    (messages.map messageWaitOccurrence)).append (timers.map timerWaitOccurrence)).append
    (effects.map effectWaitOccurrence)).append
    (incidents.map (fun incident => effectWaitOccurrence incident.wait))).append compensationSublist
  have humanCounts (task : TaskDefinitionId) : activationCount after task = activationCount before task := by
    simp only [activationCount, humanCounters]
  have effectCounts (element : NodeId) : effectActivationCount after element = effectActivationCount before element := by
    simp only [effectActivationCount, effectCounters]
  simp only [occurrenceReservationStateValid, Bool.and_eq_true, decide_eq_true_eq,
    List.all_eq_true] at valid ⊢
  rcases valid with ⟨⟨⟨⟨⟨⟨humanRows, effectRows⟩, anchors⟩, frameOwners⟩, humanBounds⟩, effectBounds⟩, frameBounds⟩
  refine ⟨⟨⟨⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩
  · simpa only [humanCounters] using humanRows
  · simpa only [effectCounters] using effectRows
  · exact anchorSublist.nodup anchors
  · exact (locals.map (·.owner)).nodup frameOwners
  · intro wait member
    simpa only [humanCounts] using humanBounds wait (humans.subset member)
  · intro occurrence member
    simpa only [effectCounts] using effectBounds occurrence (effectSublist.subset member)
  · intro frame member
    have bounded := frameBounds frame (locals.subset member)
    cases owner : frame.owner with
    | activityOccurrence id => trivial
    | effectOccurrence id => simpa only [owner, effectCounts] using bounded

end BpmnSemantics.SemanticProcess.InternalCommutation
