import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateEntryEvaluatorPreservation
import BpmnSemantics.SemanticProcess.ActivityBodyClaimWriterPreservation

/-! # Parallel Multi-Instance shared runtime-state closing selection

Completion and deadline interruption each select exactly one admitted Parallel Multi-Instance
controller and region. This module proves those exact selection facts for the production completion
and Timer lookups. It owns no rewrite-preservation or evaluator-lifting result.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem selectedParallelControllerForTask
    (arm : ParallelMultiInstanceArm) (state : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController)
    (selected : parallelControllerForTask? arm state taskId = some controller) :
    state.parallelMultiInstanceControllers.filter (fun candidate =>
      candidate.id.activityElementId.value = arm.taskId.value &&
        pendingParallelSlotCount taskId candidate.slots = 1) = [controller] := by
  unfold parallelControllerForTask? at selected
  generalize filteredEq : state.parallelMultiInstanceControllers.filter (fun candidate =>
    candidate.id.activityElementId.value = arm.taskId.value &&
      pendingParallelSlotCount taskId candidate.slots = 1) = filtered at selected
  cases filtered with
  | nil => simp at selected
  | cons first rest =>
      cases rest with
      | nil =>
          simp at selected
          simp [selected]
      | cons second tail => simp at selected

private theorem selectedParallelControllerForTimer
    (arm : ParallelMultiInstanceArm) (state : RuntimeState) (timerId : TimerOccurrenceId)
    (controller : ParallelMultiInstanceController)
    (selected : parallelControllerForTimer? arm state timerId = some controller) :
    state.parallelMultiInstanceControllers.filter (fun controller =>
      decide (controller.id.activityElementId.value = arm.taskId.value) &&
        match parallelControllerRecord? state controller with
        | some record => record.attachedTimers.contains timerId
        | none => false) = [controller] := by
  unfold parallelControllerForTimer? at selected
  let candidates := state.parallelMultiInstanceControllers.filter (fun candidate =>
    decide (candidate.id.activityElementId.value = arm.taskId.value) &&
      match parallelControllerRecord? state candidate with
      | some record => record.attachedTimers.contains timerId
      | none => false)
  change (match candidates with | [candidate] => some candidate | _ => none) =
    some controller at selected
  have candidatesEq : candidates = [controller] := by
    cases candidateShape : candidates with
    | nil => simp [candidateShape] at selected
    | cons first rest =>
      cases rest with
      | nil =>
            have firstEq : first = controller := by simpa [candidateShape] using selected
            simp [firstEq]
        | cons second tail => simp [candidateShape] at selected
  simpa [candidates] using candidatesEq

private theorem selectedParallelRecord
    (state : RuntimeState) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence)
    (selected : parallelControllerRecord? state controller = some record) :
    state.activityOccurrences.filter (fun candidate =>
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation) = [record] := by
  unfold parallelControllerRecord? at selected
  generalize filteredEq : state.activityOccurrences.filter (fun candidate =>
    parallelControllerNamesIdentity controller candidate.processInstanceId
      ⟨candidate.activityElementId.value⟩ candidate.activation) = filtered at selected
  cases filtered with
  | nil => simp at selected
  | cons first rest =>
      cases rest with
      | nil =>
          simp at selected
          simp [selected]
      | cons second tail => simp at selected

private theorem pendingParallelSlotCount_positive_mem (target : UserTaskInstanceId) :
    ∀ slots, pendingParallelSlotCount target slots = 1 →
      target ∈ pendingParallelTaskIds slots := by
  intro slots
  induction slots with
  | nil => simp [pendingParallelSlotCount]
  | cons slot rest ih =>
      cases slot with
      | pending taskId =>
          by_cases same : taskId = target
          · simp [pendingParallelSlotCount, pendingParallelTaskIds, same]
          · intro count
            simp only [pendingParallelTaskIds, List.mem_cons]
            exact Or.inr (ih (by simpa [pendingParallelSlotCount, same] using count))
      | completed taskId result =>
          simpa [pendingParallelSlotCount, pendingParallelTaskIds] using ih

private theorem parallelBodyClaims_eq {record : ActivityOccurrence}
    {pending : List UserTaskInstanceId}
    (body : activityBodyParallelTasks? record = some pending) :
    activityBodyTaskClaims record.body = pending := by
  cases bodyShape : record.body <;>
    simp_all [activityBodyParallelTasks?, activityBodyTaskClaims]

private theorem selectedRecord_member_and_identity (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (selected : parallelControllerRecord? state controller = some record) :
    record ∈ state.activityOccurrences ∧
      parallelControllerNamesIdentity controller record.processInstanceId
        ⟨record.activityElementId.value⟩ record.activation = true := by
  have singleton := selectedParallelRecord state controller record selected
  have member : record ∈ state.activityOccurrences.filter (fun candidate =>
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation) := by
    rw [singleton]
    simp
  exact List.mem_filter.mp member

private theorem selectedTaskController_member_and_shape (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController)
    (selected : parallelControllerForTask? arm state taskId = some controller) :
    controller ∈ state.parallelMultiInstanceControllers ∧
      controller.id.activityElementId.value = arm.taskId.value ∧
      pendingParallelSlotCount taskId controller.slots = 1 := by
  have singleton := selectedParallelControllerForTask arm state taskId controller selected
  have member : controller ∈ state.parallelMultiInstanceControllers.filter (fun candidate =>
      candidate.id.activityElementId.value = arm.taskId.value &&
        pendingParallelSlotCount taskId candidate.slots = 1) := by
    rw [singleton]
    simp
  simpa only [List.mem_filter, Bool.and_eq_true, decide_eq_true_eq] using member

private theorem selectedTimerController_member_and_shape (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (timerId : TimerOccurrenceId)
    (controller : ParallelMultiInstanceController)
    (selected : parallelControllerForTimer? arm state timerId = some controller) :
    controller ∈ state.parallelMultiInstanceControllers ∧
      controller.id.activityElementId.value = arm.taskId.value ∧
      ∃ record, parallelControllerRecord? state controller = some record ∧
        record.attachedTimers.contains timerId = true := by
  have singleton := selectedParallelControllerForTimer arm state timerId controller selected
  have member : controller ∈ state.parallelMultiInstanceControllers.filter (fun candidate =>
      decide (candidate.id.activityElementId.value = arm.taskId.value) &&
        match parallelControllerRecord? state candidate with
        | some record => record.attachedTimers.contains timerId
        | none => false) := by
    rw [singleton]
    simp
  obtain ⟨raw, selectedShape⟩ := List.mem_filter.mp member
  simp only [Bool.and_eq_true] at selectedShape
  have element := of_decide_eq_true selectedShape.1
  cases recordEq : parallelControllerRecord? state controller with
  | none => rw [recordEq] at selectedShape; simp at selectedShape
  | some record =>
      rw [recordEq] at selectedShape
      exact ⟨raw, element, record, rfl, selectedShape.2⟩

private theorem waitOwnersLive_userTask (state : RuntimeState) (wait : UserTaskWait)
    (valid : waitOwnersLive state = true) (member : wait ∈ state.waits) :
    exactLiveOccurrence state wait.owner = true := by
  simp only [waitOwnersLive, Bool.and_eq_true] at valid
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨tasks, _messages⟩, _timers⟩, _effects⟩, _incidents⟩, _branches⟩,
    _races⟩, _calls⟩, _activities⟩ := valid
  exact List.all_eq_true.mp tasks wait member

private theorem waitOwnersLive_activity (state : RuntimeState) (record : ActivityOccurrence)
    (valid : waitOwnersLive state = true) (member : record ∈ state.activityOccurrences) :
    exactLiveOccurrence state record.owner = true := by
  simp only [waitOwnersLive, Bool.and_eq_true] at valid
  obtain ⟨_others, activities⟩ := valid
  exact List.all_eq_true.mp activities record member

private theorem pendingParallelSlotCount_eq_count (target : UserTaskInstanceId) :
    ∀ slots, pendingParallelSlotCount target slots =
      (pendingParallelTaskIds slots).count target := by
  intro slots
  induction slots with
  | nil => rfl
  | cons slot rest ih =>
      cases slot with
      | pending taskId =>
          by_cases same : taskId = target
          · subst taskId
            simp [pendingParallelSlotCount, pendingParallelTaskIds, ih, Nat.add_comm]
          · simp [pendingParallelSlotCount, pendingParallelTaskIds, ih, same]
      | completed taskId result =>
          simp [pendingParallelSlotCount, pendingParallelTaskIds, ih]

private theorem nodup_member_count_eq_one {value : α} {values : List α}
    [BEq α] [LawfulBEq α] (nodup : values.Nodup) (member : value ∈ values) :
    values.count value = 1 := by
  induction values with
  | nil => simp at member
  | cons head rest ih =>
      obtain ⟨fresh, restNodup⟩ := List.nodup_cons.mp nodup
      by_cases same : value = head
      · subst value
        have zero : rest.count head = 0 := List.count_eq_zero.mpr fresh
        simp [zero]
      · have restMember : value ∈ rest := by simpa [same] using member
        have reverse : head ≠ value := Ne.symm same
        simp [reverse, ih restNodup restMember]

private theorem controllerIds_eq_of_names_record
    (left right : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (leftNames : parallelControllerNamesIdentity left record.processInstanceId
      ⟨record.activityElementId.value⟩ record.activation = true)
    (rightNames : parallelControllerNamesIdentity right record.processInstanceId
      ⟨record.activityElementId.value⟩ record.activation = true) :
    left.id = right.id := by
  simp only [parallelControllerNamesIdentity, Bool.and_eq_true, beq_iff_eq] at leftNames rightNames
  cases leftId : left.id with
  | mk leftProcess leftElement leftActivation =>
      cases rightId : right.id with
      | mk rightProcess rightElement rightActivation =>
          simp only [leftId, rightId] at leftNames rightNames ⊢
          congr <;> simp_all

private theorem otherParallelRecord_eq_selected (program : Program)
    (expectedInstanceId instanceId : SemanticId) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId) (account : SharedParallelProgramAccount program arm ownerScope)
    (state : RuntimeState) (controller other : ParallelMultiInstanceController)
    (record otherRecord : ActivityOccurrence) (otherTask : UserTaskInstanceId)
    (entry : SemanticOperation) (otherArm : ParallelMultiInstanceArm) (otherWait : UserTaskWait)
    (running : state.control = .running instanceId)
    (position : runtimePositionValid program expectedInstanceId state = true)
    (owners : waitOwnersLive state = true)
    (claims : activityBodyClaimsUnique state.activityOccurrences = true)
    (region : parallelRegionValid arm state controller record = true)
    (recordMember : record ∈ state.activityOccurrences)
    (otherPending : otherTask ∈ pendingParallelTaskIds other.slots)
    (entryMember : entry ∈ program.operations)
    (projects : ParallelMultiInstanceArm.ofOperation? entry = some otherArm)
    (taskElement : otherArm.taskId.value = other.id.activityElementId.value)
    (otherRecordMember : otherRecord ∈ state.activityOccurrences)
    (otherBody : activityBodyParallelTasks? otherRecord =
      some (pendingParallelTaskIds other.slots))
    (otherWaitMember : otherWait ∈ state.waits)
    (otherWaitId :
      (⟨otherWait.processInstanceId, ⟨otherWait.task.id.value⟩, otherWait.activation⟩ :
        UserTaskInstanceId) = otherTask)
    (otherWaitOwner : otherWait.owner = otherRecord.owner)
    (otherWaitTask : otherWait.task.id = otherArm.taskId) :
    otherRecord = record := by
  have armMember : otherArm ∈
      program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
    List.mem_filterMap.mpr ⟨entry, entryMember, projects⟩
  rw [account.uniqueEntry] at armMember
  have armEq : otherArm = arm := by simpa using armMember
  subst otherArm
  have oneScope := parallelMultiInstanceProfile_has_one_definition_scope program account.profile
    account.capabilities
  have selectedLive := waitOwnersLive_activity state record owners recordMember
  have otherLive : exactLiveOccurrence state otherRecord.owner = true := by
    rw [← otherWaitOwner]
    exact waitOwnersLive_userTask state otherWait owners otherWaitMember
  have ownerEq : otherRecord.owner = record.owner :=
    runtimePositionValid_liveOccurrence_unique_of_single_definition_scope program
      expectedInstanceId instanceId state running position oneScope otherRecord.owner record.owner
      otherLive selectedLive
  unfold parallelRegionValid at region
  rw [Bool.and_eq_true] at region
  have region2 := region.1
  rw [Bool.and_eq_true] at region2
  have region3 := region2.1
  rw [Bool.and_eq_true] at region3
  have region4 := region3.1
  rw [Bool.and_eq_true] at region4
  have region5 := region4.1
  rw [Bool.and_eq_true] at region5
  have region6 := region5.1
  rw [Bool.and_eq_true] at region6
  have selectedBody := region5.2
  have regionTaskIdsBool := region3.2
  simp only [beq_iff_eq] at selectedBody
  let regionWaits := state.waits.filter fun wait =>
    wait.owner == record.owner && wait.task.id == arm.taskId
  have regionTaskIds : parallelTaskIdsFromWaits regionWaits =
      pendingParallelTaskIds controller.slots := by
    simpa [regionWaits] using of_decide_eq_true regionTaskIdsBool
  have otherRegionWait : otherWait ∈ regionWaits := by
    apply List.mem_filter.mpr
    exact ⟨otherWaitMember, by simp [otherWaitOwner, ownerEq, otherWaitTask]⟩
  have mappedWait :
      (⟨otherWait.processInstanceId, ⟨otherWait.task.id.value⟩, otherWait.activation⟩ :
        UserTaskInstanceId) ∈ parallelTaskIdsFromWaits regionWaits := by
    exact List.mem_map.mpr ⟨otherWait, otherRegionWait, rfl⟩
  have otherInSelected : otherTask ∈ pendingParallelTaskIds controller.slots := by
    rw [regionTaskIds] at mappedWait
    simpa [otherWaitId] using mappedWait
  have selectedClaims := parallelBodyClaims_eq selectedBody
  have otherClaims := parallelBodyClaims_eq otherBody
  by_cases same : otherRecord = record
  · exact same
  · exfalso
    have disjoint := activityBodyClaimsUnique_pair claims otherRecordMember recordMember same
    exact activityBodyClaimsDisjoint_no_shared_task disjoint
      (by rw [otherClaims]; exact otherPending)
      (by rw [selectedClaims]; exact otherInSelected)

structure ParallelClosingSelectionFacts (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) : Prop where
  controllersSingleton : state.parallelMultiInstanceControllers = [controller]
  controllerMember : controller ∈ state.parallelMultiInstanceControllers
  controllerElement : controller.id.activityElementId.value = arm.taskId.value
  recordMember : record ∈ state.activityOccurrences
  recordIdentity : parallelControllerNamesIdentity controller record.processInstanceId
    ⟨record.activityElementId.value⟩ record.activation = true
  region : parallelRegionValid arm state controller record = true

structure ParallelCompletionClosingSelectionFacts (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence) : Prop
    extends ParallelClosingSelectionFacts arm state controller record where
  pendingSlotCount : pendingParallelSlotCount taskId controller.slots = 1
  taskMember : taskId ∈ pendingParallelTaskIds controller.slots

structure ParallelTimerClosingSelectionFacts (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (timerId : TimerOccurrenceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence) : Prop
    extends ParallelClosingSelectionFacts arm state controller record where
  timerMember : timerId ∈ record.attachedTimers

theorem completionControllers_singleton (program : Program)
    (expectedInstanceId instanceId : SemanticId) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId) (account : SharedParallelProgramAccount program arm ownerScope)
    (state : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (running : state.control = .running instanceId)
    (selectedController : parallelControllerForTask? arm state taskId = some controller)
    (selectedRecord : parallelControllerRecord? state controller = some record)
    (region : parallelRegionValid arm state controller record = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId state = true) :
    state.parallelMultiInstanceControllers = [controller] := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
  obtain ⟨existing, claims⟩ := wellFormed
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, _races⟩, _incidents⟩, owners⟩,
    _identities⟩, _bounds⟩, _declarations⟩, _hidden⟩, _order⟩, _bodies⟩, _attached⟩,
    _activityIds⟩, _controllers⟩, _sequentialBindings⟩, parallelBindings⟩, _controllerIds⟩,
    _notExhausted⟩, _lifecycle⟩ := existing
  obtain ⟨controllerMember, _element, selectedCount⟩ :=
    selectedTaskController_member_and_shape arm state taskId controller selectedController
  obtain ⟨recordMember, selectedNames⟩ :=
    selectedRecord_member_and_identity state controller record selectedRecord
  have selectedSingleton :=
    selectedParallelControllerForTask arm state taskId controller selectedController
  have allEqual : ∀ other ∈ state.parallelMultiInstanceControllers, other = controller := by
    intro other otherMember
    obtain ⟨otherTask, entry, otherArm, otherRecord, otherWait, otherPending, entryMember,
      projects, taskElement, _ownerScope, otherRecordMember, _otherNames, otherBody,
      otherWaitMember, otherWaitId, otherWaitOwner, otherWaitTask⟩ :=
      parallelMultiInstanceProgramBindingsValid_controller_witness program state other
        parallelBindings otherMember
    have recordEq := otherParallelRecord_eq_selected program expectedInstanceId instanceId arm
      ownerScope account state controller other record otherRecord otherTask entry otherArm
      otherWait running position owners claims region recordMember otherPending entryMember
      projects taskElement otherRecordMember otherBody otherWaitMember otherWaitId
      otherWaitOwner otherWaitTask
    subst otherRecord
    have armMember : otherArm ∈
        program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
      List.mem_filterMap.mpr ⟨entry, entryMember, projects⟩
    rw [account.uniqueEntry] at armMember
    have armEq : otherArm = arm := by simpa using armMember
    subst otherArm
    unfold parallelRegionValid at region
    rw [Bool.and_eq_true] at region
    have region2 := region.1
    rw [Bool.and_eq_true] at region2
    have selectedNodup := of_decide_eq_true region2.2
    have region3 := region2.1
    rw [Bool.and_eq_true] at region3
    have selectedPendingEq := of_decide_eq_true region3.2
    rw [selectedPendingEq] at selectedNodup
    have region4 := region3.1
    rw [Bool.and_eq_true] at region4
    have region5 := region4.1
    rw [Bool.and_eq_true] at region5
    simp only [beq_iff_eq] at region5
    have pendingEq : pendingParallelTaskIds other.slots =
        pendingParallelTaskIds controller.slots := by
      rw [region5.2] at otherBody
      exact (Option.some.inj otherBody).symm
    have selectedPending := pendingParallelSlotCount_positive_mem taskId controller.slots
      selectedCount
    have otherCount : pendingParallelSlotCount taskId other.slots = 1 := by
      rw [pendingParallelSlotCount_eq_count, pendingEq]
      exact nodup_member_count_eq_one selectedNodup selectedPending
    have otherFiltered : other ∈ state.parallelMultiInstanceControllers.filter (fun candidate =>
        candidate.id.activityElementId.value = arm.taskId.value &&
          pendingParallelSlotCount taskId candidate.slots = 1) :=
      List.mem_filter.mpr ⟨otherMember, by simp [taskElement, otherCount]⟩
    rw [selectedSingleton] at otherFiltered
    simpa using otherFiltered
  have allSelected : state.parallelMultiInstanceControllers.filter (fun candidate =>
      candidate.id.activityElementId.value = arm.taskId.value &&
        pendingParallelSlotCount taskId candidate.slots = 1) =
      state.parallelMultiInstanceControllers := by
    apply List.filter_eq_self.mpr
    intro other otherMember
    rw [allEqual other otherMember]
    simp [selectedCount]
    exact _element
  have filteredLength := congrArg List.length selectedSingleton
  rw [allSelected] at filteredLength
  have lengthOne : state.parallelMultiInstanceControllers.length = 1 := by
    simpa using filteredLength
  obtain ⟨only, stateEq⟩ := List.length_eq_one_iff.mp lengthOne
  have onlyEq : only = controller := by
    rw [stateEq] at controllerMember
    have controllerEq : controller = only := by simpa using controllerMember
    exact controllerEq.symm
  exact stateEq.trans (congrArg (fun value => [value]) onlyEq)

theorem timerControllers_singleton (program : Program)
    (expectedInstanceId instanceId : SemanticId) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId) (account : SharedParallelProgramAccount program arm ownerScope)
    (state : RuntimeState) (timerId : TimerOccurrenceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (running : state.control = .running instanceId)
    (selectedController : parallelControllerForTimer? arm state timerId = some controller)
    (selectedRecord : parallelControllerRecord? state controller = some record)
    (region : parallelRegionValid arm state controller record = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId state = true) :
    state.parallelMultiInstanceControllers = [controller] := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
  obtain ⟨existing, claims⟩ := wellFormed
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, _races⟩, _incidents⟩, owners⟩,
    _identities⟩, _bounds⟩, _declarations⟩, _hidden⟩, _order⟩, _bodies⟩, _attached⟩,
    _activityIds⟩, _controllers⟩, _sequentialBindings⟩, parallelBindings⟩, _controllerIds⟩,
    _notExhausted⟩, _lifecycle⟩ := existing
  obtain ⟨controllerMember, selectedElement, selectedLookupRecord, selectedLookup,
    timerContained⟩ :=
    selectedTimerController_member_and_shape arm state timerId controller selectedController
  rw [selectedRecord] at selectedLookup
  have lookupRecordEq : selectedLookupRecord = record := Option.some.inj selectedLookup.symm
  subst selectedLookupRecord
  obtain ⟨recordMember, selectedNames⟩ :=
    selectedRecord_member_and_identity state controller record selectedRecord
  have timerMember : timerId ∈ record.attachedTimers := by
    simpa [List.contains_eq_mem] using timerContained
  have selectedSingleton :=
    selectedParallelControllerForTimer arm state timerId controller selectedController
  have allEqual : ∀ other ∈ state.parallelMultiInstanceControllers, other = controller := by
    intro other otherMember
    obtain ⟨otherTask, entry, otherArm, otherRecord, otherWait, otherPending, entryMember,
      projects, taskElement, _ownerScope, otherRecordMember, otherNames, otherBody,
      otherWaitMember, otherWaitId, otherWaitOwner, otherWaitTask⟩ :=
      parallelMultiInstanceProgramBindingsValid_controller_witness program state other
        parallelBindings otherMember
    have recordEq := otherParallelRecord_eq_selected program expectedInstanceId instanceId arm
      ownerScope account state controller other record otherRecord otherTask entry otherArm
      otherWait running position owners claims region recordMember otherPending entryMember
      projects taskElement otherRecordMember otherBody otherWaitMember otherWaitId
      otherWaitOwner otherWaitTask
    subst otherRecord
    have armMember : otherArm ∈
        program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
      List.mem_filterMap.mpr ⟨entry, entryMember, projects⟩
    rw [account.uniqueEntry] at armMember
    have armEq : otherArm = arm := by simpa using armMember
    subst otherArm
    have idEq := controllerIds_eq_of_names_record other controller record otherNames selectedNames
    have otherLookup : parallelControllerRecord? state other = some record := by
      unfold parallelControllerRecord? at selectedRecord ⊢
      simpa [parallelControllerNamesIdentity, idEq] using selectedRecord
    have otherFiltered : other ∈ state.parallelMultiInstanceControllers.filter (fun candidate =>
        decide (candidate.id.activityElementId.value = arm.taskId.value) &&
          match parallelControllerRecord? state candidate with
          | some found => found.attachedTimers.contains timerId
          | none => false) := by
      apply List.mem_filter.mpr
      refine ⟨otherMember, ?_⟩
      simp [taskElement, otherLookup, timerMember]
    rw [selectedSingleton] at otherFiltered
    simpa using otherFiltered
  have allSelected : state.parallelMultiInstanceControllers.filter (fun candidate =>
      decide (candidate.id.activityElementId.value = arm.taskId.value) &&
        match parallelControllerRecord? state candidate with
        | some found => found.attachedTimers.contains timerId
        | none => false) = state.parallelMultiInstanceControllers := by
    apply List.filter_eq_self.mpr
    intro other otherMember
    rw [allEqual other otherMember]
    simp [selectedElement, selectedRecord, timerMember]
  have filteredLength := congrArg List.length selectedSingleton
  rw [allSelected] at filteredLength
  have lengthOne : state.parallelMultiInstanceControllers.length = 1 := by
    simpa using filteredLength
  obtain ⟨only, stateEq⟩ := List.length_eq_one_iff.mp lengthOne
  have onlyEq : only = controller := by
    rw [stateEq] at controllerMember
    have controllerEq : controller = only := by simpa using controllerMember
    exact controllerEq.symm
  exact stateEq.trans (congrArg (fun value => [value]) onlyEq)

theorem completionClosingSelectionFacts (program : Program)
    (expectedInstanceId instanceId : SemanticId) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId) (account : SharedParallelProgramAccount program arm ownerScope)
    (state : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (running : state.control = .running instanceId)
    (selectedController : parallelControllerForTask? arm state taskId = some controller)
    (selectedRecord : parallelControllerRecord? state controller = some record)
    (region : parallelRegionValid arm state controller record = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId state = true) :
    ParallelCompletionClosingSelectionFacts arm state taskId controller record := by
  obtain ⟨controllerMember, controllerElement, pendingSlotCount⟩ :=
    selectedTaskController_member_and_shape arm state taskId controller selectedController
  obtain ⟨recordMember, recordIdentity⟩ :=
    selectedRecord_member_and_identity state controller record selectedRecord
  exact {
    toParallelClosingSelectionFacts := {
      controllersSingleton := completionControllers_singleton program expectedInstanceId
        instanceId arm ownerScope account state taskId controller record running
        selectedController selectedRecord region wellFormed
      controllerMember
      controllerElement
      recordMember
      recordIdentity
      region
    }
    pendingSlotCount
    taskMember := pendingParallelSlotCount_positive_mem taskId controller.slots pendingSlotCount
  }

theorem timerClosingSelectionFacts (program : Program)
    (expectedInstanceId instanceId : SemanticId) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId) (account : SharedParallelProgramAccount program arm ownerScope)
    (state : RuntimeState) (timerId : TimerOccurrenceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (running : state.control = .running instanceId)
    (selectedController : parallelControllerForTimer? arm state timerId = some controller)
    (selectedRecord : parallelControllerRecord? state controller = some record)
    (region : parallelRegionValid arm state controller record = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId state = true) :
    ParallelTimerClosingSelectionFacts arm state timerId controller record := by
  obtain ⟨controllerMember, controllerElement, selectedLookupRecord, selectedLookup,
    timerContained⟩ :=
    selectedTimerController_member_and_shape arm state timerId controller selectedController
  rw [selectedRecord] at selectedLookup
  have lookupRecordEq : selectedLookupRecord = record := Option.some.inj selectedLookup.symm
  subst selectedLookupRecord
  obtain ⟨recordMember, recordIdentity⟩ :=
    selectedRecord_member_and_identity state controller record selectedRecord
  have timerMember : timerId ∈ record.attachedTimers := by
    simpa [List.contains_eq_mem] using timerContained
  exact {
    toParallelClosingSelectionFacts := {
      controllersSingleton := timerControllers_singleton program expectedInstanceId instanceId
        arm ownerScope account state timerId controller record running selectedController
        selectedRecord region wellFormed
      controllerMember
      controllerElement
      recordMember
      recordIdentity
      region
    }
    timerMember
  }

end BpmnSemantics.SemanticProcess
