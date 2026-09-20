import BpmnSemantics.SemanticProcess.InternalRegionalControllerValidity

/-! SMI reverse binding under regional cancellation.

`sequentialMultiInstanceOperationBindingComplete` counts four populations. Its equalities survive
because forward binding and claim uniqueness establish a finite correspondence whose complete
tuples are withdrawn together, rather than because arbitrary filters preserve equal lengths.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Equal populations alone say nothing about independently filtered populations. -/
theorem equal_counts_do_not_frame_independent_filters {α β : Type} (left : α) (right : β) :
    [left].length = [right].length ∧
      ([left].filter fun _ => true).length ≠ ([right].filter fun _ => false).length := by
  simp

/-- Singleton rows, injective columns, and equal finite populations make a total correspondence.
Matching retention then preserves the populations without a successor count assumption. -/
theorem regional_correspondence_filter_length {α β : Type} (left : List α) (right : List β)
    (rel : α → β → Bool) (keepLeft : α → Bool) (keepRight : β → Bool)
    (rows : ∀ a ∈ left, (right.filter (rel a)).length = 1)
    (columns : ∀ b ∈ right, (left.filter (rel · b)).length ≤ 1)
    (counts : left.length = right.length)
    (retention : ∀ a ∈ left, ∀ b ∈ right, rel a b = true → keepLeft a = keepRight b) :
    (left.filter keepLeft).length = (right.filter keepRight).length := by
  induction left generalizing right with
  | nil =>
    have empty : right = [] := List.length_eq_zero_iff.mp counts.symm
    simp [empty]
  | cons a rest ih =>
    obtain ⟨b, singleton⟩ := List.length_eq_one_iff.mp (rows a (by simp))
    have selected : b ∈ right.filter (rel a) := by rw [singleton]; simp
    obtain ⟨member, linked⟩ := List.mem_filter.mp selected
    obtain ⟨leading, suffix, rfl⟩ := List.mem_iff_append.mp member
    have remainingSubset : ∀ value ∈ leading ++ suffix, value ∈ leading ++ b :: suffix := by
      intro value present
      rcases List.mem_append.mp present with first | last
      · exact List.mem_append_left _ first
      · exact List.mem_append_right _ (List.mem_cons_of_mem _ last)
    have noOther : ∀ value ∈ rest, rel value b = false := by
      intro value present
      have bound := columns b (by simp)
      simp only [List.filter_cons, linked, ↓reduceIte, List.length_cons] at bound
      have empty : rest.filter (rel · b) = [] := List.length_eq_zero_iff.mp (by omega)
      exact Bool.eq_false_iff.mpr (List.filter_eq_nil_iff.mp empty value present)
    have tailRows : ∀ value ∈ rest,
        ((leading ++ suffix).filter (rel value)).length = 1 := by
      intro value present
      have prior := rows value (by simp [present])
      simpa [List.filter_append, noOther value present] using prior
    have tailColumns : ∀ value ∈ leading ++ suffix,
        (rest.filter (rel · value)).length ≤ 1 := by
      intro value present
      exact Nat.le_trans ((List.sublist_cons_self a rest).filter _).length_le
        (columns value (remainingSubset value present))
    have tailCounts : rest.length = (leading ++ suffix).length := by
      simp only [List.length_cons, List.length_append] at counts ⊢
      omega
    have equal := ih (leading ++ suffix) tailRows tailColumns tailCounts
      (fun value present target targetMem matchProof =>
        retention value (by simp [present]) target (remainingSubset target targetMem) matchProof)
    have agreement := retention a (by simp) b (by simp) linked
    simp only [List.filter_append, List.length_append] at equal
    cases kept : keepRight b <;> simp [List.filter_append, agreement, kept] <;> omega

structure SequentialBindingTuple (program : Program) (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (operationId : OperationId)
    (taskDefinition : SequentialMultiInstanceTaskDefinition) (boundary : BoundaryTimerArm) where
  record : ActivityOccurrence
  body : OccurrenceId
  task : UserTaskWait
  timerId : OccurrenceId
  timer : TimerWait
  recordCensus : state.activityOccurrences.filter
    (controllerNamesActivityOccurrence controller) = [record]
  ownerScope : operationOwningScope? program operationId = some record.owner.definitionScopeId
  ownerProcess : record.owner.processInstanceId = record.processInstanceId
  bodyShape : record.body = .userTask body
  taskCensus : state.waits.filter (taskIdNamesWait body) = [task]
  taskOwner : task.owner = record.owner
  taskDefinitionMatches : task.task.id = taskDefinition.id
  timerHandlers : record.timerHandlerOccurrences = [timerId]
  timerCensus : state.timerWaits.filter (timerIdNamesWait timerId) = [timer]
  timerOwner : timer.owner = record.owner
  timerElement : timerId.elementId.value = boundary.elementId.value

private theorem sequential_binding_tuple (program : Program) (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (task : SequentialMultiInstanceTaskDefinition) (data : SequentialMultiInstanceDataDefinition)
    (output : ControlPlaceId) (boundary : BoundaryTimerArm) (limits : SequentialMultiInstanceLimits)
    (operationMem : .awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits
      ∈ program.operations)
    (element : controller.activityElementId.value = task.id.value)
    (valid : sequentialMultiInstanceControllerProgramBindingValid program state controller = true) :
    Nonempty (SequentialBindingTuple program state controller id task boundary) := by
  unfold sequentialMultiInstanceControllerProgramBindingValid at valid
  generalize selected : state.activityOccurrences.filter
    (controllerNamesActivityOccurrence controller) = records at valid
  cases records with
  | nil => simp at valid
  | cons record rest =>
    cases rest with
    | cons next tail => simp at valid
    | nil =>
      simp only at valid
      split at valid
      · rename_i actualId actualOrigin actualInput actualTask actualData actualOutput
          actualBoundary actualLimits operations
        have operationSelected :
            SemanticOperation.awaitSequentialMultiInstanceUserTask id origin input task data
              output boundary limits ∈ [.awaitSequentialMultiInstanceUserTask actualId actualOrigin
                actualInput actualTask actualData actualOutput actualBoundary actualLimits] := by
          rw [← operations]
          exact List.mem_filter.mpr ⟨operationMem, by simp [element]⟩
        simp only [List.mem_singleton, SemanticOperation.awaitSequentialMultiInstanceUserTask.injEq]
          at operationSelected
        obtain ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ := operationSelected
        cases bodySelected : activityBodyTask? record with
        | none => simp [bodySelected] at valid
        | some body =>
          simp only [bodySelected] at valid
          generalize taskSelected : state.waits.filter (taskIdNamesWait body) = tasks at valid
          cases tasks with
          | nil => simp at valid
          | cons wait rest =>
            cases rest with
            | cons next tail => simp at valid
            | nil =>
              cases handlers : record.timerHandlerOccurrences with
              | nil => simp [handlers] at valid
              | cons timerId rest =>
                cases rest with
                | cons next tail => simp [handlers] at valid
                | nil =>
                  simp only [handlers] at valid
                  generalize timerSelected : state.timerWaits.filter
                    (timerIdNamesWait timerId) = timers at valid
                  cases timers with
                  | nil => simp at valid
                  | cons timer rest =>
                    cases rest with
                    | cons next tail => simp at valid
                    | nil =>
                      simp only [Bool.and_eq_true, beq_iff_eq] at valid
                      have shape : record.body = .userTask body := by
                        cases shape : record.body <;> simp_all [activityBodyTask?]
                      exact ⟨{
                        record := record, body := body, task := wait, timerId := timerId,
                        timer := timer, recordCensus := selected, ownerScope := valid.1.1,
                        ownerProcess := valid.1.2, bodyShape := shape, taskCensus := taskSelected,
                        taskOwner := valid.2.2.1.1.1.1.1.1.1,
                        taskDefinitionMatches := valid.2.2.1.1.1.1.1.1.2,
                        timerHandlers := handlers, timerCensus := timerSelected,
                        timerOwner := valid.2.2.2.1, timerElement := valid.2.2.1.2 }⟩
      · contradiction

private theorem controller_column_bound (state : RuntimeState)
    (controllers : List SequentialMultiInstanceController)
    (sublist : controllers.Sublist state.sequentialMultiInstanceControllers)
    (rel : SequentialMultiInstanceController → Bool)
    (unique : controllerIdentitiesUnique state = true)
    (same : ∀ left ∈ controllers, ∀ right ∈ controllers,
      rel left = true → rel right = true → sameSequentialMultiInstanceController left right = true) :
    (controllers.filter rel).length ≤ 1 := by
  by_cases present : ∃ controller ∈ controllers, rel controller = true
  · obtain ⟨controller, member, holds⟩ := present
    have once := List.all_eq_true.mp unique controller (sublist.subset member)
    simp only [occursOnce, decide_eq_true_eq] at once
    have bound : (controllers.filter rel).length ≤
        (controllers.filter (sameSequentialMultiInstanceController controller)).length := by
      simp only [← List.countP_eq_length_filter]
      apply List.countP_mono_left
      intro other otherMember related
      exact same controller member other otherMember holds related
    exact Nat.le_trans bound (once ▸ (sublist.filter _).length_le)
  · have empty : controllers.filter rel = [] := List.filter_eq_nil_iff.mpr (by
      intro controller member holds
      exact present ⟨controller, member, holds⟩)
    simp [empty]

private theorem controllers_naming_same_record (left right : SequentialMultiInstanceController)
    (record : ActivityOccurrence) (first : controllerNamesActivityOccurrence left record = true)
    (second : controllerNamesActivityOccurrence right record = true) :
    sameSequentialMultiInstanceController left right = true := by
  simp only [controllerNamesActivityOccurrence, sameSequentialMultiInstanceController,
    Bool.and_eq_true, beq_iff_eq] at *
  exact ⟨⟨first.1.1.trans second.1.1.symm, first.1.2.trans second.1.2.symm⟩,
    first.2.trans second.2.symm⟩

private theorem selected_census {α : Type} (values : List α) (names selected : α → Bool)
    (value : α) (census : values.filter names = [value]) (included : selected value = true) :
    (values.filter selected).filter names = [value] := by
  have commute : (values.filter selected).filter names = (values.filter names).filter selected := by
    simp only [List.filter_filter, Bool.and_comm]
  rw [commute, census]
  simp [included]

private theorem singleton_census_any {α : Type} (values : List α) (names test : α → Bool)
    (value : α) (census : values.filter names = [value]) :
    values.any (fun candidate => names candidate && test candidate) = test value := by
  rw [← List.any_filter, census]
  simp

private theorem census_member {α : Type} {values : List α} {names : α → Bool}
    {value : α} (census : values.filter names = [value]) : value ∈ values ∧ names value = true := by
  apply List.mem_filter.mp
  rw [census]
  simp

private theorem tuple_retention (program : Program) (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (id : OperationId)
    (task : SequentialMultiInstanceTaskDefinition) (boundary : BoundaryTimerArm)
    (tuple : SequentialBindingTuple program state controller id task boundary)
    (root : ScopeOccurrenceId)
    (unambiguous : attachedTimersUnambiguous state = true) :
    let called := calledInstanceClosure state root
    let cancelled := fun owner : ScopeOccurrenceId =>
      occurrenceInSubtree state.scopeOccurrences root owner || called.contains owner.processInstanceId
    let withdrawn := withdrawnByRegion cancelled state.activityOccurrences
    (!called.contains controller.processInstanceId &&
      !withdrawn.any (controllerNamesActivityOccurrence controller)) =
        (!recordInRegion cancelled tuple.record) ∧
    (!recordInRegion cancelled tuple.record) = (!cancelled tuple.task.owner) ∧
    (!recordInRegion cancelled tuple.record) =
      (!cancelled tuple.timer.owner && !anyTimerIdNamesWait (attachedTimersOf withdrawn) tuple.timer) := by
  dsimp only
  let cancelled := fun owner : ScopeOccurrenceId =>
    occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId
  obtain ⟨recordMem, recordNames⟩ := census_member tuple.recordCensus
  obtain ⟨timerMem, timerNames⟩ := census_member tuple.timerCensus
  have process : controller.processInstanceId = tuple.record.owner.processInstanceId := by
    simp only [controllerNamesActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at recordNames
    exact recordNames.1.1.trans tuple.ownerProcess.symm
  have recordMask : recordInRegion cancelled tuple.record = cancelled tuple.record.owner := by
    simp [recordInRegion, tuple.bodyShape]
  have withdrawnMatch : (withdrawnByRegion cancelled state.activityOccurrences).any
      (controllerNamesActivityOccurrence controller) = cancelled tuple.record.owner := by
    rw [withdrawnByRegion, List.any_filter]
    have commutes : (fun candidate => recordInRegion cancelled candidate &&
        controllerNamesActivityOccurrence controller candidate) =
        (fun candidate => controllerNamesActivityOccurrence controller candidate &&
          recordInRegion cancelled candidate) := by funext candidate; exact Bool.and_comm _ _
    rw [commutes, singleton_census_any _ _ _ _ tuple.recordCensus, recordMask]
  change _ = (!recordInRegion cancelled tuple.record) ∧
    (!recordInRegion cancelled tuple.record) = (!cancelled tuple.task.owner) ∧
    (!recordInRegion cancelled tuple.record) = _
  rw [withdrawnMatch, recordMask, tuple.taskOwner, tuple.timerOwner]
  refine ⟨?_, rfl, ?_⟩
  · rw [process]
    simp only [cancelled]
    cases occurrenceInSubtree state.scopeOccurrences root tuple.record.owner <;>
      cases (calledInstanceClosure state root).contains tuple.record.owner.processInstanceId <;> rfl
  · change (!cancelled tuple.record.owner) =
      (!cancelled tuple.record.owner && !anyTimerIdNamesWait
        (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences)) tuple.timer)
    cases outside : cancelled tuple.record.owner with
    | true => simp
    | false =>
      have noClaim : anyTimerIdNamesWait
          (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences)) tuple.timer = false := by
        apply Bool.eq_false_iff.mpr
        intro claim
        obtain ⟨timerId, attached, named⟩ := List.any_eq_true.mp claim
        obtain ⟨other, otherMem, otherAttached⟩ := List.mem_flatMap.mp attached
        obtain ⟨prior, removed⟩ := List.mem_filter.mp otherMem
        have ownNames : anyTimerIdNamesWait tuple.record.timerHandlerOccurrences tuple.timer = true := by
          simp [anyTimerIdNamesWait, tuple.timerHandlers, timerNames]
        have otherNames : anyTimerIdNamesWait other.timerHandlerOccurrences tuple.timer = true :=
          List.any_eq_true.mpr ⟨timerId, otherAttached, named⟩
        have first := activityOccurrenceForTimerWait_unique state tuple.timer tuple.record
          unambiguous timerMem recordMem ownNames
        have second := activityOccurrenceForTimerWait_unique state tuple.timer other
          unambiguous timerMem prior otherNames
        have same := Option.some.inj (first.symm.trans second)
        rw [← same, recordMask, outside] at removed
        contradiction
      simp [noClaim]

private def controllerTaskRelated (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (wait : UserTaskWait) : Bool :=
  state.activityOccurrences.any fun record =>
    controllerNamesActivityOccurrence controller record && recordBodyNamesWait wait record

private def controllerTimerRelated (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (wait : TimerWait) : Bool :=
  state.activityOccurrences.any fun record =>
    controllerNamesActivityOccurrence controller record &&
      anyTimerIdNamesWait record.timerHandlerOccurrences wait

private theorem tuple_task_relation (program : Program) (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (id : OperationId)
    (task : SequentialMultiInstanceTaskDefinition) (boundary : BoundaryTimerArm)
    (tuple : SequentialBindingTuple program state controller id task boundary) (wait : UserTaskWait) :
    controllerTaskRelated state controller wait = taskIdNamesWait tuple.body wait := by
  rw [controllerTaskRelated, singleton_census_any _ _ _ _ tuple.recordCensus]
  simp [recordBodyNamesWait, activityBodyTask?, tuple.bodyShape]

private theorem tuple_timer_relation (program : Program) (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (id : OperationId)
    (task : SequentialMultiInstanceTaskDefinition) (boundary : BoundaryTimerArm)
    (tuple : SequentialBindingTuple program state controller id task boundary) (wait : TimerWait) :
    controllerTimerRelated state controller wait = timerIdNamesWait tuple.timerId wait := by
  rw [controllerTimerRelated, singleton_census_any _ _ _ _ tuple.recordCensus]
  simp [anyTimerIdNamesWait, tuple.timerHandlers]

private theorem task_column_bound (state : RuntimeState)
    (controllers : List SequentialMultiInstanceController)
    (sublist : controllers.Sublist state.sequentialMultiInstanceControllers) (wait : UserTaskWait)
    (unique : controllerIdentitiesUnique state = true)
    (claims : activityBodyClaimsUnique state.activityOccurrences = true) :
    (controllers.filter (controllerTaskRelated state · wait)).length ≤ 1 := by
  apply controller_column_bound state controllers sublist _ unique
  intro left _ right _ leftRelated rightRelated
  obtain ⟨first, firstMem, firstRelated⟩ := List.any_eq_true.mp leftRelated
  obtain ⟨second, secondMem, secondRelated⟩ := List.any_eq_true.mp rightRelated
  simp only [Bool.and_eq_true] at firstRelated secondRelated
  obtain ⟨firstNames, firstBody⟩ := firstRelated
  obtain ⟨secondNames, secondBody⟩ := secondRelated
  have supplies (record : ActivityOccurrence) (names : recordBodyNamesWait wait record = true) :
      ∃ task, activityBodyTask? record = some task ∧ taskIdNamesWait task wait = true := by
    cases selected : activityBodyTask? record with
    | none => simp [recordBodyNamesWait, selected] at names
    | some task => exact ⟨task, rfl, by simpa [recordBodyNamesWait, selected] using names⟩
  have firstSelection := activityOccurrenceForTaskWait_unique state.activityOccurrences wait first
    claims firstMem (supplies first firstBody)
  have secondSelection := activityOccurrenceForTaskWait_unique state.activityOccurrences wait second
    claims secondMem (supplies second secondBody)
  have same := Option.some.inj (firstSelection.symm.trans secondSelection)
  subst second
  exact controllers_naming_same_record left right first firstNames secondNames

private theorem timer_column_bound (state : RuntimeState)
    (controllers : List SequentialMultiInstanceController)
    (sublist : controllers.Sublist state.sequentialMultiInstanceControllers) (wait : TimerWait)
    (waitMem : wait ∈ state.timerWaits) (unique : controllerIdentitiesUnique state = true)
    (claims : attachedTimersUnambiguous state = true) :
    (controllers.filter (controllerTimerRelated state · wait)).length ≤ 1 := by
  apply controller_column_bound state controllers sublist _ unique
  intro left _ right _ leftRelated rightRelated
  obtain ⟨first, firstMem, firstRelated⟩ := List.any_eq_true.mp leftRelated
  obtain ⟨second, secondMem, secondRelated⟩ := List.any_eq_true.mp rightRelated
  simp only [Bool.and_eq_true] at firstRelated secondRelated
  obtain ⟨firstNames, firstBody⟩ := firstRelated
  obtain ⟨secondNames, secondBody⟩ := secondRelated
  have firstSelection := activityOccurrenceForTimerWait_unique state wait first
    claims waitMem firstMem firstBody
  have secondSelection := activityOccurrenceForTimerWait_unique state wait second
    claims waitMem secondMem secondBody
  have same := Option.some.inj (firstSelection.symm.trans secondSelection)
  subst second
  exact controllers_naming_same_record left right first firstNames secondNames

private theorem tuple_population_censuses (program : Program) (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (id : OperationId)
    (task : SequentialMultiInstanceTaskDefinition) (boundary : BoundaryTimerArm)
    (tuple : SequentialBindingTuple program state controller id task boundary)
    (scope : DefinitionScopeId) (owningScope : operationOwningScope? program id = some scope)
    (element : controller.activityElementId.value = task.id.value) :
    ((state.activityOccurrences.filter fun record =>
      decide (record.activityElementId.value = task.id.value)).filter
      (controllerNamesActivityOccurrence controller) = [tuple.record]) ∧
    (((state.waits.filter fun wait => decide (wait.task.id = task.id)).filter
      (fun wait => decide (wait.owner.definitionScopeId = scope))).filter
      (controllerTaskRelated state controller) = [tuple.task]) ∧
    (((state.timerWaits.filter fun wait => decide (wait.elementId.value = boundary.elementId.value)).filter
      (fun wait => decide (wait.owner.definitionScopeId = scope))).filter
      (controllerTimerRelated state controller) = [tuple.timer]) := by
  have recordNames := (census_member tuple.recordCensus).2
  simp only [controllerNamesActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at recordNames
  have recordElement : tuple.record.activityElementId.value = task.id.value := by
    rw [← recordNames.1.2]
    exact element
  have scopeEqual : tuple.record.owner.definitionScopeId = scope :=
    Option.some.inj (tuple.ownerScope.symm.trans owningScope)
  have timerNames := (census_member tuple.timerCensus).2
  simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at timerNames
  have timerElement : tuple.timer.elementId.value = boundary.elementId.value :=
    timerNames.1.2.symm.trans tuple.timerElement
  refine ⟨selected_census _ _ _ _ tuple.recordCensus (by simp [recordElement]), ?_, ?_⟩
  · have relation : controllerTaskRelated state controller = taskIdNamesWait tuple.body :=
      funext (tuple_task_relation program state controller id task boundary tuple)
    rw [relation]
    apply selected_census
    · exact selected_census _ _ _ _ tuple.taskCensus (by simp [tuple.taskDefinitionMatches])
    · simp [tuple.taskOwner, scopeEqual]
  · have relation : controllerTimerRelated state controller = timerIdNamesWait tuple.timerId :=
      funext (tuple_timer_relation program state controller id task boundary tuple)
    rw [relation]
    apply selected_census
    · exact selected_census _ _ _ _ tuple.timerCensus (by simp [timerElement])
    · simp [tuple.timerOwner, scopeEqual]

private theorem filters_commute {α : Type} (values : List α) (left right : α → Bool) :
    (values.filter left).filter right = (values.filter right).filter left := by
  simp only [List.filter_filter, Bool.and_comm]

private theorem three_filters_commute {α : Type} (values : List α) (keep first second : α → Bool) :
    ((values.filter keep).filter first).filter second =
      ((values.filter first).filter second).filter keep := by
  rw [filters_commute values keep first, filters_commute (values.filter first) keep second]

private theorem scoped_binding_counts_retained (program : Program) (state after : RuntimeState)
    (keepController : SequentialMultiInstanceController → Bool)
    (keepRecord : ActivityOccurrence → Bool) (keepTask : UserTaskWait → Bool)
    (keepTimer : TimerWait → Bool)
    (controllerField : after.sequentialMultiInstanceControllers =
      state.sequentialMultiInstanceControllers.filter keepController)
    (recordField : after.activityOccurrences = state.activityOccurrences.filter keepRecord)
    (taskField : after.waits = state.waits.filter keepTask)
    (timerField : after.timerWaits = state.timerWaits.filter keepTimer)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (task : SequentialMultiInstanceTaskDefinition) (data : SequentialMultiInstanceDataDefinition)
    (output : ControlPlaceId) (boundary : BoundaryTimerArm) (limits : SequentialMultiInstanceLimits)
    (scope : DefinitionScopeId) (owningScope : operationOwningScope? program id = some scope)
    (operationMem : .awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits
      ∈ program.operations)
    (bindings : sequentialMultiInstanceControllerProgramBindingsValid program state = true)
    (complete : sequentialMultiInstanceOperationBindingComplete program state
      (.awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits) = true)
    (unique : controllerIdentitiesUnique state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (timerClaims : attachedTimersUnambiguous state = true)
    (retention : ∀ controller (tuple : SequentialBindingTuple program state controller id task boundary),
      keepController controller = keepRecord tuple.record ∧
      keepRecord tuple.record = keepTask tuple.task ∧
      keepRecord tuple.record = keepTimer tuple.timer) :
    sequentialMultiInstanceOperationBindingComplete program after
      (.awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits) = true := by
  let controllers := state.sequentialMultiInstanceControllers.filter fun controller =>
    decide (controller.activityElementId.value = task.id.value)
  let records := state.activityOccurrences.filter fun record =>
    decide (record.activityElementId.value = task.id.value)
  let waits := (state.waits.filter fun wait => decide (wait.task.id = task.id)).filter fun wait =>
    decide (wait.owner.definitionScopeId = scope)
  let timers := (state.timerWaits.filter fun wait =>
    decide (wait.elementId.value = boundary.elementId.value)).filter fun wait =>
      decide (wait.owner.definitionScopeId = scope)
  have counts : records.length = controllers.length ∧ records.length = waits.length ∧
      records.length = timers.length := by
    simpa only [sequentialMultiInstanceOperationBindingComplete, owningScope,
      Bool.and_eq_true, beq_iff_eq, and_assoc] using complete
  have tuples (controller : SequentialMultiInstanceController) (member : controller ∈ controllers) :
      Nonempty (SequentialBindingTuple program state controller id task boundary) :=
    sequential_binding_tuple program state controller id origin input task data output boundary limits
      operationMem (of_decide_eq_true (List.mem_filter.mp member).2)
      (List.all_eq_true.mp bindings controller (List.mem_filter.mp member).1)
  have censuses (controller : SequentialMultiInstanceController) (member : controller ∈ controllers)
      (tuple : SequentialBindingTuple program state controller id task boundary) :
      records.filter (controllerNamesActivityOccurrence controller) = [tuple.record] ∧
      waits.filter (controllerTaskRelated state controller) = [tuple.task] ∧
      timers.filter (controllerTimerRelated state controller) = [tuple.timer] :=
    tuple_population_censuses program state controller id task boundary tuple scope owningScope
      (of_decide_eq_true (List.mem_filter.mp member).2)
  have recordCounts : (controllers.filter keepController).length =
      (records.filter keepRecord).length := by
    apply regional_correspondence_filter_length controllers records
      controllerNamesActivityOccurrence keepController keepRecord
    · intro controller member
      obtain ⟨tuple⟩ := tuples controller member
      rw [(censuses controller member tuple).1]
      rfl
    · intro record _
      apply controller_column_bound state controllers List.filter_sublist _ unique
      intro left _ right _ first second
      exact controllers_naming_same_record left right record first second
    · exact counts.1.symm
    · intro controller member record recordMem related
      obtain ⟨tuple⟩ := tuples controller member
      have selected : record = tuple.record := by
        have present := List.mem_filter.mpr ⟨recordMem, related⟩
        simpa only [(censuses controller member tuple).1, List.mem_singleton] using present
      subst record
      exact (retention controller tuple).1
  have taskCounts : (controllers.filter keepController).length = (waits.filter keepTask).length := by
    apply regional_correspondence_filter_length controllers waits
      (controllerTaskRelated state) keepController keepTask
    · intro controller member
      obtain ⟨tuple⟩ := tuples controller member
      rw [(censuses controller member tuple).2.1]
      rfl
    · intro wait _
      exact task_column_bound state controllers List.filter_sublist wait unique bodyClaims
    · exact counts.1.symm.trans counts.2.1
    · intro controller member wait waitMem related
      obtain ⟨tuple⟩ := tuples controller member
      have selected : wait = tuple.task := by
        have present := List.mem_filter.mpr ⟨waitMem, related⟩
        simpa only [(censuses controller member tuple).2.1, List.mem_singleton] using present
      subst wait
      have kept := retention controller tuple
      exact kept.1.trans kept.2.1
  have timerCounts : (controllers.filter keepController).length =
      (timers.filter keepTimer).length := by
    apply regional_correspondence_filter_length controllers timers
      (controllerTimerRelated state) keepController keepTimer
    · intro controller member
      obtain ⟨tuple⟩ := tuples controller member
      rw [(censuses controller member tuple).2.2]
      rfl
    · intro wait member
      exact timer_column_bound state controllers List.filter_sublist wait
        (List.mem_filter.mp (List.mem_filter.mp member).1).1 unique timerClaims
    · exact counts.1.symm.trans counts.2.2
    · intro controller member wait waitMem related
      obtain ⟨tuple⟩ := tuples controller member
      have selected : wait = tuple.timer := by
        have present := List.mem_filter.mpr ⟨waitMem, related⟩
        simpa only [(censuses controller member tuple).2.2, List.mem_singleton] using present
      subst wait
      have kept := retention controller tuple
      exact kept.1.trans kept.2.2
  have finalCounts := And.intro recordCounts.symm
    (And.intro (recordCounts.symm.trans taskCounts) (recordCounts.symm.trans timerCounts))
  have recordPopulation : (after.activityOccurrences.filter
      (fun record => decide (record.activityElementId.value = task.id.value))) =
      records.filter keepRecord := by rw [recordField]; exact filters_commute _ _ _
  have controllerPopulation : (after.sequentialMultiInstanceControllers.filter
      (fun controller => decide (controller.activityElementId.value = task.id.value))) =
      controllers.filter keepController := by rw [controllerField]; exact filters_commute _ _ _
  have taskPopulation : ((after.waits.filter
      (fun wait => decide (wait.task.id = task.id))).filter
      (fun wait => decide (wait.owner.definitionScopeId = scope))) =
      waits.filter keepTask := by rw [taskField]; exact three_filters_commute _ _ _ _
  have timerPopulation : ((after.timerWaits.filter
      (fun wait => decide (wait.elementId.value = boundary.elementId.value))).filter
      (fun wait => decide (wait.owner.definitionScopeId = scope))) =
      timers.filter keepTimer := by rw [timerField]; exact three_filters_commute _ _ _ _
  simp only [sequentialMultiInstanceOperationBindingComplete, owningScope,
    Bool.and_eq_true, beq_iff_eq, and_assoc]
  rw [recordPopulation, controllerPopulation, taskPopulation, timerPopulation]
  exact finalCounts

private theorem selected_empty_after_filter {α : Type} (values : List α)
    (keep selected : α → Bool) (empty : (values.filter selected).isEmpty = true) :
    ((values.filter keep).filter selected).isEmpty = true := by
  rw [filters_commute, List.nil_of_isEmpty empty]
  rfl

/-- Complete tuple retention preserves reverse SMI binding for four actual collection filters.
The operation wrappers derive retention from their removal rules and predecessor bindings. -/
theorem sequential_operation_binding_after_filters (program : Program)
    (state after : RuntimeState)
    (keepController : SequentialMultiInstanceController → Bool)
    (keepRecord : ActivityOccurrence → Bool) (keepTask : UserTaskWait → Bool)
    (keepTimer : TimerWait → Bool)
    (controllerField : after.sequentialMultiInstanceControllers =
      state.sequentialMultiInstanceControllers.filter keepController)
    (recordField : after.activityOccurrences = state.activityOccurrences.filter keepRecord)
    (taskField : after.waits = state.waits.filter keepTask)
    (timerField : after.timerWaits = state.timerWaits.filter keepTimer)
    (retention : ∀ controller id task boundary
      (tuple : SequentialBindingTuple program state controller id task boundary),
      keepController controller = keepRecord tuple.record ∧
      keepRecord tuple.record = keepTask tuple.task ∧
      keepRecord tuple.record = keepTimer tuple.timer)
    (operation : SemanticOperation) (operationMem : operation ∈ program.operations)
    (bindings : sequentialMultiInstanceControllerProgramBindingsValid program state = true)
    (complete : sequentialMultiInstanceOperationBindingComplete program state operation = true)
    (unique : controllerIdentitiesUnique state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (timerClaims : attachedTimersUnambiguous state = true) :
    sequentialMultiInstanceOperationBindingComplete program
      after operation = true := by
  cases operation with
  | awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits =>
    cases owningScope : operationOwningScope? program id with
    | some scope =>
      exact scoped_binding_counts_retained program state after keepController keepRecord keepTask
        keepTimer controllerField recordField taskField timerField id origin input task data
        output boundary limits scope owningScope operationMem bindings complete unique bodyClaims
        timerClaims (fun controller tuple => retention controller id task boundary tuple)
    | none =>
      simp only [sequentialMultiInstanceOperationBindingComplete, owningScope,
        Bool.and_eq_true, and_assoc] at complete ⊢
      rw [recordField, controllerField, taskField, timerField]
      exact ⟨selected_empty_after_filter state.activityOccurrences _ _ complete.1,
        selected_empty_after_filter state.sequentialMultiInstanceControllers _ _ complete.2.1,
        selected_empty_after_filter state.waits _ _ complete.2.2.1,
        selected_empty_after_filter state.timerWaits _ _ complete.2.2.2⟩
  | _ => rfl

/-- The reverse SMI binding survives both actual cancellation dispositions. Identity and claim
uniqueness supply injectivity; the actual cancellation masks retain complete tuples together. -/
theorem cancelScopeSubtree_preserves_sequential_operation_binding (program : Program)
    (state : RuntimeState) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (operation : SemanticOperation) (operationMem : operation ∈ program.operations)
    (bindings : sequentialMultiInstanceControllerProgramBindingsValid program state = true)
    (complete : sequentialMultiInstanceOperationBindingComplete program state operation = true)
    (unique : controllerIdentitiesUnique state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (timerClaims : attachedTimersUnambiguous state = true) :
    sequentialMultiInstanceOperationBindingComplete program
      (cancelScopeSubtree state root disposition) operation = true := by
  apply sequential_operation_binding_after_filters program state
    (cancelScopeSubtree state root disposition) _ _ _ _ rfl rfl rfl rfl
    (fun controller id task boundary tuple =>
      tuple_retention program state controller id task boundary tuple root timerClaims)
    operation operationMem bindings complete unique bodyClaims timerClaims

/-- Both halves of the executable SMI program binding are preserved by regional cancellation;
no successor validity, successor selection, or equality of retained counts is assumed. -/
theorem cancelScopeSubtree_preserves_sequential_program_bindings (program : Program)
    (state : RuntimeState) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (bindings : sequentialMultiInstanceProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true)
    (unique : controllerIdentitiesUnique state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true) :
    sequentialMultiInstanceProgramBindingsValid program
      (cancelScopeSubtree state root disposition) = true := by
  simp only [sequentialMultiInstanceProgramBindingsValid, Bool.and_eq_true] at bindings ⊢
  refine ⟨cancelScopeSubtree_preserves_controller_program_bindings program state root disposition
    bindings.1 bodies timers messages, ?_⟩
  apply List.all_eq_true.mpr
  intro operation member
  exact cancelScopeSubtree_preserves_sequential_operation_binding program state root disposition
    operation member bindings.1 (List.all_eq_true.mp bindings.2 operation member) unique bodyClaims timers

end BpmnSemantics.SemanticProcess
