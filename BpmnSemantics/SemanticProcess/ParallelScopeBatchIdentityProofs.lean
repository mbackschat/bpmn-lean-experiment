module

public import BpmnSemantics.SemanticProcess.ParallelScopeBatchReadinessProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeFrontierCorrespondenceProofs

/-! PMIS-SELECT-01 reservation preserves the complete operation/owner sequence.
These laws derive identity from the actual singleton preparation calls retained by
the reservation trace, then connect accepted members to the current execution frontier.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

def memberCandidate (member : InternalOccurrencePatch) : InternalOperationOccurrence :=
  ⟨member.operation.id, member.owner⟩

private theorem prepared_token_owner (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (patch : InternalOccurrenceTokenPatch)
    (prepared : prepareOccurrenceTokenPatch? program state candidate = some patch) :
    patch.tokens.owner = candidate.owner := by
  cases control : state.control <;> simp only [prepareOccurrenceTokenPatch?, control] at prepared <;> try contradiction
  obtain ⟨operation, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  cases operation <;> simp only [bind, Option.bind_none] at prepared <;> try contradiction
  case' duplicate => split at prepared <;> try contradiction
  case' synchronize => split at prepared <;> try contradiction
  all_goals
    simp only [Option.bind_some, Option.pure_def] at prepared
    split at prepared <;> try contradiction
    split at prepared <;> try contradiction
    obtain ⟨_, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases Option.some.inj prepared
    rfl

private theorem prepared_arm_identity (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (activation : Nat) (patch : InternalArmingPatch)
    (prepared : prepareReservedOccurrenceArm? program state candidate activation = some patch) :
    memberCandidate (.arm patch) = candidate := by
  obtain ⟨runtimeId, operation, input, _, _, _, resolved, _, _, _, declaration, _, owned, _, _, _⟩ :=
    ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program state candidate activation patch prepared
  have key := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).2
  cases candidate
  simp_all only [memberCandidate, InternalOccurrencePatch.operation, InternalOccurrencePatch.owner]

private theorem prepared_token_identity (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (patch : InternalOccurrenceTokenPatch)
    (prepared : prepareOccurrenceTokenPatch? program state candidate = some patch) :
    memberCandidate (.token patch) = candidate := by
  have selected := (ParallelScopeReplay.prepareOccurrenceTokenPatch_application program state candidate patch prepared).2.1
  have key := (resolveInternalOperationOccurrence_declaration program state candidate patch.operation selected).2
  have owned := prepared_token_owner program state candidate patch prepared
  cases candidate
  simp_all only [memberCandidate, InternalOccurrencePatch.operation, InternalOccurrencePatch.owner]

/-- Each actual singleton reservation binds the appended member to the exact input candidate. -/
theorem reserveOccurrenceMembers_singleton_identity (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidate : InternalOperationOccurrence)
    (member : InternalOccurrencePatch)
    (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [member])) :
    ({ operationId := member.operation.id, owner := member.owner } : InternalOperationOccurrence) = candidate := by
  change memberCandidate member = candidate
  simp only [reserveOccurrenceMembers?] at step
  obtain ⟨operation, resolved, step⟩ := Option.bind_eq_some_iff.mp step
  cases operation
  case awaitUserTask id origin input output task =>
    obtain ⟨base, _, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨patch, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have last := List.append_cancel_left (Option.some.inj step)
    have same : InternalOccurrencePatch.arm patch = member := by simpa using congrArg List.head? last
    rw [← same]
    exact prepared_arm_identity program state candidate _ patch prepared
  case awaitEffect id origin input output effect route =>
    obtain ⟨base, _, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨patch, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have last := List.append_cancel_left (Option.some.inj step)
    have same : InternalOccurrencePatch.arm patch = member := by simpa using congrArg List.head? last
    rw [← same]
    exact prepared_arm_identity program state candidate _ patch prepared
  all_goals
    cases initial : prepareOccurrenceTokenPatch? program state candidate with
    | none => simp [initial] at step
    | some token =>
        simp only [initial, Functor.map, Option.map, bind, Option.bind_some] at step
        have last := List.append_cancel_left (Option.some.inj step)
        have same : InternalOccurrencePatch.token token = member := by simpa using congrArg List.head? last
        rw [← same]
        exact prepared_token_identity program state candidate token initial

/-- The actual reservation trace appends candidate identities in order, including distinct owners of one operation. -/
theorem OccurrenceReservationTrace.identities (program : Program) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members) :
    members.map (fun member => ({ operationId := member.operation.id, owner := member.owner } : InternalOperationOccurrence)) =
      reserved.map (fun member => ({ operationId := member.operation.id, owner := member.owner } : InternalOperationOccurrence)) ++ candidates := by
  change members.map memberCandidate = reserved.map memberCandidate ++ candidates
  induction trace with
  | nil => simp
  | @cons reserved candidate rest current final step tail ih =>
      have identity := reserveOccurrenceMembers_singleton_identity program state reserved candidate current step
      change memberCandidate current = candidate at identity
      simpa only [List.map_append, List.map_cons, List.map_nil, List.append_assoc,
        List.singleton_append, identity] using ih

/-- An accepted certificate's members carry exactly the identities of the complete occurrence discovery used to reserve them. -/
theorem prepareInternalOccurrenceBatch_member_candidates (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch) :
    ∃ offers, deriveInternalOccurrenceFrontier? program state = some offers ∧
      batch.members.map (fun member => ({ operationId := member.operation.id, owner := member.owner } : InternalOperationOccurrence)) =
        offers.map Prod.fst := by
  obtain ⟨_, _, _, _, _, _, _, _, offers, discovered, trace, _⟩ :=
    prepareInternalOccurrenceBatch_certificate program state batch prepared
  refine ⟨offers, discovered, ?_⟩
  simpa only [List.map_nil, List.nil_append] using
    trace.identities program state [] batch.members (offers.map Prod.fst)

/-- Accepted PMIS batch alternatives equal the literal current execution frontier, so execution's identity-alignment check requires no assumed equality. -/
theorem prepareInternalOccurrenceBatch_frontier_alternatives
    (program : Program) (state : RuntimeState) (instanceId : SemanticId) (batch : InternalOccurrenceBatch)
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (running : state.control = .running instanceId)
    (unique : (program.operations.map (fun operation => operation.id.value)).Nodup)
    (prepared : prepareInternalOccurrenceBatch? program state = some batch) :
    (deriveInternalExecutionFrontier program state).offers.map InternalExecutionOffer.alternative =
      batch.members.map (fun member => InternalAlternative.operationOccurrence member.operation.id member.owner) := by
  obtain ⟨offers, discovered, identities⟩ := prepareInternalOccurrenceBatch_member_candidates program state batch prepared
  have aligned := congrArg (fun candidates : List InternalOperationOccurrence =>
    candidates.map fun candidate => InternalAlternative.operationOccurrence candidate.operationId candidate.owner) identities
  simp only [List.map_map, Function.comp_def] at aligned
  exact (deriveInternalExecutionFrontier_occurrence_exact_order program state instanceId offers selected running unique discovered).trans aligned.symm

end BpmnSemantics.SemanticProcess.InternalCommutation
