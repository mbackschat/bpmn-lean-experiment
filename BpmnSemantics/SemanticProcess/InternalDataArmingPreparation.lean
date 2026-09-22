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

/-- ADOUTPUT entry owns an empty local scope without reading the Property written at completion. -/
def dataArmingBindings? (state : RuntimeState) (data : InternalDataArmingData) :
    Option (List VariableBinding) :=
  match data.inputAssociation? with
  | none => some []
  | some directInput => do
      let source ← dataInputOutputSourceBinding? state directInput
      pure [{ name := directInput.targetDataInputId, value := source.value }]

theorem dataArmingBindings_process_frame (before after : RuntimeState)
    (data : InternalDataArmingData) (same : after.variables.process = before.variables.process) :
    dataArmingBindings? after data = dataArmingBindings? before data := by
  simp only [dataArmingBindings?, dataInputOutputSourceBinding?, dataInputSourceBinding?, same]

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

/-- The Activity-data scope laws keep the task and Activity issuers independent while joining their lifetimes. -/
def makeInternalDataArmingPatch (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (owner : ScopeOccurrenceId)
    (inputOrigin : BpmnSequenceFlowOrigin) (bindings : List VariableBinding) :
    InternalDataArmingPatch :=
  { arm :=
      { operation := contract.operation
        definition := program.identity
        processId := program.processId
        origin := contract.origin
        runtimeInstanceId := owner.processInstanceId
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
    (running : state.control = .running owner.processInstanceId)
    (available : dataArmingBindings? state contract.data = some bindings)
    (fresh : state.variables.activities.any (activityOccurrenceScopeMatches
      (dataInputOutputActivityOwner state owner.processInstanceId contract.taskId)) = false) :
    contract.activate? state = some (applyInternalDataArmingPatch state
      (makeInternalDataArmingPatch program state contract owner inputOrigin bindings)) := by
  cases dataEq : contract.data with
  | output directOutput =>
      simp only [dataArmingBindings?, dataEq, InternalDataArmingData.inputAssociation?,
        Option.some.injEq] at available
      subst bindings
      simp only [InternalDataArmingContract.activate?, dataEq, activateDataOutputUserTask?,
        owned, dataOutputRunningInstance_of_running running, Option.bind_eq_bind, Option.bind_some]
      rfl
  | input directInput | inputOutput directInput directOutput =>
      simp only [dataArmingBindings?, dataEq, InternalDataArmingData.inputAssociation?] at available
      obtain ⟨source, sourceFound, bindingsEq⟩ := Option.bind_eq_some_iff.mp available
      simp only [pure, Option.some.injEq] at bindingsEq
      subst bindings
      have inputSource : dataInputSourceBinding? state directInput = some source := by
        unfold dataInputOutputSourceBinding? at sourceFound
        obtain ⟨selected, selectedEq, admitted⟩ := Option.bind_eq_some_iff.mp sourceFound
        split at admitted
        · cases admitted; exact selectedEq
        · simp at admitted
      first
      | simp only [InternalDataArmingContract.activate?, dataEq, activateDataInputUserTask?,
          owned, dataInputRunningInstance_of_running running, inputSource,
          Option.bind_eq_bind, Option.bind_some]; rfl
      | simp only [InternalDataArmingContract.activate?, dataEq, activateDataInputOutputUserTask?,
          owned, dataInputOutputRunningInstance_of_running running, sourceFound,
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
  if state.control ≠ .running owner.processInstanceId ||
      !exactProgramSelection program contract.operation owner ||
      !exactLiveOccurrence state owner then none else pure ()
  let inputOrigin ← selectedInputOrigin? program contract.input owner
  let source ← dataArmingBindings? state contract.data
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
      state.control = .running owner.processInstanceId ∧
      exactProgramSelection program contract.operation owner = true ∧
      exactLiveOccurrence state owner = true ∧
      selectedInputOrigin? program contract.input owner = some inputOrigin ∧
      dataArmingBindings? state contract.data = some source ∧
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

end BpmnSemantics.SemanticProcess.InternalCommutation
