import BpmnSemantics.SemanticProcess.InternalBoundedScopeProjection
import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionPublication
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore

/-! Bounded Sub-Process arming publishes its child start and control-position delta through the
existing acceptance boundary; the attached deadline remains private under the
[bounded outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#bounded-sub-process-arming-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_bounded_scope_candidate
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (commandId : SemanticId) (transitionIndex : Nat)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    candidateFlowNodeOccurrenceDeltaForOperation? program state (prepared.selection.apply state)
      contract.operation commandId transitionIndex = some prepared.publicationTemplate.lifecycle := by
  obtain ⟨selected, hosting, _, _, start, _, selection, runningInstance,
    _, _, _, _, _, _, startFound, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have running : state.control = .running hosting := by
    cases equation : state.control <;> simp_all [runningInstance?]
  unfold selectInternalScopeCreation? at entryFound
  simp only [running, bind, Option.bind, InternalBoundedScopeContract.entryOperation] at entryFound
  obtain ⟨owner, owned, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
  split at entryFound
  · contradiction
  · next fresh =>
      cases entryFound
      let created : RuntimeScopeOccurrence :=
        { id := { processInstanceId := hosting, definitionScopeId := contract.definition,
                  activation := scopeActivationCount state contract.definition + 1 }, parent := some owner }
      let keep := fun scope : RuntimeScopeOccurrence =>
        decide (scope.id.definitionScopeId = contract.definition && scope.parent = some owner)
      have absent : state.scopeOccurrences.filter keep = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro scope member accepted
        have same : scope.id.definitionScopeId = contract.definition := by
          simpa only [keep, decide_eq_true_eq, Bool.and_eq_true] using
            ((Bool.and_eq_true _ _).mp (of_decide_eq_true accepted)).1
        apply fresh
        simp only [Bool.or_eq_true]
        right
        apply List.any_eq_true.mpr
        exact ⟨scope, member, by simp [same]⟩
      have singleton : (insertScopeOccurrence created state.scopeOccurrences).filter keep = [created] := by
        apply List.Perm.eq_singleton
        have permutation := filter_canonicalInsertBy_perm scopeOccurrenceBefore keep created
          state.scopeOccurrences (by simp [keep, created])
        simpa only [insertScopeOccurrence, absent] using permutation
      have singletonExpanded := singleton
      dsimp only [keep, created] at singletonExpanded
      suffices candidate : (do
        let scope ← match (insertScopeOccurrence created state.scopeOccurrences).filter keep with
          | [scope] => some scope | _ => none
        pure (canonicalFlowNodeOccurrenceDelta
          [← candidateScopeStart? program contract.operation owner scope] [])) =
        some { started := [start], ended := [] } by
        cases disposition : contract.disposition <;>
          simpa only [keep, created, makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
            makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply,
            InternalBoundedScopeContract.operation, disposition, candidateFlowNodeOccurrenceDeltaForOperation?,
            flowNodeSelectedOperationOwner?, owned, bind, Option.bind, singletonExpanded] using candidate
      rw [singleton]
      change candidateScopeStart? program contract.operation owner created = some start at startFound
      simp only [bind, Option.bind, startFound, pure, Pure.pure]
      rfl

theorem prepared_bounded_scope_accepted_lifecycle
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId commandId : SemanticId)
    (transitionIndex : Nat) (current : List OpenSemanticFlowNodeOccurrence)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    flowNodeOccurrenceDeltaForOperation? program state (prepared.selection.apply state)
      contract.operation commandId transitionIndex = some prepared.publicationTemplate.lifecycle := by
  obtain ⟨start, template, afterProjection⟩ := prepared_bounded_scope_open_projection program state
    contract prepared instanceId current found admitted valid projected
  have candidate := prepared_bounded_scope_candidate program state contract prepared commandId transitionIndex found
  rw [template] at candidate ⊢
  have nonTransition : transitionAnchor start.anchor = false := by
    cases shape : transitionAnchor start.anchor with
    | false => rfl
    | true =>
        exact False.elim (projectOpenFlowNodeOccurrences_transitionAnchor_false program
          (prepared.selection.apply state) (sortFlowNodeOccurrenceStarts (start :: current)) afterProjection
          ⟨start, (mem_sortFlowNodeOccurrenceStarts start (start :: current)).mpr List.mem_cons_self, shape⟩)
  exact single_start_candidate_accepted program state (prepared.selection.apply state) contract.operation
    commandId transitionIndex current start (sortFlowNodeOccurrenceStarts (start :: current))
    projected afterProjection rfl candidate nonTransition

theorem prepared_bounded_scope_position_delta
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    controlPositionDelta? program instanceId state (prepared.selection.apply state) =
      some prepared.publicationTemplate.positionDelta := by
  have position (candidate : RuntimeState)
      (valid : runtimeStateWellFormed program instanceId candidate = true) :
      runtimePositionValid program instanceId candidate = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have beforePosition := position state valid
  have afterPosition := position _
    (prepared_bounded_scope_preserves_runtime program state contract prepared instanceId found valid)
  obtain ⟨selected, hosting, ownerRecord, definition, start, delta, selection, _, _, _,
    ownerExact, _, checked, _, _, deltaFound, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  apply scopeCreationPositionDelta_of_components program instanceId state _ contract.entryOperation entry
    ownerRecord contract.origin definition delta beforePosition afterPosition entryFound ownerExact checked deltaFound
  all_goals simp [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
    makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child]

theorem prepared_bounded_scope_transition_record
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    internalTransitionRecord? program state contract.operation = some
      { operationId := contract.operation.id, operationKind := contract.operation.kind,
        origin := contract.operation.origin, owner := prepared.selection.creation.owner } := by
  obtain ⟨selected, _, _, _, _, _, selection, _, _, exactOperation, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have operationId : contract.operation.id = contract.operationId := by
    cases disposition : contract.disposition <;>
      simp only [InternalBoundedScopeContract.operation, disposition, SemanticOperation.id]
  apply internalTransitionRecord_of_selection program state contract.operation entry.owner
    (by simpa only [operationId] using exactOperation)
  unfold selectInternalScopeCreation? at entryFound
  obtain ⟨hosting, _, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
  obtain ⟨owner, owned, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
  split at entryFound
  · contradiction
  · cases entryFound
    cases disposition : contract.disposition <;>
      simpa only [InternalBoundedScopeContract.operation, disposition, selectedOperationOwner?,
        flowNodeSelectedOperationOwner?] using owned

theorem prepared_bounded_scope_publication_accepted
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId commandId : SemanticId)
    (transitionIndex : Nat) (current : List OpenSemanticFlowNodeOccurrence)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    actualInternalTransitionPublication? program instanceId state (prepared.selection.apply state)
      contract.operation commandId transitionIndex =
      some ((internalBoundedScopePublicationTemplate prepared).instantiate commandId transitionIndex) := by
  have lifecycle := prepared_bounded_scope_accepted_lifecycle program state contract prepared instanceId
    commandId transitionIndex current admitted valid projected found
  have position := prepared_bounded_scope_position_delta program state contract prepared instanceId valid found
  have record := prepared_bounded_scope_transition_record program state contract prepared found
  simp only [actualInternalTransitionPublication?, record, lifecycle, position, bind, Option.bind]
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, _, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  simp only [internalBoundedScopePublicationTemplate,
    InternalTransitionPublicationTemplate.instantiate, InternalTransitionLifecycleTemplate.instantiate,
    makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection]

end BpmnSemantics.SemanticProcess.InternalCommutation
