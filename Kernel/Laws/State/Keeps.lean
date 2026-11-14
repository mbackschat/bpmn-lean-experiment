module

public import Kernel.Laws.State

/-! # Laws of the kernel state: what the operations keep

That the state operations `Step` and the hooks apply keep `WellFormed` under the conditions their callers establish,
composed from what `Kernel.Laws.State` shows each operation does to the fields and the frames of
`Kernel.Laws.State.Frames` and `Kernel.Laws.State.Issue`; it reads no body. `Kernel.Laws.State.Removal` adds the
removal of an occurrence and `Kernel.Laws.State.Variables` the variable writes; `Kernel.Proofs.Step` assembles them
into `Laws.Step.Phases` and `Kernel.Proofs.State` into `Laws.Step.Operations`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## The phases of `Step`

That each phase `Step` runs itself keeps `WellFormed` (`Laws.Step.Phases`, which `Kernel.Proofs.State` assembles). -/

/-- `Step.onRunning` starts an input from an empty journal and outbox. -/
theorem reset_wellFormed {s : State} (formed : WellFormed program s) :
    WellFormed program { s with journal := [], outbox := [], draft := {}, writes := [] } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun fact member => by
      simp [starts] at member,
    .same rfl⟩ rfl
    (by simp [StartedOnce, starts])

/-- `Step.advanceClock` moves the logical time. -/
theorem clock_wellFormed {s : State} (formed : WellFormed program s) (atMs : Nat) : WellFormed program { s with logicalTimeMs := atMs } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun _ => id, .same rfl⟩ rfl formed.startedOnce

/-- `Step.orderJournal` puts the journal in run order. -/
theorem runOrder_wellFormed {s : State} (formed : WellFormed program s) : WellFormed program { s with journal := s.journal.reverse } :=
  have perm : (starts { s with journal := s.journal.reverse }).Perm (starts s) :=
    ((List.reverse_perm _).flatMap_right _).append_right _
  formed.permuted ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun _ => perm.mem_iff.mp,
    .same rfl⟩ rfl perm

/-- `Step.conclude` journals the draft, whose start facts the transition carries, and empties it and the write log. -/
theorem journal_wellFormed {s : State} (formed : WellFormed program s) {transition : Transition}
    (started : transition.started = s.draft.started) :
    WellFormed program { s with journal := transition :: s.journal, draft := {}, writes := [] } :=
  have perm : (starts { s with journal := transition :: s.journal, draft := {}, writes := [] }).Perm (starts s) := by
    simp only [starts, List.flatMap_cons, started, List.append_nil]
    exact List.perm_append_comm
  formed.permuted ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun _ => perm.mem_iff.mp,
    .same rfl⟩ rfl perm

/-- `State.recordEnd` journals an end fact. -/
theorem recordEnd_wellFormed {s : State} (formed : WellFormed program s) (key : OccurrenceKey) (terminal : Terminal) :
    WellFormed program (s.recordEnd key terminal) :=
  recordEnd_eq s key terminal ▸ formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun _ => id, .same rfl⟩ rfl formed.startedOnce

/-- The closure takes queued signals off the queue. -/
theorem dequeue_wellFormed {s : State} (formed : WellFormed program s) {signals : List Signal} (fewer : signals.Sublist s.signals) :
    WellFormed program { s with signals } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, fewer, fun _ => id, .same rfl⟩ rfl formed.startedOnce

/-- The closure takes its next token off the work stack. -/
theorem untoken_wellFormed {s : State} (formed : WellFormed program s) {tokens : List Token} (fewer : tokens.Sublist s.tokens) :
    WellFormed program { s with tokens } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, fewer, .refl _, fun _ => id, .same rfl⟩ rfl formed.startedOnce

/-- `State.closeOwnItems` closes the items waiting for an occurrence. -/
theorem closeOwnItems_wellFormed {s : State} (formed : WellFormed program s) (occurrence : Nat) :
    WellFormed program (s.closeOwnItems occurrence) :=
  closeOwnItems_eq s occurrence ▸ formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, List.filter_sublist, .refl _, .refl _, fun _ => id, .same rfl⟩ rfl
    formed.startedOnce

/-- Replacing what open items wait for, each keeping its identity, element, scope occurrence, occurrence and
attachment, keeps a state well-formed: no clause reads what an item waits for. -/
theorem rekind_wellFormed {s : State} (formed : WellFormed program s) {change : OpenItem → OpenItem}
    (kept : ∀ item, change item = { item with kind := (change item).kind }) :
    WellFormed program { s with openItems := s.openItems.map change } := by
  have keys : key { s with openItems := s.openItems.map change } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  have instances : ∀ x, { s with openItems := s.openItems.map change }.instanceOf x = s.instanceOf x :=
    instanceOf_congr rfl rfl
  have back : ∀ item ∈ s.openItems.map change, ∃ old ∈ s.openItems, change old = item := fun _ member =>
    List.mem_map.mp member
  have ids : (fun item => (change item).id) = (·.id) := funext fun item => by rw [kept item]
  refine ⟨?issued, ?distinct, formed.startedOnce, ⟨formed.activations.keys, formed.activations.positive⟩, ?reservations,
    ?owned, ?rooted, ⟨formed.variables.scopes, formed.variables.names⟩, formed.failure,
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends⟩, formed.counted,
    ?occurrencesCounted, formed.ownedBelow, ?claimed,
    formed.settled.transport (.same rfl) (Nat.le_refl _) (fun _ member _ => .inl member) (fun _ queued => queued)
      (fun _ member => member) (fun _ member => .inl member), ?attachedReserved, ?typed⟩
  case attachedReserved =>
    intro item member attached
    obtain ⟨old, inside, rfl⟩ := back item member
    rw [kept old] at attached ⊢
    exact formed.attachedReserved old inside attached
  case typed =>
    intro item member started
    obtain ⟨old, inside, rfl⟩ := back item member
    have same : ∀ x, (change x).occurrence = x.occurrence ∧ (change x).element = x.element := fun x => by rw [kept x]; exact ⟨rfl, rfl⟩
    rw [(same old).2] at started
    obtain ⟨unbegun, alone⟩ := formed.typed old inside started
    refine ⟨(same old).1 ▸ unbegun, fun other present named => ?_⟩
    obtain ⟨oldOther, otherInside, rfl⟩ := back other present
    rw [(same oldOther).1, (same old).1] at named
    rw [alone oldOther otherInside named]
  case issued =>
    refine ⟨formed.issued.occurrences, fun item member => ?_, formed.issued.scopes⟩
    obtain ⟨old, inside, rfl⟩ := back item member
    rw [kept old]
    exact formed.issued.items old inside
  case distinct =>
    refine ⟨formed.distinct.occurrences, ?_, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
    show ((s.openItems.map change).map (·.id)).Nodup
    rw [List.map_map, Function.comp_def, ids]
    exact formed.distinct.items
  case reservations =>
    unfold ReservationsUnstarted
    rw [keys]
    exact formed.reservations
  case owned =>
    refine ⟨formed.owned.occurrenceScopes, fun item member => ?_, fun item member => ?_, fun item member => ?_,
      formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
    all_goals obtain ⟨old, inside, rfl⟩ := back item member
    all_goals rw [kept old]
    · exact formed.owned.itemScopes old inside
    · exact formed.owned.itemOccurrences old inside
    · exact formed.owned.attachments old inside
  case rooted =>
    exact ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
      Within.congr (s := s) (t := { s with openItems := s.openItems.map change }) rfl (formed.rooted.2.2 scope member)⟩
  case occurrencesCounted =>
    unfold OccurrencesCounted
    rw [keys]
    exact formed.occurrencesCounted
  case claimed =>
    refine ⟨fun item member attached reserved other inside same => ?_, fun request queued => ?_,
      formed.claimed.signalsApart, formed.claimed.tokensApart, formed.claimed.queuesApart, formed.claimed.uncompleted,
      formed.claimed.scopesIssued, formed.claimed.innerPlaced⟩
    · obtain ⟨old, oldInside, rfl⟩ := back item member
      obtain ⟨oldOther, otherInside, rfl⟩ := back other inside
      rw [kept old] at attached same reserved
      rw [kept oldOther] at same
      rw [formed.claimed.attached old oldInside attached reserved oldOther otherInside same]
    · obtain ⟨nodup, beginnable⟩ := formed.claimed.named request queued
      refine ⟨nodup, fun id named => ?_⟩
      obtain ⟨below, facts⟩ := beginnable id named
      refine ⟨below, fun occurrence member same => ?_⟩
      obtain ⟨unbegun, free, instance_⟩ := facts occurrence member same
      refine ⟨unbegun, fun item inside => ?_, fun present => by rw [instances, instances]; exact instance_ present⟩
      obtain ⟨old, oldInside, rfl⟩ := back item inside
      rw [kept old]
      exact free old oldInside

/-- Issuing an identifier keeps a state well-formed: what stands was issued before, and so before the next. -/
theorem issue_wellFormed {s : State} (formed : WellFormed program s) : WellFormed program s.issue.1 := by
  rw [issue_eq]
  show WellFormed program { s with nextIssue := s.nextIssue + 1 }
  have later : s.nextIssue ≤ s.nextIssue + 1 := Nat.le_succ _
  have keys : key { s with nextIssue := s.nextIssue + 1 } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  exact {
  issued := ⟨fun occurrence member => Nat.lt_succ_of_lt (formed.issued.occurrences occurrence member),
    fun item member => Nat.lt_succ_of_lt (formed.issued.items item member),
    fun scope member => Nat.lt_succ_of_lt (formed.issued.scopes scope member)⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences,
    formed.owned.attachments, formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
    Within.congr (s := s) (t := { s with nextIssue := s.nextIssue + 1 }) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := formed.failure
  queue := {
    arm := fun host element scope queued =>
      have ⟨host_, scope_, rest⟩ := formed.queue.arm host element scope queued
      ⟨Nat.lt_succ_of_lt host_, Nat.lt_succ_of_lt scope_, rest⟩
    armScope := fun scope queued => Nat.lt_succ_of_lt (formed.queue.armScope scope queued)
    armGateway := fun occurrence gateway scope queued =>
      have ⟨occurrence_, scope_, rest⟩ := formed.queue.armGateway occurrence gateway scope queued
      ⟨Nat.lt_succ_of_lt occurrence_, Nat.lt_succ_of_lt scope_, rest⟩
    ends := formed.queue.ends }
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := formed.claimed.shrink (fun _ member => member) (fun _ member => member) formed.owned.occurrenceScopes
    (fun _ member => member) (fun _ _ => by apply instanceOf_congr <;> rfl) later (.refl _) (.refl _)
  settled := formed.settled.transport (.same rfl) later (fun _ member _ => .inl member) (fun _ queued => queued)
    (fun _ member => member) (fun _ member => .inl member)
  attachedReserved := formed.attachedReserved
  typed := formed.typed }

/-- Replacing the retained compensation records, and the runs by some of them, keeps a state well-formed: a run that
stays completes what it completed. -/
theorem compensation_wellFormed {s : State} (formed : WellFormed program s) {compensation : Compensations}
    (runs : ∀ run ∈ compensation.runs, run ∈ s.slots.compensation.runs) :
    WellFormed program { s with slots := { s.slots with compensation } } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _,
    fun _ => id, ⟨fun _ member => member, fun _ member => member, runs⟩⟩ rfl formed.startedOnce

/-- Queuing a signal keeps a state well-formed when the queue stays sound and the claims single. -/
theorem signal_wellFormed {s : State} {signal : Signal} (formed : WellFormed program s) (queue : QueueSound (s.signal signal))
    (claimed : ReservationsClaimed (s.signal signal)) (settled : SlotsSettled (s.signal signal)) :
    WellFormed program (s.signal signal) := by
  rw [signal_eq] at *
  have keys : key { s with signals := s.signals ++ [signal] } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  exact {
  issued := ⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences,
    formed.owned.attachments, formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
    Within.congr (s := s) (t := { s with signals := s.signals ++ [signal] }) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := formed.failure
  queue := queue
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := claimed
  settled := settled
  attachedReserved := formed.attachedReserved
  typed := formed.typed }

/-- A queued signal other than a begin keeps the slots settled when, should it be a compensation that completes an
occurrence once it ends, that occurrence has begun. Which signal it is, `Kernel.Proofs.Step` tells. -/
theorem signal_settled {s : State} {signal : Signal} (formed : WellFormed program s)
    (notBegin : ∀ request, signal ≠ .begin request)
    (compensates : ∀ scope activity trigger leave occurrence resume,
      signal = .compensate scope activity trigger leave (some (.complete occurrence resume)) → Settled s occurrence) :
    SlotsSettled (s.signal signal) := by
  rw [signal_eq]
  have queuedOld : ∀ request, Queued { s with signals := s.signals ++ [signal] } request → Queued s request :=
    fun request queued => queued.elim (fun queued => .inl ((List.mem_append.mp queued).resolve_right fun new =>
      notBegin request (List.mem_singleton.mp new).symm)) .inr
  have carry : ∀ id, Settled s id → Settled { s with signals := s.signals ++ [signal] } id := fun _ settled =>
    settled.transport (Nat.le_refl _) (fun _ member _ => .inl member) queuedOld
  refine ⟨fun waiting member => carry _ (formed.settled.parked waiting member),
    fun run member => carry _ (formed.settled.bodies run member),
    fun run member occurrence leave resume => carry _ (formed.settled.resumed run member occurrence leave resume),
    fun scope activity trigger leave occurrence resume member => carry _ ?_, formed.settled.placed⟩
  rcases List.mem_append.mp member with old | new
  · exact formed.settled.queued scope activity trigger leave occurrence resume old
  · exact compensates scope activity trigger leave occurrence resume (List.mem_singleton.mp new).symm

/-- A queued signal keeps the queue sound when, should it be an arming, what it names was issued and its host, while it
stands, is begun in the named scope occurrence, and, should it be an instance end, it records a failure exactly when it
fails. Which signal it is, `Kernel.Proofs.Step` tells, since only `Signal`'s owners may tell its constructors apart. -/
theorem signal_queueSound {s : State} {signal : Signal} (formed : WellFormed program s)
    (arm : ∀ host element scope, signal = .arm host element scope → host < s.nextIssue ∧ scope.value < s.nextIssue ∧
      ∀ occurrence ∈ s.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope)
    (armScope : ∀ scope, signal = .armScope scope → scope.value < s.nextIssue)
    (armGateway : ∀ occurrence gateway scope, signal = .armGateway occurrence gateway scope →
      occurrence < s.nextIssue ∧ scope.value < s.nextIssue ∧
        ∀ found ∈ s.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope)
    (ends : ∀ status failure, signal = .endInstance status failure → (failure.isSome = true ↔ status = .failed)) :
    QueueSound (s.signal signal) := by
  rw [signal_eq]
  exact {
  arm host element scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.arm host element scope old
    · exact arm host element scope (List.mem_singleton.mp new).symm
  armScope scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.armScope scope old
    · exact armScope scope (List.mem_singleton.mp new).symm
  armGateway occurrence gateway scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.armGateway occurrence gateway scope old
    · exact armGateway occurrence gateway scope (List.mem_singleton.mp new).symm
  ends status failure queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.ends status failure old
    · exact ends status failure (List.mem_singleton.mp new).symm }

/-- A pair of a list with one entry appended lies in the list, unless its second entry is the appended one. -/
theorem pair_of_append {α : Type} {a b c : α} {l : List α} (pair : [a, b].Sublist (l ++ [c])) (other : b ≠ c) :
    [a, b].Sublist l := by
  obtain ⟨first, second, split, rest⟩ := List.sublist_append_iff.mp pair
  obtain ⟨inFirst, inSecond⟩ := rest
  match second, inSecond with
  | [], _ => rw [List.append_nil] at split; exact split ▸ inFirst
  | [_], sub =>
    obtain rfl := List.mem_singleton.mp (List.singleton_sublist.mp sub)
    have := congrArg List.reverse split
    simp at this
    exact absurd this.1 other
  | _ :: _ :: _, sub => have := sub.length_le; simp at this

/-- Queuing a signal that is no begin, and if a completion, then of an occurrence no queued begin names, keeps the
claims single. Which signal it is, `Kernel.Proofs.Step` tells. -/
theorem signal_claimed {s : State} {signal : Signal} (formed : WellFormed program s)
    (notBegin : ∀ request, signal ≠ .begin request)
    (completes : ∀ id leave writes rule, signal = .complete id leave writes rule →
      ∀ request, Queued s request → id ∉ names request) :
    ReservationsClaimed (s.signal signal) := by
  rw [signal_eq]
  have old : ∀ request, Signal.begin request ∈ s.signals ++ [signal] → Signal.begin request ∈ s.signals :=
    fun request queued => (List.mem_append.mp queued).resolve_right fun new =>
      notBegin request (List.mem_singleton.mp new).symm
  have queuedOld : ∀ request, Queued { s with signals := s.signals ++ [signal] } request → Queued s request := fun request queued =>
    queued.elim (fun queued => .inl (old request queued)) .inr
  exact ⟨formed.claimed.attached, fun request queued => (formed.claimed.named request (queuedOld request queued)).imp id
      fun beginnable id named => (beginnable id named).congr rfl rfl rfl rfl fun _ => by apply instanceOf_congr <;> rfl,
    fun first second pair => formed.claimed.signalsApart first second (pair_of_append pair (notBegin second).symm),
    formed.claimed.tokensApart,
    fun first second queued token => formed.claimed.queuesApart first second (old first queued) token,
    fun request id leave writes rule queued named completed => formed.claimed.uncompleted request id leave writes rule
      (queuedOld request queued) named ((List.mem_append.mp completed).resolve_right fun new =>
        completes id leave writes rule (List.mem_singleton.mp new).symm request (queuedOld request queued) named),
    fun request queued => formed.claimed.scopesIssued request (queuedOld request queued),
    fun request queued => formed.claimed.innerPlaced request (queuedOld request queued)⟩

/-- No queued begin names a begun occurrence that stands: what a queued begin names is unbegun while it stands. -/
theorem begun_unnamed {s : State} (formed : WellFormed program s) {occurrence : Occurrence} (member : occurrence ∈ s.occurrences)
    (begun : occurrence.begun = true) : ∀ request, Queued s request → occurrence.id ∉ names request :=
  fun request queued named => by
    have := ((formed.claimed.named request queued).2 _ named).2 occurrence member rfl
    simp [begun] at this

/-- No queued begin names the occurrence an open item waits for: a beginnable reservation has no item waiting for it. -/
theorem waited_unnamed {s : State} (formed : WellFormed program s) {item : OpenItem} (member : item ∈ s.openItems) :
    ∀ request, Queued s request → item.occurrence ∉ names request :=
  fun request queued named => by
    obtain ⟨occurrence, inside, same, _⟩ := formed.owned.itemOccurrences item member
    have := (((formed.claimed.named request queued).2 _ named).2 occurrence inside same).2.1 item member
    exact this.1 rfl

/-- An item added with a fresh identity below the counter, waiting for an occurrence that stands in its own scope
occurrence and hanging, if at all, on a begun occurrence there, keeps a state well-formed when nothing queued begins
what it waits for, an item already waiting for that occurrence waits for a begun one, and the item, attached or of a
start Event, waits for an unbegun one. -/
theorem addItem_wellFormed {s : State} (formed : WellFormed program s) {item : OpenItem}
    (fresh : ∀ other ∈ s.openItems, other.id < item.id) (below : item.id < s.nextIssue)
    (waits : ∃ occurrence ∈ s.occurrences, occurrence.id = item.occurrence ∧ occurrence.element = item.element ∧
      occurrence.scope = item.scope)
    (hangs : ∀ host, item.attachedTo = some host → ∃ occurrence ∈ s.occurrences, occurrence.id = host ∧
      occurrence.begun = true ∧ occurrence.scope = item.scope)
    (apart : ∀ other ∈ s.openItems, other.occurrence = item.occurrence → ∀ occurrence ∈ s.occurrences,
      occurrence.id = item.occurrence → occurrence.begun = true)
    (unnamed : ∀ request, Queued s request → item.occurrence ∉ names request)
    (reserved : item.attachedTo.isSome = true → Unbegun s item.occurrence)
    (typed : ((program.element? item.element).bind (·.start?)).isSome = true → Unbegun s item.occurrence) :
    WellFormed program { s with openItems := s.openItems ++ [item] } := by
  have members : ∀ found ∈ s.openItems ++ [item], found ∈ s.openItems ∨ found = item := fun found inside => by
    simpa using inside
  have instances : ∀ x, State.instanceOf { s with openItems := s.openItems ++ [item] } x = s.instanceOf x :=
    instanceOf_congr rfl rfl
  have keys : key { s with openItems := s.openItems ++ [item] } = key s := funext fun _ => key_congr (instances _)
  -- An item sharing what another waits for, either attached, makes that occurrence begun, so no reservation.
  have shared : ∀ first ∈ s.openItems ++ [item], ∀ second ∈ s.openItems ++ [item], first ≠ second →
      first.occurrence = second.occurrence → ∀ occurrence ∈ s.occurrences, occurrence.id = first.occurrence →
        occurrence.begun = false → first.attachedTo.isSome = true → False := by
    intro first firstIn second secondIn differ same occurrence present named unbegun attached
    rcases members first firstIn with firstOld | rfl <;> rcases members second secondIn with secondOld | rfl
    · exact differ (formed.claimed.attached first firstOld attached ⟨occurrence, present, named, unbegun⟩ second
        secondOld same.symm).symm
    · simp [apart first firstOld same occurrence present (named.trans same)] at unbegun
    · simp [apart second secondOld same.symm occurrence present named] at unbegun
    · exact differ rfl
  refine ⟨?issued, ?distinct, formed.startedOnce, ⟨formed.activations.keys, formed.activations.positive⟩,
    by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations, ?owned, ?rooted,
    ⟨formed.variables.scopes, formed.variables.names⟩, formed.failure,
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends⟩, formed.counted,
    by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted, formed.ownedBelow, ?claimed,
    formed.settled.transport (.same rfl) (Nat.le_refl _) (fun _ member _ => .inl member) (fun _ queued => queued)
      (fun _ member => member) (fun _ member => .inl member), ?attachedReserved, ?typed⟩
  case attachedReserved =>
    intro found inside attached
    rcases members found inside with old | rfl
    · exact formed.attachedReserved found old attached
    · exact reserved attached
  case typed =>
    intro found inside started
    -- An item already waiting for what the new one waits for waits for a begun occurrence, so for no start's.
    obtain ⟨occurrence, present, named, _⟩ := waits
    have begunShared : ∀ other ∈ s.openItems, other.occurrence = item.occurrence → Unbegun s item.occurrence → False :=
      fun other old same unbegun => by
        have := unbegun occurrence present named
        simp [apart other old same occurrence present named] at this
    rcases members found inside with old | rfl
    · obtain ⟨unbegun, alone⟩ := formed.typed found old started
      refine ⟨unbegun, fun other held same => ?_⟩
      rcases members other held with otherOld | rfl
      · exact alone other otherOld same
      · exact (begunShared found old same.symm (same ▸ unbegun)).elim
    · refine ⟨typed started, fun other held same => ?_⟩
      rcases members other held with otherOld | rfl
      · exact (begunShared other otherOld same (typed started)).elim
      · rfl
  case issued =>
    refine ⟨formed.issued.occurrences, fun found inside => ?_, formed.issued.scopes⟩
    rcases members found inside with old | rfl
    · exact formed.issued.items found old
    · exact below
  case distinct =>
    refine ⟨formed.distinct.occurrences, ?_, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
    rw [List.map_append, List.nodup_append]
    exact ⟨formed.distinct.items, by simp, fun a old b new same => by
      obtain ⟨other, inside, rfl⟩ := List.mem_map.mp old
      simp at new
      have := fresh other inside
      omega⟩
  case owned =>
    obtain ⟨occurrence, present, named, same⟩ := waits
    refine ⟨formed.owned.occurrenceScopes, fun found inside => ?_, fun found inside => ?_, fun found inside => ?_,
      formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
    · rcases members found inside with old | rfl
      · exact formed.owned.itemScopes found old
      · exact same.2 ▸ formed.owned.occurrenceScopes occurrence present
    · rcases members found inside with old | rfl
      · exact formed.owned.itemOccurrences found old
      · exact ⟨occurrence, present, named, same⟩
    · rcases members found inside with old | rfl
      · exact formed.owned.attachments found old
      · exact hangs
  case rooted =>
    exact ⟨formed.rooted.1, formed.rooted.2.1, fun scope inside =>
      Within.congr (s := s) (t := { s with openItems := s.openItems ++ [item] }) rfl (formed.rooted.2.2 scope inside)⟩
  case claimed =>
    refine ⟨fun found inside attached reserved other held same => ?_, fun request queued => ?_,
      formed.claimed.signalsApart, formed.claimed.tokensApart, formed.claimed.queuesApart, formed.claimed.uncompleted,
      formed.claimed.scopesIssued, formed.claimed.innerPlaced⟩
    · obtain ⟨occurrence, present, named, unbegun⟩ := reserved
      exact Classical.byContradiction fun differ =>
        shared found inside other held (Ne.symm differ) same.symm occurrence present named unbegun attached
    · obtain ⟨nodup, beginnable⟩ := formed.claimed.named request queued
      refine ⟨nodup, fun id named => ?_⟩
      obtain ⟨issuedBelow, facts⟩ := beginnable id named
      refine ⟨issuedBelow, fun found present same => ?_⟩
      obtain ⟨unbegun, free, instance_⟩ := facts found present same
      refine ⟨unbegun, fun waiting inside => ?_, fun stands => by
        rw [instances, instances]
        exact instance_ stands⟩
      rcases members waiting inside with old | rfl
      · exact free waiting old
      · refine ⟨fun equal => unnamed request queued (equal ▸ named), fun hung => ?_⟩
        obtain ⟨host, hostIn, hostNamed, begun⟩ := hangs id hung
        have := nodup_map_eq formed.distinct.occurrences hostIn present (hostNamed.trans same.symm)
        subst this
        simp [begun.1] at unbegun

/-- An item opened at the counter for a begun occurrence that stands, of an element the program declares no start
Event, keeps a state well-formed: it holds no reservation, so nothing queued begins what it waits for. -/
theorem openItem_wellFormed {s : State} (formed : WellFormed program s) (kind : OpenKind) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) (begun : occurrence.begun = true)
    (unstarted : (program.element? occurrence.element).bind (·.start?) = none) :
    WellFormed program (s.openItem kind occurrence) := by
  rw [openItem_eq]
  have counted : WellFormed program { s with nextIssue := s.nextIssue + 1 } := by
    have := issue_wellFormed formed
    rw [issue_eq] at this
    exact this
  exact addItem_wellFormed counted (fun other inside => formed.issued.items other inside) (Nat.lt_succ_self _)
    ⟨occurrence, member, rfl, rfl, rfl⟩ (fun _ hung => by simp at hung)
    (fun _ _ _ found present same => by rw [nodup_map_eq formed.distinct.occurrences present member same]; exact begun)
    (begun_unnamed formed member begun) (fun attached => by simp at attached)
    (fun started => by simp [unstarted] at started)

/-- A subscription opened in a scope occurrence that stands, hanging, if at all, on a begun occurrence there, keeps a
state well-formed: its reservation is fresh, so no item and nothing queued names it. -/
theorem openSubscription_wellFormed {s : State} (formed : WellFormed program s) (kind : OpenKind) (element : ElementId)
    {scope : ScopeOccurrenceId} (stands : scope ∈ scopeIds s) {host : Option Nat}
    (hangs : ∀ id, host = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = scope) (passive : Bool) :
    WellFormed program (s.openSubscription kind element scope host passive).1 := by
  rw [openSubscription_eq]
  have reserves := reserve_reserves formed.activations element scope
  obtain ⟨reserved, unnamed⟩ := reserves.wellFormed formed stands
  generalize s.reserve element scope = pair at reserves reserved unnamed
  obtain ⟨t, reservation⟩ := pair
  dsimp only at reserves reserved unnamed ⊢
  have counted : WellFormed program { t with nextIssue := t.nextIssue + 1 } := by
    have := issue_wellFormed reserved
    rw [issue_eq] at this
    exact this
  have above : ∀ other ∈ t.openItems, other.occurrence ≠ reservation.id := fun other inside same => by
    obtain ⟨waited, present, named, _⟩ := formed.owned.itemOccurrences other (reserves.openItems ▸ inside)
    have := formed.issued.occurrences waited present
    have := reserves.id
    omega
  have unbegun : Unbegun t reservation.id := fun occurrence present named => by
    rw [reserves.occurrences] at present
    rcases List.mem_append.mp present with old | new
    · have := formed.issued.occurrences occurrence old
      have := reserves.id
      omega
    · rw [List.mem_singleton.mp new]
      exact reserves.unbegun
  refine addItem_wellFormed counted (fun other inside => reserved.issued.items other inside) (Nat.lt_succ_self _)
    ⟨reservation, by rw [reserves.occurrences]; simp, rfl, reserves.kind, reserves.placed⟩ (fun id hung => ?_)
    (fun other inside same => absurd same (above other inside)) unnamed (fun _ => unbegun) (fun _ => unbegun)
  obtain ⟨occurrence, present, rest⟩ := hangs id hung
  exact ⟨occurrence, by rw [reserves.occurrences]; exact List.mem_append_left _ present, rest⟩

/-- A begun occurrence that stands has settled. -/
theorem begun_settled {s : State} (formed : WellFormed program s) {occurrence : Occurrence} (member : occurrence ∈ s.occurrences)
    (begun : occurrence.begun = true) : Settled s occurrence.id :=
  ⟨formed.issued.occurrences occurrence member, fun other inside same => by
    rw [nodup_map_eq formed.distinct.occurrences inside member same]
    exact begun, begun_unnamed formed member begun⟩

/-- A queued signal other than a begin keeps what has settled. -/
theorem Settled.signal {s : State} {id : Nat} (settled : Settled s id) {signal : Signal}
    (notBegin : ∀ request, signal ≠ .begin request) : Settled (s.signal signal) id := by
  rw [signal_eq]
  exact settled.transport (Nat.le_refl _) (fun _ member _ => .inl member) fun request queued =>
    queued.elim (fun queued => .inl ((List.mem_append.mp queued).resolve_right fun new =>
      notBegin request (List.mem_singleton.mp new).symm)) .inr

/-- Replacing the slots keeps a state well-formed when what they complete has settled: no other clause reads them. -/
theorem slots_wellFormed {s : State} (formed : WellFormed program s) {slots : FeatureSlots}
    (settled : SlotsSettled { s with slots }) : WellFormed program { s with slots } := by
  have keys : key { s with slots } = key s := funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  exact {
  issued := ⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences,
    formed.owned.attachments, formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
    Within.congr (s := s) (t := { s with slots }) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := formed.failure
  queue := ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends⟩
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := formed.claimed.shrink (fun _ member => member) (fun _ member => member) formed.owned.occurrenceScopes
    (fun _ member => member) (fun _ _ => by apply instanceOf_congr <;> rfl) (Nat.le_refl _) (.refl _) (.refl _)
  settled := settled
  attachedReserved := formed.attachedReserved
  typed := formed.typed }

/-- A pair of a list with entries appended lies in the list when neither of its entries is appended. -/
theorem pair_of_append_absent {α : Type} {a b : α} {l m : List α} (pair : [a, b].Sublist (l ++ m))
    (first : a ∉ m) (second : b ∉ m) : [a, b].Sublist l := by
  obtain ⟨front, back, split, rest⟩ := List.sublist_append_iff.mp pair
  obtain ⟨inFront, inBack⟩ := rest
  match back, inBack with
  | [], _ => rw [List.append_nil] at split; exact split ▸ inFront
  | x :: _, sub =>
    have inPair : x ∈ [a, b] := split ▸ List.mem_append_right _ (List.mem_cons_self ..)
    have inM : x ∈ m := sub.subset (List.mem_cons_self ..)
    rcases List.mem_cons.mp inPair with rfl | later
    · exact absurd inM first
    · exact absurd ((List.mem_singleton.mp later) ▸ inM) second

/-- `State.emit` queues flow tokens in a scope occurrence that stands: no begin, so the claims stay as they were. -/
theorem emit_wellFormed {s : State} (formed : WellFormed program s) (flows : List FlowId) {scope : ScopeOccurrenceId}
    (stands : scope ∈ scopeIds s) : WellFormed program (s.emit flows scope) := by
  rw [emit_eq]
  have flowsOnly : ∀ request, Token.begin request ∉ flows.map (Token.flow · scope) := by simp
  have old : ∀ request, Token.begin request ∈ s.tokens ++ flows.map (Token.flow · scope) →
      Token.begin request ∈ s.tokens := fun request queued =>
    (List.mem_append.mp queued).resolve_right (flowsOnly request)
  have queuedOld : ∀ request, Queued { s with tokens := s.tokens ++ flows.map (Token.flow · scope) } request →
      Queued s request := fun request queued => queued.elim .inl fun queued => .inr (old request queued)
  have keys : key { s with tokens := s.tokens ++ flows.map (Token.flow · scope) } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  refine ⟨⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩,
    ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩,
    formed.startedOnce, ⟨formed.activations.keys, formed.activations.positive⟩,
    by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations,
    ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences, formed.owned.attachments,
      formed.owned.scopeOwners, formed.owned.variableScopes, fun token member => ?_⟩,
    ⟨formed.rooted.1, formed.rooted.2.1, fun x member => Within.congr (s := s)
      (t := { s with tokens := s.tokens ++ flows.map (Token.flow · scope) }) rfl (formed.rooted.2.2 x member)⟩,
    ⟨formed.variables.scopes, formed.variables.names⟩, formed.failure,
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends⟩, formed.counted,
    by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted, formed.ownedBelow,
    ⟨formed.claimed.attached, fun request queued => (formed.claimed.named request (queuedOld request queued)).imp id
      fun beginnable id named => (beginnable id named).congr rfl rfl rfl rfl (instanceOf_congr rfl rfl),
    formed.claimed.signalsApart, fun first second pair => formed.claimed.tokensApart first second ?_,
    fun first second signal token => formed.claimed.queuesApart first second signal (old second token),
    fun request id leave writes rule queued named completed =>
      formed.claimed.uncompleted request id leave writes rule (queuedOld request queued) named completed,
    fun request queued => formed.claimed.scopesIssued request (queuedOld request queued),
    fun request queued => formed.claimed.innerPlaced request (queuedOld request queued)⟩,
    formed.settled.transport (.same rfl) (Nat.le_refl _) (fun _ member _ => .inl member) queuedOld
      (fun _ member => member) (fun _ member => .inl member), formed.attachedReserved, formed.typed⟩
  · rcases List.mem_append.mp member with old | new
    · exact formed.owned.tokenScopes token old
    · obtain ⟨flow, _, rfl⟩ := List.mem_map.mp new
      rw [busyScope_flow]
      exact stands
  · exact pair_of_append_absent pair (flowsOnly first) (flowsOnly second)

/-! ## Beginning occurrences -/

/-- The begin of a request whose reservations are beginnable and unclaimed, in a scope occurrence that stands. -/
theorem begin_wellFormed {state : State} (formed : WellFormed program state) (request : BeginRequest) (role : ActivationRole)
    (sourceType : String) (stands : request.scope ∈ scopeIds state)
    (admitted : ∀ id ∈ names request, Beginnable state request.scope id ∧ Unclaimed state id) :
    WellFormed program (state.beginOccurrence request role sourceType).1 :=
  (beginOccurrence_begins formed.activations request role sourceType).wellFormed formed stands admitted

/-- An admitted request's start Event reservation stays beginnable, unclaimed and placed after its begin, in the
scope occurrence the begun occurrence runs in. -/
theorem Begins.entry {before after : State} {request : BeginRequest} {role : ActivationRole} {sourceType : String}
    {begun : Occurrence} (begins : Begins before after request role sourceType begun) (nodup : (names request).Nodup)
    (admitted : ∀ id ∈ names request, Beginnable before request.scope id ∧ Unclaimed before id)
    (placed : InnerPlaced before request) :
    ∀ id ∈ request.inner.toList, Beginnable after begun.scope id ∧ Unclaimed after id ∧
      ∀ occurrence ∈ after.occurrences, occurrence.id = id → occurrence.scope = begun.scope := by
  intro id inner
  have named : id ∈ names request := List.mem_append_right _ inner
  obtain ⟨⟨below, facts⟩, unclaimed⟩ := admitted id named
  have other : begun.id ≠ id := by
    rcases begins.source with ⟨reserved, reservation⟩ | fresh
    · intro equal
      have apart := (List.nodup_append.mp nodup).2.2
      exact apart reserved.id (by simp [reservation.named]) id inner (reservation.id ▸ equal)
    · have := fresh.id
      omega
  have issued : before.nextIssue ≤ after.nextIssue := by
    rcases begins.source with ⟨_, reservation⟩ | fresh
    · exact Nat.le_of_eq reservation.nextIssue.symm
    · have := fresh.nextIssue
      omega
  refine ⟨⟨by omega, fun occurrence member same => ?_⟩, ?_, fun occurrence member same => ?_⟩
  · rw [begins.occurrences] at member
    rcases List.mem_append.mp member with old | new
    · obtain ⟨unbegun, free, instance_⟩ := facts occurrence (List.mem_filter.mp old).1 same
      refine ⟨unbegun, by simpa [begins.openItems] using free, fun present => ?_⟩
      rw [begins.instances, begins.instances, begins.scope]
      exact instance_ (by simpa [scopeIds, begins.scopes, begins.scope] using present)
    · exact absurd ((List.mem_singleton.mp new) ▸ same) other
  · exact ⟨by simpa [Queued, begins.signals, begins.tokens] using unclaimed.1,
      by simpa [begins.signals] using unclaimed.2.1,
      fun completes => unclaimed.2.2
        (SlotCompletes.shrink (before := before) begins.slots (fun _ member => begins.signals ▸ member) completes)⟩
  · rw [begins.occurrences] at member
    rcases List.mem_append.mp member with old | new
    · rw [begins.scope]
      exact placed id inner occurrence (List.mem_filter.mp old).1 same
    · exact absurd ((List.mem_singleton.mp new) ▸ same) other

/-- Such a begin leaves the request's start Event reservation beginnable and unclaimed where its occurrence runs. -/
theorem begin_entry {state : State} (formed : WellFormed program state) (request : BeginRequest) (role : ActivationRole)
    (sourceType : String) (nodup : (names request).Nodup)
    (admitted : ∀ id ∈ names request, Beginnable state request.scope id ∧ Unclaimed state id)
    (placed : InnerPlaced state request) :
    ∀ id ∈ request.inner.toList, Beginnable (state.beginOccurrence request role sourceType).1
        (state.beginOccurrence request role sourceType).2.scope id ∧
      Unclaimed (state.beginOccurrence request role sourceType).1 id ∧
      ∀ occurrence ∈ (state.beginOccurrence request role sourceType).1.occurrences, occurrence.id = id →
        occurrence.scope = (state.beginOccurrence request role sourceType).2.scope :=
  (beginOccurrence_begins formed.activations request role sourceType).entry nodup admitted placed

/-- A reservation in a scope occurrence that stands, which nothing queued names. -/
theorem reserve_wellFormed {state : State} (formed : WellFormed program state) (element : ElementId)
    (scope : ScopeOccurrenceId) (stands : scope ∈ scopeIds state) :
    WellFormed program (state.reserve element scope).1 ∧
      ∀ request, Queued (state.reserve element scope).1 request → (state.reserve element scope).2.id ∉ names request :=
  (reserve_reserves formed.activations element scope).wellFormed formed stands

/-- Starting an occurrence that no queued begin names and no open item waits on. -/
theorem startReserved_wellFormed {state : State} (formed : WellFormed program state) {occurrence : Occurrence}
    (sourceType : String) (member : occurrence ∈ state.occurrences)
    (unnamed : ∀ request, Queued state request → occurrence.id ∉ names request)
    (waitless : ∀ item ∈ state.openItems, item.occurrence ≠ occurrence.id) :
    WellFormed program (state.startReserved occurrence sourceType).1 := by
  cases begun : occurrence.begun
  · exact (startReserved_starts state sourceType begun).wellFormed formed member begun unnamed waitless
  · rw [startReserved_begun state sourceType begun]
    exact formed

/-- Starting an occurrence that no queued begin names, then closing the items that wait for it, as the completion
pipeline does: the closing leaves no item on what began, so the start begins nothing an item holds. -/
theorem startReserved_closeOwnItems_wellFormed {state : State} (formed : WellFormed program state)
    {occurrence : Occurrence} (sourceType : String) (member : occurrence ∈ state.occurrences)
    (unnamed : ∀ request, Queued state request → occurrence.id ∉ names request) :
    WellFormed program ((state.startReserved occurrence sourceType).1.closeOwnItems occurrence.id) := by
  have closed := closeOwnItems_wellFormed formed occurrence.id
  rw [closeOwnItems_eq] at closed ⊢
  cases begun : occurrence.begun
  · have starts_ := startReserved_starts state sourceType begun
    generalize (state.startReserved occurrence sourceType).1 = started at starts_ ⊢
    have instances : ∀ x, State.instanceOf { started with
        openItems := started.openItems.filter (·.occurrence != occurrence.id) } x =
        State.instanceOf { state with openItems := state.openItems.filter (·.occurrence != occurrence.id) } x := by
      intro x
      have after : State.instanceOf { started with openItems := started.openItems.filter (·.occurrence != occurrence.id) } x =
          started.instanceOf x := by apply instanceOf_congr <;> rfl
      have before : State.instanceOf { state with openItems := state.openItems.filter (·.occurrence != occurrence.id) } x =
          state.instanceOf x := by apply instanceOf_congr <;> rfl
      rw [after, before, starts_.instances x]
    refine StartsReserved.wellFormed (sourceType := sourceType) closed ⟨starts_.occurrences, ?_, starts_.scopes, instances, starts_.activations,
      starts_.nextIssue, by simp [starts_.openItems], starts_.tokens, starts_.signals, starts_.variables, starts_.journal,
      starts_.status, starts_.failure, starts_.slots⟩ member begun (fun request queued => unnamed request queued)
      fun item inside => by simpa using (List.mem_filter.mp inside).2
    have filtered : State.instanceOf { state with openItems := state.openItems.filter (·.occurrence != occurrence.id) }
        occurrence.scope = state.instanceOf occurrence.scope := by apply instanceOf_congr <;> rfl
    rw [starts_.started]
    simp only [key, instances, filtered, starts_.instances]
  · rw [startReserved_begun state sourceType begun]
    exact closed

/-- The begin at the head of the signal queue may begin once it leaves the queue: what it names is beginnable, and
nothing left queued claims it. -/
theorem admitted_signal {state : State} (formed : WellFormed program state) {request : BeginRequest} {rest : List Signal}
    (head : state.signals = .begin request :: rest) :
    (names request).Nodup ∧ (∀ id ∈ names request,
      Beginnable { state with signals := rest } request.scope id ∧ Unclaimed { state with signals := rest } id) ∧
      InnerPlaced { state with signals := rest } request := by
  have queued : Queued state request := .inl (head ▸ List.mem_cons_self ..)
  obtain ⟨nodup, beginnable⟩ := formed.claimed.named request queued
  refine ⟨nodup, fun id named => ⟨(beginnable id named).congr rfl rfl rfl rfl (instanceOf_congr rfl rfl), ?_, ?_,
    fun completes => formed.settled.free queued named (SlotCompletes.shrink (before := state)
      (after := { state with signals := rest }) rfl
      (fun _ member => by rw [head]; exact List.mem_cons_of_mem _ member) completes)⟩,
    formed.claimed.innerPlaced request queued⟩
  · intro other (claimed : Signal.begin other ∈ rest ∨ Token.begin other ∈ state.tokens)
    rcases claimed with signal | token
    · exact formed.claimed.signalsApart request other (head ▸ List.cons_sublist_cons.mpr (List.singleton_sublist.mpr signal))
        id named
    · exact formed.claimed.queuesApart request other (head ▸ List.mem_cons_self ..) token id named
  · intro leave writes rule completed
    exact formed.claimed.uncompleted request id leave writes rule queued named (head ▸ List.mem_cons_of_mem _ completed)

/-- The begin the closure takes from the work stack, from its top or its bottom, may begin once it leaves the stack. -/
theorem admitted_token {state : State} (formed : WellFormed program state) {request : BeginRequest} {rest : List Token}
    (taken : state.tokens = .begin request :: rest ∨ state.tokens = rest ++ [.begin request]) :
    (names request).Nodup ∧ (∀ id ∈ names request,
      Beginnable { state with tokens := rest } request.scope id ∧ Unclaimed { state with tokens := rest } id) ∧
      InnerPlaced { state with tokens := rest } request := by
  have member : Token.begin request ∈ state.tokens := by
    rcases taken with top | bottom
    · exact top ▸ List.mem_cons_self ..
    · exact bottom ▸ List.mem_append_right _ (List.mem_singleton_self _)
  have queued : Queued state request := .inr member
  obtain ⟨nodup, beginnable⟩ := formed.claimed.named request queued
  refine ⟨nodup, fun id named => ⟨(beginnable id named).congr rfl rfl rfl rfl (instanceOf_congr rfl rfl), ?_, ?_,
    fun completes => formed.settled.free queued named
      (SlotCompletes.shrink (before := state) (after := { state with tokens := rest }) rfl (fun _ member => member)
        completes)⟩,
    formed.claimed.innerPlaced request queued⟩
  · intro other (claimed : Signal.begin other ∈ state.signals ∨ Token.begin other ∈ rest) inOther
    rcases claimed with signal | token
    · exact formed.claimed.queuesApart other request signal member id inOther named
    · rcases taken with top | bottom
      · exact formed.claimed.tokensApart request other
          (top ▸ List.cons_sublist_cons.mpr (List.singleton_sublist.mpr token)) id named inOther
      · exact formed.claimed.tokensApart other request
          (by rw [bottom]; exact (List.singleton_sublist.mpr token).append (.refl [_])) id inOther named
  · intro leave writes rule completed
    exact formed.claimed.uncompleted request id leave writes rule queued named completed

/-- A queued completion completes nothing a queued begin names. -/
theorem complete_unnamed {state : State} (formed : WellFormed program state) {id : Nat} {leave : Leave}
    {writes : List (String × Value)} {rule : WriteRule}
    (completed : Signal.complete id leave writes rule ∈ state.signals) :
    ∀ request, Queued state request → id ∉ names request :=
  fun request queued named => formed.claimed.uncompleted request id leave writes rule queued named completed

/-- An occurrence's scope occurrence stands. -/
theorem housed_wellFormed {s : State} (formed : WellFormed program s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) : ∃ entry ∈ s.scopes, entry.id = occurrence.scope :=
  List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)

/-- Clearing a present scope occurrence keeps a state well-formed under `Cleared.wellFormed`'s conditions on what it
keeps and what it leaves hanging. -/
theorem clearInside_wellFormed {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} {keep : List Nat}
    (present : scope ∈ scopeIds s)
    (kept : ∀ occurrence ∈ s.occurrences, occurrence.id ∈ keep → ¬ StrictlyWithin s occurrence.scope scope)
    (attached : ∀ item ∈ s.openItems, (¬ Within s item.scope scope ∨ item.occurrence ∈ keep) → ∀ host,
      item.attachedTo = some host → ∀ occurrence ∈ s.occurrences, occurrence.id = host →
        ¬ Within s occurrence.scope scope ∨ host ∈ keep) :
    WellFormed program (s.clearInside scope keep) :=
  (clearInside_cleared formed present keep).wellFormed formed present kept attached

/-- `Step.endInstance`: the instance root cleared, with a failure exactly when the instance fails. Every scope
occurrence lies within the root, so nothing is kept and nothing is left hanging. -/
theorem endInstance_wellFormed {s : State} (formed : WellFormed program s) {status : InstanceStatus}
    {failure : Option InstanceFailure} (recorded : failure.isSome = true ↔ status = .failed) :
    WellFormed program { s.clearInside State.root with status, failure } := by
  obtain ⟨rootPresent, _, reach⟩ := formed.rooted
  refine (clearInside_wellFormed formed rootPresent (fun _ _ none => by simp at none) ?_).withStatus (fun _ => by apply instanceOf_congr <;> rfl) recorded
  intro item member left
  obtain ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.itemScopes item member)
  rcases left with outside | none
  · exact absurd (named ▸ reach entry inside) outside
  · simp at none

end Kernel.Laws.State
