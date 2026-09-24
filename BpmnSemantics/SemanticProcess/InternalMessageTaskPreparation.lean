import BpmnSemantics.SemanticProcess.InternalRegionalDependencies
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts

/-! ESL-OWN-01 requires atomic Task/Message/Activity preparation for source-reachable mixed
frontiers. The existing tagged association footprint protects all three independent issuers;
the Message anchor joins the Task anchor in the retained publication template. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalMessageTaskKind where
  | interrupting
  | nonInterrupting
  deriving Repr, DecidableEq

structure InternalMessageTaskContract where
  kind : InternalMessageTaskKind
  operationId : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  task : BoundedTaskArm
  message : BoundaryMessageArm
  deriving Repr, DecidableEq

def InternalMessageTaskContract.operation (contract : InternalMessageTaskContract) : SemanticOperation :=
  match contract.kind with
  | .interrupting => .awaitMessageBoundedUserTask contract.operationId contract.origin contract.input
      contract.task contract.message
  | .nonInterrupting => .awaitMessageMonitoredUserTask contract.operationId contract.origin contract.input
      contract.task contract.message

def messageTaskContract? : SemanticOperation → Option InternalMessageTaskContract
  | .awaitMessageBoundedUserTask operationId origin input task message =>
      some { kind := .interrupting, operationId, origin, input, task, message }
  | .awaitMessageMonitoredUserTask operationId origin input task message =>
      some { kind := .nonInterrupting, operationId, origin, input, task, message }
  | _ => none

theorem messageTaskContract_roundtrip (contract : InternalMessageTaskContract) :
    messageTaskContract? contract.operation = some contract := by
  cases contract with
  | mk kind id origin input task message => cases kind <;> rfl

theorem messageTaskContract_operation (operation : SemanticOperation)
    (contract : InternalMessageTaskContract) (found : messageTaskContract? operation = some contract) :
    contract.operation = operation := by
  cases operation <;> simp [messageTaskContract?] at found
  all_goals cases found; rfl

structure InternalMessageTaskPatch where
  arm : InternalArmingPatch
  message : MessageWait
  record : ActivityOccurrence
  deriving Repr, DecidableEq

def makeInternalMessageTaskPatch (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (owner : ScopeOccurrenceId)
    (instanceId : SemanticId) (processId : ProcessId) (inputOrigin : BpmnSequenceFlowOrigin) :
    InternalMessageTaskPatch :=
  let taskActivation := activationCount state contract.task.id + 1
  let messageActivation := messageActivationCount state contract.message.elementId + 1
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
          { processInstanceId := instanceId
            owner
            task := { id := contract.task.id, name := contract.task.name }
            activation := taskActivation
            output := contract.task.output } }
    message :=
      { processInstanceId := instanceId
        owner
        elementId := contract.message.elementId
        activation := messageActivation
        channel := contract.message.channel
        output := contract.message.output }
    record :=
      { processInstanceId := instanceId
        activityElementId := ⟨contract.task.id.value⟩
        activation := activityActivationCount state contract.task.id + 1
        owner
        body := .userTask
          { processInstanceId := instanceId
            elementId := ⟨contract.task.id.value⟩
            activation := taskActivation }
        attachedHandlers := [.message
          { processInstanceId := instanceId
            elementId := ⟨contract.message.elementId.value⟩
            activation := messageActivation }] } }

def applyInternalMessageTaskPatch (state : RuntimeState) (patch : InternalMessageTaskPatch) : RuntimeState :=
  { applyInternalArmingPatch state patch.arm with
    messageWaits := insertMessageWait patch.message state.messageWaits
    messageActivations := setMessageActivationCount state.messageActivations
      patch.message.elementId patch.message.activation
    activityOccurrences := insertActivityOccurrence patch.record state.activityOccurrences
    activityActivations := setActivationCount state.activityActivations
      ⟨patch.record.activityElementId.value⟩ patch.record.activation }

/-- The retained patch realizes the existing atomic activation, including unequal counter values. -/
theorem makeInternalMessageTaskPatch_refines_activation
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (owner : ScopeOccurrenceId) (instanceId : SemanticId) (processId : ProcessId)
    (inputOrigin : BpmnSequenceFlowOrigin) :
    applyInternalMessageTaskPatch state
      (makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin) =
      activateMessageBoundedUserTask state instanceId owner contract.input
        contract.task contract.message := by
  rfl

def messageTaskStateFootprint (patch : InternalMessageTaskPatch) : InternalRegionalStateFootprint :=
  let common : List InternalRegionalStateAtom :=
    [.ordinary (.tokenOwners patch.arm.input),
     .ordinary (.controlToken patch.arm.owner patch.arm.input),
     .ordinary (.activation .userTask patch.arm.write.elementId),
     .ordinary (.activation .message patch.message.elementId),
     .ordinary (.activation .activity patch.record.activityElementId),
     .owned (.wait .userTask patch.arm.write.occurrence) patch.arm.owner,
     .owned (.wait .message (messageWaitOccurrence patch.message)) patch.arm.owner,
     .owned (.openWaitAnchor patch.arm.write.occurrence) patch.arm.owner,
     .owned (.openWaitAnchor (messageWaitOccurrence patch.message)) patch.arm.owner,
     .activityAssociation patch.record]
  { reads := canonicalRegionalStateAtoms
      ([.ordinary (.runtimeControl patch.arm.runtimeInstanceId),
        .ordinary (.scopeOccurrence patch.arm.owner), .ordinary .logicalTime] ++ common)
    writes := canonicalRegionalStateAtoms common }

def messageTaskArmAdmitted (contract : InternalMessageTaskContract) : Bool :=
  decide (contract.task.output ≠ contract.message.output) &&
    (match contract.message.channel with | .directMessage _ => false | .operationMessage .. => true)

def prepareInternalMessageTaskContract? (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) : Option InternalMessageTaskPatch := do
  if program.compensationEventSubProcessSnapshots.isSome then none else pure ()
  let owner ← onlyTokenOwner? state contract.input
  let instanceId ← runningInstance? state
  if !exactProgramSelection program contract.operation owner || !exactLiveOccurrence state owner
    then none else pure ()
  let inputOrigin ← selectedInputOrigin? program contract.input owner
  let processId ← candidateProcessIdForDefinitionScope? program owner.definitionScopeId
  let patch := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  if !uniqueFamilyDeclarer? program contract.operation .userTask ⟨contract.task.id.value⟩ ||
      !uniqueFamilyDeclarer? program contract.operation .message contract.message.elementId ||
      !openWaitAnchorAbsent state patch.arm.write.occurrence ||
      !openWaitAnchorAbsent state (messageWaitOccurrence patch.message) ||
      state.activityOccurrences.any (regionalActivityAssociationsConflict · patch.record) ||
      !messageTaskArmAdmitted contract
    then none else some patch

theorem prepareInternalMessageTaskContract_facts
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    program.compensationEventSubProcessSnapshots = none ∧
      ∃ owner instanceId inputOrigin processId,
        onlyTokenOwner? state contract.input = some owner ∧
        runningInstance? state = some instanceId ∧
        exactProgramSelection program contract.operation owner = true ∧
        exactLiveOccurrence state owner = true ∧
        selectedInputOrigin? program contract.input owner = some inputOrigin ∧
        candidateProcessIdForDefinitionScope? program owner.definitionScopeId = some processId ∧
        uniqueFamilyDeclarer? program contract.operation .userTask ⟨contract.task.id.value⟩ = true ∧
        uniqueFamilyDeclarer? program contract.operation .message contract.message.elementId = true ∧
        openWaitAnchorAbsent state patch.arm.write.occurrence = true ∧
        openWaitAnchorAbsent state (messageWaitOccurrence patch.message) = true ∧
        state.activityOccurrences.any (regionalActivityAssociationsConflict · patch.record) = false ∧
        messageTaskArmAdmitted contract = true ∧
        patch = makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin := by
  cases snapshots : program.compensationEventSubProcessSnapshots with
  | some _ => simp [prepareInternalMessageTaskContract?, snapshots] at prepared
  | none =>
      refine ⟨rfl, ?_⟩
      simp only [prepareInternalMessageTaskContract?, snapshots, Option.isSome_none,
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
theorem prepareInternalMessageTaskContract_refines_operation
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    fire? program contract.operation state = some (applyInternalMessageTaskPatch state patch) := by
  obtain ⟨snapshots, owner, instanceId, inputOrigin, processId, owned, running, _, _, _, _,
    _, _, _, _, _, admitted, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have control : state.control = .running instanceId := by
    cases equation : state.control <;> simp_all [runningInstance?]
  rw [makeInternalMessageTaskPatch_refines_activation]
  have distinct : contract.task.output ≠ contract.message.output := by
    exact of_decide_eq_true (Bool.and_eq_true_iff.mp admitted).1
  cases channel : contract.message.channel with
  | directMessage id => simp [messageTaskArmAdmitted, channel] at admitted
  | operationMessage interfaceId operationId messageId =>
      cases kind : contract.kind <;>
        simp only [fire?, snapshots, InternalMessageTaskContract.operation, kind]
      all_goals
        change armMessageBoundedUserTaskState? state contract.input contract.task contract.message = _
        unfold armMessageBoundedUserTaskState?
        simp only [distinct, ↓reduceIte, channel, owned, Option.bind_eq_bind, Option.bind_some]
        change ((match state.control with | .running id => some id | _ => none) : Option SemanticId).bind
          (fun actual => some (activateMessageBoundedUserTask state actual owner contract.input contract.task contract.message)) = _
        simp [control]

/-- The same patch satisfies the existing declarative arming relation in the operation semantics. -/
theorem prepareInternalMessageTaskContract_sound
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    OperationStep program contract.operation state (applyInternalMessageTaskPatch state patch) :=
  fire_sound program contract.operation state _
    (prepareInternalMessageTaskContract_refines_operation program state contract patch prepared)

theorem prepareInternalMessageTaskContract_issuesFreshActivity
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    activityIdentityIssuingDiscipline state (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  apply activityIdentityIssuingDiscipline_insertActivityOccurrence
  simp [makeInternalMessageTaskPatch]

/-- Complete association freshness protects the new task body without relying on equal issuers. -/
theorem prepareInternalMessageTaskContract_preserves_bodyClaims
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (unique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique (applyInternalMessageTaskPatch state patch).activityOccurrences = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, disjoint, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  apply activityBodyClaimsUnique_insertActivityOccurrence _ _ _ unique
  apply List.all_eq_true.mpr
  intro old member
  apply activityBodyClaimsDisjoint_userTask_of_not_mem
    (makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin).record
    old
    { processInstanceId := instanceId
      elementId := ⟨contract.task.id.value⟩
      activation := activationCount state contract.task.id + 1 }
  intro claimed
  have sameBodies : regionalActivityBodyTasks old.body = activityBodyTaskClaims old.body := by
    cases old.body <;> rfl
  have conflict : regionalActivityAssociationsConflict old
      (makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin).record = true := by
    simp only [regionalActivityAssociationsConflict, sameBodies]
    simp [makeInternalMessageTaskPatch, regionalActivityBodyTasks, List.any_eq_true, claimed]
  have present : state.activityOccurrences.any (regionalActivityAssociationsConflict ·
      (makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin).record) = true :=
    List.any_eq_true.mpr ⟨old, member, conflict⟩
  rw [disjoint] at present
  contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
