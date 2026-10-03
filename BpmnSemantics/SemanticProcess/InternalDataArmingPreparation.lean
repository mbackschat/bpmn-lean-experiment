import BpmnSemantics.SemanticProcess.InternalCommutationCore
import BpmnSemantics.SemanticProcess.ActivityDataInputOutput

/-! # Prepared Activity-data arming

One predecessor selects any copied input and both occurrence identities. Applying that patch must
realize the existing activation before any commutation or publication claim can use it.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalDataArmingData where
  | input (association : DirectActivityDataInput)
  | output (association : DirectActivityDataOutput)
  | inputOutput (input : DirectActivityDataInput) (output : DirectActivityDataOutput)
  deriving Repr, DecidableEq

structure InternalDataArmingContract where
  operationId : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  output : ControlPlaceId
  taskId : TaskDefinitionId
  taskName : Option String
  data : InternalDataArmingData
  deriving Repr, DecidableEq

def InternalDataArmingContract.operation (contract : InternalDataArmingContract) :
    SemanticOperation :=
  match contract.data with
  | .input directInput => .awaitDataInputUserTask contract.operationId contract.origin
      contract.input contract.output contract.taskId contract.taskName directInput
  | .output directOutput => .awaitDataOutputUserTask contract.operationId contract.origin
      contract.input contract.output contract.taskId contract.taskName directOutput
  | .inputOutput directInput directOutput => .awaitDataInputOutputUserTask contract.operationId
      contract.origin contract.input contract.output contract.taskId contract.taskName directInput
      directOutput

def InternalDataArmingContract.activate? (contract : InternalDataArmingContract)
    (state : RuntimeState) : Option RuntimeState :=
  match contract.data with
  | .input directInput => activateDataInputUserTask? state contract.input contract.output
      contract.taskId contract.taskName directInput
  | .output _ => activateDataOutputUserTask? state contract.input contract.output
      contract.taskId contract.taskName
  | .inputOutput directInput _ => activateDataInputOutputUserTask? state contract.input
      contract.output contract.taskId contract.taskName directInput

def InternalDataArmingData.inputAssociation? : InternalDataArmingData → Option DirectActivityDataInput
  | .input directInput | .inputOutput directInput _ => some directInput
  | .output _ => none

/-- Standalone input retains its Property source. Output arming remains descriptor-free; its
Property-only destination restriction belongs to completion (CDATA-OWNER-01). -/
def dataArmingEndpointKindsValid : InternalDataArmingData → Bool
  | .input association => match association.source with
      | .property _ => true
      | .processDataInput _ => false
  | .output _ => true
  | .inputOutput _ _ => true

/-- Running control identifies the host, while a composed task derives its identity from its token.
Standalone families retain their original host-owned occurrence account. -/
def dataArmingHostValid (state : RuntimeState) (owner : ScopeOccurrenceId)
    (data : InternalDataArmingData) : Bool :=
  match state.control with
  | .running instanceId =>
      dataArmingEndpointKindsValid data &&
        match data with
        | .input _ | .output _ => decide (owner.processInstanceId = instanceId)
        | .inputOutput _ _ => true
  | _ => false

/-- ADOUTPUT entry owns an empty local scope without reading the Property written at completion.
Copied values use the full selected owner; null is available while absence or ambiguity refuses. -/
def dataArmingBindings? (state : RuntimeState) (owner : ScopeOccurrenceId)
    (data : InternalDataArmingData) : Option (List VariableBinding) :=
  if dataArmingEndpointKindsValid data then
    match data.inputAssociation? with
    | none => some []
    | some directInput => do
        let source ← dataInputOutputSourceBinding? state owner directInput
        pure [{ name := directInput.targetDataInputId, value := source.value }]
  else none

theorem dataArmingBindings_process_frame (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (data : InternalDataArmingData)
    (control : after.control = before.control)
    (same : after.variables.process = before.variables.process)
    (interfaces : after.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) =
      before.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner))) :
    dataArmingBindings? after owner data = dataArmingBindings? before owner data := by
  simp only [dataArmingBindings?, dataInputOutputSourceBinding?, readActivityDataInput?,
    activityDataPropertyOwner, readProcessInterfaceInput?, selectProcessInterface?, control, same,
    interfaces]
  rfl

theorem dataArmingHostValid_running {state : RuntimeState} {owner : ScopeOccurrenceId}
    {data : InternalDataArmingData} (valid : dataArmingHostValid state owner data = true) :
    ∃ host, state.control = .running host := by
  unfold dataArmingHostValid at valid
  split at valid
  · exact ⟨_, ‹state.control = _›⟩
  · simp at valid

theorem dataArmingHostValid_frame (before after : RuntimeState) (owner : ScopeOccurrenceId)
    (data : InternalDataArmingData) (same : after.control = before.control) :
    dataArmingHostValid after owner data = dataArmingHostValid before owner data := by
  simp only [dataArmingHostValid, same]

def dataArmingContract? : SemanticOperation → Option InternalDataArmingContract
  | .awaitDataInputUserTask operationId origin input output taskId taskName directInput =>
      some { operationId, origin, input, output, taskId, taskName, data := .input directInput }
  | .awaitDataOutputUserTask operationId origin input output taskId taskName directOutput =>
      some { operationId, origin, input, output, taskId, taskName, data := .output directOutput }
  | .awaitDataInputOutputUserTask operationId origin input output taskId taskName directInput
      directOutput => some
        { operationId, origin, input, output, taskId, taskName,
          data := .inputOutput directInput directOutput }
  | _ => none

theorem dataArmingContract_roundtrip (contract : InternalDataArmingContract) :
    dataArmingContract? contract.operation = some contract := by
  cases contract with
  | mk id origin input output taskId taskName data => cases data <;> rfl

structure InternalDataArmingPatch where
  arm : InternalArmingPatch
  record : ActivityOccurrence
  bindings : List VariableBinding
  deriving Repr, DecidableEq

/-- The Activity-data scope laws keep the task and Activity issuers independent while joining their
lifetimes. Runtime control is a hosting dependency; the selected token owner supplies semantic
Task and Activity identity, including for a called Process (CDATA-OWNER-01). -/
def makeInternalDataArmingPatch (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (owner : ScopeOccurrenceId)
    (inputOrigin : BpmnSequenceFlowOrigin) (bindings : List VariableBinding) :
    InternalDataArmingPatch :=
  { arm :=
      { operation := contract.operation
        definition := program.identity
        processId := program.processId
        origin := contract.origin
        runtimeInstanceId := (dataInputOutputRunningInstance? state).getD owner.processInstanceId
        logicalTimeMs := state.logicalTimeMs
        input := contract.input
        inputOrigin
        owner
        write := .userTask
          { processInstanceId := owner.processInstanceId
            owner
            task := { id := contract.taskId, name := contract.taskName }
            activation := activationCount state contract.taskId + 1
            output := contract.output } }
    record := dataInputOutputActivityRecord state owner.processInstanceId owner contract.taskId
    bindings }

def applyInternalDataArmingPatch (state : RuntimeState)
    (patch : InternalDataArmingPatch) : RuntimeState :=
  { applyInternalArmingPatch state patch.arm with
    activityOccurrences := insertActivityOccurrence patch.record state.activityOccurrences
    activityActivations := setActivationCount state.activityActivations
      ⟨patch.record.activityElementId.value⟩ patch.record.activation
    variables := addActivityOccurrenceVariableScope state.variables
      (activityOwnerForRecord patch.record) patch.bindings }

/-- Each declaration realizes its existing activation through the same keyed lifetime patch. -/
theorem makeInternalDataArmingPatch_refines_activation
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (owner : ScopeOccurrenceId) (inputOrigin : BpmnSequenceFlowOrigin)
    (bindings : List VariableBinding)
    (owned : onlyTokenOwner? state contract.input = some owner)
    (running : dataArmingHostValid state owner contract.data = true)
    (available : dataArmingBindings? state owner contract.data = some bindings)
    (fresh : state.variables.activities.any (activityOccurrenceScopeMatches
      (dataInputOutputActivityOwner state owner.processInstanceId contract.taskId)) = false) :
    contract.activate? state = some (applyInternalDataArmingPatch state
      (makeInternalDataArmingPatch program state contract owner inputOrigin bindings)) := by
  obtain ⟨host, hosted⟩ := dataArmingHostValid_running running
  cases dataEq : contract.data with
  | output directOutput =>
      have sameOwner : owner.processInstanceId = host := by
        simpa [dataArmingHostValid, hosted, dataEq, dataArmingEndpointKindsValid] using running
      have permitted : dataArmingEndpointKindsValid (.output directOutput) = true := rfl
      have ownRunning : state.control = .running owner.processInstanceId := by simpa [sameOwner] using hosted
      simp only [dataArmingBindings?, dataEq, permitted, if_true,
        InternalDataArmingData.inputAssociation?, Option.some.injEq] at available
      subst bindings
      simp only [InternalDataArmingContract.activate?, dataEq, activateDataOutputUserTask?,
        owned, dataOutputRunningInstance_of_running ownRunning, Option.bind_eq_bind, Option.bind_some]
      rfl
  | input directInput =>
      have facts : dataArmingEndpointKindsValid (.input directInput) = true ∧ owner.processInstanceId = host := by
        simpa [dataArmingHostValid, hosted, dataEq] using running
      have ownRunning : state.control = .running owner.processInstanceId := by simpa [facts.2] using hosted
      simp only [dataArmingBindings?, dataEq, facts.1, if_true,
        InternalDataArmingData.inputAssociation?] at available
      obtain ⟨source, sourceFound, bindingsEq⟩ := Option.bind_eq_some_iff.mp available
      simp only [pure, Option.some.injEq] at bindingsEq
      subst bindings
      have inputSource : dataInputSourceBinding? state directInput = some source := by
        cases endpoint : directInput.source with
        | processDataInput port => simp [dataArmingEndpointKindsValid, endpoint] at facts
        | property propertyId =>
            simp only [dataInputOutputSourceBinding?, readActivityDataInput?, endpoint,
              activityDataPropertyOwner, ownRunning, decide_true, if_true] at sourceFound
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
      simp only [dataArmingBindings?, dataEq, dataArmingEndpointKindsValid, if_true,
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

/-- Preparation reads only the predecessor; publication and frame proofs consume this same patch. -/
def prepareInternalDataArmingContract? (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) : Option InternalDataArmingPatch := do
  let owner ← onlyTokenOwner? state contract.input
  if !dataArmingHostValid state owner contract.data ||
      !exactProgramSelection program contract.operation owner ||
      !exactLiveOccurrence state owner then none else pure ()
  let inputOrigin ← selectedInputOrigin? program contract.input owner
  let source ← dataArmingBindings? state owner contract.data
  let patch := makeInternalDataArmingPatch program state contract owner inputOrigin source
  if !uniqueFamilyDeclarer? program contract.operation .userTask ⟨contract.taskId.value⟩ ||
      !openWaitAnchorAbsent state patch.arm.write.occurrence ||
      state.variables.activities.any
        (activityOccurrenceScopeMatches (activityOwnerForRecord patch.record)) ||
      state.activityOccurrences.any (fun record => sameActivityOccurrence record patch.record ||
        !activityBodyClaimsDisjoint record patch.record) then none
  else some patch

def prepareInternalDataArm? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option InternalDataArmingPatch := do
  let contract ← dataArmingContract? operation
  prepareInternalDataArmingContract? program state contract

/-- Successful decoding retains the exact selected operation, including its declared associations. -/
theorem dataArmingContract_operation (operation : SemanticOperation)
    (contract : InternalDataArmingContract)
    (found : dataArmingContract? operation = some contract) :
    contract.operation = operation := by
  cases operation <;> simp [dataArmingContract?] at found
  all_goals cases found; rfl

/-- Every preparation premise belongs to the predecessor, including complete association freshness. -/
theorem prepareInternalDataArmingContract_facts
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    ∃ owner inputOrigin source,
      onlyTokenOwner? state contract.input = some owner ∧
      dataArmingHostValid state owner contract.data = true ∧
      exactProgramSelection program contract.operation owner = true ∧
      exactLiveOccurrence state owner = true ∧
      selectedInputOrigin? program contract.input owner = some inputOrigin ∧
      dataArmingBindings? state owner contract.data = some source ∧
      uniqueFamilyDeclarer? program contract.operation .userTask ⟨contract.taskId.value⟩ = true ∧
      openWaitAnchorAbsent state patch.arm.write.occurrence = true ∧
      state.variables.activities.any
        (activityOccurrenceScopeMatches (activityOwnerForRecord patch.record)) = false ∧
      state.activityOccurrences.any (fun record => sameActivityOccurrence record patch.record ||
        !activityBodyClaimsDisjoint record patch.record) = false ∧
      patch = makeInternalDataArmingPatch program state contract owner inputOrigin source := by
  unfold prepareInternalDataArmingContract? at prepared
  obtain ⟨owner, owned, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  split at prepared
  · simp at prepared
  · next selected =>
      dsimp only [Pure.pure, Bind.bind, Option.bind] at prepared
      obtain ⟨inputOrigin, originFound, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      obtain ⟨source, sourceFound, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      simp_all

/-- Preparation fixes every argument consumed by the existing activation. -/
theorem prepareInternalDataArmingContract_refines_activation
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    contract.activate? state = some (applyInternalDataArmingPatch state patch) := by
  obtain ⟨owner, inputOrigin, source, owned, running, _, _, _, available, _, _, fresh, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  apply makeInternalDataArmingPatch_refines_activation program state contract owner inputOrigin
    source owned running available
  simpa [makeInternalDataArmingPatch, dataInputOutputActivityRecord, activityOwnerForRecord,
    dataInputOutputActivityOwner] using fresh

/-- The existing issuer law transfers through exact activation refinement. -/
theorem prepareInternalDataArmingContract_issuesFreshActivity
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    activityIdentityIssuingDiscipline state (applyInternalDataArmingPatch state patch) = true := by
  obtain ⟨owner, inputOrigin, bindings, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  exact activityIdentityIssuingDiscipline_insertActivityOccurrence state
    (dataInputOutputActivityRecord state owner.processInstanceId owner contract.taskId)
    (by simp [dataInputOutputActivityRecord])

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


theorem dataArmingBindings_property_frame (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (data : InternalDataArmingData)
    (control : after.control = before.control)
    (same : after.variables.process = before.variables.process)
    (properties : ∀ input, data.inputAssociation? = some input →
      ∃ propertyId, input.source = .property propertyId) :
    dataArmingBindings? after owner data = dataArmingBindings? before owner data := by
  cases association : data.inputAssociation? with
  | none => simp [dataArmingBindings?, association]
  | some input =>
      obtain ⟨propertyId, endpoint⟩ := properties input association
      simp [dataArmingBindings?, association, dataInputOutputSourceBinding?, readActivityDataInput?,
        endpoint, activityDataPropertyOwner, control, same]
      rfl

theorem dataArmingBindings_composed_process_input
    {state : RuntimeState} {owner : ScopeOccurrenceId}
    {input : DirectActivityDataInput} (output : DirectActivityDataOutput) {port : String}
    {scope : ProcessInterfaceScope} {source : VariableBinding}
    (endpoint : input.source = .processDataInput port)
    (uniqueOwner : state.variables.processInterfaces.filter
      (fun candidate => decide (candidate.owner = owner)) = [scope])
    (uniquePort : scope.inputs.filter (fun candidate => decide (candidate.name = port)) = [source])
    (scalar : processInterfaceScalar source.value = true) :
    dataArmingBindings? state owner (.inputOutput input output) =
      some [{ name := input.targetDataInputId, value := source.value }] := by
  have available : dataInputOutputSourceBinding? state owner input = some source := by
    rw [dataInputOutputSourceBinding?, readActivityDataInput_interface_exact endpoint]
    exact readProcessInterfaceInput_iff.mpr
      ⟨scope, selectProcessInterface_iff.mpr uniqueOwner, uniquePort, scalar⟩
  simp [dataArmingBindings?, dataArmingEndpointKindsValid,
    InternalDataArmingData.inputAssociation?, available]

theorem prepareInternalDataArmingContract_of_premises
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (owner : ScopeOccurrenceId) (inputOrigin : BpmnSequenceFlowOrigin) (bindings : List VariableBinding)
    (owned : onlyTokenOwner? state contract.input = some owner)
    (running : dataArmingHostValid state owner contract.data = true)
    (selected : exactProgramSelection program contract.operation owner = true)
    (live : exactLiveOccurrence state owner = true)
    (origin : selectedInputOrigin? program contract.input owner = some inputOrigin)
    (available : dataArmingBindings? state owner contract.data = some bindings)
    (unique : uniqueFamilyDeclarer? program contract.operation .userTask ⟨contract.taskId.value⟩ = true) :
    let patch := makeInternalDataArmingPatch program state contract owner inputOrigin bindings
    openWaitAnchorAbsent state patch.arm.write.occurrence = true →
    state.variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord patch.record)) = false →
    state.activityOccurrences.any (fun record => sameActivityOccurrence record patch.record ||
      !activityBodyClaimsDisjoint record patch.record) = false →
    prepareInternalDataArmingContract? program state contract = some patch := by
  dsimp only
  intro anchor fresh claims
  simp_all [prepareInternalDataArmingContract?]

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

theorem prepareInternalDataArmingContract_unavailable_source
    {program : Program} {state : RuntimeState} {contract : InternalDataArmingContract}
    {owner : ScopeOccurrenceId}
    (owned : onlyTokenOwner? state contract.input = some owner)
    (unavailable : dataArmingBindings? state owner contract.data = none) :
    prepareInternalDataArmingContract? program state contract = none := by
  simp [prepareInternalDataArmingContract?, owned, unavailable]

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
  have refused : dataInputOutputSourceBinding? state owner input = none :=
    readActivityDataInput_duplicate_interfaces_refused endpoint duplicates
  simp [dataArmingBindings?, family, dataArmingEndpointKindsValid,
    InternalDataArmingData.inputAssociation?, refused]

theorem prepareStandaloneProcessInput_refused
    {program : Program} {state : RuntimeState} {contract : InternalDataArmingContract}
    {owner : ScopeOccurrenceId} {input : DirectActivityDataInput} {port : String}
    (family : contract.data = .input input)
    (owned : onlyTokenOwner? state contract.input = some owner)
    (endpoint : input.source = .processDataInput port) :
    prepareInternalDataArmingContract? program state contract = none := by
  apply prepareInternalDataArmingContract_unavailable_source owned
  simp [dataArmingBindings?, family, dataArmingEndpointKindsValid, endpoint]

theorem prepareStandaloneForeignOwner_refused
    {program : Program} {state : RuntimeState} {contract : InternalDataArmingContract}
    {owner : ScopeOccurrenceId} {host : SemanticId}
    (running : state.control = .running host) (foreign : owner.processInstanceId ≠ host)
    (standalone : (∃ input, contract.data = .input input) ∨ ∃ output, contract.data = .output output)
    (owned : onlyTokenOwner? state contract.input = some owner) :
    prepareInternalDataArmingContract? program state contract = none := by
  rcases standalone with ⟨input, family⟩ | ⟨output, family⟩ <;>
    simp [prepareInternalDataArmingContract?, owned, dataArmingHostValid, running, family, foreign]


theorem makeInternalDataArmingPatch_host_control
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (owner : ScopeOccurrenceId) (inputOrigin : BpmnSequenceFlowOrigin) (bindings : List VariableBinding)
    (valid : dataArmingHostValid state owner contract.data = true) :
    state.control = .running
      (makeInternalDataArmingPatch program state contract owner inputOrigin bindings).arm.runtimeInstanceId := by
  obtain ⟨host, running⟩ := dataArmingHostValid_running valid
  simp [makeInternalDataArmingPatch, dataInputOutputRunningInstance?, running]

theorem prepareInternalDataArmingContract_host_control
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    state.control = .running patch.arm.runtimeInstanceId := by
  obtain ⟨owner, inputOrigin, bindings, _, valid, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  exact makeInternalDataArmingPatch_host_control program state contract owner inputOrigin bindings valid

end BpmnSemantics.SemanticProcess.InternalCommutation
