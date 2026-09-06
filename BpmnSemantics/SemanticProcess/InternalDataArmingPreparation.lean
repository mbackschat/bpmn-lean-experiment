import BpmnSemantics.SemanticProcess.InternalCommutationCore
import BpmnSemantics.SemanticProcess.ActivityDataInputOutput

/-! # Prepared composed Activity-data arming

One predecessor selects the input value and both occurrence identities. Applying that patch must
realize the existing composed activation before any commutation or publication claim can use it.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

structure InternalDataArmingContract extends DataInputOutputTaskContract where
  origin : BpmnElementOrigin
  deriving Repr, DecidableEq

def InternalDataArmingContract.operation (contract : InternalDataArmingContract) :
    SemanticOperation :=
  .awaitDataInputOutputUserTask contract.operationId contract.origin contract.input
    contract.output contract.taskId contract.taskName contract.directInput contract.directOutput

def dataArmingContract? : SemanticOperation → Option InternalDataArmingContract
  | .awaitDataInputOutputUserTask operationId origin input output taskId taskName directInput
      directOutput => some
        { operationId := operationId
          origin := origin
          input := input
          output := output
          taskId := taskId
          taskName := taskName
          directInput := directInput
          directOutput := directOutput }
  | _ => none

structure InternalDataArmingPatch where
  arm : InternalArmingPatch
  record : ActivityOccurrence
  inputBinding : VariableBinding
  deriving Repr, DecidableEq

/-- ADIO-SCOPE-01 keeps the task and Activity issuers independent while joining their lifetimes. -/
def makeInternalDataArmingPatch (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (owner : ScopeOccurrenceId)
    (inputOrigin : BpmnSequenceFlowOrigin) (source : VariableBinding) :
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
    inputBinding := { name := contract.directInput.targetDataInputId, value := source.value } }

def applyInternalDataArmingPatch (state : RuntimeState)
    (patch : InternalDataArmingPatch) : RuntimeState :=
  { applyInternalArmingPatch state patch.arm with
    activityOccurrences := insertActivityOccurrence patch.record state.activityOccurrences
    activityActivations := setActivationCount state.activityActivations
      ⟨patch.record.activityElementId.value⟩ patch.record.activation
    variables := addActivityOccurrenceVariableScope state.variables
      (activityOwnerForRecord patch.record) [patch.inputBinding] }

/-- The keyed patch realizes the composed activation with independently issued identities. -/
theorem makeInternalDataArmingPatch_refines_activation
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (owner : ScopeOccurrenceId) (inputOrigin : BpmnSequenceFlowOrigin)
    (source : VariableBinding)
    (owned : onlyTokenOwner? state contract.input = some owner)
    (running : state.control = .running owner.processInstanceId)
    (available : dataInputOutputSourceBinding? state contract.directInput = some source)
    (fresh : state.variables.activities.any (activityOccurrenceScopeMatches
      (dataInputOutputActivityOwner state owner.processInstanceId contract.taskId)) = false) :
    activateDataInputOutputUserTask? state contract.input contract.output contract.taskId
      contract.taskName contract.directInput =
        some (applyInternalDataArmingPatch state
          (makeInternalDataArmingPatch program state contract owner inputOrigin source)) := by
  have hosted := dataInputOutputRunningInstance_of_running running
  simp only [dataInputOutputActivityOwner] at fresh
  simp only [activateDataInputOutputUserTask?, owned, hosted, available,
    Option.bind_eq_bind, Option.bind_some]
  rw [fresh]
  rfl

/-- Preparation reads only the predecessor; publication and frame proofs consume this same patch. -/
def prepareInternalDataArmingContract? (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) : Option InternalDataArmingPatch := do
  let owner ← onlyTokenOwner? state contract.input
  if state.control ≠ .running owner.processInstanceId ||
      !exactProgramSelection program contract.operation owner ||
      !exactLiveOccurrence state owner then none else pure ()
  let inputOrigin ← selectedInputOrigin? program contract.input owner
  let source ← dataInputOutputSourceBinding? state contract.directInput
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

/-- Successful decoding retains the exact selected operation, including both associations. -/
theorem dataArmingContract_operation (operation : SemanticOperation)
    (contract : InternalDataArmingContract)
    (found : dataArmingContract? operation = some contract) :
    contract.operation = operation := by
  cases operation <;> simp [dataArmingContract?] at found
  cases found
  rfl

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
      dataInputOutputSourceBinding? state contract.directInput = some source ∧
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

/-- Preparation fixes every argument consumed by the existing composed activation. -/
theorem prepareInternalDataArmingContract_refines_activation
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    activateDataInputOutputUserTask? state contract.input contract.output contract.taskId
      contract.taskName contract.directInput = some (applyInternalDataArmingPatch state patch) := by
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
    activityIdentityIssuingDiscipline state (applyInternalDataArmingPatch state patch) = true :=
  activateDataInputOutputUserTask_issuesFreshActivity
    (prepareInternalDataArmingContract_refines_activation program state contract patch prepared)

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

/-- A prepared patch realizes a declared composed transition, without selecting a profile. -/
theorem prepareInternalDataArmingContract_sound
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    DataInputOutputActivationStep program state (applyInternalDataArmingPatch state patch) := by
  obtain ⟨owner, _, _, _, _, selected, _⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  exact activateDataInputOutputUserTask_sound program state (applyInternalDataArmingPatch state patch)
    contract.operationId contract.origin contract.input contract.output contract.taskId
    contract.taskName contract.directInput contract.directOutput
    (selectedOperation_mem program contract.operation owner selected)
    (prepareInternalDataArmingContract_refines_activation program state contract patch prepared)

/-- The operation-facing preparation preserves the same declarative transition guarantee. -/
theorem prepareInternalDataArm_sound
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArm? program state operation = some patch) :
    DataInputOutputActivationStep program state (applyInternalDataArmingPatch state patch) := by
  obtain ⟨contract, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  exact prepareInternalDataArmingContract_sound program state contract patch prepared

end BpmnSemantics.SemanticProcess.InternalCommutation
