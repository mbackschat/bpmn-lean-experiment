module

public import BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
public import BpmnSemantics.SemanticProcess.ActivityDataInputOutput
import BpmnSemantics.SemanticProcess.ActivityDataEndpointLaws

/-! Prepared data arming refines Activity activation and preserves the checked binding contract. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Each declaration realizes its existing activation through the same keyed lifetime patch. -/
theorem makeInternalDataArmingPatch_refines_activation
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (owner : ScopeOccurrenceId) (inputOrigin : BpmnSequenceFlowOrigin)
    (bindings : List VariableBinding)
    (owned : onlyTokenOwner? state contract.input = some owner)
    (running : dataArmingHostValid state owner contract.data = true)
    (available : dataArmingBindings? (programPropertyPathValuePolicy program) state owner contract.data = some bindings)
    (fresh : state.variables.activities.any (activityOccurrenceScopeMatches
      (dataInputOutputActivityOwner state owner.processInstanceId contract.taskId)) = false) :
    contract.activate? (programPropertyPathValuePolicy program) state = some (applyInternalDataArmingPatch state
      (makeInternalDataArmingPatch program state contract owner inputOrigin bindings)) := by
  obtain ⟨host, hosted⟩ := dataArmingHostValid_running running
  cases dataEq : contract.data with
  | output directOutput =>
      have sameOwner : owner.processInstanceId = host := by
        simpa [dataArmingHostValid, hosted, dataEq, dataArmingEndpointKindsValid] using running
      have permitted : dataArmingEndpointKindsValid (.output directOutput) = true := rfl
      have ownRunning : state.control = .running owner.processInstanceId := by simpa [sameOwner] using hosted
      simp only [dataArmingBindings?, dataEq, permitted, ite_true,
        InternalDataArmingData.inputAssociation?, Option.some.injEq] at available
      subst bindings
      simp only [InternalDataArmingContract.activate?, dataEq, activateDataOutputUserTask?,
        owned, dataOutputRunningInstance_of_running ownRunning, Option.bind_eq_bind, Option.bind_some]
      rfl
  | input directInput =>
      have facts : dataArmingEndpointKindsValid (.input directInput) = true ∧ owner.processInstanceId = host := by
        simpa [dataArmingHostValid, hosted, dataEq] using running
      have ownRunning : state.control = .running owner.processInstanceId := by simpa [facts.2] using hosted
      simp only [dataArmingBindings?, dataEq, facts.1, ite_true,
        InternalDataArmingData.inputAssociation?] at available
      obtain ⟨source, sourceFound, bindingsEq⟩ := Option.bind_eq_some_iff.mp available
      simp only [pure, Option.some.injEq] at bindingsEq
      subst bindings
      have inputSource : dataInputSourceBinding? state directInput = some source := by
        cases endpoint : directInput.source with
        | processDataInput port => simp [dataArmingEndpointKindsValid, endpoint] at facts
        | property propertyId =>
            simp only [dataInputOutputSourceBinding?, readActivityDataInput?, endpoint,
              activityDataPropertyOwner, ownRunning, decide_true, ite_true] at sourceFound
            unfold dataInputSourceBinding?
            simp only [endpoint]
            split at sourceFound
            · split at sourceFound
              · cases sourceFound; simp_all
              · simp at sourceFound
            · simp at sourceFound
      simp only [InternalDataArmingContract.activate?, dataEq, activateDataInputUserTask?,
        owned, dataInputRunningInstance_of_running ownRunning, inputSource,
        Option.bind_eq_bind, Option.bind_some]
      rfl
  | inputOutput directInput directOutput =>
      simp only [dataArmingBindings?, dataEq, dataArmingEndpointKindsValid, ite_true,
        InternalDataArmingData.inputAssociation?] at available
      obtain ⟨source, sourceFound, bindingsEq⟩ := Option.bind_eq_some_iff.mp available
      simp only [pure, Option.some.injEq] at bindingsEq
      subst bindings
      simp only [InternalDataArmingContract.activate?, dataEq, activateDataInputOutputUserTask?,
        owned, dataInputOutputRunningInstance_of_running hosted, sourceFound,
        Option.bind_eq_bind, Option.bind_some]
      rw [show state.variables.activities.any (activityOccurrenceScopeMatches
        { processInstanceId := owner.processInstanceId,
          activityElementId := ⟨contract.taskId.value⟩,
          activation := activityActivationCount state contract.taskId + 1 }) = false from fresh]
      rfl

/-- Preparation fixes every argument consumed by the existing activation. -/
theorem prepareInternalDataArmingContract_refines_activation
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    contract.activate? (programPropertyPathValuePolicy program) state = some (applyInternalDataArmingPatch state patch) := by
  obtain ⟨owner, inputOrigin, source, owned, running, _, _, _, available, _, _, fresh, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  apply makeInternalDataArmingPatch_refines_activation program state contract owner inputOrigin
    source owned running available
  simpa [makeInternalDataArmingPatch, dataInputOutputActivityRecord, activityOwnerForRecord,
    dataInputOutputActivityOwner] using fresh

private theorem selectedOperation_mem (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (selected : exactProgramSelection program operation owner = true) :
    operation ∈ program.operations := by
  simp only [exactProgramSelection, Bool.and_eq_true, decide_eq_true_eq] at selected
  have positive : 0 < (program.operations.filter fun candidate => decide (candidate = operation)).length := by
    omega
  obtain ⟨candidate, filtered⟩ := List.exists_mem_of_ne_nil _ (List.length_pos_iff.mp positive)
  obtain ⟨member, same⟩ := List.mem_filter.mp filtered
  simp only [decide_eq_true_eq] at same
  simpa [same] using member

def InternalDataArmingContract.ActivationStep (contract : InternalDataArmingContract)
    (program : Program) (before after : RuntimeState) : Prop :=
  match contract.data with
  | .input _ => DataInputActivationStep program before after
  | .output _ => DataOutputActivationStep program before after
  | .inputOutput _ _ => DataInputOutputActivationStep program before after

/-- Preparation realizes the declaration's existing transition relation; it selects no profile. -/
theorem prepareInternalDataArmingContract_sound
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    contract.ActivationStep program state (applyInternalDataArmingPatch state patch) := by
  obtain ⟨owner, _, _, _, _, selected, _⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  have declared := selectedOperation_mem program contract.operation owner selected
  have activated := prepareInternalDataArmingContract_refines_activation program state contract patch
    prepared
  cases dataEq : contract.data with
  | input directInput =>
      simp only [InternalDataArmingContract.ActivationStep, dataEq]
      exact activateDataInputUserTask_sound program state _ contract.operationId
        contract.origin contract.input contract.output contract.taskId contract.taskName directInput
        (by simpa [InternalDataArmingContract.operation, dataEq] using declared)
        (by simpa [InternalDataArmingContract.activate?, dataEq] using activated)
  | output directOutput =>
      simp only [InternalDataArmingContract.ActivationStep, dataEq]
      exact activateDataOutputUserTask_sound program state _ contract.operationId
        contract.origin contract.input contract.output contract.taskId contract.taskName directOutput
        (by simpa [InternalDataArmingContract.operation, dataEq] using declared)
        (by simpa [InternalDataArmingContract.activate?, dataEq] using activated)
  | inputOutput directInput directOutput =>
      simp only [InternalDataArmingContract.ActivationStep, dataEq]
      exact activateDataInputOutputUserTask_sound program state _ contract.operationId
        contract.origin contract.input contract.output contract.taskId contract.taskName directInput
        directOutput (by simpa [InternalDataArmingContract.operation, dataEq] using declared)
        (by simpa [InternalDataArmingContract.activate?, dataEq] using activated)

/-- The operation-facing preparation preserves the same declarative transition guarantee. -/
theorem prepareInternalDataArm_sound
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArm? program state operation = some patch) :
    ∃ contract, dataArmingContract? operation = some contract ∧
      contract.ActivationStep program state (applyInternalDataArmingPatch state patch) := by
  obtain ⟨contract, decoded, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  exact ⟨contract, decoded, prepareInternalDataArmingContract_sound program state contract patch prepared⟩

theorem dataArmingBindings_composed_process_input
    {policy : PropertyPathValuePolicy} {state : RuntimeState} {owner : ScopeOccurrenceId}
    {input : DirectActivityDataInput} (output : DirectActivityDataOutput) {port : String}
    {scope : ProcessInterfaceScope} {source : VariableBinding}
    (endpoint : input.source = .processDataInput port)
    (uniqueOwner : state.variables.processInterfaces.filter
      (fun candidate => decide (candidate.owner = owner)) = [scope])
    (uniquePort : scope.inputs.filter (fun candidate => decide (candidate.name = port)) = [source])
    (scalar : processInterfaceScalar source.value = true) :
    dataArmingBindings? policy state owner (.inputOutput input output) =
      some [{ name := input.targetDataInputId, value := source.value }] := by
  have available : dataInputOutputSourceBinding? policy state owner input = some source := by
    rw [dataInputOutputSourceBinding?, readActivityDataInput_interface_exact endpoint]
    exact readProcessInterfaceInput_iff.mpr
      ⟨scope, selectProcessInterface_iff.mpr uniqueOwner, uniquePort, scalar⟩
  simp [dataArmingBindings?, dataArmingEndpointKindsValid,
    InternalDataArmingData.inputAssociation?, available]

/-- Caller Properties are unrestricted in this witness: the complete selected Process-input owner
and port alone determine the prepared snapshot, including when its value is null. -/
theorem prepareComposedProcessInput_copiesOwnedBinding
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (owner : ScopeOccurrenceId) (host : SemanticId) (inputOrigin : BpmnSequenceFlowOrigin)
    (input : DirectActivityDataInput) (output : DirectActivityDataOutput) (port : String)
    (scope : ProcessInterfaceScope) (source : VariableBinding)
    (family : contract.data = .inputOutput input output)
    (running : state.control = .running host)
    (owned : onlyTokenOwner? state contract.input = some owner)
    (endpoint : input.source = .processDataInput port)
    (uniqueOwner : state.variables.processInterfaces.filter
      (fun candidate => decide (candidate.owner = owner)) = [scope])
    (uniquePort : scope.inputs.filter (fun candidate => decide (candidate.name = port)) = [source])
    (scalar : processInterfaceScalar source.value = true)
    (selected : exactProgramSelection program contract.operation owner = true)
    (live : exactLiveOccurrence state owner = true)
    (origin : selectedInputOrigin? program contract.input owner = some inputOrigin)
    (unique : uniqueFamilyDeclarer? program contract.operation .userTask ⟨contract.taskId.value⟩ = true) :
    let bindings := [{ name := input.targetDataInputId, value := source.value }]
    let patch := makeInternalDataArmingPatch program state contract owner inputOrigin bindings
    openWaitAnchorAbsent state patch.arm.write.occurrence = true →
    state.variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord patch.record)) = false →
    state.activityOccurrences.any (fun record => sameActivityOccurrence record patch.record ||
      !activityBodyClaimsDisjoint record patch.record) = false →
    prepareInternalDataArmingContract? program state contract = some patch ∧
      patch.arm.runtimeInstanceId = host ∧
      patch.arm.write.occurrence.processInstanceId = owner.processInstanceId ∧
      patch.record.processInstanceId = owner.processInstanceId ∧ patch.bindings = bindings := by
  dsimp only
  intro anchor fresh claims
  refine ⟨?_, ?_, rfl, rfl, rfl⟩
  · apply prepareInternalDataArmingContract_of_premises program state contract owner inputOrigin _
      owned _ selected live origin _ unique anchor fresh claims
    · simp [dataArmingHostValid, running, family, dataArmingEndpointKindsValid]
    · simpa [family] using dataArmingBindings_composed_process_input output endpoint uniqueOwner uniquePort scalar
  · simp [makeInternalDataArmingPatch, dataInputOutputRunningInstance?, running]

theorem prepareComposedProcessInput_duplicate_owner_refused
    {program : Program} {state : RuntimeState} {contract : InternalDataArmingContract}
    {owner : ScopeOccurrenceId} {input : DirectActivityDataInput} {output : DirectActivityDataOutput}
    {port : String} {first second : ProcessInterfaceScope} {rest : List ProcessInterfaceScope}
    (family : contract.data = .inputOutput input output)
    (owned : onlyTokenOwner? state contract.input = some owner)
    (endpoint : input.source = .processDataInput port)
    (duplicates : state.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) =
      first :: second :: rest) : prepareInternalDataArmingContract? program state contract = none := by
  apply prepareInternalDataArmingContract_unavailable_source owned
  have refused : dataInputOutputSourceBinding? (programPropertyPathValuePolicy program) state owner input = none :=
    readActivityDataInput_duplicate_interfaces_refused endpoint duplicates
  simp [dataArmingBindings?, family, dataArmingEndpointKindsValid,
    InternalDataArmingData.inputAssociation?, refused]

end BpmnSemantics.SemanticProcess.InternalCommutation
