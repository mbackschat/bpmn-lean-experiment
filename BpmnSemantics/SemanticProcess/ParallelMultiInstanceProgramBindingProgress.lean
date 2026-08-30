import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateClosingSelection

/-! # Parallel Multi-Instance progress Program binding

The nonterminal completion rewrite retains one Parallel Multi-Instance controller while completing
exactly one child slot. This module proves that the corresponding Activity body, child waits,
lifetime Timer, and owning Program operation remain bound to that rewritten controller.

Scope boundary: Program-binding preservation for the `.progresses` completion arm only. Terminal
closure, evaluator lifting, complete runtime-state well-formedness, and host behavior remain outside
this module.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def progressWaitTaskId (wait : UserTaskWait) : UserTaskInstanceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.task.id.value⟩
    activation := wait.activation }

private theorem pendingParallelTaskIds_replacePendingParallelSlot
    (slots : List ParallelMultiInstanceSlot) (target : UserTaskInstanceId) (result : String) :
    pendingParallelTaskIds (replacePendingParallelSlot slots target result) =
      (pendingParallelTaskIds slots).filter (fun taskId => decide (taskId ≠ target)) := by
  induction slots with
  | nil => rfl
  | cons slot rest ih =>
      have restEq : pendingParallelTaskIds (List.map (completeParallelSlot target result) rest) =
          (pendingParallelTaskIds rest).filter (fun taskId => decide (taskId ≠ target)) := by
        simpa only [replacePendingParallelSlot] using ih
      cases slot with
      | pending taskId =>
          by_cases same : taskId = target
          · subst taskId
            simp [replacePendingParallelSlot, completeParallelSlot, pendingParallelTaskIds, restEq]
          · simp [replacePendingParallelSlot, completeParallelSlot, pendingParallelTaskIds, same,
              restEq]
      | completed taskId prior =>
          simp [replacePendingParallelSlot, completeParallelSlot, pendingParallelTaskIds, restEq]

private theorem parallelSlotTaskIds_replacePendingParallelSlot
    (slots : List ParallelMultiInstanceSlot) (target : UserTaskInstanceId) (result : String) :
    parallelSlotTaskIds (replacePendingParallelSlot slots target result) =
      parallelSlotTaskIds slots := by
  simp only [replacePendingParallelSlot, parallelSlotTaskIds, List.map_map]
  apply List.map_congr_left
  intro slot _
  cases slot with
  | pending taskId =>
      by_cases same : taskId = target <;>
        simp [completeParallelSlot, ParallelMultiInstanceSlot.taskId, same]
  | completed => rfl

private theorem completeParallelSlot_taskId (target : UserTaskInstanceId) (result : String)
    (slot : ParallelMultiInstanceSlot) :
    (completeParallelSlot target result slot).taskId = slot.taskId := by
  cases slot with
  | pending taskId =>
      by_cases same : taskId = target <;>
        simp [completeParallelSlot, ParallelMultiInstanceSlot.taskId, same]
  | completed => rfl

private theorem filter_ne_eq_erase_of_nodup [BEq α] [LawfulBEq α] [DecidableEq α]
    (target : α) (values : List α) (nodup : values.Nodup) :
    values.filter (fun value => decide (value ≠ target)) = values.erase target := by
  induction values with
  | nil => rfl
  | cons head rest ih =>
      obtain ⟨fresh, restNodup⟩ := List.nodup_cons.mp nodup
      by_cases same : head = target
      · subst head
        have unchanged : rest.filter (fun value => decide (value ≠ target)) = rest := by
          apply List.filter_eq_self.mpr
          intro value member
          have different : value ≠ target := by
            intro equal
            apply fresh
            simpa [equal] using member
          simp [different]
        rw [List.filter_cons]
        simp only [ne_eq, not_true_eq_false, decide_false, Bool.false_eq_true, if_false,
          List.erase_cons_head]
        exact unchanged
      · rw [List.filter_cons]
        have keep : decide (head ≠ target) = true := decide_eq_true_eq.mpr same
        rw [keep]
        simp only [if_true]
        rw [ih restNodup]
        simp [same]

private theorem filter_removeParallelChildWaits_by_pending
    (waits : List UserTaskWait) (pending : List UserTaskInstanceId)
    (target : UserTaskInstanceId) :
    (removeParallelChildWaits waits [target]).filter (fun wait =>
        (pending.filter (fun taskId => decide (taskId ≠ target))).contains
          (progressWaitTaskId wait)) =
      (waits.filter (fun wait => pending.contains (progressWaitTaskId wait))).filter
        (fun wait => decide (progressWaitTaskId wait ≠ target)) := by
  simp only [removeParallelChildWaits, List.filter_filter]
  apply List.filter_congr
  intro wait _
  by_cases same : progressWaitTaskId wait = target <;>
    simp [List.contains_eq_mem, progressWaitTaskId, Bool.and_comm]

private theorem filter_removeParallelChildWaits_commutes (waits : List UserTaskWait)
    (target : UserTaskInstanceId) (predicate : UserTaskWait → Bool) :
    (removeParallelChildWaits waits [target]).filter predicate =
      (waits.filter predicate).filter (fun wait =>
        decide (progressWaitTaskId wait ≠ target)) := by
  simp only [removeParallelChildWaits, List.filter_filter]
  apply List.filter_congr
  intro wait _
  by_cases same : progressWaitTaskId wait = target <;>
    simp [progressWaitTaskId, Bool.and_comm]

private theorem length_filter_map (values : List α) (project : α → β)
    (predicate : β → Bool) :
    (values.filter (fun value => predicate (project value))).length =
      ((values.map project).filter predicate).length := by
  induction values with
  | nil => rfl
  | cons value rest ih =>
      by_cases selected : predicate (project value) = true <;> simp [selected, ih]

private def progressedParallelRecord (record : ActivityOccurrence)
    (first : UserTaskInstanceId) (rest : List UserTaskInstanceId)
    (candidate : ActivityOccurrence) : ActivityOccurrence :=
  if sameActivityOccurrence candidate record then
    { candidate with body := .parallelUserTasks first rest }
  else candidate

private theorem progressedParallelRecord_activityElementId (record : ActivityOccurrence)
    (first : UserTaskInstanceId) (rest : List UserTaskInstanceId)
    (candidate : ActivityOccurrence) :
    (progressedParallelRecord record first rest candidate).activityElementId =
      candidate.activityElementId := by
  unfold progressedParallelRecord
  split <;> rfl

private theorem progressedParallelRecord_owner (record : ActivityOccurrence)
    (first : UserTaskInstanceId) (rest : List UserTaskInstanceId)
    (candidate : ActivityOccurrence) :
    (progressedParallelRecord record first rest candidate).owner = candidate.owner := by
  unfold progressedParallelRecord
  split <;> rfl

private theorem parallelControllerNamesIdentity_progressedParallelRecord
    (controller : ParallelMultiInstanceController) (record candidate : ActivityOccurrence)
    (first : UserTaskInstanceId) (rest : List UserTaskInstanceId) :
    parallelControllerNamesIdentity controller
        (progressedParallelRecord record first rest candidate).processInstanceId
        ⟨(progressedParallelRecord record first rest candidate).activityElementId.value⟩
        (progressedParallelRecord record first rest candidate).activation =
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation := by
  unfold progressedParallelRecord
  split <;> rfl

private theorem filter_replaceParallelRecordBody_commutes
    (records : List ActivityOccurrence) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) (first : UserTaskInstanceId)
    (rest : List UserTaskInstanceId) :
    (replaceParallelRecordBody records record (first :: rest)).filter (fun candidate =>
        parallelControllerNamesIdentity controller candidate.processInstanceId
          ⟨candidate.activityElementId.value⟩ candidate.activation) =
      (records.filter (fun candidate =>
        parallelControllerNamesIdentity controller candidate.processInstanceId
          ⟨candidate.activityElementId.value⟩ candidate.activation)).map
            (progressedParallelRecord record first rest) := by
  change (records.map (progressedParallelRecord record first rest)).filter (fun candidate =>
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation) = _
  induction records with
  | nil => rfl
  | cons candidate tail ih =>
      simp only [List.map_cons, List.filter_cons,
        parallelControllerNamesIdentity_progressedParallelRecord]
      by_cases included : parallelControllerNamesIdentity controller candidate.processInstanceId
          ⟨candidate.activityElementId.value⟩ candidate.activation = true
      · rw [if_pos included, if_pos included, ih]
        rfl
      · rw [if_neg included, if_neg included, ih]

/-- Completing one child while pending siblings remain preserves the exact Program binding. -/
theorem parallelMultiInstanceProgramBindingsValid_progress
    (program : Program) (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (result : String) (firstPending : UserTaskInstanceId)
    (restPending : List UserTaskInstanceId)
    (selection : ParallelCompletionClosingSelectionFacts arm before taskId controller record)
    (pending : pendingParallelTaskIds
      (replacePendingParallelSlot controller.slots taskId result) = firstPending :: restPending)
    (bindings : parallelMultiInstanceProgramBindingsValid program before = true) :
    parallelMultiInstanceProgramBindingsValid program
      { before with
        waits := removeParallelChildWaits before.waits [taskId]
        activityOccurrences := replaceParallelRecordBody before.activityOccurrences record
          (firstPending :: restPending)
        parallelMultiInstanceControllers := insertParallelMultiInstanceController
          { controller with slots := replacePendingParallelSlot controller.slots taskId result }
          (removeParallelController before.parallelMultiInstanceControllers controller) } = true := by
  have facts := parallelMultiInstanceProgramBindingsValid_controller_facts program before controller
    bindings selection.controllerMember
  obtain ⟨entry, boundArm, boundRecord, timer, timerWait, childWaits, _pendingTask,
    _pendingWait, recordExact, operationExact, projects, ownerScopeExact, familyWellFormed,
    body, childWaitsExact, childWaitLength, childWaitIdsUnique, childWaitBindings,
    attachedTimer, matchingTimerWait, timerOwner, timerElement, timerOutput, _pendingMember,
    _pendingWaitMember, _pendingWaitId, _pendingWaitOwner, _pendingWaitTask⟩ := facts.witnesses
  have filteredEntry : entry ∈ program.operations.filter (fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some candidate => candidate.taskId.value == controller.id.activityElementId.value
      | none => false) := by
    exact operationExact.symm ▸ (by simp)
  have entryMember : entry ∈ program.operations := (List.mem_filter.mp filteredEntry).1
  have boundArmMember : boundArm ∈
      program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
    List.mem_filterMap.mpr ⟨entry, entryMember, projects⟩
  rw [account.uniqueEntry] at boundArmMember
  have boundArmEq : boundArm = arm := by simpa using boundArmMember
  subst boundArm
  have selectedRecordFiltered : record ∈ before.activityOccurrences.filter (fun candidate =>
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation) :=
    List.mem_filter.mpr ⟨selection.recordMember, selection.recordIdentity⟩
  rw [recordExact] at selectedRecordFiltered
  have boundRecordEq : record = boundRecord := by simpa using selectedRecordFiltered
  subst boundRecord
  have childWaitsExact' : before.waits.filter (fun wait =>
      (pendingParallelTaskIds controller.slots).contains (progressWaitTaskId wait)) =
      childWaits := by
    simpa only [progressWaitTaskId] using childWaitsExact
  have familyComponents := familyWellFormed
  simp only [parallelMultiInstanceRuntimeWellFormed, Bool.and_eq_true, decide_eq_true_eq,
    List.all_eq_true] at familyComponents
  have slotTaskIdsUnique : (parallelSlotTaskIds controller.slots).Nodup :=
    familyComponents.1.1.1.1.1.2
  have pendingTaskIdsUnique : (pendingParallelTaskIds controller.slots).Nodup :=
    (pendingParallelTaskIds_sublist_parallelSlotTaskIds controller.slots).nodup
      slotTaskIdsUnique
  have childWaitIdsUnique' : (childWaits.map progressWaitTaskId).Nodup := by
    change (childWaits.map fun wait =>
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ :
        UserTaskInstanceId)).Nodup
    exact childWaitIdsUnique
  have childWaitIdsIncluded : childWaits.map progressWaitTaskId ⊆
      pendingParallelTaskIds controller.slots := by
    intro child childMember
    obtain ⟨wait, waitMember, rfl⟩ := List.mem_map.mp childMember
    have filteredMember : wait ∈ before.waits.filter (fun candidate =>
        (pendingParallelTaskIds controller.slots).contains
          (progressWaitTaskId candidate)) := by
      rw [childWaitsExact']
      exact waitMember
    simpa [List.contains_eq_mem] using (List.mem_filter.mp filteredMember).2
  have childWaitIdsLength : (childWaits.map progressWaitTaskId).length =
      (pendingParallelTaskIds controller.slots).length := by
    simpa using childWaitLength
  have pendingIncludedInChildWaitIds : pendingParallelTaskIds controller.slots ⊆
      childWaits.map progressWaitTaskId :=
    nodup_subset_of_nodup_subset_length_eq childWaitIdsUnique' pendingTaskIdsUnique
      childWaitIdsIncluded childWaitIdsLength
  have selectedChildWait : taskId ∈ childWaits.map progressWaitTaskId :=
    pendingIncludedInChildWaitIds selection.taskMember
  let updatedSlots := replacePendingParallelSlot controller.slots taskId result
  let updatedController : ParallelMultiInstanceController := { controller with slots := updatedSlots }
  let updatedRecord : ActivityOccurrence :=
    { record with body := .parallelUserTasks firstPending restPending }
  let remainingChildWaits := childWaits.filter (fun wait =>
    decide (progressWaitTaskId wait ≠ taskId))
  have remainingChildWaitLength : remainingChildWaits.length =
      (pendingParallelTaskIds updatedSlots).length := by
    have remainingAsIds : remainingChildWaits.length =
        ((childWaits.map progressWaitTaskId).filter (fun child =>
          decide (child ≠ taskId))).length := by
      simpa only [remainingChildWaits] using
        length_filter_map childWaits progressWaitTaskId (fun child => decide (child ≠ taskId))
    calc
      remainingChildWaits.length =
          ((childWaits.map progressWaitTaskId).filter (fun child =>
            decide (child ≠ taskId))).length := remainingAsIds
      _ = ((childWaits.map progressWaitTaskId).erase taskId).length := by
        rw [filter_ne_eq_erase_of_nodup taskId _ childWaitIdsUnique']
      _ = (childWaits.map progressWaitTaskId).length - 1 := by
        rw [List.length_erase_of_mem selectedChildWait]
      _ = (pendingParallelTaskIds controller.slots).length - 1 := by
        rw [childWaitIdsLength]
      _ = ((pendingParallelTaskIds controller.slots).erase taskId).length := by
        rw [List.length_erase_of_mem selection.taskMember]
      _ = ((pendingParallelTaskIds controller.slots).filter (fun child =>
          decide (child ≠ taskId))).length := by
        rw [filter_ne_eq_erase_of_nodup taskId _ pendingTaskIdsUnique]
      _ = (pendingParallelTaskIds updatedSlots).length := by
        simp only [updatedSlots, pendingParallelTaskIds_replacePendingParallelSlot]
  apply parallelMultiInstanceProgramBindingsValid_singleton program _ updatedController
    updatedRecord entry arm timer timerWait remainingChildWaits
  · simp [selection.controllersSingleton, updatedController, updatedSlots,
      removeParallelController, insertParallelMultiInstanceController]
  · change (replaceParallelRecordBody before.activityOccurrences record
        (firstPending :: restPending)).filter (fun candidate =>
          parallelControllerNamesIdentity controller candidate.processInstanceId
            ⟨candidate.activityElementId.value⟩ candidate.activation) = [updatedRecord]
    rw [filter_replaceParallelRecordBody_commutes, recordExact]
    simp [updatedRecord, progressedParallelRecord, sameActivityOccurrence]
  · change program.operations.filter (fun operation =>
        match ParallelMultiInstanceArm.ofOperation? operation with
        | some candidate => candidate.taskId.value == controller.id.activityElementId.value
        | none => false) = [entry]
    exact operationExact
  · exact projects
  · simpa [updatedRecord] using ownerScopeExact
  · simp only [parallelMultiInstanceRuntimeWellFormed, Bool.and_eq_true, decide_eq_true_eq,
      List.all_eq_true] at familyWellFormed ⊢
    obtain ⟨⟨⟨⟨⟨controllerFacts, snapshotLength⟩, slotIdsUnique⟩, slotsValid⟩,
      timerFacts⟩, outputAbsent⟩ := familyWellFormed
    refine ⟨⟨⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩
    · have updatedLength : updatedSlots.length = controller.slots.length := by
        simp [updatedSlots, replacePendingParallelSlot]
      have updatedIds : parallelSlotTaskIds updatedSlots =
          parallelSlotTaskIds controller.slots := by
        exact parallelSlotTaskIds_replacePendingParallelSlot controller.slots taskId result
      simpa [updatedController, activationCount, activityActivationCount, updatedLength,
        updatedIds] using controllerFacts
    · intro slot slotMember
      change slot ∈ updatedSlots at slotMember
      simp only [updatedSlots, replacePendingParallelSlot] at slotMember
      obtain ⟨prior, priorMember, rfl⟩ := List.mem_map.mp slotMember
      have priorValid := snapshotLength prior priorMember
      simpa [updatedController, updatedSlots, parallelSlotIdentityValid,
        completeParallelSlot_taskId, activationCount] using priorValid
    · exact slotIdsUnique
    · simpa [updatedController, activationCount, timerActivationCount] using slotsValid
    · exact timerFacts
    · simpa [parallelOutputAbsent] using outputAbsent
  · simp [updatedRecord, updatedController, updatedSlots, pending,
      activityBodyParallelTasks?]
  · change (removeParallelChildWaits before.waits [taskId]).filter (fun wait =>
        (pendingParallelTaskIds updatedSlots).contains (progressWaitTaskId wait)) =
      remainingChildWaits
    simp only [updatedSlots, pendingParallelTaskIds_replacePendingParallelSlot]
    rw [filter_removeParallelChildWaits_by_pending]
    rw [childWaitsExact']
  · change remainingChildWaits.length = (pendingParallelTaskIds updatedSlots).length
    exact remainingChildWaitLength
  · change (remainingChildWaits.map progressWaitTaskId).Nodup
    have remainingSublist : remainingChildWaits.Sublist childWaits := by
      exact List.filter_sublist
    exact (remainingSublist.map progressWaitTaskId).nodup childWaitIdsUnique'
  · apply List.all_eq_true.mpr
    intro wait waitMember
    change wait ∈ remainingChildWaits at waitMember
    have priorMember : wait ∈ childWaits := (List.mem_filter.mp waitMember).1
    have priorBinding := List.all_eq_true.mp childWaitBindings wait priorMember
    simpa [updatedRecord] using priorBinding
  · simpa [updatedRecord, ActivityOccurrence.timerHandlerOccurrences] using attachedTimer
  · exact matchingTimerWait
  · simpa [updatedRecord] using timerOwner
  · exact timerElement
  · exact timerOutput
  · apply List.all_eq_true.mpr
    intro operation operationMember
    cases projection : ParallelMultiInstanceArm.ofOperation? operation with
    | none => simp
    | some candidate =>
        have candidateMember : candidate ∈
            program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
          List.mem_filterMap.mpr ⟨operation, operationMember, projection⟩
        rw [account.uniqueEntry] at candidateMember
        have candidateEq : candidate = arm := by simpa using candidateMember
        subst candidate
        have filteredOperation : operation ∈ program.operations.filter (fun current =>
            match ParallelMultiInstanceArm.ofOperation? current with
            | some candidate => candidate.taskId.value == controller.id.activityElementId.value
            | none => false) := by
          apply List.mem_filter.mpr
          refine ⟨operationMember, ?_⟩
          simp [projection, selection.controllerElement]
        change operation ∈ program.operations.filter (fun operation =>
            match ParallelMultiInstanceArm.ofOperation? operation with
            | some candidate => candidate.taskId.value == controller.id.activityElementId.value
            | none => false) at filteredOperation
        have filteredSingleton : operation ∈ [entry] := operationExact ▸ filteredOperation
        have operationEq : operation = entry := by simpa using filteredSingleton
        subst operation
        have preBindings := bindings
        simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true] at preBindings
        have prior := List.all_eq_true.mp preBindings.2 entry entryMember
        simp only [projects, ownerScopeExact, Bool.and_eq_true, decide_eq_true_eq] at prior ⊢
        have selectedIdentity := selection.recordIdentity
        simp only [parallelControllerNamesIdentity, Bool.and_eq_true, beq_iff_eq] at selectedIdentity
        have recordElement : record.activityElementId.value = arm.taskId.value := by
          exact (congrArg SemanticId.value selectedIdentity.1.2).symm.trans
            selection.controllerElement
        have controllersBefore : before.parallelMultiInstanceControllers.filter (fun current =>
            current.id.activityElementId.value == arm.taskId.value) = [controller] := by
          simp [selection.controllersSingleton, selection.controllerElement]
        have controllersAfter :
            (insertParallelMultiInstanceController updatedController
              (removeParallelController before.parallelMultiInstanceControllers controller)).filter
                (fun current => current.id.activityElementId.value == arm.taskId.value) =
              [updatedController] := by
          simp [selection.controllersSingleton, updatedController, updatedSlots,
            removeParallelController, insertParallelMultiInstanceController,
            selection.controllerElement]
        have recordsBeforeLength :
            (before.activityOccurrences.filter (fun candidateRecord =>
              candidateRecord.activityElementId.value == arm.taskId.value &&
                candidateRecord.owner.definitionScopeId == record.owner.definitionScopeId &&
                (activityBodyParallelTasks? candidateRecord).isSome)).length = 1 := by
          rw [← prior.1.1, controllersBefore]
          rfl
        have recordPredicatePreserved : ∀ candidate ∈ before.activityOccurrences,
            (candidate.activityElementId.value == arm.taskId.value &&
              candidate.owner.definitionScopeId == record.owner.definitionScopeId &&
              (activityBodyParallelTasks?
                (progressedParallelRecord record firstPending restPending candidate)).isSome) =
            (candidate.activityElementId.value == arm.taskId.value &&
              candidate.owner.definitionScopeId == record.owner.definitionScopeId &&
              (activityBodyParallelTasks? candidate).isSome) := by
          intro candidate candidateMember
          unfold progressedParallelRecord
          split
          next same =>
            have sameFields := same
            simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at sameFields
            have candidateIdentity : parallelControllerNamesIdentity controller
                candidate.processInstanceId ⟨candidate.activityElementId.value⟩
                candidate.activation = true := by
              simp only [parallelControllerNamesIdentity, Bool.and_eq_true, beq_iff_eq]
              exact ⟨⟨selectedIdentity.1.1.trans sameFields.1.1.symm,
                by simpa [sameFields.1.2] using selectedIdentity.1.2⟩,
                selectedIdentity.2.trans sameFields.2.symm⟩
            have candidateFiltered : candidate ∈ before.activityOccurrences.filter
                (fun current => parallelControllerNamesIdentity controller
                  current.processInstanceId ⟨current.activityElementId.value⟩
                  current.activation) :=
              List.mem_filter.mpr ⟨candidateMember, candidateIdentity⟩
            have candidateSingleton : candidate ∈ [record] := recordExact ▸ candidateFiltered
            have candidateEq : candidate = record := by simpa using candidateSingleton
            subst candidate
            have bodySome : (activityBodyParallelTasks? record).isSome = true := by
              rw [body]
              rfl
            simp [recordElement, bodySome]
            rfl
          next different => rfl
        have recordsAfterLength :
            ((replaceParallelRecordBody before.activityOccurrences record
              (firstPending :: restPending)).filter (fun candidateRecord =>
                candidateRecord.activityElementId.value == arm.taskId.value &&
                  candidateRecord.owner.definitionScopeId == record.owner.definitionScopeId &&
                  (activityBodyParallelTasks? candidateRecord).isSome)).length = 1 := by
          change (((before.activityOccurrences.map
            (progressedParallelRecord record firstPending restPending)).filter
              (fun candidateRecord =>
                candidateRecord.activityElementId.value == arm.taskId.value &&
                  candidateRecord.owner.definitionScopeId == record.owner.definitionScopeId &&
                  (activityBodyParallelTasks? candidateRecord).isSome)).length = 1)
          rw [← length_filter_map]
          have sameFiltered : before.activityOccurrences.filter (fun candidate =>
              candidate.activityElementId.value == arm.taskId.value &&
                candidate.owner.definitionScopeId == record.owner.definitionScopeId &&
                (activityBodyParallelTasks?
                  (progressedParallelRecord record firstPending restPending candidate)).isSome) =
              before.activityOccurrences.filter (fun candidate =>
                candidate.activityElementId.value == arm.taskId.value &&
                  candidate.owner.definitionScopeId == record.owner.definitionScopeId &&
                  (activityBodyParallelTasks? candidate).isSome) := by
            apply List.filter_congr
            intro candidate candidateMember
            simpa only [progressedParallelRecord_activityElementId,
              progressedParallelRecord_owner] using
                recordPredicatePreserved candidate candidateMember
          simp only [progressedParallelRecord_activityElementId,
            progressedParallelRecord_owner]
          rw [sameFiltered]
          exact recordsBeforeLength
        have timersLength :
            (before.timerWaits.filter (fun wait =>
              wait.elementId == arm.boundaryTimer.elementId &&
                wait.owner.definitionScopeId == record.owner.definitionScopeId)).length = 1 := by
          rw [← prior.1.2, controllersBefore]
          rfl
        have nestedWaitFilter :
            (before.waits.filter (fun wait =>
              wait.task.id == arm.taskId &&
                wait.owner.definitionScopeId == record.owner.definitionScopeId)).filter
                (fun wait => (pendingParallelTaskIds controller.slots).contains
                  (progressWaitTaskId wait)) =
              before.waits.filter (fun wait =>
                (pendingParallelTaskIds controller.slots).contains
                  (progressWaitTaskId wait)) := by
          simp only [List.filter_filter]
          apply List.filter_congr
          intro wait waitMember
          by_cases selected : (pendingParallelTaskIds controller.slots).contains
              (progressWaitTaskId wait) = true
          · have filteredMember : wait ∈ before.waits.filter (fun candidate =>
                (pendingParallelTaskIds controller.slots).contains
                  (progressWaitTaskId candidate)) :=
              List.mem_filter.mpr ⟨waitMember, selected⟩
            have childMember : wait ∈ childWaits := by
              rw [← childWaitsExact']
              exact filteredMember
            have waitBinding := List.all_eq_true.mp childWaitBindings wait childMember
            simp only [Bool.and_eq_true, beq_iff_eq] at waitBinding
            have scopedWait : (wait.task.id == arm.taskId &&
                wait.owner.definitionScopeId == record.owner.definitionScopeId) = true := by
              simp [waitBinding.1.1.1.2, waitBinding.1.1.1.1]
            rw [selected, scopedWait]
            rfl
          · have rejected : (pendingParallelTaskIds controller.slots).contains
                (progressWaitTaskId wait) = false := Bool.eq_false_iff.mpr selected
            rw [rejected]
            rfl
        have childWaitsSublist : childWaits.Sublist
            (before.waits.filter (fun wait =>
              wait.task.id == arm.taskId &&
                wait.owner.definitionScopeId == record.owner.definitionScopeId)) := by
          rw [← childWaitsExact']
          apply List.Sublist.trans (l₂ :=
            (before.waits.filter (fun wait =>
              wait.task.id == arm.taskId &&
                wait.owner.definitionScopeId == record.owner.definitionScopeId)).filter
                  (fun wait => (pendingParallelTaskIds controller.slots).contains
                    (progressWaitTaskId wait)))
          · rw [nestedWaitFilter]
            exact List.Sublist.refl _
          · exact List.filter_sublist
        have waitsBeforeLength :
            (before.waits.filter (fun wait =>
              wait.task.id == arm.taskId &&
                wait.owner.definitionScopeId == record.owner.definitionScopeId)).length =
              (pendingParallelTaskIds controller.slots).length := by
          calc
            _ = ((before.parallelMultiInstanceControllers.filter (fun current =>
                current.id.activityElementId.value == arm.taskId.value)).foldl
              (fun count current =>
                count + (pendingParallelTaskIds current.slots).length) 0) := prior.2
            _ = (pendingParallelTaskIds controller.slots).length := by
              rw [controllersBefore]
              simp
        have childWaitsScoped : childWaits = before.waits.filter (fun wait =>
            wait.task.id == arm.taskId &&
              wait.owner.definitionScopeId == record.owner.definitionScopeId) :=
          List.Sublist.eq_of_length childWaitsSublist
            (childWaitLength.trans waitsBeforeLength.symm)
        have waitsAfter :
            (removeParallelChildWaits before.waits [taskId]).filter (fun wait =>
              wait.task.id == arm.taskId &&
                wait.owner.definitionScopeId == record.owner.definitionScopeId) =
              remainingChildWaits := by
          rw [filter_removeParallelChildWaits_commutes]
          rw [← childWaitsScoped]
        rw [controllersAfter, recordsAfterLength, timersLength, waitsAfter]
        simp [updatedController, remainingChildWaitLength]

end BpmnSemantics.SemanticProcess
