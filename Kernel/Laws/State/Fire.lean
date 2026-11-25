module

public import Kernel.Laws.State.Claim
public import Kernel.Laws.State.RemovalKeeps

/-! # Laws of the kernel state: what a fired subscription leaves

A firing (`Feature.Subscriptions.trigger`) closes the item it fires, may withdraw what an interruption ends, disarm an
Event-Based Gateway or reopen a cycle Timer, and then completes the occurrence the item waited on or, for an Event
Sub-Process start, begins the Event Sub-Process with the item's reservation. `Fired` is what the closed item leaves for
that last step; it holds through the steps between. It reads no body. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/-- What a fired item leaves: its scope occurrence stands, and the occurrence it waited on was issued, no queued begin
names it and no start Event's item waits on it, so it may be completed; an Event Sub-Process start's reservation may
begin in the item's scope occurrence, where it lies, as `Admitted` asks. -/
def Fired (program : Program) (s : State) (item : OpenItem) : Prop :=
  item.scope ∈ scopeIds s ∧ OccurrenceIssued s item.id.occurrence ∧ (∀ request, Queued s request → item.id.occurrence ∉ names request) ∧
    (∀ other ∈ itemList s.openItems, ((program.element? other.element).bind (·.start?)).isSome = true →
      other.id.occurrence ≠ item.id.occurrence) ∧
    (((program.element? item.element).bind (·.start?)).isSome = true →
      Beginnable s item.scope item.id.occurrence ∧ Unclaimed s item.id.occurrence ∧
        ∀ found ∈ s.occurrences, found.id = item.id.occurrence → found.scope = item.scope)

/-- Closing an open item keeps a state well-formed and leaves what a fired item leaves: a start Event's item holds its
unbegun reservation alone (`Typed`), so nothing waits on the reservation once it is closed, and nothing hangs on it
(`Owned.attachments`), and no slot completes it, since what a slot completes has begun (`SlotsSettled`). -/
theorem closeItem_fired {s : State} (formed : WellFormed program s) {item : OpenItem} (member : item ∈ itemList s.openItems) :
    WellFormed program (s.closeItem item.id) ∧ Fired program (s.closeItem item.id) item := by
  rw [closeItem_eq]
  refine ⟨formed.narrow {
      scopeMap := rfl, scopeOrdinals := rfl, occurrenceMap := rfl, activations := rfl, occurrenceOrdinals := rfl,
      instances := fun _ => by apply instanceOf_congr <;> rfl, recorded := id, items := .erase _, tokens := .refl _,
      signals := .refl _, starts := fun _ => id, slots := .same rfl, issued := rfl, issuing := rfl, issueNext := rfl } rfl formed.startedOnce, ?_⟩
  obtain ⟨waited, present, named, ⟨_, placed⟩⟩ := formed.owned.itemOccurrences item member
  have closed : ∀ other ∈ itemList ({ s with openItems := s.openItems.erase item.id } : State).openItems,
      other ∈ itemList s.openItems ∧ other ≠ item :=
    fun other inside => have ⟨old, differ⟩ := (mem_itemList_erase formed.distinct.items).mp (inside)
      ⟨old, fun same => differ (same ▸ rfl)⟩
  have atWaited : ∀ found ∈ s.occurrences, found.id = item.id.occurrence → found = waited := fun found inside same =>
    nodup_map_eq formed.distinct.occurrences inside present (same.trans named.symm)
  refine ⟨formed.owned.itemScopes item member, named ▸ formed.issued.occurrences waited present,
    waited_unnamed formed member, fun other inside started same => ?_, fun started => ?_⟩
  · obtain ⟨old, differ⟩ := closed other inside
    exact differ ((formed.typed other old started).2.1 item member same.symm).symm
  obtain ⟨unbegun, alone, uncompleted, _⟩ := formed.typed item member started
  have unbegunWaited := unbegun waited present named
  refine ⟨⟨named ▸ formed.issued.occurrences waited present, fun found inside same => ⟨unbegun found inside same,
    fun other held => ⟨fun equal => (closed other held).2 (alone other (closed other held).1 equal), fun hangs => ?_⟩,
    fun _ => by rw [atWaited found inside same, placed]⟩⟩, ⟨waited_unnamed formed member, uncompleted, fun completes => ?_⟩,
    fun found inside same => (atWaited found inside same) ▸ placed⟩
  · obtain ⟨host, hostIn, hostNamed, ⟨hostBegun, _⟩⟩ := formed.owned.attachments other (closed other held).1 _ hangs
    rw [atWaited host hostIn hostNamed] at hostBegun
    simp [unbegunWaited] at hostBegun
  · have settled : Settled s item.id.occurrence := by
      rcases completes with ⟨parked, inParked, same⟩ | ⟨run, inRuns, same⟩ | ⟨run, inRuns, leave, resume⟩ |
        ⟨scope, activity, trigger, ⟨leave, resume, queued⟩⟩ | ⟨raised, origin, queued, host⟩
      · exact same ▸ formed.settled.parked parked inParked
      · exact same ▸ formed.settled.bodies run inRuns
      · exact formed.settled.resumed run inRuns _ leave resume
      · exact formed.settled.queued scope activity trigger leave _ resume queued
      · exact formed.settled.raised raised origin _ queued host
    have := settled.2.1 waited present named
    simp [unbegunWaited] at this

/-- What a fired item leaves holds through a change that issues nothing back, keeps the scope occurrences and their
process instances, adds only occurrences and items it issues, each new item hanging, if at all, on a begun occurrence,
queues no begin, no completion of the item's occurrence, no compensation and no raise, and keeps the slots. -/
theorem Fired.transport {s t : State} {item : OpenItem} (fired : Fired program s item) (issued : OccurrenceGrows s t)
    (scopes : t.scopes = s.scopes) (instances : ∀ x, t.instanceOf x = s.instanceOf x)
    (occurrences : ∀ found ∈ t.occurrences, found ∈ s.occurrences ∨ ¬ OccurrenceIssued s found.id)
    (items : ∀ other ∈ itemList t.openItems, other ∈ itemList s.openItems ∨ ¬ OccurrenceIssued s other.id.occurrence ∧
      ∀ host, other.attachedTo = some host → ∃ found ∈ s.occurrences, found.id = host ∧ found.begun = true)
    (queued : ∀ request, Queued t request → Queued s request)
    (completes : ∀ leave writes rule, Signal.complete item.id.occurrence leave writes rule ∈ allSignals t →
      Signal.complete item.id.occurrence leave writes rule ∈ allSignals s)
    (slots : SlotsWithin s t)
    (compensations : ∀ scope activity trigger leave occurrence resume,
      Signal.compensate scope activity trigger leave (some (.complete occurrence resume)) ∈ allSignals t →
      Signal.compensate scope activity trigger leave (some (.complete occurrence resume)) ∈ allSignals s)
    (raises : ∀ raised origin, Signal.raise raised origin ∈ allSignals t → Signal.raise raised origin ∈ allSignals s) :
    Fired program t item := by
  obtain ⟨stands, below, unnamed, ⟨unstarted, start⟩⟩ := fired
  have old : ∀ found ∈ t.occurrences, found.id = item.id.occurrence → found ∈ s.occurrences := fun found inside same =>
    (occurrences found inside).resolve_right fun fresh => fresh (by rw [same]; exact below)
  refine ⟨by simpa [scopeIds, scopes] using stands, issued _ below, fun request named => unnamed request (queued request named),
    fun other inside started same => ?_, fun started => ?_⟩
  · rcases items other inside with kept | ⟨fresh, _⟩
    · exact unstarted other kept started same
    · exact fresh (by rw [same]; exact below)
  obtain ⟨⟨_, facts⟩, ⟨_, uncompleted, unslotted⟩, placed⟩ := start started
  refine ⟨⟨issued _ below, fun found inside same => ?_⟩, ⟨fun request named => unnamed request (queued request named),
    fun leave writes rule queued => uncompleted leave writes rule (completes leave writes rule queued), fun slotted => ?_⟩,
    fun found inside same => placed found (old found inside same) same⟩
  · obtain ⟨unbegun, free, instance_⟩ := facts found (old found inside same) same
    refine ⟨unbegun, fun other held => ?_, fun present => ?_⟩
    · rcases items other held with kept | ⟨fresh, hangs⟩
      · exact free other kept
      · refine ⟨fun same => fresh (by rw [same]; exact below), fun hung => ?_⟩
        obtain ⟨host, hostIn, hostNamed, hostBegun⟩ := hangs _ hung
        have := (facts host hostIn hostNamed).1
        simp [hostBegun] at this
    · rw [instances, instances]
      exact instance_ (by simpa [scopeIds, scopes] using present)
  · refine unslotted ?_
    rcases slotted with parked | bodies | runs | ⟨scope, activity, trigger, ⟨leave, resume, queued⟩⟩ | _
    · obtain ⟨waiting, inside, named⟩ := parked
      exact .inl ⟨waiting, slots.parked waiting inside, named⟩
    · obtain ⟨run, inside, named⟩ := bodies
      exact .inr (.inl ⟨run, slots.bodies run inside, named⟩)
    · obtain ⟨run, inside, rest⟩ := runs
      exact .inr (.inr (.inl ⟨run, slots.runs run inside, rest⟩))
    · exact .inr (.inr (.inr (.inl ⟨scope, activity, trigger, leave, resume, compensations _ _ _ _ _ _ queued⟩)))
    · obtain ⟨raised, origin, queued, host⟩ := ‹∃ raised origin, _›
      exact .inr (.inr (.inr (.inr ⟨raised, origin, raises raised origin queued, host⟩)))

/-- A change that only drops open items and occurrences keeps what a fired item leaves. -/
theorem Fired.shrink {s t : State} {item : OpenItem} (fired : Fired program s item) (scopes : t.scopes = s.scopes)
    (named : t.instanceId = s.instanceId) (signals : allSignals t = allSignals s)
    (tokens : allQueuedTokens t = allQueuedTokens s)
    (issued : OccurrenceGrows s t) (slots : t.slots = s.slots) (items : ∀ other ∈ itemList t.openItems, other ∈ itemList s.openItems)
    (occurrences : ∀ found ∈ t.occurrences, found ∈ s.occurrences) : Fired program t item :=
  fired.transport issued scopes (instanceOf_congr scopes named)
    (fun found inside => .inl (occurrences found inside)) (fun other inside => .inl (items other inside))
    (fun _ queued => by simpa [Queued, signals, tokens] using queued) (fun _ _ _ queued => signals ▸ queued)
    (.same slots) (fun _ _ _ _ _ _ queued => signals ▸ queued) fun _ _ queued => signals ▸ queued

/-- Withdrawing the items inside scope occurrences changes only the open items. -/
theorem withdrawAll_frame : ∀ (scopes : List ScopeOccurrence) (t : State),
    ∃ items, scopes.foldl (fun state entry => state.withdrawInside entry.id) t = { t with openItems := items }
  | [], t => ⟨t.openItems, rfl⟩
  | first :: rest, t => by
    obtain ⟨items, same⟩ := withdrawAll_frame rest (t.withdrawInside first.id)
    refine ⟨items, ?_⟩
    rw [List.foldl_cons, same, withdrawInside_eq]

/-- Withdrawing an occurrence's items keeps a state well-formed and what a fired item leaves. -/
theorem withdrawOccurrence_fired {s : State} (formed : WellFormed program s) {item : OpenItem} (fired : Fired program s item)
    (id : OccurrenceId) : WellFormed program (s.withdrawOccurrence id) ∧ Fired program (s.withdrawOccurrence id) item := by
  obtain ⟨withdrawn, fewer, same⟩ := withdrawAll _ _ (disarm_wellFormed (closeOwnItems_wellFormed formed id) id)
  obtain ⟨items, frame⟩ := withdrawAll_frame (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id))
    ((s.closeOwnItems id).disarm id)
  rw [← withdrawOccurrence_eq] at withdrawn fewer same frame
  refine ⟨withdrawn, fired.shrink ?_ ?_ ?_ ?_ (by rw [frame, disarm_eq, closeOwnItems_eq]; exact .refl _) ?_
    (fun other inside => ?_) fun found inside => ?_⟩
  all_goals try (rw [frame, disarm_eq, closeOwnItems_eq] <;> rfl)
  · have := fewer.items inside
    rw [disarm_eq, closeOwnItems_eq] at this
    exact (mem_itemList_filter_val.mp (mem_itemList_filter_val.mp (this)).1).1
  · rw [same, disarm_eq, closeOwnItems_eq] at inside
    exact (mem_occurrenceList_filter_val.mp inside).1

/-- Withdrawing the items inside a scope occurrence keeps a state well-formed and what a fired item leaves. -/
theorem withdrawInside_fired {s : State} (formed : WellFormed program s) {item : OpenItem} (fired : Fired program s item)
    (scope : ScopeOccurrenceId) : WellFormed program (s.withdrawInside scope) ∧ Fired program (s.withdrawInside scope) item := by
  rw [withdrawInside_eq]
  exact ⟨formed.narrow {
      scopeMap := rfl, scopeOrdinals := rfl, occurrenceMap := rfl, activations := rfl, occurrenceOrdinals := rfl,
      instances := instanceOf_congr rfl rfl,
      recorded := id, items := .filter _, tokens := .refl _, signals := .refl _, starts := fun _ => id,
      slots := .same rfl, issued := rfl, issuing := rfl, issueNext := rfl } rfl formed.startedOnce,
    fired.shrink rfl rfl rfl rfl (.refl _) rfl (fun _ inside => (mem_itemList_filter_val.mp (inside)).1) fun _ => id⟩

/-- Disarming a host keeps what a fired item leaves. -/
theorem disarm_fired {s : State} {item : OpenItem} (fired : Fired program s item) (host : OccurrenceId) :
    Fired program (s.disarm host) item := by
  rw [disarm_eq]
  exact fired.shrink rfl rfl rfl rfl (.refl _) rfl (fun _ inside => (mem_itemList_filter_val.mp (inside)).1)
    fun _ inside => (mem_occurrenceList_filter_val.mp inside).1

/-- Queuing a signal that begins nothing, completes no item's occurrence and compensates nothing keeps what a fired
item leaves. Which signal it is, `Kernel.Proofs.Step` tells. -/
theorem Fired.signal {s : State} {item : OpenItem} (fired : Fired program s item) {signal : Signal}
    (notBegin : ∀ request, signal ≠ .begin request)
    (notComplete : ∀ leave writes rule, signal ≠ .complete item.id.occurrence leave writes rule)
    (notCompensate : ∀ scope activity trigger leave resume, signal ≠ .compensate scope activity trigger leave resume)
    (notRaise : ∀ raised origin, signal ≠ .raise raised origin) :
    Fired program (s.signal signal) item := by
  rw [signal_eq]
  refine fired.transport (.refl _) rfl (instanceOf_congr rfl rfl) (fun found inside => .inl inside)
    (fun other inside => .inl (items_same inside rfl)) (fun request queued => ?_) (fun leave writes rule queued => ?_)
    (.same rfl)
    (fun scope activity trigger leave occurrence resume queued => ?_) fun raised origin queued => ?_
  · rcases queued with signal_ | token
    · rcases List.mem_append.mp (allSignals_append s _ ▸ signal_) with old | new
      · exact .inl old
      · exact absurd (List.mem_singleton.mp new).symm (notBegin request)
    · exact .inr token
  · rcases List.mem_append.mp (allSignals_append s _ ▸ queued) with old | new
    · exact old
    · exact absurd (List.mem_singleton.mp new).symm (notComplete leave writes rule)
  · rcases List.mem_append.mp (allSignals_append s _ ▸ queued) with old | new
    · exact old
    · exact absurd (List.mem_singleton.mp new).symm (notCompensate scope activity trigger leave _)
  · rcases List.mem_append.mp (allSignals_append s _ ▸ queued) with old | new
    · exact old
    · exact absurd (List.mem_singleton.mp new).symm (notRaise raised origin)

/-- Reopening a cycle Timer's subscription, in a scope occurrence that stands and hanging, if at all, on a begun
occurrence there, keeps a state well-formed and what a fired item leaves: its reservation and item are fresh. -/
theorem openSubscription_fired {s : State} (formed : WellFormed program s) {item : OpenItem} (fired : Fired program s item)
    (kind : OpenKind) (element : ElementId) {scope : ScopeOccurrenceId} (stands : scope ∈ scopeIds s) {host : Option OccurrenceId}
    (hangs : ∀ id, host = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = scope) (passive : Bool)
    (waits : AwaitsTrigger kind) : WellFormed program (s.openSubscription kind element scope host passive).1 ∧
      Fired program (s.openSubscription kind element scope host passive).1 item := by
  refine ⟨openSubscription_wellFormed formed kind element stands hangs passive waits, ?_⟩
  have reserves := reserve_reserves s element scope
  rw [openSubscription_eq]
  generalize s.reserve element scope = pair at reserves
  obtain ⟨t, reservation⟩ := pair
  dsimp only at reserves ⊢
  have fresh : ¬ OccurrenceIssued s reservation.id := reserves.fresh formed.issuer (reserves.placed ▸ stands)
  have item : OccurrenceGrows t { t with issueNext := t.issueNext + 2
                                         issued := (t.issued.insert (.fresh t.issuing t.issueNext) .position).insert
                                           (.fresh t.issuing (t.issueNext + 1)) (.item reservation.id) } :=
    .of_same rfl rfl rfl ((TableGrows.insert (reserves.issuer formed.issuer).next
      (t := { t with issued := t.issued.insert (.fresh t.issuing t.issueNext) .position }) rfl).trans
      (.insert ((reserves.issuer formed.issuer).next_succ .position) rfl))
  refine fired.transport ((reserves.occurrenceGrows formed.issuer).trans item) reserves.scopes
    (fun x => by rw [← reserves.instances x]; apply instanceOf_congr <;> rfl) (fun found inside => ?_)
    (fun other inside => ?_) (fun _ queued => queued.shrink (fun _ member => reserves.signals ▸ member) (fun _ member => reserves.tokens ▸ member))
    (fun _ _ _ queued => reserves.signals ▸ queued) (.same reserves.slots)
    (fun _ _ _ _ _ _ queued => reserves.signals ▸ queued) fun _ _ queued => reserves.signals ▸ queued
  · rcases reserves.mem_occurrences inside with old | new
    · exact .inl old
    · rw [new]
      exact .inr fresh
  · have keyedT : KeyedBy t.openItems := by rw [reserves.itemMap.1]; exact formed.distinct.items
    rcases (mem_itemList_insert keyedT (item := other) (new :=
        { id := ⟨reservation.id, .subscription, .fresh t.issuing (t.issueNext + 1)⟩, position := .fresh t.issuing t.issueNext, kind,
          element, scope, attachedTo := host, passive })).mp
      (inside) with new | ⟨old, _⟩
    · subst new
      refine .inr ⟨fresh, fun id hung => ?_⟩
      obtain ⟨occurrence, present, named, ⟨begun, _⟩⟩ := hangs id hung
      exact ⟨occurrence, present, named, begun⟩
    · exact .inl (reserves.items ▸ old)

end Kernel.Laws.State
