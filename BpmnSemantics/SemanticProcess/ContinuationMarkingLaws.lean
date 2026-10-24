module

public import BpmnSemantics.SemanticProcess.ContinuationMarking
public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
public import BpmnSemantics.SemanticProcess.TokenStorage

/-! Exact owned port exchanges preserve continuation credit across Human, Service and internal body execution. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

private theorem erased_filter_count {α : Type} [DecidableEq α]
    (values : List α) (removed : α) (predicate : α → Bool) (present : removed ∈ values) :
    ((values.erase removed).filter predicate).length + (if predicate removed then 1 else 0) =
      (values.filter predicate).length := by
  have population := ((List.perm_cons_erase present).filter predicate).length_eq
  cases selected : predicate removed <;> simpa [selected, Nat.add_comm] using population.symm

/-- PMIS-DATA-01 preserves marking when a live Human wait becomes its owned output token. -/
theorem human_continuation_exchange (before : RuntimeState) (wait : UserTaskWait)
    (variables : ScopedVariables) (present : wait ∈ before.waits)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking { before with
      waits := before.waits.erase wait
      variables
      tokens := addToken before.tokens wait.output wait.owner } owner place =
      continuationMarking before owner place := by
  have tokens := length_filter_canonicalInsertBy controlTokenBefore
    (fun token : ControlToken => token.owner == owner && token.placeId == place)
    { placeId := wait.output, owner := wait.owner } before.tokens
  have waits := erased_filter_count before.waits wait
    (fun wait => wait.owner == owner && wait.output == place) present
  simp only [continuationMarking]
  dsimp only at tokens waits ⊢
  unfold addToken
  rw [tokens]
  omega

/-- PMIS-DATA-01 preserves marking when a live Service wait becomes its owned output token. -/
theorem effect_continuation_exchange (before : RuntimeState) (wait : EffectWait)
    (variables : ScopedVariables) (present : wait ∈ before.effectWaits)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking { before with
      effectWaits := before.effectWaits.erase wait
      variables
      tokens := addToken before.tokens wait.output wait.owner } owner place =
      continuationMarking before owner place := by
  have tokens := length_filter_canonicalInsertBy controlTokenBefore
    (fun token : ControlToken => token.owner == owner && token.placeId == place)
    { placeId := wait.output, owner := wait.owner } before.tokens
  have waits := erased_filter_count before.effectWaits wait
    (fun wait => wait.owner == owner && wait.output == place) present
  simp only [continuationMarking]
  dsimp only at tokens waits ⊢
  unfold addToken
  rw [tokens]
  omega

/-- Exact ownership makes every declared port contribution zero at another scope occurrence. -/
theorem ownedPortCount_foreign (ports : List ControlPlaceId) (owner queried : ScopeOccurrenceId)
    (place : ControlPlaceId) (different : owner ≠ queried) :
    ownedPortCount ports owner queried place = 0 := by
  simp [ownedPortCount, different]

namespace ContinuationMarkingLaws

def tokenCount (tokens : List ControlToken) (owner : ScopeOccurrenceId)
    (place : ControlPlaceId) : Nat :=
  (tokens.filter (fun token => token.owner == owner && token.placeId == place)).length

theorem sum_map_add {α : Type} (values : List α) (left right : α → Nat) :
    (values.map (fun value => left value + right value)).sum =
      (values.map left).sum + (values.map right).sum := by
  induction values with
  | nil => simp
  | cons first rest ih => simp only [List.map_cons, List.sum_cons, ih]; omega

private theorem sum_map_zero {α : Type} (values : List α) :
    (values.map (fun _ => (0 : Nat))).sum = 0 := by
  induction values with
  | nil => rfl
  | cons _ _ ih => simpa only [List.map_cons, List.sum_cons, Nat.zero_add] using ih

private theorem sum_port_indicator (ports : List ControlPlaceId) (target : ControlPlaceId)
    (unique : ports.Nodup) (present : target ∈ ports) :
    (ports.map (fun port => if target = port then 1 else 0)).sum = 1 := by
  induction ports with
  | nil => contradiction
  | cons first rest ih =>
      obtain ⟨absent, distinct⟩ := List.nodup_cons.mp unique
      by_cases same : target = first
      · subst target
        have zero : rest.map (fun port => if first = port then 1 else 0) = rest.map (fun _ => 0) := by
          apply List.map_congr_left
          intro port member
          have different : first ≠ port := by intro equal; exact absent (equal ▸ member)
          simp [different]
        simp [zero, sum_map_zero]
      · have member : target ∈ rest := (List.mem_cons.mp present).resolve_left same
        simpa [same] using ih distinct member

private theorem sum_filter_ports {α : Type} (ports : List ControlPlaceId) (values : List α)
    (key : α → ControlPlaceId) (selected : α → Bool) (unique : ports.Nodup)
    (supported : ∀ value ∈ values, selected value = true → key value ∈ ports) :
    (ports.map (fun port => (values.filter fun value => selected value && key value == port).length)).sum =
      (values.filter selected).length := by
  induction values with
  | nil => simp [sum_map_zero]
  | cons first rest ih =>
      have tail := ih (fun value member chosen => supported value (by simp [member]) chosen)
      have step : ∀ port, ((first :: rest).filter fun value => selected value && key value == port).length =
          (rest.filter fun value => selected value && key value == port).length +
            (if selected first && key first == port then 1 else 0) := by
        intro port
        cases chosen : selected first && key first == port <;> simp [chosen, Nat.add_comm]
      have mapped : ports.map (fun port =>
          ((first :: rest).filter fun value => selected value && key value == port).length) =
          ports.map (fun port => (rest.filter fun value => selected value && key value == port).length +
            (if selected first && key first == port then 1 else 0)) := by
        apply List.map_congr_left
        intro port _
        exact step port
      rw [mapped, sum_map_add, tail]
      cases chosen : selected first with
      | false => simp [chosen, sum_map_zero]
      | true =>
          have once := sum_port_indicator ports (key first) unique (supported first (by simp) chosen)
          simpa [chosen, beq_iff_eq, Nat.add_comm] using congrArg ((rest.filter selected).length + ·) once

/-- Summing supported owned ports counts each retained occurrence once, without discarding multiplicity. -/
theorem ownedPortCount_sum (ports outputs : List ControlPlaceId) (owner : ScopeOccurrenceId)
    (unique : ports.Nodup) (supported : ∀ port ∈ outputs, port ∈ ports) :
    (ports.map (fun place => ownedPortCount outputs owner owner place)).sum = outputs.length := by
  have all : outputs.filter (fun _ => true) = outputs := List.filter_eq_self.mpr (fun _ _ => rfl)
  simpa [ownedPortCount, all] using sum_filter_ports ports outputs id (fun _ => true) unique
    (fun port member _ => supported port member)

/-- Exact declared-port support makes total continuation credit the raw-token plus blocked-wait population of this owner. -/
theorem continuationMarking_sum (ports : List ControlPlaceId) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (unique : ports.Nodup)
    (tokens : ∀ token ∈ state.tokens, token.owner = owner → token.placeId ∈ ports)
    (users : ∀ wait ∈ state.waits, wait.owner = owner → wait.output ∈ ports)
    (effects : ∀ wait ∈ state.effectWaits, wait.owner = owner → wait.output ∈ ports) :
    (ports.map (continuationMarking state owner)).sum =
      (state.tokens.filter (fun token => token.owner == owner)).length +
      (state.waits.filter (fun wait => wait.owner == owner)).length +
      (state.effectWaits.filter (fun wait => wait.owner == owner)).length := by
  have tokenCounts := sum_filter_ports ports state.tokens (·.placeId) (fun token => token.owner == owner) unique
    (fun token member same => tokens token member (by simpa using same))
  have userCounts := sum_filter_ports ports state.waits (·.output) (fun wait => wait.owner == owner) unique
    (fun wait member same => users wait member (by simpa using same))
  have effectCounts := sum_filter_ports ports state.effectWaits (·.output) (fun wait => wait.owner == owner) unique
    (fun wait member same => effects wait member (by simpa using same))
  change (ports.map (fun place =>
    (state.tokens.filter (fun token => token.owner == owner && token.placeId == place)).length +
    (state.waits.filter (fun wait => wait.owner == owner && wait.output == place)).length +
    (state.effectWaits.filter (fun wait => wait.owner == owner && wait.output == place)).length)).sum = _
  rw [sum_map_add, sum_map_add, tokenCounts, userCounts, effectCounts]

theorem remove_balance (tokens : List ControlToken) (input : ControlPlaceId)
    (owner queried : ScopeOccurrenceId) (place : ControlPlaceId)
    (present : ({ placeId := input, owner } : ControlToken) ∈ tokens) :
    tokenCount (removeToken tokens input owner) queried place +
      ownedPortCount [input] owner queried place = tokenCount tokens queried place := by
  have count := ((List.perm_cons_erase present).filter
    (fun token => token.owner == queried && token.placeId == place)).length_eq
  unfold tokenCount ownedPortCount
  rw [removeToken_eq_erase]
  cases selectedInput : (owner == queried && input == place) <;>
    simpa [selectedInput, Nat.add_comm] using count.symm

theorem remove_many_balance (tokens : List ControlToken) (inputs : List ControlPlaceId)
    (owner queried : ScopeOccurrenceId) (place : ControlPlaceId) (unique : inputs.Nodup)
    (present : ∀ input ∈ inputs, ({ placeId := input, owner } : ControlToken) ∈ tokens) :
    tokenCount (removeTokens tokens inputs owner) queried place +
      ownedPortCount inputs owner queried place = tokenCount tokens queried place := by
  induction inputs generalizing tokens with
  | nil => simp [removeTokens, ownedPortCount]
  | cons input rest ih =>
      have first := remove_balance tokens input owner queried place (present input (by simp))
      have tail := ih (removeToken tokens input owner) (List.nodup_cons.mp unique).2
        (fun next member => by
          rw [removeToken_eq_erase, List.mem_erase_of_ne]
          · exact present next (by simp [member])
          · intro same
            apply (List.nodup_cons.mp unique).1
            have equal : next = input := congrArg ControlToken.placeId same
            exact equal ▸ member)
      change tokenCount (removeTokens (removeToken tokens input owner) rest owner) queried place + _ = _
      have ports : ownedPortCount (input :: rest) owner queried place =
          ownedPortCount [input] owner queried place + ownedPortCount rest owner queried place := by
        unfold ownedPortCount
        simp only [List.filter_cons]
        split <;> simp [Nat.add_comm]
      rw [ports]
      omega

theorem add_many_count (tokens : List ControlToken) (outputs : List ControlPlaceId)
    (owner queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    tokenCount (addTokens tokens outputs owner) queried place =
      tokenCount tokens queried place + ownedPortCount outputs owner queried place := by
  have count := ((addTokens_perm tokens outputs owner).filter
    (fun token => token.owner == queried && token.placeId == place)).length_eq
  simpa [tokenCount, ownedPortCount, List.filter_append, List.filter_map,
    Function.comp_def, Nat.add_comm] using count

theorem token_present (tokens : List ControlToken) (owner : ScopeOccurrenceId)
    (place : ControlPlaceId)
    (unit : (tokens.filter fun token => token.placeId == place && token.owner == owner).length = 1) :
    ({ placeId := place, owner } : ControlToken) ∈ tokens := by
  have positive : 0 < (tokens.filter fun token => token.placeId == place && token.owner == owner).length := by omega
  obtain ⟨token, member⟩ := List.exists_mem_of_length_pos positive
  obtain ⟨tokenMember, selected⟩ := List.mem_filter.mp member
  simp only [Bool.and_eq_true, beq_iff_eq] at selected
  cases token
  cases selected.1
  cases selected.2
  exact tokenMember

theorem onlyTokenOwner_present (state : RuntimeState) (input : ControlPlaceId)
    (owner : ScopeOccurrenceId) (selected : onlyTokenOwner? state input = some owner) :
    ({ placeId := input, owner } : ControlToken) ∈ state.tokens := by
  unfold onlyTokenOwner? at selected
  cases owners : tokenOwners state input with
  | nil => simp [owners] at selected
  | cons first rest =>
      simp only [owners] at selected
      split at selected <;> try contradiction
      cases Option.some.inj selected
      have member : owner ∈ tokenOwners state input := by simp [owners]
      obtain ⟨token, selectedToken, equal⟩ := List.mem_map.mp member
      obtain ⟨present, place⟩ := List.mem_filter.mp selectedToken
      simp only [decide_eq_true_eq] at place
      cases token
      cases equal
      cases place
      exact present

theorem commonTokenOwner_present (state : RuntimeState) (inputs : List ControlPlaceId)
    (owner : ScopeOccurrenceId) (selected : commonTokenOwner? state inputs = some owner) :
    ∀ input ∈ inputs, ({ placeId := input, owner } : ControlToken) ∈ state.tokens := by
  cases inputs with
  | nil => simp [commonTokenOwner?] at selected
  | cons first rest =>
      simp only [commonTokenOwner?, bind, Option.bind_eq_some_iff] at selected
      obtain ⟨actual, firstSelected, selected⟩ := selected
      split at selected <;> try contradiction
      rename_i allSelected
      cases Option.some.inj selected
      intro input present
      rcases List.mem_cons.mp present with rfl | member
      · exact onlyTokenOwner_present state _ _ firstSelected
      · exact onlyTokenOwner_present state input _
          (by simpa using List.all_eq_true.mp allSelected input member)

theorem user_arm_balance (before : RuntimeState) (instanceId : SemanticId)
    (owner queried : ScopeOccurrenceId) (input output place : ControlPlaceId) (task : UserTaskDefinition)
    (present : ({ placeId := input, owner } : ControlToken) ∈ before.tokens) :
    continuationMarking (activateUserTask before instanceId owner input output task) queried place +
      ownedPortCount [input] owner queried place =
      continuationMarking before queried place + ownedPortCount [output] owner queried place := by
  have removed := remove_balance before.tokens input owner queried place present
  have inserted := length_filter_insertUserTaskWait
    (fun wait => wait.owner == queried && wait.output == place)
    { processInstanceId := instanceId, owner, task, activation := activationCount before task.id + 1,
      output, metadata := task.metadata } before.waits
  simp only [continuationMarking, activateUserTask]
  dsimp only at inserted ⊢
  unfold ownedPortCount tokenCount at *
  cases selected : (owner == queried && output == place) <;>
    simp [selected] at inserted ⊢ <;> omega

theorem effect_arm_balance (before : RuntimeState) (instanceId : SemanticId)
    (owner queried : ScopeOccurrenceId) (input output place : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) (arguments : List VariableBinding)
    (present : ({ placeId := input, owner } : ControlToken) ∈ before.tokens) :
    continuationMarking (activateEffect before instanceId owner input output effect route arguments) queried place +
      ownedPortCount [input] owner queried place =
      continuationMarking before queried place + ownedPortCount [output] owner queried place := by
  have removed := remove_balance before.tokens input owner queried place present
  have inserted := length_filter_canonicalInsertBy effectWaitBefore
    (fun wait : EffectWait => wait.owner == queried && wait.output == place)
    { processInstanceId := instanceId, owner, elementId := effect.elementId,
      activation := effectActivationCount before effect.elementId + 1, descriptor := effect.descriptor,
      arguments, outputMappings := effect.outputMappings, output, bpmnErrorRoute := route } before.effectWaits
  simp only [continuationMarking, activateEffect, insertEffectWait]
  dsimp only at inserted ⊢
  unfold ownedPortCount tokenCount at *
  cases selected : (owner == queried && output == place) <;>
    simp [selected] at inserted ⊢ <;> omega

end ContinuationMarkingLaws

open ContinuationMarkingLaws

/-- SMIS-DATA-01 and PMIS-DATA-01 release blocked Human credit only at the selected wait's owned output. -/
theorem human_port_exchange (before : RuntimeState) (wait : UserTaskWait)
    (variables : ScopedVariables) (present : wait ∈ before.waits)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking { before with
      waits := before.waits.erase wait
      variables
      tokens := addToken before.tokens wait.output wait.owner } owner place =
      continuationMarking before owner place ∧
    tokenCount (addToken before.tokens wait.output wait.owner) owner place =
      tokenCount before.tokens owner place + ownedPortCount [wait.output] wait.owner owner place := by
  refine ⟨human_continuation_exchange before wait variables present owner place, ?_⟩
  simpa only [addTokens, List.foldr_cons, List.foldr_nil] using
    add_many_count before.tokens [wait.output] wait.owner owner place

/-- SMIS-DATA-01 and PMIS-DATA-01 release blocked Service credit only at the selected wait's owned output. -/
theorem effect_port_exchange (before : RuntimeState) (wait : EffectWait)
    (variables : ScopedVariables) (present : wait ∈ before.effectWaits)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking { before with
      effectWaits := before.effectWaits.erase wait
      variables
      tokens := addToken before.tokens wait.output wait.owner } owner place =
      continuationMarking before owner place ∧
    tokenCount (addToken before.tokens wait.output wait.owner) owner place =
      tokenCount before.tokens owner place + ownedPortCount [wait.output] wait.owner owner place := by
  refine ⟨effect_continuation_exchange before wait variables present owner place, ?_⟩
  simpa only [addTokens, List.foldr_cons, List.foldr_nil] using
    add_many_count before.tokens [wait.output] wait.owner owner place

/-- Ordinary body accounting also retains the Scope counter population used by reachable-history freshness. -/
theorem fire_body_port_accounting
    (program : Program) (before after : RuntimeState) (operation : SemanticOperation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (unique : (bodyConsumedPorts operation).Nodup)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (fired : fire? program operation before = some after) :
    (∃ owner,
      (∀ port ∈ bodyConsumedPorts operation, ({ placeId := port, owner } : ControlToken) ∈ before.tokens) ∧
      (∀ queried place, tokenCount after.tokens queried place +
          ownedPortCount (bodyConsumedPorts operation) owner queried place =
        tokenCount before.tokens queried place +
          ownedPortCount (match operation.kind with
            | .awaitUserTask | .awaitEffect => []
            | _ => bodyProducedPorts operation) owner queried place) ∧
      (∀ queried place, continuationMarking after queried place +
          ownedPortCount (bodyConsumedPorts operation) owner queried place =
        continuationMarking before queried place +
          ownedPortCount (bodyProducedPorts operation) owner queried place)) ∧
      after.scopeActivations = before.scopeActivations := by
  cases operation <;> simp [SemanticOperation.kind] at bodyOperation
  all_goals simp only [fire?, absent] at fired
  case awaitUserTask id origin input output task =>
    change awaitUserTaskState? before input output task = some after at fired
    simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, selected, instanceId, _, fired⟩ := fired
    cases Option.some.inj fired
    have present := onlyTokenOwner_present before input owner selected
    refine ⟨?_, rfl⟩
    refine ⟨owner, ?_, ?_, ?_⟩
    · intro port member
      have same : port = input := by simpa only [bodyConsumedPorts, List.mem_singleton] using member
      simpa only [same] using present
    · intro queried place
      simpa only [activateUserTask, bodyConsumedPorts, SemanticOperation.kind,
        ownedPortCount, List.filter_nil, List.length_nil, Nat.add_zero] using
        remove_balance before.tokens input owner queried place present
    · exact fun queried place => user_arm_balance before _ owner queried input output place task present
  case awaitEffect id origin input output effect route =>
    change awaitEffectState? program before input output effect route = some after at fired
    simp only [awaitEffectState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, selected, instanceId, _, arguments, _, fired⟩ := fired
    split at fired <;> try contradiction
    cases Option.some.inj fired
    have present := onlyTokenOwner_present before input owner selected
    refine ⟨?_, rfl⟩
    refine ⟨owner, ?_, ?_, ?_⟩
    · intro port member
      have same : port = input := by simpa only [bodyConsumedPorts, List.mem_singleton] using member
      simpa only [same] using present
    · intro queried place
      simpa only [activateEffect, bodyConsumedPorts, SemanticOperation.kind,
        ownedPortCount, List.filter_nil, List.length_nil, Nat.add_zero] using
        remove_balance before.tokens input owner queried place present
    · exact fun queried place => effect_arm_balance before _ owner queried input output place effect route arguments present
  case duplicate id origin input outputs =>
    change duplicateState? before input outputs = some after at fired
    simp only [duplicateState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, selected, fired⟩ := fired
    cases Option.some.inj fired
    have present := onlyTokenOwner_present before input owner selected
    refine ⟨?_, rfl⟩
    refine ⟨owner, ?_, ?_⟩
    · intro port member
      have same : port = input := by simpa only [bodyConsumedPorts, List.mem_singleton] using member
      simpa only [same] using present
    · constructor <;> intro queried place
      all_goals
        have removed := remove_balance before.tokens input owner queried place present
        have added := add_many_count (removeToken before.tokens input owner) outputs owner queried place
      · simp only [bodyConsumedPorts, bodyProducedPorts, SemanticOperation.kind, duplicateToken]
        omega
      · simp only [bodyConsumedPorts, bodyProducedPorts, continuationMarking, duplicateToken]
        unfold tokenCount at removed added
        omega
  case synchronize id origin inputs output =>
    change synchronizeState? before inputs output = some after at fired
    simp only [synchronizeState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, selected, fired⟩ := fired
    cases Option.some.inj fired
    have present := commonTokenOwner_present before inputs owner selected
    refine ⟨?_, rfl⟩
    refine ⟨owner, present, ?_⟩
    constructor <;> intro queried place
    all_goals
      have removed := remove_many_balance before.tokens inputs owner queried place unique present
      have added := add_many_count (removeTokens before.tokens inputs owner) [output] owner queried place
      simp only [addTokens, List.foldr_cons, List.foldr_nil] at added
    · simp only [bodyConsumedPorts, bodyProducedPorts, SemanticOperation.kind, synchronizeTokens]
      omega
    · simp only [bodyConsumedPorts, bodyProducedPorts, continuationMarking, synchronizeTokens]
      unfold tokenCount at removed added
      omega
  case reachNoneEnd id origin input =>
    change reachNoneEndState? before input = some after at fired
    simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, selected, instanceId, _, fired⟩ := fired
    cases Option.some.inj fired
    have present := onlyTokenOwner_present before input owner selected
    refine ⟨?_, rfl⟩
    refine ⟨owner, ?_, ?_⟩
    · intro port member
      have same : port = input := by simpa only [bodyConsumedPorts, List.mem_singleton] using member
      simpa only [same] using present
    · constructor <;> intro queried place
      all_goals have removed := remove_balance before.tokens input owner queried place present
      · simpa only [bodyConsumedPorts, bodyProducedPorts, SemanticOperation.kind, reachNoneEndToken,
          ownedPortCount, List.filter_nil, List.length_nil, Nat.add_zero] using removed
      · simp only [bodyConsumedPorts, bodyProducedPorts, continuationMarking, reachNoneEndToken,
          ownedPortCount, List.filter_nil, List.length_nil, Nat.add_zero]
        unfold tokenCount ownedPortCount at removed
        omega

/-- Ordinary body execution obeys the same exact port conservation as occurrence-addressed execution. -/
theorem fire_body_continuation_balance
    (program : Program) (before after : RuntimeState) (operation : SemanticOperation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (unique : (bodyConsumedPorts operation).Nodup)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (fired : fire? program operation before = some after) :
    ∃ owner, ∀ queried place,
      continuationMarking after queried place + ownedPortCount (bodyConsumedPorts operation) owner queried place =
      continuationMarking before queried place + ownedPortCount (bodyProducedPorts operation) owner queried place := by
  obtain ⟨owner, _, _, combined⟩ :=
    (fire_body_port_accounting program before after operation bodyOperation unique absent fired).1
  exact ⟨owner, combined⟩

/-- Successful actual body execution consumes and produces precisely its declared owned ports. -/
theorem applyInternalOperationOccurrence_continuation_balance
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after queried place + ownedPortCount (bodyConsumedPorts operation) candidate.owner queried place =
      continuationMarking before queried place + ownedPortCount (bodyProducedPorts operation) candidate.owner queried place := by
  cases control : before.control <;> try { simp [applyInternalOperationOccurrence?, control] at applied }
  cases operation <;> simp [SemanticOperation.kind] at bodyOperation
  all_goals simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    split at applied <;> try contradiction
    rename_i valid
    have unit : (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 := by
      simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
      have first := valid.1.1.1
      cases unitEq : ((before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length == 1) <;>
        simp_all
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    · cases Option.some.inj applied
      exact user_arm_balance before _ candidate.owner queried input output place task (token_present _ _ _ unit)
    · obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact user_arm_balance before _ candidate.owner queried input output place task (token_present _ _ _ unit)
  case awaitEffect id origin input output effect route =>
    split at applied <;> try contradiction
    rename_i valid
    have unit : (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 := by
      simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
      have first := valid.1.1.1
      cases unitEq : ((before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length == 1) <;>
        simp_all
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact effect_arm_balance before _ candidate.owner queried input output place effect route arguments (token_present _ _ _ unit)
  case duplicate id origin input outputs =>
    split at applied <;> try contradiction
    rename_i unit
    cases Option.some.inj applied
    have removed := remove_balance before.tokens input candidate.owner queried place (token_present _ _ _ (by simpa using unit))
    have added := add_many_count (removeToken before.tokens input candidate.owner) outputs candidate.owner queried place
    simp only [bodyConsumedPorts, bodyProducedPorts, continuationMarking, duplicateToken]
    unfold tokenCount at removed added
    omega
  case synchronize id origin inputs output =>
    split at applied <;> try contradiction
    rename_i valid
    simp only [Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true, beq_iff_eq] at valid
    cases Option.some.inj applied
    have removed := remove_many_balance before.tokens inputs candidate.owner queried place valid.1.2
      (fun input member => token_present _ _ _ (valid.2 input member))
    have added := add_many_count (removeTokens before.tokens inputs candidate.owner) [output] candidate.owner queried place
    simp only [bodyConsumedPorts, bodyProducedPorts, continuationMarking, synchronizeTokens]
    simp only [addTokens, List.foldr_cons, List.foldr_nil] at added
    unfold tokenCount at removed added
    omega
  case reachNoneEnd id origin input =>
    split at applied <;> try contradiction
    rename_i unit
    cases Option.some.inj applied
    have removed := remove_balance before.tokens input candidate.owner queried place (token_present _ _ _ (by simpa using unit))
    simp only [bodyConsumedPorts, bodyProducedPorts, continuationMarking, reachNoneEndToken, ownedPortCount, List.filter_nil, List.length_nil, Nat.add_zero]
    unfold tokenCount ownedPortCount at removed
    omega

end BpmnSemantics.SemanticProcess
