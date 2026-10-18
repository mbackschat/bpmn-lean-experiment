import BpmnSemantics.SemanticProcess.InternalCommutationCore
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import BpmnSemantics.SemanticProcess.OccurrenceReservationState
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
      if selected.id == owner then completeDeclaredScope? program state scopeId parentOutput else none
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

/-- Token-offer readiness reads exact scope resolution and owned units, independently of shared data and counters. -/
theorem applyInternalOperationOccurrence_token_offer_read_frame
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (tokenOperation : operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd])
    (control : after.control = before.control) (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (counts : ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length =
      (before.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length) :
    (applyInternalOperationOccurrence? program after candidate).isSome =
      (applyInternalOperationOccurrence? program before candidate).isSome := by
  have selected : resolveInternalOperationOccurrence? program after candidate = some operation := by
    simpa only [resolveInternalOperationOccurrence?, internalOperationOccurrences?, scopes] using resolved
  cases running : before.control <;>
    simp only [applyInternalOperationOccurrence?, control, running] <;> try rfl
  cases operation <;> simp [SemanticOperation.kind] at tokenOperation
  all_goals simp [selected, resolved, counts]
  all_goals split <;> simp_all

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

/-- Exact resolution supplies both the declaration and its discovery key. -/
theorem resolveInternalOperationOccurrence_declaration (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    operation ∈ program.operations ∧ operation.id = candidate.operationId := by
  unfold resolveInternalOperationOccurrence? at resolved
  obtain ⟨candidates, _, resolved⟩ := Option.bind_eq_some_iff.mp resolved
  split at resolved
  · exact ⟨List.mem_of_find?_eq_some resolved, by simpa using List.find?_some resolved⟩
  · contradiction

/-- Discovery retains all enabled exact candidates and refuses operation kinds outside this dispatcher. -/
def deriveInternalOccurrenceFrontier? (program : Program) (state : RuntimeState) :
    Option (List (InternalOperationOccurrence × RuntimeState)) := do
  let pieces ← (sortBy (fun left right : SemanticOperation => left.id.value < right.id.value)
    program.operations).mapM (internalOperationOccurrenceOffers? program state)
  pure pieces.flatten

/-- PMIS-SELECT-01 token-only edits share a certificate with fixed-slot wait issuance. -/
structure InternalOccurrenceTokenPatch where
  operation : SemanticOperation
  tokens : TokenPatch
  endIncrement : Nat
  deriving Repr, DecidableEq

inductive InternalOccurrencePatch where
  | arm (patch : InternalArmingPatch)
  | token (patch : InternalOccurrenceTokenPatch)
  deriving Repr, DecidableEq

def InternalOccurrencePatch.operation : InternalOccurrencePatch → SemanticOperation
  | .arm patch => patch.operation
  | .token patch => patch.operation

def InternalOccurrencePatch.owner : InternalOccurrencePatch → ScopeOccurrenceId
  | .arm patch => patch.owner
  | .token patch => patch.tokens.owner

def InternalOccurrencePatch.waitOccurrence? : InternalOccurrencePatch → Option OccurrenceId
  | .arm patch => some patch.write.occurrence
  | .token _ => none

def InternalOccurrencePatch.tokenKeys (patch : InternalOccurrencePatch) : List (ScopeOccurrenceId × ControlPlaceId) :=
  match patch with
  | .arm patch => [(patch.owner, patch.input)]
  | .token patch => (patch.tokens.consumed ++ patch.tokens.produced).map (patch.tokens.owner, ·)

def InternalOccurrencePatch.endIncrement : InternalOccurrencePatch → Nat
  | .arm _ => 0
  | .token patch => patch.endIncrement

def InternalOccurrencePatch.apply (state : RuntimeState) : InternalOccurrencePatch → RuntimeState
  | .arm patch => applyInternalArmingPatch state patch
  | .token patch =>
      { state with
        tokens := patch.tokens.apply state.tokens
        endOccurrences := state.endOccurrences + patch.endIncrement }

structure InternalOccurrenceBatch where
  program : Program
  predecessor : RuntimeState
  members : List InternalOccurrencePatch
  deriving Repr, DecidableEq

def occurrenceOwnerRootValid (program : Program) (state : RuntimeState) :
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

/-- Exact-owner token controls retain immutable provenance and check every affected bucket. -/
def prepareOccurrenceTokenPatch? (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) : Option InternalOccurrenceTokenPatch := do
  let .running runtimeId := state.control | none
  let operation ← resolveInternalOperationOccurrence? program state candidate
  let (consumed, produced, endIncrement) ← match operation with
    | .duplicate _ _ input outputs => if outputs.isEmpty then none else some ([input], outputs, 0)
    | .synchronize _ _ inputs output => if inputs.isEmpty then none else some (inputs, [output], 0)
    | .reachNoneEnd _ _ input => some ([input], [], 1)
    | _ => none
  let owner := candidate.owner
  if owner.processInstanceId != runtimeId || !exactLiveOccurrence state owner ||
      !exactProgramSelection program operation owner || operation.origin.elementId.value.isEmpty ||
      !SemanticProcessJson.isSafeWireNat state.logicalTimeMs ||
      !occurrenceOwnerRootValid program state (state.scopeOccurrences.length + 1) owner ||
      !decide consumed.Nodup || !decide produced.Nodup ||
      !(consumed.all fun input => (state.tokens.filter fun token => token.placeId == input && token.owner == owner).length == 1) ||
      !(endIncrement == 0 || SemanticProcessJson.isSafeWireNat (state.endOccurrences + endIncrement)) then none
  else pure ()
  let tokens : TokenPatch := { owner, consumed, produced }
  if !(consumed ++ produced).all (fun place =>
      let count := (state.tokens.filter fun token => token.placeId == place && token.owner == owner).length
      SemanticProcessJson.isSafeWireNat count &&
        SemanticProcessJson.isSafeWireNat (count - consumed.count place + produced.count place)) then none
  else pure ()
  let _ ← internalLocalControlPositionDelta? program tokens
  some { operation, tokens, endIncrement }

def reserveOccurrenceMembers? (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) : List InternalOperationOccurrence → Option (List InternalOccurrencePatch)
  | [] => some reserved
  | candidate :: rest => do
      let operation ← resolveInternalOperationOccurrence? program state candidate
      let member ← match operation with
        | .awaitUserTask .. | .awaitEffect .. => do
            let base ← occurrenceCounterBase? state operation
            let (kind, element) ← match operation with
              | .awaitUserTask _ _ _ _ task => some (InternalWaitKind.userTask, task.id.value)
              | .awaitEffect _ _ _ _ effect _ => some (InternalWaitKind.effect, effect.elementId.value)
              | _ => none
            let offset := (reserved.filter fun member => match member with
              | .arm patch => patch.write.kind == kind && patch.write.elementId.value == element
              | .token _ => false).length
            let patch ← prepareReservedOccurrenceArm? program state candidate (base + offset + 1)
            pure (InternalOccurrencePatch.arm patch)
        | _ => InternalOccurrencePatch.token <$> prepareOccurrenceTokenPatch? program state candidate
      reserveOccurrenceMembers? program state (reserved ++ [member]) rest

def acceptOccurrenceBatch? (program : Program) (state : RuntimeState)
    (members : List InternalOccurrencePatch) : Option InternalOccurrenceBatch :=
  let increments := (members.map (·.endIncrement)).sum
  if 2 ≤ members.length &&
      decide (members.Pairwise fun left right => ∀ key ∈ left.tokenKeys, key ∉ right.tokenKeys) &&
      decide (members.filterMap (·.waitOccurrence?)).Nodup &&
      (members.filterMap (·.waitOccurrence?)).all (fun id => 0 < id.activation &&
        SemanticProcessJson.isSafeWireNat id.activation) &&
      (increments == 0 || SemanticProcessJson.isSafeWireNat (state.endOccurrences + increments)) then
    some { program, predecessor := state, members }
  else none

/-- Complete-frontier certificates preserve legacy preparation and bind all consulted state conservatively. -/
def prepareInternalOccurrenceBatch? (program : Program) (state : RuntimeState) :
    Option InternalOccurrenceBatch := do
  if program.identity.semanticProfile.value != "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ||
      !occurrenceReservationStateValid state then none
  else
    let offers ← deriveInternalOccurrenceFrontier? program state
    let members ← reserveOccurrenceMembers? program state [] (offers.map Prod.fst)
    acceptOccurrenceBatch? program state members

def occurrenceMemberRevalidated (program : Program) (state : RuntimeState) : InternalOccurrencePatch → Bool
  | .arm patch =>
      occurrenceCounterBase? state patch.operation == some (patch.write.occurrence.activation - 1) &&
      patch.write.occurrence.activation > 0 &&
      prepareReservedOccurrenceArm? program state ⟨patch.operation.id, patch.owner⟩
        patch.write.occurrence.activation == some patch
  | .token patch =>
      prepareOccurrenceTokenPatch? program state ⟨patch.operation.id, patch.tokens.owner⟩ == some patch

def applyReservedOccurrencePrefix? (program : Program) (state : RuntimeState) :
    List InternalOccurrencePatch → Option (List RuntimeState)
  | [] => some []
  | patch :: rest => do
      if !occurrenceMemberRevalidated program state patch then none else do
        let next := patch.apply state
        let successors ← applyReservedOccurrencePrefix? program next rest
        some (next :: successors)

/-- A failed prefix returns no partial successor. Frozen slots are revalidated, never freshly allocated. -/
def applyInternalOccurrenceBatch? (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) : Option (List RuntimeState) :=
  if batch.program != program || batch.predecessor != state ||
      prepareInternalOccurrenceBatch? program state != some batch then none
  else applyReservedOccurrencePrefix? program state batch.members

/-- Successful reservation rejects repeated public anchors before any member is applied. -/
theorem prepareInternalOccurrenceBatch_distinct_anchors (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch)
    (prepared : prepareInternalOccurrenceBatch? program state = some batch) :
    (batch.members.filterMap (·.waitOccurrence?)).Nodup := by
  unfold prepareInternalOccurrenceBatch? at prepared
  split at prepared
  · contradiction
  · obtain ⟨offers, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    obtain ⟨members, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    unfold acceptOccurrenceBatch? at prepared
    dsimp only at prepared
    split at prepared
    · rename_i valid
      cases prepared
      simp_all only [Bool.and_eq_true, decide_eq_true_eq]
    · contradiction

/-- Applying a certificate cannot silently rebind its complete predecessor or Program. -/
theorem applyInternalOccurrenceBatch_requires_predecessor (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (applied : applyInternalOccurrenceBatch? program state batch = some successors) :
    batch.program = program ∧ batch.predecessor = state := by
  unfold applyInternalOccurrenceBatch? at applied
  split at applied
  · contradiction
  · rename_i valid
    by_cases sameProgram : batch.program = program
    · by_cases sameState : batch.predecessor = state
      · exact ⟨sameProgram, sameState⟩
      · simp [sameState] at valid
    · simp [sameProgram] at valid


private theorem reservedPatch_preserves_body_data (state : RuntimeState) (patch : InternalOccurrencePatch) :
    (patch.apply state).variables.process = state.variables.process ∧
    (patch.apply state).variables.scopes = state.variables.scopes := by
  cases patch with
  | arm patch => cases writeEq : patch.write <;> simp [InternalOccurrencePatch.apply, applyInternalArmingPatch, writeEq]
  | token patch => exact ⟨rfl, rfl⟩

private theorem reservedPrefix_steps_and_frames (program : Program) (members : List InternalOccurrencePatch)
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
theorem applyInternalOccurrenceBatch_steps_and_frames (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (applied : applyInternalOccurrenceBatch? program state batch = some successors) :
    successors.length = batch.members.length ∧ ∀ successor ∈ successors,
      successor.variables.process = state.variables.process ∧ successor.variables.scopes = state.variables.scopes := by
  unfold applyInternalOccurrenceBatch? at applied
  split at applied
  · contradiction
  · exact reservedPrefix_steps_and_frames program batch.members state successors applied

private theorem occurrenceMemberRevalidated_prepared (program : Program) (state : RuntimeState)
    (patch : InternalOccurrencePatch) :
    occurrenceMemberRevalidated program state patch = true →
    match patch with
    | .arm arm => prepareReservedOccurrenceArm? program state ⟨arm.operation.id, arm.owner⟩
        arm.write.occurrence.activation = some arm
    | .token token => prepareOccurrenceTokenPatch? program state ⟨token.operation.id, token.tokens.owner⟩ = some token := by
  intro revalidated
  cases patch with
  | arm arm =>
      simp only [occurrenceMemberRevalidated, Bool.and_eq_true, beq_iff_eq] at revalidated
      exact revalidated.2
  | token token =>
      simpa only [occurrenceMemberRevalidated, beq_iff_eq] using revalidated

private theorem occurrenceMemberRevalidated_evidence (program : Program) (state : RuntimeState)
    (patch : InternalOccurrencePatch) : occurrenceMemberRevalidated program state patch = true →
    match patch with
    | .arm arm => occurrenceCounterBase? state arm.operation = some (arm.write.occurrence.activation - 1) ∧
        arm.write.occurrence.activation > 0 ∧ prepareReservedOccurrenceArm? program state
          ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation = some arm
    | .token token => prepareOccurrenceTokenPatch? program state ⟨token.operation.id, token.tokens.owner⟩ = some token := by
  intro revalidated
  cases patch <;> simpa only [occurrenceMemberRevalidated, Bool.and_eq_true, beq_iff_eq,
    decide_eq_true_eq, and_assoc] using revalidated

/-- A batch step retains exact predecessor preparation and the frozen arm allocation revalidation. -/
def InternalOccurrencePatchStep (program : Program) (before after : RuntimeState)
    (patch : InternalOccurrencePatch) : Prop :=
  after = patch.apply before ∧ match patch with
  | .arm arm => occurrenceCounterBase? before arm.operation = some (arm.write.occurrence.activation - 1) ∧
      arm.write.occurrence.activation > 0 ∧ prepareReservedOccurrenceArm? program before
        ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation = some arm
  | .token token => prepareOccurrenceTokenPatch? program before ⟨token.operation.id, token.tokens.owner⟩ = some token

/-- Actual arm revalidation allocates exactly the native singleton counter's next activation. -/
theorem InternalOccurrencePatchStep.arm_activation (program : Program) (before after : RuntimeState)
    (arm : InternalArmingPatch) : InternalOccurrencePatchStep program before after (.arm arm) →
    match arm.operation with
    | .awaitUserTask _ _ _ _ task => arm.write.occurrence.activation = activationCount before task.id + 1
    | .awaitEffect _ _ _ _ effect _ => arm.write.occurrence.activation = effectActivationCount before effect.elementId + 1
    | _ => False := by
  rintro ⟨_, base, positive, _⟩
  cases operation : arm.operation <;>
    simp only [occurrenceCounterBase?, operation, bind, Option.bind_none, Option.bind_some] at base ⊢ <;>
    try contradiction
  all_goals split at base <;> try contradiction
  case awaitUserTask.isFalse =>
    simp only [taskActivationCount_string_lookup, Option.some.injEq] at base
    unfold activationCount
    omega
  case awaitEffect.isFalse =>
    simp only [effectActivationCount_string_lookup, Option.some.injEq] at base
    omega

private theorem reservedPrefix_ordered_steps (program : Program) (members : List InternalOccurrencePatch)
    (state : RuntimeState) (successors : List RuntimeState)
    (applied : applyReservedOccurrencePrefix? program state members = some successors) :
    ∀ pair ∈ members.zip ((state :: successors).zip successors),
      InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1 := by
  induction members generalizing state successors with
  | nil =>
      simp only [applyReservedOccurrencePrefix?, Option.some.injEq] at applied
      subst successors
      simp
  | cons patch rest ih =>
      simp only [applyReservedOccurrencePrefix?] at applied
      split at applied
      · contradiction
      · rename_i valid
        have revalidated : occurrenceMemberRevalidated program state patch = true := by
          cases checked : occurrenceMemberRevalidated program state patch with
          | false => simp [checked] at valid
          | true => rfl
        obtain ⟨tail, tailApplied, applied⟩ := Option.bind_eq_some_iff.mp applied
        cases applied
        intro pair found
        rcases List.mem_cons.mp found with rfl | later
        · exact ⟨rfl, occurrenceMemberRevalidated_evidence program state patch revalidated⟩
        · exact ih _ _ tailApplied pair later

/-- Successful batch members are paired in order with their real predecessor/successor states. -/
theorem applyInternalOccurrenceBatch_ordered_steps (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (applied : applyInternalOccurrenceBatch? program state batch = some successors) :
    successors.length = batch.members.length ∧
      ∀ pair ∈ batch.members.zip ((state :: successors).zip successors),
        InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1 := by
  refine ⟨(applyInternalOccurrenceBatch_steps_and_frames program state batch successors applied).1, ?_⟩
  unfold applyInternalOccurrenceBatch? at applied
  split at applied
  · contradiction
  · exact reservedPrefix_ordered_steps program batch.members state successors applied

private theorem ordered_patch_invariant (program : Program) (all members : List InternalOccurrencePatch)
    (predicate : RuntimeState → Prop)
    (step : ∀ before after patch, patch ∈ all → InternalOccurrencePatchStep program before after patch →
      predicate before → predicate after)
    (contained : ∀ patch ∈ members, patch ∈ all) (before : RuntimeState) (successors : List RuntimeState)
    (length : successors.length = members.length)
    (steps : ∀ pair ∈ members.zip ((before :: successors).zip successors),
      InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1)
    (initial : predicate before) : ∀ after ∈ successors, predicate after := by
  induction members generalizing before successors with
  | nil => cases successors <;> simp_all
  | cons patch rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      have nextValid := step before next patch (contained patch (by simp)) (steps (patch, before, next) (by simp)) initial
      have later := ih (fun member found => contained member (by simp [found])) next tail
        (by simpa using length) (fun pair found =>
          steps pair (by simp only [List.zip_cons_cons, List.mem_cons]; exact Or.inr found)) nextValid
      intro after found
      rcases List.mem_cons.mp found with rfl | found
      · exact nextValid
      · exact later after found

/-- Ordered actual batch steps expose complete revalidation, rather than only preparation at each predecessor. -/
theorem applyInternalOccurrenceBatch_patch_induction (program : Program) (before : RuntimeState)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState) (predicate : RuntimeState → Prop)
    (initial : predicate before)
    (step : ∀ before after patch, patch ∈ batch.members →
      InternalOccurrencePatchStep program before after patch → predicate before → predicate after)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors) :
    ∀ after ∈ successors, predicate after := by
  obtain ⟨length, steps⟩ := applyInternalOccurrenceBatch_ordered_steps program before batch successors applied
  exact ordered_patch_invariant program batch.members batch.members predicate step
    (fun _ found => found) before successors length steps initial

/-- PMIS-SELECT-01 revalidates each prefix before applying it; this preparation-level form is a corollary of the actual-step induction above. -/
theorem applyInternalOccurrenceBatch_prefix_induction (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState) (predicate : RuntimeState → Prop)
    (initial : predicate state)
    (step : ∀ before patch, patch ∈ batch.members →
      (match patch with
      | .arm arm => prepareReservedOccurrenceArm? program before ⟨arm.operation.id, arm.owner⟩
          arm.write.occurrence.activation = some arm
      | .token token => prepareOccurrenceTokenPatch? program before ⟨token.operation.id, token.tokens.owner⟩ = some token) →
      predicate before → predicate (patch.apply before))
    (applied : applyInternalOccurrenceBatch? program state batch = some successors) :
    ∀ successor ∈ successors, predicate successor := by
  apply applyInternalOccurrenceBatch_patch_induction program state batch successors predicate initial _ applied
  intro before after patch member actual prior
  rw [actual.1]
  cases patch with
  | arm arm => exact step before (.arm arm) member actual.2.2.2 prior
  | token token => exact step before (.token token) member actual.2 prior

private theorem refusingGuardSuccess {α : Type} (guard : Bool) (tail : Option α) (value : α)
    (successful : (if guard then none else tail) = some value) : tail = some value := by
  cases guard <;> simp_all

private theorem occurrenceApplicationRunning (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ∃ instanceId, before.control = .running instanceId := by
  cases control : before.control with
  | running instanceId => exact ⟨instanceId, rfl⟩
  | _ => simp [applyInternalOperationOccurrence?, control] at applied

private def singletonArmingPatch (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (write : InternalArmingWrite) : InternalArmingPatch :=
  { operation, definition := program.identity, processId := program.processId,
    origin := operation.origin, runtimeInstanceId := owner.processInstanceId,
    logicalTimeMs := before.logicalTimeMs, input, inputOrigin := { elementId := ⟨input.value⟩ }, owner, write }

/-- Actual body execution is either aligned wait arming or an exact-owner token edit with an End increment. -/
theorem applyInternalOperationOccurrence_body_effect
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    (∃ patch : InternalArmingPatch, patch.owner = candidate.owner ∧ patch.write.owner = patch.owner ∧
      after = applyInternalArmingPatch before patch) ∨
    (∃ patch : TokenPatch, ∃ increment : Nat, patch.owner = candidate.owner ∧
      after = { before with tokens := patch.apply before.tokens, endOccurrences := before.endOccurrences + increment }) := by
  obtain ⟨instanceId, running⟩ := occurrenceApplicationRunning program before after candidate applied
  cases operation <;> simp [SemanticOperation.kind] at bodyOperation
  all_goals simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    have applied := refusingGuardSuccess _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner with
    | false =>
        simp only [parallel, pure, Option.bind_some] at applied
        cases Option.some.inj applied
        let patch := singletonArmingPatch program before (.awaitUserTask id origin input output task) candidate.owner input
          (.userTask
            { processInstanceId := candidate.owner.processInstanceId
              owner := candidate.owner
              task := task
              activation := activationCount before task.id + 1
              output := output
              metadata := task.metadata })
        exact Or.inl ⟨patch, rfl, rfl, rfl⟩
    | true =>
        simp only [parallel, ↓reduceIte, pure, Option.bind_some] at applied
        obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
        cases Option.some.inj applied
        let patch := singletonArmingPatch program before (.awaitUserTask id origin input output task) candidate.owner input
          (.userTask
            { processInstanceId := candidate.owner.processInstanceId
              owner := candidate.owner
              task := task
              activation := activationCount before task.id + 1
              output := output
              metadata := task.metadata })
        exact Or.inl ⟨patch, rfl, rfl, rfl⟩
  case awaitEffect id origin input output effect route =>
    have applied := refusingGuardSuccess _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      let patch := singletonArmingPatch program before (.awaitEffect id origin input output effect route) candidate.owner input
        (.effect
          { processInstanceId := candidate.owner.processInstanceId
            owner := candidate.owner
            elementId := effect.elementId
            activation := effectActivationCount before effect.elementId + 1
            descriptor := effect.descriptor
            arguments := arguments
            outputMappings := effect.outputMappings
            output := output
            bpmnErrorRoute := route } arguments)
      exact Or.inl ⟨patch, rfl, rfl, rfl⟩
  case duplicate id origin input outputs =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact Or.inr ⟨{ owner := candidate.owner, consumed := [input], produced := outputs }, 0, rfl, rfl⟩
  case synchronize id origin inputs output =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact Or.inr ⟨{ owner := candidate.owner, consumed := inputs, produced := [output] }, 0, rfl, rfl⟩
  case reachNoneEnd id origin input =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact Or.inr ⟨{ owner := candidate.owner, consumed := [input], produced := [] }, 1, rfl, rfl⟩

/-- Both reserved patch forms preserve the population and data read by parallel retirement. -/
theorem InternalOccurrencePatch.retirement_frame (state : RuntimeState) (patch : InternalOccurrencePatch) :
    (patch.apply state).control = state.control ∧
      (patch.apply state).scopeOccurrences = state.scopeOccurrences ∧
      (patch.apply state).activityOccurrences = state.activityOccurrences ∧
      (patch.apply state).parallelScopeControllers = state.parallelScopeControllers ∧
      (patch.apply state).variables.scopes = state.variables.scopes ∧
      (patch.apply state).variables.process = state.variables.process := by
  cases patch with
  | arm arm => cases write : arm.write <;> simp [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]
  | token token => exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- Revalidated batch execution preserves retirement eligibility and Process data at every actual prefix. -/
theorem applyInternalOccurrenceBatch_retirement_frames
    (program : Program) (state : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState)
    (applied : applyInternalOccurrenceBatch? program state batch = some successors) :
    ∀ successor ∈ successors,
      successor.control = state.control ∧ successor.scopeOccurrences = state.scopeOccurrences ∧
      successor.activityOccurrences = state.activityOccurrences ∧
      successor.parallelScopeControllers = state.parallelScopeControllers ∧
      successor.variables.scopes = state.variables.scopes ∧
      successor.variables.process = state.variables.process := by
  apply applyInternalOccurrenceBatch_prefix_induction program state batch successors
    (fun current => current.control = state.control ∧ current.scopeOccurrences = state.scopeOccurrences ∧
      current.activityOccurrences = state.activityOccurrences ∧
      current.parallelScopeControllers = state.parallelScopeControllers ∧
      current.variables.scopes = state.variables.scopes ∧ current.variables.process = state.variables.process)
    ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩ _ applied
  intro before patch _ _ preserved
  obtain ⟨control, scopes, activities, controllers, frames, process⟩ := patch.retirement_frame before
  obtain ⟨oldControl, oldScopes, oldActivities, oldControllers, oldFrames, oldProcess⟩ := preserved
  exact ⟨control.trans oldControl, scopes.trans oldScopes, activities.trans oldActivities,
    controllers.trans oldControllers, frames.trans oldFrames, process.trans oldProcess⟩

/-- Every actual successful batch prefix retains the exact parallel population binding. -/
theorem applyInternalOccurrenceBatch_binding_frames
    (program : Program) (state : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) (entry : ParallelScopeEntry) (target : ScopeOccurrenceId)
    (applied : applyInternalOccurrenceBatch? program state batch = some successors) :
    ∀ successor ∈ successors,
      parallelScopeBinding? entry successor target = parallelScopeBinding? entry state target := by
  intro successor member
  obtain ⟨control, scopes, activities, controllers, frames, _⟩ :=
    applyInternalOccurrenceBatch_retirement_frames program state batch successors applied successor member
  exact parallelScopeBinding_state_frame entry state successor target control scopes activities controllers
    (congrArg (fun scopes => scopes.map ScopeVariableScope.owner) frames)

/-- Actual body edits retain the retirement population and Process condition data; arming adds only separate Activity data. -/
theorem applyInternalOperationOccurrence_body_retirement_frame
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    after.control = before.control ∧ after.scopeOccurrences = before.scopeOccurrences ∧
      after.activityOccurrences = before.activityOccurrences ∧ after.parallelScopeControllers = before.parallelScopeControllers ∧
      after.variables.scopes = before.variables.scopes ∧ after.variables.process = before.variables.process := by
  rcases applyInternalOperationOccurrence_body_effect program before after candidate operation resolved bodyOperation applied with
    ⟨patch, _, _, rfl⟩ | ⟨patch, increment, _, rfl⟩
  · exact (InternalOccurrencePatch.arm patch).retirement_frame before
  · exact (InternalOccurrencePatch.token { operation, tokens := patch, endIncrement := increment }).retirement_frame before

/-- Parent body operations preserve the actual clean-entry population, including the child's issuance counter. -/
theorem applyInternalOperationOccurrence_body_clean_entry
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation) (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (clean : ParallelScopeCleanEntry entry parent before)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ParallelScopeCleanEntry entry parent after := by
  obtain ⟨_, scopes, activities, controllers, locals, _⟩ :=
    applyInternalOperationOccurrence_body_retirement_frame program before after candidate operation resolved bodyOperation applied
  have counters : after.scopeActivations = before.scopeActivations := by
    rcases applyInternalOperationOccurrence_body_effect program before after candidate operation resolved bodyOperation applied with
      ⟨patch, _, _, rfl⟩ | ⟨patch, increment, _, rfl⟩
    · cases write : patch.write <;> simp [applyInternalArmingPatch, write]
    · rfl
  exact ParallelScopeCleanEntry.frame entry parent before after clean scopes activities controllers locals counters

/-- Exact binding eligibility survives every actual successful body operation, independently of token changes. -/
theorem applyInternalOperationOccurrence_body_binding_frame
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation) (entry : ParallelScopeEntry) (target : ScopeOccurrenceId)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    parallelScopeBinding? entry after target = parallelScopeBinding? entry before target := by
  obtain ⟨control, scopes, activities, controllers, frames, _⟩ :=
    applyInternalOperationOccurrence_body_retirement_frame program before after candidate operation resolved bodyOperation applied
  exact parallelScopeBinding_state_frame entry before after target control scopes activities controllers (congrArg (fun scopes => scopes.map ScopeVariableScope.owner) frames)

/-- PMIS retirement readiness survives every reserved prefix; only the body's quiescence remains to be established. -/
theorem applyInternalOccurrenceBatch_retirement_ready
    (program : Program) (state : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) (entry : ParallelScopeEntry) (target : ScopeOccurrenceId)
    (binding : ParallelScopeBinding)
    (applied : applyInternalOccurrenceBatch? program state batch = some successors)
    (bound : parallelScopeBinding? entry state target = some binding)
    (noActivity : state.activityOccurrences.any (fun activity => activity.owner == target) = false)
    (typedCondition : match entry.completionBooleanName with
      | none => True
      | some name => ∃ condition, state.variables.process.bindings.filter (·.name == name) =
          [{ name, value := .boolean condition }]) :
    ∀ successor ∈ successors, scopeQuiescent successor target = true →
      ∃ after, completeParallelScope? entry successor target = some after := by
  intro successor present quiescent
  have boundAfter := (applyInternalOccurrenceBatch_binding_frames program state batch successors
    entry target applied successor present).trans bound
  obtain ⟨_, _, activities, _, _, process⟩ :=
    applyInternalOccurrenceBatch_retirement_frames program state batch successors applied successor present
  exact completeParallelScope_ready entry successor target binding boundAfter
    (parallelScopeBinding_member entry state target binding bound) quiescent
    (by rw [activities]; exact noActivity)
    (by
      cases named : entry.completionBooleanName with
      | none => trivial
      | some name => simpa only [named, process] using typedCondition)

end BpmnSemantics.SemanticProcess.InternalCommutation
