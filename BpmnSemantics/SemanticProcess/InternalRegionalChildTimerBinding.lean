import BpmnSemantics.SemanticProcess.InternalRegionalCompletionBinding
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity

/-! The Program's unique Timer declarer identifies the private bounded-scope matcher.
AOO-JOIN-03 binds the deadline through its Activity body and tagged attachment; independent
child and Timer activation counters need not agree. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem valid_bounded_timer_binding
    (program : Program) (state : RuntimeState) (timer : TimerWait)
    (id : OperationId) (origin : BpmnElementOrigin)
    (input entry : ControlPlaceId) (definition : DefinitionScopeId)
    (boundary : BoundaryTimerArm)
    (programValid : programWellFormed program = true)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (timerMember : timer ∈ state.timerWaits)
    (entryMember : .enterBoundedScope id origin input entry definition boundary ∈ program.operations)
    (element : timer.elementId = boundary.elementId) :
    flowNodeOccurrenceBoundaryTimerBound program state timer = true ∧
      timer.output = boundary.output ∧
      (state.activityOccurrences.filter fun record =>
        record.owner = timer.owner && recordAttaches record
          { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } &&
          (state.scopeOccurrences.filter fun child =>
            decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
              activityBodyScope? record == some child.id).length = 1).length = 1 := by
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior
  have valid := List.all_eq_true.mp prior.1.2 timer timerMember
  change (occurrenceOwnerValid state timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true at valid
  have census := (Bool.and_eq_true_iff.mp valid).2
  change decide ((program.operations.filter _).length = 1) = true at census
  obtain ⟨candidate, exactCandidate⟩ := List.length_eq_one_iff.mp (of_decide_eq_true census)
  have member := List.mem_filter.mp (show candidate ∈ program.operations.filter _ from
    by rw [exactCandidate]; exact List.mem_singleton_self candidate)
  have declared : operationDeclaresWaitKey candidate (timerWaitDeclarationKey timer.elementId) = true := by
    have matched := member.2
    change (if !operationOwnedBy program candidate timer.owner then false else _) = true at matched
    split at matched
    · contradiction
    rename_i owned
    have matching := matched
    cases candidate <;> try contradiction
    all_goals simp only [operationDeclaresWaitKey, operationWaitDeclarationKeys, timerWaitDeclarationKey]
    all_goals first
      | (change (_ && _) = true at matching
         simp only [Bool.and_eq_true, decide_eq_true_eq] at matching
         simp_all)
      | (change (if !operationOwnedBy program _ timer.owner then false else _ && _ && _) = true at matching
         split at matching
         · contradiction
         · simp only [Bool.and_eq_true, decide_eq_true_eq] at matching
           simp_all)
  have selected := boundedCompletion_timer_operation_binding program id origin input entry definition boundary
    candidate programValid entryMember member.1 (by simpa only [element] using declared)
  subst candidate
  refine ⟨?_, ?_⟩
  · unfold flowNodeOccurrenceBoundaryTimerBound
    rw [← census]
    congr 2
    apply congrArg List.length
    apply List.filter_congr
    intro operation operationMember
    have only := congrArg (fun operations : List SemanticOperation => operation ∈ operations) exactCandidate
    simp only [List.mem_filter, operationMember, true_and, List.mem_singleton] at only
    cases operation <;> try rfl
    all_goals first
      | (have failed := mt (Eq.mp only) (by intro impossible; cases impossible)
         change (if !operationOwnedBy program _ timer.owner then false else false) = _
         simp only [ite_self]
         exact (Bool.eq_false_iff.mpr failed).symm)
      | (change (if !operationOwnedBy program _ timer.owner then false else _) =
          (if !operationOwnedBy program _ timer.owner then false else
            if !operationOwnedBy program _ timer.owner then false else _)
         split <;> rfl)
  ·
    have matched := member.2
    change (if !operationOwnedBy program _ timer.owner then false else
      if !operationOwnedBy program _ timer.owner then false else _ && _ && _) = true at matched
    split at matched
    · contradiction
    · simp only [Bool.and_eq_true, decide_eq_true_eq] at matched ⊢
      exact ⟨matched.1.2.symm, matched.2⟩

/-- The selected deadline's unique declaration makes it private before completion. -/
theorem completionWithdrawal_deadline_binding (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (record : ActivityOccurrence) (deadline : TimerWait)
    (programValid : programWellFormed program = true)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (selected : selectInternalCompletionWithdrawal? program state scopeId = some (.bounded record deadline)) :
    flowNodeOccurrenceBoundaryTimerBound program state deadline = true := by
  obtain ⟨declaration, child, parent, attached, declarations, _, _, _, _, _, timerElement, waits, _⟩ :=
    completionWithdrawal_bounded_facts program state scopeId record deadline selected
  have timerMember := List.mem_filter.mp (show deadline ∈ state.timerWaits.filter (timerIdNamesWait attached) from
    by rw [waits]; exact List.mem_singleton_self deadline)
  have element : deadline.elementId = declaration.elementId := by
    have names := timerMember.2
    simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
    exact congrArg NodeId.mk (names.1.2.symm.trans timerElement)
  have declared : declaration ∈ boundedCompletionDeclarations program scopeId := by rw [declarations]; simp
  unfold boundedCompletionDeclarations at declared
  obtain ⟨operation, member, matching⟩ := List.mem_filterMap.mp declared
  cases operation <;> dsimp only at matching <;> try contradiction
  rename_i id origin input entry definition boundary
  split at matching
  · rename_i same
    cases matching
    subst definition
    exact (valid_bounded_timer_binding program state deadline id origin input entry scopeId declaration
      programValid prior timerMember.1 member element).1
  · contradiction

theorem valid_timer_process_owner (program : Program) (state : RuntimeState) (timer : TimerWait)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (member : timer ∈ state.timerWaits) : timer.processInstanceId = timer.owner.processInstanceId := by
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior
  have valid := List.all_eq_true.mp prior.1.2 timer member
  change (occurrenceOwnerValid state timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true at valid
  have owner := (Bool.and_eq_true_iff.mp valid).1
  simp only [occurrenceOwnerValid, Bool.and_eq_true, decide_eq_true_eq] at owner
  exact owner.1.2

/-- Exact body selection and the singleton tagged handler exclude every surviving Timer
from the removed Activity, without comparing counters from different families. -/
theorem completionWithdrawal_retained_timer_not_attached (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (record : ActivityOccurrence) (deadline timer : TimerWait)
    (root : RuntimeScopeOccurrence) (candidate : ActivityOccurrence)
    (unique : waitIdentitiesUnique state = true)
    (children : state.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = scopeId)) = [root])
    (selected : selectInternalCompletionWithdrawal? program state scopeId = some (.bounded record deadline))
    (retained : timer ∈ state.timerWaits.erase deadline)
    (member : candidate ∈ state.activityOccurrences) (body : candidate.body = .childScope root.id) :
    recordAttaches candidate
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } = false := by
  obtain ⟨declaration, child, parent, attached, _, selectedChildren, _, found, _, handlers, _, waits, _⟩ :=
    completionWithdrawal_bounded_facts program state scopeId record deadline selected
  have sameChild : child = root := by simpa using selectedChildren.symm.trans children
  subst child
  have census : state.activityOccurrences.filter (fun value => activityBodyScope? value == some root.id) = [record] := by
    unfold activityOccurrenceForScope? at found
    split at found <;> simp_all
  have belongs : candidate ∈ state.activityOccurrences.filter (fun value => activityBodyScope? value == some root.id) :=
    List.mem_filter.mpr ⟨member, by simp [activityBodyScope?, body]⟩
  have sameRecord : candidate = record := by simpa [census] using belongs
  subst candidate
  have deadlineMember := List.mem_filter.mp (show deadline ∈ state.timerWaits.filter (timerIdNamesWait attached) from
    by rw [waits]; exact List.mem_singleton_self deadline)
  rw [bounded_completion_timer_identity_mask state deadline deadlineMember.1 unique] at retained
  apply Bool.eq_false_iff.mpr
  intro attaches
  have identity : attached =
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } := by
    symm
    simpa [recordAttaches, ActivityOccurrence.timerHandlerOccurrences, handlers, beq_iff_eq] using attaches
  have names := deadlineMember.2
  rw [identity] at names
  simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
  have element : timer.elementId = deadline.elementId := congrArg NodeId.mk names.1.2
  have sameKey : timerWaitKeyMatches deadline timer = true := by
    simp [timerWaitKeyMatches, names.1.1.symm, element.symm, names.2.symm]
  simpa [sameKey] using (List.mem_filter.mp retained).2

end BpmnSemantics.SemanticProcess.InternalCommutation
