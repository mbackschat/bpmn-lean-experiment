import BpmnSemantics.SemanticProcess.InternalCommutationCore
import BpmnSemantics.SemanticProcess.ParallelScopeData
import BpmnSemantics.SemanticProcess.TransitionRecord

/-! PMIS-SELECT-01: complete operation/owner discovery and exact occurrence execution.
This changing execution boundary stays separate from the established alternative-order proof closure.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

/-- PMIS-SELECT-01 keeps operation identity paired with its complete scope occurrence. -/
structure InternalOperationOccurrence where
  operationId : OperationId
  owner : ScopeOccurrenceId
  deriving Repr, DecidableEq

/-- Owner discovery is independent of token/data readiness, which belongs to the evaluator. -/
def internalOperationOccurrences? (program : Program) (state : RuntimeState) (id : OperationId) :
    Option (List InternalOperationOccurrence) := do
  let [_] := program.operations.filter (·.id == id) | none
  let [binding] := program.operationScopes.filter (·.operationId == id) | none
  let owners := sortBy scopeBefore
    ((state.scopeOccurrences.map (·.id)).filter (·.definitionScopeId == binding.scopeId))
  if owners.Nodup then some (owners.map fun owner => ⟨id, owner⟩) else none

/-- A removed owner never rebinds to a remaining occurrence of the same definition. -/
def resolveInternalOperationOccurrence? (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) : Option SemanticOperation := do
  let candidates ← internalOperationOccurrences? program state candidate.operationId
  if candidates.contains candidate then program.operations.find? (·.id == candidate.operationId) else none

/-- Revalidation cannot succeed without the exact candidate in current discovery. -/
theorem resolveInternalOperationOccurrence_requires_exact_candidate (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    ∃ candidates, internalOperationOccurrences? program state candidate.operationId = some candidates ∧
      candidate ∈ candidates := by
  unfold resolveInternalOperationOccurrence? at resolved
  cases discovered : internalOperationOccurrences? program state candidate.operationId with
  | none => simp [discovered] at resolved
  | some candidates =>
      refine ⟨candidates, rfl, ?_⟩
      by_cases present : candidate ∈ candidates
      · exact present
      · simp [discovered, present] at resolved

private def occurrenceCounterRowsValid (counters : List (String × Nat)) : Bool :=
  decide (counters.map Prod.fst).Nodup && counters.all (fun counter =>
    !counter.1.isEmpty && SemanticProcessJson.isSafeWireNat counter.2)

/-- Issuance counters must dominate retained anchors, including suspended effects and their local frames. -/
def occurrenceReservationStateValid (state : RuntimeState) : Bool :=
  let compensation := state.compensationHandlerEffectWaits.map fun wait =>
    ({ processInstanceId := wait.id.processInstanceId, elementId := wait.id.elementId,
       activation := wait.id.activation } : OccurrenceId)
  let issued := fun (id : OccurrenceId) (count : Nat) =>
    0 < id.activation && SemanticProcessJson.isSafeWireNat id.activation && id.activation ≤ count
  occurrenceCounterRowsValid (state.activations.map fun row => (row.taskId.value, row.count)) &&
    occurrenceCounterRowsValid (state.effectActivations.map fun row => (row.elementId.value, row.count)) &&
    decide (openWaitAnchors state ++ compensation).Nodup &&
    decide (state.variables.activities.map (·.owner)).Nodup &&
    state.waits.all (fun wait => issued (userTaskWaitOccurrence wait) (activationCount state wait.task.id)) &&
    (state.effectWaits.map effectWaitOccurrence ++
      state.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait) ++ compensation).all
      (fun id => issued id (effectActivationCount state ⟨id.elementId.value⟩)) &&
    state.variables.activities.all (fun frame => match frame.owner with
      | .effectOccurrence id => issued ⟨id.processInstanceId, id.elementId, id.activation⟩
          (effectActivationCount state ⟨id.elementId.value⟩)
      | .activityOccurrence _ => true)

/-- PMIS-SELECT-01 revalidates the exact occurrence and each consumed token before an internal step. -/
def applyInternalOperationOccurrence? (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) : Option RuntimeState := do
  let .running _ := state.control | none
  let operation ← resolveInternalOperationOccurrence? program state candidate
  let owner := candidate.owner
  let unit := fun input => (state.tokens.filter fun token => token.placeId == input && token.owner == owner).length == 1
  match operation with
  | .initiate _ _ output => do
      let [root] := state.scopeOccurrences.filter (·.parent.isNone) | none
      if root.id == owner then initiateState? state output else none
  | .completeScope _ _ scopeId parentOutput => do
      let [selected] := state.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) | none
      if selected.id == owner then completeSelectedScope? program state scopeId parentOutput else none
  | .enterParallelMultiInstanceScope .. | .completeParallelMultiInstanceScope .. =>
      applyParallelScopeOperation? program operation.id state owner
  | .awaitEffect _ _ input output effect route => do
      if !unit input || !occurrenceReservationStateValid state ||
          !SemanticProcessJson.isSafeWireNat (effectActivationCount state effect.elementId + 1) ||
          (hasParallelScopeDefinition program owner && hasSequentialScopeDefinition program owner) then none
      else
        let arguments ← if hasParallelScopeDefinition program owner then
          evaluateParallelScopeInputs? program state owner effect.inputMappings
          else evaluateEffectInputs? program state owner effect.inputMappings
        some (activateEffect state owner.processInstanceId owner input output effect route arguments)
  | .awaitUserTask _ _ input output task => do
      if !unit input || !occurrenceReservationStateValid state ||
          !SemanticProcessJson.isSafeWireNat (activationCount state task.id + 1) ||
          (hasParallelScopeDefinition program owner && hasSequentialScopeDefinition program owner) then none
      else
        if hasParallelScopeDefinition program owner then
          let _ ← evaluateParallelScopeInputs? program state owner []
          pure ()
        else pure ()
        some (activateUserTask state owner.processInstanceId owner input output task)
  | .duplicate _ _ input outputs =>
      if unit input then some (duplicateToken state owner input outputs) else none
  | .synchronize _ _ inputs output =>
      if !inputs.isEmpty && decide inputs.Nodup && inputs.all unit then
        some (synchronizeTokens state owner inputs output) else none
  | .reachNoneEnd _ _ input =>
      if unit input then some (reachNoneEndToken state owner input) else none
  | _ => none

/-- PMIS-SELECT-01 replays the recorded owner rather than selecting a unique owner across all bodies. -/
def replayInternalOperationOccurrence? (program : Program) (state : RuntimeState)
    (record : InternalTransitionRecord) : Option RuntimeState := do
  let operation ← resolveInternalOperationOccurrence? program state ⟨record.operationId, record.owner⟩
  if program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ∧
      operation.kind = record.operationKind ∧ operation.origin = record.origin ∧ record.mergeInput = none then
    applyInternalOperationOccurrence? program state ⟨record.operationId, record.owner⟩
  else none

/-- Successful replay preserves exact metadata and reconstructs the occurrence-addressed transition. -/
theorem replayInternalOperationOccurrence_sound (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord)
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    ∃ operation,
      resolveInternalOperationOccurrence? program before ⟨record.operationId, record.owner⟩ = some operation ∧
      operation.kind = record.operationKind ∧ operation.origin = record.origin ∧ record.mergeInput = none ∧
      applyInternalOperationOccurrence? program before ⟨record.operationId, record.owner⟩ = some after := by
  unfold replayInternalOperationOccurrence? at replayed
  obtain ⟨operation, resolved, replayed⟩ := Option.bind_eq_some_iff.mp replayed
  split at replayed
  · next valid => exact ⟨operation, resolved, valid.2.1, valid.2.2.1, valid.2.2.2, replayed⟩
  · contradiction

/-- Shared by scheduler and batch discovery so failed enabled waits cannot disappear in either census. -/
def internalOperationOccurrenceOffers? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option (List (InternalOperationOccurrence × RuntimeState)) := do
  match operation with
  | .initiate .. | .completeScope .. | .enterParallelMultiInstanceScope .. | .completeParallelMultiInstanceScope .. |
    .awaitEffect .. | .awaitUserTask .. | .duplicate .. | .synchronize .. | .reachNoneEnd .. => do
      let candidates ← internalOperationOccurrences? program state operation.id
      let steps ← candidates.mapM fun candidate => do
        let enabledWait := match operation with
          | .awaitUserTask _ _ input .. | .awaitEffect _ _ input .. =>
              state.tokens.any fun token => token.placeId == input && token.owner == candidate.owner
          | _ => false
        -- PMIS-SELECT-01 forbids treating an enabled wait's failed arming as a disabled candidate.
        match applyInternalOperationOccurrence? program state candidate with
        | some successor => some [(candidate, successor)]
        | none => if enabledWait then none else some []
      pure steps.flatten
  | _ => none

/-- Discovery retains all enabled exact candidates and refuses operation kinds outside this dispatcher. -/
def deriveInternalOccurrenceFrontier? (program : Program) (state : RuntimeState) :
    Option (List (InternalOperationOccurrence × RuntimeState)) := do
  let pieces ← (sortBy (fun left right : SemanticOperation => left.id.value < right.id.value)
    program.operations).mapM (internalOperationOccurrenceOffers? program state)
  pure pieces.flatten

structure InternalOccurrenceArmingBatch where
  program : Program
  predecessor : RuntimeState
  members : List InternalArmingPatch
  deriving Repr, DecidableEq

private def occurrenceOwnerRootValid (program : Program) (state : RuntimeState) :
    Nat → ScopeOccurrenceId → Bool
  | 0, _ => false
  | fuel + 1, owner =>
      match state.scopeOccurrences.filter (·.id == owner), program.definitionScopes.filter (·.id == owner.definitionScopeId) with
      | [scope], [definition] =>
          match scope.parent, definition.parentScopeId with
          | none, none => definition.originElementId.value == program.processId.value
          | some parent, some parentDefinition =>
              parent.processInstanceId == owner.processInstanceId && parent.definitionScopeId == parentDefinition &&
                occurrenceOwnerRootValid program state fuel parent
          | _, _ => false
      | _, _ => false

private def occurrenceCounterBase? (state : RuntimeState) (operation : SemanticOperation) : Option Nat := do
  let (element, counters) ← match operation with
    | .awaitUserTask _ _ _ _ task => some (task.id.value, state.activations.map fun counter =>
        (counter.taskId.value, counter.count))
    | .awaitEffect _ _ _ _ effect _ => some (effect.elementId.value, state.effectActivations.map fun counter =>
        (counter.elementId.value, counter.count))
    | _ => none
  if !occurrenceCounterRowsValid counters then none
  else some (((counters.find? (·.1 == element)).map Prod.snd).getD 0)

/-- PMIS-SELECT-01 validates the full body binding but uses the certificate's frozen allocation. -/
def prepareReservedOccurrenceArm? (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (activation : Nat) : Option InternalArmingPatch := do
  let .running runtimeId := state.control | none
  if activation = 0 || !SemanticProcessJson.isSafeWireNat activation ||
      candidate.owner.processInstanceId != runtimeId || runtimeId.value.isEmpty ||
      candidate.owner.definitionScopeId.value.isEmpty || candidate.owner.activation = 0 ||
      !SemanticProcessJson.isSafeWireNat candidate.owner.activation ||
      !SemanticProcessJson.isSafeWireNat state.logicalTimeMs ||
      !occurrenceOwnerRootValid program state (state.scopeOccurrences.length + 1) candidate.owner then none else pure ()
  let operation ← resolveInternalOperationOccurrence? program state candidate
  let owner := candidate.owner
  let input ← internalArmInput? operation
  let origin ← internalArmOrigin? operation
  if !exactProgramSelection program operation owner || !exactLiveOccurrence state owner ||
      (state.tokens.filter fun token => token.placeId == input && token.owner == owner).length != 1 then none
  else pure ()
  let inputOrigin ← selectedInputOrigin? program input owner
  if hasParallelScopeDefinition program owner then
    if hasSequentialScopeDefinition program owner then none else do
      let _ ← evaluateParallelScopeInputs? program state owner []
      pure ()
  else pure ()
  let write : InternalArmingWrite ← match operation with
    | .awaitUserTask _ _ _ output task =>
        pure (.userTask {
          processInstanceId := runtimeId
          owner := owner
          task := task
          activation := activation
          output := output
          metadata := task.metadata })
    | .awaitEffect _ _ _ output effect route => do
        let arguments ← if hasParallelScopeDefinition program owner then
          evaluateParallelScopeInputs? program state owner effect.inputMappings
          else evaluateEffectInputs? program state owner effect.inputMappings
        pure (.effect {
          processInstanceId := runtimeId
          owner := owner
          elementId := effect.elementId
          activation := activation
          descriptor := effect.descriptor
          arguments := arguments
          outputMappings := effect.outputMappings
          output := output
          bpmnErrorRoute := route } arguments)
    | _ => none
  if origin.elementId.value != write.elementId.value ||
      !uniqueFamilyDeclarer? program operation write.kind write.elementId ||
      !openWaitAnchorAbsent state write.occurrence || !write.available state ||
      (match write with
        | .userTask wait => state.variables.activities.any (fun frame => match frame.owner with
            | .activityOccurrence id => id.processInstanceId == wait.processInstanceId &&
                id.activityElementId.value == wait.task.id.value && id.activation == wait.activation
            | _ => false)
        | _ => false) then none else
    some {
      operation := operation
      definition := program.identity
      processId := program.processId
      origin := origin
      runtimeInstanceId := runtimeId
      logicalTimeMs := state.logicalTimeMs
      input := input
      inputOrigin := inputOrigin
      owner := owner
      write := write }

private def reserveOccurrenceArms? (program : Program) (state : RuntimeState)
    (reserved : List InternalArmingPatch) : List InternalOperationOccurrence → Option (List InternalArmingPatch)
  | [] => some reserved
  | candidate :: rest => do
      let operation ← resolveInternalOperationOccurrence? program state candidate
      let base ← occurrenceCounterBase? state operation
      let (kind, element) ← match operation with
        | .awaitUserTask _ _ _ _ task => some (InternalWaitKind.userTask, task.id.value)
        | .awaitEffect _ _ _ _ effect _ => some (InternalWaitKind.effect, effect.elementId.value)
        | _ => none
      let offset := (reserved.filter fun patch => patch.write.kind == kind && patch.write.elementId.value == element).length
      let patch ← prepareReservedOccurrenceArm? program state candidate (base + offset + 1)
      reserveOccurrenceArms? program state (reserved ++ [patch]) rest

private def acceptOccurrenceBatch? (program : Program) (state : RuntimeState)
    (members : List InternalArmingPatch) : Option InternalOccurrenceArmingBatch :=
  if 2 ≤ members.length &&
      decide (members.map (fun patch => (patch.owner, patch.input))).Nodup &&
      decide (members.map (fun patch => patch.write.occurrence)).Nodup &&
      members.all (fun patch => 0 < patch.write.occurrence.activation &&
        SemanticProcessJson.isSafeWireNat patch.write.occurrence.activation) then
    some { program, predecessor := state, members }
  else none

/-- Complete-frontier certificates preserve legacy preparation and bind all consulted state conservatively. -/
def prepareInternalOccurrenceArmingBatch? (program : Program) (state : RuntimeState) :
    Option InternalOccurrenceArmingBatch := do
  if program.identity.semanticProfile.value != "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ||
      !occurrenceReservationStateValid state then none
  else
    let offers ← deriveInternalOccurrenceFrontier? program state
    let members ← reserveOccurrenceArms? program state [] (offers.map Prod.fst)
    acceptOccurrenceBatch? program state members

private def applyReservedOccurrencePrefix? (program : Program) (state : RuntimeState) :
    List InternalArmingPatch → Option (List RuntimeState)
  | [] => some []
  | patch :: rest => do
      let base ← occurrenceCounterBase? state patch.operation
      if base + 1 != patch.write.occurrence.activation then none else do
        let fresh ← prepareReservedOccurrenceArm? program state ⟨patch.operation.id, patch.owner⟩
          patch.write.occurrence.activation
        if fresh != patch then none else do
          let next := applyInternalArmingPatch state patch
          let successors ← applyReservedOccurrencePrefix? program next rest
          some (next :: successors)

/-- A failed prefix returns no partial successor. Frozen slots are revalidated, never freshly allocated. -/
def applyInternalOccurrenceArmingBatch? (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceArmingBatch) : Option (List RuntimeState) :=
  if batch.program != program || batch.predecessor != state ||
      prepareInternalOccurrenceArmingBatch? program state != some batch then none
  else applyReservedOccurrencePrefix? program state batch.members

/-- Successful reservation rejects repeated public anchors before any member is applied. -/
theorem prepareInternalOccurrenceArmingBatch_distinct_anchors (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceArmingBatch)
    (prepared : prepareInternalOccurrenceArmingBatch? program state = some batch) :
    (batch.members.map (fun patch => patch.write.occurrence)).Nodup := by
  unfold prepareInternalOccurrenceArmingBatch? at prepared
  split at prepared
  · contradiction
  · obtain ⟨offers, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    obtain ⟨members, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    unfold acceptOccurrenceBatch? at prepared
    split at prepared
    · rename_i valid
      cases prepared
      simp_all only [Bool.and_eq_true, decide_eq_true_eq]
    · contradiction

/-- Applying a certificate cannot silently rebind its complete predecessor or Program. -/
theorem applyInternalOccurrenceArmingBatch_requires_predecessor (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceArmingBatch) (successors : List RuntimeState)
    (applied : applyInternalOccurrenceArmingBatch? program state batch = some successors) :
    batch.program = program ∧ batch.predecessor = state := by
  unfold applyInternalOccurrenceArmingBatch? at applied
  split at applied
  · contradiction
  · rename_i valid
    by_cases sameProgram : batch.program = program
    · by_cases sameState : batch.predecessor = state
      · exact ⟨sameProgram, sameState⟩
      · simp [sameState] at valid
    · simp [sameProgram] at valid


private theorem reservedPatch_preserves_body_data (state : RuntimeState) (patch : InternalArmingPatch) :
    (applyInternalArmingPatch state patch).variables.process = state.variables.process ∧
    (applyInternalArmingPatch state patch).variables.scopes = state.variables.scopes := by
  cases writeEq : patch.write <;> simp [applyInternalArmingPatch, writeEq]

private theorem reservedPrefix_steps_and_frames (program : Program) (members : List InternalArmingPatch)
    (state : RuntimeState) (successors : List RuntimeState)
    (applied : applyReservedOccurrencePrefix? program state members = some successors) :
    successors.length = members.length ∧ ∀ successor ∈ successors,
      successor.variables.process = state.variables.process ∧ successor.variables.scopes = state.variables.scopes := by
  induction members generalizing state successors with
  | nil =>
      simp only [applyReservedOccurrencePrefix?, Option.some.injEq] at applied
      subst successors
      simp
  | cons patch rest ih =>
      simp only [applyReservedOccurrencePrefix?] at applied
      obtain ⟨base, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      split at applied
      · contradiction
      · obtain ⟨fresh, _, applied⟩ := Option.bind_eq_some_iff.mp applied
        split at applied
        · contradiction
        · obtain ⟨tail, tailApplied, applied⟩ := Option.bind_eq_some_iff.mp applied
          cases applied
          have tailFacts := ih _ _ tailApplied
          have stepFrames := reservedPatch_preserves_body_data state patch
          refine ⟨congrArg Nat.succ tailFacts.1, ?_⟩
          intro successor member
          rcases List.mem_cons.mp member with same | later
          · subst successor
            exact stepFrames
          · have frames := tailFacts.2 successor later
            exact ⟨frames.1.trans stepFrames.1, frames.2.trans stepFrames.2⟩

/-- Every successful batch retains one successor per fuel charge and preserves all Process/body bindings at every prefix. -/
theorem applyInternalOccurrenceArmingBatch_steps_and_frames (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceArmingBatch) (successors : List RuntimeState)
    (applied : applyInternalOccurrenceArmingBatch? program state batch = some successors) :
    successors.length = batch.members.length ∧ ∀ successor ∈ successors,
      successor.variables.process = state.variables.process ∧ successor.variables.scopes = state.variables.scopes := by
  unfold applyInternalOccurrenceArmingBatch? at applied
  split at applied
  · contradiction
  · exact reservedPrefix_steps_and_frames program batch.members state successors applied

end BpmnSemantics.SemanticProcess.InternalCommutation
