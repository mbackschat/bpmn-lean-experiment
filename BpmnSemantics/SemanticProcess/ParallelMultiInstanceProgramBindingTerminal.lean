import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateClosingSelection

/-! # Parallel Multi-Instance terminal Program binding

Final completion, early completion, and Timer interruption all close the same admitted Parallel
Multi-Instance region. This module proves that the shared terminal rewrite withdraws its controller,
Activity record, child waits, and lifetime Timer wait without stranding a Program binding.

Scope boundary: Program-binding preservation for `closeSharedParallelRegion` only. Complete
runtime-state well-formedness, result selection, Timer scheduling, evaluator lifting, and host
behavior remain outside this module.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def terminalWaitTaskId (wait : UserTaskWait) : UserTaskInstanceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.task.id.value⟩
    activation := wait.activation }

/-- Closing the sole admitted Parallel Multi-Instance region withdraws its complete Program binding. -/
theorem parallelMultiInstanceProgramBindingsValid_terminal
    (program : Program) (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before : RuntimeState) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) (output : ControlPlaceId) (variables : ScopedVariables)
    (selection : ParallelClosingSelectionFacts arm before controller record)
    (bindings : parallelMultiInstanceProgramBindingsValid program before = true) :
    parallelMultiInstanceProgramBindingsValid program
      (closeSharedParallelRegion before controller record output variables) = true := by
  have facts := parallelMultiInstanceProgramBindingsValid_controller_facts program before controller
    bindings selection.controllerMember
  obtain ⟨entry, boundArm, boundRecord, timer, timerWait, childWaits, _pendingTask,
    _pendingWait, recordExact, operationExact, projects, ownerScopeExact, _familyWellFormed,
    body, childWaitsExact, childWaitLength, _childWaitIdsUnique, childWaitBindings,
    attachedTimer, matchingTimerWait, timerOwner, timerElement, _timerOutput, _pendingMember,
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
  have recordIdentity := selection.recordIdentity
  simp only [parallelControllerNamesIdentity, Bool.and_eq_true, beq_iff_eq] at recordIdentity
  have recordElement : record.activityElementId.value = arm.taskId.value := by
    exact (congrArg SemanticId.value recordIdentity.1.2).symm.trans selection.controllerElement
  have childWaitsExact' : before.waits.filter (fun wait =>
      (pendingParallelTaskIds controller.slots).contains (terminalWaitTaskId wait)) =
      childWaits := by
    simpa only [terminalWaitTaskId] using childWaitsExact
  have preBindings := bindings
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at preBindings
  simp [parallelMultiInstanceProgramBindingsValid, closeSharedParallelRegion,
    selection.controllersSingleton, removeParallelController,
    parallelMultiInstanceControllersOrdered]
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
      have filteredSingleton : operation ∈ [entry] := operationExact ▸ filteredOperation
      have operationEq : operation = entry := by simpa using filteredSingleton
      subst operation
      have prior := preBindings.2 entry entryMember
      simp only [projects, ownerScopeExact, Bool.and_eq_true, decide_eq_true_eq] at prior ⊢
      have controllersBefore : before.parallelMultiInstanceControllers.filter (fun current =>
          current.id.activityElementId.value == arm.taskId.value) = [controller] := by
        simp [selection.controllersSingleton, selection.controllerElement]
      have recordsBeforeLength :
          (before.activityOccurrences.filter (fun candidateRecord =>
            candidateRecord.activityElementId.value == arm.taskId.value &&
              candidateRecord.owner.definitionScopeId == record.owner.definitionScopeId &&
              (activityBodyParallelTasks? candidateRecord).isSome)).length = 1 := by
        rw [← prior.1.1, controllersBefore]
        rfl
      have recordBodySome : (activityBodyParallelTasks? record).isSome = true := by
        rw [body]
        rfl
      have recordCensusMember : record ∈ before.activityOccurrences.filter (fun candidateRecord =>
          candidateRecord.activityElementId.value == arm.taskId.value &&
            candidateRecord.owner.definitionScopeId == record.owner.definitionScopeId &&
            (activityBodyParallelTasks? candidateRecord).isSome) := by
        apply List.mem_filter.mpr
        exact ⟨selection.recordMember, by simp [recordElement, recordBodySome]⟩
      obtain ⟨onlyRecord, recordsSingleton⟩ :=
        List.length_eq_one_iff.mp recordsBeforeLength
      have onlyRecordEq : onlyRecord = record := by
        have recordInSingleton : record ∈ [onlyRecord] := by
          rw [← recordsSingleton]
          exact recordCensusMember
        have recordEq : record = onlyRecord := by simpa using recordInSingleton
        exact recordEq.symm
      subst onlyRecord
      have recordsAfterEmpty :
          (removeParallelRecord before.activityOccurrences record).filter (fun candidateRecord =>
            candidateRecord.activityElementId.value == arm.taskId.value &&
              candidateRecord.owner.definitionScopeId == record.owner.definitionScopeId &&
              (activityBodyParallelTasks? candidateRecord).isSome) = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro candidate candidateMember
        obtain ⟨remainingMember, censusMatch⟩ := List.mem_filter.mp candidateMember
        obtain ⟨beforeMember, notSelected⟩ := List.mem_filter.mp remainingMember
        have beforeCensusMember : candidate ∈ before.activityOccurrences.filter
            (fun candidateRecord =>
              candidateRecord.activityElementId.value == arm.taskId.value &&
                candidateRecord.owner.definitionScopeId == record.owner.definitionScopeId &&
                (activityBodyParallelTasks? candidateRecord).isSome) :=
          List.mem_filter.mpr ⟨beforeMember, censusMatch⟩
        rw [recordsSingleton] at beforeCensusMember
        have candidateEq : candidate = record := by simpa using beforeCensusMember
        subst candidate
        simp [sameActivityOccurrence] at notSelected
      have timersBeforeLength :
          (before.timerWaits.filter (fun wait =>
            wait.elementId == arm.boundaryTimer.elementId &&
              wait.owner.definitionScopeId == record.owner.definitionScopeId)).length = 1 := by
        rw [← prior.1.2, controllersBefore]
        rfl
      have timerWaitCensusMember : timerWait ∈ before.timerWaits.filter (fun wait =>
          wait.elementId == arm.boundaryTimer.elementId &&
            wait.owner.definitionScopeId == record.owner.definitionScopeId) := by
        have rawMember : timerWait ∈ before.timerWaits := by
          have filteredMember : timerWait ∈ before.timerWaits.filter (timerIdNamesWait timer) := by
            rw [matchingTimerWait]
            simp
          exact (List.mem_filter.mp filteredMember).1
        apply List.mem_filter.mpr
        exact ⟨rawMember, by simp [timerElement, timerOwner]⟩
      obtain ⟨onlyTimerWait, timersSingleton⟩ :=
        List.length_eq_one_iff.mp timersBeforeLength
      have onlyTimerWaitEq : onlyTimerWait = timerWait := by
        have timerInSingleton : timerWait ∈ [onlyTimerWait] := by
          rw [← timersSingleton]
          exact timerWaitCensusMember
        have timerEq : timerWait = onlyTimerWait := by simpa using timerInSingleton
        exact timerEq.symm
      subst onlyTimerWait
      have timerNamesSelected : timerIdNamesWait timer timerWait = true := by
        have filteredMember : timerWait ∈ before.timerWaits.filter (timerIdNamesWait timer) := by
          rw [matchingTimerWait]
          simp
        exact (List.mem_filter.mp filteredMember).2
      have timersAfterEmpty :
          (removeParallelTimer before.timerWaits timer).filter (fun wait =>
            wait.elementId == arm.boundaryTimer.elementId &&
              wait.owner.definitionScopeId == record.owner.definitionScopeId) = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro candidate candidateMember
        obtain ⟨remainingMember, censusMatch⟩ := List.mem_filter.mp candidateMember
        obtain ⟨beforeMember, notSelected⟩ := List.mem_filter.mp remainingMember
        have beforeCensusMember : candidate ∈ before.timerWaits.filter (fun wait =>
            wait.elementId == arm.boundaryTimer.elementId &&
              wait.owner.definitionScopeId == record.owner.definitionScopeId) :=
          List.mem_filter.mpr ⟨beforeMember, censusMatch⟩
        rw [timersSingleton] at beforeCensusMember
        have candidateEq : candidate = timerWait := by simpa using beforeCensusMember
        subst candidate
        simp [timerNamesSelected] at notSelected
      have nestedWaitFilter :
          (before.waits.filter (fun wait =>
            wait.task.id == arm.taskId &&
              wait.owner.definitionScopeId == record.owner.definitionScopeId)).filter
                (fun wait => (pendingParallelTaskIds controller.slots).contains
                  (terminalWaitTaskId wait)) =
            before.waits.filter (fun wait =>
              (pendingParallelTaskIds controller.slots).contains
                (terminalWaitTaskId wait)) := by
        simp only [List.filter_filter]
        apply List.filter_congr
        intro wait waitMember
        by_cases selected : (pendingParallelTaskIds controller.slots).contains
            (terminalWaitTaskId wait) = true
        · have filteredMember : wait ∈ before.waits.filter (fun candidate =>
              (pendingParallelTaskIds controller.slots).contains
                (terminalWaitTaskId candidate)) :=
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
              (terminalWaitTaskId wait) = false := Bool.eq_false_iff.mpr selected
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
                  (terminalWaitTaskId wait)))
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
      have waitsAfterEmpty :
          (removeParallelChildWaits before.waits
            (pendingParallelTaskIds controller.slots)).filter (fun wait =>
              wait.task.id == arm.taskId &&
                wait.owner.definitionScopeId == record.owner.definitionScopeId) = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro wait waitMember
        obtain ⟨remainingMember, scopedMatch⟩ := List.mem_filter.mp waitMember
        have beforeMember : wait ∈ before.waits := (List.mem_filter.mp remainingMember).1
        have scopedBefore : wait ∈ before.waits.filter (fun candidate =>
            candidate.task.id == arm.taskId &&
              candidate.owner.definitionScopeId == record.owner.definitionScopeId) :=
          List.mem_filter.mpr ⟨beforeMember, scopedMatch⟩
        have childMember : wait ∈ childWaits := by
          rw [childWaitsScoped]
          exact scopedBefore
        have pendingFilteredMember : wait ∈ before.waits.filter (fun candidate =>
            (pendingParallelTaskIds controller.slots).contains
              (terminalWaitTaskId candidate)) := by
          rw [childWaitsExact']
          exact childMember
        have selected := (List.mem_filter.mp pendingFilteredMember).2
        have retained := (List.mem_filter.mp remainingMember).2
        unfold terminalWaitTaskId at selected
        rw [selected] at retained
        simp at retained
      rw [attachedTimer, recordsAfterEmpty, timersAfterEmpty]
      refine ⟨by simp, ?_⟩
      intro wait remaining taskEq scopeEq
      have matchingAfter : wait ∈
          (removeParallelChildWaits before.waits
            (pendingParallelTaskIds controller.slots)).filter (fun candidate =>
              candidate.task.id == arm.taskId &&
                candidate.owner.definitionScopeId == record.owner.definitionScopeId) := by
        apply List.mem_filter.mpr
        exact ⟨remaining, by simp [taskEq, scopeEq]⟩
      rw [waitsAfterEmpty] at matchingAfter
      simp at matchingAfter

end BpmnSemantics.SemanticProcess
