import BpmnSemantics.SemanticProcess.ParallelMultiInstanceProgramBindingProgress

/-! # Parallel Multi-Instance progress runtime-state preservation

Completing one child while siblings remain atomically withdraws that child's wait, narrows the
owning Activity body to the remaining children, and replaces the sole controller with its progressed
slot array. This module proves that exact rewrite preserves the complete production runtime-state
invariant.

Scope boundary: the `.progresses` completion arm only. Terminal closure, Timer interruption,
evaluator lifting, host behavior, and any change to the semantic account remain downstream.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def parallelWaitTaskId (wait : UserTaskWait) : UserTaskInstanceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.task.id.value⟩
    activation := wait.activation }

private theorem pending_after_progress_subset_and_ne
    (slots : List ParallelMultiInstanceSlot) (target : UserTaskInstanceId) (result : String) :
    ∀ task ∈ pendingParallelTaskIds (replacePendingParallelSlot slots target result),
      task ∈ pendingParallelTaskIds slots ∧ task ≠ target := by
  induction slots with
  | nil => simp [replacePendingParallelSlot, pendingParallelTaskIds]
  | cons slot rest ih =>
      intro task member
      cases slot with
      | pending slotTask =>
          by_cases hit : slotTask = target
          · subst slotTask
            simp only [replacePendingParallelSlot, List.map_cons, completeParallelSlot] at member
            have tail := ih task member
            exact ⟨List.mem_cons_of_mem target tail.1, tail.2⟩
          · simp only [replacePendingParallelSlot, List.map_cons, completeParallelSlot,
              if_neg hit, pendingParallelTaskIds, List.mem_cons] at member
            rcases member with rfl | tail
            · exact ⟨List.mem_cons_self, hit⟩
            · have tailFacts := ih task tail
              exact ⟨List.mem_cons_of_mem slotTask tailFacts.1, tailFacts.2⟩
      | completed slotTask priorResult =>
          simp only [replacePendingParallelSlot, List.map_cons, completeParallelSlot,
            pendingParallelTaskIds] at member
          have tail := ih task member
          exact tail

private theorem parallelBodyClaims_eq {record : ActivityOccurrence}
    {tasks : List UserTaskInstanceId}
    (body : activityBodyParallelTasks? record = some tasks) :
    activityBodyTaskClaims record.body = tasks := by
  cases shape : record.body with
  | userTask => simp [activityBodyParallelTasks?, shape] at body
  | childScope => simp [activityBodyParallelTasks?, shape] at body
  | parallelUserTasks first rest =>
      simp only [activityBodyParallelTasks?, shape, Option.some.injEq] at body
      simpa [activityBodyTaskClaims, shape] using body

private theorem replaceParallelRecordBody_map_of_frame {keyType : Type}
    (key : ActivityOccurrence → keyType)
    (frame : ∀ candidate first rest,
      key { candidate with body := .parallelUserTasks first rest } = key candidate)
    (records : List ActivityOccurrence) (record : ActivityOccurrence)
    (first : UserTaskInstanceId) (rest : List UserTaskInstanceId) :
    (replaceParallelRecordBody records record (first :: rest)).map key = records.map key := by
  simp only [replaceParallelRecordBody, List.map_map]
  apply List.map_congr_left
  intro candidate _
  by_cases selected : sameActivityOccurrence candidate record = true
  · simp [selected, frame]
  · simp only [Bool.not_eq_true] at selected
    simp [selected]

private theorem sameActivityOccurrence_member_eq (state : RuntimeState)
    (target candidate : ActivityOccurrence)
    (identitiesUnique : activityIdentitiesUnique state = true)
    (targetMember : target ∈ state.activityOccurrences)
    (candidateMember : candidate ∈ state.activityOccurrences)
    (same : sameActivityOccurrence candidate target = true) : candidate = target := by
  have once := List.all_eq_true.mp identitiesUnique target targetMember
  simp only [occursOnce] at once
  have targetFiltered : target ∈
      state.activityOccurrences.filter (sameActivityOccurrence target) :=
    List.mem_filter.mpr ⟨targetMember, by simp [sameActivityOccurrence]⟩
  have candidateFiltered : candidate ∈
      state.activityOccurrences.filter (sameActivityOccurrence target) :=
    List.mem_filter.mpr ⟨candidateMember, by
      have comm : sameActivityOccurrence target candidate =
          sameActivityOccurrence candidate target := by
        apply Bool.eq_iff_iff.mpr
        simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq]
        constructor
        · rintro ⟨⟨process, activity⟩, activation⟩
          exact ⟨⟨process.symm, activity.symm⟩, activation.symm⟩
        · rintro ⟨⟨process, activity⟩, activation⟩
          exact ⟨⟨process.symm, activity.symm⟩, activation.symm⟩
      rw [comm]
      exact same⟩
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true once)
  have targetEq : target = only := by simpa [singleton] using targetFiltered
  have candidateEq : candidate = only := by simpa [singleton] using candidateFiltered
  exact candidateEq.trans targetEq.symm

private theorem all_occursOnce_filter (same : α → α → Bool)
    (self : ∀ value, same value value = true) (values : List α) (keep : α → Bool)
    (unique : values.all (occursOnce same values) = true) :
    (values.filter keep).all (occursOnce same (values.filter keep)) = true := by
  simp only [List.all_eq_true] at unique ⊢
  intro value member
  have originalMember : value ∈ values := (List.mem_filter.mp member).1
  have original := unique value originalMember
  simp only [occursOnce, decide_eq_true_eq] at original ⊢
  have sublist : List.Sublist
      ((values.filter keep).filter (same value))
      (values.filter (same value)) := by
    apply List.Sublist.trans (l₂ := (values.filter (same value)).filter keep)
    · simp [List.filter_filter, Bool.and_comm]
    · exact List.filter_sublist
  have positive : 0 < ((values.filter keep).filter (same value)).length := by
    apply List.length_pos_of_mem
    exact List.mem_filter.mpr ⟨member, self value⟩
  have upper := sublist.length_le
  rw [original] at upper
  exact Nat.le_antisymm upper positive

private theorem removeParallelChildWaits_lookup_of_ne (waits : List UserTaskWait)
    (target task : UserTaskInstanceId) (different : task ≠ target) :
    (removeParallelChildWaits waits [target]).filter (taskIdNamesWait task) =
      waits.filter (taskIdNamesWait task) := by
  simp only [removeParallelChildWaits, List.filter_filter]
  apply List.filter_congr
  intro wait _
  by_cases names : taskIdNamesWait task wait = true
  · have waitId : parallelWaitTaskId wait = task := by
      simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
      rcases task with ⟨process, ⟨element⟩, activation⟩
      rcases wait with ⟨waitProcess, owner, waitTask, waitActivation, output, metadata⟩
      simp only [parallelWaitTaskId] at names ⊢
      cases names.1.1
      cases names.1.2
      cases names.2
      rfl
    have notTarget : parallelWaitTaskId wait ≠ target := by
      intro equal
      apply different
      exact waitId.symm.trans equal
    have notTarget' :
        (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ :
          UserTaskInstanceId) ≠ target := notTarget
    simp [names, notTarget']
  · simp only [Bool.not_eq_true] at names
    simp [names]

private def activityOrderKey (record : ActivityOccurrence) : String × String × Nat :=
  (record.processInstanceId.value, record.activityElementId.value, record.activation)

private def activityOrderKeyBefore (left right : String × String × Nat) : Bool :=
  if left.1 ≠ right.1 then left.1 < right.1
  else if left.2.1 ≠ right.2.1 then left.2.1 < right.2.1
  else left.2.2 < right.2.2

private theorem activityBodyWaitFilter_eq (waits : List UserTaskWait)
    (task : UserTaskInstanceId) :
    waits.filter (taskIdNamesWait task) =
      waits.filter (fun wait =>
        decide (wait.processInstanceId = task.processInstanceId) &&
          decide (wait.task.id.value = task.elementId.value) &&
          decide (wait.activation = task.activation)) := by
  apply List.filter_congr
  intro wait _
  apply Bool.eq_iff_iff.mpr
  simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]
  constructor
  · rintro ⟨⟨process, element⟩, activation⟩
    exact ⟨⟨process.symm, element.symm⟩, activation.symm⟩
  · rintro ⟨⟨process, element⟩, activation⟩
    exact ⟨⟨process.symm, element.symm⟩, activation.symm⟩

/-- Completing one child while pending siblings remain preserves the complete production invariant. -/
theorem sharedParallelProgress_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId instanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before : RuntimeState) (taskId : UserTaskInstanceId)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (result : String) (firstPending : UserTaskInstanceId)
    (restPending : List UserTaskInstanceId)
    (running : before.control = .running instanceId)
    (selectedController : parallelControllerForTask? arm before taskId = some controller)
    (selectedRecord : parallelControllerRecord? before controller = some record)
    (regionValid : parallelRegionValid arm before controller record = true)
    (pending : pendingParallelTaskIds
      (replacePendingParallelSlot controller.slots taskId result) =
        firstPending :: restPending)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId
      { before with
        waits := removeParallelChildWaits before.waits [taskId]
        activityOccurrences := replaceParallelRecordBody before.activityOccurrences record
          (firstPending :: restPending)
        parallelMultiInstanceControllers := insertParallelMultiInstanceController
          { controller with slots := replacePendingParallelSlot controller.slots taskId result }
          (removeParallelController before.parallelMultiInstanceControllers controller) } = true := by
  let after : RuntimeState :=
    { before with
      waits := removeParallelChildWaits before.waits [taskId]
      activityOccurrences := replaceParallelRecordBody before.activityOccurrences record
        (firstPending :: restPending)
      parallelMultiInstanceControllers := insertParallelMultiInstanceController
        { controller with slots := replacePendingParallelSlot controller.slots taskId result }
        (removeParallelController before.parallelMultiInstanceControllers controller) }
  change runtimeStateWellFormed program expectedInstanceId after = true
  have selection := completionClosingSelectionFacts program expectedInstanceId instanceId arm
    ownerScope account before taskId controller record running selectedController selectedRecord
    regionValid wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
  obtain ⟨existing, claims, retention⟩ := wellFormed
  obtain ⟨h17, _lifecycle⟩ := existing
  obtain ⟨h16, _notExhausted⟩ := h17
  obtain ⟨h15, _controllerIds⟩ := h16
  obtain ⟨h14, parallelBindings⟩ := h15
  obtain ⟨h13, sequentialBindings⟩ := h14
  obtain ⟨h12, _controllers⟩ := h13
  obtain ⟨h11, activityIds⟩ := h12
  obtain ⟨h10, messagesUnambiguous⟩ := h11
  obtain ⟨h9, timersUnambiguous⟩ := h10
  obtain ⟨h8, bodies⟩ := h9
  obtain ⟨h7, order⟩ := h8
  obtain ⟨h6, hidden⟩ := h7
  obtain ⟨h5, declarations⟩ := h6
  obtain ⟨h4, bounds⟩ := h5
  obtain ⟨h3, identities⟩ := h4
  obtain ⟨h2, owners⟩ := h3
  obtain ⟨h1, incidents⟩ := h2
  obtain ⟨position, races⟩ := h1
  have oldBody : activityBodyParallelTasks? record =
      some (pendingParallelTaskIds controller.slots) := by
    have region := selection.region
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
    simpa only [beq_iff_eq] using region5.2
  have oldClaims : activityBodyTaskClaims record.body =
      pendingParallelTaskIds controller.slots := parallelBodyClaims_eq oldBody
  have pendingFacts : ∀ task ∈ firstPending :: restPending,
      task ∈ pendingParallelTaskIds controller.slots ∧ task ≠ taskId := by
    intro task member
    apply pending_after_progress_subset_and_ne controller.slots taskId result task
    rw [pending]
    exact member
  have remainingClaims : ∀ task ∈ firstPending :: restPending,
      task ∈ activityBodyTaskClaims record.body := by
    intro task member
    rw [oldClaims]
    exact (pendingFacts task member).1
  have targetClaim : taskId ∈ activityBodyTaskClaims record.body := by
    rw [oldClaims]
    exact selection.taskMember
  have recordLive := List.all_eq_true.mp bodies record selection.recordMember
  simp only [Bool.and_eq_true] at recordLive
  have selectedBodyLive : activityBodyLive after
      { record with body := .parallelUserTasks firstPending restPending } = true := by
    simp only [activityBodyLive, List.all_eq_true, decide_eq_true_eq]
    intro task member
    have oldCount : (before.waits.filter (taskIdNamesWait task)).length = 1 := by
      cases shape : record.body with
      | userTask oldTask => simp [activityBodyParallelTasks?, shape] at oldBody
      | childScope oldScope => simp [activityBodyParallelTasks?, shape] at oldBody
      | parallelUserTasks oldFirst oldRest =>
          simp only [activityBodyLive, shape, List.all_eq_true, decide_eq_true_eq] at recordLive
          have oldList : oldFirst :: oldRest = pendingParallelTaskIds controller.slots := by
            simpa [activityBodyParallelTasks?, shape] using oldBody
          have oldCount := recordLive.1.1 task
            (by rw [oldList]; exact (pendingFacts task member).1)
          rw [activityBodyWaitFilter_eq before.waits task]
          exact oldCount
    rw [← activityBodyWaitFilter_eq after.waits task]
    change ((removeParallelChildWaits before.waits [taskId]).filter
        (taskIdNamesWait task)).length = 1
    rw [removeParallelChildWaits_lookup_of_ne before.waits taskId task
      (pendingFacts task member).2]
    exact oldCount
  have selectedLive : activityBodyLive after
        { record with body := .parallelUserTasks firstPending restPending } &&
      record.timerHandlerOccurrences.all (fun timer =>
        after.timerWaits.any fun wait =>
          timerIdNamesWait timer wait &&
            decide (wait.owner = record.owner)) &&
      record.messageHandlerOccurrences.all (fun message =>
        after.messageWaits.any fun wait =>
          messageIdNamesWait message wait &&
            decide (wait.owner = record.owner)) = true := by
    simp only [Bool.and_eq_true]
    exact ⟨⟨selectedBodyLive, by simpa [after] using recordLive.1.2⟩,
      by simpa [after] using recordLive.2⟩
  have bodiesAfter : activityRecordsOwnLiveWork after = true := by
    simp only [activityRecordsOwnLiveWork, List.all_eq_true]
    intro candidate member
    change candidate ∈ replaceParallelRecordBody before.activityOccurrences record
      (firstPending :: restPending) at member
    simp only [replaceParallelRecordBody, List.mem_map] at member
    obtain ⟨original, originalMember, rfl⟩ := member
    by_cases selected : sameActivityOccurrence original record = true
    · have originalEq := sameActivityOccurrence_member_eq before record original activityIds
          selection.recordMember originalMember selected
      subst original
      simpa [selected, ActivityOccurrence.timerHandlerOccurrences,
        ActivityOccurrence.messageHandlerOccurrences] using selectedLive
    · simp only [Bool.not_eq_true] at selected
      have prior := List.all_eq_true.mp bodies original originalMember
      simp only [Bool.and_eq_true] at prior
      have different : original ≠ record := by
        intro equal
        subst original
        simp [sameActivityOccurrence] at selected
      have disjoint := activityBodyClaimsUnique_pair claims originalMember
        selection.recordMember different
      have excludesTarget : ∀ task ∈ activityBodyTaskClaims original.body, task ≠ taskId := by
        intro task taskMember same
        subst task
        exact False.elim
          (activityBodyClaimsDisjoint_no_shared_task disjoint taskMember targetClaim)
      have bodyAfter : activityBodyLive after original = true := by
        cases shape : original.body with
        | childScope scope =>
            simp only [activityBodyLive, shape]
            change exactLiveOccurrence before scope = true
            simpa [activityBodyLive, shape] using prior.1.1
        | userTask task =>
            simp only [activityBodyTaskClaims, shape, List.mem_singleton] at excludesTarget
            have priorBody := prior.1.1
            simp only [activityBodyLive, shape, decide_eq_true_eq] at priorBody
            simp only [activityBodyLive, shape, decide_eq_true_eq]
            rw [← activityBodyWaitFilter_eq after.waits task]
            change ((removeParallelChildWaits before.waits [taskId]).filter
              (taskIdNamesWait task)).length = 1
            rw [removeParallelChildWaits_lookup_of_ne before.waits taskId task
              (excludesTarget task (by simp))]
            rw [activityBodyWaitFilter_eq before.waits task]
            exact priorBody
        | parallelUserTasks first rest =>
            simp only [activityBodyLive, shape, List.all_eq_true, decide_eq_true_eq] at prior ⊢
            intro task taskMember
            rw [← activityBodyWaitFilter_eq after.waits task]
            change ((removeParallelChildWaits before.waits [taskId]).filter
              (taskIdNamesWait task)).length = 1
            rw [removeParallelChildWaits_lookup_of_ne before.waits taskId task
              (excludesTarget task (by simpa [activityBodyTaskClaims, shape] using taskMember))]
            rw [activityBodyWaitFilter_eq before.waits task]
            exact prior.1.1 task taskMember
      simp [selected, bodyAfter, after, prior.1.2, prior.2]
  have positionAfter : runtimePositionValid program expectedInstanceId after = true := by
    change runtimePositionValid program expectedInstanceId before = true
    exact position
  have racesAfter : eventRaceAssociationsValid after = true := by
    simpa [after, eventRaceAssociationsValid] using races
  have incidentsAfter : effectIncidentAssociationsValid after = true := by
    simpa [after, effectIncidentAssociationsValid, effectIncidentAssociationValid,
      effectWaitOwnerAssociationValid] using incidents
  have ownersAfter : waitOwnersLive after = true := by
    have liveFrame (id : ScopeOccurrenceId) :
        exactLiveOccurrence after id = exactLiveOccurrence before id := by
      simp [after, exactLiveOccurrence]
    simp only [waitOwnersLive, Bool.and_eq_true] at owners ⊢
    obtain ⟨⟨⟨⟨⟨⟨⟨⟨taskOwners, messageOwners⟩, timerOwners⟩, effectOwners⟩,
      incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩,
      activityOwners⟩ := owners
    refine ⟨⟨⟨⟨⟨⟨⟨⟨?_, by simpa only [liveFrame] using messageOwners⟩,
      by simpa only [liveFrame] using timerOwners⟩,
      by simpa only [liveFrame] using effectOwners⟩,
      by simpa only [liveFrame] using incidentOwners⟩,
      by simpa only [liveFrame] using selectionOwners⟩,
      by simpa only [liveFrame] using raceOwners⟩,
      by simpa only [liveFrame] using callOwners⟩, ?_⟩
    · change (removeParallelChildWaits before.waits [taskId]).all
        (fun wait => exactLiveOccurrence before wait.owner) = true
      exact all_filter _ _ _ taskOwners
    · simp only [liveFrame]
      change (replaceParallelRecordBody before.activityOccurrences record
        (firstPending :: restPending)).all
          (fun candidate => exactLiveOccurrence before candidate.owner) = true
      have preserved := all_of_map_eq
        (fun candidate => candidate.owner)
        (fun candidate => exactLiveOccurrence before candidate.owner)
        (fun owner => exactLiveOccurrence before owner) (fun _ => rfl)
        (replaceParallelRecordBody before.activityOccurrences record
          (firstPending :: restPending)) before.activityOccurrences
        (replaceParallelRecordBody_map_of_frame (fun candidate => candidate.owner)
          (fun _ _ _ => rfl) _ _ _ _)
      rw [preserved]
      exact activityOwners
  have identitiesAfter : waitIdentitiesUnique after = true := by
    simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities ⊢
    obtain ⟨⟨⟨taskIdentities, messageIdentities⟩, timerIdentities⟩,
      effectIdentities⟩ := identities
    exact ⟨⟨⟨all_occursOnce_filter userTaskWaitKeyMatches
      (fun wait => by simp [userTaskWaitKeyMatches]) before.waits _ taskIdentities,
      by simpa [after] using messageIdentities⟩, by simpa [after] using timerIdentities⟩,
      by simpa [after] using effectIdentities⟩
  have boundsAfter : runtimeStateIdentityBound after = true := by
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds ⊢
    obtain ⟨⟨taskBounds, timerBounds⟩, activityBounds⟩ := bounds
    refine ⟨⟨?_, ?_⟩, ?_⟩
    · change (removeParallelChildWaits before.waits [taskId]).all
        (fun wait => decide (wait.activation ≤ activationCount before wait.task.id)) = true
      exact all_filter _ _ _ taskBounds
    · change before.timerWaits.all (fun wait =>
        decide (wait.activation ≤ timerActivationCount before wait.elementId)) = true
      exact timerBounds
    · change (replaceParallelRecordBody before.activityOccurrences record
        (firstPending :: restPending)).all (fun candidate =>
          decide (candidate.activation ≤ activityActivationCount before
            { value := candidate.activityElementId.value })) = true
      have preserved := all_of_map_eq
        (fun candidate => (candidate.activityElementId, candidate.activation))
        (fun candidate => decide (candidate.activation ≤ activityActivationCount before
          { value := candidate.activityElementId.value }))
        (fun key => decide (key.2 ≤ activityActivationCount before { value := key.1.value }))
        (fun _ => rfl)
        (replaceParallelRecordBody before.activityOccurrences record
          (firstPending :: restPending)) before.activityOccurrences
        (replaceParallelRecordBody_map_of_frame
          (fun candidate => (candidate.activityElementId, candidate.activation))
          (fun _ _ _ => rfl) _ _ _ _)
      rw [preserved]
      exact activityBounds
  have declarationsAfter : waitDeclarationsValid program expectedInstanceId after = true := by
    simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations ⊢
    obtain ⟨⟨⟨⟨taskDeclarations, messageDeclarations⟩, timerDeclarations⟩,
      effectDeclarations⟩, incidentDeclarations⟩ := declarations
    refine ⟨⟨⟨⟨?_, by simpa [after] using messageDeclarations⟩,
      by simpa [after] using timerDeclarations⟩,
      by simpa [after] using effectDeclarations⟩,
      by simpa [after] using incidentDeclarations⟩
    rw [List.all_eq_true] at taskDeclarations ⊢
    intro wait member
    obtain ⟨afterMember, expected⟩ := List.mem_filter.mp member
    have beforeMember : wait ∈ before.waits := by
      change wait ∈ removeParallelChildWaits before.waits [taskId] at afterMember
      exact (List.mem_filter.mp afterMember).1
    exact taskDeclarations wait (List.mem_filter.mpr ⟨beforeMember, expected⟩)
  have hiddenAfter : hiddenRecordDeclarationsValid program after = true := by
    simpa [after, hiddenRecordDeclarationsValid] using hidden
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at order
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨taskOrder, activationOrder⟩, messageWaitOrder⟩,
    timerWaitOrder⟩, effectWaitOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
    effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
    callOrder⟩, activityOrder⟩, sequentialControllerOrder⟩, _parallelControllerOrder⟩ := order
  have orderAfter : canonicalCollectionOrder after = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true]
    refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨?_, activationOrder⟩, messageWaitOrder⟩,
      timerWaitOrder⟩, effectWaitOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
      effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
      callOrder⟩, ?_⟩, sequentialControllerOrder⟩, ?_⟩
    · change orderedBy userTaskWaitBefore
        (removeParallelChildWaits before.waits [taskId]) = true
      exact orderedBy_filter userTaskWaitBefore_compose _ before.waits taskOrder
    · change orderedBy activityOccurrenceBefore
        (replaceParallelRecordBody before.activityOccurrences record
          (firstPending :: restPending)) = true
      have preserved := orderedBy_of_map_eq activityOrderKey activityOccurrenceBefore
        activityOrderKeyBefore (fun _ _ => rfl)
        (replaceParallelRecordBody before.activityOccurrences record
          (firstPending :: restPending)) before.activityOccurrences
        (replaceParallelRecordBody_map_of_frame activityOrderKey
          (fun _ _ _ => rfl) _ _ _ _)
      rw [preserved]
      exact activityOrder
    · simp [after, selection.controllersSingleton, removeParallelController,
        insertParallelMultiInstanceController, parallelMultiInstanceControllersOrdered]
  have attachedAfter : attachedTimersUnambiguous after = true := by
    simp only [attachedTimersUnambiguous, List.all_eq_true] at timersUnambiguous ⊢
    intro wait member
    have prior := timersUnambiguous wait (by simpa [after] using member)
    simp only [← List.countP_eq_length_filter] at prior ⊢
    have mapped := replaceParallelRecordBody_map_of_frame
      (fun candidate => anyTimerIdNamesWait candidate.timerHandlerOccurrences wait)
      (fun _ _ _ => rfl) before.activityOccurrences record firstPending restPending
    have counts := congrArg (List.countP id) mapped
    have countEq :
        (replaceParallelRecordBody before.activityOccurrences record
          (firstPending :: restPending)).countP
            (anyTimerIdNamesWait ·.timerHandlerOccurrences wait) =
          before.activityOccurrences.countP
            (anyTimerIdNamesWait ·.timerHandlerOccurrences wait) := by
      simpa [List.countP_map] using counts
    rw [countEq]
    exact prior
  have messagesUnambiguousAfter : attachedMessagesUnambiguous after = true := by
    have handlers : after.activityOccurrences.map (fun candidate =>
          candidate.messageHandlerOccurrences) =
        before.activityOccurrences.map (fun candidate => candidate.messageHandlerOccurrences) := by
      simpa [after] using replaceParallelRecordBody_map_of_frame
        (fun candidate => candidate.messageHandlerOccurrences)
        (fun _ _ _ => rfl) before.activityOccurrences record firstPending restPending
    simp only [attachedMessagesUnambiguous]
    rw [attachedMessagesUnambiguous_of_handler_map_eq before.activityOccurrences
      after.activityOccurrences handlers]
    exact messagesUnambiguous
  have activityIdsAfter : activityIdentitiesUnique after = true := by
    simp only [activityIdentitiesUnique]
    have preserved := all_occursOnce_of_map_eq
      (fun candidate =>
        (candidate.processInstanceId, candidate.activityElementId, candidate.activation))
      sameActivityOccurrence
      (fun left right => left.1 == right.1 && left.2.1 == right.2.1 &&
        left.2.2 == right.2.2)
      (fun _ _ => rfl)
      (replaceParallelRecordBody before.activityOccurrences record
        (firstPending :: restPending)) before.activityOccurrences
      (replaceParallelRecordBody_map_of_frame
        (fun candidate =>
          (candidate.processInstanceId, candidate.activityElementId, candidate.activation))
        (fun _ _ _ => rfl) _ _ _ _)
    change (replaceParallelRecordBody before.activityOccurrences record
      (firstPending :: restPending)).all
        (occursOnce sameActivityOccurrence
          (replaceParallelRecordBody before.activityOccurrences record
            (firstPending :: restPending))) = true
    rw [preserved]
    exact activityIds
  have noSequentialOperation := admitted_parallel_has_no_sequential_operation program arm
    ownerScope account
  have noSequentialControllers := sequential_controllers_absent program before
    noSequentialOperation sequentialBindings
  have controllersAfter : controllersOwnLiveActivity after = true := by
    simp [controllersOwnLiveActivity, after, noSequentialControllers]
  have sequentialBindingsAfter : sequentialMultiInstanceProgramBindingsValid program after = true := by
    apply sequential_bindings_of_no_sequential_operation program after noSequentialOperation
    simp [after, noSequentialControllers]
  have parallelBindingsAfter : parallelMultiInstanceProgramBindingsValid program after = true := by
    exact parallelMultiInstanceProgramBindingsValid_progress program arm ownerScope account before
      taskId controller record result firstPending restPending selection pending parallelBindings
  have controllerIdsAfter : controllerIdentitiesUnique after = true := by
    simp [controllerIdentitiesUnique, after, noSequentialControllers]
  have notExhaustedAfter : controllersNotExhausted after = true := by
    simp [controllersNotExhausted, after, noSequentialControllers]
  have lifecycleAfter : (match after.control with
      | .notStarted => notStartedStateEmpty after
      | _ => true) = true := by
    simp [after, running]
  have claimsAfter : activityBodyClaimsUnique after.activityOccurrences = true := by
    exact replaceParallelRecordBody_preserves_activityBodyClaimsUnique before record firstPending
      restPending claims activityIds selection.recordMember remainingClaims
  have retentionAfter : compensationActivityRetentionStateValid program after = true := by
    change compensationActivityRetentionStateValid program before = true
    exact retention
  simp only [runtimeStateWellFormed, Bool.and_eq_true]
  exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨positionAfter, racesAfter⟩, incidentsAfter⟩,
    ownersAfter⟩, identitiesAfter⟩, boundsAfter⟩, declarationsAfter⟩, hiddenAfter⟩,
    orderAfter⟩, bodiesAfter⟩, attachedAfter⟩, messagesUnambiguousAfter⟩,
    activityIdsAfter⟩, controllersAfter⟩,
    sequentialBindingsAfter⟩, parallelBindingsAfter⟩, controllerIdsAfter⟩,
    notExhaustedAfter⟩, lifecycleAfter⟩, ⟨claimsAfter, retentionAfter⟩⟩

end BpmnSemantics.SemanticProcess
