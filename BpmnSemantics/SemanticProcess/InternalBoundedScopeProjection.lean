import BpmnSemantics.SemanticProcess.InternalBoundedScopeRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalScopeCreationOpenProjection
import BpmnSemantics.SemanticProcess.ScopeCreationLifecycleStructuralValidity
import BpmnSemantics.SemanticProcess.InternalScopeCreationAcceptedPublication

/-! The bounded Sub-Process adds one public scope anchor. Its joined deadline remains private,
while fresh child and Activity identities preserve every existing Timer classification.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics
open FlowNodeOccurrenceProgramValidity.Internal

theorem prepared_bounded_scope_old_records_reject_child
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    ∀ old ∈ state.activityOccurrences,
      activityBodyScope? old ≠ some prepared.selection.creation.created.id := by
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, _, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have disjoint : state.activityOccurrences.any (regionalActivityAssociationsConflict ·
      (makeInternalBoundedScopeSelection state contract entry).record) = false := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa using joint.2
  intro old member claimed
  change activityBodyScope? old = some entry.created.id at claimed
  have absent := List.any_eq_false.mp disjoint old member
  cases body : old.body <;> simp [activityBodyScope?, body] at claimed
  subst_vars
  simp [regionalActivityAssociationsConflict, makeInternalBoundedScopeSelection, body] at absent

theorem prepared_bounded_scope_preserves_existing_timer_match
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (timer : TimerWait) (member : timer ∈ state.timerWaits) (operation : SemanticOperation) :
    boundaryTimerOperationMatches program (prepared.selection.apply state) timer operation =
      boundaryTimerOperationMatches program state timer operation := by
  have fresh := (prepared_bounded_scope_timer_keys_fresh program state contract prepared found timer member).1
  have bodies := prepared_bounded_scope_old_records_reject_child program state contract prepared found
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let selected := makeInternalBoundedScopeSelection state contract entry
  have unattached : recordAttaches selected.record (timerWaitOccurrence timer) = false := by
    rw [recordAttaches_timer_eq_names]
    have nodeEquality (left right : NodeId) : left = right ↔ left.value = right.value := by
      cases left; cases right; simp
    simpa [selected, makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection, ActivityOccurrence.timerHandlerOccurrences,
      anyTimerIdNamesWait, timerIdNamesWait, timerWaitOccurrence, timerWaitKeyMatches, nodeEquality] using fresh
  have scopeFrame (definition : DefinitionScopeId) (old : ActivityOccurrence)
      (oldMember : old ∈ state.activityOccurrences) :
      ((insertScopeOccurrence entry.created state.scopeOccurrences).filter fun scope =>
        decide (scope.id.definitionScopeId = definition && scope.parent = some timer.owner) &&
          activityBodyScope? old == some scope.id).length =
      (state.scopeOccurrences.filter fun scope =>
        decide (scope.id.definitionScopeId = definition && scope.parent = some timer.owner) &&
          activityBodyScope? old == some scope.id).length := by
    rw [insertScopeOccurrence, length_filter_canonicalInsertBy]
    have rejected : activityBodyScope? old ≠ some entry.created.id := bodies old oldMember
    simp [rejected]
  cases operation <;> try rfl
  all_goals
    simp only [boundaryTimerOperationMatches, makeInternalBoundedScopePreparation,
      InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child]
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by
        change (_ && recordAttaches selected.record (timerWaitOccurrence timer) && _) = false
        simp only [unattached, Bool.and_false, Bool.false_and])]
  all_goals try rfl
  all_goals
    congr 5
    apply List.filter_congr
    intro old oldMember
    rw [scopeFrame _ old oldMember]

theorem prepared_bounded_scope_preserves_existing_timer_binding
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (timer : TimerWait) (member : timer ∈ state.timerWaits) :
    flowNodeOccurrenceBoundaryTimerBound program (prepared.selection.apply state) timer =
      flowNodeOccurrenceBoundaryTimerBound program state timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro operation _
  exact prepared_bounded_scope_preserves_existing_timer_match program state contract prepared found
    timer member operation

theorem prepared_bounded_scope_new_timer_binding
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (records : activityRecordsOwnLiveWork state = true) :
    flowNodeOccurrenceBoundaryTimerBound program (prepared.selection.apply state)
      prepared.selection.timer = true := by
  have timerFresh := prepared_bounded_scope_timer_keys_fresh program state contract prepared found
  have unclaimed := activityRecords_do_not_claim_fresh_timer state prepared.selection.timer
    (fun old member => (timerFresh old member).1) records
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have exactSelection := boundedScopeJointResourcesAvailable_selected program state contract selected joint
  have timerDeclarers : timerWaitDeclarers program contract.timer.elementId = [contract.operation] := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa only [uniqueFamilyDeclarer?, decide_eq_true_eq] using joint.1.1.2
  have owned := operationOwnedBy_of_exact_declaration program contract.operation selected.creation.owner
    _ timerDeclarers (declaredByExactlyOneOwnedOperation_of_exactSelection program contract.operation
      selected.creation.owner _ timerDeclarers exactSelection)
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have freshScope := selectInternalScopeCreation_fresh state contract.entryOperation entry entryFound
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state contract.entryOperation entry entryFound
  have parent := (scopeCreation_selection_child_facts state contract.entryOperation entry hosting
    running entryFound child).2.2.1
  have definition : entry.created.id.definitionScopeId = contract.definition := by
    unfold selectInternalScopeCreation? at entryFound
    obtain ⟨_, _, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
    obtain ⟨_, _, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
    split at entryFound
    · contradiction
    · cases entryFound; rfl
  let selected := makeInternalBoundedScopeSelection state contract entry
  let after := selected.apply state
  have childCount : ((insertScopeOccurrence entry.created state.scopeOccurrences).filter fun scope =>
      decide (scope.id.definitionScopeId = contract.definition && scope.parent = some entry.owner) &&
        activityBodyScope? selected.record == some scope.id).length = 1 := by
    have empty : (state.scopeOccurrences.filter fun scope =>
        decide (scope.id.definitionScopeId = contract.definition && scope.parent = some entry.owner) &&
          activityBodyScope? selected.record == some scope.id) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro old member matching
      simp only [selected, makeInternalBoundedScopeSelection, activityBodyScope?,
        Bool.and_eq_true, beq_iff_eq, Option.some.injEq] at matching
      exact freshScope old member matching.2.symm
    rw [insertScopeOccurrence, length_filter_canonicalInsertBy, empty]
    simp [selected, makeInternalBoundedScopeSelection, activityBodyScope?, parent, definition]
  have oldRejected (old : ActivityOccurrence) (member : old ∈ state.activityOccurrences) :
      recordAttaches old (timerWaitOccurrence selected.timer) = false := by
    rw [recordAttaches_timer_eq_names]
    exact unclaimed old member
  have matched : boundaryTimerOperationMatches program after selected.timer contract.operation = true := by
    change operationOwnedBy program contract.operation entry.owner = true at owned
    cases disposition : contract.disposition <;>
      simp only [InternalBoundedScopeContract.operation, disposition] at owned ⊢
    all_goals
      simp only [boundaryTimerOperationMatches,
        show selected.timer.owner = entry.owner from rfl, owned,
        Bool.not_true, Bool.false_eq_true, ↓reduceIte]
      simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, child]
      change (_ && _ && decide (((insertActivityOccurrence selected.record state.activityOccurrences).filter
        (fun record => record.owner = entry.owner && recordAttaches record (timerWaitOccurrence selected.timer) &&
          ((insertScopeOccurrence entry.created state.scopeOccurrences).filter fun scope =>
            decide (scope.id.definitionScopeId = contract.definition && scope.parent = some entry.owner) &&
              activityBodyScope? record == some scope.id).length = 1)).length = 1)) = true
      rw [insertActivityOccurrence_eq_canonicalInsertBy, length_filter_canonicalInsertBy]
      have empty : (state.activityOccurrences.filter (fun record =>
          record.owner = entry.owner && recordAttaches record (timerWaitOccurrence selected.timer) &&
            ((insertScopeOccurrence entry.created state.scopeOccurrences).filter fun scope =>
              decide (scope.id.definitionScopeId = contract.definition && scope.parent = some entry.owner) &&
                activityBodyScope? record == some scope.id).length = 1)) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro old member
        simp only [oldRejected old member, Bool.and_false, Bool.false_and, Bool.false_eq_true, not_false_eq_true]
      rw [empty, childCount]
      simp [recordAttaches, selected, makeInternalBoundedScopeSelection,
        ActivityOccurrence.timerHandlerOccurrences, timerWaitOccurrence]
  have declarers : timerWaitDeclarers program selected.timer.elementId = [contract.operation] := timerDeclarers
  change flowNodeOccurrenceBoundaryTimerBound program after selected.timer = true
  unfold flowNodeOccurrenceBoundaryTimerBound
  have exactFilter : program.operations.filter (boundaryTimerOperationMatches program after selected.timer) =
      timerWaitDeclarers program selected.timer.elementId := by
    unfold timerWaitDeclarers
    apply List.filter_congr
    intro operation member
    by_cases same : operation = contract.operation
    · subst operation
      have declared : contract.operation ∈ timerWaitDeclarers program selected.timer.elementId := by
        rw [declarers]; simp
      rw [matched]
      exact (List.mem_filter.mp declared).2.symm
    · have absent : operation ∉ timerWaitDeclarers program selected.timer.elementId := by
        rw [declarers]; simp [same]
      cases operation <;> simp [timerWaitDeclarers, member] at absent
      all_goals simp [boundaryTimerOperationMatches, absent]
  change decide ((program.operations.filter
    (boundaryTimerOperationMatches program after selected.timer)).length = 1) = true
  rw [exactFilter, declarers]
  rfl

theorem prepared_bounded_scope_preserves_wait_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (records : activityRecordsOwnLiveWork state = true)
    (ownerProcess : !prepared.selection.creation.owner.processInstanceId.value.isEmpty = true)
    (timerId : !contract.timer.elementId.value.isEmpty = true) :
    flowNodeOccurrenceWaitProgramValidity program (prepared.selection.apply state) = true := by
  have newBound := prepared_bounded_scope_new_timer_binding program state contract prepared found records
  have timerFrame := prepared_bounded_scope_preserves_existing_timer_match program state contract prepared found
  obtain ⟨selected, _, ownerRecord, _, _, _, selection, _, _, _, owners, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have timerDeclarers : timerWaitDeclarers program contract.timer.elementId = [contract.operation] := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa only [uniqueFamilyDeclarer?, decide_eq_true_eq] using joint.1.1.2
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let selected := makeInternalBoundedScopeSelection state contract entry
  let after := selected.apply state
  have ownerLive : flowNodeOccurrenceOwnerLiveUnique state entry.owner = true := by
    change state.scopeOccurrences.filter (fun candidate => decide (candidate.id = entry.owner)) =
      [ownerRecord] at owners
    simp [flowNodeOccurrenceOwnerLiveUnique, owners]
  have afterLive := selectInternalScopeCreation_preserves_live state contract.entryOperation entry
    entry.owner entryFound ownerLive
  have preserveOwner (process : SemanticId) (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
      (valid : occurrenceOwnerValid state process owner element activation = true) :
      occurrenceOwnerValid after process owner element activation = true := by
    have framed := scopeCreation_preserves_occurrence_owner state contract.entryOperation entry
      process owner element activation entryFound valid
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] at framed ⊢
    exact framed
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior
  change flowNodeOccurrenceWaitProgramValidity program after = true
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true]
  refine ⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩
  · have framed := scopeCreation_preserves_user_task_validity program state contract.entryOperation entry
      entryFound prior.1.1.1
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] at framed ⊢
    exact framed
  · have messageFrame : after.messageWaits = state.messageWaits := by
      simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, child]
    rw [messageFrame]
    apply List.all_eq_true.mpr
    intro wait member
    have valid := List.all_eq_true.mp prior.1.1.2 wait member
    change (occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true at valid
    change (occurrenceOwnerValid after wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true
    obtain ⟨owner, declared⟩ := Bool.and_eq_true_iff.mp valid
    apply Bool.and_eq_true_iff.mpr
    refine ⟨preserveOwner _ _ _ _ owner, ?_⟩
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child]
    exact declared
  · change (insertTimerWait selected.timer state.timerWaits).all _ = true
    rw [insertTimerWait, all_canonicalInsertBy]
    apply Bool.and_eq_true_iff.mpr
    constructor
    · change (occurrenceOwnerValid after selected.timer.processInstanceId selected.timer.owner
        selected.timer.elementId selected.timer.activation && _) = true
      apply Bool.and_eq_true_iff.mpr
      constructor
      · have processNonempty : entry.owner.processInstanceId.value.isEmpty = false := by
          simpa [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection] using ownerProcess
        have timerNonempty : contract.timer.elementId.value.isEmpty = false := by simpa using timerId
        simp only [occurrenceOwnerValid, after, selected, InternalBoundedScopeSelection.apply,
          makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child,
          processNonempty, timerNonempty, Nat.succ_pos, decide_true, Bool.not_false, Bool.true_and]
        simp only [InternalScopeCreationSelection.apply, child] at afterLive
        exact afterLive
      · change flowNodeOccurrenceBoundaryTimerBound program after selected.timer = true at newBound
        unfold flowNodeOccurrenceBoundaryTimerBound at newBound
        refine Eq.trans ?_ newBound
        congr 3
        apply List.filter_congr
        intro operation member
        have only : operation ∈ timerWaitDeclarers program selected.timer.elementId ↔
            operation = contract.operation := by
          change operation ∈ timerWaitDeclarers program contract.timer.elementId ↔ _
          rw [timerDeclarers]; simp
        cases operation <;> try rfl
        case awaitTimer id origin input output timer =>
          have different : timer.elementId ≠ selected.timer.elementId := by
            intro equal
            have same := only.mp (by simp [timerWaitDeclarers, member, equal])
            cases disposition : contract.disposition <;>
              simp [InternalBoundedScopeContract.operation, disposition] at same
          simp [boundaryTimerOperationMatches, different]
        case awaitEventRace id origin input message timer =>
          have different : timer.elementId ≠ selected.timer.elementId := by
            intro equal
            have same := only.mp (by simp [timerWaitDeclarers, member, equal])
            cases disposition : contract.disposition <;>
              simp [InternalBoundedScopeContract.operation, disposition] at same
          simp [boundaryTimerOperationMatches, different]
        all_goals
          simp only [boundaryTimerOperationMatches]
          split <;> rfl
    · apply List.all_eq_true.mpr
      intro timer member
      have valid := List.all_eq_true.mp prior.1.2 timer member
      change (occurrenceOwnerValid after timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true
      change (occurrenceOwnerValid state timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true at valid
      obtain ⟨owner, declared⟩ := Bool.and_eq_true_iff.mp valid
      apply Bool.and_eq_true_iff.mpr
      refine ⟨preserveOwner _ _ _ _ owner, Eq.trans ?_ declared⟩
      congr 3
      apply List.filter_congr
      intro operation _
      cases operation <;> try rfl
      case awaitEventRace id origin input message boundaryTimer =>
        have racesFrame : after.eventRaces = state.eventRaces := by
          simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
            InternalScopeCreationSelection.apply, child]
        split <;> simp only [racesFrame]
      all_goals first
        | (simp only [after, selected, InternalBoundedScopeSelection.apply,
            makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child]
           first | rfl | (split <;> rfl))
        | (split <;> first | rfl | exact timerFrame timer member _)
  · have framed := scopeCreation_preserves_effect_validity program state contract.entryOperation entry
      entryFound prior.2
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] at framed ⊢
    exact framed

theorem prepared_bounded_scope_projectWaits_frame
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (records : activityRecordsOwnLiveWork state = true)
    (waits : List OpenSemanticFlowNodeOccurrence)
    (projected : projectWaits? program state = some waits) :
    projectWaits? program (prepared.selection.apply state) = some waits := by
  have boundary := prepared_bounded_scope_preserves_existing_timer_binding program state contract prepared found
  have newBound := prepared_bounded_scope_new_timer_binding program state contract prepared found records
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let selected := makeInternalBoundedScopeSelection state contract entry
  let after := selected.apply state
  have startFrame (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
      (start : OpenSemanticFlowNodeOccurrence)
      (prior : waitStart? program state owner element activation = some start) :
      waitStart? program after owner element activation = some start := by
    have framed := scopeCreation_wait_start_preserved program state contract.entryOperation entry
      owner element activation start entryFound prior
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] at framed ⊢
    exact framed
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
    effectsEq, incidentsEq, rfl⟩ := (projectWaits_eq_some_iff program state waits).mp projected
  have timersFrame : (after.timerWaits.filter fun current =>
      !flowNodeOccurrenceBoundaryTimerBound program after current) =
      (state.timerWaits.filter fun current => !flowNodeOccurrenceBoundaryTimerBound program state current) := by
    change (insertTimerWait selected.timer state.timerWaits).filter _ = _
    have rejected : (!flowNodeOccurrenceBoundaryTimerBound program after selected.timer) = false := by
      change flowNodeOccurrenceBoundaryTimerBound program after selected.timer = true at newBound
      rw [newBound]
      rfl
    rw [insertTimerWait, filter_canonicalInsertBy_rejected timerWaitBefore
      (fun current => !flowNodeOccurrenceBoundaryTimerBound program after current)
      selected.timer state.timerWaits rejected]
    apply List.filter_congr
    intro timer member
    exact congrArg Bool.not (boundary timer member)
  change projectWaits? program after = _
  apply (projectWaits_eq_some_iff program after _).mpr
  refine ⟨tasks, messages, timers, effects, incidents, ?_, ?_, ?_, ?_, ?_, rfl⟩
  · have framed := mapM_preserves_success state.waits _ _
      (fun wait start prior => startFrame wait.owner ⟨wait.task.id.value⟩ wait.activation start prior) tasks tasksEq
    simpa only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] using framed
  · have framed := mapM_preserves_success state.messageWaits _ _
      (fun wait start prior => startFrame wait.owner wait.elementId wait.activation start prior) messages messagesEq
    simpa only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] using framed
  · rw [timersFrame]
    exact mapM_preserves_success _ _ _
      (fun wait start prior => startFrame wait.owner wait.elementId wait.activation start prior) timers timersEq
  · have framed := mapM_preserves_success state.effectWaits _ _
      (fun wait start prior => startFrame wait.owner wait.elementId wait.activation start prior) effects effectsEq
    simpa only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] using framed
  · have framed := mapM_preserves_success state.effectIncidents _ _
      (fun incident start prior => startFrame incident.wait.owner incident.wait.elementId incident.wait.activation
        start prior) incidents incidentsEq
    simpa only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] using framed

theorem prepared_bounded_scope_preserves_structural_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (admitted : programWellFormed program = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true) :
    flowNodeOccurrenceStructuralProgramValidity program (prepared.selection.apply state) = true := by
  obtain ⟨selected, hosting, ownerRecord, definition, _, _, selection, runningInstance,
    snapshots, operations, owners, definitionFound, checks, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have exactSelection := boundedScopeJointResourcesAvailable_selected program state contract selected joint
  have timerDeclarers : timerWaitDeclarers program contract.timer.elementId = [contract.operation] := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa only [uniqueFamilyDeclarer?, decide_eq_true_eq] using joint.1.1.2
  have owned := operationOwnedBy_of_exact_declaration program contract.operation selected.creation.owner
    _ timerDeclarers (declaredByExactlyOneOwnedOperation_of_exactSelection program contract.operation
      selected.creation.owner _ timerDeclarers exactSelection)
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have running : state.control = .running hosting := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have childFacts := scopeCreation_selection_child_facts state contract.entryOperation entry hosting
    running entryFound child
  have childDefinition : entry.created.id.definitionScopeId = contract.definition := by
    unfold selectInternalScopeCreation? at entryFound
    obtain ⟨_, _, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
    obtain ⟨_, _, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
    split at entryFound
    · contradiction
    · cases entryFound; rfl
  have definitions := definition_singleton program entry.created.id.definitionScopeId definition definitionFound
  have definitionFacts := List.mem_filter.mp (show definition ∈ program.definitionScopes.filter
      (fun candidate => decide (candidate.id = entry.created.id.definitionScopeId)) by
    rw [definitions]; simp)
  have checkFacts := internalScopeCreationPredecessorChecks_facts program state contract.entryOperation
    (makeInternalBoundedScopeSelection state contract entry).creation contract.origin definition checks
  have definitionMatch := checkFacts.2.1
  simp only [InternalBoundedScopeContract.entryOperation, internalScopeCreationDefinitionMatches,
    makeInternalBoundedScopeSelection, Bool.and_eq_true, decide_eq_true_eq] at definitionMatch
  have nonempty := (internalScopeCreationDefinitionsExact_facts program definition checkFacts.1 definitionFacts.1).1
  have member : contract.operation ∈ program.operations := by
    have filtered : contract.operation ∈ program.operations.filter
        (fun candidate => decide (candidate.id = contract.operationId)) := by rw [operations]; simp
    exact (List.mem_filter.mp filtered).1
  have census := child_entry_census program definition entry.owner.definitionScopeId admitted snapshots
    definitionFacts.1 definitionMatch.1.2
  obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp census
  have filtered : contract.operation ∈ program.operations.filter
      (fun operation => decide (enteredChildScopeId? operation = some definition.id)) := by
    exact List.mem_filter.mpr ⟨member, by
      cases disposition : contract.disposition <;>
        simp [InternalBoundedScopeContract.operation, disposition,
          enteredChildScopeId?, definitionMatch.1.1]⟩
  rw [singleton] at filtered
  simp only [List.mem_singleton] at filtered
  rw [← filtered] at singleton
  have entryBinding : EntryBinding program entry.created definition = true := by
    unfold EntryBinding
    rw [childFacts.2.2.1]
    simp only [decide_eq_true_eq]
    suffices exactEntry : (program.operations.filter _) = [contract.operation] by rw [exactEntry]; rfl
    apply filter_singleton_of_subpredicate program.operations _ _ _ singleton
    · intro candidate _ accepted
      split at accepted <;> try contradiction
      cases candidate <;> simp only at accepted <;> try contradiction
      all_goals simp only [enteredChildScopeId?, Bool.and_eq_true, decide_eq_true_eq] at accepted ⊢
      all_goals exact congrArg some (accepted.1.trans (childDefinition.trans definitionMatch.1.1.symm))
    · change operationOwnedBy program contract.operation entry.owner = true at owned
      cases disposition : contract.disposition <;>
        simp [InternalBoundedScopeContract.operation, disposition] at owned ⊢ <;>
        simp [owned, childDefinition, definitionMatch.2]
  have ownerLive : exactLiveOccurrence state entry.owner = true := by
    change state.scopeOccurrences.filter (fun candidate => decide (candidate.id = entry.owner)) =
      [ownerRecord] at owners
    simp [exactLiveOccurrence, owners]
  have afterOwner := selectInternalScopeCreation_preserves_live state contract.entryOperation entry
    entry.owner entryFound ownerLive
  have afterCreated := selectInternalScopeCreation_created_live state contract.entryOperation entry entryFound
  simp only [InternalScopeCreationSelection.apply, child] at afterOwner afterCreated
  have positive := scopeCreationSelection_child_issued_activation state contract.operationId contract.origin
    contract.input contract.entry contract.definition entry entryFound
  have created : ScopeBinding program (entry.apply state) entry.created = true := by
    unfold ScopeBinding
    rw [definitions]
    simp only [InternalScopeCreationSelection.apply, child, running, definitionMatch.1.2,
      childFacts.2.2.1, Bool.and_eq_true, decide_eq_true_eq]
    refine ⟨⟨⟨⟨⟨?_, ?_⟩, ?_⟩, afterCreated⟩, entryBinding⟩, ?_⟩
    · have process := checkFacts.2.2.2.2.1
      simpa [makeInternalBoundedScopeSelection, childFacts.1, childFacts.2.1] using process
    · simpa [childDefinition, definitionMatch.1.1] using nonempty
    · omega
    · exact ⟨⟨childFacts.1.trans childFacts.2.1.symm, trivial⟩, afterOwner⟩
  have result := scopeCreation_structural_of_created_bindings program state contract.entryOperation entry
    structural entryFound ⟨created, by intro record impossible; simp [child] at impossible⟩
  simp only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
    InternalBoundedScopeSelection.apply, InternalScopeCreationSelection.apply, child] at result ⊢
  exact result

theorem prepared_bounded_scope_preserves_occurrence_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (admitted : programWellFormed program = true)
    (valid : flowNodeOccurrenceProgramValidity program state = true)
    (records : activityRecordsOwnLiveWork state = true) :
    flowNodeOccurrenceProgramValidity program (prepared.selection.apply state) = true := by
  have parts := valid
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
  have structural := prepared_bounded_scope_preserves_structural_program_validity program state contract
    prepared found admitted parts.1.1.1
  have facts := prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨selected, _, ownerRecord, _, _, _, selection, _, _, operations, owners,
    _, _, _, _, _, preparedEq⟩ := facts
  have member : contract.operation ∈ program.operations := by
    have filtered : contract.operation ∈ program.operations.filter
        (fun candidate => decide (candidate.id = contract.operationId)) := by rw [operations]; simp
    exact (List.mem_filter.mp filtered).1
  have operationValid := List.all_eq_true.mp (programWellFormed_operations program admitted) contract.operation member
  have timerId : (!contract.timer.elementId.value.isEmpty) = true := by
    cases disposition : contract.disposition <;>
      simp only [InternalBoundedScopeContract.operation, disposition] at operationValid
    all_goals
      change (_ && _ && _ && (!contract.timer.elementId.value.isEmpty) && _ && _ && _ && _ && _ && _) = true at operationValid
      simp only [Bool.and_eq_true] at operationValid
      simp_all only
  have live : flowNodeOccurrenceOwnerLiveUnique state selected.creation.owner = true := by
    simp [flowNodeOccurrenceOwnerLiveUnique, owners]
  have process := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty program state
    selected.creation.owner parts.1.1.1 live
  have waits := prepared_bounded_scope_preserves_wait_program_validity program state contract prepared found
    parts.1.1.2 records (by simpa [preparedEq, makeInternalBoundedScopePreparation] using process)
    (by simpa using timerId)
  subst prepared
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true]
  refine ⟨⟨⟨structural, waits⟩, ?_⟩, ?_⟩
  all_goals
    simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
      makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child, List.all_eq_true]
  · intro record member
    have framed := selectInternalScopeCreation_preserves_live state contract.entryOperation entry record.owner
      entryFound (List.all_eq_true.mp parts.1.2 record member)
    simp only [InternalScopeCreationSelection.apply, child] at framed
    exact framed
  · intro race member
    have framed := selectInternalScopeCreation_preserves_live state contract.entryOperation entry race.owner
      entryFound (List.all_eq_true.mp parts.2 race member)
    simp only [InternalScopeCreationSelection.apply, child] at framed
    exact framed

theorem prepared_bounded_scope_preserves_message_projection_validity
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (valid : messageBoundedProjectionValid program state = true) :
    messageBoundedProjectionValid program (prepared.selection.apply state) = true := by
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have noTasks := boundedScopeJointResourcesAvailable_no_task_declarer program state contract selected joint
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let selected := makeInternalBoundedScopeSelection state contract entry
  unfold messageBoundedProjectionValid at valid ⊢
  simp only [List.all_eq_true] at valid ⊢
  intro operation member
  have prior := valid operation member
  cases operation <;> try exact prior
  all_goals
    rename_i id origin input task message
    first
      | (let operation := SemanticOperation.awaitMessageBoundedUserTask id origin input task message
         change operation ∈ program.operations at member)
      | (let operation := SemanticOperation.awaitMessageMonitoredUserTask id origin input task message
         change operation ∈ program.operations at member)
    have different : task.id.value ≠ contract.origin.elementId.value := by
      intro same
      have taskSame : task.id = ⟨contract.origin.elementId.value⟩ :=
        taskDefinitionId_eq_of_value_eq _ _ same
      have conflict : operation ∈ userTaskWaitDeclarers program ⟨contract.origin.elementId.value⟩ :=
        List.mem_filter.mpr ⟨member, by simp [operation, taskSame]⟩
      rw [noTasks] at conflict
      simp at conflict
    let owned := operationOwnedBy program operation
    have recordsFrame : (insertActivityOccurrence selected.record state.activityOccurrences).filter
        (fun record => owned record.owner && decide (record.activityElementId.value = task.id.value)) =
        state.activityOccurrences.filter
          (fun record => owned record.owner && decide (record.activityElementId.value = task.id.value)) := by
      rw [insertActivityOccurrence_eq_canonicalInsertBy]
      apply filter_canonicalInsertBy_rejected
      simp [selected, makeInternalBoundedScopeSelection, Ne.symm different]
    simp only [selected, makeInternalBoundedScopeSelection, owned, operation] at recordsFrame
    simpa [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
      makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child,
      messageBoundedOperationProjectionValid, operation, selected, owned, recordsFrame] using prior

theorem prepared_bounded_scope_start_projects
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (admitted : programWellFormed program = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true) :
    ∃ start,
      prepared.publicationTemplate.lifecycle = { started := [start], ended := [] } ∧
      scopeStart? program (prepared.selection.creation.apply state) prepared.selection.creation.created = some start := by
  obtain ⟨selected, hosting, ownerRecord, _, start, _, selection, runningInstance,
    _, _, owners, _, _, _, startFound, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have running : state.control = .running hosting := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have live : flowNodeOccurrenceOwnerLiveUnique state entry.owner = true := by
    change state.scopeOccurrences.filter (fun candidate => decide (candidate.id = entry.owner)) =
      [ownerRecord] at owners
    simp [flowNodeOccurrenceOwnerLiveUnique, owners]
  have ownerHosting := (scopeCreation_selection_child_facts state contract.entryOperation entry hosting
    running entryFound child).1
  have process : processIdForOwner? program state entry.owner = some program.processId := by
    simp [processIdForOwner?, hostingInstanceId?, running, live, ownerHosting]
  have staticProcess := candidateProcessIdForDefinitionScope_eq_processIdForOwner program state entry.owner
    program.processId hosting admitted running structural live process
  have afterProcess := scopeCreation_process_lookup_preserved program state contract.entryOperation entry
    entry.owner program.processId entryFound process
  have projected := candidate_scope_start_agrees_with_projection program (entry.apply state)
    contract.operation entry.owner entry.created start program.processId staticProcess afterProcess startFound
  refine ⟨start, rfl, ?_⟩
  simp only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
    InternalScopeCreationSelection.apply, child] at projected ⊢
  exact projected

theorem prepared_bounded_scope_open_projection
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId : SemanticId)
    (current : List OpenSemanticFlowNodeOccurrence)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    ∃ start,
      prepared.publicationTemplate.lifecycle = { started := [start], ended := [] } ∧
      projectOpenFlowNodeOccurrences? program (prepared.selection.apply state) =
        some (sortFlowNodeOccurrenceStarts (start :: current)) := by
  have afterValid := prepared_bounded_scope_preserves_runtime program state contract prepared instanceId found valid
  have records : activityRecordsOwnLiveWork state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid
    simp_all only
  obtain ⟨selected, hosting, _, _, _, _, selection, runningInstance, _, _, _, _, _, _, _, _, preparedEq⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have running : state.control = .running hosting := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have prior := projectOpenFlowNodeOccurrences_validities program state current hosting running projected
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    have parts := prior.1
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
    exact parts.1.1.1
  have occurrenceAfter := prepared_bounded_scope_preserves_occurrence_program_validity program state contract
    prepared found admitted prior.1 records
  have messagesAfter := prepared_bounded_scope_preserves_message_projection_validity program state contract
    prepared found prior.2.2.2.2
  have waitsAfter := prepared_bounded_scope_projectWaits_frame program state contract prepared found records
  obtain ⟨start, template, created⟩ := prepared_bounded_scope_start_projects program state contract prepared
    found admitted structural
  subst prepared
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let after := (makeInternalBoundedScopeSelection state contract entry).apply state
  have afterRunning : after.control = .running hosting := by
    simp only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child, running]
  have childCreated : scopeStart? program (entry.apply state) entry.created = some start := by
    simpa only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] using created
  have fresh := scopeCreation_started_anchor_fresh program state contract.entryOperation entry current start
    entryFound projected (by simpa only [child] using childCreated)
  have associations := runtimeStateWellFormed_associationValidities program instanceId after afterValid
  have position : runtimePositionValid program instanceId after = true := by
    change runtimeStateWellFormed program instanceId after = true at afterValid
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at afterValid
    simp_all only
  have callsAfter := runtimePositionValid_called_associations program instanceId hosting after position afterRunning
  refine ⟨start, template, ?_⟩
  have components := projected
  simp only [projectOpenFlowNodeOccurrences?, running] at components
  split at components
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at components
    obtain ⟨waits, waitsEq, components⟩ := Option.bind_eq_some_iff.mp components
    obtain ⟨scopes, scopesEq, components⟩ := Option.bind_eq_some_iff.mp components
    obtain ⟨calls, callsEq, _⟩ := Option.bind_eq_some_iff.mp components
    obtain ⟨nextScopes, nextCalls, scopesAfter, callProjectionAfter, permutation⟩ :=
      scopeCreation_projection_components program state contract.entryOperation entry waits scopes calls start
        entryFound scopesEq callsEq (by simpa only [child] using childCreated)
    have scopesFinal : (after.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM
        (scopeStart? program after) = some nextScopes := by
      simp only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, child] at scopesAfter ⊢
      exact scopesAfter
    have callsFinal : after.calledProcessOccurrences.mapM (callStart? program after) = some nextCalls := by
      simp only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, child] at callProjectionAfter ⊢
      exact callProjectionAfter
    exact open_projection_single_start_from_components program state after hosting hosting current
      waits scopes calls waits nextScopes nextCalls start running afterRunning projected waitsEq scopesEq callsEq
      (waitsAfter waits waitsEq) scopesFinal callsFinal permutation fresh admitted occurrenceAfter
      associations.1 callsAfter associations.2 messagesAfter

end BpmnSemantics.SemanticProcess.InternalCommutation
