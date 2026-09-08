import BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import BpmnSemantics.SemanticProcess.InternalSelectedBranchPatchValidity
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! Composed preparation validity for the five local-control families in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem mapM_member_some (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results)
    (value : α) (member : value ∈ values) :
    ∃ result, project value = some result := by
  induction values generalizing results with
  | nil => simp at member
  | cons current rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨head, headEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, tailEq, _⟩ := Option.bind_eq_some_iff.mp mapped
      rcases List.mem_cons.mp member with rfl | restMember
      · exact ⟨head, headEq⟩
      · exact ih tail tailEq restMember

theorem internalLocalControlPositionDelta?_place_origin (program : Program)
    (patch : TokenPatch) (delta : PublicControlPositionDelta)
    (found : internalLocalControlPositionDelta? program patch = some delta)
    (place : ControlPlaceId) (member : place ∈ patch.consumed ++ patch.produced) :
    ∃ origin, internalLocalControlPlaceOrigin? program place patch.owner = some origin := by
  unfold internalLocalControlPositionDelta? at found
  obtain ⟨origins, mapped, _⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨pair, pairFound⟩ := mapM_member_some _ _ origins mapped place (by simpa using member)
  obtain ⟨origin, originFound, _⟩ := Option.bind_eq_some_iff.mp pairFound
  exact ⟨origin, originFound⟩

theorem selectedInputOrigin?_exact_bindings (program : Program) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin)
    (found : selectedInputOrigin? program place owner = some origin) :
    (∃ declaration, program.controlPlaces.filter (fun candidate =>
      decide (candidate.id = place)) = [declaration]) ∧
    program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := owner.definitionScopeId }] := by
  unfold selectedInputOrigin? at found
  generalize declarations : program.controlPlaces.filter
    (fun candidate => decide (candidate.id = place)) = places at found
  cases places with
  | nil => simp at found
  | cons declaration rest =>
      cases rest with
      | cons _ _ => simp at found
      | nil =>
          simp only [Option.bind_eq_bind, Option.bind_some] at found
          generalize bindings : program.controlPlaceScopes.filter
            (fun ownership => decide (ownership.controlPlaceId = place)) = ownerships at found
          cases ownerships with
          | nil => simp at found
          | cons binding rest =>
              cases rest with
              | cons _ _ => simp at found
              | nil =>
                  change (if binding.scopeId = owner.definitionScopeId then
                    some declaration.origin else none) = some origin at found
                  split at found
                  · next scope =>
                      have member : binding ∈ program.controlPlaceScopes.filter
                          (fun ownership => decide (ownership.controlPlaceId = place)) := by
                        rw [bindings]
                        exact List.mem_cons_self
                      have placeEq := (List.mem_filter.mp member).2
                      simp only [decide_eq_true_eq] at placeEq
                      refine ⟨⟨declaration, rfl⟩, ?_⟩
                      congr 1
                      cases binding
                      simp_all
                  · contradiction

theorem candidateOperationFlowNodeIdentity?_operation_member (program : Program)
    (operation : SemanticOperation) (selectedOwner identityOwner : ScopeOccurrenceId)
    (elementId : NodeId) (identity : FlowNodeIdentity)
    (found : candidateOperationFlowNodeIdentity? program operation selectedOwner
      identityOwner elementId = some identity) : operation ∈ program.operations := by
  unfold candidateOperationFlowNodeIdentity? at found
  obtain ⟨scope, scopeFound, _⟩ := Option.bind_eq_some_iff.mp found
  change (do
    let selected ← match program.operations.filter fun candidate =>
        decide (candidate.id = operation.id) with
      | [selected] => some selected
      | _ => none
    if selected ≠ operation then none else
      match program.operationScopes.filter fun binding =>
          decide (binding.operationId = operation.id) with
      | [binding] => some binding.scopeId
      | _ => none) = some scope at scopeFound
  generalize selectedEq : program.operations.filter
    (fun candidate => decide (candidate.id = operation.id)) = operations at scopeFound
  cases operations with
  | nil => simp at scopeFound
  | cons selected rest =>
      cases rest with
      | cons _ _ => simp at scopeFound
      | nil =>
          simp only [Option.bind_eq_bind, Option.bind_some] at scopeFound
          by_cases same : selected = operation
          · subst selected
            have member : operation ∈ program.operations.filter
                (fun candidate => decide (candidate.id = operation.id)) := by
              rw [selectedEq]
              exact List.mem_cons_self
            exact (List.mem_filter.mp member).1
          · simp [same] at scopeFound

theorem selectInternalLocalControl_insert_facts (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalLocalControlSelection)
    (found : selectInternalLocalControl? state operation = some selected)
    (record : SelectedBranchSet) (inserted : selected.selectedBranch = .insert record) :
    record.owner = selected.owner ∧
      ∃ id origin input candidates defaultBranch,
        operation = .selectMany id origin input candidates defaultBranch record.selectionKey := by
  cases operation with
  | duplicate id origin input outputs =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      contradiction
  | synchronize id origin inputs output =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      contradiction
  | choose id origin input candidates defaultOutput defaultOrigin =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨branch, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      contradiction
  | selectMany id origin input candidates defaultBranch key =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · obtain ⟨branch, _, found⟩ := Option.bind_eq_some_iff.mp found
        split at found
        · contradiction
        · cases found
          cases inserted
          exact ⟨rfl, id, origin, input, candidates, defaultBranch, rfl⟩
  | synchronizeSelected id origin inputs output key =>
      simp only [selectInternalLocalControl?] at found
      split at found
      · cases found
        contradiction
      · contradiction
  | _ => simp [selectInternalLocalControl?] at found

theorem selectInternalLocalControl_insert_valid (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalLocalControlSelection)
    (programWF : programWellFormed program = true)
    (member : operation ∈ program.operations)
    (found : selectInternalLocalControl? state operation = some selected)
    (live : exactLiveOccurrence state selected.owner = true)
    (record : SelectedBranchSet) (inserted : selected.selectedBranch = .insert record) :
    exactLiveOccurrence state record.owner = true ∧
      (program.operations.filter fun
        | .selectMany _ _ _ _ _ key => decide (key = record.selectionKey)
        | _ => false).length = 1 := by
  obtain ⟨owner, id, origin, input, candidates, defaultBranch, operationEq⟩ :=
    selectInternalLocalControl_insert_facts state operation selected found record inserted
  refine ⟨by rw [owner]; exact live, ?_⟩
  rw [operationEq] at member
  exact programWellFormed_selectMany_declarer_unique program programWF
    id origin input candidates defaultBranch record.selectionKey member

/-- Complete origin preparation derives both exact declaration and scope binding for every output;
the patch may retain any number of token units at that place. -/
theorem internalLocalControlPositionDelta?_output_bindings (program : Program)
    (patch : TokenPatch) (delta : PublicControlPositionDelta)
    (found : internalLocalControlPositionDelta? program patch = some delta)
    (place : ControlPlaceId) (member : place ∈ patch.produced) :
    (∃ declaration, program.controlPlaces.filter (fun candidate =>
      decide (candidate.id = place)) = [declaration]) ∧
    program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := patch.owner.definitionScopeId }] := by
  obtain ⟨origin, resolved⟩ := internalLocalControlPositionDelta?_place_origin
    program patch delta found place (List.mem_append_right _ member)
  exact selectedInputOrigin?_exact_bindings program place patch.owner origin
    (internalLocalControlPlaceOrigin?_selectedInputOrigin program place patch.owner origin resolved)

/-- RSI-OWN-01 and RSI-BIND-05 are derived for the complete selected patch. The explicit running
identity binds the caller's validity index to the instance selected by preparation. -/
theorem prepareInternalLocalControl_preserves_runtimeStateWellFormed
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (prepared : PreparedInternalLocalControl) (instanceId : SemanticId)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    runtimeStateWellFormed program instanceId (prepared.selection.apply state) = true := by
  obtain ⟨selected, origin, selectedInstance, identity, delta, selection, _, _, live,
    _, _, _, _, identityFound, deltaFound, rfl⟩ :=
    prepareInternalLocalControl_facts program state operation prepared found
  have member := candidateOperationFlowNodeIdentity?_operation_member program operation
    selected.owner selected.owner origin.elementId identity identityFound
  have outputs := internalLocalControlPositionDelta?_output_bindings program selected.tokens
    delta deltaFound
  have tokenWF := selected.tokens.preserves_runtimeStateWellFormed program instanceId
    state beforeWF live (fun place inOutputs => (outputs place inOutputs).1)
      (fun place inOutputs => (outputs place inOutputs).2)
  have inserted := selectInternalLocalControl_insert_valid program state operation selected
    programWF member selection live
  exact selected.selectedBranch.preserves_runtimeStateWellFormed program instanceId
    { state with tokens := selected.tokens.apply state.tokens } tokenWF running
    (fun record insertion => (inserted record insertion).1)
    (fun record insertion => (inserted record insertion).2)

/-- Successful preparation retains the actual open-occurrence projection: local token changes
cannot publish a wait, and inserted selection ownership follows the original selection. -/
theorem prepareInternalLocalControl_open_occurrences_frame
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (prepared : PreparedInternalLocalControl) (instanceId : SemanticId)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    projectOpenFlowNodeOccurrences? program (prepared.selection.apply state) =
      projectOpenFlowNodeOccurrences? program state := by
  obtain ⟨selected, origin, selectedInstance, identity, delta, selection, _, _, live,
    _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state operation prepared found
  have owners : waitOwnersLive state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at beforeWF
    exact beforeWF.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.2
  have inserted : ∀ record, selected.selectedBranch = .insert record →
      exactLiveOccurrence state record.owner = true := by
    intro record insertion
    rw [(selectInternalLocalControl_insert_facts state operation selected
      selection record insertion).1]
    exact live
  have selectedFrame := selected.selectedBranch.open_occurrences_frame program
    { state with tokens := selected.tokens.apply state.tokens } instanceId running owners inserted
  exact selectedFrame.trans (selected.tokens.open_occurrences_frame program state instanceId running)

end BpmnSemantics.SemanticProcess.InternalCommutation
