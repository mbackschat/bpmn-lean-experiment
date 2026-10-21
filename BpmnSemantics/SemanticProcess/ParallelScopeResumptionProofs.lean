import BpmnSemantics.SemanticProcess.ParallelScopeCommandPhaseProofs

/-! # Scoped parallel subprocess resumption

PMIS-DATA-01 and PMIS-SELECT-01 connect an actual committed Human/Service
completion to owner-concentrated body execution. Stable discovery supplies
foreign refusal; actual singleton and reserved-batch selections preserve it until
a structural phase transition. Entry-population drain, refusal-free reservation,
complete command progress and publication acceptance remain separate obligations.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- PMIS-SELECT-01 confines ordinary body progress to the resumed owner: foreign body reads and existing retirement blockers survive until a structural phase transition. -/
structure ParallelScopeOwnerFrame (stable current : RuntimeState) (actor : ScopeOccurrenceId) : Prop where
  control : current.control = stable.control
  scopes : current.scopeOccurrences = stable.scopeOccurrences
  counts : ∀ owner, owner ≠ actor → ∀ place,
    (current.tokens.filter fun token => token.placeId == place && token.owner == owner).length =
      (stable.tokens.filter fun token => token.placeId == place && token.owner == owner).length
  blocked : ∀ owner, owner ≠ actor → scopeQuiescent stable owner = false → scopeQuiescent current owner = false
  pending : current.initiationPending = stable.initiationPending
  actorBound : ∃ entry binding, parallelScopeBinding? entry stable actor = some binding
  population : ∀ parent, ParallelScopeStructuralFrame parent stable → ParallelScopeStructuralFrame parent current

private theorem writeParallelScopeValues_binding (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind)
    (variables : ScopedVariables) (written : writeParallelScopeValues? program state owner values kind = some variables) :
    ∃ entry binding, parallelScopeBinding? entry state owner = some binding := by
  unfold writeParallelScopeValues? at written
  split at written <;> try contradiction
  obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp written
  exact ⟨_, binding, bound⟩

theorem parallelScopeBinding_body_record (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding) :
    ∃ body, state.scopeOccurrences.filter (fun occurrence => occurrence.id == target) = [body] ∧
      body.id = target ∧ body.parent = some binding.activity.owner ∧ target.definitionScopeId = entry.childScopeId := by
  obtain ⟨iteration, member, identity⟩ := parallelScopeBinding_member entry state target binding bound
  have bodyBound := List.all_eq_true.mp (parallelScopeBinding_population entry state target binding bound).2 iteration member
  rw [identity] at bodyBound
  unfold parallelScopeBodyBound at bodyBound
  split at bodyBound <;> try contradiction
  rename_i body selected
  have present : body ∈ state.scopeOccurrences.filter (fun occurrence => occurrence.id == target) := by rw [selected]; simp
  have same : body.id = target := by simpa only [beq_iff_eq] using (List.mem_filter.mp present).2
  simp only [Bool.and_eq_true, beq_iff_eq] at bodyBound
  exact ⟨body, selected, same, bodyBound.1.1.2, bodyBound.1.1.1⟩

/-- Actual reservation cannot add work at an owner whose control, scopes and token buckets still match complete stable discovery. This includes reserved arming, whose input must be present even when its counter slot differs. -/
theorem preparedOccurrenceBatch_owned_by_changed_owner (program : Program) (stable current : RuntimeState)
    (actor : ScopeOccurrenceId) (batch : InternalOccurrenceBatch)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (control : current.control = stable.control) (scopes : current.scopeOccurrences = stable.scopeOccurrences)
    (counts : ∀ owner, owner ≠ actor → ∀ place,
      (current.tokens.filter fun token => token.placeId == place && token.owner == owner).length =
        (stable.tokens.filter fun token => token.placeId == place && token.owner == owner).length)
    (prepared : prepareInternalOccurrenceBatch? program current = some batch) :
    ∀ patch ∈ batch.members, patch.owner = actor := by
  obtain ⟨_, _, _, _, _, _, _, _, offers, _, trace, _⟩ :=
    prepareInternalOccurrenceBatch_certificate program current batch prepared
  intro patch member
  apply Classical.byContradiction
  intro outside
  cases patch with
  | token token =>
    have initial := (trace.token_prepared program current [] batch.members (offers.map Prod.fst) token member).resolve_left (by simp)
    obtain ⟨applied, resolved, kind⟩ := ParallelScopeReplay.prepareOccurrenceTokenPatch_application program current
      ⟨token.operation.id, token.tokens.owner⟩ token initial
    have stableResolved : resolveInternalOperationOccurrence? program stable
        ⟨token.operation.id, token.tokens.owner⟩ = some token.operation := by
      simpa only [resolveInternalOperationOccurrence?, internalOperationOccurrences?, scopes] using resolved
    have bodyKind : token.operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] := by
      simp only [List.mem_cons] at kind ⊢
      exact Or.inr (Or.inr kind)
    have refused := stable_frontier_body_refusal_of_token_frame program stable current profile
      ⟨token.operation.id, token.tokens.owner⟩ token.operation stableResolved bodyKind empty successful control scopes
      (counts token.tokens.owner outside)
    rw [applied] at refused
    contradiction
  | arm arm =>
    obtain ⟨_, initial⟩ := (trace.arm_prepared program current [] batch.members (offers.map Prod.fst) arm member).resolve_left (by simp)
    obtain ⟨runtimeId, operation, input, _, _, _, resolved, selectedInput, unit, _, _, _, _, shape, _⟩ :=
      ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program current
        ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation arm initial
    have stableResolved : resolveInternalOperationOccurrence? program stable
        ⟨arm.operation.id, arm.owner⟩ = some operation := by
      simpa only [resolveInternalOperationOccurrence?, internalOperationOccurrences?, scopes] using resolved
    have waitKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect] := by
      cases operation <;> simp only [ParallelScopeReplay.ReservedArmWriteShape] at shape <;> try contradiction
      all_goals simp [SemanticOperation.kind]
    have inputMember : input ∈ bodyConsumedPorts operation := by
      cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at waitKind <;> try contradiction
      all_goals simpa [internalArmInput?, bodyConsumedPorts, SequentialScopeControl.inputs, eq_comm] using selectedInput
    have absent := stable_frontier_wait_input_absent program stable profile instanceId running
      ⟨arm.operation.id, arm.owner⟩ operation stableResolved waitKind empty successful input inputMember
    rw [counts arm.owner outside input, absent] at unit
    contradiction

/-- Derived batch ownership preserves the original foreign read boundary at every actual prefix, so the next reservation can reuse the same causality argument. -/
theorem preparedOccurrenceBatch_preserves_owner_frame (program : Program) (stable current : RuntimeState)
    (actor : ScopeOccurrenceId) (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (control : current.control = stable.control) (scopes : current.scopeOccurrences = stable.scopeOccurrences)
    (counts : ∀ owner, owner ≠ actor → ∀ place,
      (current.tokens.filter fun token => token.placeId == place && token.owner == owner).length =
        (stable.tokens.filter fun token => token.placeId == place && token.owner == owner).length)
    (prepared : prepareInternalOccurrenceBatch? program current = some batch)
    (applied : applyInternalOccurrenceBatch? program current batch = some successors) :
    ∀ owner, owner ≠ actor → ∀ after ∈ successors,
      after.control = stable.control ∧ after.scopeOccurrences = stable.scopeOccurrences ∧
        ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == owner).length =
          (stable.tokens.filter fun token => token.placeId == place && token.owner == owner).length := by
  have owned := preparedOccurrenceBatch_owned_by_changed_owner program stable current actor batch profile instanceId running
    empty successful control scopes counts prepared
  intro owner different after member
  have outside : ∀ patch ∈ batch.members, patch.owner ≠ owner := by
    intro patch included same
    exact different (same.symm.trans (owned patch included))
  obtain ⟨nextControl, nextScopes, nextCounts⟩ := applyInternalOccurrenceBatch_foreign_token_reads
    program current batch successors owner applied outside after member
  exact ⟨nextControl.trans control, nextScopes.trans scopes, fun place => (nextCounts place).trans (counts owner different place)⟩

/-- PMIS-DATA-01 changes only the resumed Human owner among body-read token buckets. -/
theorem completeParallelScopeUserTask_owner_frame (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding) (wait : UserTaskWait)
    (selected : before.waits.filter ((taskIdNamesWait id)) = [wait])
    (completed : completeParallelScopeUserTask? program before id values = some after) :
    ParallelScopeOwnerFrame before after wait.owner := by
  have population : ∀ parent, ParallelScopeStructuralFrame parent before → ParallelScopeStructuralFrame parent after :=
    fun parent frame => completeParallelScopeUserTask_structural_parallel_frame program parent before after id values frame completed
  have locality := completeParallelScopeUserTask_quiescence_locality program before after id values wait selected completed
  simp only [completeParallelScopeUserTask?, selected] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  have bound := writeParallelScopeValues_binding program before wait.owner _ _ variables written
  cases Option.some.inj completed
  refine ⟨rfl, rfl, ?_, ?_, rfl, bound, population⟩
  · intro owner different place
    simpa [different.symm] using addToken_filter_length before.tokens wait.output wait.owner
      (fun token => token.placeId == place && token.owner == owner)
  · intro owner different blocked
    exact (locality.2 owner different.symm).trans blocked

/-- PMIS-DATA-01 retains foreign body reads through Service projection and Activity-local disposal. -/
theorem completeParallelScopeEffect_owner_frame (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult) (wait : EffectWait)
    (selected : before.effectWaits.filter (effectIdNamesWait id) = [wait])
    (completed : completeParallelScopeEffect? program before id result = some after) :
    ParallelScopeOwnerFrame before after wait.owner := by
  have population : ∀ parent, ParallelScopeStructuralFrame parent before → ParallelScopeStructuralFrame parent after :=
    fun parent frame => completeParallelScopeEffect_structural_parallel_frame program parent before after id result frame completed
  have locality := completeParallelScopeEffect_quiescence_locality program before after id result wait selected completed
  simp only [completeParallelScopeEffect?, selected] at completed
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  have bound := writeParallelScopeValues_binding program before wait.owner _ _ variables written
  cases Option.some.inj completed
  refine ⟨rfl, rfl, ?_, ?_, rfl, bound, population⟩
  · intro owner different place
    simpa [different.symm] using addToken_filter_length before.tokens wait.output wait.owner
      (fun token => token.placeId == place && token.owner == owner)
  · intro owner different blocked
    exact (locality.2 owner different.symm).trans blocked
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

/-- PMIS-DATA-01 identifies the exact selected scoped wait before completion dispatch; it assumes neither successful admission nor any later batch ownership. -/
def scopedWaitCompletionOwner (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) (owner : ScopeOccurrenceId) : Prop :=
  match stimulus with
  | .completeUserTaskInstance _ id _ => ∃ wait : UserTaskWait,
      state.waits.filter ((taskIdNamesWait id)) = [wait] ∧
      hasParallelScopeDefinition program wait.owner = true ∧ wait.owner = owner
  | .completeEffect _ id (.success _) => ∃ wait : EffectWait,
      state.effectWaits.filter (effectIdNamesWait id) = [wait] ∧
      hasParallelScopeDefinition program wait.owner = true ∧ wait.owner = owner
  | _ => False

private theorem scopedWaitCompletionOwner_child (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (state : RuntimeState) (stimulus : Stimulus) (owner : ScopeOccurrenceId)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (resumed : scopedWaitCompletionOwner program state stimulus owner) : owner.definitionScopeId = analysis.entry.childScopeId := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
  cases stimulus <;> simp only [scopedWaitCompletionOwner] at resumed <;> try contradiction
  case completeUserTaskInstance =>
    obtain ⟨wait, _, routed, same⟩ := resumed
    unfold hasParallelScopeDefinition at routed
    rw [entries, same] at routed
    simp only [List.any_cons, List.any_nil, Bool.or_false, beq_iff_eq] at routed
    exact routed.symm
  case completeEffect commandId id result =>
    cases result <;> simp only at resumed <;> try contradiction
    obtain ⟨wait, _, routed, same⟩ := resumed
    unfold hasParallelScopeDefinition at routed
    rw [entries, same] at routed
    simp only [List.any_cons, List.any_nil, Bool.or_false, beq_iff_eq] at routed
    exact routed.symm

/-- Actual committed scoped ingress establishes the body-read frame before any internal reservation or execution. -/
theorem scoped_admission_owner_frame (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (actor : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (resumed : scopedWaitCompletionOwner program before stimulus actor)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    ParallelScopeOwnerFrame before (admitStimulus program before stimulus).state actor := by
  cases stimulus <;> simp only [scopedWaitCompletionOwner] at resumed <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    obtain ⟨wait, chosen, routed, owner⟩ := resumed
    have completed : completeParallelScopeUserTask? program before id values =
        some (admitStimulus program before (.completeUserTaskInstance commandId id values)).state := by
      cases completion : completeParallelScopeUserTask? program before id values <;>
        cases snapshot : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, snapshot, running, selected, ParallelScopeCommand.completeTask?, chosen, routed, completion] at committed ⊢
      all_goals repeat' split at committed <;> try contradiction
      all_goals simp_all only [Bool.true_eq_false, ↓reduceIte]
    simpa only [owner] using completeParallelScopeUserTask_owner_frame program before _ id values wait chosen completed
  case completeEffect commandId id result =>
    cases result <;> simp only at resumed <;> try contradiction
    rename_i values
    obtain ⟨wait, chosen, routed, owner⟩ := resumed
    have completed : completeParallelScopeEffect? program before id (.success values) =
        some (admitStimulus program before (.completeEffect commandId id (.success values))).state := by
      cases completion : completeParallelScopeEffect? program before id (.success values) <;>
        cases snapshot : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, snapshot, running, selected, ParallelScopeCommand.completeEffect?, chosen, routed, completion] at committed ⊢
      all_goals repeat' split at committed <;> try contradiction
      all_goals simp_all only [Bool.true_eq_false, ↓reduceIte]
    simpa only [owner] using completeParallelScopeEffect_owner_frame program before _ id (.success values) wait chosen completed


/-- Stable discovery turns the actual committed ingress read frame into exact reserved ownership. -/
theorem scoped_admission_reserved_owner (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (actor : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program before).offers = [])
    (successful : (deriveInternalExecutionFrontier program before).preparationFailed = false)
    (resumed : scopedWaitCompletionOwner program before stimulus actor)
    (committed : (admitStimulus program before stimulus).outcome = .committed)
    (batch : InternalOccurrenceBatch)
    (prepared : prepareInternalOccurrenceBatch? program (admitStimulus program before stimulus).state = some batch) :
    ∀ patch ∈ batch.members, patch.owner = actor := by
  have frame := scoped_admission_owner_frame program before stimulus actor selected instanceId running resumed committed
  exact preparedOccurrenceBatch_owned_by_changed_owner program before _ actor batch
    (by simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected) instanceId running
    empty successful frame.control frame.scopes frame.counts prepared

/-- A successful ordinary body singleton must belong to the resumed owner and retains every foreign body read. Complete discovery supplies the ownership conclusion. -/
theorem ParallelScopeOwnerFrame.body_step (program : Program) (stable current after : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable current actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program current candidate = some after) :
    candidate.owner = actor ∧ ParallelScopeOwnerFrame stable after actor := by
  have owned : candidate.owner = actor := by
    apply Classical.byContradiction
    intro outside
    have stableResolved : resolveInternalOperationOccurrence? program stable candidate = some operation := by
      simpa only [resolveInternalOperationOccurrence?, internalOperationOccurrences?, frame.scopes] using resolved
    have refused := stable_frontier_body_refusal_of_token_frame program stable current profile candidate operation
      stableResolved body empty successful frame.control frame.scopes (frame.counts candidate.owner outside)
    rw [applied] at refused
    contradiction
  let observer : ScopeOccurrenceId := { actor with activation := actor.activation + 1 }
  have outside : candidate.owner ≠ observer := by
    intro same
    have different := congrArg ScopeOccurrenceId.activation (owned.symm.trans same)
    simp [observer] at different
  have structural := applyInternalOperationOccurrence_body_foreign_token_reads program current after candidate operation
    observer resolved body applied outside
  refine ⟨owned, structural.1.trans frame.control, structural.2.1.trans frame.scopes, ?_, ?_, ?_, frame.actorBound, ?_⟩
  · intro owner different place
    have preserved := applyInternalOperationOccurrence_body_foreign_token_reads program current after candidate operation
      owner resolved body applied (by simpa only [owned, ne_comm] using different)
    exact (preserved.2.2 place).trans (frame.counts owner different place)
  · intro owner different blocked
    exact (applyInternalOperationOccurrence_body_quiescence_locality program current after candidate operation owner
      resolved body applied (by simpa only [owned, ne_comm] using different)).trans (frame.blocked owner different blocked)
  · rcases applyInternalOperationOccurrence_body_effect program current after candidate operation resolved body applied with
      ⟨patch, _, _, rfl⟩ | ⟨patch, increment, _, rfl⟩
    · cases write : patch.write <;> simpa [applyInternalArmingPatch, write] using frame.pending
    · exact frame.pending
  · intro parent rootFrame
    exact applyInternalOperationOccurrence_body_structural_parallel_frame program parent current after candidate operation
      (frame.population parent rootFrame) resolved body applied

/-- Actual preparation derives owner concentration again at each batch; every executed member prefix retains the original stable read frame. -/
theorem ParallelScopeOwnerFrame.batch_steps (program : Program) (stable current : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable current actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (prepared : prepareInternalOccurrenceBatch? program current = some batch)
    (applied : applyInternalOccurrenceBatch? program current batch = some successors) :
    ∀ after ∈ successors, ParallelScopeOwnerFrame stable after actor := by
  have structurePreserved : ∀ after ∈ successors,
      after.control = current.control ∧ after.scopeOccurrences = current.scopeOccurrences ∧
        after.initiationPending = current.initiationPending := by
    refine applyInternalOccurrenceBatch_prefix_induction program current batch successors
      (fun after => after.control = current.control ∧ after.scopeOccurrences = current.scopeOccurrences ∧
        after.initiationPending = current.initiationPending)
      ⟨rfl, rfl, rfl⟩ ?_ applied
    intro before patch member ready earlier
    refine ⟨(patch.retirement_frame before).1.trans earlier.1,
      (patch.retirement_frame before).2.1.trans earlier.2.1, ?_⟩
    cases patch with
    | token token => exact earlier.2.2
    | arm arm => cases write : arm.write <;> simpa [InternalOccurrencePatch.apply, applyInternalArmingPatch, write] using earlier.2.2
  have preserved := preparedOccurrenceBatch_preserves_owner_frame program stable current actor batch successors
    profile instanceId running empty successful frame.control frame.scopes frame.counts prepared applied
  intro after member
  refine ⟨(structurePreserved after member).1.trans frame.control,
    (structurePreserved after member).2.1.trans frame.scopes,
    fun owner different => (preserved owner different after member).2.2, ?_,
    (structurePreserved after member).2.2.trans frame.pending, frame.actorBound,
    fun parent rootFrame => applyInternalOccurrenceBatch_structural_parallel_frame program current batch successors parent
      (frame.population parent rootFrame) applied after member⟩
  intro owner different blocked
  have owned := preparedOccurrenceBatch_owned_by_changed_owner program stable current actor batch profile instanceId running
    empty successful frame.control frame.scopes frame.counts prepared
  exact applyInternalOccurrenceBatch_preserves_nonquiescence program current batch successors owner applied
    (frame.blocked owner different blocked)
    (fun patch included same => different (same.symm.trans (owned (.token patch) included))) after member

/-- PMIS-END-01 requires a live quiescent child. Exact binding locates it in the stable scope census, where the owner frame retains every foreign retirement blocker. -/
theorem ParallelScopeOwnerFrame.retirement_owner (entry : ParallelScopeEntry)
    (stable current after : RuntimeState) (actor target : ScopeOccurrenceId)
    (frame : ParallelScopeOwnerFrame stable current actor)
    (blocked : ∀ body ∈ stable.scopeOccurrences, body.id.definitionScopeId = entry.childScopeId →
      scopeQuiescent stable body.id = false)
    (completed : completeParallelScope? entry current target = some after) : target = actor := by
  apply Classical.byContradiction
  intro different
  have bound := completed
  unfold completeParallelScope? at bound
  obtain ⟨binding, selected, _⟩ := Option.bind_eq_some_iff.mp bound
  obtain ⟨iteration, member, identity⟩ := parallelScopeBinding_member entry current target binding selected
  have bodyBound := List.all_eq_true.mp (parallelScopeBinding_population entry current target binding selected).2 iteration member
  rw [identity] at bodyBound
  unfold parallelScopeBodyBound at bodyBound
  split at bodyBound <;> try contradiction
  rename_i body selectedBody
  have present : body ∈ current.scopeOccurrences.filter (fun occurrence => occurrence.id == target) := by
    rw [selectedBody]
    simp
  obtain ⟨included, same⟩ := List.mem_filter.mp present
  have bodyId : body.id = target := by simpa only [beq_iff_eq] using same
  have child : target.definitionScopeId = entry.childScopeId := by
    simp only [Bool.and_eq_true, beq_iff_eq] at bodyBound
    exact bodyBound.1.1.1
  have earlier : scopeQuiescent stable target = false := by
    rw [frame.scopes] at included
    simpa only [bodyId] using blocked body included (by simpa only [bodyId] using child)
  have refused := completeParallelScope_refuses_nonquiescent entry current target (frame.blocked target different earlier)
  rw [completed] at refused
  contradiction

/-- Actual retirement dispatch resolves the admitted paired entry; the owner conclusion applies to the dispatcher, not only to its low-level helper. -/
theorem ParallelScopeOwnerFrame.retirement_operation_owner (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (stable current after : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable current actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (blocked : ∀ body ∈ stable.scopeOccurrences, body.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent stable body.id = false)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation)
    (retirement : operation.kind = .completeParallelMultiInstanceScope)
    (applied : applyInternalOperationOccurrence? program current candidate = some after) : candidate.owner = actor := by
  obtain ⟨actual, actualResolved, _, replayed⟩ := ParallelScopeReplay.applyInternalOperationOccurrence_replay_record
    program current after candidate profile applied
  have same : actual = operation := Option.some.inj (actualResolved.symm.trans resolved)
  subst actual
  obtain ⟨entry, member, completed⟩ := ParallelScopeReplay.replayed_retirement_execution program current after
    { operationId := candidate.operationId, operationKind := operation.kind,
      origin := operation.origin, owner := candidate.owner, mergeInput := none } retirement replayed
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
  rw [entries] at member
  have identity : entry = analysis.entry := by simpa using member
  subst entry
  exact frame.retirement_owner analysis.entry stable current after actor candidate.owner blocked completed

/-- PMIS body resumption cannot initiate again, enter a second population, or complete the root. Pending-state equality transfers initiation refusal; the exact live actor binding blocks entry and separates the body from an ordinary completion owner. -/
theorem ParallelScopeOwnerFrame.nonretirement_exit_refused (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (stable current after : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable current actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (child : actor.definitionScopeId = analysis.entry.childScopeId)
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation)
    (phase : operation.kind = .initiate ∨ operation.kind = .enterParallelMultiInstanceScope ∨ operation.kind = .completeScope)
    (applied : applyInternalOperationOccurrence? program current candidate = some after) : False := by
  have stableResolved : resolveInternalOperationOccurrence? program stable candidate = some operation := by
    simpa only [resolveInternalOperationOccurrence?, internalOperationOccurrences?, frame.scopes] using resolved
  have refused := deriveInternalExecutionFrontier_empty_occurrence_refusal program stable profile candidate operation stableResolved empty successful
  obtain ⟨entry, binding, bound⟩ := frame.actorBound
  obtain ⟨body, bodySelected, bodyId, bodyParent, _⟩ := parallelScopeBinding_body_record entry stable actor binding bound
  have bodyPresent : body ∈ stable.scopeOccurrences :=
    (List.mem_filter.mp (bodySelected.symm ▸ List.mem_singleton_self body)).1
  rcases phase with initiation | entryKind | completion
  · cases operation <;> simp only [SemanticOperation.kind] at initiation <;> try contradiction
    rename_i id origin output
    simp only [applyInternalOperationOccurrence?, running, frame.control, resolved, stableResolved, bind, Option.bind_some] at applied refused
    rw [frame.scopes] at applied
    split at applied <;> try contradiction
    rename_i root roots
    split at applied <;> try contradiction
    rename_i selectedRoot
    simp only [roots, selectedRoot, ↓reduceIte] at refused
    have rootFrame : rootScopeOccurrence? current = rootScopeOccurrence? stable := by
      simp only [rootScopeOccurrence?, frame.scopes]
    have enabled : (initiateState? stable output).isSome = (initiateState? current output).isSome := by
      cases chosen : rootScopeOccurrence? stable <;> cases pending : stable.initiationPending <;>
        simp [initiateState?, rootFrame, chosen, frame.pending, pending]
    simp [refused, applied] at enabled
  · obtain ⟨actual, actualResolved, _, replayed⟩ := ParallelScopeReplay.applyInternalOperationOccurrence_replay_record program current after candidate profile applied
    have same : actual = operation := Option.some.inj (actualResolved.symm.trans resolved)
    subst actual
    have completed := ParallelScopeReplay.replayed_parallel_entry_execution program analysis analyzed current after
      { operationId := candidate.operationId, operationKind := operation.kind,
        origin := operation.origin, owner := candidate.owner, mergeInput := none } entryKind replayed
    have present : (current.scopeOccurrences.any fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) = true := by
      rw [frame.scopes]
      exact List.any_eq_true.mpr ⟨body, bodyPresent, by simp [bodyId, child]⟩
    simp [enterParallelScope?, present] at completed
  · have declared := (resolveInternalOperationOccurrence_declaration program current candidate operation resolved).1
    cases operation <;> simp only [SemanticOperation.kind] at completion <;> try contradiction
    rename_i id origin scopeId parentOutput
    have allowed := ParallelScopeStart.analyzeProgram_operation_allowed program analysis analyzed _ declared
    have output : parentOutput = none := by
      cases parentOutput <;> simp [SequentialScopeProgram.operationAllowed] at allowed ⊢
    subst parentOutput
    simp only [applyInternalOperationOccurrence?, running, frame.control, resolved, stableResolved, bind, Option.bind_some,
      isMergeTargetOperation_eq_false_of_profile program _ (by rw [profile]; decide +kernel), Bool.false_eq_true, ↓reduceIte] at applied refused
    rw [frame.scopes] at applied
    split at applied <;> try contradiction
    rename_i root unique
    split at applied <;> try contradiction
    rename_i sameOwner
    have rootId : root.id = candidate.owner := by simpa only [beq_iff_eq] using sameOwner
    simp only [unique, sameOwner, ↓reduceIte] at refused
    obtain ⟨unmonitored, unbounded⟩ := ParallelScopeReplay.admitted_completion_unwrapped program analysis analyzed scopeId
    simp only [completeDeclaredScope?] at applied refused
    rw [completeSelectedScope?, unmonitored,
      completeBoundedScope_eq_completeScope_of_unbounded program current scopeId none unbounded] at applied
    rw [completeSelectedScope?, unmonitored,
      completeBoundedScope_eq_completeScope_of_unbounded program stable scopeId none unbounded] at refused
    have uniqueStable : stable.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [root] := by
      simpa only [Bool.beq_eq_decide_eq] using unique
    have uniqueCurrent : current.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [root] := by
      simpa only [frame.scopes] using uniqueStable
    obtain ⟨quiet, updated⟩ := completeScopeState_selected_update current after scopeId none root uniqueCurrent applied
    have parentless : root.parent = none := by
      cases parent : root.parent <;> simp only [parent, frame.control, running] at updated <;> first | rfl | contradiction
    have pendingFalse : stable.initiationPending = false := by
      cases pending : current.initiationPending with
      | false => exact frame.pending.symm.trans pending
      | true => simp [parentless, frame.control, running, pending] at updated
    have rootPresent : root ∈ stable.scopeOccurrences :=
      (List.mem_filter.mp (unique.symm ▸ List.mem_singleton_self root)).1
    have outside : candidate.owner ≠ actor := by
      intro same
      have included : root ∈ stable.scopeOccurrences.filter (fun occurrence => occurrence.id == actor) :=
        List.mem_filter.mpr ⟨rootPresent, by simp [rootId, same]⟩
      rw [bodySelected] at included
      have identity : root = body := by simpa using included
      rw [identity, bodyParent] at parentless
      contradiction
    have stableQuiet : scopeQuiescent stable candidate.owner = true := by
      cases checked : scopeQuiescent stable candidate.owner with
      | true => rfl
      | false =>
        have blocked := frame.blocked candidate.owner outside checked
        rw [rootId, blocked] at quiet
        contradiction
    have rootQuiet : scopeQuiescent stable root.id = true := by simpa only [rootId] using stableQuiet
    simp [completeScopeState?, uniqueStable, rootQuiet, completeQuiescentScope?, parentless, running, pendingFalse] at refused

/-- A structural exit is tied to one actual command prefix and its exact remaining scheduler
cursor. This prevents a successful operation elsewhere from standing in for this run's retirement.
-/
structure ParallelScopeSingletonCut (program : Program) (commandId : SemanticId)
    (initialFuel initialIndex initialOrdinal : Nat) (initialSchedule : InternalChoiceSchedule)
    (initialState : RuntimeState) where
  fuel : Nat
  index : Nat
  ordinal : Nat
  schedule : InternalChoiceSchedule
  remaining : InternalChoiceSchedule
  consumed : Bool
  before : RuntimeState
  offer : InternalExecutionOffer
  step : InternalClosureStep
  candidate : InternalOperationOccurrence
  operation : SemanticOperation
  path : ScheduledClosurePrefix program commandId initialFuel initialIndex initialOrdinal initialSchedule initialState
    (fuel + 1) index ordinal schedule before
  unstable : ¬ ((deriveInternalExecutionFrontier program before).offers.isEmpty &&
    !(deriveInternalExecutionFrontier program before).preparationFailed) = true
  selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
    (deriveInternalExecutionFrontier program before) = .execute [offer] remaining consumed
  after_prefix : ScheduledClosurePrefix program commandId initialFuel initialIndex initialOrdinal initialSchedule initialState
    fuel (index + 1) (ordinal + if consumed then 1 else 0) remaining step.state
  alternative : offer.alternative = .operationOccurrence candidate.operationId candidate.owner
  resolved : resolveInternalOperationOccurrence? program before candidate = some operation
  applied : applyInternalOperationOccurrence? program before candidate = some step.state

theorem ParallelScopeSingletonCut.continuation
    {program : Program} {commandId : SemanticId} {fuel index ordinal : Nat}
    {schedule : InternalChoiceSchedule} {state : RuntimeState}
    (cut : ParallelScopeSingletonCut program commandId fuel index ordinal schedule state) :
    (closeScheduledTraced fuel program commandId index ordinal schedule state).state =
      (closeScheduledTraced cut.fuel program commandId (cut.index + 1)
        (cut.ordinal + if cut.consumed then 1 else 0) cut.remaining cut.step.state).state ∧
    (closeScheduledTraced fuel program commandId index ordinal schedule state).failed =
      (closeScheduledTraced cut.fuel program commandId (cut.index + 1)
        (cut.ordinal + if cut.consumed then 1 else 0) cut.remaining cut.step.state).failed :=
  cut.after_prefix.continuation

/-- Actual singleton/batch selections preserve foreign reads and retirement blockers until a
non-body operation. The exit retains its actual prefix; no future reservation success is assumed.
-/
theorem closeScheduledTraced_owner_frame_or_exit (program : Program) (stable current : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable current actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (commandId : SemanticId) (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) :
    ParallelScopeOwnerFrame stable (closeScheduledTraced fuel program commandId index ordinal schedule current).state actor ∨
      ∃ cut : ParallelScopeSingletonCut program commandId fuel index ordinal schedule current,
        ParallelScopeOwnerFrame stable cut.before actor ∧
        cut.operation.kind ∈ [SemanticOperationKind.initiate, .enterParallelMultiInstanceScope, .completeParallelMultiInstanceScope, .completeScope] := by
  let exited : Prop := ∃ cut : ParallelScopeSingletonCut program commandId fuel index ordinal schedule current,
    ParallelScopeOwnerFrame stable cut.before actor ∧
    cut.operation.kind ∈ [SemanticOperationKind.initiate, .enterParallelMultiInstanceScope, .completeParallelMultiInstanceScope, .completeScope]
  obtain ⟨_, _, _, _, _, _, retained⟩ := closeScheduledTraced_cursor_induction program commandId
    (fun remainingFuel position nextOrdinal nextSchedule state =>
      ScheduledClosurePrefix program commandId fuel index ordinal schedule current remainingFuel position nextOrdinal nextSchedule state ∧
      (ParallelScopeOwnerFrame stable state actor ∨ exited)) (by
      intro nextFuel position nextOrdinal nextSchedule before first rest remaining consumed step earlier unstable selected enough executed
      refine ⟨.step earlier.1 unstable selected enough executed, ?_⟩
      rcases earlier.2 with framed | exited
      · rcases executeSelectedFrontier_parallel_scope_steps program commandId position nextOrdinal nextSchedule
          before (first :: rest) remaining consumed step profile (by simp) selected executed with
          ⟨offer, candidate, shape, _, alternative, applied, _⟩ |
          ⟨batch, successors, reserved, applied, _, endpoint, _, _⟩
        · obtain ⟨operation, resolved, _, _⟩ := ParallelScopeReplay.applyInternalOperationOccurrence_replay_record
            program before step.state candidate profile applied
          by_cases body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
          · exact Or.inl (framed.body_step program stable before step.state actor profile empty successful candidate operation resolved body applied).2
          · have structural : operation.kind ∈ [SemanticOperationKind.initiate, .enterParallelMultiInstanceScope,
                .completeParallelMultiInstanceScope, .completeScope] := by
              cases operation <;> simp [SemanticOperation.kind] at body ⊢
              all_goals cases control : before.control <;>
                simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some,
                  isMergeTargetOperation_eq_false_of_profile program _ (by rw [profile]; decide +kernel), Bool.false_eq_true, Bool.false_and, ↓reduceIte] at applied <;> contradiction
            obtain ⟨rfl, rfl⟩ := List.cons.inj shape
            exact Or.inr ⟨{
              fuel := nextFuel, index := position, ordinal := nextOrdinal
              schedule := nextSchedule, remaining, consumed, before, offer := first, step, candidate, operation
              path := earlier.1, unstable, selected, alternative, resolved, applied
              after_prefix := by
                simpa only [List.length_nil, Nat.sub_zero, Nat.add_zero] using
                  ScheduledClosurePrefix.step earlier.1 unstable selected (Nat.zero_le _) executed }, framed, structural⟩
        · exact Or.inl (framed.batch_steps program stable before actor profile instanceId running empty successful batch successors
            (deriveInternalExecutionFrontier_batch_prepared program before batch reserved) applied step.state (List.mem_of_getLast? endpoint))
      · exact Or.inr exited)
    fuel index ordinal schedule current ⟨.initial, Or.inl frame⟩
  exact retained

end BpmnSemantics.SemanticProcess.InternalCommutation

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

/-- Completed-boundary stability and real scoped admission initialize the entire closure invariant. A changed foreign read or retirement blocker requires a successful non-body step from a still-framed predecessor. -/
theorem ParallelScopeCommandBoundaryReachable.scoped_closure_owner_or_exit
    (program : Program) (before : RuntimeState) (stimulus : Stimulus) (actor : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (reachable : ParallelScopeCommandBoundaryReachable program before)
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (resumed : scopedWaitCompletionOwner program before stimulus actor)
    (committed : (admitStimulus program before stimulus).outcome = .committed) (fuel : Nat) :
    ParallelScopeOwnerFrame before
        (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 [] (admitStimulus program before stimulus).state).state actor ∨
      ∃ cut : ParallelScopeSingletonCut program (stimulusCommandId stimulus) fuel 1 0 [] (admitStimulus program before stimulus).state,
        ParallelScopeOwnerFrame before cut.before actor ∧
        cut.operation.kind ∈ [SemanticOperationKind.initiate, .enterParallelMultiInstanceScope, .completeParallelMultiInstanceScope, .completeScope] := by
  have stable : (deriveInternalExecutionFrontier program before).offers = [] ∧
      (deriveInternalExecutionFrontier program before).preparationFailed = false := by
    simpa using reachable.running_stable program selected before instanceId running
  exact closeScheduledTraced_owner_frame_or_exit program before _ actor
    (scoped_admission_owner_frame program before stimulus actor selected instanceId running resumed committed)
    (by simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected) instanceId running stable.1 stable.2
    (stimulusCommandId stimulus) fuel 1 0 []

/-- Scoped closure retains its body-phase invariant or supplies the resumed body’s retirement at an exact command prefix, with the actual suffix exposed by `ParallelScopeSingletonCut.continuation`. Stable discovery and preserved pending/live-body facts exclude reinitiation, another entry, root completion and foreign retirement without caller ownership or future-execution premises. -/
theorem ParallelScopeCommandBoundaryReachable.scoped_closure_exit_classification (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (entryBefore issued current : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .enterParallelMultiInstanceScope)
    (entered : replayInternalOperationOccurrence? program entryBefore record = some issued)
    (reachable : ParallelScopeCommandBoundaryReachable program current)
    (instanceId : SemanticId) (running : current.control = .running instanceId)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program current stimulus).outcome = .committed)
    (structural : ParallelScopeStructuralFrame record.owner current)
    (actor : ScopeOccurrenceId) (resumed : scopedWaitCompletionOwner program current stimulus actor) (fuel : Nat) :
    ParallelScopeOwnerFrame current
        (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 [] (admitStimulus program current stimulus).state).state actor ∨
      ∃ cut : ParallelScopeSingletonCut program (stimulusCommandId stimulus) fuel 1 0 [] (admitStimulus program current stimulus).state,
        ParallelScopeOwnerFrame current cut.before actor ∧
        cut.operation.kind = .completeParallelMultiInstanceScope ∧ cut.candidate.owner = actor := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  have stable : (deriveInternalExecutionFrontier program current).offers = [] ∧
      (deriveInternalExecutionFrontier program current).preparationFailed = false := by
    simpa using reachable.running_stable program selected current instanceId running
  rcases reachable.scoped_closure_owner_or_exit program current stimulus actor selected instanceId running resumed committed fuel with
    retained | ⟨cut, frame, phase⟩
  · exact Or.inl retained
  · have retirement : cut.operation.kind = .completeParallelMultiInstanceScope := by
      apply Classical.byContradiction
      intro outside
      have nonretirement : cut.operation.kind = .initiate ∨ cut.operation.kind = .enterParallelMultiInstanceScope ∨ cut.operation.kind = .completeScope := by
        simpa only [List.mem_cons, List.not_mem_nil, or_false, outside, false_or] using phase
      exact frame.nonretirement_exit_refused program analysis current cut.before cut.step.state actor profile analyzed
        (scopedWaitCompletionOwner_child program analysis current stimulus actor analyzed resumed)
        instanceId running stable.1 stable.2 cut.candidate cut.operation cut.resolved nonretirement cut.applied
    refine Or.inr ⟨cut, frame, retirement, ?_⟩
    obtain ⟨capacity, accepted⟩ := Option.isSome_iff_exists.mp
      (parallelScope_committed_resumption_capacity program analysis current stimulus selected analyzed completion committed)
    apply frame.retirement_operation_owner program analysis current cut.before cut.step.state actor
      (by simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected) analyzed ?_ cut.candidate cut.operation cut.resolved retirement cut.applied
    intro body present child
    obtain ⟨binding, bound⟩ := ParallelScopeStart.programStateCapacity_live_body_binding program analysis current
      capacity analyzed accepted body present child
    exact parallelScope_stable_resumption_body_nonquiescent program analysis selected analyzed entryBefore issued current
      record kind entered stimulus completion committed body.id binding structural bound stable.1 stable.2

end BpmnSemantics.SemanticProcess
