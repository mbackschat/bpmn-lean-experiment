module

public import BpmnSemantics.SemanticProcess.TokenPatchLaws
public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
public import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws

/-! # Parallel batch reservation provenance

PMIS-SELECT-01 freezes slots using the preceding members of the same cohort.
The trace below retains the actual reservation calls and their accumulators;
it supplies provenance for prefix revalidation without assuming application succeeds.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive OccurrenceReservationTrace (program : Program) (state : RuntimeState) :
    List InternalOccurrencePatch → List InternalOperationOccurrence → List InternalOccurrencePatch → Prop where
  | nil (reserved : List InternalOccurrencePatch) : OccurrenceReservationTrace program state reserved [] reserved
  | cons {reserved : List InternalOccurrencePatch} {candidate : InternalOperationOccurrence}
      {rest : List InternalOperationOccurrence} {member : InternalOccurrencePatch} {final : List InternalOccurrencePatch}
      (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [member]))
      (tail : OccurrenceReservationTrace program state (reserved ++ [member]) rest final) :
      OccurrenceReservationTrace program state reserved (candidate :: rest) final

/-- Actual reservation retains each candidate in order with the exact preceding accumulator used to allocate its slot. -/
theorem reserveOccurrenceMembers_trace (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (members : List InternalOccurrencePatch)
    (accepted : reserveOccurrenceMembers? program state reserved candidates = some members) :
    OccurrenceReservationTrace program state reserved candidates members := by
  induction candidates generalizing reserved with
  | nil =>
      simp only [reserveOccurrenceMembers?] at accepted
      cases Option.some.inj accepted
      exact .nil _
  | cons candidate rest ih =>
      simp only [reserveOccurrenceMembers?] at accepted
      obtain ⟨operation, resolved, accepted⟩ := Option.bind_eq_some_iff.mp accepted
      cases operation
      case awaitUserTask id origin input output task =>
        obtain ⟨base, baseEq, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        simp only [bind, Option.bind_some, Option.pure_def] at accepted
        obtain ⟨patch, patchEq, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        refine .cons ?_ (ih (reserved ++ [.arm patch]) accepted)
        simp only [reserveOccurrenceMembers?, resolved, bind, Option.bind_some, baseEq, patchEq, Option.pure_def]
      case awaitEffect id origin input output effect route =>
        obtain ⟨base, baseEq, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        simp only [bind, Option.bind_some, Option.pure_def] at accepted
        obtain ⟨patch, patchEq, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        refine .cons ?_ (ih (reserved ++ [.arm patch]) accepted)
        simp only [reserveOccurrenceMembers?, resolved, bind, Option.bind_some, baseEq, patchEq, Option.pure_def]
      all_goals
        obtain ⟨member, prepared, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        refine .cons ?_ (ih (reserved ++ [member]) accepted)
        simp only [reserveOccurrenceMembers?, resolved, bind, Option.bind_some, prepared]

/-- Reservation appends exactly one member per discovered candidate, including repeated declaration IDs at distinct owners. -/
theorem OccurrenceReservationTrace.length (program : Program) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members) :
    members.length = reserved.length + candidates.length := by
  induction trace with
  | nil => simp
  | cons step tail ih =>
      simp only [List.length_append, List.length_cons, List.length_nil] at ih ⊢
      omega

/-- Successful preparation supplies the complete frozen certificate and its ordered reservation provenance, independently of later application. -/
theorem prepareInternalOccurrenceBatch_certificate (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch)
    (prepared : prepareInternalOccurrenceBatch? program state = some batch) :
    batch.program = program ∧ batch.predecessor = state ∧ occurrenceReservationStateValid state = true ∧
      2 ≤ batch.members.length ∧
      batch.members.Pairwise (fun left right => ∀ key ∈ left.tokenKeys, key ∉ right.tokenKeys) ∧
      (batch.members.filterMap (·.waitOccurrence?)).Nodup ∧
      (batch.members.filterMap (·.waitOccurrence?)).all (fun id => 0 < id.activation &&
        SemanticProcessJson.isSafeWireNat id.activation) = true ∧
      ((batch.members.map (·.endIncrement)).sum == 0 ||
        SemanticProcessJson.isSafeWireNat (state.endOccurrences + (batch.members.map (·.endIncrement)).sum)) = true ∧
      ∃ offers, deriveInternalOccurrenceFrontier? program state = some offers ∧
        OccurrenceReservationTrace program state [] (offers.map Prod.fst) batch.members ∧
        batch.members.length = offers.length := by
  unfold prepareInternalOccurrenceBatch? at prepared
  split at prepared
  · contradiction
  · rename_i valid
    obtain ⟨offers, discovered, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    obtain ⟨members, reserved, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    have trace := reserveOccurrenceMembers_trace program state [] (offers.map Prod.fst) members reserved
    have length := trace.length program state [] members (offers.map Prod.fst)
    unfold acceptOccurrenceBatch? at prepared
    dsimp only at prepared
    split at prepared
    · rename_i accepted
      cases Option.some.inj prepared
      have reservation : occurrenceReservationStateValid state = true := by
        cases validity : occurrenceReservationStateValid state <;> simp_all
      simp only [Bool.and_eq_true, decide_eq_true_eq] at accepted
      refine ⟨rfl, rfl, reservation, accepted.1.1.1.1, accepted.1.1.1.2,
        accepted.1.1.2, accepted.1.2, accepted.2, offers, discovered, trace, ?_⟩
      simpa using length
    · contradiction

/-- Reservation ancestry reads only the live scope population; raw patch token and wait edits cannot change it. -/
theorem occurrenceOwnerRootValid_scope_frame (program : Program) (before after : RuntimeState)
    (scopes : after.scopeOccurrences = before.scopeOccurrences) (fuel : Nat) (owner : ScopeOccurrenceId) :
    occurrenceOwnerRootValid program after fuel owner = occurrenceOwnerRootValid program before fuel owner := by
  induction fuel generalizing owner with
  | zero => rfl
  | succ fuel ih => simp only [occurrenceOwnerRootValid, scopes, ih]

/-- A raw reserved patch preserves every token bucket outside its declared keys, before any revalidation assumption. -/
theorem InternalOccurrencePatch.untouched_bucket (state : RuntimeState) (patch : InternalOccurrencePatch)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) (separate : (owner, place) ∉ patch.tokenKeys) :
    ((patch.apply state).tokens.filter fun token => token.placeId == place && token.owner == owner) =
      (state.tokens.filter fun token => token.placeId == place && token.owner == owner) := by
  let query := fun (token : ControlToken) => token.placeId == place && token.owner == owner
  have rejected (changedOwner : ScopeOccurrenceId) (changedPlace : ControlPlaceId)
      (different : (changedOwner, changedPlace) ≠ (owner, place)) :
      query { placeId := changedPlace, owner := changedOwner } = false := by
    apply Bool.eq_false_iff.mpr
    intro matched
    have both := Bool.and_eq_true_iff.mp matched
    exact different (Prod.ext (eq_of_beq both.2) (eq_of_beq both.1))
  cases patch with
  | arm arm =>
      have disjoint : (arm.owner, arm.input) ≠ (owner, place) := by
        intro same
        apply separate
        simp only [InternalOccurrencePatch.tokenKeys, List.mem_singleton]
        exact same.symm
      have frame := filter_removeToken_of_rejected state.tokens arm.input arm.owner query (rejected _ _ disjoint)
      cases write : arm.write <;> simpa only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write] using frame
  | token patch =>
      apply TokenPatch.filter_untouched
      all_goals
        intro changed present
        apply rejected
        intro same
        apply separate
        simp only [InternalOccurrencePatch.tokenKeys, List.mem_map]
        refine ⟨changed, ?_, same⟩
        simp [present]

/-- The complete raw prefix retains a later member's buckets by all-pairs certificate separation. -/
theorem rawOccurrencePrefix_untouched_bucket (state : RuntimeState) (prior : List InternalOccurrencePatch)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (separate : ∀ patch ∈ prior, (owner, place) ∉ patch.tokenKeys) :
    ((prior.foldl (fun before patch => patch.apply before) state).tokens.filter
      fun token => token.placeId == place && token.owner == owner) =
      (state.tokens.filter fun token => token.placeId == place && token.owner == owner) := by
  induction prior generalizing state with
  | nil => rfl
  | cons patch rest ih =>
      rw [List.foldl_cons, ih _ (fun member present => separate member (List.mem_cons_of_mem _ present))]
      exact patch.untouched_bucket state owner place (separate patch (by simp))

/-- Every accepted batch protects each later token read throughout the preceding raw patches. -/
theorem preparedOccurrenceBatch_prefix_bucket (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (prior rest : List InternalOccurrencePatch) (patch : InternalOccurrencePatch)
    (splitBatch : batch.members = prior ++ patch :: rest)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) (read : (owner, place) ∈ patch.tokenKeys) :
    ((prior.foldl (fun before member => member.apply before) state).tokens.filter
      fun token => token.placeId == place && token.owner == owner) =
      (state.tokens.filter fun token => token.placeId == place && token.owner == owner) := by
  have disjoint := (prepareInternalOccurrenceBatch_certificate program state batch prepared).2.2.2.2.1
  rw [splitBatch] at disjoint
  have cross := (List.pairwise_append.mp disjoint).2.2
  apply rawOccurrencePrefix_untouched_bucket
  intro earlier present collision
  exact cross earlier present patch (by simp) (owner, place) collision read

/-- Raw application charges exactly its declared End increment, independently of later revalidation. -/
theorem InternalOccurrencePatch.end_count (state : RuntimeState) (patch : InternalOccurrencePatch) :
    (patch.apply state).endOccurrences = state.endOccurrences + patch.endIncrement := by
  cases patch with
  | arm arm => cases write : arm.write <;> simp [InternalOccurrencePatch.apply, applyInternalArmingPatch,
      InternalOccurrencePatch.endIncrement, write]
  | token patch => rfl

/-- End headroom is accounted over every raw prefix, including intervening wait arms. -/
theorem rawOccurrencePrefix_end_count (state : RuntimeState) (prior : List InternalOccurrencePatch) :
    (prior.foldl (fun before patch => patch.apply before) state).endOccurrences =
      state.endOccurrences + (prior.map (·.endIncrement)).sum := by
  induction prior generalizing state with
  | nil => simp
  | cons patch rest ih =>
      rw [List.foldl_cons, ih, patch.end_count]
      simp only [List.map_cons, List.sum_cons, Nat.add_assoc]

/-- Collective acceptance reserves safe End headroom for each intermediate raw prefix, not only its final sum. -/
theorem preparedOccurrenceBatch_prefix_end_headroom (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (prior rest : List InternalOccurrencePatch) (patch : InternalOccurrencePatch)
    (splitBatch : batch.members = prior ++ patch :: rest) :
    (patch.endIncrement == 0 || SemanticProcessJson.isSafeWireNat
      ((prior.foldl (fun before member => member.apply before) state).endOccurrences + patch.endIncrement)) = true := by
  have headroom := (prepareInternalOccurrenceBatch_certificate program state batch prepared).2.2.2.2.2.2.2.1
  rw [splitBatch] at headroom
  simp only [List.map_append, List.map_cons, List.sum_append, List.sum_cons] at headroom
  rw [rawOccurrencePrefix_end_count]
  by_cases zero : patch.endIncrement = 0
  · simp [zero]
  · simp only [Bool.or_eq_true, beq_iff_eq, SemanticProcessJson.isSafeWireNat, decide_eq_true_eq] at headroom ⊢
    omega

/-- Accepted token preparation depends on its affected buckets and scope ancestry; safe End credit may increase across the prefix. -/
theorem prepareOccurrenceTokenPatch_read_frame (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (patch : InternalOccurrenceTokenPatch)
    (prepared : prepareOccurrenceTokenPatch? program before candidate = some patch)
    (control : after.control = before.control) (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (counts : ∀ place ∈ patch.tokens.consumed ++ patch.tokens.produced,
      (after.tokens.filter fun token => token.placeId == place && token.owner == patch.tokens.owner).length =
      (before.tokens.filter fun token => token.placeId == place && token.owner == patch.tokens.owner).length)
    (headroom : (patch.endIncrement == 0 || SemanticProcessJson.isSafeWireNat
      (after.endOccurrences + patch.endIncrement)) = true) :
    prepareOccurrenceTokenPatch? program after candidate = some patch := by
  cases running : before.control <;>
    simp only [prepareOccurrenceTokenPatch?, running] at prepared <;> try contradiction
  obtain ⟨operation, resolved, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  let consumed := patch.tokens.consumed
  let produced := patch.tokens.produced
  let selectedOperation := operation
  cases operation <;> simp only [bind, Option.bind_none] at prepared <;> try contradiction
  case' duplicate => split at prepared <;> try contradiction
  case' synchronize => split at prepared <;> try contradiction
  all_goals
    simp only [Option.bind_some, Option.pure_def] at prepared
    split at prepared <;> try contradiction
    rename_i accepted
    split at prepared <;> try contradiction
    rename_i buckets
    obtain ⟨delta, deltaEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases Option.some.inj prepared
    have allFrame (places : List ControlPlaceId)
        (inside : ∀ place ∈ places, place ∈ consumed ++ produced) (test : Nat → ControlPlaceId → Bool) :
        places.all (fun place => test (after.tokens.filter fun token =>
          token.placeId == place && token.owner == candidate.owner).length place) =
        places.all (fun place => test (before.tokens.filter fun token =>
          token.placeId == place && token.owner == candidate.owner).length place) := by
      induction places with
      | nil => rfl
      | cons place rest ih =>
          rw [List.all_cons, List.all_cons, counts place (inside place (by simp)),
            ih (fun item present => inside item (List.mem_cons_of_mem _ present))]
    have units := allFrame consumed (fun place present => List.mem_append_left _ present)
      (fun count _ => count == 1)
    have bounds := allFrame (consumed ++ produced) (fun _ present => present)
      (fun count place => SemanticProcessJson.isSafeWireNat count &&
        SemanticProcessJson.isSafeWireNat (count - consumed.count place + produced.count place))
    have ancestry := occurrenceOwnerRootValid_scope_frame program before after scopes
      (before.scopeOccurrences.length + 1) candidate.owner
    have resolveFrame : resolveInternalOperationOccurrence? program after candidate = some selectedOperation := by
      simpa only [resolveInternalOperationOccurrence?, internalOperationOccurrences?, scopes] using resolved
    simp only [prepareOccurrenceTokenPatch?, control, running, resolveFrame, bind, Option.bind_some,
      Option.pure_def, selectedOperation, exactLiveOccurrence, scopes, time, ancestry]
    simp only [exactLiveOccurrence] at accepted
    simp_all only [Bool.or_eq_true, Bool.not_eq_true, not_or, Bool.false_eq_true,
      ite_false, bind, Option.bind_some, Option.pure_def, consumed, produced]
    all_goals simp_all

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

private theorem singleton_reservation_token (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidate : InternalOperationOccurrence)
    (patch : InternalOccurrenceTokenPatch)
    (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [.token patch])) :
    prepareOccurrenceTokenPatch? program state ⟨patch.operation.id, patch.tokens.owner⟩ = some patch := by
  simp only [reserveOccurrenceMembers?] at step
  obtain ⟨operation, resolved, step⟩ := Option.bind_eq_some_iff.mp step
  cases operation
  case awaitUserTask id origin input output task =>
    obtain ⟨base, _, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨arm, _, step⟩ := Option.bind_eq_some_iff.mp step
    have last := List.append_cancel_left (Option.some.inj step)
    cases (List.cons.inj last).1
  case awaitEffect id origin input output effect route =>
    obtain ⟨base, _, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨arm, _, step⟩ := Option.bind_eq_some_iff.mp step
    have last := List.append_cancel_left (Option.some.inj step)
    cases (List.cons.inj last).1
  all_goals
    cases initial : prepareOccurrenceTokenPatch? program state candidate with
    | none => simp [initial] at step
    | some token =>
        simp only [initial, Functor.map, Option.map, bind, Option.bind_some] at step
        have last := List.append_cancel_left (Option.some.inj step)
        have same : token = patch := by simpa using congrArg List.head? last
        subst token
        have selected := (ParallelScopeReplay.prepareOccurrenceTokenPatch_application program state candidate patch initial).2.1
        have key := (resolveInternalOperationOccurrence_declaration program state candidate patch.operation selected).2
        have owned := prepared_token_owner program state candidate patch initial
        have candidateEq : candidate = ⟨patch.operation.id, patch.tokens.owner⟩ := by
          cases candidate
          simp_all
        simpa only [candidateEq] using initial

/-- Every newly reserved token member carries its actual frozen preparation at its canonical operation/owner candidate. -/
theorem OccurrenceReservationTrace.token_prepared (program : Program) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members)
    (patch : InternalOccurrenceTokenPatch) (member : .token patch ∈ members) :
    .token patch ∈ reserved ∨
      prepareOccurrenceTokenPatch? program state ⟨patch.operation.id, patch.tokens.owner⟩ = some patch := by
  induction trace with
  | nil => exact Or.inl member
  | @cons reserved candidate rest current final step tail ih =>
    rcases ih member with present | prepared
    · rcases List.mem_append.mp present with old | fresh
      · exact Or.inl old
      · have same : InternalOccurrencePatch.token patch = current := by simpa using fresh
        exact Or.inr (singleton_reservation_token program state reserved candidate patch (same ▸ step))
    · exact Or.inr prepared

/-- Raw reserved prefixes retain token preparation's shared control, scope and logical-time reads. -/
theorem rawOccurrencePrefix_token_read_frame (state : RuntimeState) (prior : List InternalOccurrencePatch) :
    (prior.foldl (fun before patch => patch.apply before) state).control = state.control ∧
    (prior.foldl (fun before patch => patch.apply before) state).scopeOccurrences = state.scopeOccurrences ∧
    (prior.foldl (fun before patch => patch.apply before) state).logicalTimeMs = state.logicalTimeMs := by
  induction prior generalizing state with
  | nil => exact ⟨rfl, rfl, rfl⟩
  | cons patch rest ih =>
    obtain ⟨control, scopes, time⟩ := ih (patch.apply state)
    have fields := patch.retirement_frame state
    have timeFrame : (patch.apply state).logicalTimeMs = state.logicalTimeMs := by
      cases patch with
      | token => rfl
      | arm arm => cases write : arm.write <;> simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]
    exact ⟨control.trans fields.1, scopes.trans fields.2.1, time.trans timeFrame⟩

/-- Accepted all-pairs separation and collective End credit keep every token member preparable after its actual raw prefix. -/
theorem preparedOccurrenceBatch_prefix_token (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (prior rest : List InternalOccurrencePatch) (patch : InternalOccurrenceTokenPatch)
    (splitBatch : batch.members = prior ++ .token patch :: rest) :
    prepareOccurrenceTokenPatch? program (prior.foldl (fun before member => member.apply before) state)
      ⟨patch.operation.id, patch.tokens.owner⟩ = some patch := by
  obtain ⟨_, _, _, _, _, _, _, _, offers, _, trace, _⟩ := prepareInternalOccurrenceBatch_certificate program state batch prepared
  have present : InternalOccurrencePatch.token patch ∈ batch.members := by rw [splitBatch]; simp
  have initial := (trace.token_prepared program state [] batch.members (offers.map Prod.fst) patch present).resolve_left (by simp)
  obtain ⟨control, scopes, time⟩ := rawOccurrencePrefix_token_read_frame state prior
  apply prepareOccurrenceTokenPatch_read_frame program state _ _ patch initial control scopes time
  · intro place included
    apply congrArg List.length
    exact preparedOccurrenceBatch_prefix_bucket program state batch prepared prior rest (.token patch) splitBatch
      patch.tokens.owner place (by simp only [InternalOccurrencePatch.tokenKeys, List.mem_map]; exact ⟨place, included, rfl⟩)
  · exact preparedOccurrenceBatch_prefix_end_headroom program state batch prepared prior rest (.token patch) splitBatch

private theorem prepared_arm_canonical (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (activation : Nat) (arm : InternalArmingPatch)
    (prepared : prepareReservedOccurrenceArm? program state candidate activation = some arm) :
    arm.write.occurrence.activation = activation ∧
      prepareReservedOccurrenceArm? program state ⟨arm.operation.id, arm.owner⟩ activation = some arm := by
  obtain ⟨runtimeId, operation, input, _, _, _, resolved, _, _, _, declaration, _, owned, shape, _, _⟩ :=
    ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program state candidate activation arm prepared
  have key := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).2
  have candidateEq : candidate = ⟨arm.operation.id, arm.owner⟩ := by cases candidate; simp_all
  refine ⟨?_, by simpa only [candidateEq] using prepared⟩
  cases operation <;> simp only [ParallelScopeReplay.ReservedArmWriteShape] at shape <;> try contradiction
  case awaitUserTask => simp only [shape, InternalArmingWrite.occurrence, userTaskWaitOccurrence]
  case awaitEffect =>
    obtain ⟨arguments, _, write⟩ := shape
    simp only [write, InternalArmingWrite.occurrence, effectWaitOccurrence]

private theorem singleton_reservation_arm (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidate : InternalOperationOccurrence) (arm : InternalArmingPatch)
    (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [.arm arm])) :
    0 < arm.write.occurrence.activation ∧ prepareReservedOccurrenceArm? program state
      ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation = some arm := by
  simp only [reserveOccurrenceMembers?] at step
  obtain ⟨operation, resolved, step⟩ := Option.bind_eq_some_iff.mp step
  cases operation
  case awaitUserTask id origin input output task =>
    obtain ⟨base, _, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨created, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have last := List.append_cancel_left (Option.some.inj step)
    have same : created = arm := by simpa using congrArg List.head? last
    subst created
    obtain ⟨allocation, canonical⟩ := prepared_arm_canonical program state candidate _ arm prepared
    exact ⟨by omega, by simpa only [allocation] using canonical⟩
  case awaitEffect id origin input output effect route =>
    obtain ⟨base, _, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨created, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have last := List.append_cancel_left (Option.some.inj step)
    have same : created = arm := by simpa using congrArg List.head? last
    subst created
    obtain ⟨allocation, canonical⟩ := prepared_arm_canonical program state candidate _ arm prepared
    exact ⟨by omega, by simpa only [allocation] using canonical⟩
  all_goals
    cases initial : prepareOccurrenceTokenPatch? program state candidate with
    | none => simp [initial] at step
    | some token =>
        simp only [initial, Functor.map, Option.map, bind, Option.bind_some] at step
        have last := List.append_cancel_left (Option.some.inj step)
        cases (List.cons.inj last).1

/-- Every newly reserved arm retains its actual canonical frozen preparation and positive allocation. -/
theorem OccurrenceReservationTrace.arm_prepared (program : Program) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members)
    (arm : InternalArmingPatch) (member : .arm arm ∈ members) :
    .arm arm ∈ reserved ∨ (0 < arm.write.occurrence.activation ∧ prepareReservedOccurrenceArm? program state
      ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation = some arm) := by
  induction trace with
  | nil => exact Or.inl member
  | @cons reserved candidate rest current final step tail ih =>
    rcases ih member with present | prepared
    · rcases List.mem_append.mp present with old | fresh
      · exact Or.inl old
      · have same : InternalOccurrencePatch.arm arm = current := by simpa using fresh
        exact Or.inr (singleton_reservation_arm program state reserved candidate arm (same ▸ step))
    · exact Or.inr prepared

/-- Accepted arm members retain safe positive canonical preparation and a well-formed Human or Service declaration before prefix transport. -/
theorem preparedOccurrenceBatch_arm_provenance (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (wellFormed : programWellFormed program = true) (prior rest : List InternalOccurrencePatch) (arm : InternalArmingPatch)
    (splitBatch : batch.members = prior ++ .arm arm :: rest) :
    prepareReservedOccurrenceArm? program state ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation = some arm ∧
      0 < arm.write.occurrence.activation ∧ SemanticProcessJson.isSafeWireNat arm.write.occurrence.activation = true ∧
      arm.write.elementId.value.isEmpty = false ∧ arm.operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect] := by
  obtain ⟨_, _, _, _, _, _, _, _, offers, _, trace, _⟩ := prepareInternalOccurrenceBatch_certificate program state batch prepared
  have present : InternalOccurrencePatch.arm arm ∈ batch.members := by rw [splitBatch]; simp
  obtain ⟨positive, initial⟩ := (trace.arm_prepared program state [] batch.members (offers.map Prod.fst) arm present).resolve_left (by simp)
  generalize allocated : arm.write.occurrence.activation = activation at initial
  obtain ⟨runtimeId, operation, input, _, _, safe, resolved, _, _, _, declaration, _, _, shape, _, _⟩ :=
    ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program state ⟨arm.operation.id, arm.owner⟩
      activation arm initial
  have member := (resolveInternalOperationOccurrence_declaration program state _ operation resolved).1
  have nonempty := programWellFormed_internalArm_element_nonempty program operation wellFormed member
  refine ⟨initial, by simpa only [allocated] using positive, safe, ?_, ?_⟩
  all_goals cases operation <;> simp only [ParallelScopeReplay.ReservedArmWriteShape] at shape <;> try contradiction
  case awaitUserTask => simpa only [shape, InternalArmingWrite.elementId, Bool.not_eq_true'] using nonempty
  case awaitEffect =>
    obtain ⟨arguments, _, write⟩ := shape
    simpa only [write, InternalArmingWrite.elementId, Bool.not_eq_true'] using nonempty
  all_goals simp [declaration, SemanticOperation.kind]

/-- PMIS-SELECT-01 counts a shared element/family cohort, without partitioning its counter by owner. -/
def reservedCohortSize (members : List InternalOccurrencePatch)
    (kind : InternalWaitKind) (element : String) : Nat :=
  (members.filter fun member => match member with
    | .arm patch => patch.write.kind == kind && patch.write.elementId.value == element
    | .token _ => false).length

/-- Actual reservation assigns the next slot in the shared element/family cohort, independent of body ownership. -/
theorem singleton_reservation_arm_allocation (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidate : InternalOperationOccurrence) (arm : InternalArmingPatch)
    (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [.arm arm])) :
    match arm.write with
    | .userTask wait => wait.activation = activationCount state wait.task.id +
        reservedCohortSize reserved .userTask wait.task.id.value + 1
    | .effect wait _ => wait.activation = effectActivationCount state wait.elementId +
        reservedCohortSize reserved .effect wait.elementId.value + 1
    | _ => False := by
  simp only [reserveOccurrenceMembers?] at step
  obtain ⟨operation, resolved, step⟩ := Option.bind_eq_some_iff.mp step
  cases operation
  case awaitUserTask id origin input output task =>
    obtain ⟨base, baseEq, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨created, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have same : created = arm := by
      simpa using congrArg List.head? (List.append_cancel_left (Option.some.inj step))
    subst created
    obtain ⟨runtimeId, actual, _, _, _, _, selected, _, _, _, _, _, _, shape, _, _⟩ :=
      ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program state candidate _ arm prepared
    have sameOperation := Option.some.inj (selected.symm.trans resolved)
    rw [sameOperation] at shape
    change (if !occurrenceCounterRowsValid (state.activations.map fun row => (row.taskId.value, row.count))
      then none else some ((((state.activations.map fun row => (row.taskId.value, row.count)).find?
        (·.1 == task.id.value)).map Prod.snd).getD 0)) = some base at baseEq
    split at baseEq
    · contradiction
    · have baseValue : activationCount state task.id = base := by
        simpa only [taskActivationCount_string_lookup, activationCount] using Option.some.inj baseEq
      simp only [ParallelScopeReplay.ReservedArmWriteShape] at shape
      simp only [shape]
      rw [baseValue]
      unfold reservedCohortSize
      congr 3
  case awaitEffect id origin input output effect route =>
    obtain ⟨base, baseEq, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨created, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have same : created = arm := by
      simpa using congrArg List.head? (List.append_cancel_left (Option.some.inj step))
    subst created
    obtain ⟨runtimeId, actual, _, _, _, _, selected, _, _, _, _, _, _, shape, _, _⟩ :=
      ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program state candidate _ arm prepared
    have sameOperation := Option.some.inj (selected.symm.trans resolved)
    rw [sameOperation] at shape
    change (if !occurrenceCounterRowsValid (state.effectActivations.map fun row => (row.elementId.value, row.count))
      then none else some ((((state.effectActivations.map fun row => (row.elementId.value, row.count)).find?
        (·.1 == effect.elementId.value)).map Prod.snd).getD 0)) = some base at baseEq
    split at baseEq
    · contradiction
    · have baseValue : effectActivationCount state effect.elementId = base := by
        simpa only [effectActivationCount_string_lookup] using Option.some.inj baseEq
      obtain ⟨arguments, _, write⟩ := shape
      simp only [write]
      rw [baseValue]
      unfold reservedCohortSize
      congr 3
  all_goals
    cases initial : prepareOccurrenceTokenPatch? program state candidate with
    | none => simp [initial] at step
    | some token =>
      simp only [initial, Functor.map, Option.map, bind, Option.bind_some] at step
      cases (List.cons.inj (List.append_cancel_left (Option.some.inj step))).1

/-- PMIS-SELECT-01 relates raw prefix counters to their shared reservation cohorts, before readiness is established. -/
def ReservationCountersAgree (state : RuntimeState) (reserved : List InternalOccurrencePatch) : Prop :=
  let current := reserved.foldl (fun before patch => patch.apply before) state
  (∀ task, activationCount current task = activationCount state task +
    reservedCohortSize reserved .userTask task.value) ∧
  (∀ element, effectActivationCount current element = effectActivationCount state element +
    reservedCohortSize reserved .effect element.value)

private theorem singleton_reservation_counters (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidate : InternalOperationOccurrence)
    (member : InternalOccurrencePatch)
    (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [member]))
    (before : ReservationCountersAgree state reserved) :
    ReservationCountersAgree state (reserved ++ [member]) := by
  let current := reserved.foldl (fun before patch => patch.apply before) state
  change (∀ task, activationCount current task = _) ∧
    (∀ element, effectActivationCount current element = _) at before
  unfold ReservationCountersAgree
  simp only [List.foldl_append, List.foldl_cons, List.foldl_nil]
  change (∀ task, activationCount (member.apply current) task = _) ∧
    (∀ element, effectActivationCount (member.apply current) element = _)
  cases member with
  | token patch =>
      simpa only [InternalOccurrencePatch.apply, activationCount, effectActivationCount,
        reservedCohortSize, List.filter_append, List.filter_cons, List.filter_nil,
        Bool.false_eq_true, ↓reduceIte, List.length_append, List.length_nil, Nat.add_zero] using before
  | arm arm =>
      have allocated := singleton_reservation_arm_allocation program state reserved candidate arm step
      cases write : arm.write with
      | message wait => simp [write] at allocated
      | timer wait => simp [write] at allocated
      | userTask wait =>
          simp only [write] at allocated
          simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]
          constructor
          · intro task
            by_cases same : task = wait.task.id
            · subst task
              change activationCount { current with activations := setActivationCount current.activations wait.task.id wait.activation } wait.task.id = _
              rw [activationCount_setActivationCount_self, allocated]
              simp [reservedCohortSize, List.filter_append, write,
                InternalArmingWrite.kind, InternalArmingWrite.elementId, Nat.add_assoc]
            · have different : wait.task.id.value ≠ task.value :=
                fun equal => same (taskDefinitionId_eq_of_value_eq _ _ equal.symm)
              change activationCount { current with activations := setActivationCount current.activations wait.task.id wait.activation } task = _
              rw [activationCount_setActivationCount_other _ _ _ _ same, before.1]
              simp [reservedCohortSize, List.filter_append, write,
                InternalArmingWrite.kind, InternalArmingWrite.elementId, different]
          · intro element
            change effectActivationCount current element = _
            rw [before.2]
            simp [reservedCohortSize, List.filter_append, write,
              InternalArmingWrite.kind, InternalArmingWrite.elementId]
      | effect wait bindings =>
          simp only [write] at allocated
          simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]
          constructor
          · intro task
            change activationCount current task = _
            rw [before.1]
            simp [reservedCohortSize, List.filter_append, write,
              InternalArmingWrite.kind, InternalArmingWrite.elementId]
          · intro element
            by_cases same : element = wait.elementId
            · subst element
              change effectActivationCount { current with effectActivations := setEffectActivationCount current.effectActivations wait.elementId wait.activation } wait.elementId = _
              rw [effectActivationCount_set_self, allocated]
              simp [reservedCohortSize, List.filter_append, write,
                InternalArmingWrite.kind, InternalArmingWrite.elementId, Nat.add_assoc]
            · have different : wait.elementId.value ≠ element.value := by
                intro equal
                exact same (congrArg NodeId.mk equal.symm)
              change effectActivationCount { current with effectActivations := setEffectActivationCount current.effectActivations wait.elementId wait.activation } element = _
              rw [effectActivationCount_set_other _ _ _ _ same, before.2]
              simp [reservedCohortSize, List.filter_append, write,
                InternalArmingWrite.kind, InternalArmingWrite.elementId, different]

/-- Every actual reservation trace transports cohort counters through raw application without assuming readiness. -/
theorem OccurrenceReservationTrace.counters (program : Program) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members)
    (before : ReservationCountersAgree state reserved) : ReservationCountersAgree state members := by
  induction trace with
  | nil => exact before
  | cons step tail ih => exact ih (singleton_reservation_counters program state _ _ _ step before)

private theorem OccurrenceReservationTrace.extends (program : Program) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members) :
    ∃ suffix, members = reserved ++ suffix := by
  induction trace with
  | nil => exact ⟨[], by simp⟩
  | @cons reserved candidate rest member final step tail ih =>
      obtain ⟨suffix, same⟩ := ih
      exact ⟨member :: suffix, by simpa only [List.append_assoc, List.singleton_append] using same⟩

/-- PMIS-SELECT-01's frozen prefix is itself the corresponding initial segment of the actual reservation trace. -/
theorem OccurrenceReservationTrace.take (program : Program) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members) (count : Nat) :
    OccurrenceReservationTrace program state reserved (candidates.take count)
      (members.take (reserved.length + count)) := by
  induction trace generalizing count with
  | nil accumulated =>
      rw [List.take_of_length_le (Nat.le_add_right _ _)]
      simpa using OccurrenceReservationTrace.nil (program := program) (state := state) accumulated
  | @cons reserved candidate rest member final step tail ih =>
      cases count with
      | zero =>
          obtain ⟨suffix, same⟩ := (OccurrenceReservationTrace.cons step tail).extends program state reserved final (candidate :: rest)
          rw [same]
          simpa using OccurrenceReservationTrace.nil (program := program) (state := state) reserved
      | succ count =>
          simpa [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm] using OccurrenceReservationTrace.cons step (ih count)

/-- Successful preparation alone fixes the Human/Service counters after raw batch application. -/
theorem preparedOccurrenceBatch_raw_counters (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch) :
    ReservationCountersAgree state batch.members := by
  obtain ⟨_, _, _, _, _, _, _, _, offers, _, trace, _⟩ :=
    prepareInternalOccurrenceBatch_certificate program state batch prepared
  apply trace.counters program state [] batch.members (offers.map Prod.fst)
  simp [ReservationCountersAgree, reservedCohortSize]

/-- Accepted reservation fixes both task-family counters at every raw prefix, without successful application as a premise. -/
theorem preparedOccurrenceBatch_prefix_counters (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (count : Nat) : ReservationCountersAgree state (batch.members.take count) := by
  obtain ⟨_, _, _, _, _, _, _, _, offers, _, trace, _⟩ :=
    prepareInternalOccurrenceBatch_certificate program state batch prepared
  have initialTrace := trace.take program state [] batch.members (offers.map Prod.fst) count
  simp only [List.length_nil, Nat.zero_add] at initialTrace
  apply initialTrace.counters program state [] (batch.members.take count) ((offers.map Prod.fst).take count)
  simp [ReservationCountersAgree, reservedCohortSize]

end BpmnSemantics.SemanticProcess.InternalCommutation
