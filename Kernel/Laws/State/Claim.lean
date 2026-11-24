module

public import Kernel.Laws.State.Enter

/-! # Laws of the kernel state: queuing a begin that claims reservations

That queuing a begin which names reservations keeps `WellFormed` when it begins in a scope occurrence that stands, and
names distinct reservations, each beginnable there and claimed by nothing, its Event Sub-Process start reservation
lying there; and what an Event Sub-Process's entry does to its start Event's reservation (`Feature.Scopes.arriveScope`):
an interrupting one's clearing of its parent keeps it, entering the Event Sub-Process's own scope occurrence leaves it
beginnable there, and queuing an arming leaves it unclaimed. It reads no body. Which signal is queued, only
`Signal`'s owners may tell, so the lemmas take what they need of it as premises. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {le : Issue → Issue → Bool}

variable {program : Program}

open Kernel

/-- The reservations `inner` names are beginnable in `scope` and nothing claims them. -/
def Claimable (s : State) (scope : ScopeOccurrenceId) (inner : Option OccurrenceId) : Prop :=
  ∀ id ∈ inner.toList, Beginnable s scope id ∧ Unclaimed s id

/-- The first of a pair in a list with one entry appended stood before it. -/
theorem head_of_append {α : Type} {a b c : α} {l : List α} (pair : [a, b].Sublist (l ++ [c])) : a ∈ l := by
  obtain ⟨first, second, split, rest⟩ := List.sublist_append_iff.mp pair
  obtain ⟨inFirst, inSecond⟩ := rest
  cases first with
  | nil =>
    rw [List.nil_append] at split
    subst split
    have := inSecond.length_le
    simp at this
  | cons x rest =>
    simp only [List.cons_append, List.cons.injEq] at split
    exact split.1 ▸ inFirst.subset (List.mem_cons_self ..)

/-- What slots that only shrink complete, with fewer queued signals, they completed before. -/
theorem SlotCompletes.within {before after : State} (slots : SlotsWithin before after)
    (signals : ∀ signal ∈ allSignals after, signal ∈ allSignals before) {id : OccurrenceId} (completes : SlotCompletes after id) :
    SlotCompletes before id := by
  rcases completes with ⟨waiting, member, named⟩ | ⟨run, member, named⟩ | ⟨run, member, rest⟩ |
    ⟨scope, activity, trigger, rest⟩ | ⟨raised, origin, member, host⟩
  · exact .inl ⟨waiting, slots.parked waiting member, named⟩
  · exact .inr (.inl ⟨run, slots.bodies run member, named⟩)
  · exact .inr (.inr (.inl ⟨run, slots.runs run member, rest⟩))
  · obtain ⟨leave, resume, member⟩ := rest
    exact .inr (.inr (.inr (.inl ⟨scope, activity, trigger, leave, resume, signals _ member⟩)))
  · exact .inr (.inr (.inr (.inr ⟨raised, origin, signals _ member, host⟩)))

/-- A scope occurrence that calls no instance lies in its parent's process instance. -/
theorem instanceOf_child {s : State} (formed : WellFormed program s) {entry : ScopeOccurrence} (member : entry ∈ s.scopes)
    (uncalled : entry.calledInstance = none) {parent : ScopeOccurrenceId} (link : entry.parent = some parent)
    (present : parent ∈ scopeIds s) : s.instanceOf entry.id = s.instanceOf parent := by
  obtain ⟨name, chain, reading, rest⟩ := instanceIn_exists formed present
  obtain ⟨distinct, within⟩ := rest
  have parentless : ∀ found ∈ s.scopes, found.parent = none → found.id = State.root := fun found inside orphan =>
    (formed.rooted.2.1 found inside).mp orphan
  have fresh : entry.id ∉ chain.map (·.id) := fun inside => by
    obtain ⟨other, otherIn, same⟩ := List.mem_map.mp inside
    exact parent_not_within formed member link (same ▸ within other otherIn)
  rw [instanceOf_eq formed.distinct.scopes parentless (.up entry parent name chain member uncalled link reading)
      (by rw [List.map_cons]; exact List.nodup_cons.mpr ⟨fresh, distinct⟩),
    instanceOf_eq formed.distinct.scopes parentless reading distinct]

/-! ## Queuing a begin that names reservations -/

/-- Queuing a begin in a scope occurrence that stands, naming distinct reservations beginnable there that nothing
claims, its Event Sub-Process start reservation placed there, keeps the claims single. That the begin is no
completion, `Kernel.Proofs.Step` tells. -/
theorem signal_claimed_named {s : State} {request : BeginRequest} (formed : WellFormed program s)
    (stands : request.scope ∈ scopeIds s) (nodup : (names request).Nodup)
    (admitted : ∀ id ∈ names request, Beginnable s request.scope id ∧ Unclaimed s id) (placed : InnerPlaced s request)
    (notComplete : ∀ id leave writes rule, Signal.begin request ≠ .complete id leave writes rule) :
    ReservationsClaimed (s.signal (.begin request)) := by
  rw [signal_eq]
  have queued : ∀ other, Queued { s with batchSignals := s.batchSignals ++ [.begin request] } other →
      Queued s other ∨ other = request := fun other named => by
    rcases named with signal | token
    · rcases List.mem_append.mp (allSignals_append s _ ▸ signal) with old | new
      · exact .inl (.inl old)
      · exact .inr (Signal.begin.inj (List.mem_singleton.mp new))
    · exact .inl (.inr token)
  -- No reservation the new begin names is named by anything queued before it.
  have apart : ∀ other, Queued s other → ∀ id ∈ names other, id ∉ names request := fun other old id inside named =>
    (admitted id named).2.1 other old inside
  refine ⟨(fun item member attached reserved other inside same => formed.claimed.attached item
      (items_same member rfl) attached reserved other (items_same inside rfl) same), fun other queuedOther => ?_, fun first second pair id inside => ?_,
    formed.claimed.tokensApart, fun first second signal token id inside => ?_,
    fun other id leave writes rule queuedOther inside completed => ?_, fun other queuedOther => ?_,
    fun other queuedOther id inside => ?_⟩
  · rcases queued other queuedOther with old | rfl
    · exact (formed.claimed.named other old).imp id fun beginnable id inside =>
        (beginnable id inside).congr (.refl _) rfl (Laws.State.items_congr rfl) rfl fun _ => by apply instanceOf_congr <;> rfl
    · exact ⟨nodup, fun id inside =>
        (admitted id inside).1.congr (.refl _) rfl (Laws.State.items_congr rfl) rfl fun _ => by apply instanceOf_congr <;> rfl⟩
  · by_cases same : second = request
    · subst same
      exact apart first (.inl (head_of_append (allSignals_append s _ ▸ pair))) id inside
    · exact formed.claimed.signalsApart first second (pair_of_append (allSignals_append s _ ▸ pair) fun equal => same (Signal.begin.inj equal))
        id inside
  · rcases List.mem_append.mp (allSignals_append s _ ▸ signal) with old | new
    · exact formed.claimed.queuesApart first second old token id inside
    · obtain rfl := Signal.begin.inj (List.mem_singleton.mp new)
      exact fun named => apart second (.inr token) id named inside
  · rcases List.mem_append.mp (allSignals_append s _ ▸ completed) with old | new
    · rcases queued other queuedOther with earlier | rfl
      · exact formed.claimed.uncompleted other id leave writes rule earlier inside old
      · exact (admitted id inside).2.2.1 leave writes rule old
    · exact notComplete id leave writes rule (List.mem_singleton.mp new).symm
  · rcases queued other queuedOther with old | rfl
    · exact formed.claimed.scopesIssued other old
    · obtain ⟨entry, member, named⟩ := List.mem_map.mp stands
      exact named ▸ formed.issued.scopes entry member
  · rcases queued other queuedOther with old | rfl
    · exact formed.claimed.innerPlaced other old id inside
    · exact placed id inside

/-- Queuing such a begin keeps the slots settled: no slot completes what it names. That the begin is no compensation,
`Kernel.Proofs.Step` tells. -/
theorem signal_settled_named {s : State} {request : BeginRequest} (formed : WellFormed program s)
    (admitted : ∀ id ∈ names request, Unclaimed s id)
    (notCompensate : ∀ scope activity trigger leave resume,
      Signal.begin request ≠ .compensate scope activity trigger leave resume)
    (notRaise : ∀ raised origin, Signal.begin request ≠ .raise raised origin) :
    SlotsSettled (s.signal (.begin request)) := by
  rw [signal_eq]
  have queued : ∀ other, Queued { s with batchSignals := s.batchSignals ++ [.begin request] } other →
      Queued s other ∨ other = request := fun other named => by
    rcases named with signal | token
    · rcases List.mem_append.mp (allSignals_append s _ ▸ signal) with old | new
      · exact .inl (.inl old)
      · exact .inr (Signal.begin.inj (List.mem_singleton.mp new))
    · exact .inl (.inr token)
  have carry : ∀ id, Settled s id → SlotCompletes s id →
      Settled { s with batchSignals := s.batchSignals ++ [.begin request] } id := fun id settled completes => by
    obtain ⟨below, begun, unnamed⟩ := settled
    refine ⟨below, begun, fun other named inside => ?_⟩
    rcases queued other named with old | rfl
    · exact unnamed other old inside
    · exact (admitted id inside).2.2 completes
  refine ⟨fun waiting member => carry _ (formed.settled.parked waiting member) (.inl ⟨waiting, member, rfl⟩),
    fun run member => carry _ (formed.settled.bodies run member) (.inr (.inl ⟨run, member, rfl⟩)),
    fun run member occurrence leave resume => carry _ (formed.settled.resumed run member occurrence leave resume)
      (.inr (.inr (.inl ⟨run, member, leave, resume⟩))),
    fun scope activity trigger leave occurrence resume member => ?_,
    fun run member => (formed.settled.placed run member).transport (.refl _) fun _ inside => .inl inside,
    fun run member => (formed.settled.runsPlaced run member).transport (.refl _) fun _ inside => .inl inside,
    fun scope activity trigger leave context member => ?_, fun raised origin host member named => ?_⟩
  · rcases List.mem_append.mp (allSignals_append s _ ▸ member) with old | new
    · exact carry _ (formed.settled.queued scope activity trigger leave occurrence resume old)
        (.inr (.inr (.inr (.inl ⟨scope, activity, trigger, leave, resume, old⟩))))
    · exact absurd (List.mem_singleton.mp new).symm (notCompensate scope activity trigger leave _)
  · rcases List.mem_append.mp (allSignals_append s _ ▸ member) with old | new
    · exact formed.settled.grouped scope activity trigger leave context old
    · exact absurd (List.mem_singleton.mp new).symm (notCompensate scope activity trigger leave _)
  · rcases List.mem_append.mp (allSignals_append s _ ▸ member) with old | new
    · exact carry _ (formed.settled.raised raised origin host old named)
        (.inr (.inr (.inr (.inr ⟨raised, origin, old, named⟩))))
    · exact absurd (List.mem_singleton.mp new).symm (notRaise raised origin)

/-- Queuing such a begin keeps a state well-formed. -/
theorem signal_named_wellFormed {s : State} {request : BeginRequest} (formed : WellFormed program s)
    (stands : request.scope ∈ scopeIds s) (nodup : (names request).Nodup)
    (admitted : ∀ id ∈ names request, Beginnable s request.scope id ∧ Unclaimed s id) (placed : InnerPlaced s request)
    (queue : QueueSound (s.signal (.begin request)))
    (notComplete : ∀ id leave writes rule, Signal.begin request ≠ .complete id leave writes rule)
    (notCompensate : ∀ scope activity trigger leave resume,
      Signal.begin request ≠ .compensate scope activity trigger leave resume)
    (notRaise : ∀ raised origin, Signal.begin request ≠ .raise raised origin) :
    WellFormed program (s.signal (.begin request)) :=
  signal_wellFormed formed queue (signal_claimed_named formed stands nodup admitted placed notComplete)
    (signal_settled_named formed (fun id named => (admitted id named).2) notCompensate notRaise)
    (fun id leave writes rule same => absurd same (notComplete id leave writes rule))
    fun raised origin same => absurd same (notRaise raised origin)

/-! ## An Event Sub-Process's start Event reservation through its entry -/

/-- Queuing a signal that neither begins, completes nor compensates leaves reservations claimable. -/
theorem Claimable.signal {s : State} {scope : ScopeOccurrenceId} {inner : Option OccurrenceId} (claimable : Claimable s scope inner)
    {signal : Signal} (notBegin : ∀ request, signal ≠ .begin request)
    (notComplete : ∀ id leave writes rule, signal ≠ .complete id leave writes rule)
    (notCompensate : ∀ scope activity trigger leave occurrence resume,
      signal ≠ .compensate scope activity trigger leave (some (.complete occurrence resume)))
    (notRaise : ∀ raised origin, signal ≠ .raise raised origin) :
    Claimable (s.signal signal) scope inner := by
  rw [signal_eq]
  intro id inside
  obtain ⟨beginnable, unnamed, uncompleted, unslotted⟩ := claimable id inside
  refine ⟨beginnable.congr (.refl _) rfl (Laws.State.items_congr rfl) rfl fun _ => by apply instanceOf_congr <;> rfl, fun request queued => ?_,
    fun leave writes rule completed => ?_, fun completes => unslotted ?_⟩
  · rcases queued with signal_ | token
    · rcases List.mem_append.mp (allSignals_append s _ ▸ signal_) with old | new
      · exact unnamed request (.inl old)
      · exact absurd (List.mem_singleton.mp new).symm (notBegin request)
    · exact unnamed request (.inr token)
  · rcases List.mem_append.mp (allSignals_append s _ ▸ completed) with old | new
    · exact uncompleted leave writes rule old
    · exact absurd (List.mem_singleton.mp new).symm (notComplete id leave writes rule)
  · rcases completes with parked | bodies | runs | ⟨scope, activity, trigger, rest⟩ | ⟨raised, origin, member, host⟩
    · exact .inl parked
    · exact .inr (.inl bodies)
    · exact .inr (.inr (.inl runs))
    · obtain ⟨leave, resume, member⟩ := rest
      rcases List.mem_append.mp (allSignals_append s _ ▸ member) with old | new
      · exact .inr (.inr (.inr (.inl ⟨scope, activity, trigger, leave, resume, old⟩)))
      · exact absurd (List.mem_singleton.mp new).symm (notCompensate scope activity trigger leave id resume)
    · rcases List.mem_append.mp (allSignals_append s _ ▸ member) with old | new
      · exact .inr (.inr (.inr (.inr ⟨raised, origin, old, host⟩)))
      · exact absurd (List.mem_singleton.mp new).symm (notRaise raised origin)

/-- An interrupting Event Sub-Process's clearing of the scope occurrence its begun occurrence runs in, keeping that
occurrence and its start Event's reservation, which lies there, keeps a state well-formed, the occurrence standing and
the reservation claimable there: nothing attached waits on the begun occurrence (`AttachedReserved`), and no item on
the reservation (`Beginnable`). -/
theorem clearInside_inner {s : State} (formed : WellFormed program s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) (begun : occurrence.begun = true) {inner : Option OccurrenceId}
    (ready : ∀ id ∈ inner.toList, Beginnable s occurrence.scope id ∧ Unclaimed s id ∧
      ∀ found ∈ s.occurrences, found.id = id → found.scope = occurrence.scope) :
    WellFormed program (s.clearInside le occurrence.scope (occurrence.id :: inner.toList)) ∧
      occurrence ∈ (s.clearInside le occurrence.scope (occurrence.id :: inner.toList)).occurrences ∧
      Claimable (s.clearInside le occurrence.scope (occurrence.id :: inner.toList)) occurrence.scope inner := by
  have present := formed.owned.occurrenceScopes occurrence member
  have cleared := clearInside_cleared (le := le) formed present (occurrence.id :: inner.toList)
  generalize s.clearInside le occurrence.scope (occurrence.id :: inner.toList) = after at cleared ⊢
  have notStrict : ¬ StrictlyWithin s occurrence.scope occurrence.scope := fun strict => strict.2 rfl
  have kept : ∀ found ∈ s.occurrences, found.id ∈ occurrence.id :: inner.toList →
      ¬ StrictlyWithin s found.scope occurrence.scope := by
    intro found inside named
    rcases List.mem_cons.mp named with same | innerId
    · rw [nodup_map_eq formed.distinct.occurrences inside member same]
      exact notStrict
    · rw [(ready found.id innerId).2.2 found inside rfl]
      exact notStrict
  have attached : ∀ item ∈ itemList s.openItems,
      (¬ Within s item.scope occurrence.scope ∨ item.id.occurrence ∈ occurrence.id :: inner.toList) → ∀ host,
        item.attachedTo = some host → ∀ found ∈ s.occurrences, found.id = host →
          ¬ Within s found.scope occurrence.scope ∨ host ∈ occurrence.id :: inner.toList := by
    intro item inside placement host hangs found standing named
    obtain ⟨hostOccurrence, hostIn, hostId, hostFacts⟩ := formed.owned.attachments item inside host hangs
    have hostScope := hostFacts.2
    obtain rfl := nodup_map_eq formed.distinct.occurrences standing hostIn (named.trans hostId.symm)
    rcases placement with outside | held
    · exact .inl (hostScope ▸ outside)
    · exfalso
      rcases List.mem_cons.mp held with own | innerId
      · have := formed.attachedReserved item inside (by simp [hangs]) occurrence member own.symm
        simp [begun] at this
      · obtain ⟨waited, waitedIn, waitedId, _⟩ := formed.owned.itemOccurrences item inside
        obtain ⟨_, facts⟩ := (ready _ innerId).1
        exact ((facts waited waitedIn waitedId).2.1 item inside).1 rfl
  have formedAfter := cleared.wellFormed formed present kept attached
  refine ⟨formedAfter, (cleared.occurrences occurrence).mpr ⟨member, .inr (List.mem_cons_self ..)⟩,
    fun id innerId => ?_⟩
  obtain ⟨⟨below, facts⟩, ⟨unnamed, uncompleted, unslotted⟩, _⟩ := ready id innerId
  refine ⟨⟨cleared.occurrenceGrows _ below, fun found inside same => ?_⟩, fun request queued => ?_,
    fun leave writes rule completed => ?_, fun completes => unslotted ?_⟩
  · obtain ⟨unbegun, free, instance_⟩ := facts found ((cleared.occurrences found).mp inside).1 same
    refine ⟨unbegun, fun item held => free item ((cleared.items item).mp held).1, fun stands => ?_⟩
    rw [cleared.instances _ stands, cleared.instances _ (formedAfter.owned.occurrenceScopes found inside)]
    exact instance_ present
  · exact unnamed request (queued.shrink (fun _ member => cleared.signals ▸ member) (fun _ member => cleared.tokensSublist.subset member))
  · exact uncompleted leave writes rule (cleared.signals ▸ completed)
  · exact SlotCompletes.within cleared.slots (fun _ member => cleared.signals ▸ member) completes

/-- Entering a Scope's occurrence below the scope occurrence its begun occurrence runs in keeps a state well-formed, the
occurrences unchanged and the entered scope occurrence standing, and leaves a reservation claimable there that was
claimable in the parent: the entered one calls no instance, so it lies in its parent's process instance. -/
theorem enterScope_inner {s : State} (formed : WellFormed program s) (element : ElementId)
    (locals : List (String × Value)) {occurrence : Occurrence} (member : occurrence ∈ s.occurrences)
    (begun : occurrence.begun = true) {inner : Option OccurrenceId} (claimable : Claimable s occurrence.scope inner) :
    WellFormed program (s.enterScope element occurrence.scope locals (some occurrence.id)).1 ∧
      (s.enterScope element occurrence.scope locals (some occurrence.id)).1.occurrences = s.occurrences ∧
      (s.enterScope element occurrence.scope locals (some occurrence.id)).2 ∈
        scopeIds (s.enterScope element occurrence.scope locals (some occurrence.id)).1 ∧
      Claimable (s.enterScope element occurrence.scope locals (some occurrence.id)).1
        (s.enterScope element occurrence.scope locals (some occurrence.id)).2 inner := by
  have present := formed.owned.occurrenceScopes occurrence member
  have formedAfter := enterScope_wellFormed formed element present locals
    fun id named => ⟨occurrence, member, Option.some.inj named, begun, rfl⟩
  have issued := enterScope_occurrenceGrows formed.historic formed.issuer element present locals (some occurrence.id)
  rw [enterScope_eq] at formedAfter issued ⊢
  dsimp only at formedAfter issued ⊢
  generalize keyIs : occurrence.scope.child element (.fresh s.issuing s.issueNext) = key at formedAfter issued ⊢
  generalize entryIs : ScopeOccurrence.mk key (some element) (.fresh s.issuing (s.issueNext + 1)) (some occurrence.id) none
    = entry at formedAfter issued ⊢
  generalize afterIs : ({ s with
      issueNext := s.issueNext + 1 + 1
      issued := (s.issued.insert (.fresh s.issuing s.issueNext) (.scope { parent := occurrence.scope, element })).insert
        (.fresh s.issuing (s.issueNext + 1)) .position
      scopeMap := s.scopeMap.insert key entry
      variables := s.variables.insert key (Variables.ofBindings locals) } : State) = t at formedAfter issued ⊢
  have scopeMapEq : t.scopeMap = s.scopeMap.insert key entry := by rw [← afterIs]
  have entryId : entry.id = key := by rw [← entryIs]
  have grown : ∀ found ∈ s.scopes, found ∈ t.scopes := fun found inside => by
    rw [scopes_eq t, scopeMapEq]
    exact (mem_scopeList_insert_at formed.distinct.scopesKeyed entryId).mpr
      (.inr ⟨(scopes_eq s) ▸ inside, by rw [← keyIs]; exact scopes_fresh formed found inside⟩)
  have entryMember : entry ∈ t.scopes := by
    rw [scopes_eq t, scopeMapEq]; exact mem_scopeList.mpr ⟨key, Std.ExtTreeMap.getElem?_insert_self⟩
  have kept : ∀ x ∈ scopeIds s, t.instanceOf x = s.instanceOf x := fun x stands =>
    instanceOf_kept formed formedAfter.distinct.scopes
      (fun found inside orphan => (formedAfter.rooted.2.1 found inside).mp orphan) (by rw [← afterIs]) stands
      fun found inside _ => grown found inside
  have presentAfter : occurrence.scope ∈ scopeIds t := by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp present
    exact List.mem_map.mpr ⟨found, grown found inside, named⟩
  have child := instanceOf_child formedAfter entryMember (by rw [← entryIs]) (by rw [← entryIs, ← keyIs]; exact Kernel.Laws.State.ScopeOccurrenceId.parent?_child _ _ _) presentAfter
  have occurrences : t.occurrences = s.occurrences := by rw [← afterIs]
  have items : itemList t.openItems = itemList s.openItems := by rw [← afterIs]
  refine ⟨formedAfter, rfl, List.mem_map.mpr ⟨_, entryMember, entryId⟩, fun id innerId => ?_⟩
  obtain ⟨⟨below, facts⟩, unnamed, uncompleted, unslotted⟩ := claimable id innerId
  refine ⟨⟨issued _ below, fun found inside same => ?_⟩, ?_⟩
  · obtain ⟨unbegun, free, instance_⟩ := facts found (occurrences ▸ inside) same
    refine ⟨unbegun, items ▸ free, fun _ => ?_⟩
    rw [← entryId, child, kept _ present, kept _ (formed.owned.occurrenceScopes found (occurrences ▸ inside))]
    exact instance_ present
  · subst afterIs
    exact ⟨unnamed, uncompleted, unslotted⟩

end Kernel.Laws.State
