import BpmnSemantics.SemanticProcess.ParallelScopeBodyAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeCommandReplay
import BpmnSemantics.SemanticProcess.TokenStorage
import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import BpmnSemantics.SemanticProcess.InternalRegionalArmingSelectionFrame

/-! # External completion and internal body-operation locality

PMIS-DATA-01 replaces one exact live wait with a continuation token owned by the same body. These laws establish sibling quiescence preservation through external completion and the PMIS-SELECT-01 singleton body dispatcher. Reserved-batch prefixes can make a blocked owner quiescent only through a token patch at that owner; arming retains a wait blocker. Committed-state reachability and bounded closure progress are separate obligations in the capsule's reachable-retirement account.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem any_erase_unmatched {α : Type} [DecidableEq α]
    (values : List α) (removed : α) (predicate : α → Bool)
    (unmatched : predicate removed = false) :
    (values.erase removed).any predicate = values.any predicate := by
  induction values with
  | nil => simp
  | cons first rest ih =>
      by_cases same : first = removed
      · subst first
        simp [unmatched]
      · simp [same, ih]

private theorem any_addToken (tokens : List ControlToken) (output : ControlPlaceId)
    (owner : ScopeOccurrenceId) (predicate : ControlToken → Bool) :
    (addToken tokens output owner).any predicate =
      (predicate { placeId := output, owner } || tokens.any predicate) := by
  simp only [List.any_eq_not_all_not, addToken_all]
  cases selected : predicate { placeId := output, owner } <;>
    cases present : tokens.all (fun token => !predicate token) <;>
      rfl

/-- A same-owner wait withdrawal and continuation token preserve every other owner's quiescence. -/
theorem scopeQuiescent_owner_local_wait_token_exchange
    (before : RuntimeState) (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (variables : ScopedVariables) (human : Option UserTaskWait) (effect : Option EffectWait)
    (humanOwned : ∀ wait, human = some wait → wait.owner = owner)
    (effectOwned : ∀ wait, effect = some wait → wait.owner = owner) :
    let after := { before with
      waits := match human with | none => before.waits | some wait => before.waits.erase wait
      effectWaits := match effect with | none => before.effectWaits | some wait => before.effectWaits.erase wait
      variables
      tokens := addToken before.tokens output owner }
    scopeQuiescent after owner = false ∧
      ∀ sibling, owner ≠ sibling → scopeQuiescent after sibling = scopeQuiescent before sibling := by
  dsimp only
  constructor
  · simp [scopeQuiescent, any_addToken]
  · intro sibling different
    have rejected : (owner == sibling) = false := by simpa using different
    cases human with
    | none =>
        cases effect with
        | none => simp [scopeQuiescent, any_addToken, rejected]
        | some wait =>
            have owned := effectOwned wait rfl
            have effects := any_erase_unmatched before.effectWaits wait
              (fun candidate => candidate.owner == sibling) (by simp [owned, rejected])
            simp [scopeQuiescent, any_addToken, effects, rejected]
    | some wait =>
        have owned := humanOwned wait rfl
        have humans := any_erase_unmatched before.waits wait
          (fun candidate => candidate.owner == sibling) (by simp [owned, rejected])
        cases effect with
        | none => simp [scopeQuiescent, any_addToken, humans, rejected]
        | some effectWait =>
            have effectOwner := effectOwned effectWait rfl
            have effects := any_erase_unmatched before.effectWaits effectWait
              (fun candidate => candidate.owner == sibling) (by simp [effectOwner, rejected])
            simp [scopeQuiescent, any_addToken, humans, effects, rejected]

/-- Actual Human completion withdraws the uniquely addressed body wait; its continuation still blocks retirement. -/
theorem completeParallelScopeUserTask_quiescence_locality
    (program : Program) (before after : RuntimeState) (id : UserTaskInstanceId)
    (values : List VariableBinding) (wait : UserTaskWait)
    (selected : before.waits.filter (fun candidate => candidate.processInstanceId == id.processInstanceId &&
      candidate.task.id.value == id.elementId.value && candidate.activation == id.activation) = [wait])
    (completed : completeParallelScopeUserTask? program before id values = some after) :
    scopeQuiescent after wait.owner = false ∧
      ∀ sibling, wait.owner ≠ sibling → scopeQuiescent after sibling = scopeQuiescent before sibling := by
  simp only [completeParallelScopeUserTask?, selected] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact scopeQuiescent_owner_local_wait_token_exchange before wait.owner wait.output variables (some wait) none
    (by intro candidate same; cases Option.some.inj same; rfl)
    (by intro candidate same; cases same)

/-- Actual mapped Service completion changes only its exact wait's owner among quiescence observations. -/
theorem completeParallelScopeEffect_quiescence_locality
    (program : Program) (before after : RuntimeState) (id : EffectOccurrenceId)
    (result : EffectExecutionResult) (wait : EffectWait)
    (selected : before.effectWaits.filter (effectOccurrenceMatches id) = [wait])
    (completed : completeParallelScopeEffect? program before id result = some after) :
    scopeQuiescent after wait.owner = false ∧
      ∀ sibling, wait.owner ≠ sibling → scopeQuiescent after sibling = scopeQuiescent before sibling := by
  simp only [completeParallelScopeEffect?, selected] at completed
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact scopeQuiescent_owner_local_wait_token_exchange before wait.owner wait.output
    { variables with activities := variables.activities.filter fun scope => !activityScopeMatches id scope }
    none (some wait) (by intro candidate same; cases same)
    (by intro candidate same; cases Option.some.inj same; rfl)
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

/-- The private Human command dispatcher inherits locality when its exact wait belongs to a parallel body. -/
theorem parallelScopeCommand_task_quiescence_locality
    (program : Program) (before after : RuntimeState) (id : UserTaskInstanceId)
    (values : List VariableBinding) (wait : UserTaskWait)
    (selected : before.waits.filter (fun candidate => candidate.processInstanceId == id.processInstanceId &&
      candidate.task.id.value == id.elementId.value && candidate.activation == id.activation) = [wait])
    (body : hasParallelScopeDefinition program wait.owner = true)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    scopeQuiescent after wait.owner = false ∧
      ∀ sibling, wait.owner ≠ sibling → scopeQuiescent after sibling = scopeQuiescent before sibling := by
  simp only [ParallelScopeCommand.completeTask?, selected, body, ↓reduceIte] at completed
  exact completeParallelScopeUserTask_quiescence_locality program before after id values wait selected completed

/-- The private Service command dispatcher inherits locality before automatic closure and retirement. -/
theorem parallelScopeCommand_effect_quiescence_locality
    (program : Program) (before after : RuntimeState) (id : EffectOccurrenceId)
    (result : EffectExecutionResult) (wait : EffectWait)
    (selected : before.effectWaits.filter (effectOccurrenceMatches id) = [wait])
    (body : hasParallelScopeDefinition program wait.owner = true)
    (completed : ParallelScopeCommand.completeEffect? program before id result = some after) :
    scopeQuiescent after wait.owner = false ∧
      ∀ sibling, wait.owner ≠ sibling → scopeQuiescent after sibling = scopeQuiescent before sibling := by
  simp only [ParallelScopeCommand.completeEffect?, selected, body, ↓reduceIte] at completed
  exact completeParallelScopeEffect_quiescence_locality program before after id result wait selected completed

/-- An exact-owner token patch preserves every other owner's quiescence, including at shared control places. -/
theorem TokenPatch.scopeQuiescent_frame (before : RuntimeState) (patch : TokenPatch)
    (endIncrement : Nat) (sibling : ScopeOccurrenceId) (outside : patch.owner ≠ sibling) :
    scopeQuiescent { before with
      tokens := patch.apply before.tokens
      endOccurrences := before.endOccurrences + endIncrement } sibling = scopeQuiescent before sibling := by
  have rejected : (patch.owner == sibling) = false := by simpa using outside
  have population := patch.filter_untouched before.tokens (fun token => token.owner == sibling)
    (by intro place member; exact rejected) (by intro place member; exact rejected)
  have tokens := InternalCommutation.scopeCreation_any_population_frame _ _ _ population
  simp only [scopeQuiescent, tokens]

namespace InternalCommutation

private theorem added_foreign_token_count (before : RuntimeState) (owner : ScopeOccurrenceId)
    (output place : ControlPlaceId) (foreign : ScopeOccurrenceId) (outside : owner ≠ foreign) :
    ((addToken before.tokens output owner).filter fun token => token.placeId == place && token.owner == foreign).length =
      (before.tokens.filter fun token => token.placeId == place && token.owner == foreign).length := by
  simpa [outside] using addToken_filter_length before.tokens output owner
    (fun token => token.placeId == place && token.owner == foreign)

private theorem removed_foreign_token_count (before : RuntimeState) (owner : ScopeOccurrenceId)
    (input place : ControlPlaceId) (foreign : ScopeOccurrenceId) (outside : owner ≠ foreign) :
    ((removeToken before.tokens input owner).filter fun token => token.placeId == place && token.owner == foreign).length =
      (before.tokens.filter fun token => token.placeId == place && token.owner == foreign).length := by
  exact congrArg List.length (filter_removeToken_of_rejected before.tokens input owner
    (fun token => token.placeId == place && token.owner == foreign) (by simp [outside]))

private theorem patched_foreign_token_count (before : RuntimeState) (patch : TokenPatch)
    (place : ControlPlaceId) (foreign : ScopeOccurrenceId) (outside : patch.owner ≠ foreign) :
    ((patch.apply before.tokens).filter fun token => token.placeId == place && token.owner == foreign).length =
      (before.tokens.filter fun token => token.placeId == place && token.owner == foreign).length := by
  exact congrArg List.length (patch.filter_untouched before.tokens
    (fun token => token.placeId == place && token.owner == foreign)
    (by intro input member; simp [outside]) (by intro output member; simp [outside]))

/-- Actual scoped Human completion cannot enable or disable another body's exact token offer. -/
theorem completeParallelScopeUserTask_token_offer_frame
    (program : Program) (before after : RuntimeState) (id : UserTaskInstanceId)
    (values : List VariableBinding) (wait : UserTaskWait) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (selected : before.waits.filter (fun wait => wait.processInstanceId == id.processInstanceId &&
      wait.task.id.value == id.elementId.value && wait.activation == id.activation) = [wait])
    (completed : completeParallelScopeUserTask? program before id values = some after)
    (outside : wait.owner ≠ candidate.owner)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (tokenOperation : operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd]) :
    (applyInternalOperationOccurrence? program after candidate).isSome =
      (applyInternalOperationOccurrence? program before candidate).isSome := by
  simp only [completeParallelScopeUserTask?, selected] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact applyInternalOperationOccurrence_token_offer_read_frame program before _ candidate operation
    resolved tokenOperation rfl rfl
    (fun place => added_foreign_token_count before wait.owner wait.output place candidate.owner outside)

/-- A stable actual frontier's foreign token absence survives successful Human completion. -/
theorem completeParallelScopeUserTask_foreign_token_absence
    (program : Program) (before after : RuntimeState) (id : UserTaskInstanceId)
    (values : List VariableBinding) (wait : UserTaskWait) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (selected : before.waits.filter (fun wait => wait.processInstanceId == id.processInstanceId &&
      wait.task.id.value == id.elementId.value && wait.activation == id.activation) = [wait])
    (completed : completeParallelScopeUserTask? program before id values = some after)
    (outside : wait.owner ≠ candidate.owner)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (tokenOperation : operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd])
    (empty : (deriveInternalExecutionFrontier program before).offers = [])
    (successful : (deriveInternalExecutionFrontier program before).preparationFailed = false) :
    (applyInternalOperationOccurrence? program after candidate).isSome = false := by
  rw [completeParallelScopeUserTask_token_offer_frame program before after id values wait candidate operation
    selected completed outside resolved tokenOperation]
  simp only [deriveInternalExecutionFrontier_empty_occurrence_refusal program before profile candidate
    operation resolved empty successful, Option.isSome_none]

/-- Actual scoped Service completion changes data and its own continuation, leaving foreign token readiness exact. -/
theorem completeParallelScopeEffect_token_offer_frame
    (program : Program) (before after : RuntimeState) (id : EffectOccurrenceId)
    (result : EffectExecutionResult) (wait : EffectWait) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (selected : before.effectWaits.filter (effectOccurrenceMatches id) = [wait])
    (completed : completeParallelScopeEffect? program before id result = some after)
    (outside : wait.owner ≠ candidate.owner)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (tokenOperation : operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd]) :
    (applyInternalOperationOccurrence? program after candidate).isSome =
      (applyInternalOperationOccurrence? program before candidate).isSome := by
  simp only [completeParallelScopeEffect?, selected] at completed
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact applyInternalOperationOccurrence_token_offer_read_frame program before _ candidate operation
    resolved tokenOperation rfl rfl
    (fun place => added_foreign_token_count before wait.owner wait.output place candidate.owner outside)
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

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

private theorem activateUserTask_quiescence_frame (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (owner sibling : ScopeOccurrenceId) (input output : ControlPlaceId)
    (task : UserTaskDefinition) (outside : owner ≠ sibling) :
    scopeQuiescent (activateUserTask before owner.processInstanceId owner input output task) sibling =
      scopeQuiescent before sibling := by
  let patch := singletonArmingPatch program before operation owner input (.userTask
    { processInstanceId := owner.processInstanceId, owner, task, activation := activationCount before task.id + 1,
      output, metadata := task.metadata })
  exact arming_quiescent_frame before patch sibling rfl outside

private theorem activateEffect_quiescence_frame (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (owner sibling : ScopeOccurrenceId) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) (arguments : List VariableBinding)
    (outside : owner ≠ sibling) :
    scopeQuiescent (activateEffect before owner.processInstanceId owner input output effect route arguments) sibling =
      scopeQuiescent before sibling := by
  let patch := singletonArmingPatch program before operation owner input (.effect
    { processInstanceId := owner.processInstanceId, owner, elementId := effect.elementId,
      activation := effectActivationCount before effect.elementId + 1, descriptor := effect.descriptor,
      arguments, outputMappings := effect.outputMappings, output, bpmnErrorRoute := route } arguments)
  exact arming_quiescent_frame before patch sibling rfl outside

/-- A stable actual frontier's foreign token absence survives successful Service completion. -/
theorem completeParallelScopeEffect_foreign_token_absence
    (program : Program) (before after : RuntimeState) (id : EffectOccurrenceId)
    (result : EffectExecutionResult) (wait : EffectWait) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (selected : before.effectWaits.filter (effectOccurrenceMatches id) = [wait])
    (completed : completeParallelScopeEffect? program before id result = some after)
    (outside : wait.owner ≠ candidate.owner)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (tokenOperation : operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd])
    (empty : (deriveInternalExecutionFrontier program before).offers = [])
    (successful : (deriveInternalExecutionFrontier program before).preparationFailed = false) :
    (applyInternalOperationOccurrence? program after candidate).isSome = false := by
  rw [completeParallelScopeEffect_token_offer_frame program before after id result wait candidate operation
    selected completed outside resolved tokenOperation]
  simp only [deriveInternalExecutionFrontier_empty_occurrence_refusal program before profile candidate
    operation resolved empty successful, Option.isSome_none]

/-- Successful exact-owner singleton body operations preserve every distinct owner's quiescence. -/
theorem applyInternalOperationOccurrence_body_quiescence_locality
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation) (sibling : ScopeOccurrenceId)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (outside : candidate.owner ≠ sibling) :
    scopeQuiescent after sibling = scopeQuiescent before sibling := by
  obtain ⟨instanceId, running⟩ := occurrenceApplicationRunning program before after candidate applied
  cases operation <;> simp [SemanticOperation.kind] at bodyOperation
  all_goals simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    have applied := refusingGuardSuccess _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner with
    | false =>
        simp only [parallel, pure, Option.bind_some] at applied
        cases Option.some.inj applied
        exact activateUserTask_quiescence_frame program before (.awaitUserTask id origin input output task)
          candidate.owner sibling input output task outside
    | true =>
        simp only [parallel, ↓reduceIte, pure, Option.bind_some] at applied
        obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
        cases Option.some.inj applied
        exact activateUserTask_quiescence_frame program before (.awaitUserTask id origin input output task)
          candidate.owner sibling input output task outside
  case awaitEffect id origin input output effect route =>
    have applied := refusingGuardSuccess _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact activateEffect_quiescence_frame program before (.awaitEffect id origin input output effect route)
        candidate.owner sibling input output effect route arguments outside
  case duplicate id origin input outputs =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact TokenPatch.scopeQuiescent_frame before
      { owner := candidate.owner, consumed := [input], produced := outputs } 0 sibling outside
  case synchronize id origin inputs output =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact TokenPatch.scopeQuiescent_frame before
      { owner := candidate.owner, consumed := inputs, produced := [output] } 0 sibling outside
  case reachNoneEnd id origin input =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact TokenPatch.scopeQuiescent_frame before
      { owner := candidate.owner, consumed := [input], produced := [] } 1 sibling outside

/-- Actual body execution preserves the control, scope census and every token bucket read by a different owner. This supplies the read boundary used by sibling-stability induction. -/
theorem applyInternalOperationOccurrence_body_foreign_token_reads
    (program : Program) (before after : RuntimeState) (actor : InternalOperationOccurrence)
    (operation : SemanticOperation) (foreign : ScopeOccurrenceId)
    (resolved : resolveInternalOperationOccurrence? program before actor = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before actor = some after)
    (outside : actor.owner ≠ foreign) :
    after.control = before.control ∧ after.scopeOccurrences = before.scopeOccurrences ∧
      ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == foreign).length =
        (before.tokens.filter fun token => token.placeId == place && token.owner == foreign).length := by
  obtain ⟨instanceId, running⟩ := occurrenceApplicationRunning program before after actor applied
  cases operation <;> simp [SemanticOperation.kind] at bodyOperation
  all_goals simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    have applied := refusingGuardSuccess _ _ after applied
    cases parallel : hasParallelScopeDefinition program actor.owner <;>
      simp only [parallel, ↓reduceIte, pure, Option.bind_some] at applied
    all_goals first
      | (obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
         cases Option.some.inj applied
         exact ⟨rfl, rfl, fun place => removed_foreign_token_count before actor.owner input place foreign outside⟩)
      | (cases Option.some.inj applied
         exact ⟨rfl, rfl, fun place => removed_foreign_token_count before actor.owner input place foreign outside⟩)
  case awaitEffect id origin input output effect route =>
    have applied := refusingGuardSuccess _ _ after applied
    cases parallel : hasParallelScopeDefinition program actor.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact ⟨rfl, rfl, fun place => removed_foreign_token_count before actor.owner input place foreign outside⟩
  case duplicate id origin input outputs =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact ⟨rfl, rfl, fun place => patched_foreign_token_count before
      { owner := actor.owner, consumed := [input], produced := outputs } place foreign outside⟩
  case synchronize id origin inputs output =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact ⟨rfl, rfl, fun place => patched_foreign_token_count before
      { owner := actor.owner, consumed := inputs, produced := [output] } place foreign outside⟩
  case reachNoneEnd id origin input =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact ⟨rfl, rfl, fun place => patched_foreign_token_count before
      { owner := actor.owner, consumed := [input], produced := [] } place foreign outside⟩

/-- Actual singleton body steps preserve foreign token-offer enabledness even when End headroom changes. -/
theorem applyInternalOperationOccurrence_body_token_offer_frame
    (program : Program) (before after : RuntimeState) (actor candidate : InternalOperationOccurrence)
    (operation token : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before actor = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before actor = some after)
    (outside : actor.owner ≠ candidate.owner)
    (tokenResolved : resolveInternalOperationOccurrence? program before candidate = some token)
    (tokenOperation : token.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd]) :
    (applyInternalOperationOccurrence? program after candidate).isSome =
      (applyInternalOperationOccurrence? program before candidate).isSome := by
  obtain ⟨control, scopes, counts⟩ := applyInternalOperationOccurrence_body_foreign_token_reads program before after actor operation
    candidate.owner resolved bodyOperation applied outside
  exact applyInternalOperationOccurrence_token_offer_read_frame program before after candidate token
    tokenResolved tokenOperation control scopes counts

/-- Successful reserved preparation assigns the inserted wait to the patch's exact candidate owner. -/
theorem prepareReservedOccurrenceArm_write_owner (program : Program) (before : RuntimeState)
    (candidate : InternalOperationOccurrence) (activation : Nat) (patch : InternalArmingPatch)
    (prepared : prepareReservedOccurrenceArm? program before candidate activation = some patch) :
    patch.write.owner = patch.owner := by
  cases control : before.control <;>
    simp only [prepareReservedOccurrenceArm?, control, bind] at prepared <;>
    try contradiction
  case running runtimeId =>
    have prepared := refusingGuardSuccess _ _ patch prepared
    simp only [pure, Option.bind_some] at prepared
    obtain ⟨operation, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    obtain ⟨input, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    obtain ⟨origin, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    have prepared := refusingGuardSuccess _ _ patch prepared
    obtain ⟨inputOrigin, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at prepared
    all_goals first
      | (have _ : hasParallelScopeDefinition program candidate.owner = true := parallel
         have prepared := refusingGuardSuccess _ _ patch prepared
         obtain ⟨_, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared)
      | skip
    all_goals cases operation <;> simp only [Option.bind_none] at prepared <;>
      try contradiction
    all_goals
      first
      | (have prepared := refusingGuardSuccess _ _ patch prepared
         cases Option.some.inj prepared
         rfl)
      | (obtain ⟨arguments, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
         have prepared := refusingGuardSuccess _ _ patch prepared
         cases Option.some.inj prepared
         rfl)

/-- An aligned arming patch inserts an owner wait, so withdrawing its input never enables that owner's retirement. -/
theorem arming_owner_nonquiescent (before : RuntimeState) (patch : InternalArmingPatch)
    (assigned : patch.write.owner = patch.owner) :
    scopeQuiescent (applyInternalArmingPatch before patch) patch.owner = false := by
  cases write : patch.write <;>
    simp only [write, InternalArmingWrite.owner] at assigned
  all_goals simp only [scopeQuiescent, applyInternalArmingPatch, write]
  all_goals simp [List.not_any_eq_all_not, all_insertUserTaskWait, insertMessageWait, insertTimerWait,
    insertEffectWait, all_canonicalInsertBy, assigned]

/-- Arming preserves every existing nonquiescence blocker: its own input becomes a wait and siblings are framed. -/
theorem arming_preserves_nonquiescence (before : RuntimeState) (patch : InternalArmingPatch)
    (owner : ScopeOccurrenceId) (assigned : patch.write.owner = patch.owner)
    (blocked : scopeQuiescent before owner = false) :
    scopeQuiescent (applyInternalArmingPatch before patch) owner = false := by
  by_cases same : patch.owner = owner
  · simpa only [same] using arming_owner_nonquiescent before patch assigned
  · exact (arming_quiescent_frame before patch owner assigned same).trans blocked

/-- At every actual reserved-batch prefix, new retirement readiness requires a token patch at that owner. -/
theorem applyInternalOccurrenceBatch_quiescence_requires_owned_token
    (program : Program) (before : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) (owner : ScopeOccurrenceId)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (blocked : scopeQuiescent before owner = false) :
    ∀ after ∈ successors, scopeQuiescent after owner = true →
      ∃ patch, .token patch ∈ batch.members ∧ patch.tokens.owner = owner := by
  let ownedToken := ∃ patch, InternalOccurrencePatch.token patch ∈ batch.members ∧ patch.tokens.owner = owner
  have prefixes := applyInternalOccurrenceBatch_prefix_induction program before batch successors
    (fun state => scopeQuiescent state owner = false ∨ ownedToken) (Or.inl blocked) ?_ applied
  · intro after member ready
    rcases prefixes after member with stillBlocked | touched
    · rw [stillBlocked] at ready
      contradiction
    · exact touched
  · intro state patch member prepared invariant
    rcases invariant with blocked | touched
    · cases patch with
      | arm arm =>
          exact Or.inl (arming_preserves_nonquiescence state arm owner
            (prepareReservedOccurrenceArm_write_owner program state ⟨arm.operation.id, arm.owner⟩
              arm.write.occurrence.activation arm prepared) blocked)
      | token token =>
          by_cases same : token.tokens.owner = owner
          · exact Or.inr ⟨token, member, same⟩
          · exact Or.inl ((TokenPatch.scopeQuiescent_frame state token.tokens token.endIncrement owner same).trans blocked)
    · exact Or.inr touched

/-- Foreign token work and any aligned arming retain a body's nonquiescence at every successful batch prefix. -/
theorem applyInternalOccurrenceBatch_preserves_nonquiescence
    (program : Program) (before : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) (owner : ScopeOccurrenceId)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (blocked : scopeQuiescent before owner = false)
    (foreignTokens : ∀ patch, InternalOccurrencePatch.token patch ∈ batch.members → patch.tokens.owner ≠ owner) :
    ∀ after ∈ successors, scopeQuiescent after owner = false := by
  intro after member
  apply Bool.eq_false_iff.mpr
  intro ready
  obtain ⟨patch, present, same⟩ := applyInternalOccurrenceBatch_quiescence_requires_owned_token
    program before batch successors owner applied blocked after member ready
  exact foreignTokens patch present same

/-- Successful empty discovery cannot conceal an enabled Human/Service input behind a failed data or capacity guard: PMIS-SELECT-01 reports such a failure instead of a stable frontier. -/
theorem stable_frontier_wait_input_absent (program : Program) (state : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (waitKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect])
    (empty : (deriveInternalExecutionFrontier program state).offers = [])
    (successful : (deriveInternalExecutionFrontier program state).preparationFailed = false) :
    ∀ input ∈ bodyConsumedPorts operation,
      (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 0 := by
  have declaration := resolveInternalOperationOccurrence_declaration program state candidate operation resolved
  have reflected := deriveInternalExecutionFrontier_empty_reflects program state (by simp [running])
    empty successful operation declaration.1
  have ordinary : (ordinaryExecutionFrontier program state operation).preparationFailed = false := by
    cases operation <;> simp [SemanticOperation.kind] at waitKind
    all_goals simpa only [running] using reflected.2
  have discovery : ∃ offers, internalOperationOccurrenceOffers? program state operation = some offers := by
    simp only [ordinaryExecutionFrontier, profile, beq_self_eq_true, ↓reduceIte] at ordinary
    cases discovered : internalOperationOccurrenceOffers? program state operation with
    | none => simp [discovered] at ordinary
    | some offers => exact ⟨offers, rfl⟩
  obtain ⟨offers, discovered⟩ := discovery
  have refused := deriveInternalExecutionFrontier_empty_occurrence_refusal program state profile candidate operation
    resolved empty successful
  obtain ⟨candidates, candidatesEq, member⟩ :=
    resolveInternalOperationOccurrence_requires_exact_candidate program state candidate operation resolved
  cases operation <;> simp [SemanticOperation.kind] at waitKind
  all_goals
    simp only [internalOperationOccurrenceOffers?] at discovered
    obtain ⟨owners, ownersEq, discovered⟩ := Option.bind_eq_some_iff.mp discovered
    rw [declaration.2, candidatesEq] at ownersEq
    cases Option.some.inj ownersEq
    obtain ⟨pieces, mapped, _⟩ := Option.bind_eq_some_iff.mp discovered
    obtain ⟨piece, _, pieceEq⟩ := ParallelScopeStart.mapped_member _ _ _ mapped candidate member
    simp only [refused] at pieceEq
    split at pieceEq <;> try contradiction
    rename_i absent
    intro input inputMember
    simp only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton] at inputMember
    have noTokens : state.tokens.filter (fun token => token.placeId == input && token.owner == candidate.owner) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro token present matching
      exact absent (List.any_eq_true.mpr ⟨token, present, by simpa only [← inputMember] using matching⟩)
    rw [noTokens]
    rfl

/-- An owner with a stable predecessor cannot acquire an ordinary body offer when its exact operation resolution, control and token buckets are unchanged. Process data and global counters may change; stable discovery already excludes every blocked arming input. -/
theorem stable_frontier_body_refusal_of_resolved_token_frame
    (program : Program) (before after : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (empty : (deriveInternalExecutionFrontier program before).offers = [])
    (successful : (deriveInternalExecutionFrontier program before).preparationFailed = false)
    (control : after.control = before.control)
    (selected : resolveInternalOperationOccurrence? program after candidate = some operation)
    (counts : ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length =
      (before.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length) :
    applyInternalOperationOccurrence? program after candidate = none := by
  have refused := deriveInternalExecutionFrontier_empty_occurrence_refusal program before profile candidate operation
    resolved empty successful
  by_cases tokenKind : operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd]
  · have framed : (applyInternalOperationOccurrence? program after candidate).isSome =
        (applyInternalOperationOccurrence? program before candidate).isSome := by
      cases running : before.control <;>
        simp only [applyInternalOperationOccurrence?, control, running] <;> try rfl
      cases operation <;> simp [SemanticOperation.kind] at tokenKind
      all_goals simp [selected, resolved, counts]
      all_goals split <;> simp_all
    simp only [refused, Option.isSome_none] at framed
    cases applied : applyInternalOperationOccurrence? program after candidate <;> simp_all
  · cases applied : applyInternalOperationOccurrence? program after candidate with
    | none => rfl
    | some successor =>
      obtain ⟨instanceId, running⟩ := occurrenceApplicationRunning program after successor candidate applied
      have beforeRunning : before.control = .running instanceId := control.symm.trans running
      have waitKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect] := by
        simp only [List.mem_cons, List.not_mem_nil, or_false] at bodyKind tokenKind ⊢
        rcases bodyKind with h | h | h | h | h
        · exact Or.inl h
        · exact Or.inr h
        all_goals simp [h] at tokenKind
      have absent := stable_frontier_wait_input_absent program before profile instanceId beforeRunning
        candidate operation resolved waitKind empty successful
      cases operation <;> simp [SemanticOperation.kind] at waitKind
      all_goals
        have zero := absent _ (by simp only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton]; rfl)
        rw [← counts] at zero
        simp [applyInternalOperationOccurrence?, running, selected, zero] at applied

/-- An owner with a stable predecessor cannot acquire an ordinary body offer when its scope population, control and token buckets are unchanged. Process data and global counters may change; stable discovery already excludes every blocked arming input. -/
theorem stable_frontier_body_refusal_of_token_frame
    (program : Program) (before after : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (empty : (deriveInternalExecutionFrontier program before).offers = [])
    (successful : (deriveInternalExecutionFrontier program before).preparationFailed = false)
    (control : after.control = before.control) (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (counts : ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length =
      (before.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length) :
    applyInternalOperationOccurrence? program after candidate = none := by
  apply stable_frontier_body_refusal_of_resolved_token_frame program before after profile candidate operation
    resolved bodyKind empty successful control ?_ counts
  simpa only [resolveInternalOperationOccurrence?, internalOperationOccurrences?, scopes] using resolved

/-- Human ingress from a stable boundary cannot enable any foreign body operation, including wait arming affected by shared Process values. -/
theorem completeParallelScopeUserTask_foreign_body_refusal
    (program : Program) (before after : RuntimeState) (id : UserTaskInstanceId)
    (values : List VariableBinding) (wait : UserTaskWait) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (selected : before.waits.filter (fun wait => wait.processInstanceId == id.processInstanceId &&
      wait.task.id.value == id.elementId.value && wait.activation == id.activation) = [wait])
    (completed : completeParallelScopeUserTask? program before id values = some after)
    (outside : wait.owner ≠ candidate.owner)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (empty : (deriveInternalExecutionFrontier program before).offers = [])
    (successful : (deriveInternalExecutionFrontier program before).preparationFailed = false) :
    applyInternalOperationOccurrence? program after candidate = none := by
  simp only [completeParallelScopeUserTask?, selected] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact stable_frontier_body_refusal_of_token_frame program before _ profile candidate operation resolved bodyKind
    empty successful rfl rfl
    (fun place => added_foreign_token_count before wait.owner wait.output place candidate.owner outside)

/-- Successful Service ingress has the same foreign-body exclusion even when its output mapping changes shared Process data. -/
theorem completeParallelScopeEffect_foreign_body_refusal
    (program : Program) (before after : RuntimeState) (id : EffectOccurrenceId)
    (result : EffectExecutionResult) (wait : EffectWait) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (selected : before.effectWaits.filter (effectOccurrenceMatches id) = [wait])
    (completed : completeParallelScopeEffect? program before id result = some after)
    (outside : wait.owner ≠ candidate.owner)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (empty : (deriveInternalExecutionFrontier program before).offers = [])
    (successful : (deriveInternalExecutionFrontier program before).preparationFailed = false) :
    applyInternalOperationOccurrence? program after candidate = none := by
  simp only [completeParallelScopeEffect?, selected] at completed
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact stable_frontier_body_refusal_of_token_frame program before _ profile candidate operation resolved bodyKind
    empty successful rfl rfl
    (fun place => added_foreign_token_count before wait.owner wait.output place candidate.owner outside)
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

/-- Every actual reserved prefix preserves a foreign owner's complete body read boundary, even when shared issuance and End counters change. -/
theorem applyInternalOccurrenceBatch_foreign_token_reads
    (program : Program) (before : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) (owner : ScopeOccurrenceId)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (outside : ∀ patch ∈ batch.members, patch.owner ≠ owner) :
    ∀ after ∈ successors, after.control = before.control ∧ after.scopeOccurrences = before.scopeOccurrences ∧
      ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == owner).length =
        (before.tokens.filter fun token => token.placeId == place && token.owner == owner).length := by
  refine applyInternalOccurrenceBatch_prefix_induction program before batch successors
    (fun after => after.control = before.control ∧ after.scopeOccurrences = before.scopeOccurrences ∧
      ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == owner).length =
        (before.tokens.filter fun token => token.placeId == place && token.owner == owner).length)
    ⟨rfl, rfl, fun _ => rfl⟩ ?_ applied
  intro state patch member prepared framed
  have frame := patch.retirement_frame state
  refine ⟨frame.1.trans framed.1, frame.2.1.trans framed.2.1, ?_⟩
  intro place
  have different := outside patch member
  cases patch with
  | arm arm =>
    have count := (removed_foreign_token_count state arm.owner arm.input place owner different).trans (framed.2.2 place)
    cases write : arm.write <;> simpa only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write] using count
  | token token =>
    exact (patched_foreign_token_count state token.tokens place owner different).trans (framed.2.2 place)

/-- An entire successful reserved batch confined to other owners preserves sibling body refusal relative to the original stable command boundary. -/
theorem applyInternalOccurrenceBatch_preserves_stable_foreign_body
    (program : Program) (stable before : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program stable candidate = some operation)
    (bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (control : before.control = stable.control) (scopes : before.scopeOccurrences = stable.scopeOccurrences)
    (counts : ∀ place, (before.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length =
      (stable.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (outside : ∀ patch ∈ batch.members, patch.owner ≠ candidate.owner) :
    ∀ after ∈ successors, applyInternalOperationOccurrence? program after candidate = none := by
  intro after member
  obtain ⟨nextControl, nextScopes, nextCounts⟩ := applyInternalOccurrenceBatch_foreign_token_reads
    program before batch successors candidate.owner applied outside after member
  exact stable_frontier_body_refusal_of_token_frame program stable after profile candidate operation resolved bodyKind
    empty successful (nextControl.trans control) (nextScopes.trans scopes) (fun place => (nextCounts place).trans (counts place))

end InternalCommutation


private theorem quiescence_locality_preserves (before after : RuntimeState) (actor owner : ScopeOccurrenceId)
    (locality : scopeQuiescent after actor = false ∧
      ∀ sibling, actor ≠ sibling → scopeQuiescent after sibling = scopeQuiescent before sibling)
    (blocked : scopeQuiescent before owner = false) : scopeQuiescent after owner = false := by
  by_cases same : actor = owner
  · simpa only [same] using locality.1
  · exact (locality.2 owner same).trans blocked

/-- Both Human dispatch routes exchange a wait for an owned token, preserving every existing retirement blocker. -/
theorem parallelScopeCommand_task_preserves_nonquiescence (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding) (owner : ScopeOccurrenceId)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after)
    (blocked : scopeQuiescent before owner = false) : scopeQuiescent after owner = false := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  rename_i wait selected
  split at completed
  · exact quiescence_locality_preserves before after wait.owner owner
      (completeParallelScopeUserTask_quiescence_locality program before after id values wait selected completed) blocked
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    rename_i actual found
    cases Option.some.inj applied
    cases Option.some.inj completed
    have locality := scopeQuiescent_owner_local_wait_token_exchange before actual.owner actual.output before.variables
      (some actual) none (by intro candidate same; cases Option.some.inj same; rfl) (by intro candidate same; cases same)
    simpa only [scopeQuiescent] using quiescence_locality_preserves before _ actual.owner owner locality blocked

/-- Both Service dispatch routes retain retirement blockers through result projection and Activity-local disposal. -/
theorem parallelScopeCommand_effect_preserves_nonquiescence (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult) (owner : ScopeOccurrenceId)
    (completed : ParallelScopeCommand.completeEffect? program before id result = some after)
    (blocked : scopeQuiescent before owner = false) : scopeQuiescent after owner = false := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i wait selected
  split at completed
  · exact quiescence_locality_preserves before after wait.owner owner
      (completeParallelScopeEffect_quiescence_locality program before after id result wait selected completed) blocked
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact quiescence_locality_preserves before _ wait.owner owner
      (scopeQuiescent_owner_local_wait_token_exchange before wait.owner wait.output variables none (some wait)
        (by intro candidate same; cases same) (by intro candidate same; cases Option.some.inj same; rfl)) blocked

/-- Real PMIS admission preserves nonquiescence for either completion kind, including rejection and unchanged-state outcomes. -/
theorem parallelScope_admission_preserves_nonquiescence (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : ParallelScopeReplay.waitCompletionStimulus stimulus) (owner : ScopeOccurrenceId)
    (blocked : scopeQuiescent before owner = false) :
    scopeQuiescent (admitStimulus program before stimulus).state owner = false := by
  cases stimulus <;> simp only [ParallelScopeReplay.waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    have retained := parallelScopeCommand_task_preserves_nonquiescence program before
    cases completed : ParallelScopeCommand.completeTask? program before id values with
    | none =>
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control, completed]
      all_goals repeat' split
      all_goals exact blocked
    | some after =>
      have next := retained after id values owner completed blocked
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control, completed]
      all_goals repeat' split
      all_goals first | exact blocked | exact next
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    rename_i values
    cases completed : ParallelScopeCommand.completeEffect? program before id (.success values) with
    | none =>
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control, completed]
      all_goals repeat' split
      all_goals exact blocked
    | some after =>
      have next := parallelScopeCommand_effect_preserves_nonquiescence program before after id
        (.success values) owner completed blocked
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control, completed]
      all_goals repeat' split
      all_goals first | exact blocked | exact next

/-- Nonquiescence blocks retirement before any condition read or population change, regardless of binding availability. -/
theorem completeParallelScope_refuses_nonquiescent (entry : ParallelScopeEntry) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (blocked : scopeQuiescent state owner = false) :
    completeParallelScope? entry state owner = none := by
  unfold completeParallelScope?
  cases bound : parallelScopeBinding? entry state owner <;> simp [blocked]

end BpmnSemantics.SemanticProcess
