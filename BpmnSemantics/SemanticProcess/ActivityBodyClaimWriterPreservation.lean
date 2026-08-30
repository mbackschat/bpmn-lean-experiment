import BpmnSemantics.SemanticProcess.ActivityBodyTurnoverPreservation
import BpmnSemantics.SemanticProcess.ActivityDataInput
import BpmnSemantics.SemanticProcess.ActivityDataOutput
import BpmnSemantics.SemanticProcess.BoundedScopeArming
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
import BpmnSemantics.SemanticProcess.WaitActivation

/-! # Activity body-claim writer preservation

Shared preservation laws for production writers of `RuntimeState.activityOccurrences`. Writer
membership remains executable in the guarded census; this owner states why each non-structural write
shape preserves `AOO-CLAIM-01` without coupling the representation owner to its transition users.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Task definition wrappers are equal exactly when their stable values are equal. -/
theorem taskDefinitionId_eq_of_value {left right : TaskDefinitionId}
    (equal : left.value = right.value) : left = right := by
  cases left
  cases right
  simp_all

private theorem sameActivityOccurrence_comm (left right : ActivityOccurrence) :
    sameActivityOccurrence left right = sameActivityOccurrence right left := by
  simp only [sameActivityOccurrence]
  congr 1
  · congr 1 <;> exact decide_eq_decide.mpr eq_comm
  · exact decide_eq_decide.mpr eq_comm

private theorem sameActivityOccurrence_member_eq (state : RuntimeState)
    (target candidate : ActivityOccurrence)
    (identitiesUnique : activityIdentitiesUnique state = true)
    (targetMem : target ∈ state.activityOccurrences)
    (candidateMem : candidate ∈ state.activityOccurrences)
    (same : sameActivityOccurrence candidate target = true) : candidate = target := by
  have once := List.all_eq_true.mp identitiesUnique target targetMem
  simp only [occursOnce] at once
  have lengthOne := of_decide_eq_true once
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp lengthOne
  have targetFiltered : target ∈ state.activityOccurrences.filter (sameActivityOccurrence target) :=
    List.mem_filter.mpr ⟨targetMem, by simp [sameActivityOccurrence]⟩
  have candidateFiltered : candidate ∈
      state.activityOccurrences.filter (sameActivityOccurrence target) :=
    List.mem_filter.mpr ⟨candidateMem, by simpa [sameActivityOccurrence_comm] using same⟩
  have targetEq : target = only := by simpa [singleton] using targetFiltered
  have candidateEq : candidate = only := by simpa [singleton] using candidateFiltered
  exact candidateEq.trans targetEq.symm

private theorem activityIdentitySelectionAtMostOne (state : RuntimeState)
    (target : ActivityOccurrence) (identitiesUnique : activityIdentitiesUnique state = true)
    (targetMem : target ∈ state.activityOccurrences) :
    (state.activityOccurrences.filter fun candidate =>
      sameActivityOccurrence candidate target).length ≤ 1 := by
  have once := List.all_eq_true.mp identitiesUnique target targetMem
  simp only [occursOnce] at once
  have lengthOne := of_decide_eq_true once
  have selectionEq :
      (state.activityOccurrences.filter fun candidate =>
        sameActivityOccurrence candidate target) =
      state.activityOccurrences.filter (sameActivityOccurrence target) := by
    apply List.filter_congr
    intro candidate _
    exact sameActivityOccurrence_comm candidate target
  rw [selectionEq, lengthOne]
  omega

/-- The shared bounded and monitored User Task arming root inserts a task claim above the live-task
counter bound, so no existing live Activity record can already claim it. -/
theorem activateBoundedUserTask_preserves_activityBodyClaimsUnique (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryTimer : BoundaryTimerArm)
    (recordsOwn : activityRecordsOwnLiveWork state = true)
    (bounds : runtimeStateIdentityBound state = true)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique
      (activateBoundedUserTask state instanceId owner input task boundaryTimer).activityOccurrences =
      true := by
  let issuedRecord : ActivityOccurrence :=
    { processInstanceId := instanceId
      activityElementId := { value := task.id.value }
      activation := activityActivationCount state task.id + 1
      owner
      body := .userTask
        { processInstanceId := instanceId
          elementId := { value := task.id.value }
          activation := activationCount state task.id + 1 }
      attachedTimers :=
        [{ processInstanceId := instanceId
           elementId := { value := boundaryTimer.elementId.value }
           activation := timerActivationCount state boundaryTimer.elementId + 1 }] }
  have disjoint : state.activityOccurrences.all (activityBodyClaimsDisjoint issuedRecord) = true := by
    simp only [List.all_eq_true]
    intro existing existingMem
    apply activityBodyClaimsDisjoint_userTask_of_not_mem issuedRecord existing
      { processInstanceId := instanceId
        elementId := { value := task.id.value }
        activation := activationCount state task.id + 1 }
    intro claimed
    obtain ⟨candidate, candidateMem, names⟩ := activityBodyTaskClaim_has_live_wait state existing
      { processInstanceId := instanceId
        elementId := { value := task.id.value }
        activation := activationCount state task.id + 1 }
      recordsOwn existingMem claimed
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds
    have candidateBound := List.all_eq_true.mp bounds.1.1 candidate candidateMem
    simp only [decide_eq_true_eq] at candidateBound
    simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
    have taskEq : candidate.task.id = task.id :=
      taskDefinitionId_eq_of_value names.1.2.symm
    rw [taskEq] at candidateBound
    omega
  have preserved := activityBodyClaimsUnique_insertActivityOccurrence issuedRecord
    state.activityOccurrences disjoint claimsUnique
  simpa [activateBoundedUserTask, issuedRecord] using preserved

/-- Direct Activity data-input arming inserts a task claim above the live-task counter bound, so no
existing live Activity record can already claim it.

Separate from the bounded-task law rather than derived from it: this family attaches no handler, so
its record is a different term even though the body claim it inserts is the same. -/
theorem activateDataInputUserTask_preserves_activityBodyClaimsUnique
    {state after : RuntimeState} {instanceId : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (available : (dataInputSourceBinding? state directInput).isSome = true)
    (recordsOwn : activityRecordsOwnLiveWork state = true)
    (bounds : runtimeStateIdentityBound state = true)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true)
    (step : activateDataInputUserTask? state input output taskId taskName
      directInput = some after) :
    activityBodyClaimsUnique after.activityOccurrences = true := by
  have inserted := activateDataInputUserTask_activityOccurrences owned running available step
  have disjoint : state.activityOccurrences.all
      (activityBodyClaimsDisjoint (dataInputActivityRecord state instanceId owner taskId)) =
      true := by
    simp only [List.all_eq_true]
    intro existing existingMem
    apply activityBodyClaimsDisjoint_userTask_of_not_mem
      (dataInputActivityRecord state instanceId owner taskId) existing
      { processInstanceId := instanceId
        elementId := { value := taskId.value }
        activation := activationCount state taskId + 1 }
    intro claimed
    obtain ⟨candidate, candidateMem, names⟩ := activityBodyTaskClaim_has_live_wait state existing
      { processInstanceId := instanceId
        elementId := { value := taskId.value }
        activation := activationCount state taskId + 1 }
      recordsOwn existingMem claimed
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds
    have candidateBound := List.all_eq_true.mp bounds.1.1 candidate candidateMem
    simp only [decide_eq_true_eq] at candidateBound
    simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
    have taskEq : candidate.task.id = taskId :=
      taskDefinitionId_eq_of_value names.1.2.symm
    rw [taskEq] at candidateBound
    omega
  have preserved := activityBodyClaimsUnique_insertActivityOccurrence
    (dataInputActivityRecord state instanceId owner taskId) state.activityOccurrences disjoint
    claimsUnique
  simpa [inserted] using preserved

/-- Direct Activity data-output arming inserts a task claim above the live-task counter bound, so no
existing live Activity record can already claim it.

Separate from its input sibling rather than derived from it: the two mint the same body claim, but
this arm reaches it without a data premise, so a shared law would have to carry a hypothesis this
family never discharges. -/
theorem activateDataOutputUserTask_preserves_activityBodyClaimsUnique
    {state after : RuntimeState} {instanceId : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (recordsOwn : activityRecordsOwnLiveWork state = true)
    (bounds : runtimeStateIdentityBound state = true)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true)
    (step : activateDataOutputUserTask? state input output taskId taskName = some after) :
    activityBodyClaimsUnique after.activityOccurrences = true := by
  have inserted := activateDataOutputUserTask_activityOccurrences owned running step
  have disjoint : state.activityOccurrences.all
      (activityBodyClaimsDisjoint (dataOutputActivityRecord state instanceId owner taskId)) =
      true := by
    simp only [List.all_eq_true]
    intro existing existingMem
    apply activityBodyClaimsDisjoint_userTask_of_not_mem
      (dataOutputActivityRecord state instanceId owner taskId) existing
      { processInstanceId := instanceId
        elementId := { value := taskId.value }
        activation := activationCount state taskId + 1 }
    intro claimed
    obtain ⟨candidate, candidateMem, names⟩ := activityBodyTaskClaim_has_live_wait state existing
      { processInstanceId := instanceId
        elementId := { value := taskId.value }
        activation := activationCount state taskId + 1 }
      recordsOwn existingMem claimed
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds
    have candidateBound := List.all_eq_true.mp bounds.1.1 candidate candidateMem
    simp only [decide_eq_true_eq] at candidateBound
    simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
    have taskEq : candidate.task.id = taskId :=
      taskDefinitionId_eq_of_value names.1.2.symm
    rw [taskEq] at candidateBound
    omega
  have preserved := activityBodyClaimsUnique_insertActivityOccurrence
    (dataOutputActivityRecord state instanceId owner taskId) state.activityOccurrences disjoint
    claimsUnique
  simpa [inserted] using preserved

/-- The Sub-Process deadline writer preserves uniqueness once the preceding scope-entry proof has
established that its newly issued child is absent from every existing scope claim. -/
theorem armScopeDeadline_preserves_activityBodyClaimsUnique (state : RuntimeState)
    (owner : ScopeOccurrenceId) (childScopeId : DefinitionScopeId)
    (child : ScopeOccurrenceId) (boundaryTimer : BoundaryTimerArm)
    (freshChild : ∀ record ∈ state.activityOccurrences,
      child ∉ activityBodyScopeClaims record.body)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique
      (armScopeDeadline state owner childScopeId child boundaryTimer).activityOccurrences = true := by
  let issuedRecord : ActivityOccurrence :=
    { processInstanceId := owner.processInstanceId
      activityElementId := { value := childScopeId.value }
      activation := activityActivationCount state { value := childScopeId.value } + 1
      owner
      body := .childScope child
      attachedTimers :=
        [{ processInstanceId := owner.processInstanceId
           elementId := { value := boundaryTimer.elementId.value }
           activation := timerActivationCount state boundaryTimer.elementId + 1 }] }
  have disjoint : state.activityOccurrences.all (activityBodyClaimsDisjoint issuedRecord) = true := by
    simp only [List.all_eq_true]
    intro existing existingMem
    exact activityBodyClaimsDisjoint_childScope_of_not_mem issuedRecord existing child
      (freshChild existing existingMem)
  have preserved := activityBodyClaimsUnique_insertActivityOccurrence issuedRecord
    state.activityOccurrences disjoint claimsUnique
  simpa [armScopeDeadline, issuedRecord] using preserved

private theorem enterScopeState_success_preserves_activities_and_excludes_definition
    (before entered : RuntimeState) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId)
    (success : enterScopeState? before input childEntry childScopeId = some entered) :
    entered.activityOccurrences = before.activityOccurrences ∧
      before.scopeOccurrences.any (fun occurrence =>
        occurrence.id.definitionScopeId == childScopeId) = false := by
  unfold enterScopeState? at success
  cases owned : onlyTokenOwner? before input with
  | none => simp [owned] at success
  | some parent =>
      cases running : before.control with
      | notStarted => simp [owned, running] at success
      | completed instanceId => simp [owned, running] at success
      | cancelled instanceId => simp [owned, running] at success
      | running instanceId =>
          simp [owned, running] at success
          obtain ⟨admitted, enteredEq⟩ := success
          subst entered
          refine ⟨rfl, ?_⟩
          apply Bool.eq_false_iff.mpr
          intro anyPrior
          rw [List.any_eq_true] at anyPrior
          obtain ⟨occurrence, occurrenceMem, sameDefinition⟩ := anyPrior
          simp only [beq_iff_eq] at sameDefinition
          exact admitted.2 occurrence occurrenceMem sameDefinition

private theorem selectedBoundedChild_has_definition (entered : RuntimeState)
    (parent child : ScopeOccurrenceId) (childScopeId : DefinitionScopeId)
    (selected :
      (entered.scopeOccurrences.find? fun occurrence =>
        decide (occurrence.id.definitionScopeId = childScopeId) &&
          decide (occurrence.parent = some parent)).map (·.id) = some child) :
    child.definitionScopeId = childScopeId := by
  cases found : (entered.scopeOccurrences.find? fun occurrence =>
      decide (occurrence.id.definitionScopeId = childScopeId) &&
        decide (occurrence.parent = some parent)) with
  | none => simp [found] at selected
  | some occurrence =>
      have matched := List.find?_some found
      simp only [Bool.and_eq_true, decide_eq_true_eq] at matched
      simp [found] at selected
      cases selected
      exact matched.1

private theorem activityBodyScopeClaim_is_live (state : RuntimeState)
    (record : ActivityOccurrence) (child : ScopeOccurrenceId)
    (recordsOwn : activityRecordsOwnLiveWork state = true)
    (recordMem : record ∈ state.activityOccurrences)
    (claimed : child ∈ activityBodyScopeClaims record.body) :
    exactLiveOccurrence state child = true := by
  have owned := List.all_eq_true.mp recordsOwn record recordMem
  simp only [Bool.and_eq_true] at owned
  have bodyLive := owned.1
  cases bodyEq : record.body with
  | userTask task => simp [bodyEq, activityBodyScopeClaims] at claimed
  | parallelUserTasks first rest => simp [bodyEq, activityBodyScopeClaims] at claimed
  | childScope scope =>
      simp [bodyEq, activityBodyScopeClaims] at claimed
      subst child
      simpa [activityBodyLive, bodyEq] using bodyLive

/-- Successful bounded Sub-Process arming preserves body-claim uniqueness through the real atomic
entry-and-deadline path. Scope entry excludes the selected child's definition from the pre-state,
while body liveness makes every prior child-scope claim resolve to a pre-state occurrence. -/
theorem armBoundedScopeState_preserves_activityBodyClaimsUnique (before after : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (boundaryTimer : BoundaryTimerArm)
    (success : armBoundedScopeState? before input childEntry childScopeId boundaryTimer = some after)
    (recordsOwn : activityRecordsOwnLiveWork before = true)
    (claimsUnique : activityBodyClaimsUnique before.activityOccurrences = true) :
    activityBodyClaimsUnique after.activityOccurrences = true := by
  unfold armBoundedScopeState? at success
  cases owned : onlyTokenOwner? before input with
  | none => simp [owned] at success
  | some parent =>
      cases entry : enterScopeState? before input childEntry childScopeId with
      | none => simp [owned, entry] at success
      | some entered =>
          cases selected :
              (entered.scopeOccurrences.find? fun occurrence =>
                decide (occurrence.id.definitionScopeId = childScopeId) &&
                  decide (occurrence.parent = some parent)).map (·.id) with
          | none => simp [owned, entry, selected] at success
          | some child =>
              simp [owned, entry, selected] at success
              cases success
              obtain ⟨activitiesFrame, noPriorDefinition⟩ :=
                enterScopeState_success_preserves_activities_and_excludes_definition before entered
                  input childEntry childScopeId entry
              have childDefinition : child.definitionScopeId = childScopeId :=
                selectedBoundedChild_has_definition entered parent child childScopeId selected
              apply armScopeDeadline_preserves_activityBodyClaimsUnique
              · intro record recordMem claimed
                rw [activitiesFrame] at recordMem
                have childLive := activityBodyScopeClaim_is_live before record child recordsOwn
                  recordMem claimed
                unfold exactLiveOccurrence at childLive
                simp only [decide_eq_true_eq] at childLive
                obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp childLive
                have occurrenceFiltered : occurrence ∈
                    before.scopeOccurrences.filter (fun candidate =>
                      decide (candidate.id = child)) := by
                  rw [singleton]
                  exact List.mem_cons_self
                obtain ⟨occurrenceMem, occurrenceId⟩ := List.mem_filter.mp occurrenceFiltered
                have occurrenceEq : occurrence.id = child := by
                  simpa only [decide_eq_true_eq] using occurrenceId
                have priorDefinition : before.scopeOccurrences.any (fun candidate =>
                    candidate.id.definitionScopeId == childScopeId) = true := by
                  rw [List.any_eq_true]
                  refine ⟨occurrence, occurrenceMem, ?_⟩
                  simp only [beq_iff_eq]
                  exact (congrArg ScopeOccurrenceId.definitionScopeId occurrenceEq).trans
                    childDefinition
                rw [noPriorDefinition] at priorDefinition
                contradiction
              · rw [activitiesFrame]
                exact claimsUnique

/-- A multi-task insertion preserves uniqueness when all inserted children share a task definition
that had no live wait before insertion. Body liveness then rules out a prior exact claim. -/
theorem insertParallelUserTaskActivity_preserves_activityBodyClaimsUnique (state : RuntimeState)
    (record : ActivityOccurrence) (first : UserTaskInstanceId)
    (rest : List UserTaskInstanceId) (taskId : TaskDefinitionId)
    (taskElements : ∀ task ∈ first :: rest, task.elementId.value = taskId.value)
    (taskWaitAbsent : state.waits.any (fun wait => wait.task.id == taskId) = false)
    (recordsOwn : activityRecordsOwnLiveWork state = true)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique
      (insertActivityOccurrence { record with body := .parallelUserTasks first rest }
        state.activityOccurrences) = true := by
  apply activityBodyClaimsUnique_insertActivityOccurrence
  · simp only [List.all_eq_true]
    intro existing existingMem
    apply activityBodyClaimsDisjoint_parallel_of_forall_not_mem record existing first rest
    intro task taskMem claimed
    obtain ⟨candidate, candidateMem, names⟩ :=
      activityBodyTaskClaim_has_live_wait state existing task recordsOwn existingMem claimed
    have forbidden : state.waits.any (fun wait => wait.task.id == taskId) = true := by
      rw [List.any_eq_true]
      refine ⟨candidate, candidateMem, ?_⟩
      simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
      have sameTaskDefinition : candidate.task.id = taskId :=
        taskDefinitionId_eq_of_value (names.1.2.symm.trans (taskElements task taskMem))
      simp [sameTaskDefinition]
    rw [taskWaitAbsent] at forbidden
    contradiction
  · exact claimsUnique

/-- Removing one or more members from a selected parallel body preserves claim uniqueness. Exact
Activity identity uniqueness ensures the body rewrite selects at most one record. -/
theorem replaceParallelRecordBody_preserves_activityBodyClaimsUnique (state : RuntimeState)
    (record : ActivityOccurrence) (first : UserTaskInstanceId)
    (rest : List UserTaskInstanceId)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true)
    (identitiesUnique : activityIdentitiesUnique state = true)
    (recordMem : record ∈ state.activityOccurrences)
    (subset : ∀ task ∈ first :: rest, task ∈ activityBodyTaskClaims record.body) :
    activityBodyClaimsUnique
      (replaceParallelRecordBody state.activityOccurrences record (first :: rest)) = true := by
  have atMostOne := activityIdentitySelectionAtMostOne state record identitiesUnique recordMem
  simp only [replaceParallelRecordBody]
  apply activityBodyClaimsUnique_map_selected state.activityOccurrences
    (fun candidate => sameActivityOccurrence candidate record)
    (fun candidate =>
      if sameActivityOccurrence candidate record then
        { candidate with body := .parallelUserTasks first rest }
      else candidate) claimsUnique atMostOne
  · intro candidate notSelected
    simp [notSelected]
  · intro chosen chosenMem other otherMem chosenSelected otherUnselected
    have chosenEq := sameActivityOccurrence_member_eq state record chosen identitiesUnique
      recordMem chosenMem chosenSelected
    subst chosen
    have different : record ≠ other := by
      intro equal
      subst other
      simp [sameActivityOccurrence] at otherUnselected
    have disjoint := activityBodyClaimsUnique_pair claimsUnique recordMem otherMem different
    simpa [chosenSelected] using
      activityBodyClaimsDisjoint_parallel_of_subset record other first rest subset disjoint

end BpmnSemantics.SemanticProcess
