module

public import Kernel.Laws.State

/-! # Laws of the kernel state: what the operations keep

That the state operations `Step` and the hooks apply keep `WellFormed` under the conditions their callers establish,
composed from what `Kernel.Laws.State` shows each operation does to the fields and the frames of
`Kernel.Laws.State.Frames`, `Kernel.Laws.State.Clear` and `Kernel.Laws.State.Issue`; it reads no body. `Kernel.Laws.State.Begin` adds the
begins and what the closure reads of its heads, `Kernel.Laws.State.Removal` the removal of an occurrence and
`Kernel.Laws.State.Variables` the variable writes; `Kernel.Proofs.Step` assembles them into `Laws.Step.Phases` and
`Kernel.Proofs.State` into `Laws.Step.Operations`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## The fresh instance -/

/-- A fresh instance's variables are keyed, whatever bindings the start supplied (#147). -/
theorem initial_variablesKeyed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    VariablesKeyed (State.initial instanceId variables businessKey) where
  scopes := by simp [initial_eq]
  names := by
    intro vars member
    simp only [initial_eq, List.mem_singleton] at member
    subst member
    exact keyed_names variables

/-- A start's fresh instance; `Kernel.Proofs.Step` queues its root's arming (`signal_queueSound`). -/
theorem initial_wellFormed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    WellFormed program (State.initial instanceId variables businessKey) where
  issued := ⟨by simp [initial_eq], by simp [initial_eq], by simp [initial_eq, root_eq]⟩
  distinct := ⟨by simp [occurrenceIds, initial_eq], by simp [initial_eq],
    by simp [scopeIds, initial_eq], by simp [initial_eq]⟩
  startedOnce := by simp [StartedOnce, starts, initial_eq]
  activations := ⟨by simp [initial_eq], by simp [initial_eq]⟩
  reservations := by simp [ReservationsUnstarted, initial_eq]
  owned := ⟨by simp [initial_eq], by simp [initial_eq], by simp [initial_eq], by simp [initial_eq],
    by simp [initial_eq], by simp [scopeIds, initial_eq], by simp [initial_eq]⟩
  rooted := ⟨by simp [scopeIds, initial_eq], by simp [initial_eq], by
    simp only [initial_eq, List.mem_singleton]; rintro scope rfl; exact .refl _⟩
  variables := ⟨by simp [initial_eq], fun vars member => by
    simp only [initial_eq, List.mem_singleton] at member
    subst member
    exact keyed_names variables⟩
  failure := by simp [FailureRecorded, initial_eq]
  queue := ⟨by simp [initial_eq], by simp [initial_eq], by simp [initial_eq], by simp [initial_eq],
    by simp [initial_eq]⟩
  counted := by simp [StartsCounted, starts, initial_eq]
  occurrencesCounted := by simp [OccurrencesCounted, initial_eq]
  ownedBelow := by simp [OwnedBelow, initial_eq]
  claimed := ⟨by simp [initial_eq], by simp [Queued, initial_eq], by simp [Precedes, initial_eq],
    by simp [Precedes, initial_eq], by simp [initial_eq], by simp [Queued, initial_eq],
    by simp [Queued, initial_eq], by simp [Queued, initial_eq]⟩
  settled := ⟨by simp [initial_eq], by simp [initial_eq], by simp [initial_eq], by simp [initial_eq],
    by simp [initial_eq], by simp [initial_eq], by simp [initial_eq], by simp [initial_eq]⟩
  attachedReserved := by simp [AttachedReserved, initial_eq]
  typed := by simp [Typed, initial_eq]
  worked := by simp [Worked, initial_eq]
  roles := by simp [EventRoles, initial_eq]
  bodyRoles := by simp [BodyRoles, initial_eq]
  itemRoles := by simp [ItemRoles, initial_eq]
  raises := by simp [RaisesSound, initial_eq]

/-- The fresh instance's root was issued. -/
theorem initial_rootIssued (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    State.root.value < (State.initial instanceId variables businessKey).nextIssue := by
  simp [initial_eq, root_eq]

/-- The fresh instance runs no Multi-Instance body. -/
theorem initial_bodies (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    (State.initial instanceId variables businessKey).slots.multiInstances = [] := by simp [initial_eq]

/-- The fresh instance holds no occurrence, queued signal or token, and no compensation run. -/
theorem initial_empty (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    let s := State.initial instanceId variables businessKey
    s.occurrences = [] ∧ s.signals = [] ∧ s.tokens = [] ∧ s.slots.compensation.runs = [] := by
  simp [initial_eq]

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

/-- `closeOwnItems` keeps the scope occurrences and the occurrences, and leaves only items that wait for another
occurrence. -/
theorem closeOwnItems_facts (state : State) (id : Nat) :
    (state.closeOwnItems id).scopes = state.scopes ∧ (state.closeOwnItems id).occurrences = state.occurrences ∧
      (∀ item ∈ (state.closeOwnItems id).openItems, item ∈ state.openItems) ∧
      ∀ item ∈ (state.closeOwnItems id).openItems, item.occurrence ≠ id := by
  rw [closeOwnItems_eq]
  refine ⟨rfl, rfl, fun item member => (List.mem_filter.mp member).1, fun item member => ?_⟩
  simpa using (List.mem_filter.mp member).2

/-- Replacing what open items wait for, each keeping its identity, element, scope occurrence, occurrence and
attachment, keeps a state well-formed when a start Event's item still waits for a trigger and an item that waited for a
trigger still does: no other clause reads what an item waits for. -/
theorem rekind_wellFormed {s : State} (formed : WellFormed program s) {change : OpenItem → OpenItem}
    (kept : ∀ item, change item = { item with kind := (change item).kind })
    (waits : ∀ item ∈ s.openItems, ((program.element? item.element).bind (·.start?)).isSome = true →
      AwaitsTrigger (change item).kind)
    (working : ∀ item ∈ s.openItems, AwaitsTrigger item.kind → AwaitsTrigger (change item).kind) :
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
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends, formed.queue.completes⟩, formed.counted,
    ?occurrencesCounted, formed.ownedBelow, ?claimed,
    formed.settled.transport (.same rfl) (Nat.le_refl _) (fun _ member _ => .inl member) (fun _ queued => queued)
      (fun _ member => member) (fun _ member => .inl member), ?attachedReserved, ?typed, ?worked, formed.roles,
    formed.raises.same rfl rfl rfl instances rfl rfl, formed.bodyRoles, ?itemRoles⟩
  case itemRoles =>
    refine formed.itemRoles.transport (fun item member => ?_) fun _ _ occurrence present _ => ⟨occurrence, present, rfl, rfl⟩
    obtain ⟨old, inside, rfl⟩ := back item member
    exact ⟨old, inside, by rw [kept old]⟩
  case worked =>
    intro item member working' occurrence present named
    obtain ⟨old, inside, rfl⟩ := back item member
    rw [kept old] at named
    exact formed.worked old inside (fun waiting => working' (working old inside waiting)) occurrence present named
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
    obtain ⟨unbegun, alone, uncompleted, _⟩ := formed.typed old inside started
    refine ⟨(same old).1 ▸ unbegun, fun other present named => ?_, (same old).1 ▸ uncompleted, waits old inside started⟩
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
    ends := formed.queue.ends
    completes := fun id leave writes rule queued => Nat.lt_succ_of_lt (formed.queue.completes id leave writes rule queued) }
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := formed.claimed.shrink (fun _ member => member) (fun _ member => member) formed.owned.occurrenceScopes
    (fun _ member => member) (fun _ _ => by apply instanceOf_congr <;> rfl) later (.refl _) (.refl _)
  settled := formed.settled.transport (.same rfl) later (fun _ member _ => .inl member) (fun _ queued => queued)
    (fun _ member => member) (fun _ member => .inl member)
  attachedReserved := formed.attachedReserved
  typed := formed.typed
  worked := formed.worked
  roles := formed.roles
  bodyRoles := formed.bodyRoles
  itemRoles := formed.itemRoles
  raises := formed.raises.transport (fun _ _ queued => queued) later
    (fun x present _ => ⟨present, by apply instanceOf_congr <;> rfl⟩) (fun _ counted => counted) fun _ member _ => member }

/-- Replacing the retained compensation records, and the runs by some of them, keeps a state well-formed: a run that
stays completes what it completed. -/
theorem compensation_wellFormed {s : State} (formed : WellFormed program s) {compensation : Compensations}
    (runs : ∀ run ∈ compensation.runs, run ∈ s.slots.compensation.runs) :
    WellFormed program { s with slots := { s.slots with compensation } } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _,
    fun _ => id, ⟨fun _ member => member, fun _ member => member, runs⟩⟩ rfl formed.startedOnce

/-- Queuing a signal keeps a state well-formed when the queue stays sound and the claims single, and, should it be a
completion, it completes no start Event's reservation an item holds. -/
theorem signal_wellFormed {s : State} {signal : Signal} (formed : WellFormed program s) (queue : QueueSound (s.signal signal))
    (claimed : ReservationsClaimed (s.signal signal)) (settled : SlotsSettled (s.signal signal))
    (unstarted : ∀ id leave writes rule, signal = .complete id leave writes rule → ∀ item ∈ s.openItems,
      ((program.element? item.element).bind (·.start?)).isSome = true → item.occurrence ≠ id)
    (raisable : ∀ raised origin, signal = .raise raised origin → Raisable program s origin) :
    WellFormed program (s.signal signal) := by
  rw [signal_eq] at *
  have instances : ∀ x, { s with signals := s.signals ++ [signal] }.instanceOf x = s.instanceOf x :=
    instanceOf_congr rfl rfl
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
  typed := fun item member started =>
    have ⟨unbegun, alone, uncompleted, waits⟩ := formed.typed item member started
    ⟨unbegun, alone, fun leave writes rule queued => (List.mem_append.mp queued).elim (uncompleted leave writes rule)
      fun new => unstarted _ leave writes rule (List.mem_singleton.mp new).symm item member started rfl, waits⟩
  worked := formed.worked
  roles := formed.roles
  bodyRoles := formed.bodyRoles
  itemRoles := formed.itemRoles
  raises := fun raised origin queued => by
    have carried : Raisable program s origin := by
      rcases List.mem_append.mp queued with old | new
      · exact formed.raises raised origin old
      · exact raisable raised origin (List.mem_singleton.mp new).symm
    intro event
    obtain ⟨below, counted, begun⟩ := carried event
    exact ⟨below, fun present => by rw [instances]; exact counted present, begun⟩ }

/-- A queued signal other than a begin keeps the slots settled when, should it be a compensation, it may end as it
asks (`Resumable`). Which signal it is, `Kernel.Proofs.Step` tells. -/
theorem signal_settled {s : State} {signal : Signal} (formed : WellFormed program s)
    (notBegin : ∀ request, signal ≠ .begin request)
    (compensates : ∀ scope activity trigger leave resume,
      signal = .compensate scope activity trigger leave (some resume) → Resumable s scope resume)
    (raised : ∀ raised origin host, signal = .raise raised origin → origin.host = some host → Settled s host) :
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
    fun scope activity trigger leave occurrence resume member => carry _ ?_, formed.settled.placed,
    formed.settled.runsPlaced, fun scope activity trigger leave outer context member => ?_,
    fun raised' origin host member named => carry _ ?_⟩
  · rcases List.mem_append.mp member with old | new
    · exact formed.settled.queued scope activity trigger leave occurrence resume old
    · exact (compensates scope activity trigger leave _ (List.mem_singleton.mp new).symm).1 _ _ rfl
  · rcases List.mem_append.mp member with old | new
    · exact formed.settled.grouped scope activity trigger leave outer context old
    · exact (compensates scope activity trigger leave _ (List.mem_singleton.mp new).symm).2 _ _ rfl
  · rcases List.mem_append.mp member with old | new
    · exact formed.settled.raised raised' origin host old named
    · exact raised raised' origin host (List.mem_singleton.mp new).symm named

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
    (ends : ∀ status failure, signal = .endInstance status failure → (failure.isSome = true ↔ status = .failed))
    (completes : ∀ id leave writes rule, signal = .complete id leave writes rule → id < s.nextIssue) :
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
    · exact ends status failure (List.mem_singleton.mp new).symm
  completes id leave writes rule queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.completes id leave writes rule old
    · exact completes id leave writes rule (List.mem_singleton.mp new).symm }

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
    (typed : ((program.element? item.element).bind (·.start?)).isSome = true → Unbegun s item.occurrence ∧
      (∀ leave writes rule, Signal.complete item.occurrence leave writes rule ∉ s.signals) ∧ AwaitsTrigger item.kind)
    (working : ¬ AwaitsTrigger item.kind → ∀ occurrence ∈ s.occurrences, occurrence.id = item.occurrence →
      occurrence.begun = true)
    (roled : ∀ occurrence ∈ s.occurrences, occurrence.id = item.occurrence → occurrence.role = .element) :
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
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends, formed.queue.completes⟩, formed.counted,
    by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted, formed.ownedBelow, ?claimed,
    formed.settled.transport (.same rfl) (Nat.le_refl _) (fun _ member _ => .inl member) (fun _ queued => queued)
      (fun _ member => member) (fun _ member => .inl member), ?attachedReserved, ?typed, ?worked, formed.roles,
    formed.raises.same rfl rfl rfl instances rfl rfl, formed.bodyRoles, ?itemRoles⟩
  case itemRoles =>
    intro found inside
    rcases members found inside with old | rfl
    · exact formed.itemRoles found old
    · exact roled
  case worked =>
    intro found inside
    rcases members found inside with old | rfl
    · exact formed.worked found old
    · exact working
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
    · obtain ⟨unbegun, alone, uncompleted, trigger⟩ := formed.typed found old started
      refine ⟨unbegun, fun other held same => ?_, uncompleted, trigger⟩
      rcases members other held with otherOld | rfl
      · exact alone other otherOld same
      · exact (begunShared found old same.symm (same ▸ unbegun)).elim
    · obtain ⟨unbegun, uncompleted, trigger⟩ := typed started
      refine ⟨unbegun, fun other held same => ?_, uncompleted, trigger⟩
      rcases members other held with otherOld | rfl
      · exact (begunShared other otherOld same unbegun).elim
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
    (unstarted : (program.element? occurrence.element).bind (·.start?) = none) (role : occurrence.role = .element) :
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
    (fun _ found present same => by rw [nodup_map_eq formed.distinct.occurrences present member same]; exact begun)
    fun found present same => by rw [nodup_map_eq formed.distinct.occurrences present member same]; exact role

/-- A subscription opened in a scope occurrence that stands, hanging, if at all, on a begun occurrence there, keeps a
state well-formed: its reservation is fresh, so no item and nothing queued names it. -/
theorem openSubscription_wellFormed {s : State} (formed : WellFormed program s) (kind : OpenKind) (element : ElementId)
    {scope : ScopeOccurrenceId} (stands : scope ∈ scopeIds s) {host : Option Nat}
    (hangs : ∀ id, host = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = scope) (passive : Bool)
    (waits : AwaitsTrigger kind) : WellFormed program (s.openSubscription kind element scope host passive).1 := by
  rw [openSubscription_eq]
  have reserves := reserve_reserves s element scope
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
    (fun other inside same => absurd same (above other inside)) unnamed (fun _ => unbegun)
    (fun _ => ⟨unbegun, fun leave writes rule queued => by
      have := formed.queue.completes reservation.id leave writes rule (reserves.signals ▸ queued)
      have := reserves.id
      omega, waits⟩) (fun working => absurd waits working) fun found present same => ?_
  · obtain ⟨occurrence, present, rest⟩ := hangs id hung
    exact ⟨occurrence, by rw [reserves.occurrences]; exact List.mem_append_left _ present, rest⟩
  -- What the subscription waits for is its fresh reservation, numbered under its element's counter.
  rw [reserves.occurrences] at present
  rcases List.mem_append.mp present with old | new
  · have := formed.issued.occurrences found old
    have := reserves.id
    simp only at same
    omega
  · rw [List.mem_singleton.mp new]
    exact reserves.role

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
  queue := ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends, formed.queue.completes⟩
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := formed.claimed.shrink (fun _ member => member) (fun _ member => member) formed.owned.occurrenceScopes
    (fun _ member => member) (fun _ _ => by apply instanceOf_congr <;> rfl) (Nat.le_refl _) (.refl _) (.refl _)
  settled := settled
  attachedReserved := formed.attachedReserved
  typed := formed.typed
  worked := formed.worked
  roles := formed.roles
  bodyRoles := formed.bodyRoles
  itemRoles := formed.itemRoles
  raises := formed.raises.same rfl rfl rfl (instanceOf_congr rfl rfl) rfl rfl }

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
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends, formed.queue.completes⟩, formed.counted,
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
      (fun _ member => member) (fun _ member => .inl member), formed.attachedReserved, formed.typed, formed.worked,
    formed.roles, formed.raises.same rfl rfl rfl (instanceOf_congr rfl rfl) rfl rfl, formed.bodyRoles, formed.itemRoles⟩
  · rcases List.mem_append.mp member with old | new
    · exact formed.owned.tokenScopes token old
    · obtain ⟨flow, _, rfl⟩ := List.mem_map.mp new
      rw [busyScope_flow]
      exact stands
  · exact pair_of_append_absent pair (flowsOnly first) (flowsOnly second)

end Kernel.Laws.State
