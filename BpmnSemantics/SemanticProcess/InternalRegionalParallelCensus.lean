import BpmnSemantics.SemanticProcess.InternalRegionalParallelBinding

/-! PMI reverse binding requires a finite partition of pending children rather than equal raw
population counts. These correspondence laws preserve multiplicity and assign completed slots
zero weight, as required by the existing Program-binding validator. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The reverse PMI census counts pending children, so a completed middle slot contributes zero. -/
theorem parallel_completed_slot_has_zero_census_weight
    (first middle last : OccurrenceId) (result : String) :
    (pendingParallelTaskIds [.pending first, .completed middle result, .pending last]).length = 2 ∧
      (pendingParallelTaskIds [.pending first, .completed middle result, .pending last]).length ≠
        ([.pending first, .completed middle result, .pending last] : List ParallelMultiInstanceSlot).length := by
  simp [pendingParallelTaskIds]

theorem regional_weighted_fold_eq_sum {α : Type} (values : List α) (weight : α → Nat)
    (initial : Nat) :
    values.foldl (fun count value => count + weight value) initial =
      initial + (values.map weight).sum := by
  induction values generalizing initial with
  | nil => simp
  | cons value rest ih => simp [ih, Nat.add_assoc]

private theorem filter_partition_length {α : Type} (values : List α) (select : α → Bool) :
    (values.filter select).length + (values.filter fun value => !select value).length = values.length := by
  induction values with
  | nil => rfl
  | cons value rest ih => cases selected : select value <;> simp [selected] <;> omega

/-- Exhaustive weighted rows and injective columns form a finite partition. Retention acts on
whole rows; equal predecessor totals alone would not justify the filtered census. -/
theorem regional_weighted_correspondence_filter_length {α β : Type}
    (left : List α) (right : List β) (weight : α → Nat)
    (rel : α → β → Bool) (keepLeft : α → Bool) (keepRight : β → Bool)
    (rows : ∀ a ∈ left, (right.filter (rel a)).length = weight a)
    (columns : ∀ b ∈ right, (left.filter (rel · b)).length ≤ 1)
    (counts : (left.map weight).sum = right.length)
    (retention : ∀ a ∈ left, ∀ b ∈ right, rel a b = true → keepLeft a = keepRight b) :
    ((left.filter keepLeft).map weight).sum = (right.filter keepRight).length := by
  induction left generalizing right with
  | nil =>
    have empty : right = [] := List.length_eq_zero_iff.mp (by simpa using counts.symm)
    simp [empty]
  | cons a rest ih =>
    let remaining := right.filter fun b => !rel a b
    have remainingSubset : remaining ⊆ right := List.filter_sublist.subset
    have exclusive (other : α) (member : other ∈ rest) (b : β) (present : b ∈ right)
        (related : rel other b = true) : rel a b = false := by
      have bound := columns b present
      have positive : 0 < (rest.filter (rel · b)).length :=
        List.length_pos_of_mem (List.mem_filter.mpr ⟨member, related⟩)
      cases first : rel a b with
      | false => rfl
      | true =>
        simp only [List.filter_cons, first, ↓reduceIte, List.length_cons] at bound
        omega
    have tailRows (other : α) (member : other ∈ rest) :
        (remaining.filter (rel other)).length = weight other := by
      have same : remaining.filter (rel other) = right.filter (rel other) := by
        rw [List.filter_filter]
        apply List.filter_congr
        intro b present
        cases related : rel other b with
        | false => simp
        | true => simp [exclusive other member b present related]
      rw [same]
      exact rows other (by simp [member])
    have tailColumns (b : β) (member : b ∈ remaining) :
        (rest.filter (rel · b)).length ≤ 1 :=
      Nat.le_trans ((List.sublist_cons_self a rest).filter _).length_le
        (columns b (remainingSubset member))
    have tailCounts : (rest.map weight).sum = remaining.length := by
      have partition := filter_partition_length right (rel a)
      have row := rows a (by simp)
      simp only [List.map_cons, List.sum_cons] at counts
      dsimp only [remaining]
      omega
    have restEqual := ih remaining tailRows tailColumns tailCounts
      (fun other member b present related =>
        retention other (by simp [member]) b (remainingSubset present) related)
    have selected : ((right.filter (rel a)).filter keepRight).length =
        if keepLeft a then weight a else 0 := by
      have same : (right.filter (rel a)).filter keepRight =
          (right.filter (rel a)).filter (fun _ => keepLeft a) := by
        apply List.filter_congr
        intro b member
        obtain ⟨present, related⟩ := List.mem_filter.mp member
        exact (retention a (by simp) b present related).symm
      rw [same]
      cases keepLeft a <;> simp [rows a (by simp)]
    have partition := filter_partition_length (right.filter keepRight) (rel a)
    have commute (select : β → Bool) :
        (right.filter keepRight).filter select = (right.filter select).filter keepRight := by
      simp only [List.filter_filter, Bool.and_comm]
    rw [commute (rel a), commute (fun b => !rel a b), selected] at partition
    change _ + (remaining.filter keepRight).length = _ at partition
    cases kept : keepLeft a <;> simp [kept] at partition ⊢ <;> omega

def regionalParallelNamesRecord (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) : Bool :=
  parallelControllerNamesIdentity controller record.processInstanceId
    ⟨record.activityElementId.value⟩ record.activation

def regionalParallelNamesTask (controller : ParallelMultiInstanceController)
    (wait : UserTaskWait) : Bool :=
  (pendingParallelTaskIds controller.slots).contains
    (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId)

def regionalParallelNamesTimer (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (wait : TimerWait) : Bool :=
  state.activityOccurrences.any fun record => regionalParallelNamesRecord controller record &&
    anyTimerIdNamesWait record.timerHandlerOccurrences wait

structure RegionalParallelBindingTuple (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (entry : SemanticOperation)
    (arm : ParallelMultiInstanceArm) where
  record : ActivityOccurrence
  timerId : OccurrenceId
  timer : TimerWait
  recordCensus : state.activityOccurrences.filter (regionalParallelNamesRecord controller) = [record]
  ownerScope : operationOwningScope? program entry.id = some record.owner.definitionScopeId
  body : activityBodyParallelTasks? record = some (pendingParallelTaskIds controller.slots)
  childLength : (state.waits.filter (regionalParallelNamesTask controller)).length =
    (pendingParallelTaskIds controller.slots).length
  children : ∀ wait ∈ state.waits, regionalParallelNamesTask controller wait = true →
    wait.owner = record.owner ∧ wait.task.id = arm.taskId
  timerHandlers : record.timerHandlerOccurrences = [timerId]
  timerCensus : state.timerWaits.filter (timerIdNamesWait timerId) = [timer]
  timerOwner : timer.owner = record.owner
  timerElement : timer.elementId = arm.boundaryTimer.elementId

theorem regional_parallel_binding_tuple (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (entry : SemanticOperation)
    (arm : ParallelMultiInstanceArm) (entryMem : entry ∈ program.operations)
    (projects : ParallelMultiInstanceArm.ofOperation? entry = some arm)
    (element : controller.id.activityElementId.value = arm.taskId.value)
    (facts : ParallelControllerProgramBindingFacts program state controller) :
    Nonempty (RegionalParallelBindingTuple program state controller entry arm) := by
  obtain ⟨actualEntry, actualArm, record, timerId, timer, childWaits, pendingTask, pendingWait,
    recordCensus, operationCensus, actualProjects, ownerScope, _family, body, childCensus,
    childLength, _childUnique, children, attached, timerCensus, timerOwner,
    timerElement, _timerOutput, _pendingMember, _pendingWaitMember, _pendingIdentity,
    _pendingOwner, _pendingTask⟩ := facts.witnesses
  have entrySelected : entry ∈ [actualEntry] := by
    rw [← operationCensus]
    exact List.mem_filter.mpr ⟨entryMem, by simp [projects, element]⟩
  have same := List.mem_singleton.mp entrySelected
  subst actualEntry
  have sameArm := Option.some.inj (actualProjects.symm.trans projects)
  subst actualArm
  refine ⟨{
    record := record, timerId := timerId, timer := timer,
    recordCensus := recordCensus, ownerScope := ownerScope, body := body,
    childLength := ?_, children := ?_, timerHandlers := attached, timerCensus := timerCensus,
    timerOwner := timerOwner, timerElement := timerElement }⟩
  · exact childCensus ▸ childLength
  · intro wait member named
    have present : wait ∈ childWaits := childCensus ▸ List.mem_filter.mpr ⟨member, named⟩
    have bound := List.all_eq_true.mp children wait present
    simp only [Bool.and_eq_true, beq_iff_eq] at bound
    exact ⟨bound.1.1.1.1, bound.1.1.1.2⟩

theorem regional_parallel_census_member {α : Type} {values : List α} {names : α → Bool}
    {value : α} (census : values.filter names = [value]) : value ∈ values ∧ names value = true := by
  apply List.mem_filter.mp
  rw [census]
  simp

theorem regional_parallel_same_record (left right : ParallelMultiInstanceController)
    (record : ActivityOccurrence) (first : regionalParallelNamesRecord left record = true)
    (second : regionalParallelNamesRecord right record = true) : left.id = right.id := by
  simp only [regionalParallelNamesRecord, parallelControllerNamesIdentity,
    Bool.and_eq_true, beq_iff_eq] at first second
  generalize leftIdentity : left.id = leftId at *
  generalize rightIdentity : right.id = rightId at *
  cases leftId with
  | mk lp le la =>
    cases rightId with
    | mk rp re ra =>
      cases le
      cases re
      simp_all

theorem regional_parallel_column_bound (state : RuntimeState)
    (controllers : List ParallelMultiInstanceController)
    (sublist : controllers.Sublist state.parallelMultiInstanceControllers)
    (rel : ParallelMultiInstanceController → Bool)
    (unique : ∀ controller ∈ state.parallelMultiInstanceControllers,
      (state.parallelMultiInstanceControllers.filter fun other => controller.id == other.id).length = 1)
    (same : ∀ left ∈ controllers, ∀ right ∈ controllers,
      rel left = true → rel right = true → left.id = right.id) :
    (controllers.filter rel).length ≤ 1 := by
  by_cases present : ∃ controller ∈ controllers, rel controller = true
  · obtain ⟨controller, member, holds⟩ := present
    have once := unique controller (sublist.subset member)
    have bound : (controllers.filter rel).length ≤
        (controllers.filter fun other => controller.id == other.id).length := by
      simp only [← List.countP_eq_length_filter]
      apply List.countP_mono_left
      intro other otherMember related
      simpa only [beq_iff_eq] using same controller member other otherMember holds related
    exact Nat.le_trans bound (once ▸ (sublist.filter _).length_le)
  · have empty : controllers.filter rel = [] := List.filter_eq_nil_iff.mpr (by
      intro controller member holds
      exact present ⟨controller, member, holds⟩)
    simp [empty]

theorem regional_parallel_task_claim (record : ActivityOccurrence)
    (controller : ParallelMultiInstanceController) (wait : UserTaskWait)
    (body : activityBodyParallelTasks? record = some (pendingParallelTaskIds controller.slots))
    (named : regionalParallelNamesTask controller wait = true) :
    (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId) ∈
      activityBodyTaskClaims record.body := by
  cases shape : record.body <;> simp [activityBodyParallelTasks?, shape] at body
  next first rest =>
    unfold regionalParallelNamesTask at named
    rw [← body] at named
    simpa only [shape, activityBodyTaskClaims, List.contains_eq_mem, decide_eq_true_eq]
      using named

theorem regional_parallel_task_column (program : Program) (state : RuntimeState)
    (controllers : List ParallelMultiInstanceController)
    (sublist : controllers.Sublist state.parallelMultiInstanceControllers)
    (entry : SemanticOperation) (arm : ParallelMultiInstanceArm)
    (tuples : ∀ controller ∈ controllers,
      Nonempty (RegionalParallelBindingTuple program state controller entry arm))
    (unique : ∀ controller ∈ state.parallelMultiInstanceControllers,
      (state.parallelMultiInstanceControllers.filter fun other => controller.id == other.id).length = 1)
    (claims : activityBodyClaimsUnique state.activityOccurrences = true) (wait : UserTaskWait) :
    (controllers.filter (regionalParallelNamesTask · wait)).length ≤ 1 := by
  apply regional_parallel_column_bound state controllers sublist _ unique
  intro left leftMem right rightMem first second
  obtain ⟨leftTuple⟩ := tuples left leftMem
  obtain ⟨rightTuple⟩ := tuples right rightMem
  obtain ⟨leftRecordMem, leftNames⟩ := regional_parallel_census_member leftTuple.recordCensus
  obtain ⟨rightRecordMem, rightNames⟩ := regional_parallel_census_member rightTuple.recordCensus
  have same : leftTuple.record = rightTuple.record := by
    by_cases same : leftTuple.record = rightTuple.record
    · exact same
    · exact False.elim (activityBodyClaimsDisjoint_no_shared_task
      (activityBodyClaimsUnique_pair claims leftRecordMem rightRecordMem same)
      (regional_parallel_task_claim _ _ _ leftTuple.body first)
      (regional_parallel_task_claim _ _ _ rightTuple.body second))
  rw [← same] at rightNames
  exact regional_parallel_same_record left right _ leftNames rightNames

theorem regional_parallel_timer_relation (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (entry : SemanticOperation)
    (arm : ParallelMultiInstanceArm)
    (tuple : RegionalParallelBindingTuple program state controller entry arm) (wait : TimerWait) :
    regionalParallelNamesTimer state controller wait = timerIdNamesWait tuple.timerId wait := by
  rw [regionalParallelNamesTimer, ← List.any_filter, tuple.recordCensus]
  simp [anyTimerIdNamesWait, tuple.timerHandlers]

theorem regional_parallel_timer_column (state : RuntimeState)
    (controllers : List ParallelMultiInstanceController)
    (sublist : controllers.Sublist state.parallelMultiInstanceControllers)
    (unique : ∀ controller ∈ state.parallelMultiInstanceControllers,
      (state.parallelMultiInstanceControllers.filter fun other => controller.id == other.id).length = 1)
    (claims : attachedTimersUnambiguous state = true)
    (wait : TimerWait) (waitMem : wait ∈ state.timerWaits) :
    (controllers.filter (regionalParallelNamesTimer state · wait)).length ≤ 1 := by
  apply regional_parallel_column_bound state controllers sublist _ unique
  intro left _ right _ first second
  obtain ⟨leftRecord, leftMem, leftRelated⟩ := List.any_eq_true.mp first
  obtain ⟨rightRecord, rightMem, rightRelated⟩ := List.any_eq_true.mp second
  obtain ⟨leftNames, leftAttached⟩ := Bool.and_eq_true_iff.mp leftRelated
  obtain ⟨rightNames, rightAttached⟩ := Bool.and_eq_true_iff.mp rightRelated
  have leftSelected := activityOccurrenceForTimerWait_unique state wait leftRecord
    claims waitMem leftMem leftAttached
  have rightSelected := activityOccurrenceForTimerWait_unique state wait rightRecord
    claims waitMem rightMem rightAttached
  have same := Option.some.inj (leftSelected.symm.trans rightSelected)
  subst rightRecord
  exact regional_parallel_same_record left right leftRecord leftNames rightNames

theorem regional_parallel_filter_commute {α : Type} (values : List α)
    (left right : α → Bool) :
    (values.filter left).filter right = (values.filter right).filter left := by
  simp only [List.filter_filter, Bool.and_comm]

theorem regional_parallel_selected_census {α : Type} (values : List α)
    (selected names : α → Bool)
    (included : ∀ value ∈ values, names value = true → selected value = true) :
    (values.filter selected).filter names = values.filter names := by
  rw [List.filter_filter]
  apply List.filter_congr
  intro value member
  cases named : names value with
  | false => simp
  | true => simp [included value member named]

theorem regional_parallel_population_censuses (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (entry : SemanticOperation)
    (arm : ParallelMultiInstanceArm)
    (tuple : RegionalParallelBindingTuple program state controller entry arm)
    (scope : DefinitionScopeId) (owningScope : operationOwningScope? program entry.id = some scope)
    (element : controller.id.activityElementId.value = arm.taskId.value) :
    ((state.activityOccurrences.filter fun record =>
      record.activityElementId.value == arm.taskId.value &&
        record.owner.definitionScopeId == scope && (activityBodyParallelTasks? record).isSome).filter
      (regionalParallelNamesRecord controller) = [tuple.record]) ∧
    ((state.waits.filter fun wait => wait.task.id == arm.taskId &&
      wait.owner.definitionScopeId == scope).filter (regionalParallelNamesTask controller)).length =
      (pendingParallelTaskIds controller.slots).length ∧
    ((state.timerWaits.filter fun wait => wait.elementId == arm.boundaryTimer.elementId &&
      wait.owner.definitionScopeId == scope).filter (regionalParallelNamesTimer state controller) =
        [tuple.timer]) := by
  have names := (regional_parallel_census_member tuple.recordCensus).2
  simp only [regionalParallelNamesRecord, parallelControllerNamesIdentity,
    Bool.and_eq_true, beq_iff_eq] at names
  have recordElement : tuple.record.activityElementId.value = arm.taskId.value := by
    have value := congrArg (fun id => id.value) names.1.2
    exact value.symm.trans element
  have scopeEqual : tuple.record.owner.definitionScopeId = scope :=
    Option.some.inj (tuple.ownerScope.symm.trans owningScope)
  refine ⟨?_, ?_, ?_⟩
  · rw [regional_parallel_filter_commute, tuple.recordCensus]
    simp [recordElement, scopeEqual, tuple.body]
  · rw [regional_parallel_selected_census]
    · exact tuple.childLength
    · intro wait member named
      have bound := tuple.children wait member named
      simp [bound.1, bound.2, scopeEqual]
  · have relation : regionalParallelNamesTimer state controller = timerIdNamesWait tuple.timerId :=
      funext (regional_parallel_timer_relation program state controller entry arm tuple)
    rw [relation, regional_parallel_filter_commute, tuple.timerCensus]
    simp [tuple.timerOwner, tuple.timerElement, scopeEqual]

end BpmnSemantics.SemanticProcess
