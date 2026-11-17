module

public import Kernel.Laws.State.Clear

/-! # Laws of the kernel state: issuing and beginning occurrences

What `WellFormed` keeps through the operations that number, issue and begin occurrences, stated over the fields alone:
a counter's step (`Activated`) and the begin of a request (`Begins`); `Kernel.Laws.State.Reserve` adds a reservation
and the start of one where it stands. `Kernel.Laws.State` shows `State.activate` and `State.beginOccurrence` make them;
this module reads no body. Nothing executable imports this module.
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
the request's scope occurrence and continuing as the request says, and its start is journalled under its key; it is the
reservation the request names, if that stands, or a fresh occurrence issued at the counter and numbered under `role`.
Nothing else changes. -/
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
  instanceId : after.instanceId = before.instanceId
  itemMap : after.openItems = before.openItems ∧ after.itemOrdinals = before.itemOrdinals
  tokens : after.tokens = before.tokens
  signals : after.signals = before.signals
  variables : after.variables = before.variables
  journal : after.journal = before.journal
  ended : after.draft.ended = before.draft.ended
  status : after.status = before.status
  failure : after.failure = before.failure
  slots : after.slots = before.slots
  continued : begun.continuation = request.continuation

/-- The item list stays: the item map does (`itemMap`). -/
theorem Begins.items {before after : State} {request : BeginRequest} {role : ActivationRole} {sourceType : String}
    {begun : Occurrence} (frame : Begins before after request role sourceType begun) : after.items = before.items :=
  items_congr frame.itemMap.1

/-- The begun occurrence takes a key no other occurrence and no start fact of `before` has: a reservation's own, or a
fresh activation. -/
private theorem Begins.keyNew {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (formed : WellFormed program before)
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
    {sourceType : String} {begun : Occurrence} (formed : WellFormed program before)
    (begins : Begins before after request role sourceType begun)
    (admitted : ∀ id ∈ names request, Beginnable before request.scope id ∧ Unclaimed before id) :
    (∀ item ∈ before.items, item.id.occurrence ≠ begun.id ∧ item.attachedTo ≠ some begun.id) ∧
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

/-- The begin of an admitted request in a scope occurrence that stands keeps a state well-formed, when a fresh
occurrence of an Event numbers under the element role and a fresh body is of an element with a Multi-Instance
envelope. -/
theorem Begins.wellFormed {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (formed : WellFormed program before)
    (begins : Begins before after request role sourceType begun) (stands : request.scope ∈ scopeIds before)
    (admitted : ∀ id ∈ names request, Beginnable before request.scope id ∧ Unclaimed before id)
    (roled : ((program.element? request.element).bind (·.event?)).isSome = true → role = .element)
    (bodied : role = .multiInstanceBody →
      (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true) :
    WellFormed program after := by
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
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled, ?attachedReserved, ?typed,
    ?worked, ?roles, ?raises, ?bodyRoles, ?itemRoles⟩
  case issued =>
    exact ⟨fun occurrence member => by
        rcases members occurrence member with rfl | ⟨old, _⟩
        · exact begunBelow
        · have := formed.issued.occurrences occurrence old
          omega,
      fun item member _ => begins.itemMap.2 ▸ formed.itemBelow (begins.items ▸ member),
      fun entry member => Nat.lt_of_lt_of_le (formed.issued.scopes entry (begins.scopes ▸ member)) issued⟩
  case distinct =>
    refine ⟨?_, begins.itemMap.1 ▸ formed.distinct.items, by simpa [scopeIds, begins.scopes] using formed.distinct.scopes,
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
        simpa [scopeIds, begins.scopes] using formed.owned.itemScopes item (begins.items ▸ member)
      itemOccurrences := fun item member => by
        rw [begins.items] at member
        obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.itemOccurrences item member
        exact ⟨occurrence, stays occurrence inside (named ▸ (itemsFree item member).1), named, rest⟩
      attachments := fun item member host attached => by
        rw [begins.items] at member
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
    have queue := formed.queue
    refine ⟨fun host element scope queued => ?_, fun scope queued => ?_, fun occurrence gateway scope queued => ?_,
      fun status failure queued => queue.ends status failure (begins.signals ▸ queued), fun id leave writes rule queued => ?_⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := queue.arm host element scope (begins.signals ▸ queued)
      refine ⟨by omega, by omega, fun found member named => ?_⟩
      rcases members found member with rfl | ⟨old, _⟩
      · exact absurd named (unarmed host hostBelow fun found inside same => (facts found inside same).1)
      · exact facts found old named
    · have := queue.armScope scope (begins.signals ▸ queued)
      omega
    · obtain ⟨occurrenceBelow, scopeBelow, facts⟩ := queue.armGateway occurrence gateway scope (begins.signals ▸ queued)
      refine ⟨by omega, by omega, fun found member named => ?_⟩
      rcases members found member with rfl | ⟨old, _⟩
      · exact absurd named (unarmed occurrence occurrenceBelow fun found inside same => (facts found inside same).1)
      · exact facts found old named
    · have := queue.completes id leave writes rule (begins.signals ▸ queued)
      omega
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
        · exact formed.claimed.attached item (begins.items ▸ member) attached ⟨found, old, named, unbegun⟩ other
            (begins.items ▸ inside) same
      named := fun other queued => by
        have queuedBefore : Queued before other := by simpa [Queued, begins.signals, begins.tokens] using queued
        obtain ⟨nodup, beginnable⟩ := formed.claimed.named other queuedBefore
        refine ⟨nodup, fun id named => ?_⟩
        obtain ⟨below, facts⟩ := beginnable id named
        refine ⟨by omega, fun occurrence member same => ?_⟩
        rcases members occurrence member with rfl | ⟨old, _⟩
        · exact absurd (same ▸ named) (unclaimed other queuedBefore)
        · obtain ⟨unbegun, free, instance_⟩ := facts occurrence old same
          refine ⟨unbegun, by simpa [begins.items] using free, fun present => ?_⟩
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
          omega
      innerPlaced := fun other queued id named found member same => by
        have queuedBefore : Queued before other := by simpa [Queued, begins.signals, begins.tokens] using queued
        rcases members found member with rfl | ⟨old, _⟩
        · exact absurd (same ▸ (List.mem_append_right _ named : id ∈ names other)) (unclaimed other queuedBefore)
        · exact formed.claimed.innerPlaced other queuedBefore id named found old same }
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
  -- No open item waits on the begun occurrence: a reservation's item went before it began, a fresh one has none.
  case attachedReserved | typed =>
    have waited : ∀ item ∈ after.items, ∀ occurrence ∈ after.occurrences, occurrence.id = item.id.occurrence →
        occurrence.begun = true → occurrence ∈ before.occurrences := fun item member occurrence inside named _ => by
      rcases members occurrence inside with rfl | ⟨old, _⟩
      · exact absurd named.symm (itemsFree item (begins.items ▸ member)).1
      · exact old
    first
      | exact formed.attachedReserved.transport (fun _ member => begins.items ▸ member) waited
      | exact formed.typed.transport (fun _ member => begins.items ▸ member) waited fun _ member => begins.signals ▸ member
  case worked =>
    exact formed.worked.shrink (fun _ member => begins.items ▸ member) fun found inside unbegun => by
      rcases members found inside with rfl | ⟨old, _⟩
      · simp [begins.isBegun] at unbegun
      · exact old
  case roles =>
    refine formed.roles.transport fun found inside => ?_
    rcases members found inside with rfl | ⟨old, _⟩
    · rcases begins.source with ⟨reserved, reservation⟩ | fresh
      · exact .inr ⟨reserved, reservation.member, reservation.element.symm, reservation.role.symm⟩
      · exact .inl fun event => fresh.roled.trans (roled (fresh.element ▸ event))
    · exact .inr ⟨found, old, rfl, rfl⟩
  case bodyRoles =>
    refine formed.bodyRoles.transport fun found inside body => ?_
    rcases members found inside with rfl | ⟨old, _⟩
    · rcases begins.source with ⟨reserved, reservation⟩ | fresh
      · exact .inr ⟨reserved, reservation.member, reservation.element.symm, reservation.role.symm⟩
      · rw [fresh.element]
        exact .inl (bodied (fresh.roled.symm.trans body))
    · exact .inr ⟨found, old, rfl, rfl⟩
  -- No open item waits on the begun occurrence, as for `AttachedReserved`.
  case itemRoles =>
    intro item member found inside named
    rcases members found inside with rfl | ⟨old, _⟩
    · exact absurd named.symm (itemsFree item (begins.items ▸ member)).1
    · exact formed.itemRoles item (begins.items ▸ member) found old named
  case raises =>
    refine formed.raises.transport (fun _ _ queued => begins.signals ▸ queued) issued
      (fun x present _ => ⟨by simpa [scopeIds, begins.scopes] using present, begins.instances x⟩) counters
      fun found inside unbegun => ?_
    rcases members found inside with rfl | ⟨old, _⟩
    · simp [begins.isBegun] at unbegun
    · exact old

end Kernel.Laws.State
