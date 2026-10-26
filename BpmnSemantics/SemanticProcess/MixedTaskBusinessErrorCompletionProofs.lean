module

public import BpmnSemantics.SemanticProcess.MixedTaskControlFlowDataProofs
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission

/-! MBERR-MAP-01 and MBERR-DATA-01 connect primitive occurrence-owned Error completion to the shared continuation invariant. The successor and its data are derived from exact local-result validity, not supplied as successful-completion premises. Public admission and actual-Start preservation remain separate assembly obligations. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.MixedTaskControlFlow

theorem valid_business_error_maps_and_establishes_continuation_data
    (vertices : List Vertex) (vertex : Vertex) (target : String)
    (handlers sources : List String) (inputs : List VariableMapping)
    (before : RuntimeState) (effectId : EffectOccurrenceId) (wait : EffectWait)
    (localScope : ActivityVariableScope) (route : BpmnErrorRoute) (message : Option String)
    (patch : List VariableBinding) (member : vertex ∈ vertices)
    (output : target ∈ vertex.outputs) (writes : vertex.writes = wait.outputMappings.map (·.target))
    (available : InputsAvailable vertices vertex.id before.variables.process.bindings)
    (canonical : SerialBusinessTask.bindingsValid handlers before.variables.process.bindings = true)
    (mappings : SerialBusinessTask.mappingsValid handlers inputs wait.outputMappings = true)
    (occurrence : before.effectWaits.filter (effectIdNamesWait effectId) = [wait])
    (owned : before.variables.activities.filter (activityScopeMatches effectId) = [localScope])
    (attached : wait.bpmnErrorRoute = some route)
    (collected : wait.outputMappings.mapM (fun mapping => match mapping.expression with
      | .localVariable name => some name | _ => none) = some sources)
    (valid : SerialBusinessTask.bindingsValid handlers patch = true)
    (count : sources.eraseDups.length = patch.length)
    (covered : sources.all (fun name => patch.any (·.name == name)) = true) :
    ∃ bindings,
      completeBusinessEffect? handlers before effectId (.bpmnError route.code message patch) =
        some { before with
          effectWaits := before.effectWaits.erase wait
          variables := { before.variables with
            process := { bindings }
            activities := before.variables.activities.filter (fun scope => !activityScopeMatches effectId scope) }
          tokens := addToken before.tokens route.output wait.owner } ∧
      InputsAvailable vertices target bindings ∧ SerialBusinessTask.bindingsValid handlers bindings = true := by
  obtain ⟨bindings, mapped, available, canonical⟩ := valid_service_patch_establishes_continuation_data
    vertices vertex target handlers sources inputs wait.outputMappings before.variables.process.bindings patch
    member output writes available canonical mappings collected valid count covered
  refine ⟨bindings, ?_, available, canonical⟩
  simp [completeBusinessEffect?, occurrence, effectResultOutput, attached,
    completeSerialActivityScope?, owned, mapped]

theorem business_error_without_matching_route_refuses (handlers : List String)
    (before : RuntimeState) (effectId : EffectOccurrenceId) (wait : EffectWait)
    (code : String) (message : Option String) (patch : List VariableBinding)
    (occurrence : before.effectWaits.filter (effectIdNamesWait effectId) = [wait])
    (unmatched : effectResultOutput wait (.bpmnError code message patch) = none) :
    completeBusinessEffect? handlers before effectId (.bpmnError code message patch) = none := by
  simp [completeBusinessEffect?, occurrence, unmatched]

/-- MBERR-MAP-01 exposes only facts recovered from a successful evaluator result. -/
theorem business_completion_facts (handlers : List String) (before after : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeBusinessEffect? handlers before effectId result = some after) :
    ∃ (wait : EffectWait) (localScope : ActivityVariableScope)
      (patch bindings : List VariableBinding) (output : ControlPlaceId),
      before.effectWaits.filter (effectIdNamesWait effectId) = [wait] ∧
      before.variables.activities.filter (activityScopeMatches effectId) = [localScope] ∧
      (result = .success patch ∨ ∃ code message, result = .bpmnError code message patch) ∧
      effectResultOutput wait result = some output ∧
      serialEffectPatch? handlers wait.outputMappings before.variables.process.bindings patch = some bindings ∧
      after = { before with
        effectWaits := before.effectWaits.erase wait
        variables := { before.variables with
          process := { bindings }
          activities := before.variables.activities.filter (fun scope => !activityScopeMatches effectId scope) }
        tokens := addToken before.tokens output wait.owner } := by
  unfold completeBusinessEffect? at completed
  split at completed
  · rename_i wait occurrence
    obtain ⟨output, selected, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, mapped, completed⟩ := Option.bind_eq_some_iff.mp completed
    let patch := match result with
      | .success patch | .bpmnError _ _ patch => patch
    have resultPatch : result = .success patch ∨ ∃ code message, result = .bpmnError code message patch := by
      cases result <;> simp [patch]
    change completeSerialActivityScope? handlers before.variables effectId
      wait.outputMappings (.success patch) = some variables at mapped
    cases owned : before.variables.activities.filter (activityScopeMatches effectId) with
    | nil => simp [completeSerialActivityScope?, owned] at mapped
    | cons localScope rest =>
        cases rest with
        | cons another rest => simp [completeSerialActivityScope?, owned] at mapped
        | nil =>
            simp only [completeSerialActivityScope?, owned] at mapped
            obtain ⟨bindings, mapping, mapped⟩ := Option.bind_eq_some_iff.mp mapped
            cases mapped
            exact ⟨wait, localScope, patch, bindings, output, occurrence, rfl,
              resultPatch, selected, mapping, (Option.some.inj completed).symm⟩
  · contradiction

theorem serial_completion_is_business_completion (program : Program) (before after : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeSerialEffect? program before effectId result = some after) :
    completeBusinessEffect? (SerialBusinessTask.programHandlers program) before effectId result = some after := by
  have sound := completeSerialEffect_sound program before after effectId result completed
  cases sound with
  | commit wait scope patch bindings occurrence owned mapping =>
      simp [completeBusinessEffect?, occurrence, effectResultOutput,
        completeSerialActivityScope?, owned, mapping]

theorem analyzed_effect_route_admitted (program : Program) (analysis : Analysis)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (analyzed : programAnalysis program = some analysis)
    (member : .awaitEffect id origin input output effect route ∈ program.operations) :
    (route.isNone || (program.identity.semanticProfile == mixedTaskBusinessErrorProfileId)) = true := by
  have valid : programRoutesValid program = true := by
    unfold programAnalysis at analyzed
    obtain ⟨root, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
    split at analyzed
    · contradiction
    · simp_all
  cases route with
  | none => rfl
  | some route =>
      have routeMember : route ∈ programRoutes program := by
        unfold programRoutes
        exact List.mem_filterMap.mpr ⟨.awaitEffect id origin input output effect (some route), member, rfl⟩
      have nonempty : (programRoutes program).isEmpty = false := by
        cases routes : programRoutes program with
        | nil => simp [routes] at routeMember
        | cons first rest => rfl
      have admitted : routesAdmitted program.identity.semanticProfile (!(programRoutes program).isEmpty) = true :=
        (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp valid).1).1
      by_cases selected : program.identity.semanticProfile == mixedTaskBusinessErrorProfileId
      · simpa using selected
      · simp [routesAdmitted, selected, nonempty] at admitted

/-- MBERR-CATCH-01 retains the full route-sensitive ingress census, including old-profile refusal. -/
theorem business_effect_wait_census (program : Program) (wait : EffectWait)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (effect : EffectDefinition) (enabled : Bool)
    (wellFormed : programWellFormed program = true)
    (member : .awaitEffect id origin input wait.output effect wait.bpmnErrorRoute ∈ program.operations)
    (element : effect.elementId = wait.elementId) (descriptor : effect.descriptor = wait.descriptor)
    (outputs : effect.outputMappings = wait.outputMappings)
    (admitted : (wait.bpmnErrorRoute.isNone || enabled) = true)
    (snapshot : inputSnapshotMatches effect.inputMappings wait.arguments = true) :
    program.operations.filter (fun operation => match operation with
      | .awaitEffect _ _ _ output effect none => effect.elementId == wait.elementId &&
          effect.descriptor == wait.descriptor && output == wait.output &&
          effect.outputMappings == wait.outputMappings && wait.bpmnErrorRoute.isNone &&
          inputSnapshotMatches effect.inputMappings wait.arguments
      | .awaitEffect _ _ _ output effect (some route) => enabled &&
          effect.elementId == wait.elementId && effect.descriptor == wait.descriptor &&
          output == wait.output && effect.outputMappings == wait.outputMappings &&
          wait.bpmnErrorRoute == some route &&
          inputSnapshotMatches effect.inputMappings wait.arguments
      | _ => false) = [.awaitEffect id origin input wait.output effect wait.bpmnErrorRoute] := by
  have aligned := programWellFormed_awaitEffect_elements_align program wellFormed
    id origin input wait.output effect wait.bpmnErrorRoute member
  apply SerialBusinessTask.refined_unique_filter program.operations
    (fun operation => operationDeclaresWaitKey operation (effectWaitDeclarationKey wait.elementId)) _
    (.awaitEffect id origin input wait.output effect wait.bpmnErrorRoute)
  · exact programWellFormed_waitDeclarer program _ _ wellFormed member
      (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, aligned, element])
  · intro operation included selected
    cases operation <;> try simp only [Bool.false_eq_true] at selected
    case awaitEffect id origin input output effect route =>
      have aligns := programWellFormed_awaitEffect_elements_align program wellFormed
        id origin input output effect route included
      cases route with
      | none =>
          simp only [Bool.and_eq_true, beq_iff_eq] at selected
          simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, aligns, selected.1.1.1.1.1]
      | some route =>
          simp only [Bool.and_eq_true, beq_iff_eq] at selected
          simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, aligns, selected.1.1.1.1.1.2]
  · cases attached : wait.bpmnErrorRoute with
    | none => simp [element, descriptor, outputs, snapshot]
    | some route =>
        have enabledTrue : enabled = true := by simpa [attached] using admitted
        simp [enabledTrue, element, descriptor, outputs, snapshot]

theorem selected_effect_output_declared (wait : EffectWait) (result : EffectExecutionResult)
    (output : ControlPlaceId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (effect : EffectDefinition)
    (selected : effectResultOutput wait result = some output) :
    output ∈ operationOutputs (.awaitEffect id origin input wait.output effect wait.bpmnErrorRoute) := by
  cases result with
  | success patch =>
      simp only [effectResultOutput, Option.some.injEq] at selected
      subst output
      cases attached : wait.bpmnErrorRoute <;> simp [operationOutputs]
  | bpmnError code message patch =>
      cases attached : wait.bpmnErrorRoute with
      | none => simp [effectResultOutput, attached] at selected
      | some route =>
          simp only [effectResultOutput, attached] at selected
          split at selected
          · cases selected
            simp [operationOutputs]
          · contradiction

theorem effect_activation_issuance_with_route (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId) (effect : EffectDefinition)
    (route : Option BpmnErrorRoute) (issued : SerialBusinessTask.IssuanceFrame state) :
    SerialBusinessTask.IssuanceFrame (activateEffect state instanceId owner input output effect route) := by
  exact SerialBusinessTask.effect_activation_issuance state instanceId owner input output effect issued

theorem business_profile_effect_dispatch_cases (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis)
    (guarded : serialBusinessCommandAdmitted program before (.completeEffect commandId effectId result) = true) :
    dispatchStimulus program before (.completeEffect commandId effectId result) = { outcome := .rejected, state := before } ∨
      ∃ after, completeBusinessEffect? (SerialBusinessTask.programHandlers program) before effectId result = some after ∧
        dispatchStimulus program before (.completeEffect commandId effectId result) = { outcome := .committed, state := after } := by
  rcases profile with old | business
  · rcases guarded_effect_dispatch_cases program analysis before commandId effectId result old analyzed guarded with refused | ⟨after, completed, dispatched⟩
    · exact Or.inl refused
    · exact Or.inr ⟨after, serial_completion_is_business_completion program before after effectId result completed, dispatched⟩
  · obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
    have noCompensation := (admitted_serial_guard_has_no_foreign_effects program before
      (.completeEffect commandId effectId result) (Or.inr business) guarded).2
    cases control : before.control <;>
      simp [dispatchStimulus, snapshots, control, noCompensation, business]
    split
    · contradiction
    · cases completed : completeBusinessEffect? (SerialBusinessTask.programHandlers program) before effectId result with
      | none => simp
      | some after =>
          simp only
          split
          · exact Or.inr ⟨after, rfl, rfl⟩
          · exact Or.inl rfl
    · exact Or.inl rfl

end BpmnSemantics.SemanticProcess.MixedTaskControlFlow
