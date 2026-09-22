import BpmnSemantics.SemanticProcess.InternalRegionalDependencies
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts

/-! Timer-task preparation retains both waits and their Activity association before execution.
The regional atom vocabulary already represents attached-handler conflicts; no new atom domain is
needed for the [complete outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#timer-task-arming-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalTimerTaskKind where
  | interrupting
  | nonInterrupting
  deriving Repr, DecidableEq

structure InternalTimerTaskContract where
  kind : InternalTimerTaskKind
  operationId : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  task : BoundedTaskArm
  timer : BoundaryTimerArm
  deriving Repr, DecidableEq

def InternalTimerTaskContract.operation (contract : InternalTimerTaskContract) : SemanticOperation :=
  match contract.kind with
  | .interrupting => .awaitBoundedUserTask contract.operationId contract.origin contract.input
      contract.task contract.timer
  | .nonInterrupting => .awaitMonitoredUserTask contract.operationId contract.origin contract.input
      contract.task contract.timer

def timerTaskContract? : SemanticOperation → Option InternalTimerTaskContract
  | .awaitBoundedUserTask operationId origin input task timer =>
      some { kind := .interrupting, operationId, origin, input, task, timer }
  | .awaitMonitoredUserTask operationId origin input task timer =>
      some { kind := .nonInterrupting, operationId, origin, input, task, timer }
  | _ => none

theorem timerTaskContract_roundtrip (contract : InternalTimerTaskContract) :
    timerTaskContract? contract.operation = some contract := by
  cases contract with
  | mk kind id origin input task timer => cases kind <;> rfl

theorem timerTaskContract_operation (operation : SemanticOperation)
    (contract : InternalTimerTaskContract) (found : timerTaskContract? operation = some contract) :
    contract.operation = operation := by
  cases operation <;> simp [timerTaskContract?] at found
  all_goals cases found; rfl

structure InternalTimerTaskPatch where
  arm : InternalArmingPatch
  timer : TimerWait
  record : ActivityOccurrence
  deriving Repr, DecidableEq

def makeInternalTimerTaskPatch (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (owner : ScopeOccurrenceId)
    (instanceId : SemanticId) (processId : ProcessId) (inputOrigin : BpmnSequenceFlowOrigin) :
    InternalTimerTaskPatch :=
  let taskActivation := activationCount state contract.task.id + 1
  let timerActivation := timerActivationCount state contract.timer.elementId + 1
  { arm :=
      { operation := contract.operation
        definition := program.identity
        processId
        origin := contract.origin
        runtimeInstanceId := instanceId
        logicalTimeMs := state.logicalTimeMs
        input := contract.input
        inputOrigin
        owner
        write := .userTask
          { processInstanceId := owner.processInstanceId
            owner
            task := { id := contract.task.id, name := contract.task.name }
            activation := taskActivation
            output := contract.task.output } }
    timer :=
      { processInstanceId := owner.processInstanceId
        owner
        elementId := contract.timer.elementId
        activation := timerActivation
        deadlineMs := state.logicalTimeMs + contract.timer.durationMs
        output := contract.timer.output }
    record :=
      { processInstanceId := owner.processInstanceId
        activityElementId := ⟨contract.task.id.value⟩
        activation := activityActivationCount state contract.task.id + 1
        owner
        body := .userTask
          { processInstanceId := owner.processInstanceId
            elementId := ⟨contract.task.id.value⟩
            activation := taskActivation }
        attachedHandlers := [.timer
          { processInstanceId := owner.processInstanceId
            elementId := ⟨contract.timer.elementId.value⟩
            activation := timerActivation }] } }

def applyInternalTimerTaskPatch (state : RuntimeState) (patch : InternalTimerTaskPatch) : RuntimeState :=
  { applyInternalArmingPatch state patch.arm with
    timerWaits := insertTimerWait patch.timer state.timerWaits
    timerActivations := setTimerActivationCount state.timerActivations
      patch.timer.elementId patch.timer.activation
    activityOccurrences := insertActivityOccurrence patch.record state.activityOccurrences
    activityActivations := setActivationCount state.activityActivations
      ⟨patch.record.activityElementId.value⟩ patch.record.activation }

/-- The retained patch realizes the existing atomic activation, including unequal counter values. -/
theorem makeInternalTimerTaskPatch_refines_activation
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (owner : ScopeOccurrenceId) (instanceId : SemanticId) (processId : ProcessId)
    (inputOrigin : BpmnSequenceFlowOrigin) :
    applyInternalTimerTaskPatch state
      (makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin) =
      activateBoundedUserTask state owner.processInstanceId owner contract.input
        contract.task contract.timer := by
  rfl

def timerTaskStateFootprint (patch : InternalTimerTaskPatch) : InternalRegionalStateFootprint :=
  let common : List InternalRegionalStateAtom :=
    [.ordinary (.tokenOwners patch.arm.input),
     .ordinary (.controlToken patch.arm.owner patch.arm.input),
     .ordinary (.activation .userTask patch.arm.write.elementId),
     .ordinary (.activation .timer patch.timer.elementId),
     .ordinary (.activation .activity patch.record.activityElementId),
     .owned (.wait .userTask patch.arm.write.occurrence) patch.arm.owner,
     .owned (.wait .timer (timerWaitOccurrence patch.timer)) patch.arm.owner,
     .owned (.openWaitAnchor patch.arm.write.occurrence) patch.arm.owner,
     .owned (.openWaitAnchor (timerWaitOccurrence patch.timer)) patch.arm.owner,
     .activityAssociation patch.record]
  { reads := canonicalRegionalStateAtoms
      ([.ordinary (.runtimeControl patch.arm.runtimeInstanceId),
        .ordinary (.scopeOccurrence patch.arm.owner), .ordinary .logicalTime] ++ common)
    writes := canonicalRegionalStateAtoms common }

def prepareInternalTimerTaskContract? (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) : Option InternalTimerTaskPatch := do
  if program.compensationEventSubProcessSnapshots.isSome then none else pure ()
  let owner ← onlyTokenOwner? state contract.input
  let instanceId ← runningInstance? state
  if !exactProgramSelection program contract.operation owner || !exactLiveOccurrence state owner
    then none else pure ()
  let inputOrigin ← selectedInputOrigin? program contract.input owner
  let processId ← candidateProcessIdForDefinitionScope? program owner.definitionScopeId
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  if !uniqueFamilyDeclarer? program contract.operation .userTask ⟨contract.task.id.value⟩ ||
      !uniqueFamilyDeclarer? program contract.operation .timer contract.timer.elementId ||
      !openWaitAnchorAbsent state patch.arm.write.occurrence ||
      !openWaitAnchorAbsent state (timerWaitOccurrence patch.timer) ||
      state.activityOccurrences.any (regionalActivityAssociationsConflict · patch.record)
    then none else some patch

theorem prepareInternalTimerTaskContract_facts
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    program.compensationEventSubProcessSnapshots = none ∧
      ∃ owner instanceId inputOrigin processId,
        onlyTokenOwner? state contract.input = some owner ∧
        runningInstance? state = some instanceId ∧
        exactProgramSelection program contract.operation owner = true ∧
        exactLiveOccurrence state owner = true ∧
        selectedInputOrigin? program contract.input owner = some inputOrigin ∧
        candidateProcessIdForDefinitionScope? program owner.definitionScopeId = some processId ∧
        uniqueFamilyDeclarer? program contract.operation .userTask ⟨contract.task.id.value⟩ = true ∧
        uniqueFamilyDeclarer? program contract.operation .timer contract.timer.elementId = true ∧
        openWaitAnchorAbsent state patch.arm.write.occurrence = true ∧
        openWaitAnchorAbsent state (timerWaitOccurrence patch.timer) = true ∧
        state.activityOccurrences.any (regionalActivityAssociationsConflict · patch.record) = false ∧
        patch = makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin := by
  cases snapshots : program.compensationEventSubProcessSnapshots with
  | some _ => simp [prepareInternalTimerTaskContract?, snapshots] at prepared
  | none =>
      refine ⟨rfl, ?_⟩
      simp only [prepareInternalTimerTaskContract?, snapshots, Option.isSome_none,
        Bool.false_eq_true, if_false] at prepared
      dsimp only [Pure.pure, Bind.bind, Option.bind] at prepared
      obtain ⟨owner, owned, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      obtain ⟨instanceId, running, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      split at prepared
      · simp at prepared
      · next selected =>
          obtain ⟨inputOrigin, originFound, prepared⟩ := Option.bind_eq_some_iff.mp prepared
          obtain ⟨processId, processFound, prepared⟩ := Option.bind_eq_some_iff.mp prepared
          simp_all

/-- Preparation agrees with actual evaluation in either family, without equating caller and owner. -/
theorem prepareInternalTimerTaskContract_refines_operation
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    fire? program contract.operation state = some (applyInternalTimerTaskPatch state patch) := by
  obtain ⟨snapshots, owner, instanceId, inputOrigin, processId, owned, running, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have control : state.control = .running instanceId := by
    cases equation : state.control <;> simp_all [runningInstance?]
  rw [makeInternalTimerTaskPatch_refines_activation]
  cases kind : contract.kind
  · simp only [fire?, snapshots, InternalTimerTaskContract.operation, kind]
    exact armBoundedUserTaskState_of_owned_running state contract.input contract.task contract.timer
      owner instanceId owned control
  · simp only [fire?, snapshots, InternalTimerTaskContract.operation, kind]
    exact armMonitoredUserTaskState_of_owned_running state contract.input contract.task contract.timer
      owner instanceId owned control

/-- The same patch satisfies the existing declarative arming relation in the operation semantics. -/
theorem prepareInternalTimerTaskContract_sound
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    OperationStep program contract.operation state (applyInternalTimerTaskPatch state patch) :=
  fire_sound program contract.operation state _
    (prepareInternalTimerTaskContract_refines_operation program state contract patch prepared)

theorem prepareInternalTimerTaskContract_issuesFreshActivity
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    activityIdentityIssuingDiscipline state (applyInternalTimerTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  apply activityIdentityIssuingDiscipline_insertActivityOccurrence
  simp [makeInternalTimerTaskPatch]

/-- Complete association freshness protects the new task body without relying on equal issuers. -/
theorem prepareInternalTimerTaskContract_preserves_bodyClaims
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (unique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique (applyInternalTimerTaskPatch state patch).activityOccurrences = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, disjoint, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  apply activityBodyClaimsUnique_insertActivityOccurrence _ _ _ unique
  apply List.all_eq_true.mpr
  intro old member
  apply activityBodyClaimsDisjoint_userTask_of_not_mem
    (makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin).record
    old
    { processInstanceId := owner.processInstanceId
      elementId := ⟨contract.task.id.value⟩
      activation := activationCount state contract.task.id + 1 }
  intro claimed
  have sameBodies : regionalActivityBodyTasks old.body = activityBodyTaskClaims old.body := by
    cases old.body <;> rfl
  have conflict : regionalActivityAssociationsConflict old
      (makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin).record = true := by
    simp only [regionalActivityAssociationsConflict, sameBodies]
    simp [makeInternalTimerTaskPatch, regionalActivityBodyTasks, List.any_eq_true, claimed]
  have present : state.activityOccurrences.any (regionalActivityAssociationsConflict ·
      (makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin).record) = true :=
    List.any_eq_true.mpr ⟨old, member, conflict⟩
  rw [disjoint] at present
  contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
