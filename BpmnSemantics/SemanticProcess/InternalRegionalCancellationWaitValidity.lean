import BpmnSemantics.SemanticProcess.InternalRegionalCancellationTimerFrames

/-! Cancellation retains the complete owner and Event Race censuses of surviving waits.
Together with AOO-JOIN-03's Activity-host frames, these laws preserve wait correspondence;
the Effect-local bijection is a separate obligation at the composition boundary. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem cancelScopeSubtree_occurrence_owner_frame (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (owner : ScopeOccurrenceId)
    (process : SemanticId) (element : NodeId) (activation : Nat)
    (outside : (occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) = false) :
    occurrenceOwnerValid (cancelScopeSubtree state root disposition) process owner element activation =
      occurrenceOwnerValid state process owner element activation := by
  simp only [occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
    cancelScopeSubtree_uncancelled_owner_census state root disposition owner outside]

theorem cancelScopeSubtree_owner_race_frame (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (owner : ScopeOccurrenceId) (predicate : EventRace → Bool)
    (outside : (occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) = false) :
    ((cancelScopeSubtree state root disposition).eventRaces.any fun race =>
      race.owner = owner && predicate race) =
    (state.eventRaces.any fun race => race.owner = owner && predicate race) := by
  change (state.eventRaces.filter _).any _ = _
  rw [List.any_filter]
  apply congrArg (fun test => state.eventRaces.any test)
  funext race
  by_cases same : race.owner = owner
  · simp only [same, outside, Bool.not_false, Bool.true_and]
  · simp [same]

theorem cancelScopeSubtree_user_task_program_validity (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prior : flowNodeOccurrenceUserTaskProgramValidity program state = true) :
    flowNodeOccurrenceUserTaskProgramValidity program (cancelScopeSubtree state root disposition) = true := by
  simp only [flowNodeOccurrenceUserTaskProgramValidity, List.all_eq_true] at prior ⊢
  intro wait member
  obtain ⟨beforeMember, kept⟩ := List.mem_filter.mp member
  have outside := kept
  simp only [Bool.not_eq_true'] at outside
  have valid := prior wait beforeMember
  change (occurrenceOwnerValid _ wait.processInstanceId wait.owner ⟨wait.task.id.value⟩ wait.activation && _) = true
  change (occurrenceOwnerValid state wait.processInstanceId wait.owner ⟨wait.task.id.value⟩ wait.activation && _) = true at valid
  simpa only [cancelScopeSubtree_occurrence_owner_frame state root disposition wait.owner _ _ _ outside] using valid

theorem cancelScopeSubtree_wait_program_validity (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (effects : flowNodeOccurrenceEffectProgramValidity program (cancelScopeSubtree state root disposition) = true) :
    flowNodeOccurrenceWaitProgramValidity program (cancelScopeSubtree state root disposition) = true := by
  let after := cancelScopeSubtree state root disposition
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  refine ⟨⟨⟨cancelScopeSubtree_user_task_program_validity program state root disposition prior.1.1.1,
    ?_⟩, ?_⟩, effects⟩
  · apply List.all_eq_true.mpr
    intro wait member
    obtain ⟨beforeMember, kept⟩ := List.mem_filter.mp member
    simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
    have valid := List.all_eq_true.mp prior.1.1.2 wait beforeMember
    change (occurrenceOwnerValid after wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true
    change (occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true at valid
    simp only [Bool.and_eq_true] at valid ⊢
    refine ⟨(cancelScopeSubtree_occurrence_owner_frame state root disposition wait.owner _ _ _ kept.1).trans valid.1,
      Eq.trans ?_ valid.2⟩
    congr 3
    apply List.filter_congr
    intro candidate candidateMember
    cases candidate <;> try rfl
    case awaitEventRace id origin input message timer =>
      change (_ && (_ && _ && _ && after.eventRaces.any _)) =
        (_ && (_ && _ && _ && state.eventRaces.any _))
      have races := cancelScopeSubtree_owner_race_frame state root disposition wait.owner
        (fun race => decide (race.id.elementId.value = origin.elementId.value) &&
          decide (race.messageSubscriptionId =
            { processInstanceId := wait.processInstanceId, elementId := ⟨wait.elementId.value⟩, activation := wait.activation })) kept.1
      simp only [Bool.and_assoc] at races ⊢
      exact congrArg (fun present : Bool =>
        operationOwnedBy program (.awaitEventRace id origin input message timer) wait.owner &&
          (message.elementId = wait.elementId && (message.channel = wait.channel &&
            (message.output = wait.output && present)))) races
  · apply List.all_eq_true.mpr
    intro timer member
    obtain ⟨beforeMember, kept⟩ := List.mem_filter.mp member
    simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
    have valid := List.all_eq_true.mp prior.1.2 timer beforeMember
    change (occurrenceOwnerValid after timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true
    change (occurrenceOwnerValid state timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true at valid
    simp only [Bool.and_eq_true] at valid ⊢
    refine ⟨(cancelScopeSubtree_occurrence_owner_frame state root disposition timer.owner _ _ _ kept.1).trans valid.1,
      Eq.trans ?_ valid.2⟩
    congr 3
    apply List.filter_congr
    intro candidate candidateMember
    cases candidate <;> try rfl
    case awaitEventRace id origin input message deadline =>
      change (if !operationOwnedBy program _ timer.owner then false else _ && _ && after.eventRaces.any _) = _
      have races := cancelScopeSubtree_owner_race_frame state root disposition timer.owner
        (fun race => decide (race.id.elementId.value = origin.elementId.value) &&
          decide (race.timerOccurrenceId =
            { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation })) kept.1
      simp only [Bool.and_assoc] at races ⊢
      exact congrArg (fun present : Bool =>
        if !operationOwnedBy program (.awaitEventRace id origin input message deadline) timer.owner then false
        else deadline.elementId = timer.elementId && (deadline.output = timer.output && present)) races
    all_goals rw [cancelScopeSubtree_boundary_timer_operation_frame program state root disposition timer _ member]

end BpmnSemantics.SemanticProcess.InternalCommutation
