import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.CollectionOrder

/-! # Activity body turnover

Replacing what an Activity occurrence owns without replacing the occurrence. The contract is
[the ownership specification](../../docs/ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md), rules `AOO-TURNOVER-02`
through `AOO-TURNOVER-04`.

The operation is whole-state by requirement rather than convenience. Between withdrawing the outgoing
body and arming the incoming one there is a state whose record names a wait that is not live, which
`activityRecordsOwnLiveWork` rejects; exposing that intermediate would make the preservation law below
vacuous on its own hypothesis, since no well-formed pre-state would reach it.

No registered profile admits a construct that drives this. It is the representation a later repetition
capsule defines transitions over, and it is introduced here because approving it is what makes the
ownership record's value checkable: after one replacement a body's activation and its attached
handler's diverge, and that pair is what every join this account retired was keyed on.

The frame result is the one to read first. Replacement is a `List.map` that rewrites one field, so the
canonical order key — Process instance, Activity element, activation — is untouched by construction
rather than restored by a re-sort, and `RSI-ORDER-01` follows from the frame rather than needing its
own argument.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Everything about a record that replacement must leave alone.

Bundled rather than stated field by field so one equation carries the whole `AOO-TURNOVER-03`
obligation, and so the canonical order key is visibly a projection of it. -/
def activityOccurrenceFrame (record : ActivityOccurrence) :
    SemanticId × NodeId × Nat × ScopeOccurrenceId × List OccurrenceId :=
  (record.processInstanceId, record.activityElementId, record.activation,
    record.owner, record.attachedTimers)

/-- Rewrites one record's body, leaving every other record and every framed field alone. -/
def replaceBodyIn (records : List ActivityOccurrence) (target : ActivityOccurrence)
    (incoming : OccurrenceId) : List ActivityOccurrence :=
  records.map fun candidate =>
    if sameActivityOccurrence candidate target then
      { candidate with body := .userTask incoming }
    else candidate

/-- The wait the replacement arms: the outgoing one at the next activation of its own element. -/
def turnoverWait (state : RuntimeState) (wait : UserTaskWait) : UserTaskWait :=
  { wait with activation := activationCount state wait.task.id + 1 }

/-- The occurrence identity the incoming body takes. Named so the laws below can speak about it
without restating a five-field literal at every use. -/
def turnoverBodyId (state : RuntimeState) (wait : UserTaskWait) (body : OccurrenceId) :
    OccurrenceId :=
  { processInstanceId := body.processInstanceId
    elementId := body.elementId
    activation := activationCount state wait.task.id + 1 }

/-- The state rewrite itself, once the outgoing wait and body have been resolved.

Split from the resolver below so the preservation law has a target whose hypotheses are visible.
Every field this touches is named here; the four conjuncts that read none of them are settled by
definitional congruence rather than by an argument. -/
def replacedState (state : RuntimeState) (record : ActivityOccurrence)
    (wait : UserTaskWait) (body : OccurrenceId) : RuntimeState :=
  { state with
    waits := insertUserTaskWait (turnoverWait state wait)
      (state.waits.filter fun candidate => !taskIdNamesWait body candidate)
    activations := setActivationCount state.activations wait.task.id
      (activationCount state wait.task.id + 1)
    activityOccurrences := replaceBodyIn state.activityOccurrences record
      (turnoverBodyId state wait body) }

/-- Replaces a task-bodied Activity occurrence's body with a fresh occurrence of the same element.

Answers `none` rather than a repaired state outside the shape this operation is defined on, which is a
record this state holds naming exactly one live task body. Each refusal excludes a different incoherent
result: without the unique live body a caller would arm a second body against a record still naming the
first, and without the state holding the record the rewrite below matches nothing, so the outgoing wait
would be withdrawn and a successor armed while no record names either. The guard's comparison is `replaceBodyIn`'s own,
in the same argument order, so it admits exactly the records that rewrite without resting on an
unstated symmetry.

The incoming wait carries the outgoing wait's definition and output because both describe the same
program element, so nothing here reads the `Program` and the operation stays total over runtime state
alone. A capsule that varies those per iteration supplies them at its own boundary.

The Activity's own counter is deliberately untouched: the occurrence is not re-armed, so advancing it
would mint an identity no record claims. That is `AOO-TURNOVER-04`, and it is the whole source of the
divergence this capsule exists to make checkable. -/
def replaceActivityBodyTask (state : RuntimeState) (record : ActivityOccurrence) :
    Option RuntimeState :=
  match activityBodyTask? record with
  | none => none
  | some body =>
    if state.activityOccurrences.any (fun candidate => sameActivityOccurrence candidate record) then
      match state.waits.filter (taskIdNamesWait body) with
      | [wait] => some (replacedState state record wait body)
      | _ => none
    else none

/-- Any view of a record that ignores its body is unchanged by replacement.

The general form of `AOO-TURNOVER-03`. Stating it over an arbitrary `key` rather than over the frame
tuple alone is what lets the well-formedness conjuncts reuse it: each of them reads records through a
different projection, and every one of those projections ignores the body. -/
theorem replaceBodyIn_map_of_frame {β : Type} (key : ActivityOccurrence → β)
    (frameOnly : ∀ (record : ActivityOccurrence) (incoming : OccurrenceId),
      key { record with body := .userTask incoming } = key record) :
    ∀ (records : List ActivityOccurrence) (target : ActivityOccurrence)
      (incoming : OccurrenceId),
      (replaceBodyIn records target incoming).map key = records.map key := by
  intro records target incoming
  induction records with
  | nil => rfl
  | cons current rest ih =>
    simp only [replaceBodyIn, List.map_cons] at *
    by_cases h : sameActivityOccurrence current target = true
    · simp [h, frameOnly, ih]
    · simp only [Bool.not_eq_true] at h
      simp [h, ih]

/-- The same, for a count: a body-blind predicate selects the same number of records. -/
theorem replaceBodyIn_countP_of_frame (p : ActivityOccurrence → Bool)
    (frameOnly : ∀ (record : ActivityOccurrence) (incoming : OccurrenceId),
      p { record with body := .userTask incoming } = p record) :
    ∀ (records : List ActivityOccurrence) (target : ActivityOccurrence)
      (incoming : OccurrenceId),
      (replaceBodyIn records target incoming).countP p = records.countP p := by
  intro records target incoming
  induction records with
  | nil => rfl
  | cons current rest ih =>
    simp only [replaceBodyIn, List.map_cons, List.countP_cons] at *
    by_cases h : sameActivityOccurrence current target = true
    · simp [h, frameOnly, ih]
    · simp only [Bool.not_eq_true] at h
      simp [h, ih]

/-- `AOO-TURNOVER-03`: replacement preserves every record's identity, owner, and attached handlers.

Quantified over the whole collection rather than the rewritten record alone, which is what makes it
usable: the canonical order key is a projection of the frame, so order preservation is a corollary
instead of a separate induction, and a handler armed before a replacement is the same handler
occurrence after it with its deadline unchanged. -/
theorem replaceBodyIn_preserves_frame (records : List ActivityOccurrence)
    (target : ActivityOccurrence) (incoming : OccurrenceId) :
    (replaceBodyIn records target incoming).map activityOccurrenceFrame =
      records.map activityOccurrenceFrame :=
  replaceBodyIn_map_of_frame activityOccurrenceFrame (fun _ _ => rfl) records target incoming

/-- Replacement changes the length of no collection it rewrites. -/
theorem replaceBodyIn_length (records : List ActivityOccurrence)
    (target : ActivityOccurrence) (incoming : OccurrenceId) :
    (replaceBodyIn records target incoming).length = records.length := by
  simp [replaceBodyIn]

/-! ## What replacement does not read

Four of the twelve well-formedness conjuncts read none of the three collections replacement rewrites,
so they are preserved definitionally. Stating them is what lets the main proof discharge a third of
its obligations without an argument, and it records which conjuncts a future body arm would newly
have to reason about. -/

theorem runtimePositionValid_replacedState (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (record : ActivityOccurrence) (wait : UserTaskWait)
    (body : OccurrenceId) :
    runtimePositionValid program instanceId (replacedState state record wait body) =
      runtimePositionValid program instanceId state := rfl

theorem eventRaceAssociationsValid_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId) :
    eventRaceAssociationsValid (replacedState state record wait body) =
      eventRaceAssociationsValid state := rfl

theorem effectIncidentAssociationsValid_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId) :
    effectIncidentAssociationsValid (replacedState state record wait body) =
      effectIncidentAssociationsValid state := rfl

theorem hiddenRecordDeclarationsValid_replacedState (program : Program) (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId) :
    hiddenRecordDeclarationsValid program (replacedState state record wait body) =
      hiddenRecordDeclarationsValid program state := rfl

/-! ## The record-side conjuncts

Both read records through a body-blind projection, so each is a specialisation of the keyed frame law
rather than an argument of its own. `attachedTimersUnambiguous` counts records per Timer wait and
`activityIdentitiesUnique` counts records per identity; replacement changes neither count.
-/

/-- `AOO-ATTACH-01` survives replacement: the attached list is framed, so no Timer changes claimant. -/
theorem attachedTimersUnambiguous_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId) :
    attachedTimersUnambiguous (replacedState state record wait body) =
      attachedTimersUnambiguous state := by
  simp only [attachedTimersUnambiguous, replacedState]
  congr 1
  funext timer
  simp only [← List.countP_eq_length_filter]
  rw [replaceBodyIn_countP_of_frame _ (fun _ _ => rfl)]

/-- `AOO-ID-01` survives replacement: the identity triple is framed. -/
theorem activityIdentitiesUnique_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId) :
    activityIdentitiesUnique (replacedState state record wait body) =
      activityIdentitiesUnique state := by
  simp only [activityIdentitiesUnique, replacedState]
  exact all_occursOnce_of_map_eq
    (fun candidate => (candidate.processInstanceId, candidate.activityElementId,
      candidate.activation))
    sameActivityOccurrence
    (fun left right => left.1 == right.1 && left.2.1 == right.2.1 && left.2.2 == right.2.2)
    (fun _ _ => rfl)
    _ _
    (replaceBodyIn_map_of_frame _ (fun _ _ => rfl) _ _ _)

/-! ## The wait-side conjuncts

Replacement withdraws one wait and arms another that differs from it in `activation` alone. Every
conjunct that reads waits reads them through fields that difference leaves alone, so each reduces to
the same two steps: the inserted wait satisfies the predicate because the withdrawn one did, and
filtering cannot break a check that already held of every element.

`wait ∈ state.waits` is the hypothesis that makes the first step available. `replacedState` takes the
outgoing wait as a parameter, so nothing in its type says the wait was live; the resolver supplies
that, and the law states it rather than assuming it.
-/

/-- `RSI-OWN-*` for waits: the incoming wait inherits its owner, so no owner check changes. -/
theorem waitOwnersLive_replacedState (state : RuntimeState) (record : ActivityOccurrence)
    (wait : UserTaskWait) (body : OccurrenceId) (waitMem : wait ∈ state.waits)
    (holds : waitOwnersLive state = true) :
    waitOwnersLive (replacedState state record wait body) = true := by
  simp only [waitOwnersLive, Bool.and_eq_true] at holds ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨waits, messages⟩, timers⟩, effects⟩, incidents⟩, selections⟩, races⟩, calls⟩,
    records⟩ := holds
  refine ⟨⟨⟨⟨⟨⟨⟨⟨?_, messages⟩, timers⟩, effects⟩, incidents⟩, selections⟩, races⟩, calls⟩, ?_⟩
  · show (insertUserTaskWait _ _).all _ = true
    rw [all_insertUserTaskWait]
    simp only [Bool.and_eq_true]
    exact ⟨by
      simp only [List.all_eq_true] at waits
      exact waits wait waitMem, all_filter _ _ _ waits⟩
  · show (replaceBodyIn state.activityOccurrences record _).all
      (fun candidate => exactLiveOccurrence state candidate.owner) = true
    rw [all_of_map_eq (fun candidate => candidate.owner)
      (fun candidate => exactLiveOccurrence state candidate.owner)
      (fun owner => exactLiveOccurrence state owner) (fun _ => rfl)
      _ state.activityOccurrences (replaceBodyIn_map_of_frame _ (fun _ _ => rfl) _ _ _)]
    exact records

/-- `RSI-ORDER-01`: every canonically ordered collection stays ordered.

Three of the six collections are untouched. The wait list is filtered and then inserted into, which is
exactly the pair of lemmas the order theory supplies; the counter list is the same shape; and the
record list is rewritten by a map whose comparator reads only framed fields. -/
theorem canonicalCollectionOrder_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId)
    (holds : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (replacedState state record wait body) = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at holds ⊢
  obtain ⟨⟨⟨⟨⟨waits, activations⟩, selections⟩, races⟩, calls⟩, records⟩ := holds
  refine ⟨⟨⟨⟨⟨?_, ?_⟩, selections⟩, races⟩, calls⟩, ?_⟩
  · exact orderedBy_insertUserTaskWait _ _
      (orderedBy_filter userTaskWaitBefore_compose _ _ waits)
  · exact orderedBy_insertTaskActivation _ _
      (orderedBy_filter activationBefore_compose _ _ activations)
  · show orderedBy activityOccurrenceBefore
      (replaceBodyIn state.activityOccurrences record _) = true
    rw [orderedBy_of_map_eq
      (fun candidate => (candidate.processInstanceId, candidate.activityElementId,
        candidate.activation))
      activityOccurrenceBefore
      (fun left right =>
        if left.1.value ≠ right.1.value then decide (left.1.value < right.1.value)
        else if left.2.1.value ≠ right.2.1.value then decide (left.2.1.value < right.2.1.value)
        else decide (left.2.2 < right.2.2))
      (fun _ _ => rfl) _ state.activityOccurrences
      (replaceBodyIn_map_of_frame _ (fun _ _ => rfl) _ _ _)]
    exact records

/-- `RSI-BIND-*` for waits: the incoming wait has the outgoing one's definition and owner, so it is
declared by exactly the operation that declared its predecessor. -/
theorem waitDeclarationsValid_replacedState (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (record : ActivityOccurrence) (wait : UserTaskWait)
    (body : OccurrenceId) (waitMem : wait ∈ state.waits)
    (holds : waitDeclarationsValid program instanceId state = true) :
    waitDeclarationsValid program instanceId (replacedState state record wait body) = true := by
  simp only [waitDeclarationsValid, Bool.and_eq_true] at holds ⊢
  obtain ⟨⟨⟨⟨waits, messages⟩, timers⟩, effects⟩, incidents⟩ := holds
  refine ⟨⟨⟨⟨?_, messages⟩, timers⟩, effects⟩, incidents⟩
  simp only [List.all_eq_true] at waits ⊢
  intro candidate mem
  obtain ⟨memWaits, samePid⟩ := List.mem_filter.mp mem
  rcases (mem_insertUserTaskWait _ _ _).mp memWaits with rfl | memFiltered
  · -- The armed wait: same definition and owner as the one withdrawn, so the same declarer.
    exact waits wait (List.mem_filter.mpr ⟨waitMem, samePid⟩)
  · exact waits candidate
      (List.mem_filter.mpr ⟨(List.mem_filter.mp memFiltered).1, samePid⟩)

/-- `RSI-UNIQ-02` under the freshness hypothesis this transition cannot discharge on its own.

The hypothesis is stated rather than derived because no conjunct of `runtimeStateWellFormed` bounds a
live wait's activation by its counter. The arming step establishes it by construction, minting from
the pre-state counter; the residual gap is exactly `RSI-MONO-04`, which no relation in this account
states. Declaring the law without it would assert something the account does not enforce. -/
theorem waitIdentitiesUnique_replacedState (state : RuntimeState) (record : ActivityOccurrence)
    (wait : UserTaskWait) (body : OccurrenceId)
    (fresh : ∀ candidate ∈ state.waits,
      userTaskWaitKeyMatches
        (turnoverWait state wait) candidate = false)
    (holds : waitIdentitiesUnique state = true) :
    waitIdentitiesUnique (replacedState state record wait body) = true := by
  have symm : ∀ left right : UserTaskWait,
      userTaskWaitKeyMatches left right = userTaskWaitKeyMatches right left := by
    intro left right
    simp only [userTaskWaitKeyMatches]
    congr 1
    · congr 1 <;> exact decide_eq_decide.mpr eq_comm
    · exact decide_eq_decide.mpr eq_comm
  simp only [waitIdentitiesUnique, Bool.and_eq_true] at holds ⊢
  obtain ⟨⟨⟨waits, messages⟩, timers⟩, effects⟩ := holds
  refine ⟨⟨⟨?_, messages⟩, timers⟩, effects⟩
  simp only [List.all_eq_true] at waits ⊢
  intro candidate mem
  simp only [occursOnce, ← List.countP_eq_length_filter, decide_eq_true_eq] at waits ⊢
  show (insertUserTaskWait _ _).countP (userTaskWaitKeyMatches candidate) = 1
  rw [countP_insertUserTaskWait]
  rcases (mem_insertUserTaskWait _ _ _).mp mem with heq | memFiltered
  · -- The wait just armed. Its key is fresh, so nothing surviving the withdrawal shares it.
    have self : userTaskWaitKeyMatches candidate (turnoverWait state wait) = true := by
      rw [heq]; simp [userTaskWaitKeyMatches]
    rw [if_pos self]
    have zero : (state.waits.filter fun other => !taskIdNamesWait body other).countP
        (userTaskWaitKeyMatches candidate) = 0 := by
      refine List.countP_eq_zero.mpr (fun other memOther => ?_)
      rw [heq]
      simp only [Bool.not_eq_true]
      exact fresh other (List.mem_filter.mp memOther).1
    omega
  · -- A wait that was already live. Freshness keeps the armed wait from colliding with it, and the
    -- withdrawn wait cannot have shared its key or the pre-state would have counted two.
    have inState : candidate ∈ state.waits := (List.mem_filter.mp memFiltered).1
    have notFresh : userTaskWaitKeyMatches candidate (turnoverWait state wait) = false := by
      rw [symm]
      exact fresh candidate inState
    rw [if_neg (by simp [notFresh])]
    have counted := waits candidate inState
    have mono : state.waits.countP (fun other =>
        userTaskWaitKeyMatches candidate other && !taskIdNamesWait body other) ≤
          state.waits.countP (userTaskWaitKeyMatches candidate) :=
      List.countP_mono_left (fun other _ h => by simp at h; exact h.1)
    have lower : 0 < (state.waits.filter fun other => !taskIdNamesWait body other).countP
        (userTaskWaitKeyMatches candidate) :=
      Nat.pos_of_ne_zero (fun contra => by
        have absent := List.countP_eq_zero.mp contra candidate memFiltered
        simp [userTaskWaitKeyMatches] at absent)
    rw [List.countP_filter] at lower ⊢
    omega

/-! ## Bridging the body key and the wait key

Both collections are keyed on the same three coordinates, but one is stated over an `OccurrenceId` and
the other over two waits. These three lemmas move between them so the preservation proof argues about
freshness once rather than unfolding field equalities at every use.
-/

private theorem taskDefinitionId_of_value {left right : TaskDefinitionId}
    (h : left.value = right.value) : left = right := by
  cases left; cases right; simp_all

/-- The wait the replacement arms is the one its new body names. -/
theorem turnoverBodyId_names_turnoverWait (state : RuntimeState) (wait : UserTaskWait)
    (body : OccurrenceId) (namesWait : taskIdNamesWait body wait = true) :
    taskIdNamesWait (turnoverBodyId state wait body) (turnoverWait state wait) = true := by
  simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at namesWait
  simp only [taskIdNamesWait, turnoverBodyId, turnoverWait, Bool.and_eq_true, beq_iff_eq]
  exact ⟨⟨namesWait.1.1, namesWait.1.2⟩, trivial⟩

/-- Any wait the new body names carries the armed key, which freshness forbids of a live wait. -/
theorem turnoverBodyId_hit_is_turnover_key (state : RuntimeState) (wait : UserTaskWait)
    (body : OccurrenceId) (namesWait : taskIdNamesWait body wait = true)
    (candidate : UserTaskWait)
    (hit : taskIdNamesWait (turnoverBodyId state wait body) candidate = true) :
    userTaskWaitKeyMatches (turnoverWait state wait) candidate = true := by
  simp only [taskIdNamesWait, turnoverBodyId, Bool.and_eq_true, beq_iff_eq] at namesWait hit
  simp only [userTaskWaitKeyMatches, turnoverWait, Bool.and_eq_true, decide_eq_true_eq]
  refine ⟨⟨?_, ?_⟩, hit.2⟩
  · rw [← namesWait.1.1]; exact hit.1.1
  · exact taskDefinitionId_of_value (by rw [← namesWait.1.2]; exact hit.1.2)

/-- If the armed wait answers some body key, every live wait answering it carries the armed key. -/
theorem turnoverWait_hit_transfers (state : RuntimeState) (wait : UserTaskWait)
    (task : OccurrenceId) (hit : taskIdNamesWait task (turnoverWait state wait) = true)
    (candidate : UserTaskWait) (names : taskIdNamesWait task candidate = true) :
    userTaskWaitKeyMatches (turnoverWait state wait) candidate = true := by
  simp only [taskIdNamesWait, turnoverWait, Bool.and_eq_true, beq_iff_eq] at hit names
  simp only [userTaskWaitKeyMatches, turnoverWait, Bool.and_eq_true, decide_eq_true_eq]
  refine ⟨⟨?_, ?_⟩, ?_⟩
  · rw [← hit.1.1]; exact names.1.1
  · exact taskDefinitionId_of_value (by rw [← hit.1.2]; exact names.1.2)
  · rw [← hit.2]; exact names.2

/-- `activityBodyLive` is the body-keyed wait lookup, written with the shared predicate. -/
theorem activityBodyLive_userTask (state : RuntimeState) (record : ActivityOccurrence)
    (task : OccurrenceId) (isTask : record.body = .userTask task) :
    activityBodyLive state record =
      decide ((state.waits.filter (taskIdNamesWait task)).length = 1) := by
  simp only [activityBodyLive, isTask]
  congr 3
  apply List.filter_congr
  intro candidate _
  simp only [taskIdNamesWait]
  congr 1
  · congr 1 <;> exact decide_eq_decide.mpr eq_comm
  · exact decide_eq_decide.mpr eq_comm

/-- `AOO-BODY-01` and `AOO-OWN-01` under the hypothesis that no other record shares the outgoing body.

That second hypothesis is **not** a state invariant, and this proof is where that shows. Nothing in
`runtimeStateWellFormed` refuses two records naming one body, so a well-formed pre-state can have a
second record whose body is the wait this transition withdraws; after the withdrawal that record's
body is gone and the conjunct fails. The parent account already carries the same premise explicitly
for its body-side lookup determinism, and this is the same premise reappearing as a transition
obligation rather than a lookup one. -/
theorem activityRecordsOwnLiveWork_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId)
    (unique : state.waits.filter (taskIdNamesWait body) = [wait])
    (fresh : ∀ candidate ∈ state.waits,
      userTaskWaitKeyMatches
        (turnoverWait state wait) candidate = false)
    (soleBody : ∀ other ∈ state.activityOccurrences,
      sameActivityOccurrence other record = false → recordBodyNamesWait wait other = false)
    (holds : activityRecordsOwnLiveWork state = true) :
    activityRecordsOwnLiveWork (replacedState state record wait body) = true := by
  have waitInFilter : wait ∈ state.waits.filter (taskIdNamesWait body) := by
    rw [unique]; simp
  have waitMem : wait ∈ state.waits := (List.mem_filter.mp waitInFilter).1
  have namesWait : taskIdNamesWait body wait = true := (List.mem_filter.mp waitInFilter).2
  simp only [activityRecordsOwnLiveWork, List.all_eq_true] at holds ⊢
  intro candidate mem
  show (activityBodyLive (replacedState state record wait body) candidate &&
    candidate.attachedTimers.all fun timer =>
      (replacedState state record wait body).timerWaits.any fun timerWait =>
        timerIdNamesWait timer timerWait && decide (timerWait.owner = candidate.owner)) = true
  obtain ⟨other, memOther, rebuilt⟩ := List.mem_map.mp mem
  have priorHolds := holds other memOther
  simp only [Bool.and_eq_true] at priorHolds
  simp only [Bool.and_eq_true]
  refine ⟨?_, ?_⟩
  · by_cases h : sameActivityOccurrence other record = true
    · -- The rewritten record. Its new body is the wait just armed, and freshness makes it unique.
      have shape : candidate.body = .userTask (turnoverBodyId state wait body) := by
        rw [← rebuilt]; simp [h]
      rw [activityBodyLive_userTask _ _ _ shape]
      simp only [replacedState, decide_eq_true_eq, ← List.countP_eq_length_filter,
        countP_insertUserTaskWait]
      rw [if_pos (turnoverBodyId_names_turnoverWait state wait body namesWait)]
      have zero : (state.waits.filter fun other => !taskIdNamesWait body other).countP
          (taskIdNamesWait (turnoverBodyId state wait body)) = 0 := by
        refine List.countP_eq_zero.mpr (fun other memOther => ?_)
        intro hit
        have keyed := turnoverBodyId_hit_is_turnover_key state wait body namesWait other hit
        rw [fresh other (List.mem_filter.mp memOther).1] at keyed
        exact Bool.noConfusion keyed
      omega
    · -- An untouched record. Its body survives because no other record named the withdrawn wait.
      simp only [Bool.not_eq_true] at h
      have same : candidate = other := by rw [← rebuilt]; simp [h]
      subst same
      cases bodyShape : candidate.body with
      | childScope scope =>
        have prior := priorHolds.1
        simp only [activityBodyLive, bodyShape] at prior ⊢
        exact prior
      | userTask task =>
        have prior := priorHolds.1
        rw [activityBodyLive_userTask _ _ _ bodyShape, decide_eq_true_eq,
          ← List.countP_eq_length_filter] at prior
        rw [activityBodyLive_userTask _ _ _ bodyShape]
        simp only [replacedState, decide_eq_true_eq, ← List.countP_eq_length_filter,
          countP_insertUserTaskWait]
        have notArmed : taskIdNamesWait task (turnoverWait state wait) = false := by
          rcases hit : taskIdNamesWait task (turnoverWait state wait) with _ | _
          · rfl
          · exfalso
            -- A live wait already carries this element at this activation, so the armed key is not
            -- fresh after all.
            obtain ⟨witness, witMem, witNames⟩ :=
              countP_pos_exists _ _ (by omega : 0 < state.waits.countP (taskIdNamesWait task))
            have keyed := turnoverWait_hit_transfers state wait task hit witness witNames
            rw [fresh witness witMem] at keyed
            exact Bool.noConfusion keyed
        rw [if_neg (by simp [notArmed])]
        have keep : ∀ other' ∈ state.waits,
            ((taskIdNamesWait task other' && !taskIdNamesWait body other') = true ↔
              taskIdNamesWait task other' = true) := by
          intro other' memOther'
          rcases hp : taskIdNamesWait task other' with _ | _
          · simp
          · have notBody : taskIdNamesWait body other' = false := by
              rcases hb : taskIdNamesWait body other' with _ | _
              · rfl
              · exfalso
                have inFilter : other' ∈ state.waits.filter (taskIdNamesWait body) :=
                  List.mem_filter.mpr ⟨memOther', hb⟩
                rw [unique, List.mem_singleton] at inFilter
                subst inFilter
                have notNamed := soleBody candidate memOther h
                simp only [recordBodyNamesWait, activityBodyTask?, bodyShape] at notNamed
                rw [notNamed] at hp
                exact Bool.noConfusion hp
            simp [notBody]
        rw [List.countP_filter, List.countP_congr keep]
        omega
  · -- The attached list and the owner are framed, and the Timer waits are untouched.
    have frameEq : candidate.attachedTimers = other.attachedTimers ∧
        candidate.owner = other.owner := by
      rw [← rebuilt]
      by_cases h : sameActivityOccurrence other record = true <;> simp [h]
    rw [frameEq.1, frameEq.2]
    exact priorHolds.2

/-! ## The preservation law

The second of the two results this capsule declares. Twelve conjuncts, four of them definitional,
under two hypotheses neither of which `runtimeStateWellFormed` supplies.
-/

/-- `AOO-TURNOVER-02`: the whole-state replacement carries a well-formed state to a well-formed state.

Two hypotheses are stated rather than derived, and both are genuine gaps rather than bookkeeping.

`fresh` says the armed key names no live wait. No conjunct bounds a live wait's activation by its
counter, so this cannot be recovered from `wellFormed`; the arming step establishes it by construction
because it mints from the pre-state counter, and the residual gap is exactly `RSI-MONO-04`.

`soleBody` says no *other* record names the wait being withdrawn. Nothing refuses two records naming
one body, so a well-formed pre-state can hold a second claimant whose body this transition removes.
The parent account carries the same premise explicitly for its body-side lookup determinism, and it
reappears here as a transition obligation. Discharging either would be a change to the account, not to
this proof.

The intermediate state is never exposed, which is why the law can be stated at all: a decomposition
into withdraw-then-arm would pass through a state that `activityRecordsOwnLiveWork` rejects, and the
law would then be vacuous on its own hypothesis. -/
theorem replacedState_preserves_wellFormed (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (record : ActivityOccurrence) (wait : UserTaskWait)
    (body : OccurrenceId)
    (unique : state.waits.filter (taskIdNamesWait body) = [wait])
    (fresh : ∀ candidate ∈ state.waits,
      userTaskWaitKeyMatches (turnoverWait state wait) candidate = false)
    (soleBody : ∀ other ∈ state.activityOccurrences,
      sameActivityOccurrence other record = false → recordBodyNamesWait wait other = false)
    (wellFormed : runtimeStateWellFormed program instanceId state = true) :
    runtimeStateWellFormed program instanceId (replacedState state record wait body) = true := by
  have waitInFilter : wait ∈ state.waits.filter (taskIdNamesWait body) := by
    rw [unique]; simp
  have waitMem : wait ∈ state.waits := (List.mem_filter.mp waitInFilter).1
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩, owners⟩, identities⟩, declarations⟩,
    hidden⟩, order⟩, bodies⟩, attached⟩, unique'⟩, lifecycle⟩ := wellFormed
  refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩
  · rw [runtimePositionValid_replacedState]; exact position
  · rw [eventRaceAssociationsValid_replacedState]; exact races
  · rw [effectIncidentAssociationsValid_replacedState]; exact incidents
  · exact waitOwnersLive_replacedState state record wait body waitMem owners
  · exact waitIdentitiesUnique_replacedState state record wait body fresh identities
  · exact waitDeclarationsValid_replacedState program instanceId state record wait body waitMem
      declarations
  · rw [hiddenRecordDeclarationsValid_replacedState]; exact hidden
  · exact canonicalCollectionOrder_replacedState state record wait body order
  · exact activityRecordsOwnLiveWork_replacedState state record wait body unique
      fresh soleBody bodies
  · rw [attachedTimersUnambiguous_replacedState]; exact attached
  · rw [activityIdentitiesUnique_replacedState]; exact unique'
  · -- The lifecycle clause. A live wait exists, so the pre-state cannot have been `notStarted`, and
    -- the control field itself is untouched.
    have sameControl : (replacedState state record wait body).control = state.control := rfl
    rw [sameControl]
    cases hc : state.control with
    | notStarted =>
      exfalso
      rw [hc] at lifecycle
      simp only [notStartedStateEmpty, Bool.and_eq_true, List.isEmpty_iff] at lifecycle
      exact List.ne_nil_of_mem waitMem lifecycle.1.1.1.1.1.1.1.1.1
    | running _ => rfl
    | completed _ => rfl
    | cancelled _ => rfl

/-- The resolver answers with the state rewrite exactly when the state holds a record naming a unique
live body.

Stated so the preservation law above applies to the operation a caller actually invokes, rather than
to the rewrite it delegates to. The membership hypothesis is the guard's, not the law's: `replacedState`
is well-formedness-preserving without it, and refusing an unheld record keeps the operation's domain
identical to the independently written core's. -/
theorem replaceActivityBodyTask_eq_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId)
    (bodyOfRecord : activityBodyTask? record = some body)
    (held : state.activityOccurrences.any (fun candidate => sameActivityOccurrence candidate record)
      = true)
    (unique : state.waits.filter (taskIdNamesWait body) = [wait]) :
    replaceActivityBodyTask state record = some (replacedState state record wait body) := by
  simp [replaceActivityBodyTask, bodyOfRecord, held, unique]

end BpmnSemantics.SemanticProcess
