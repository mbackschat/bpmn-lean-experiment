module

public import Kernel.Laws.State.Frames

/-! # Laws of the kernel state: issuing and beginning occurrences

What `WellFormed` keeps through the operations that number, issue and begin occurrences, stated over the fields alone:
a counter's step (`Activated`), the begin of a request (`Begins`), a reservation (`Reserves`) and the start of one
where it stands (`StartsReserved`). `Kernel.Laws.State` shows `State.activate`, `State.beginOccurrence`,
`State.reserve` and `State.startReserved` make them; this module reads no body. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## Counters -/

/-- `after`'s counters are `before`'s with the counter of `inst`, `element` and `role` moved to `n`, above every count
that counter had: what `State.activate` does. -/
structure Activated (before after : State) (inst : String) (element : ElementId) (role : ActivationRole) (n : Nat) :
    Prop where
  activations : after.activations = { processInstance := inst, element, role, count := n } ::
    before.activations.filter fun count => !(count.processInstance == inst && count.element == element && count.role == role)
  above : ∀ count ∈ before.activations, count.processInstance = inst → count.element = element → count.role = role →
    count.count < n
  positive : 0 < n

theorem Activated.keyed {before after : State} {inst : String} {element : ElementId} {role : ActivationRole} {n : Nat}
    (activated : Activated before after inst element role n) (keyed : ActivationsKeyed before) : ActivationsKeyed after := by
  refine ⟨?_, ?_⟩
  · rw [activated.activations, List.map_cons, List.nodup_cons]
    refine ⟨fun member => ?_, keyed.keys.sublist (List.filter_sublist.map _)⟩
    obtain ⟨count, inside, same⟩ := List.mem_map.mp member
    have kept := (List.mem_filter.mp inside).2
    simp only [Prod.mk.injEq] at same
    simp [same] at kept
  · intro count member
    rw [activated.activations] at member
    rcases List.mem_cons.mp member with rfl | old
    · exact activated.positive
    · exact keyed.positive count (List.mem_filter.mp old).1

/-- A counter step keeps every count it does not raise. -/
theorem Activated.counted {before after : State} {inst : String} {element : ElementId} {role : ActivationRole} {n : Nat}
    (activated : Activated before after inst element role n) {k : OccurrenceKey} (counted : Counted before k) :
    Counted after k := by
  obtain ⟨count, member, named, rest⟩ := counted
  obtain ⟨same, roled, below⟩ := rest
  rw [Counted, activated.activations]
  by_cases raised : (count.processInstance == inst && count.element == element && count.role == role) = true
  · simp only [Bool.and_eq_true, beq_iff_eq] at raised
    obtain ⟨⟨one, two⟩, three⟩ := raised
    exact ⟨_, List.mem_cons_self .., one ▸ named, two ▸ same, three ▸ roled,
      Nat.le_of_lt (Nat.lt_of_le_of_lt below (activated.above count member one two three))⟩
  · refine ⟨count, List.mem_cons_of_mem _ (List.mem_filter.mpr ⟨member, ?_⟩), named, same, roled, below⟩
    rw [Bool.not_eq_true']
    exact Bool.eq_false_iff.mpr raised

/-- The key a counter step numbers is new: no counted key of its counter reaches it. -/
theorem Activated.fresh {before after : State} {inst : String} {element : ElementId} {role : ActivationRole} {n : Nat}
    (activated : Activated before after inst element role n) {k : OccurrenceKey} (counted : Counted before k) :
    k ≠ { processInstanceId := inst, element, activation := n, role } := fun same => by
  obtain ⟨count, member, named, rest⟩ := counted
  obtain ⟨elemented, roled, below⟩ := rest
  subst same
  have := activated.above count member named elemented roled
  simp at below
  omega

/-! ## Beginning a request -/

/-- `begun` is the standing reservation `reserved` that the request names, under its identity, element, activation
and role; the counters do not move. -/
structure Reserved (before after : State) (request : BeginRequest) (begun reserved : Occurrence) : Prop where
  member : reserved ∈ before.occurrences
  named : request.reserved = some reserved.id
  id : begun.id = reserved.id
  element : begun.element = reserved.element
  activation : begun.activation = reserved.activation
  role : begun.role = reserved.role
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue

/-- `begun` is fresh: no reservation the request names stands, and it is issued at the counter, of the requested
element, and numbered under `role`. -/
structure Issued (before after : State) (request : BeginRequest) (role : ActivationRole) (begun : Occurrence) : Prop where
  unreserved : ∀ id, request.reserved = some id → ∀ occurrence ∈ before.occurrences, occurrence.id ≠ id
  id : begun.id = before.nextIssue
  nextIssue : after.nextIssue = before.nextIssue + 1
  element : begun.element = request.element
  roled : begun.role = role
  activated : Activated before after (before.instanceOf request.scope) request.element role begun.activation

/-- What `State.beginOccurrence` makes of `before`: the occurrence `begun` replaces the record of its identity, begun in
the request's scope occurrence, and its start is journalled under its key; it is the reservation the request names, if
that stands, or a fresh occurrence issued at the counter and numbered under `role`. Nothing else changes. -/
structure Begins (before after : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String)
    (begun : Occurrence) : Prop where
  occurrences : after.occurrences = before.occurrences.filter (·.id != begun.id) ++ [begun]
  started : after.draft.started =
    before.draft.started ++ [{ occurrence := key after begun, owner := begun.scope, sourceType }]
  scope : begun.scope = request.scope
  isBegun : begun.begun = true
  source : (∃ reserved, Reserved before after request begun reserved) ∨ Issued before after request role begun
  scopes : after.scopes = before.scopes
  instances : ∀ x, after.instanceOf x = before.instanceOf x
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  signals : after.signals = before.signals
  variables : after.variables = before.variables
  journal : after.journal = before.journal
  status : after.status = before.status
  failure : after.failure = before.failure
  slots : after.slots = before.slots

/-- The begun occurrence takes a key no other occurrence and no start fact of `before` has: a reservation's own, or a
fresh activation. -/
private theorem Begins.keyNew {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (formed : WellFormed before)
    (begins : Begins before after request role sourceType begun) (stands : request.scope ∈ scopeIds before)
    (admitted : ∀ id ∈ names request, Beginnable before request.scope id ∧ Unclaimed before id) :
    (∀ occurrence ∈ before.occurrences, occurrence.id ≠ begun.id → key before occurrence ≠ key before begun) ∧
      (∀ fact ∈ starts before, fact.occurrence ≠ key before begun) ∧ Counted after (key before begun) := by
  rcases begins.source with ⟨reserved, reservation⟩ | fresh
  · obtain ⟨_, facts⟩ := (admitted reserved.id (by simp [names, reservation.named])).1
    obtain ⟨unbegun, _, instance_⟩ := facts reserved reservation.member rfl
    have keyed : key before begun = key before reserved := by
      simp only [key, begins.scope, instance_ stands, reservation.element, reservation.activation, reservation.role]
    rw [keyed]
    refine ⟨fun occurrence inside other equal => other ?_,
      fun fact started => formed.reservations reserved reservation.member unbegun fact started, ?_⟩
    · have := nodup_map_eq formed.distinct.keys inside reservation.member equal
      rw [this, reservation.id]
    · exact (formed.occurrencesCounted reserved reservation.member).congr reservation.activations
  · have keyed : key before begun =
        { processInstanceId := before.instanceOf request.scope, element := request.element,
          activation := begun.activation, role } := by
      simp [key, begins.scope, fresh.element, fresh.roled]
    rw [keyed]
    refine ⟨fun occurrence inside _ => fresh.activated.fresh (formed.occurrencesCounted occurrence inside),
      fun fact started => fresh.activated.fresh (formed.counted fact started), ?_⟩
    exact ⟨_, fresh.activated.activations ▸ List.mem_cons_self .., rfl, rfl, rfl, Nat.le_refl _⟩

/-- The begun occurrence's identity is no other standing occurrence's, item's or claim's: a reservation's is claimed by
nothing else, a fresh one is above every identity issued. -/
private theorem Begins.idNew {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (formed : WellFormed before)
    (begins : Begins before after request role sourceType begun)
    (admitted : ∀ id ∈ names request, Beginnable before request.scope id ∧ Unclaimed before id) :
    (∀ item ∈ before.openItems, item.occurrence ≠ begun.id ∧ item.attachedTo ≠ some begun.id) ∧
      (∀ occurrence ∈ before.occurrences, occurrence.id = begun.id → occurrence.begun = false) ∧
      (∀ other, Queued before other → begun.id ∉ names other) ∧ before.nextIssue ≤ after.nextIssue := by
  rcases begins.source with ⟨reserved, reservation⟩ | issuedFresh
  · obtain ⟨⟨_, facts⟩, unclaimed⟩ := admitted reserved.id (by simp [names, reservation.named])
    obtain ⟨_, free, _⟩ := facts reserved reservation.member rfl
    refine ⟨reservation.id ▸ free, fun occurrence inside equal => ?_, reservation.id ▸ unclaimed.1,
      Nat.le_of_eq reservation.nextIssue.symm⟩
    have := nodup_map_eq formed.distinct.occurrences inside reservation.member (equal.trans reservation.id)
    exact this ▸ (facts reserved reservation.member rfl).1
  · have fresh := issuedFresh.id
    have issued := issuedFresh.nextIssue
    refine ⟨fun item inside => ?_, fun occurrence inside equal => ?_, fun other queued named => ?_, by omega⟩
    · have := formed.issued.items item inside
      obtain ⟨occurrence, held, same, _⟩ := formed.owned.itemOccurrences item inside
      refine ⟨fun equal => ?_, fun attached => ?_⟩
      · have := formed.issued.occurrences occurrence held
        omega
      · obtain ⟨host, hosted, same, _⟩ := formed.owned.attachments item inside _ attached
        have := formed.issued.occurrences host hosted
        omega
    · have := formed.issued.occurrences occurrence inside
      omega
    · have := ((formed.claimed.named other queued).2 _ named).1
      omega

/-- The begin of an admitted request in a scope occurrence that stands keeps a state well-formed. -/
theorem Begins.wellFormed {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (formed : WellFormed before)
    (begins : Begins before after request role sourceType begun) (stands : request.scope ∈ scopeIds before)
    (admitted : ∀ id ∈ names request, Beginnable before request.scope id ∧ Unclaimed before id) : WellFormed after := by
  have keys : ∀ occurrence, key after occurrence = key before occurrence := fun _ => key_congr (begins.instances _)
  obtain ⟨keyNew, factNew, keyCounted⟩ := begins.keyNew formed stands admitted
  obtain ⟨itemsFree, unbegunOnly, unclaimed, issued⟩ := begins.idNew formed admitted
  have counters : ∀ k, Counted before k → Counted after k := fun k counted => by
    rcases begins.source with ⟨_, reservation⟩ | fresh
    · exact counted.congr reservation.activations
    · exact fresh.activated.counted counted
  -- The begun identity was issued: a standing reservation's, or the counter's.
  have begunBelow : begun.id < after.nextIssue := by
    rcases begins.source with ⟨reserved, reservation⟩ | fresh
    · have := formed.issued.occurrences reserved reservation.member
      have := reservation.id
      have := reservation.nextIssue
      omega
    · have := fresh.id
      have := fresh.nextIssue
      omega
  -- No queued arming hangs on the begun occurrence: a reservation is unbegun, a fresh identity was never issued.
  have unarmed : ∀ host < before.nextIssue, (∀ found ∈ before.occurrences, found.id = host → found.begun = true) →
      begun.id ≠ host := fun host below armed same => by
    rcases begins.source with ⟨reserved, reservation⟩ | fresh
    · have := armed reserved reservation.member (reservation.id ▸ same)
      simp [unbegunOnly reserved reservation.member reservation.id.symm] at this
    · have := fresh.id
      omega
  have kept : ∀ occurrence ∈ after.occurrences, occurrence ≠ begun → occurrence ∈ before.occurrences ∧
      occurrence.id ≠ begun.id := fun occurrence member other => by
    rw [begins.occurrences] at member
    rcases List.mem_append.mp member with old | new
    · obtain ⟨inside, differs⟩ := List.mem_filter.mp old
      exact ⟨inside, by simpa using differs⟩
    · exact absurd (List.mem_singleton.mp new) other
  have members : ∀ occurrence ∈ after.occurrences, occurrence = begun ∨
      (occurrence ∈ before.occurrences ∧ occurrence.id ≠ begun.id) := fun occurrence member => by
    by_cases same : occurrence = begun
    · exact .inl same
    · exact .inr (kept occurrence member same)
  have begunIn : begun ∈ after.occurrences := by simp [begins.occurrences]
  have startsAfter : starts after = starts before ++ [{ occurrence := key after begun, owner := begun.scope, sourceType }] := by
    simp [starts, begins.journal, begins.started]
  -- An occurrence `before` held that is not the begun one stands after it.
  have stays : ∀ occurrence ∈ before.occurrences, occurrence.id ≠ begun.id → occurrence ∈ after.occurrences :=
    fun occurrence member differs => by
      rw [begins.occurrences]
      exact List.mem_append_left _ (List.mem_filter.mpr ⟨member, by simpa using differs⟩)
  have housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after := fun occurrence member => by
    rw [scopeIds, begins.scopes]
    rcases members occurrence member with rfl | ⟨old, _⟩
    · exact begins.scope ▸ stands
    · exact formed.owned.occurrenceScopes occurrence old
  refine ⟨?issued, ?distinct, ?startedOnce, ?activations, ?reservations, ?owned, ?rooted, ?variables,
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled⟩
  case issued =>
    exact ⟨fun occurrence member => by
        rcases members occurrence member with rfl | ⟨old, _⟩
        · exact begunBelow
        · have := formed.issued.occurrences occurrence old
          omega,
      fun item member => Nat.lt_of_lt_of_le (formed.issued.items item (begins.openItems ▸ member)) issued,
      fun entry member => Nat.lt_of_lt_of_le (formed.issued.scopes entry (begins.scopes ▸ member)) issued⟩
  case distinct =>
    refine ⟨?_, begins.openItems ▸ formed.distinct.items, by simpa [scopeIds, begins.scopes] using formed.distinct.scopes,
      ?_⟩
    · rw [occurrenceIds, begins.occurrences, List.map_append, List.nodup_append]
      refine ⟨formed.distinct.occurrences.sublist (List.filter_sublist.map _), by simp, ?_⟩
      intro id old other new
      obtain ⟨occurrence, inside, named⟩ := List.mem_map.mp old
      simp at new
      subst named new
      simp at inside
      exact inside.2
    · rw [funext keys, begins.occurrences, List.map_append, List.nodup_append]
      refine ⟨formed.distinct.keys.sublist (List.filter_sublist.map _), by simp, ?_⟩
      intro k old other new
      obtain ⟨occurrence, inside, named⟩ := List.mem_map.mp old
      simp at new
      subst named new
      obtain ⟨member, differs⟩ := List.mem_filter.mp inside
      exact keyNew occurrence member (by simpa using differs)
  case startedOnce =>
    unfold StartedOnce
    rw [startsAfter, List.map_append, List.nodup_append]
    refine ⟨formed.startedOnce, by simp, ?_⟩
    intro k old other new
    obtain ⟨fact, inside, named⟩ := List.mem_map.mp old
    simp at new
    subst named new
    rw [keys]
    exact factNew fact inside
  case activations =>
    rcases begins.source with ⟨_, reservation⟩ | fresh
    · exact ⟨reservation.activations ▸ formed.activations.keys, reservation.activations ▸ formed.activations.positive⟩
    · exact fresh.activated.keyed formed.activations
  case reservations =>
    exact fun occurrence member unbegun fact started => by
      rcases members occurrence member with rfl | ⟨old, differs⟩
      · simp [begins.isBegun] at unbegun
      · rw [startsAfter] at started
        rw [keys]
        rcases List.mem_append.mp started with earlier | new
        · exact formed.reservations occurrence old unbegun fact earlier
        · simp at new
          subst new
          intro same
          exact keyNew occurrence old differs (by rw [← same, keys])
  case owned =>
    exact {
      occurrenceScopes := housed
      itemScopes := fun item member => by
        simpa [scopeIds, begins.scopes] using formed.owned.itemScopes item (begins.openItems ▸ member)
      itemOccurrences := fun item member => by
        rw [begins.openItems] at member
        obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.itemOccurrences item member
        exact ⟨occurrence, stays occurrence inside (named ▸ (itemsFree item member).1), named, rest⟩
      attachments := fun item member host attached => by
        rw [begins.openItems] at member
        obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.attachments item member host attached
        refine ⟨occurrence, stays occurrence inside fun same => (itemsFree item member).2 ?_, named, rest⟩
        rw [attached, ← named, same]
      scopeOwners := fun entry member owner owned => by
        rw [begins.scopes] at member
        obtain ⟨occurrence, inside, named, begunFlag⟩ := formed.owned.scopeOwners entry member owner owned
        refine ⟨occurrence, stays occurrence inside fun same => ?_, named, begunFlag⟩
        simp [unbegunOnly occurrence inside same] at begunFlag
      variableScopes := by simpa [scopeIds, begins.variables, begins.scopes] using formed.owned.variableScopes
      tokenScopes := by simpa [scopeIds, begins.tokens, begins.scopes] using formed.owned.tokenScopes }
  case rooted =>
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, begins.scopes] using present, by simpa [begins.scopes] using parentless, ?_⟩
    intro scope member
    exact Within.congr begins.scopes (reach scope (begins.scopes ▸ member))
  case variables =>
    exact ⟨by simpa [begins.variables] using formed.variables.scopes,
      by simpa [begins.variables] using formed.variables.names⟩
  case failure => simpa [FailureRecorded, begins.failure, begins.status] using formed.failure
  case queue =>
    obtain ⟨arm, armScope, armGateway, ends⟩ := formed.queue
    refine ⟨fun host element scope queued => ?_, fun scope queued => ?_, fun occurrence gateway scope queued => ?_,
      fun status failure queued => ends status failure (begins.signals ▸ queued)⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := arm host element scope (begins.signals ▸ queued)
      refine ⟨by omega, by omega, fun found member named => ?_⟩
      rcases members found member with rfl | ⟨old, _⟩
      · exact absurd named (unarmed host hostBelow fun found inside same => (facts found inside same).1)
      · exact facts found old named
    · have := armScope scope (begins.signals ▸ queued)
      omega
    · obtain ⟨occurrenceBelow, scopeBelow, facts⟩ := armGateway occurrence gateway scope (begins.signals ▸ queued)
      refine ⟨by omega, by omega, fun found member named => ?_⟩
      rcases members found member with rfl | ⟨old, _⟩
      · exact absurd named (unarmed occurrence occurrenceBelow fun found inside same => (facts found inside same).1)
      · exact facts found old named
  case counted =>
    exact fun fact started => by
      rw [startsAfter] at started
      rcases List.mem_append.mp started with earlier | new
      · exact counters _ (formed.counted fact earlier)
      · simp at new
        subst new
        simpa [keys] using keyCounted
  case occurrencesCounted =>
    exact fun occurrence member => by
      rw [keys]
      rcases members occurrence member with rfl | ⟨old, _⟩
      · exact keyCounted
      · exact counters _ (formed.occurrencesCounted occurrence old)
  case ownedBelow =>
    exact fun entry member occurrence inside owned => by
      rw [begins.scopes] at member
      rcases members occurrence inside with rfl | ⟨old, _⟩
      · obtain ⟨owner, held, named, begunFlag⟩ := formed.owned.scopeOwners entry member _ owned
        simp [unbegunOnly owner held named] at begunFlag
      · exact formed.ownedBelow entry member occurrence old owned
  case claimed =>
    exact {
      attached := fun item member attached reserved other inside same => by
        obtain ⟨found, held, named, unbegun⟩ := reserved
        rcases members found held with rfl | ⟨old, _⟩
        · simp [begins.isBegun] at unbegun
        · exact formed.claimed.attached item (begins.openItems ▸ member) attached ⟨found, old, named, unbegun⟩ other
            (begins.openItems ▸ inside) same
      named := fun other queued => by
        have queuedBefore : Queued before other := by simpa [Queued, begins.signals, begins.tokens] using queued
        obtain ⟨nodup, beginnable⟩ := formed.claimed.named other queuedBefore
        refine ⟨nodup, fun id named => ?_⟩
        obtain ⟨below, facts⟩ := beginnable id named
        refine ⟨by omega, fun occurrence member same => ?_⟩
        rcases members occurrence member with rfl | ⟨old, _⟩
        · exact absurd (same ▸ named) (unclaimed other queuedBefore)
        · obtain ⟨unbegun, free, instance_⟩ := facts occurrence old same
          refine ⟨unbegun, by simpa [begins.openItems] using free, fun present => ?_⟩
          rw [begins.instances, begins.instances]
          exact instance_ (by simpa [scopeIds, begins.scopes] using present)
      signalsApart := by simpa [begins.signals] using formed.claimed.signalsApart
      tokensApart := by simpa [begins.tokens] using formed.claimed.tokensApart
      queuesApart := by simpa [begins.signals, begins.tokens] using formed.claimed.queuesApart
      uncompleted := by simpa [Queued, begins.signals, begins.tokens] using formed.claimed.uncompleted
      scopesIssued := fun other queued => by
        have := formed.claimed.scopesIssued other (by simpa [Queued, begins.signals, begins.tokens] using queued)
        rcases begins.source with ⟨_, reservation⟩ | fresh
        · have := reservation.nextIssue
          omega
        · have := fresh.nextIssue
          omega }
  case settled =>
    have later : before.nextIssue ≤ after.nextIssue := by
      rcases begins.source with ⟨_, reservation⟩ | fresh
      · exact Nat.le_of_eq reservation.nextIssue.symm
      · have := fresh.nextIssue
        omega
    exact formed.settled.transport (.same begins.slots) later
      (fun found inside unbegun => by
        rcases members found inside with rfl | ⟨old, _⟩
        · simp [begins.isBegun] at unbegun
        · exact .inl old)
      (fun _ queued => by simpa [Queued, begins.signals, begins.tokens] using queued)
      (fun _ member => begins.signals ▸ member) (fun _ member => .inl (begins.scopes ▸ member))

/-! ## Reserving and starting where it stands -/

/-- What `State.reserve` makes of `before`: an unbegun occurrence of `element` in `scope`, issued at the counter and
numbered as an element activation, joins the occurrences. Nothing else changes. -/
structure Reserves (before after : State) (element : ElementId) (scope : ScopeOccurrenceId) (reserved : Occurrence) :
    Prop where
  occurrences : after.occurrences = before.occurrences ++ [reserved]
  id : reserved.id = before.nextIssue
  nextIssue : after.nextIssue = before.nextIssue + 1
  kind : reserved.element = element
  placed : reserved.scope = scope
  role : reserved.role = .element
  unbegun : reserved.begun = false
  activated : Activated before after (before.instanceOf scope) element .element reserved.activation
  scopes : after.scopes = before.scopes
  instances : ∀ x, after.instanceOf x = before.instanceOf x
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  signals : after.signals = before.signals
  variables : after.variables = before.variables
  journal : after.journal = before.journal
  draft : after.draft = before.draft
  status : after.status = before.status
  failure : after.failure = before.failure
  slots : after.slots = before.slots

/-- A reservation in a scope occurrence that stands keeps a state well-formed, and nothing queued names it: it is
issued above every identity a queued begin names. -/
theorem Reserves.wellFormed {before after : State} {element : ElementId} {scope : ScopeOccurrenceId}
    {reserved : Occurrence} (formed : WellFormed before) (reserves : Reserves before after element scope reserved)
    (stands : scope ∈ scopeIds before) :
    WellFormed after ∧ ∀ request, Queued after request → reserved.id ∉ names request := by
  have keys : ∀ occurrence, key after occurrence = key before occurrence := fun _ => key_congr (reserves.instances _)
  have issuedAt := reserves.id
  have next := reserves.nextIssue
  have keyed : key before reserved =
      { processInstanceId := before.instanceOf scope, element, activation := reserved.activation, role := .element } := by
    simp [key, reserves.placed, reserves.kind, reserves.role]
  have queuedBefore : ∀ request, Queued after request → Queued before request := fun request queued => by
    simpa [Queued, reserves.signals, reserves.tokens] using queued
  have members : ∀ occurrence ∈ after.occurrences, occurrence = reserved ∨ occurrence ∈ before.occurrences :=
    fun occurrence member => by
      rw [reserves.occurrences] at member
      rcases List.mem_append.mp member with old | new
      · exact .inr old
      · exact .inl (List.mem_singleton.mp new)
  have above : ∀ occurrence ∈ before.occurrences, occurrence.id ≠ reserved.id := fun occurrence member same => by
    have := formed.issued.occurrences occurrence member
    omega
  have startsAfter : starts after = starts before := by simp [starts, reserves.journal, reserves.draft]
  have keyFresh : ∀ k, Counted before k → k ≠ key before reserved := fun k counted => by
    rw [keyed]
    exact reserves.activated.fresh counted
  refine ⟨?_, fun request queued named => ?_⟩
  rotate_left
  · have := ((formed.claimed.named request (queuedBefore request queued)).2 _ named).1
    omega
  refine ⟨?issued, ?distinct, ?startedOnce, ?activations, ?reservations, ?owned, ?rooted, ?variables,
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled⟩
  case issued =>
    exact ⟨fun occurrence member => by
        rcases members occurrence member with rfl | old
        · omega
        · have := formed.issued.occurrences occurrence old
          omega,
      fun item member => by
        have := formed.issued.items item (reserves.openItems ▸ member)
        omega,
      fun entry member => by
        have := formed.issued.scopes entry (reserves.scopes ▸ member)
        omega⟩
  case distinct =>
    refine ⟨?_, reserves.openItems ▸ formed.distinct.items,
      by simpa [scopeIds, reserves.scopes] using formed.distinct.scopes, ?_⟩
    · rw [occurrenceIds, reserves.occurrences, List.map_append, List.nodup_append]
      refine ⟨formed.distinct.occurrences, by simp, ?_⟩
      intro id old other new
      obtain ⟨occurrence, inside, named⟩ := List.mem_map.mp old
      simp at new
      subst named new
      exact above occurrence inside
    · rw [funext keys, reserves.occurrences, List.map_append, List.nodup_append]
      refine ⟨formed.distinct.keys, by simp, ?_⟩
      intro k old other new
      obtain ⟨occurrence, inside, named⟩ := List.mem_map.mp old
      simp at new
      subst named new
      exact keyFresh _ (formed.occurrencesCounted occurrence inside)
  case startedOnce => simpa [StartedOnce, startsAfter] using formed.startedOnce
  case activations => exact reserves.activated.keyed formed.activations
  case reservations =>
    exact fun occurrence member unbegun fact started => by
      rw [startsAfter] at started
      rw [keys]
      rcases members occurrence member with rfl | old
      · exact keyFresh _ (formed.counted fact started)
      · exact formed.reservations occurrence old unbegun fact started
  case owned =>
    exact {
      occurrenceScopes := fun occurrence member => by
        rw [scopeIds, reserves.scopes]
        rcases members occurrence member with rfl | old
        · exact reserves.placed ▸ stands
        · exact formed.owned.occurrenceScopes occurrence old
      itemScopes := fun item member => by
        simpa [scopeIds, reserves.scopes] using formed.owned.itemScopes item (reserves.openItems ▸ member)
      itemOccurrences := fun item member => by
        obtain ⟨occurrence, inside, rest⟩ := formed.owned.itemOccurrences item (reserves.openItems ▸ member)
        exact ⟨occurrence, reserves.occurrences ▸ List.mem_append_left _ inside, rest⟩
      attachments := fun item member host attached => by
        obtain ⟨occurrence, inside, rest⟩ := formed.owned.attachments item (reserves.openItems ▸ member) host attached
        exact ⟨occurrence, reserves.occurrences ▸ List.mem_append_left _ inside, rest⟩
      scopeOwners := fun entry member owner owned => by
        obtain ⟨occurrence, inside, rest⟩ := formed.owned.scopeOwners entry (reserves.scopes ▸ member) owner owned
        exact ⟨occurrence, reserves.occurrences ▸ List.mem_append_left _ inside, rest⟩
      variableScopes := by simpa [scopeIds, reserves.variables, reserves.scopes] using formed.owned.variableScopes
      tokenScopes := by simpa [scopeIds, reserves.tokens, reserves.scopes] using formed.owned.tokenScopes }
  case rooted =>
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, reserves.scopes] using present, by simpa [reserves.scopes] using parentless, ?_⟩
    intro x member
    exact Within.congr reserves.scopes (reach x (reserves.scopes ▸ member))
  case variables =>
    exact ⟨by simpa [reserves.variables] using formed.variables.scopes,
      by simpa [reserves.variables] using formed.variables.names⟩
  case failure => simpa [FailureRecorded, reserves.failure, reserves.status] using formed.failure
  case queue =>
    obtain ⟨arm, armScope, armGateway, ends⟩ := formed.queue
    refine ⟨fun host element scope queued => ?_, fun scope queued => ?_, fun occurrence gateway scope queued => ?_,
      fun status failure queued => ends status failure (reserves.signals ▸ queued)⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := arm host element scope (reserves.signals ▸ queued)
      refine ⟨by omega, by omega, fun found member named => ?_⟩
      rcases members found member with rfl | old
      · omega
      · exact facts found old named
    · have := armScope scope (reserves.signals ▸ queued)
      omega
    · obtain ⟨occurrenceBelow, scopeBelow, facts⟩ := armGateway occurrence gateway scope (reserves.signals ▸ queued)
      refine ⟨by omega, by omega, fun found member named => ?_⟩
      rcases members found member with rfl | old
      · omega
      · exact facts found old named
  case counted => exact fun fact started => reserves.activated.counted (formed.counted fact (startsAfter ▸ started))
  case occurrencesCounted =>
    exact fun occurrence member => by
      rw [keys]
      rcases members occurrence member with rfl | old
      · rw [keyed]
        exact ⟨_, reserves.activated.activations ▸ List.mem_cons_self .., rfl, rfl, rfl, Nat.le_refl _⟩
      · exact reserves.activated.counted (formed.occurrencesCounted occurrence old)
  case ownedBelow =>
    exact fun entry member occurrence inside owned => by
      rw [reserves.scopes] at member
      rcases members occurrence inside with rfl | old
      · obtain ⟨owner, held, named, _⟩ := formed.owned.scopeOwners entry member _ owned
        exact absurd named (above owner held)
      · exact formed.ownedBelow entry member occurrence old owned
  case claimed =>
    exact {
      attached := fun item member attached reserved other inside same => by
        obtain ⟨found, held, named, unbegun⟩ := reserved
        rcases members found held with rfl | old
        · obtain ⟨waited, waitedIn, same, _⟩ := formed.owned.itemOccurrences item (reserves.openItems ▸ member)
          have := formed.issued.occurrences waited waitedIn
          omega
        · exact formed.claimed.attached item (reserves.openItems ▸ member) attached ⟨found, old, named, unbegun⟩ other
            (reserves.openItems ▸ inside) same
      named := fun request queued => by
        obtain ⟨nodup, beginnable⟩ := formed.claimed.named request (queuedBefore request queued)
        refine ⟨nodup, fun id named => ?_⟩
        obtain ⟨below, facts⟩ := beginnable id named
        refine ⟨by omega, fun occurrence member same => ?_⟩
        rcases members occurrence member with rfl | old
        · omega
        · obtain ⟨unbegun, free, instance_⟩ := facts occurrence old same
          refine ⟨unbegun, by simpa [reserves.openItems] using free, fun present => ?_⟩
          rw [reserves.instances, reserves.instances]
          exact instance_ (by simpa [scopeIds, reserves.scopes] using present)
      signalsApart := by simpa [reserves.signals] using formed.claimed.signalsApart
      tokensApart := by simpa [reserves.tokens] using formed.claimed.tokensApart
      queuesApart := by simpa [reserves.signals, reserves.tokens] using formed.claimed.queuesApart
      uncompleted := fun request id leave writes rule queued =>
        reserves.signals ▸ formed.claimed.uncompleted request id leave writes rule (queuedBefore request queued)
      scopesIssued := fun request queued => by
        have := formed.claimed.scopesIssued request (queuedBefore request queued)
        omega }
  case settled =>
    exact formed.settled.transport (.same reserves.slots) (by omega)
      (fun found inside _ => by
        rcases members found inside with rfl | old
        · exact .inr (by omega)
        · exact .inl old)
      queuedBefore (fun _ member => reserves.signals ▸ member) (fun _ member => .inl (reserves.scopes ▸ member))

/-- What `State.startReserved` makes of `before` for an unbegun `occurrence`: it begins where it stands and its start
is journalled under its key. Nothing else changes. -/
structure StartsReserved (before after : State) (occurrence : Occurrence) (sourceType : String) : Prop where
  occurrences : after.occurrences =
    before.occurrences.map fun other => if other.id = occurrence.id then { occurrence with begun := true } else other
  started : after.draft.started =
    before.draft.started ++ [{ occurrence := key after occurrence, owner := occurrence.scope, sourceType }]
  scopes : after.scopes = before.scopes
  instances : ∀ x, after.instanceOf x = before.instanceOf x
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  signals : after.signals = before.signals
  variables : after.variables = before.variables
  journal : after.journal = before.journal
  status : after.status = before.status
  failure : after.failure = before.failure
  slots : after.slots = before.slots

/-- Starting an unbegun reservation that no queued begin names keeps a state well-formed. -/
theorem StartsReserved.wellFormed {before after : State} {occurrence : Occurrence} {sourceType : String}
    (formed : WellFormed before) (starts_ : StartsReserved before after occurrence sourceType)
    (member : occurrence ∈ before.occurrences) (unbegun : occurrence.begun = false)
    (unnamed : ∀ request, Queued before request → occurrence.id ∉ names request) : WellFormed after := by
  have keys : ∀ other, key after other = key before other := fun _ => key_congr (starts_.instances _)
  have issued := starts_.nextIssue
  have queuedBefore : ∀ request, Queued after request → Queued before request := fun request queued => by
    simpa [Queued, starts_.signals, starts_.tokens] using queued
  -- An occurrence after is the started one or one before with another identity.
  have members : ∀ found ∈ after.occurrences, found = { occurrence with begun := true } ∨
      (found ∈ before.occurrences ∧ found.id ≠ occurrence.id) := fun found inside => by
    rw [starts_.occurrences] at inside
    obtain ⟨old, held, rfl⟩ := List.mem_map.mp inside
    by_cases same : old.id = occurrence.id
    · exact .inl (ite_eq_left same)
    · rw [ite_eq_right same]
      exact .inr ⟨held, same⟩
  have startedIn : { occurrence with begun := true } ∈ after.occurrences := by
    rw [starts_.occurrences]
    exact List.mem_map.mpr ⟨occurrence, member, ite_eq_left rfl⟩
  have stays : ∀ old ∈ before.occurrences, old.id ≠ occurrence.id → old ∈ after.occurrences := fun old held other => by
    rw [starts_.occurrences]
    exact List.mem_map.mpr ⟨old, held, ite_eq_right other⟩
  -- The one before with the started identity is the started occurrence.
  have only : ∀ old ∈ before.occurrences, old.id = occurrence.id → old = occurrence := fun old held same =>
    nodup_map_eq formed.distinct.occurrences held member same
  have startsAfter : starts after =
      starts before ++ [{ occurrence := key before occurrence, owner := occurrence.scope, sourceType }] := by
    simp [starts, starts_.journal, starts_.started, keys]
  have keysOther : ∀ old ∈ before.occurrences, old.id ≠ occurrence.id → key before old ≠ key before occurrence :=
    fun old held other same => other (by rw [nodup_map_eq formed.distinct.keys held member same])
  refine ⟨?issued, ?distinct, ?startedOnce, ?activations, ?reservations, ?owned, ?rooted, ?variables,
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled⟩
  case issued =>
    exact ⟨fun found inside => by
        rw [issued]
        rcases members found inside with rfl | ⟨old, _⟩
        · exact formed.issued.occurrences occurrence member
        · exact formed.issued.occurrences found old,
      fun item inside => issued ▸ formed.issued.items item (starts_.openItems ▸ inside),
      fun entry inside => issued ▸ formed.issued.scopes entry (starts_.scopes ▸ inside)⟩
  case distinct =>
    refine ⟨?_, starts_.openItems ▸ formed.distinct.items,
      by simpa [scopeIds, starts_.scopes] using formed.distinct.scopes, ?_⟩
    · rw [occurrenceIds, starts_.occurrences, List.map_map]
      refine (List.map_congr_left fun old _ => ?_) ▸ formed.distinct.occurrences
      by_cases same : old.id = occurrence.id <;> simp [same]
    · rw [funext keys, starts_.occurrences, List.map_map]
      refine (List.map_congr_left fun old held => ?_) ▸ formed.distinct.keys
      by_cases same : old.id = occurrence.id
      · simp [only old held same, key]
      · simp [same]
  case startedOnce =>
    unfold StartedOnce
    rw [startsAfter, List.map_append, List.nodup_append]
    refine ⟨formed.startedOnce, by simp, ?_⟩
    intro k old other new
    obtain ⟨fact, inside, named⟩ := List.mem_map.mp old
    simp at new
    subst named new
    exact formed.reservations occurrence member unbegun fact inside
  case activations => exact ⟨starts_.activations ▸ formed.activations.keys, starts_.activations ▸ formed.activations.positive⟩
  case reservations =>
    exact fun found inside unbegunFound fact started => by
      rcases members found inside with rfl | ⟨old, other⟩
      · simp at unbegunFound
      · rw [keys]
        rw [startsAfter] at started
        rcases List.mem_append.mp started with earlier | new
        · exact formed.reservations found old unbegunFound fact earlier
        · simp at new
          subst new
          exact fun same => keysOther found old other same.symm
  case owned =>
    exact {
      occurrenceScopes := fun found inside => by
        rw [scopeIds, starts_.scopes]
        rcases members found inside with rfl | ⟨old, _⟩
        · exact formed.owned.occurrenceScopes occurrence member
        · exact formed.owned.occurrenceScopes found old
      itemScopes := fun item inside => by
        simpa [scopeIds, starts_.scopes] using formed.owned.itemScopes item (starts_.openItems ▸ inside)
      itemOccurrences := fun item inside => by
        obtain ⟨old, held, rest⟩ := formed.owned.itemOccurrences item (starts_.openItems ▸ inside)
        by_cases same : old.id = occurrence.id
        · rw [only old held same] at rest
          exact ⟨_, startedIn, rest⟩
        · exact ⟨old, stays old held same, rest⟩
      attachments := fun item inside host attached => by
        obtain ⟨old, held, named, rest⟩ := formed.owned.attachments item (starts_.openItems ▸ inside) host attached
        obtain ⟨begunFlag, scope⟩ := rest
        by_cases same : old.id = occurrence.id
        · rw [only old held same] at named scope
          exact ⟨_, startedIn, named, rfl, scope⟩
        · exact ⟨old, stays old held same, named, begunFlag, scope⟩
      scopeOwners := fun entry inside owner owned => by
        obtain ⟨old, held, named, begunFlag⟩ := formed.owned.scopeOwners entry (starts_.scopes ▸ inside) owner owned
        by_cases same : old.id = occurrence.id
        · rw [only old held same] at named
          exact ⟨_, startedIn, named, rfl⟩
        · exact ⟨old, stays old held same, named, begunFlag⟩
      variableScopes := by simpa [scopeIds, starts_.variables, starts_.scopes] using formed.owned.variableScopes
      tokenScopes := by simpa [scopeIds, starts_.tokens, starts_.scopes] using formed.owned.tokenScopes }
  case rooted =>
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, starts_.scopes] using present, by simpa [starts_.scopes] using parentless, ?_⟩
    intro x inside
    exact Within.congr starts_.scopes (reach x (starts_.scopes ▸ inside))
  case variables =>
    exact ⟨by simpa [starts_.variables] using formed.variables.scopes,
      by simpa [starts_.variables] using formed.variables.names⟩
  case failure => simpa [FailureRecorded, starts_.failure, starts_.status] using formed.failure
  case queue =>
    obtain ⟨arm, armScope, armGateway, ends⟩ := formed.queue
    refine ⟨fun host element scope queued => ?_, fun scope queued => ?_, fun found gateway scope queued => ?_,
      fun status failure queued => ends status failure (starts_.signals ▸ queued)⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := arm host element scope (starts_.signals ▸ queued)
      refine ⟨issued ▸ hostBelow, issued ▸ scopeBelow, fun found inside named => ?_⟩
      rcases members found inside with rfl | ⟨old, _⟩
      · simp [(facts occurrence member named).1] at unbegun
      · exact facts found old named
    · rw [issued]
      exact armScope scope (starts_.signals ▸ queued)
    · obtain ⟨foundBelow, scopeBelow, facts⟩ := armGateway found gateway scope (starts_.signals ▸ queued)
      refine ⟨issued ▸ foundBelow, issued ▸ scopeBelow, fun other inside named => ?_⟩
      rcases members other inside with rfl | ⟨old, _⟩
      · simp [(facts occurrence member named).1] at unbegun
      · exact facts other old named
  case counted =>
    exact fun fact started => by
      rw [startsAfter] at started
      rcases List.mem_append.mp started with earlier | new
      · exact (formed.counted fact earlier).congr starts_.activations
      · simp at new
        subst new
        exact (formed.occurrencesCounted occurrence member).congr starts_.activations
  case occurrencesCounted =>
    exact fun found inside => by
      rw [keys]
      rcases members found inside with rfl | ⟨old, _⟩
      · exact (formed.occurrencesCounted occurrence member).congr starts_.activations
      · exact (formed.occurrencesCounted found old).congr starts_.activations
  case ownedBelow =>
    exact fun entry inside found held owned => by
      rw [starts_.scopes] at inside
      rcases members found held with rfl | ⟨old, _⟩
      · exact formed.ownedBelow entry inside occurrence member owned
      · exact formed.ownedBelow entry inside found old owned
  case claimed =>
    exact {
      attached := fun item inside attached reserved other held same => by
        obtain ⟨found, present, named, unbegun⟩ := reserved
        rcases members found present with rfl | ⟨old, _⟩
        · simp at unbegun
        · exact formed.claimed.attached item (starts_.openItems ▸ inside) attached ⟨found, old, named, unbegun⟩ other
            (starts_.openItems ▸ held) same
      named := fun request queued => by
        obtain ⟨nodup, beginnable⟩ := formed.claimed.named request (queuedBefore request queued)
        refine ⟨nodup, fun id named => ?_⟩
        obtain ⟨below, facts⟩ := beginnable id named
        refine ⟨issued ▸ below, fun found inside same => ?_⟩
        rcases members found inside with rfl | ⟨old, _⟩
        · exact absurd (same ▸ named) (unnamed request (queuedBefore request queued))
        · obtain ⟨oldUnbegun, free, instance_⟩ := facts found old same
          refine ⟨oldUnbegun, by simpa [starts_.openItems] using free, fun present => ?_⟩
          rw [starts_.instances, starts_.instances]
          exact instance_ (by simpa [scopeIds, starts_.scopes] using present)
      signalsApart := by simpa [starts_.signals] using formed.claimed.signalsApart
      tokensApart := by simpa [starts_.tokens] using formed.claimed.tokensApart
      queuesApart := by simpa [starts_.signals, starts_.tokens] using formed.claimed.queuesApart
      uncompleted := fun request id leave writes rule queued =>
        starts_.signals ▸ formed.claimed.uncompleted request id leave writes rule (queuedBefore request queued)
      scopesIssued := fun request queued => issued ▸ formed.claimed.scopesIssued request (queuedBefore request queued) }
  case settled =>
    exact formed.settled.transport (.same starts_.slots) (Nat.le_of_eq issued.symm)
      (fun found inside unbegun => by
        rcases members found inside with rfl | ⟨old, _⟩
        · simp at unbegun
        · exact .inl old)
      queuedBefore (fun _ member => starts_.signals ▸ member) (fun _ member => .inl (starts_.scopes ▸ member))

end Kernel.Laws.State
