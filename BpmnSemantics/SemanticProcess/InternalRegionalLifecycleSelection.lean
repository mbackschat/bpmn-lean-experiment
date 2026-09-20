import BpmnSemantics.SemanticProcess.InternalRegionalLifecycleCorrespondence
import BpmnSemantics.SemanticProcess.TransitionRecord

/-! The regional selection supplies the actual lifecycle selector's owner and parent facts.
These bridges preserve the existing evaluator's selection and publication contracts.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regionalSelection_lifecycle_owner (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected) :
    flowNodeSelectedOperationOwner? state operation = some selected.root.id := by
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation with
  | returnProcess id origin process definition output =>
      dsimp only at found
      repeat' first
        | (solve | simp at found)
        | (solve |
            cases found
            rename_i _ _ record census _ _ _ root scopes _ _ _ _
            have rootId := scope_identity_of_census state record.calledRoot root scopes
            change (match state.calledProcessOccurrences.filter (fun record =>
              decide (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value)) with
              | [record] => some record.calledRoot | _ => none) = some root.id
            rw [census, rootId])
        | split at found
  | completeScope id origin definition output =>
      dsimp only at found
      repeat' first
        | (solve | simp at found)
        | (solve |
            cases found
            change (match state.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) with
              | [scope] => some scope.id | _ => none) = _
            simp_all)
        | split at found
        | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  | throwError id origin input error handler =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · split at found
        · contradiction
        · split at found
          · next root census =>
              obtain ⟨parent, _, found⟩ := Option.bind_eq_some_iff.mp found
              split at found
              · cases found
                have rootId := scope_identity_of_census state owner root census
                simpa only [flowNodeSelectedOperationOwner?, rootId] using owned
              · contradiction
          · contradiction
  | terminateScope id origin input definition =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      try dsimp only at found
      split at found
      · next root census =>
          cases found
          have rootId := scope_identity_of_census state owner root census
          change onlyTokenOwner? state input = some root.id
          rw [rootId]
          unfold selectedTerminateOwner? at owned
          repeat' first
            | (solve | simp at owned)
            | (solve | cases owned; simp_all [onlyTokenOwner?])
            | split at owned
      · simp at found
  | _ => simp at found

theorem regionalSelection_lifecycle_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected) :
    match operation, selected.kind with
    | .returnProcess id origin _ _ _, .returning record =>
        state.calledProcessOccurrences.filter (fun candidate =>
          decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) = [record]
    | .completeScope _ _ definition _, .completing _ =>
        state.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [selected.root]
    | .throwError .., .interrupting parent =>
        flowNodeOccurrenceThrowingScopeParent? state selected.root.id = some parent
    | .terminateScope .., .terminating => True
    | _, _ => False := by
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation with
  | returnProcess id origin process definition output =>
      dsimp only at found
      repeat' first
        | (solve | simp at found)
        | (solve | cases found; assumption)
        | split at found
  | completeScope id origin definition output =>
      dsimp only at found
      repeat' first
        | (solve | simp at found)
        | (solve | cases found; assumption)
        | split at found
        | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  | throwError id origin input error handler =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · split at found
        · contradiction
        · split at found
          · next root census =>
              obtain ⟨parent, parentFound, found⟩ := Option.bind_eq_some_iff.mp found
              split at found
              · cases found
                have rootId := scope_identity_of_census state owner root census
                simp only [flowNodeOccurrenceThrowingScopeParent?, rootId, census]
                cases root
                simp_all
              · contradiction
          · contradiction
  | terminateScope id origin input definition =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · cases found; trivial
      · contradiction
  | _ => simp at found

theorem regionalLifecycleTemplate_candidate (program : Program) (before after : RuntimeState)
    (hosting commandId : SemanticId) (transitionIndex : Nat)
    (operation : SemanticOperation) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (current : List OpenSemanticFlowNodeOccurrence) (identities : List FlowNodeIdentity)
    (ends : List UnnumberedFlowNodeOccurrenceEnd)
    (valid : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (selection : selectInternalRegional? program before operation = some selected)
    (derived : deriveInternalOccurrenceRegion? before selected.root.id = some region)
    (projected : projectOpenFlowNodeOccurrences? program before = some current)
    (lifecycle : regionalLifecycleTemplate? program selected region current = some (identities, ends)) :
    candidateFlowNodeOccurrenceDeltaForOperation? program before after operation commandId transitionIndex =
      some (instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex identities ends) := by
  have owned := regionalSelection_lifecycle_owner program before operation selected selection
  have facts := regionalSelection_lifecycle_facts program before operation selected selection
  have selectedOperation := regionalSelection_operation program before operation selected selection
  unfold candidateFlowNodeOccurrenceDeltaForOperation?
  rw [owned]
  simp only [Option.bind_eq_bind, Option.bind_some]
  cases operation with
  | returnProcess id origin process definition output =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      rename_i record
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      split at lifecycle
      · cases lifecycle
        simp only [facts]
        rfl
      · contradiction
  | completeScope id origin definition output =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      cases rootEq : selected.root with
      | mk rootId parent =>
          cases parent with
          | none =>
              simp only [rootEq] at lifecycle
              cases lifecycle
              simp only [facts, rootEq]
              rfl
          | some parent =>
              simp only [rootEq] at lifecycle
              split at lifecycle
              · cases lifecycle
                simp only [facts, rootEq]
                rfl
              · contradiction
  | throwError id origin input error handler =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      rename_i parent
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      obtain ⟨errorIdentity, errorFound, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      obtain ⟨boundaryIdentity, boundaryFound, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      cases lifecycle
      have cancelled := regionalError_cancellation_ends program before hosting selected.root.id region current
        valid running derived projected
      simp only [errorPropagationCancellationDelta?, facts, errorFound, boundaryFound, cancelled,
        Option.bind_eq_bind, Option.bind_some, pure, Pure.pure]
  | terminateScope id origin input definition =>
      cases kind : selected.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, selectedOperation, kind] at lifecycle
      obtain ⟨ending, endingFound, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      cases lifecycle
      have cancelled := regionalTerminate_cancellation_ends program before hosting selected.root.id region current
        valid running derived projected
      simp only [terminateScopeCancellationDelta?, endingFound, cancelled,
        Option.bind_eq_bind, Option.bind_some, pure, Pure.pure]
  | _ => cases selected.kind <;> contradiction

/-- The complete candidate equals its retained template at every assigned command/index and
for every successor argument; the regional candidate is determined entirely by the predecessor. -/
theorem preparedRegional_lifecycle_candidate (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (commandId : SemanticId) (transitionIndex : Nat)
    (found : prepareInternalRegional? program before operation = some prepared) :
    candidateFlowNodeOccurrenceDeltaForOperation? program before after operation commandId transitionIndex =
      some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨_, _, _, closedSelection, derived, _, published⟩ :=
    prepareInternalRegional_facts program before operation prepared found
  have selection := (ownershipClosedSelection_facts program before operation prepared.selection closedSelection).1
  obtain ⟨hosting, positions, current, delta, identities, ends, running, projected, opened,
    _, lifecycle, template⟩ :=
      regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have runningState : before.control = .running hosting := by
    unfold runningInstance? at running
    split at running
    · cases running; assumption
    · contradiction
  have valid : runtimePositionValid program hosting before = true := by
    unfold projectControlPosition? at projected
    split at projected
    · assumption
    · contradiction
  rw [template]
  exact regionalLifecycleTemplate_candidate program before after hosting commandId transitionIndex operation
    prepared.selection prepared.region current identities ends valid runningState selection derived opened lifecycle

theorem preparedRegional_transition_record (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program state operation = some prepared) :
    internalTransitionRecord? program state operation = some
      { operationId := prepared.publicationTemplate.operation.id
        operationKind := prepared.publicationTemplate.operation.kind
        origin := prepared.publicationTemplate.operation.origin
        owner := prepared.publicationTemplate.owner } := by
  obtain ⟨_, declared, _, closedSelection, _, _, published⟩ :=
    prepareInternalRegional_facts program state operation prepared found
  have selection := (ownershipClosedSelection_facts program state operation prepared.selection closedSelection).1
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, template⟩ :=
    regionalPublicationTemplate_facts program state prepared.selection prepared.region prepared.publicationTemplate published
  rw [template]
  simp only [regionalSelection_operation program state operation prepared.selection selection]
  exact internalTransitionRecord_of_selection program state operation prepared.selection.root.id declared
    (regionalSelection_lifecycle_owner program state operation prepared.selection selection)

end BpmnSemantics.SemanticProcess.InternalCommutation
