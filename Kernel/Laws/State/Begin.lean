module

public import Kernel.Laws.State.Keeps

/-! # Laws of the kernel state: beginning occurrences and the closure's heads

That beginning an admitted request, reserving an occurrence and starting a reservation keep `WellFormed`, and what the
closure reads of a well-formed state when it takes the next signal or token off its queue: a begin is admitted, a
completion completes nothing a queued begin names, a compensation may end as it asks and a raise finds what it names.
Composed from `Kernel.Laws.State.Keeps`; it reads no body. `Kernel.Proofs.Step` assembles them into `Laws.Step.Phases`.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## Beginning occurrences -/

/-- The begin of a request whose reservations are beginnable and unclaimed, in a scope occurrence that stands, under a
role that is the element's for an Event and a body's only for an element with a Multi-Instance envelope. -/
theorem begin_wellFormed {state : State} (formed : WellFormed program state) (request : BeginRequest) (role : ActivationRole)
    (sourceType : String) (stands : request.scope ∈ scopeIds state)
    (admitted : ∀ id ∈ names request, Beginnable state request.scope id ∧ Unclaimed state id)
    (roled : ((program.element? request.element).bind (·.event?)).isSome = true → role = .element)
    (bodied : role = .multiInstanceBody →
      (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true) :
    WellFormed program (state.beginOccurrence request role sourceType).1 :=
  (beginOccurrence_begins formed.activations request role sourceType).wellFormed formed stands admitted roled bodied

/-- The occurrence a request whose reservations are beginnable begins in a scope occurrence that stands owns no scope
occurrence: a fresh one is issued there under a key never issued, and a reservation is unbegun, while a scope
occurrence's owner is begun (`Owned.scopeOwners`). -/
theorem begin_unowned {state : State} (formed : WellFormed program state) (request : BeginRequest)
    (role : ActivationRole) (sourceType : String) (stands : request.scope ∈ scopeIds state)
    (admitted : ∀ id ∈ names request, Beginnable state request.scope id ∧ Unclaimed state id) :
    ∀ scope ∈ (state.beginOccurrence request role sourceType).1.scopes,
      scope.occurrence ≠ some (state.beginOccurrence request role sourceType).2.id := by
  intro scope member owned
  have begins := beginOccurrence_begins formed.activations request role sourceType
  rw [begins.scopes] at member
  obtain ⟨owner, present, named, begun⟩ := formed.owned.scopeOwners scope member _ owned
  rcases begins.source with ⟨reserved, facts⟩ | fresh
  · have unbegun := ((admitted reserved.id (by simp [names, facts.named])).1.2 owner present (named.trans facts.id)).1
    rw [begun] at unbegun
    cases unbegun
  · have below := formed.issued.occurrences owner present
    rw [named] at below
    exact fresh.fresh stands below

/-- An admitted request's start Event reservation stays beginnable, unclaimed and placed after its begin in a scope
occurrence that stands, in the scope occurrence the begun occurrence runs in. -/
theorem Begins.entry {before after : State} {request : BeginRequest} {role : ActivationRole} {sourceType : String}
    {begun : Occurrence} (begins : Begins before after request role sourceType begun)
    (stands : request.scope ∈ scopeIds before) (nodup : (names request).Nodup)
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
    · intro equal
      exact fresh.fresh stands (by rw [equal]; exact below)
  have issued : OccurrenceGrows before after := by
    rcases begins.source with ⟨_, reservation⟩ | fresh
    · exact .of_same (congrArg (List.map ScopeOccurrence.id) begins.scopes) begins.scopeOrdinals
        reservation.occurrenceOrdinals
    · exact fresh.occurrenceGrows
  refine ⟨⟨issued _ below, fun occurrence member same => ?_⟩, ?_, fun occurrence member same => ?_⟩
  · rw [begins.occurrences] at member
    rcases List.mem_append.mp member with old | new
    · obtain ⟨unbegun, free, instance_⟩ := facts occurrence (List.mem_filter.mp old).1 same
      refine ⟨unbegun, by simpa [begins.items] using free, fun present => ?_⟩
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
    (sourceType : String) (stands : request.scope ∈ scopeIds state) (nodup : (names request).Nodup)
    (admitted : ∀ id ∈ names request, Beginnable state request.scope id ∧ Unclaimed state id)
    (placed : InnerPlaced state request) :
    ∀ id ∈ request.inner.toList, Beginnable (state.beginOccurrence request role sourceType).1
        (state.beginOccurrence request role sourceType).2.scope id ∧
      Unclaimed (state.beginOccurrence request role sourceType).1 id ∧
      ∀ occurrence ∈ (state.beginOccurrence request role sourceType).1.occurrences, occurrence.id = id →
        occurrence.scope = (state.beginOccurrence request role sourceType).2.scope :=
  (beginOccurrence_begins formed.activations request role sourceType).entry stands nodup admitted placed

/-- A reservation in a scope occurrence that stands, which nothing queued names. -/
theorem reserve_wellFormed {state : State} (formed : WellFormed program state) (element : ElementId)
    (scope : ScopeOccurrenceId) (stands : scope ∈ scopeIds state) :
    WellFormed program (state.reserve element scope).1 ∧
      ∀ request, Queued (state.reserve element scope).1 request → (state.reserve element scope).2.id ∉ names request :=
  (reserve_reserves state element scope).wellFormed formed stands

/-- Starting an occurrence that no queued begin names and no open item waits on. -/
theorem startReserved_wellFormed {state : State} (formed : WellFormed program state) {occurrence : Occurrence}
    (sourceType : String) (member : occurrence ∈ state.occurrences)
    (unnamed : ∀ request, Queued state request → occurrence.id ∉ names request)
    (waitless : ∀ item ∈ itemList state.openItems, item.id.occurrence ≠ occurrence.id) :
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
        openItems := started.openItems.filter fun _ item => item.id.occurrence != occurrence.id } x =
        State.instanceOf { state with openItems := state.openItems.filter fun _ item => item.id.occurrence != occurrence.id } x := by
      intro x
      have after : State.instanceOf { started with openItems := started.openItems.filter fun _ item => item.id.occurrence != occurrence.id } x =
          started.instanceOf x := by apply instanceOf_congr <;> rfl
      have before : State.instanceOf { state with openItems := state.openItems.filter fun _ item => item.id.occurrence != occurrence.id } x =
          state.instanceOf x := by apply instanceOf_congr <;> rfl
      rw [after, before, starts_.instances x]
    refine StartsReserved.wellFormed (sourceType := sourceType) closed {
        occurrences := starts_.occurrences, started := ?_, scopes := starts_.scopes,
        scopeOrdinals := starts_.scopeOrdinals, instances := instances,
        instanceId := starts_.instanceId, activations := starts_.activations,
        occurrenceOrdinals := starts_.occurrenceOrdinals,
        itemMap := ⟨by simp [starts_.itemMap.1], starts_.itemMap.2⟩, tokens := starts_.tokens,
        signals := starts_.signals, variables := starts_.variables, journal := starts_.journal, ended := starts_.ended,
        status := starts_.status, failure := starts_.failure, slots := starts_.slots } member begun (fun request queued => unnamed request queued)
      fun item inside => by simpa using (mem_itemList_filter_val.mp (inside)).2
    have filtered : State.instanceOf { state with openItems := state.openItems.filter fun _ item => item.id.occurrence != occurrence.id }
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
  refine ⟨nodup, fun id named => ⟨(beginnable id named).congr (.refl _) rfl (Laws.State.items_congr rfl) rfl (instanceOf_congr rfl rfl), ?_, ?_,
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
  refine ⟨nodup, fun id named => ⟨(beginnable id named).congr (.refl _) rfl (Laws.State.items_congr rfl) rfl (instanceOf_congr rfl rfl), ?_, ?_,
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
theorem complete_unnamed {state : State} (formed : WellFormed program state) {id : OccurrenceId} {leave : Leave}
    {writes : List (String × Value)} {rule : WriteRule}
    (completed : Signal.complete id leave writes rule ∈ state.signals) :
    ∀ request, Queued state request → id ∉ names request :=
  fun request queued named => formed.claimed.uncompleted request id leave writes rule queued named completed

/-- The closure's next signal, a compensation, may end as it asks once it leaves the queue. -/
theorem resumable_signal {state : State} (formed : WellFormed program state) {scope : ScopeOccurrenceId}
    {activity : Option ElementId} {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Resume} {rest : List Signal}
    (head : state.signals = .compensate scope activity trigger leave (some resume) :: rest) :
    Resumable { state with signals := rest } scope resume :=
  ⟨fun occurrence _ same => by
    subst same
    exact (formed.settled.queued scope activity trigger leave occurrence _ (head ▸ List.mem_cons_self ..)).transport
      (.refl _) (fun _ member _ => .inl member) fun _ queued =>
        queued.shrink (before := state) (after := { state with signals := rest })
          (by rw [head]; exact List.sublist_cons_self _ _) (.refl _),
    fun context same => formed.settled.grouped scope activity trigger leave context
      (same ▸ head ▸ List.mem_cons_self ..)⟩

/-- The closure's next signal, a raise, finds what its origin names and a settled host once it leaves the queue. -/
theorem raisable_signal {state : State} (formed : WellFormed program state) {raised : Raised} {origin : Origin}
    {rest : List Signal} (head : state.signals = .raise raised origin :: rest) :
    Raisable program { state with signals := rest } origin ∧
      ∀ host, origin.host = some host → Settled { state with signals := rest } host := by
  have member : Signal.raise raised origin ∈ state.signals := head ▸ List.mem_cons_self ..
  have queued : ∀ request, Queued { state with signals := rest } request → Queued state request := fun _ queued =>
    queued.shrink (before := state) (after := { state with signals := rest }) (by rw [head]; exact List.sublist_cons_self _ _)
      (.refl _)
  refine ⟨fun event => ?_, fun host named => (formed.settled.raised raised origin host member named).transport
    (.refl _) (fun _ present _ => .inl present) queued⟩
  exact formed.raises raised origin member event

/-- An occurrence's scope occurrence stands. -/
theorem housed_wellFormed {s : State} (formed : WellFormed program s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) : ∃ entry ∈ s.scopes, entry.id = occurrence.scope :=
  List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)

/-- Clearing a present scope occurrence keeps a state well-formed under `Cleared.wellFormed`'s conditions on what it
keeps and what it leaves hanging. -/
theorem clearInside_wellFormed {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} {keep : List OccurrenceId}
    (present : scope ∈ scopeIds s)
    (kept : ∀ occurrence ∈ s.occurrences, occurrence.id ∈ keep → ¬ StrictlyWithin s occurrence.scope scope)
    (attached : ∀ item ∈ itemList s.openItems, (¬ Within s item.scope scope ∨ item.id.occurrence ∈ keep) → ∀ host,
      item.attachedTo = some host → ∀ occurrence ∈ s.occurrences, occurrence.id = host →
        ¬ Within s occurrence.scope scope ∨ host ∈ keep) :
    WellFormed program (s.clearInside scope keep) :=
  (clearInside_cleared formed present keep).wellFormed formed present kept attached

/-- Clearing everything inside a present scope occurrence keeps a state well-formed: what hangs on an occurrence lies in
its scope occurrence, so nothing left outside hangs on one removed. -/
theorem clearAll_wellFormed {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) : WellFormed program (s.clearInside scope) :=
  clearInside_wellFormed formed present (fun _ _ none => by simp at none) fun item member outside host hangs found
      standing named => by
    obtain ⟨hostOccurrence, hostIn, hostId, placed⟩ := formed.owned.attachments item member host hangs
    rw [nodup_map_eq formed.distinct.occurrences standing hostIn (named.trans hostId.symm), placed.2]
    exact .inl (outside.resolve_right (by simp))

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
