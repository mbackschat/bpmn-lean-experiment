import BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import BpmnSemantics.SemanticProcess.InternalCommutationCore

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
    (policy : PropertyPathValuePolicy) (state : RuntimeState) : Option RuntimeState :=
  match contract.data with
  | .input directInput => activateDataInputUserTask? state contract.input contract.output
      contract.taskId contract.taskName directInput
  | .output _ => activateDataOutputUserTask? state contract.input contract.output
      contract.taskId contract.taskName
  | .inputOutput directInput _ => activateDataInputOutputUserTask? policy state contract.input
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
def dataArmingBindings? (policy : PropertyPathValuePolicy) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (data : InternalDataArmingData) : Option (List VariableBinding) :=
  if dataArmingEndpointKindsValid data then
    match data.inputAssociation? with
    | none => some []
    | some directInput => do
        let source ← dataInputOutputSourceBinding? policy state owner directInput
        pure [{ name := directInput.targetDataInputId, value := source.value }]
  else none

theorem dataArmingBindings_process_frame (policy : PropertyPathValuePolicy)
    (before after : RuntimeState) (owner : ScopeOccurrenceId) (data : InternalDataArmingData)
    (control : after.control = before.control)
    (same : after.variables.process = before.variables.process)
    (interfaces : after.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) =
      before.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner))) :
    dataArmingBindings? policy after owner data = dataArmingBindings? policy before owner data := by
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

/-- Preparation reads only the predecessor; publication and frame proofs consume this same patch. -/
def prepareInternalDataArmingContract? (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) : Option InternalDataArmingPatch := do
  let owner ← onlyTokenOwner? state contract.input
  if !dataArmingHostValid state owner contract.data ||
      !exactProgramSelection program contract.operation owner ||
      !exactLiveOccurrence state owner then none else pure ()
  let inputOrigin ← selectedInputOrigin? program contract.input owner
  let source ← dataArmingBindings? (programPropertyPathValuePolicy program) state owner contract.data
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
      dataArmingBindings? (programPropertyPathValuePolicy program) state owner contract.data = some source ∧
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

theorem dataArmingBindings_property_frame (policy : PropertyPathValuePolicy)
    (before after : RuntimeState) (owner : ScopeOccurrenceId) (data : InternalDataArmingData)
    (control : after.control = before.control)
    (same : after.variables.process = before.variables.process)
    (properties : ∀ input, data.inputAssociation? = some input →
      ∃ propertyId, input.source = .property propertyId) :
    dataArmingBindings? policy after owner data = dataArmingBindings? policy before owner data := by
  cases association : data.inputAssociation? with
  | none => simp [dataArmingBindings?, association]
  | some input =>
      obtain ⟨propertyId, endpoint⟩ := properties input association
      simp [dataArmingBindings?, association, dataInputOutputSourceBinding?, readActivityDataInput?,
        endpoint, activityDataPropertyOwner, control, same]
      rfl

theorem prepareInternalDataArmingContract_of_premises
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (owner : ScopeOccurrenceId) (inputOrigin : BpmnSequenceFlowOrigin) (bindings : List VariableBinding)
    (owned : onlyTokenOwner? state contract.input = some owner)
    (running : dataArmingHostValid state owner contract.data = true)
    (selected : exactProgramSelection program contract.operation owner = true)
    (live : exactLiveOccurrence state owner = true)
    (origin : selectedInputOrigin? program contract.input owner = some inputOrigin)
    (available : dataArmingBindings? (programPropertyPathValuePolicy program) state owner contract.data = some bindings)
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

theorem prepareInternalDataArmingContract_unavailable_source
    {program : Program} {state : RuntimeState} {contract : InternalDataArmingContract}
    {owner : ScopeOccurrenceId}
    (owned : onlyTokenOwner? state contract.input = some owner)
    (unavailable : dataArmingBindings? (programPropertyPathValuePolicy program) state owner contract.data = none) :
    prepareInternalDataArmingContract? program state contract = none := by
  simp [prepareInternalDataArmingContract?, owned, unavailable]

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
