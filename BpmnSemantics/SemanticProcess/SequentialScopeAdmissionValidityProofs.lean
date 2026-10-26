module

import BpmnSemantics.SemanticProcess.RuntimeStateWellFormedInitialization
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmissionProofs
import BpmnSemantics.SemanticProcess.InternalScopeCreationRuntimeValidity
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleProofs
import BpmnSemantics.SemanticProcess.SequentialScopeDispatchLaws
public import BpmnSemantics.SemanticProcess.TransitionRecord
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity
import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionValidity
import BpmnSemantics.SemanticProcess.ScopeCreationLifecycleStructuralValidity
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeLaws

/-! SMIS-ADMIT-01 derives admitted Start validity and projectability together with static Program-to-runtime correspondence; this foundation imports no SMIS lifecycle, aggregate validity or scheduler owner. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem smis_start_definition_ids (program : Program)
    (valid : programWellFormed program = true) :
    (program.definitionScopes.map (·.id)).Nodup := by
  have sorted : strictlySortedStrings (program.definitionScopes.map (·.id.value)) = true := by
    simp only [programWellFormed, Bool.and_eq_true] at valid
    grind
  apply List.Pairwise.of_map (S := (· ≠ ·)) DefinitionScopeId.value
    (fun _ _ different same => different (congrArg DefinitionScopeId.value same))
  rw [List.map_map]
  exact strictlySortedStrings_nodup _ sorted

private theorem smis_start_source_origins (program : Program)
    (control : SequentialScopeControl.Analysis)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (admitted : SequentialScopeProgram.admitted program = true) :
    (program.processId.value :: program.operations.filterMap SequentialScopeProgram.sourceNode? ++
      program.controlPlaces.map (·.origin.elementId.value)).Nodup := by
  apply StructuredComposition.equal_deduplicated_length_has_unique_names
  simp only [SequentialScopeProgram.admitted, analyzed, Bool.and_eq_true, beq_iff_eq] at admitted
  grind

/-- Full source admission supplies the origin uniqueness omitted by raw structural graph validation. -/
theorem sequentialScope_admitted_projection_bindings (program : Program)
    (control : SequentialScopeControl.Analysis)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (admitted : SequentialScopeProgram.admitted program = true) :
    programProjectionBindingsValid program = true := by
  have sources := smis_start_source_origins program control analyzed admitted
  have placeStrings := (List.nodup_append.mp (List.nodup_cons.mp sources).2).2.1
  have placesUnique : (program.controlPlaces.map (·.origin)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) (fun origin : BpmnSequenceFlowOrigin => origin.elementId.value)
      (fun _ _ different same => different (congrArg (fun origin : BpmnSequenceFlowOrigin => origin.elementId.value) same))
    rw [List.map_map]
    exact placeStrings
  obtain ⟨entry, root, parent, childOperations, body, completion, origin, waits, first, vertices, bursts,
    entries, roots, _, _, _, _, _, _, _, _, _, _, _, _⟩ :=
    SequentialScopeControl.analyze_body_certificate program control analyzed
  have rootMember : root ∈ program.definitionScopes :=
    (List.mem_filter.mp (roots.symm ▸ List.mem_singleton_self root)).1
  have rootParent : root.parentScopeId = none := by
    have checked := (List.mem_filter.mp (roots.symm ▸ List.mem_singleton_self root)).2
    simpa using checked
  obtain ⟨entryRoot, rootFound, _, ownership⟩ :=
    programGraphWellFormed_scopeContract program (programWellFormed_graph program valid)
  have rootFilter : program.definitionScopes.filter (fun scope =>
      scope.parentScopeId.isNone && decide (scope.originElementId.value = program.processId.value)) =
      (program.definitionScopes.filter (·.parentScopeId.isNone)).filter
        (fun scope => decide (scope.originElementId.value = program.processId.value)) := by
    simp only [List.filter_filter, Bool.and_comm]
  have rootOrigin : root.originElementId.value = program.processId.value := by
    unfold programEntryRootScopeId? at rootFound
    rw [rootFilter, roots] at rootFound
    by_cases same : root.originElementId.value = program.processId.value
    · exact same
    · simp [same] at rootFound
  have rootSelected : rootDefinitionScope? program = some root := by
    unfold rootDefinitionScope?
    rw [rootFilter, roots]
    simp [rootOrigin]
  have entryMember : entry ∈ program.operations.filterMap sequentialScopeEntry? := by rw [entries]; simp
  have separated := sequentialScope_admitted_root_separation program entry control root
    valid analyzed entryMember rootSelected
  obtain ⟨entryOperation, declared, parsed⟩ := List.mem_filterMap.mp entryMember
  have respects := List.all_eq_true.mp
    (Bool.and_eq_true_iff.mp ownership).2 entryOperation declared
  have childExists : ∃ child ∈ program.definitionScopes,
      child.id = entry.childScopeId ∧ child.originElementId = entry.elementId := by
    cases entryOperation <;> simp only [sequentialScopeEntry?] at parsed <;> try contradiction
    case enterSequentialMultiInstanceScope id entryOrigin input childEntry childScope output collection item mappings condition =>
      cases Option.some.inj parsed
      unfold operationRespectsScopes at respects
      split at respects <;> try contradiction
      rename_i owner owned
      simp only [Bool.and_eq_true] at respects
      have childCheck :
          (program.definitionScopes.find? fun scope => decide (scope.id = childScope)).any
            (fun scope => scope.parentScopeId == some owner && scope.originElementId == entryOrigin.elementId) = true :=
        respects.2
      cases childFound : program.definitionScopes.find? (fun scope => decide (scope.id = childScope)) with
      | none => simp [childFound] at childCheck
      | some child =>
          have member := List.mem_of_find?_eq_some childFound
          have named : child.id = childScope := by simpa using List.find?_some childFound
          simp only [childFound, Option.any_some, Bool.and_eq_true, beq_iff_eq] at childCheck
          exact ⟨child, member, named, childCheck.2⟩
  obtain ⟨child, childMember, childId, childOrigin⟩ := childExists
  have entrySource : entry.elementId.value ∈ program.operations.filterMap SequentialScopeProgram.sourceNode? := by
    obtain ⟨operation, member, parsed⟩ := List.mem_filterMap.mp entryMember
    cases operation <;> simp only [sequentialScopeEntry?] at parsed <;> try contradiction
    cases Option.some.inj parsed
    exact List.mem_filterMap.mpr ⟨_, member, rfl⟩
  have originsDifferent : root.originElementId ≠ child.originElementId := by
    intro same
    have values := congrArg NodeId.value same
    rw [rootOrigin, childOrigin] at values
    apply (List.nodup_cons.mp sources).1
    rw [values]
    exact List.mem_append_left _ entrySource
  have definitionsDifferent : root ≠ child := by
    intro same
    apply separated
    simpa only [← same] using childId.symm
  have two : program.definitionScopes.length = 2 := by
    have checked := analyzed
    unfold SequentialScopeControl.analyze at checked
    split at checked <;> try contradiction
    rename_i accepted
    by_cases same : program.definitionScopes.length = 2
    · exact same
    · simp [same] at accepted
  have population : program.definitionScopes = [root, child] ∨ program.definitionScopes = [child, root] := by
    cases definitions : program.definitionScopes with
    | nil => simp [definitions] at two
    | cons first rest =>
        cases rest with
        | nil => simp [definitions] at two
        | cons second tail =>
            have empty : tail = [] := by
              apply List.length_eq_zero_iff.mp
              simp only [definitions, List.length_cons] at two
              omega
            subst tail
            simp [definitions] at rootMember childMember
            rcases rootMember with rfl | rfl <;> rcases childMember with rfl | rfl
            all_goals first
              | exact False.elim (definitionsDifferent rfl)
              | exact Or.inl rfl
              | exact Or.inr rfl
  have scopesUnique : (program.definitionScopes.map (·.originElementId)).Nodup := by
    rcases population with population | population <;> rw [population]
    · simp [originsDifferent]
    · simp [Ne.symm originsDifferent]
  apply Bool.and_eq_true_iff.mpr
  constructor
  · apply List.all_eq_true.mpr
    intro place member
    simp [filter_key_eq_singleton_of_nodup program.controlPlaces (·.origin) place placesUnique member]
  · apply List.all_eq_true.mpr
    intro scope member
    simp [filter_key_eq_singleton_of_nodup program.definitionScopes (·.originElementId) scope scopesUnique member]

private theorem smis_committed_start_named (program : Program)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    instanceId.value ≠ "" := by
  intro empty
  have invalid : SequentialScopeData.stimulusAdmitted program
      (.startProcess commandId processId instanceId bindings) = false := by
    simp only [SequentialScopeData.stimulusAdmitted, selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte]
    cases SequentialScopeData.analyze program <;> simp [empty]
  rw [admit_sequential_scope_invalid_data program initialState _ invalid] at committed
  contradiction

/-- Actual committed SMIS Start establishes the complete existing runtime invariant before closure. -/
theorem sequentialScope_committed_start_wellFormed (program : Program)
    (control : SequentialScopeControl.Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (admitted : SequentialScopeProgram.admitted program = true)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    runtimeStateWellFormed program instanceId
      (admitStimulus program initialState
        (.startProcess commandId processId instanceId bindings)).state = true := by
  have projection := sequentialScope_admitted_projection_bindings program control valid analyzed admitted
  have named := smis_committed_start_named program commandId processId instanceId bindings selected committed
  have built := sequentialScope_committed_start_builder program commandId processId instanceId bindings selected committed
  apply admitStartProcess_wellFormed program commandId processId instanceId bindings committed
  unfold runningProgramStartState? at built
  obtain ⟨root, rootSelected, built⟩ := Option.bind_eq_some_iff.mp built
  simp only [pure, Option.some.injEq] at built
  rw [← built]
  have rootFiltered : program.definitionScopes.filter (fun scope =>
      scope.parentScopeId.isNone && decide (scope.originElementId.value = program.processId.value)) = [root] := by
    unfold rootDefinitionScope? at rootSelected
    split at rootSelected <;> try contradiction
    cases Option.some.inj rootSelected
    assumption
  have rootMember := (List.mem_filter.mp (rootFiltered.symm ▸ List.mem_singleton_self root)).1
  have checks := (List.mem_filter.mp (rootFiltered.symm ▸ List.mem_singleton_self root)).2
  have parent : root.parentScopeId = none := by simpa using (Bool.and_eq_true_iff.mp checks).1
  have origin : root.originElementId.value = program.processId.value := by
    simpa using (Bool.and_eq_true_iff.mp checks).2
  have rootDefinition := filter_key_eq_singleton_of_nodup program.definitionScopes (·.id) root
    (smis_start_definition_ids program valid) rootMember
  have rootSource : program.definitionScopes.filter (fun scope =>
      decide (scope.originElementId = root.originElementId)) = [root] := by
    have count := List.all_eq_true.mp (Bool.and_eq_true_iff.mp projection).2 root rootMember
    obtain ⟨sole, census⟩ := List.length_eq_one_iff.mp (by simpa using count)
    have rootIn : root ∈ program.definitionScopes.filter (fun scope =>
        decide (scope.originElementId = root.originElementId)) := List.mem_filter.mpr ⟨rootMember, by simp⟩
    have same : root = sole := by simpa only [census, List.mem_singleton] using rootIn
    simpa only [← same] using census
  have lookup : uniqueDefinitionScope? program root.id = some root := by
    simp only [uniqueDefinitionScope?, rootDefinition, rootSource]
  apply (position_iff program instanceId instanceId _ rfl).mpr
  refine ⟨valid, projection, by simp [runningStartState, initialState], rfl, ?_, ?_, ?_, ?_⟩
  · simp [lookup, parent, origin]
  · simp [calledProcessAssociationsValid, rootInstanceId?, runningStartState, initialState]
  · intro occurrence member
    have same : occurrence = ⟨⟨instanceId, root.id, 1⟩, none⟩ := by
      simpa [runningStartState, initialState] using member
    subst occurrence
    refine ⟨by simp [exactLiveOccurrence], root, lookup, named, Nat.zero_lt_succ 0, ?_⟩
    simp [parent, origin, Hosting, Called, runningStartState, initialState]
  · simp [runningStartState, initialState]


/-- SMIS-IDENTITY-01 binds any present token to its declared port scope, including independently arrived Join inputs. -/
theorem sequentialScope_present_token_static_scope (program : Program) (hosting : SemanticId)
    (state : RuntimeState) (token : ControlToken) (scopeId : DefinitionScopeId)
    (position : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting) (member : token ∈ state.tokens)
    (placeOwner : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = token.placeId)) =
        [{ controlPlaceId := token.placeId, scopeId }]) :
    exactLiveOccurrence state token.owner = true ∧ token.owner.definitionScopeId = scopeId := by
  simp only [runtimePositionValid, Bool.and_eq_true] at position
  have lifecycle := position.2
  simp only [lifecyclePositionValid, running, runningPositionValid, Bool.and_eq_true] at lifecycle
  have tokenValid := List.all_eq_true.mp lifecycle.2 token member
  unfold tokenBindingValid controlPlaceScope? at tokenValid
  rw [placeOwner] at tokenValid
  cases unique : uniqueControlPlace? program token.placeId <;> simp_all

/-- Position supplies identity and ancestry; the selected entry declaration supplies the extra scope-to-operation correspondence required by publication. -/
theorem sequentialScope_structural_of_position (program : Program) (hosting : SemanticId)
    (state : RuntimeState) (position : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting) (noCalls : state.calledProcessOccurrences = [])
    (declared : ∀ occurrence ∈ state.scopeOccurrences, ∀ definition,
      uniqueDefinitionScope? program occurrence.id.definitionScopeId = some definition →
      scopeOperationBindingValid program occurrence definition = true) :
    flowNodeOccurrenceStructuralProgramValidity program state = true := by
  have facts := (position_iff program hosting hosting state running).mp position
  have names : program.definitionScopes.all (fun scope =>
      nonempty scope.id.value && nonempty scope.originElementId.value) = true := by
    have valid := facts.1
    simp only [programWellFormed, Bool.and_eq_true] at valid
    grind
  simp only [flowNodeOccurrenceStructuralProgramValidity, noCalls, List.all_nil, Bool.and_true, List.all_eq_true]
  intro occurrence present
  obtain ⟨live, definition, lookup, named, positive, parent⟩ := facts.2.2.2.2.2.2.1 occurrence present
  have entry := declared occurrence present definition lookup
  have census : program.definitionScopes.filter
      (fun scope => decide (scope.id = occurrence.id.definitionScopeId)) = [definition] := by
    unfold uniqueDefinitionScope? at lookup
    split at lookup <;> try contradiction
    split at lookup <;> simp_all
  have member := List.mem_filter.mp (census.symm ▸ List.mem_singleton_self definition)
  have scopeNamed : nonempty occurrence.id.definitionScopeId.value = true := by
    simpa only [of_decide_eq_true member.2] using
      (Bool.and_eq_true_iff.mp (List.all_eq_true.mp names definition member.1)).1
  with_unfolding_all change (match program.definitionScopes.filter
      (fun scope => decide (scope.id = occurrence.id.definitionScopeId)) with
    | [definition] => !occurrence.id.processInstanceId.value.isEmpty &&
        !occurrence.id.definitionScopeId.value.isEmpty && decide (occurrence.id.activation > 0) &&
        flowNodeOccurrenceOwnerLiveUnique state occurrence.id && scopeOperationBindingValid program occurrence definition &&
        match definition.parentScopeId, occurrence.parent, state.control with
        | some expected, some parent, .running _ =>
            decide (parent.processInstanceId = occurrence.id.processInstanceId) &&
              decide (parent.definitionScopeId = expected) && flowNodeOccurrenceOwnerLiveUnique state parent
        | none, none, .running hosting =>
            if occurrence.id.processInstanceId = hosting then decide (definition.originElementId.value = program.processId.value)
            else decide ((state.calledProcessOccurrences.filter fun record => decide
              (record.calledRoot = occurrence.id && record.calledProcessId.value = definition.originElementId.value)).length = 1)
        | _, _, _ => false
    | _ => false) = true
  rw [census]
  cases staticParent : definition.parentScopeId <;> cases runtimeParent : occurrence.parent <;>
    simp_all [Hosting, Called, flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence, nonempty]

/-- The admitted Start's sole parentless owner and empty work census establish an actual open projection from runtime validity. -/
theorem sequentialScope_start_projectable (program : Program) (instanceId : SemanticId)
    (root : DefinitionScope) (bindings : List VariableBinding)
    (wellFormed : runtimeStateWellFormed program instanceId
      { runningStartState instanceId bindings with
        scopeOccurrences := [⟨⟨instanceId, root.id, 1⟩, none⟩], scopeActivations := [⟨root.id, 1⟩] } = true) :
    (projectOpenFlowNodeOccurrences? program
      { runningStartState instanceId bindings with
        scopeOccurrences := [⟨⟨instanceId, root.id, 1⟩, none⟩], scopeActivations := [⟨root.id, 1⟩] }).isSome = true := by
  let owner : ScopeOccurrenceId := ⟨instanceId, root.id, 1⟩
  let started : RuntimeState := { runningStartState instanceId bindings with
    scopeOccurrences := [⟨owner, none⟩], scopeActivations := [⟨root.id, 1⟩] }
  have position : runtimePositionValid program instanceId started = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
    exact wellFormed.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1
  have facts := (position_iff program instanceId instanceId started rfl).mp position
  have valid := facts.1
  have structural := sequentialScope_structural_of_position program instanceId started position rfl rfl (by
    intro occurrence member definition _
    have same : occurrence = ⟨owner, none⟩ := by simpa [started] using member
    simp [same, scopeOperationBindingValid])
  have waits : flowNodeOccurrenceWaitProgramValidity program started = true := by rfl
  have pairs : messageBoundedProjectionValid program started = true := by
    unfold messageBoundedProjectionValid
    apply List.all_eq_true.mpr
    intro operation _
    cases operation <;> rfl
  change (projectOpenFlowNodeOccurrences? program started).isSome = true
  simp only [started, owner, runningStartState, initialState, emptyScopedVariables] at structural waits pairs
  simp [projectOpenFlowNodeOccurrences?, flowNodeOccurrenceProgramValidity, structural, waits, pairs,
    started, owner, runningStartState, initialState, emptyScopedVariables, valid, eventRaceAssociationsValid,
    calledProcessAssociationsValid, rootInstanceId?, effectIncidentAssociationsValid,
    projectWaits?, sortFlowNodeOccurrenceStarts, SemanticProcess.sortBy]

private theorem smis_entry_static_binding (program : Program) (entry : SequentialScopeEntry)
    (before : RuntimeState) (hosting : SemanticId) (parent : ScopeOccurrenceId)
    (valid : programWellFormed program = true)
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (declaredEntry : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (witness : ({placeId := entry.input, owner := parent} : ControlToken) ∈ before.tokens ∨
      ∃ body ∈ before.scopeOccurrences, body.parent = some parent ∧ body.id.definitionScopeId = entry.childScopeId) :
    ∃ definition, uniqueDefinitionScope? program entry.childScopeId = some definition ∧
      definition.parentScopeId = some parent.definitionScopeId ∧ definition.originElementId = entry.elementId ∧
      (∀ activation, scopeOperationBindingValid program
        ⟨⟨parent.processInstanceId, entry.childScopeId, activation⟩, some parent⟩ definition = true) ∧
      (∀ port ∈ [entry.childEntry, entry.normalOutput], ∃ place,
        program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place]) ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = entry.childEntry)) =
        [{controlPlaceId := entry.childEntry, scopeId := entry.childScopeId}] ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = entry.normalOutput)) =
        [{controlPlaceId := entry.normalOutput, scopeId := parent.definitionScopeId}] := by
  have graph := programWellFormed_graph program valid
  obtain ⟨entryRoot, _, _, ownership⟩ := programGraphWellFormed_scopeContract program graph
  simp only [scopedOwnershipComplete, Bool.and_eq_true, decide_eq_true_eq] at ownership
  have placesUnique : (program.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program valid)
  have operationKeys : (program.operationScopes.map (·.operationId)).Nodup := by
    rw [ownership.1.1]
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program valid)
  have definitionsUnique : (program.definitionScopes.map (·.id)).Nodup := by
    have sorted : strictlySortedStrings (program.definitionScopes.map (·.id.value)) = true := by
      simp only [programWellFormed, Bool.and_eq_true] at valid
      grind
    apply List.Pairwise.of_map (S := (· ≠ ·)) DefinitionScopeId.value
      (fun _ _ different same => different (congrArg DefinitionScopeId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ sorted
  obtain ⟨operation, member, parsed⟩ := List.mem_filterMap.mp declaredEntry
  have respects := List.all_eq_true.mp ownership.2 operation member
  cases operation <;> simp only [sequentialScopeEntry?, Option.some.injEq] at parsed <;> try contradiction
  rename_i id origin input childEntry childScope output collection item mappings condition
  subst entry
  unfold operationRespectsScopes at respects
  split at respects <;> try contradiction
  rename_i owner ownerFound
  change (program.operationScopes.find? (fun binding => decide (binding.operationId = id))).map (·.scopeId) = some owner at ownerFound
  simp only [Bool.and_eq_true] at respects
  have parentPlaces := respects.1.1
  change (((program.controlPlaceScopes.find? (fun binding => decide (binding.controlPlaceId = input))).map (·.scopeId) == some owner) &&
    (((program.controlPlaceScopes.find? (fun binding => decide (binding.controlPlaceId = output))).map (·.scopeId) == some owner) && true)) = true at parentPlaces
  simp only [Bool.and_eq_true, Bool.and_true, beq_iff_eq] at parentPlaces
  have childPlace := respects.1.2
  change (((program.controlPlaceScopes.find? (fun binding => decide (binding.controlPlaceId = childEntry))).map (·.scopeId) == some childScope) && true) = true at childPlace
  simp only [Bool.and_true, beq_iff_eq] at childPlace
  have inputBinding := programGraphWellFormed_exactPlaceBinding program input owner graph placesUnique
    parentPlaces.1
  have childLookup : (program.definitionScopes.find? (fun scope => decide (scope.id = childScope))).any
      (fun scope => scope.parentScopeId == some owner && scope.originElementId == origin.elementId) = true := respects.2
  cases found : program.definitionScopes.find? (fun scope => decide (scope.id = childScope)) with
  | none => simp [found] at childLookup
  | some definition =>
      have definitionMember := List.mem_of_find?_eq_some found
      have definitionId : definition.id = childScope := by simpa using List.find?_some found
      simp only [found, Option.any_some, Bool.and_eq_true, beq_iff_eq] at childLookup
      have census := filter_key_eq_singleton_of_nodup program.definitionScopes (·.id) definition definitionsUnique definitionMember
      have parentScope : parent.definitionScopeId = owner := by
        rcases witness with present | ⟨body, bodyMember, bodyParent, bodyScope⟩
        · exact (sequentialScope_present_token_static_scope program hosting before
            ⟨input, parent⟩ owner position running present inputBinding.2).2
        · obtain ⟨_, runtimeDefinition, runtimeMember, runtimeId, ancestry⟩ :=
            runtimePositionValid_scope_parent_binding program hosting hosting before position running body bodyMember
          have sameDefinition : runtimeDefinition = definition := by
            have selected : runtimeDefinition ∈ program.definitionScopes.filter
                (fun candidate => decide (candidate.id = definition.id)) :=
              List.mem_filter.mpr ⟨runtimeMember, by simp [runtimeId, bodyScope, definitionId]⟩
            rw [census] at selected
            exact List.mem_singleton.mp selected
          rcases ancestry with ⟨_, impossible⟩ | ⟨actualParent, actual, static, _, _⟩
          · rw [bodyParent] at impossible; contradiction
          · have sameParent : actualParent = parent := Option.some.inj (actual.symm.trans bodyParent)
            rw [sameParent, sameDefinition] at static
            exact Option.some.inj (static.symm.trans childLookup.1)
      have lookup : uniqueDefinitionScope? program childScope = some definition := by
        unfold uniqueDefinitionScope?
        rw [← definitionId, census]
        have bindings := (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp position).1).2
        have source := List.all_eq_true.mp (Bool.and_eq_true_iff.mp bindings).2 definition definitionMember
        obtain ⟨sole, exactSource⟩ := List.length_eq_one_iff.mp (of_decide_eq_true source)
        dsimp only
        rw [exactSource]
      have childBinding := programGraphWellFormed_exactPlaceBinding program childEntry childScope graph placesUnique
        childPlace
      have outputBinding := programGraphWellFormed_exactPlaceBinding program output owner graph placesUnique
        parentPlaces.2
      have owned : FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program
          (.enterSequentialMultiInstanceScope id origin input childEntry childScope output collection item mappings condition) parent = true := by
        cases bindingFound : program.operationScopes.find? (fun binding => decide (binding.operationId = id)) with
        | none => simp [bindingFound] at ownerFound
        | some binding =>
            have key : binding.operationId = id := by simpa using List.find?_some bindingFound
            have exactBinding := filter_key_eq_singleton_of_nodup program.operationScopes (·.operationId)
              binding operationKeys (List.mem_of_find?_eq_some bindingFound)
            simp only [bindingFound, Option.map_some, Option.some.injEq] at ownerFound
            unfold FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy
            change (match program.operationScopes.filter (fun candidate => decide (candidate.operationId = id)) with
              | [binding] => decide (binding.scopeId = parent.definitionScopeId) | _ => false) = true
            rw [← key, exactBinding]
            simp [ownerFound, parentScope]
      have entryLimit := scope_entry_limit program definition valid definitionMember
      have enteredMember : .enterSequentialMultiInstanceScope id origin input childEntry childScope output collection item mappings condition ∈
          program.operations.filter (fun operation => decide (enteredChildScopeId? operation = some definition.id)) :=
        List.mem_filter.mpr ⟨member, by simp [enteredChildScopeId?, definitionId]⟩
      have entryCount : (program.operations.filter (fun operation => decide (enteredChildScopeId? operation = some definition.id))).length = 1 := by
        have positive := List.length_pos_of_mem enteredMember
        rw [childLookup.1] at entryLimit
        simp only [Option.isNone_some, Bool.false_eq_true, ite_false] at entryLimit
        omega
      obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp entryCount
      have exactEntry := enteredMember
      rw [singleton, List.mem_singleton] at exactEntry
      rw [← exactEntry] at singleton
      refine ⟨definition, lookup, childLookup.1.trans (congrArg some parentScope.symm), childLookup.2, ?_, ?_, childBinding.2, ?_⟩
      · intro activation
        unfold scopeOperationBindingValid
        apply decide_eq_true
        suffices narrowed : (program.operations.filter _) =
            [.enterSequentialMultiInstanceScope id origin input childEntry childScope output collection item mappings condition] by
          rw [narrowed]; rfl
        apply filter_singleton_of_subpredicate program.operations _ _ _ singleton
        · intro candidate _ accepted
          split at accepted <;> try contradiction
          cases candidate <;> simp only at accepted <;> try contradiction
          all_goals apply decide_eq_true
          all_goals simp only [enteredChildScopeId?, Bool.and_eq_true, decide_eq_true_eq] at accepted ⊢
          all_goals exact congrArg some (accepted.1.trans definitionId.symm)
        · simp [owned, childLookup.2]
      · intro port selected
        have alternatives : port = childEntry ∨ port = output := by simpa using selected
        rcases alternatives with rfl | rfl
        · exact childBinding.1
        · exact outputBinding.1
      · simpa only [parentScope] using outputBinding.2

theorem sequentialScope_entry_static_binding (program : Program) (entry : SequentialScopeEntry)
    (before : RuntimeState) (hosting : SemanticId) (parent : ScopeOccurrenceId)
    (valid : programWellFormed program = true)
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (declaredEntry : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (present : ({placeId := entry.input, owner := parent} : ControlToken) ∈ before.tokens) :
    ∃ definition, uniqueDefinitionScope? program entry.childScopeId = some definition ∧
      definition.parentScopeId = some parent.definitionScopeId ∧ definition.originElementId = entry.elementId ∧
      (∀ activation, scopeOperationBindingValid program
        ⟨⟨parent.processInstanceId, entry.childScopeId, activation⟩, some parent⟩ definition = true) ∧
      (∀ port ∈ [entry.childEntry, entry.normalOutput], ∃ place,
        program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place]) ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = entry.childEntry)) =
        [{controlPlaceId := entry.childEntry, scopeId := entry.childScopeId}] ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = entry.normalOutput)) =
        [{controlPlaceId := entry.normalOutput, scopeId := parent.definitionScopeId}] := by
  exact smis_entry_static_binding program entry before hosting parent valid position running declaredEntry (Or.inl present)

theorem sequentialScope_live_body_static_binding (program : Program) (entry : SequentialScopeEntry)
    (before : RuntimeState) (hosting : SemanticId) (parent : ScopeOccurrenceId)
    (valid : programWellFormed program = true)
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (declaredEntry : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (body : RuntimeScopeOccurrence) (member : body ∈ before.scopeOccurrences)
    (bodyParent : body.parent = some parent) (bodyScope : body.id.definitionScopeId = entry.childScopeId) :
    ∃ definition, uniqueDefinitionScope? program entry.childScopeId = some definition ∧
      definition.parentScopeId = some parent.definitionScopeId ∧ definition.originElementId = entry.elementId ∧
      (∀ activation, scopeOperationBindingValid program
        ⟨⟨parent.processInstanceId, entry.childScopeId, activation⟩, some parent⟩ definition = true) ∧
      (∀ port ∈ [entry.childEntry, entry.normalOutput], ∃ place,
        program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place]) ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = entry.childEntry)) =
        [{controlPlaceId := entry.childEntry, scopeId := entry.childScopeId}] ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = entry.normalOutput)) =
        [{controlPlaceId := entry.normalOutput, scopeId := parent.definitionScopeId}] := by
  exact smis_entry_static_binding program entry before hosting parent valid position running declaredEntry
    (Or.inr ⟨body, member, bodyParent, bodyScope⟩)

/-- SMIS-ADMIT-01 excludes compensation and the four unrelated Task-MI/Message operation families. -/
theorem sequentialScope_admitted_runtime_domain (program : Program)
    (control : SequentialScopeControl.Analysis)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (admitted : SequentialScopeProgram.admitted program = true) :
    (program.compensationActivityRetention = none ∧
      program.compensationEventSubProcessSnapshots = none ∧ program.compensationExecution = none) ∧
    (∀ operation ∈ program.operations,
      operation.kind ≠ .awaitSequentialMultiInstanceUserTask ∧ operation.kind ≠ .awaitParallelMultiInstanceUserTask ∧
      operation.kind ≠ .awaitMessageBoundedUserTask ∧ operation.kind ≠ .awaitMessageMonitoredUserTask) := by
  have exclusions : program.compensationActivityRetention = none ∧
      program.compensationEventSubProcessSnapshots = none ∧ program.compensationExecution = none := by
    have checked := analyzed
    unfold SequentialScopeControl.analyze at checked
    split at checked <;> try contradiction
    have retention : program.compensationActivityRetention.isSome = false := by grind
    have snapshots : program.compensationEventSubProcessSnapshots.isSome = false := by grind
    have execution : program.compensationExecution.isSome = false := by grind
    constructor
    · cases value : program.compensationActivityRetention <;>
        simp_all only [Option.isSome_some, Bool.true_eq_false]
    · constructor
      · cases value : program.compensationEventSubProcessSnapshots <;>
          simp_all only [Option.isSome_some, Bool.true_eq_false]
      · cases value : program.compensationExecution <;>
          simp_all only [Option.isSome_some, Bool.true_eq_false]
  have domain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitSequentialMultiInstanceUserTask ∧ operation.kind ≠ .awaitParallelMultiInstanceUserTask ∧
      operation.kind ≠ .awaitMessageBoundedUserTask ∧ operation.kind ≠ .awaitMessageMonitoredUserTask := by
    have checked := admitted
    simp only [SequentialScopeProgram.admitted, analyzed, Bool.and_eq_true] at checked
    have allowed : program.operations.all SequentialScopeProgram.operationAllowed = true := by grind
    intro operation member
    have accepted := List.all_eq_true.mp allowed operation member
    cases operation <;> simp only [SequentialScopeProgram.operationAllowed, Bool.false_eq_true] at accepted <;>
      simp [SemanticOperation.kind]
  exact ⟨exclusions, domain⟩

/-- Admitted same-scope Task continuations inherit exact declared output ports from their actual wait correspondence. -/
theorem sequentialScope_ingress_output_ports (program : Program) (state : RuntimeState)
    (valid : programWellFormed program = true)
    (flow : flowNodeOccurrenceWaitProgramValidity program state = true)
    (domain : ∀ operation ∈ program.operations, operation.kind ≠ .awaitParallelMultiInstanceUserTask) :
    ∀ port owner,
      (∃ wait ∈ state.waits, wait.output = port ∧ wait.owner = owner) ∨
      (∃ wait ∈ state.effectWaits, wait.output = port ∧ wait.owner = owner) →
      (∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place]) ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = port)) =
        [{ controlPlaceId := port, scopeId := owner.definitionScopeId }] := by
  have operations : (program.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program valid)
  have places : (program.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program valid)
  have userDomain : UserTaskDirectContinuationDomain program := by
    intro operation member
    have excluded := domain operation member
    cases operation <;> try trivial
  have humans : flowNodeOccurrenceUserTaskProgramValidity program state = true := by
    simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at flow
    exact flow.1.1.1
  have effects : flowNodeOccurrenceEffectProgramValidity program state = true := (Bool.and_eq_true_iff.mp flow).2
  have declared (operation : SemanticOperation) (port : ControlPlaceId) (owner : ScopeOccurrenceId)
      (member : operation ∈ program.operations) (owned : FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program operation owner = true)
      (shared : operationControlPlacesShareOwner operation = true) (included : port ∈ operationControlPlaces operation) :
      (∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place]) ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = port)) =
        [{ controlPlaceId := port, scopeId := owner.definitionScopeId }] := by
    obtain ⟨scope, place, operationScope, portScope, census⟩ := programGraphWellFormed_operationControlPlaceScope program
      operation port (programWellFormed_graph program valid) operations places member shared included
    have same : scope = owner.definitionScopeId := by
      unfold FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy at owned
      rw [operationScope] at owned
      simpa using owned
    exact ⟨⟨place, census⟩, by simpa only [same] using portScope⟩
  intro port owner selected
  rcases selected with ⟨wait, member, rfl, rfl⟩ | ⟨wait, member, rfl, rfl⟩
  · obtain ⟨_, operation, member, owned, shared, included⟩ :=
      flowNodeOccurrenceUserTaskProgramValidity_output_binding program state wait humans member userDomain
    exact declared operation wait.output wait.owner member owned shared included
  · obtain ⟨_, operation, member, owned, shared, included⟩ :=
      flowNodeOccurrenceEffectProgramValidity_output_binding program state wait effects member
    exact declared operation wait.output wait.owner member owned shared included


/-- Structural admission identifies every consumed body port with the selected child definition scope. -/
theorem sequentialScope_body_operation_ports (program : Program) (operation : SemanticOperation)
    (scope : DefinitionScopeId) (valid : programWellFormed program = true)
    (member : operation ∈ program.operations)
    (owned : program.operationScopes.any (fun ownership => decide
      (ownership.operationId = operation.id && ownership.scopeId = scope)) = true)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd]) :
    bodyConsumedPorts operation ≠ [] ∧ (bodyConsumedPorts operation).Nodup ∧
      ∀ port ∈ bodyConsumedPorts operation,
        program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = port)) =
          [{ controlPlaceId := port, scopeId := scope }] := by
  have operations : (program.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program valid)
  have places : (program.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program valid)
  have structural := List.all_eq_true.mp (programWellFormed_operations program valid) operation member
  have shared : operationControlPlacesShareOwner operation = true := by
    cases operation <;> simp_all [SemanticOperation.kind, operationControlPlacesShareOwner]
  have included : ∀ port ∈ bodyConsumedPorts operation, port ∈ operationControlPlaces operation := by
    intro port selectedPort
    unfold operationControlPlaces
    apply List.mem_append_left
    cases operation <;> simp only [SemanticOperation.kind] at kind <;> try simp at kind
    all_goals exact selectedPort
  have ports : ∀ port ∈ bodyConsumedPorts operation,
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = port)) =
        [{ controlPlaceId := port, scopeId := scope }] := by
    intro port selected
    obtain ⟨actual, _, owner, portScope, _⟩ := programGraphWellFormed_operationControlPlaceScope program
      operation port (programWellFormed_graph program valid) operations places member shared (included port selected)
    have same : actual = scope := by
      obtain ⟨ownership, present, matched⟩ := List.any_eq_true.mp owned
      have matchedFacts : ownership.operationId = operation.id ∧ ownership.scopeId = scope := by
        simpa only [decide_eq_true_eq, Bool.and_eq_true] using matched
      have selectedOwner : ownership ∈ program.operationScopes.filter
          (fun ownership => decide (ownership.operationId = operation.id)) :=
        List.mem_filter.mpr ⟨present, by simpa using matchedFacts.1⟩
      rw [owner, List.mem_singleton] at selectedOwner
      simpa [selectedOwner] using matchedFacts.2
    simpa [same] using portScope
  refine ⟨?_, ?_, ports⟩
  all_goals cases operation <;> simp_all [SemanticOperation.kind, bodyConsumedPorts]
  all_goals rename_i id origin inputs output
  · have size : inputs.length ≥ 2 := by
      with_unfolding_all simp only [operationWellFormed, Bool.and_eq_true] at structural
      grind
    intro empty
    simp [empty] at size
  · have sorted : strictlySortedStrings (inputs.map (·.value)) = true := by
      with_unfolding_all simp only [operationWellFormed, Bool.and_eq_true] at structural
      exact structural.1.1.2
    exact List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
      (strictlySortedStrings_nodup _ sorted)

/-- Admission rejects another operation declaring the same runtime wait key. -/
theorem sequentialScope_wait_declarer_unique (program : Program) (left right : SemanticOperation)
    (key : WaitDeclarationKey) (valid : programWellFormed program = true)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftDeclares : operationDeclaresWaitKey left key = true)
    (rightDeclares : operationDeclaresWaitKey right key = true) : left = right := by
  have census := programWellFormed_waitDeclarer program left key valid leftMember leftDeclares
  have selected : right ∈ program.operations.filter (fun operation => operationDeclaresWaitKey operation key) :=
    List.mem_filter.mpr ⟨rightMember, rightDeclares⟩
  rw [census, List.mem_singleton] at selected
  exact selected.symm

/-- Runtime Service element identity is the admitted declaration identity. -/
theorem sequentialScope_effect_runtime_declarer (program : Program) (operation : SemanticOperation)
    (valid : programWellFormed program = true) (member : operation ∈ program.operations) :
    match operation with
    | .awaitEffect _ _ _ _ effect _ =>
        operationDeclaresWaitKey operation (effectWaitDeclarationKey effect.elementId) = true
    | _ => True := by
  have structural := List.all_eq_true.mp (programWellFormed_operations program valid) operation member
  cases operation <;> try trivial
  rename_i id origin input output effect route
  have same : origin.elementId = effect.elementId := by
    with_unfolding_all simp only [operationWellFormed, Bool.and_eq_true, decide_eq_true_eq] at structural
    grind
  simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, same]

end BpmnSemantics.SemanticProcess
