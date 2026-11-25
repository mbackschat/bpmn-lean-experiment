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

variable {program : Program}

open Kernel

/-! ## The running unit's next issue -/

/-- The issue table does not hold the running unit's next issue (`IssuerFresh.below`), which `State.issue` takes. -/
theorem IssuerFresh.next {s : State} (fresh : IssuerFresh s) : s.issued[Issue.fresh s.issuing s.issueNext]? = none := by
  cases held : s.issued[Issue.fresh s.issuing s.issueNext]? with
  | none => rfl
  | some slot => exact absurd (fresh.below _ slot held) (Nat.lt_irrefl _)

/-- Nor the issue after it, once the next is recorded: an item's key follows its position (`State.openItemKey`, DC13). -/
theorem IssuerFresh.next_succ {s : State} (fresh : IssuerFresh s) (slot : ClaimSlot) :
    (s.issued.insert (.fresh s.issuing s.issueNext) slot)[Issue.fresh s.issuing (s.issueNext + 1)]? = none := by
  rw [Std.ExtTreeMap.getElem?_insert]
  split
  · rename_i same
    have := Std.LawfulEqOrd.eq_of_compare same
    simp at this
  · cases held : s.issued[Issue.fresh s.issuing (s.issueNext + 1)]? with
    | none => rfl
    | some slot' => exact absurd (fresh.below _ slot' held) (by omega)

/-- Recording an issue the table did not hold keeps every entry it held. -/
theorem TableGrows.insert {s t : State} {issue : Issue} {slot : ClaimSlot} (untabled : s.issued[issue]? = none)
    (issued : t.issued = s.issued.insert issue slot) : TableGrows s t := fun other held found => by
  rw [issued, Std.ExtTreeMap.getElem?_insert]
  split
  · rename_i same
    rw [← Std.LawfulEqOrd.eq_of_compare same, untabled] at found
    cases found
  · exact found

/-- An occurrence key issued as the running unit's next issue (`State.issueOccurrence`), the standing keys and the
counters unchanged: unissued before under a fresh issuer, issued after when its scope occurrence was, and every key
issued before stays issued. -/
theorem occurrence_next {before after : State} {scope : ScopeOccurrenceId} {element : ElementId}
    (keys : standingKeys after = standingKeys before) (ordinals : after.scopeOrdinals = before.scopeOrdinals)
    (counters : after.occurrenceOrdinals = before.occurrenceOrdinals)
    (issued : after.issued = before.issued.insert (.fresh before.issuing before.issueNext)
      (.occurrence { parent := scope, element })) :
    (IssuerFresh before → ¬ OccurrenceIssued before { scope, element, ordinal := .fresh before.issuing before.issueNext }) ∧
      (IssuerFresh before → ScopeIssued before scope →
        OccurrenceIssued after { scope, element, ordinal := .fresh before.issuing before.issueNext }) ∧
      (IssuerFresh before → OccurrenceGrows before after) := by
  refine ⟨fun fresh => occurrence_unissued fresh.next, fun fresh within => ⟨?_, ?_, ?_, ?_⟩,
    fun fresh => .of_same keys ordinals counters (.insert fresh.next issued)⟩
  · exact (ScopeGrows.of_same keys ordinals (.insert fresh.next issued)).issued within
  · intro _ committed; cases committed
  · intro _ committed; cases committed
  · intro unit index named
    cases named
    rw [issued, Std.ExtTreeMap.getElem?_insert_self]

/-- Taking the running unit's next issue (`State.issue`), the transitions unchanged, keeps a fresh issuer fresh. -/
theorem IssuerFresh.issue {s t : State} {slot : ClaimSlot} (fresh : IssuerFresh s)
    (issued : t.issued = s.issued.insert (.fresh s.issuing s.issueNext) slot) (issuing : t.issuing = s.issuing)
    (issueNext : t.issueNext = s.issueNext + 1) (transitions : t.transitions = s.transitions) : IssuerFresh t := by
  refine ⟨fun issue held found => ?_, fun index held found => ?_, fun unit index held found => ?_⟩
  · rw [issued, Std.ExtTreeMap.getElem?_insert] at found
    split at found
    · rename_i same
      exact ⟨_, _, (Std.LawfulEqOrd.eq_of_compare same).symm⟩
    · exact fresh.fresh _ _ found
  · rw [issued, issuing, Std.ExtTreeMap.getElem?_insert] at found
    rw [issueNext]
    split at found
    · rename_i same
      obtain ⟨-, rfl⟩ := Issue.fresh.inj (Std.LawfulEqOrd.eq_of_compare same)
      exact Nat.lt_succ_self _
    · exact Nat.lt_succ_of_lt (fresh.below _ _ found)
  · rw [issued, Std.ExtTreeMap.getElem?_insert] at found
    split at found
    · rename_i same
      obtain ⟨rfl, -⟩ := Issue.fresh.inj (Std.LawfulEqOrd.eq_of_compare same)
      exact .inr issuing.symm
    · exact (fresh.ran _ _ _ found).imp (transitions ▸ ·) (·.trans issuing.symm)

/-- Two issues in a row, an identity and then its order position (`State.enterScope`, DC25), keep the issuer fresh. -/
theorem IssuerFresh.issue_issue {s t : State} {first second : ClaimSlot} (fresh : IssuerFresh s)
    (issued : t.issued = (s.issued.insert (.fresh s.issuing s.issueNext) first).insert (.fresh s.issuing (s.issueNext + 1)) second)
    (issuing : t.issuing = s.issuing) (issueNext : t.issueNext = s.issueNext + 1 + 1) (transitions : t.transitions = s.transitions) :
    IssuerFresh t :=
  (fresh.issue (t := { s with issued := s.issued.insert (.fresh s.issuing s.issueNext) first, issueNext := s.issueNext + 1 })
    rfl rfl rfl rfl).issue issued issuing issueNext transitions

/-- Two issues in a row grow the issue table. -/
theorem TableGrows.insert_insert {s t : State} {first second : ClaimSlot} (fresh : IssuerFresh s)
    (issued : t.issued = (s.issued.insert (.fresh s.issuing s.issueNext) first).insert (.fresh s.issuing (s.issueNext + 1)) second) :
    TableGrows s t :=
  (TableGrows.insert fresh.next (t := { s with issued := s.issued.insert (.fresh s.issuing s.issueNext) first }) rfl).trans
    (.insert (fresh.next_succ first) issued)

/-! ## Counters -/

/-- `after`'s counters are `before`'s with the counter of `inst`, `element` and `role` moved to `n`, above every count
that counter had: what `State.activate` does. -/
structure Activated (before after : State) (inst : InstanceName) (element : ElementId) (role : ActivationRole) (n : Nat) :
    Prop where
  activations : after.activations = { processInstance := inst, element, role, count := n } ::
    before.activations.filter fun count => !(count.processInstance == inst && count.element == element && count.role == role)
  above : ∀ count ∈ before.activations, count.processInstance = inst → count.element = element → count.role = role →
    count.count < n
  positive : 0 < n

theorem Activated.keyed {before after : State} {inst : InstanceName} {element : ElementId} {role : ActivationRole} {n : Nat}
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
theorem Activated.counted {before after : State} {inst : InstanceName} {element : ElementId} {role : ActivationRole} {n : Nat}
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
theorem Activated.fresh {before after : State} {inst : InstanceName} {element : ElementId} {role : ActivationRole} {n : Nat}
    (activated : Activated before after inst element role n) {k : OccurrenceKey} (counted : Counted before k) :
    k ≠ { processInstanceId := inst, element, activation := n, role } := fun same => by
  obtain ⟨count, member, named, rest⟩ := counted
  obtain ⟨elemented, roled, below⟩ := rest
  subst same
  have := activated.above count member named elemented roled
  simp at below
  omega

/-! ## Beginning a request -/

/-- `begun` is the standing reservation `reserved` that the request names, begun in the scope occurrence its key leads
with, under its identity, element, activation and role; the counters do not move. -/
structure Reserved (before after : State) (request : BeginRequest) (begun reserved : Occurrence) : Prop where
  member : reserved ∈ before.occurrences
  named : request.reserved = some reserved.id
  placed : reserved.id.scope = request.scope
  id : begun.id = reserved.id
  element : begun.element = reserved.element
  activation : begun.activation = reserved.activation
  role : begun.role = reserved.role
  activations : after.activations = before.activations
  occurrenceOrdinals : after.occurrenceOrdinals = before.occurrenceOrdinals

/-- `begun` re-keys the standing reservation `reserved` the request names, begun in another scope occurrence than the
one its key leads with (DC26): its record and item counter go, and `begun` takes the running unit's next issue in the
request's scope occurrence, under the reservation's element, activation and role; the counters do not move. -/
structure Rekeyed (before after : State) (request : BeginRequest) (begun reserved : Occurrence) : Prop where
  member : reserved ∈ before.occurrences
  named : request.reserved = some reserved.id
  moved : reserved.id.scope ≠ request.scope
  fresh : IssuerFresh before → request.scope ∈ standingKeys before → ¬ OccurrenceIssued before begun.id
  issued : IssuerFresh before → ScopeIssued before request.scope → OccurrenceIssued after begun.id
  occurrenceGrows : IssuerFresh before → OccurrenceGrows before after
  element : begun.element = reserved.element
  activation : begun.activation = reserved.activation
  role : begun.role = reserved.role
  activations : after.activations = before.activations
  occurrenceOrdinals : after.occurrenceOrdinals = before.occurrenceOrdinals

/-- `begun` is fresh: no reservation the request names stands, its key was never issued before and is issued after,
it is of the requested element, and it is numbered under `role`. -/
structure Issued (before after : State) (request : BeginRequest) (role : ActivationRole) (begun : Occurrence) : Prop where
  unreserved : ∀ id, request.reserved = some id → ∀ occurrence ∈ before.occurrences, occurrence.id ≠ id
  fresh : IssuerFresh before → request.scope ∈ standingKeys before → ¬ OccurrenceIssued before begun.id
  issued : IssuerFresh before → ScopeIssued before request.scope → OccurrenceIssued after begun.id
  occurrenceGrows : IssuerFresh before → OccurrenceGrows before after
  element : begun.element = request.element
  roled : begun.role = role
  activated : Activated before after (before.instanceOf request.scope) request.element role begun.activation

/-- What `State.beginOccurrence` makes of `before`: the occurrence `begun` replaces the record of its identity, begun in
the request's scope occurrence and continuing as the request says, and its start is journalled under its key; it is the
reservation the request names, if that stands, re-keyed in the request's scope occurrence when its key leads with
another (DC26, which drops the reservation's record and item counter), or a fresh occurrence under a key never issued,
numbered under `role`. Nothing else changes. -/
structure Begins (before after : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String)
    (begun : Occurrence) : Prop where
  /-- The begun occurrence is inserted under its key, in place of the record there and of the reservation the request
  names; the list view changes so up to order (`Begins.occurrences`). -/
  occurrenceMap : after.occurrenceMap =
    (before.occurrenceMap.filter fun _ o => o.id == begun.id || request.reserved != some o.id).insert begun.id begun
  started : after.draft.started =
    before.draft.started ++ [{ occurrence := key after begun, owner := begun.scope, sourceType }]
  scope : begun.scope = request.scope
  isBegun : begun.begun = true
  source : (∃ reserved, Reserved before after request begun reserved) ∨
    (∃ reserved, Rekeyed before after request begun reserved) ∨ Issued before after request role begun
  scopeMap : after.scopeMap = before.scopeMap
  scopeOrdinals : after.scopeOrdinals = before.scopeOrdinals
  occurrenceOrdinals : after.occurrenceOrdinals = before.occurrenceOrdinals
  instances : ∀ x, after.instanceOf x = before.instanceOf x
  instanceId : after.instanceId = before.instanceId
  /-- The items stay; the item counters stay, or lose a re-keyed reservation's (DC26). -/
  itemMap : after.openItems = before.openItems ∧ (after.itemOrdinals = before.itemOrdinals ∨
    ∃ id, request.reserved = some id ∧ id ≠ begun.id ∧ after.itemOrdinals = before.itemOrdinals.erase id)
  tokens : allQueuedTokens after = allQueuedTokens before
  signals : allSignals after = allSignals before
  queues : QueuesKept before after
  variables : after.variables = before.variables
  journal : after.journal = before.journal
  transitions : after.transitions = before.transitions
  issuing : after.issuing = before.issuing
  ended : after.draft.ended = before.draft.ended
  status : after.status = before.status
  failure : after.failure = before.failure
  slots : after.slots = before.slots
  continued : begun.continuation = request.continuation
  /-- The issue table only grows under a well-formed issuer, and a well-formed issuer stays one (DC12): a fresh key is
  the running unit's next issue (`State.issue`), which the table does not hold. -/
  table : IssuerFresh before → TableGrows before after
  issuer : IssuerFresh before → IssuerFresh after
  /-- Every begun occurrence is keyed in the scope occurrence it begins in (DC26). -/
  keyed : begun.id.scope = request.scope
  /-- A fresh order position of the begun occurrence is a standing reservation's, or its identity's issue, which the
  issue table records (DC25). -/
  positioned : ∀ unit index, begun.position = .fresh unit index →
    (∃ reserved ∈ before.occurrences, reserved.position = begun.position) ∨
      ∃ slot, after.issued[Issue.fresh unit index]? = some (.occurrence slot)

theorem Begins.scopes {before after : State} {request : BeginRequest} {role : ActivationRole} {sourceType : String}
    {begun : Occurrence} (begins : Begins before after request role sourceType begun) : after.scopes = before.scopes := by
  rw [scopes_eq, scopes_eq, begins.scopeMap]

theorem Begins.occurrencesKeyed {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (begins : Begins before after request role sourceType begun)
    (keyed : OccurrencesKeyed before.occurrenceMap) : OccurrencesKeyed after.occurrenceMap := by
  rw [begins.occurrenceMap]; exact occurrencesKeyed_insert (occurrencesKeyed_filter keyed _) begun

/-- An occurrence after a begin is an old one or the begun one. -/
theorem Begins.mem_occurrences {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (begins : Begins before after request role sourceType begun) {o : Occurrence}
    (member : o ∈ after.occurrences) : o ∈ before.occurrences ∨ o = begun := by
  rw [occurrences_eq, begins.occurrenceMap] at member
  exact (mem_occurrenceList_insert_sub member).imp_left fun old => (mem_occurrenceList_filter_val.mp old).1

/-- The begun occurrence stands after a begin. -/
theorem Begins.begun_mem {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (begins : Begins before after request role sourceType begun) :
    begun ∈ after.occurrences := by
  rw [occurrences_eq, begins.occurrenceMap]; exact mem_occurrenceList_insert_self

/-- The begun occurrence replaces the record of its identity and the reservation the request names, up to order. -/
theorem Begins.occurrences {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (begins : Begins before after request role sourceType begun)
    (keyed : OccurrencesKeyed before.occurrenceMap) :
    after.occurrences.Perm
      (before.occurrences.filter (fun o => o.id != begun.id && request.reserved != some o.id) ++ [begun]) := by
  rw [occurrences_eq, occurrences_eq, begins.occurrenceMap, occurrenceList_eq, occurrenceList_eq]
  refine (Keyed.values_insert_perm (occurrencesKeyed_filter keyed _) rfl).trans ?_
  rw [Keyed.values_filter_val, List.filter_filter]
  refine .of_eq (congrArg (· ++ [begun]) (List.filter_congr fun o _ => ?_))
  simp only [bne]
  generalize (o.id == begun.id) = same
  cases same <;> rfl

/-- The item list stays: the item map does (`itemMap`). -/
theorem Begins.items {before after : State} {request : BeginRequest} {role : ActivationRole} {sourceType : String}
    {begun : Occurrence} (frame : Begins before after request role sourceType begun) : itemList after.openItems = itemList before.openItems :=
  items_congr frame.itemMap.1

/-- The begun occurrence takes a key no other occurrence it keeps and no start fact of `before` has: a reservation's
own, kept or re-keyed (DC26), or a fresh activation. -/
private theorem Begins.keyNew {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (formed : WellFormed program before)
    (begins : Begins before after request role sourceType begun) (stands : request.scope ∈ scopeIds before)
    (admitted : ∀ id ∈ names request, Beginnable before request.scope id ∧ Unclaimed before id) :
    (∀ occurrence ∈ before.occurrences, occurrence.id ≠ begun.id → request.reserved ≠ some occurrence.id →
        key before occurrence ≠ key before begun) ∧
      (∀ fact ∈ starts before, fact.occurrence ≠ key before begun) ∧ Counted after (key before begun) := by
  rcases begins.source with ⟨reserved, reservation⟩ | ⟨reserved, rekeyed⟩ | fresh
  · obtain ⟨_, facts⟩ := (admitted reserved.id (by simp [names, reservation.named])).1
    obtain ⟨unbegun, _, instance_⟩ := facts reserved reservation.member rfl
    have keyed : key before begun = key before reserved := by
      simp only [key, begins.scope, instance_ stands, reservation.element, reservation.activation, reservation.role]
    rw [keyed]
    refine ⟨fun occurrence inside other _ equal => other ?_,
      fun fact started => formed.reservations reserved reservation.member unbegun fact started, ?_⟩
    · have := nodup_map_eq formed.distinct.keys inside reservation.member equal
      rw [this, reservation.id]
    · exact (formed.occurrencesCounted reserved reservation.member).congr reservation.activations
  · obtain ⟨_, facts⟩ := (admitted reserved.id (by simp [names, rekeyed.named])).1
    obtain ⟨unbegun, _, instance_⟩ := facts reserved rekeyed.member rfl
    have keyed : key before begun = key before reserved := by
      simp only [key, begins.scope, instance_ stands, rekeyed.element, rekeyed.activation, rekeyed.role]
    rw [keyed]
    refine ⟨fun occurrence inside _ unnamed equal => unnamed ?_,
      fun fact started => formed.reservations reserved rekeyed.member unbegun fact started, ?_⟩
    · have := nodup_map_eq formed.distinct.keys inside rekeyed.member equal
      rw [this, rekeyed.named]
    · exact (formed.occurrencesCounted reserved rekeyed.member).congr rekeyed.activations
  · have keyed : key before begun =
        { processInstanceId := before.instanceOf request.scope, element := request.element,
          activation := begun.activation, role } := by
      simp [key, begins.scope, fresh.element, fresh.roled]
    rw [keyed]
    refine ⟨fun occurrence inside _ _ => fresh.activated.fresh (formed.occurrencesCounted occurrence inside),
      fun fact started => fresh.activated.fresh (formed.counted fact started), ?_⟩
    exact ⟨_, fresh.activated.activations ▸ List.mem_cons_self .., rfl, rfl, rfl, Nat.le_refl _⟩

/-- The begun identity is no other standing occurrence's, item's or claim's when it is fresh: a re-keyed reservation's
(DC26) and a fresh begin's were never issued. -/
private theorem Begins.freshNew {before after : State} {request : BeginRequest} {begun : Occurrence}
    (formed : WellFormed program before) (stands : request.scope ∈ scopeIds before)
    (fresh : IssuerFresh before → request.scope ∈ standingKeys before → ¬ OccurrenceIssued before begun.id)
    (grows : OccurrenceGrows before after) :
    (∀ item ∈ itemList before.openItems, item.id.occurrence ≠ begun.id ∧ item.attachedTo ≠ some begun.id) ∧
      (∀ occurrence ∈ before.occurrences, occurrence.id = begun.id → occurrence.begun = false) ∧
      (∀ other, Queued before other → begun.id ∉ names other) ∧ OccurrenceGrows before after := by
  refine ⟨fun item inside => ?_, fun occurrence inside equal => ?_, fun other queued named => ?_, grows⟩
  · obtain ⟨occurrence, held, same, _⟩ := formed.owned.itemOccurrences item inside
    refine ⟨fun equal => ?_, fun attached => ?_⟩
    · exact fresh formed.issuer stands (equal ▸ same ▸ formed.issued.occurrences occurrence held)
    · obtain ⟨host, hosted, same, _⟩ := formed.owned.attachments item inside _ attached
      exact fresh formed.issuer stands (same ▸ formed.issued.occurrences host hosted)
  · exact (fresh formed.issuer stands (equal ▸ formed.issued.occurrences occurrence inside)).elim
  · exact fresh formed.issuer stands ((formed.claimed.named other queued).2 _ named).1

/-- The begun occurrence's identity is no other standing occurrence's, item's or claim's: a reservation's is claimed by
nothing else, a re-keyed or fresh one was never issued. -/
private theorem Begins.idNew {before after : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {begun : Occurrence} (formed : WellFormed program before)
    (begins : Begins before after request role sourceType begun) (stands : request.scope ∈ scopeIds before)
    (admitted : ∀ id ∈ names request, Beginnable before request.scope id ∧ Unclaimed before id) :
    (∀ item ∈ itemList before.openItems, item.id.occurrence ≠ begun.id ∧ item.attachedTo ≠ some begun.id) ∧
      (∀ occurrence ∈ before.occurrences, occurrence.id = begun.id → occurrence.begun = false) ∧
      (∀ other, Queued before other → begun.id ∉ names other) ∧ OccurrenceGrows before after := by
  rcases begins.source with ⟨reserved, reservation⟩ | ⟨_, rekeyed⟩ | issuedFresh
  · obtain ⟨⟨_, facts⟩, unclaimed⟩ := admitted reserved.id (by simp [names, reservation.named])
    obtain ⟨_, free, _⟩ := facts reserved reservation.member rfl
    refine ⟨reservation.id ▸ free, fun occurrence inside equal => ?_, reservation.id ▸ unclaimed.1,
      .of_same (congrArg (List.map ScopeOccurrence.id) begins.scopes) begins.scopeOrdinals reservation.occurrenceOrdinals
        (begins.table formed.issuer)⟩
    have := nodup_map_eq formed.distinct.occurrences inside reservation.member (equal.trans reservation.id)
    exact this ▸ (facts reserved reservation.member rfl).1
  · exact Begins.freshNew formed stands rekeyed.fresh (rekeyed.occurrenceGrows formed.issuer)
  · exact Begins.freshNew formed stands issuedFresh.fresh (issuedFresh.occurrenceGrows formed.issuer)

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
  have grows : ScopeGrows before after :=
    .of_same (congrArg (List.map ScopeOccurrence.id) begins.scopes) begins.scopeOrdinals (begins.table formed.issuer)
  obtain ⟨keyNew, factNew, keyCounted⟩ := begins.keyNew formed stands admitted
  obtain ⟨itemsFree, unbegunOnly, unclaimed, issued⟩ := begins.idNew formed stands admitted
  have counters : ∀ k, Counted before k → Counted after k := fun k counted => by
    rcases begins.source with ⟨_, reservation⟩ | ⟨_, rekeyed⟩ | fresh
    · exact counted.congr reservation.activations
    · exact counted.congr rekeyed.activations
    · exact fresh.activated.counted counted
  -- The begun identity was issued: a standing reservation's, or a fresh key.
  have scopeIssued : ScopeIssued before request.scope := by
    obtain ⟨standing, member, named⟩ := List.mem_map.mp stands
    exact named ▸ formed.issued.scopes standing member
  have begunBelow : OccurrenceIssued after begun.id := by
    rcases begins.source with ⟨reserved, reservation⟩ | ⟨_, rekeyed⟩ | fresh
    · exact reservation.id ▸ issued _ (formed.issued.occurrences reserved reservation.member)
    · exact rekeyed.issued formed.issuer scopeIssued
    · exact fresh.issued formed.issuer scopeIssued
  -- No queued arming hangs on the begun occurrence: a reservation is unbegun, a fresh identity was never issued.
  have unarmed : ∀ host, OccurrenceIssued before host →
      (∀ found ∈ before.occurrences, found.id = host → found.begun = true) → begun.id ≠ host :=
    fun host below armed same => by
    rcases begins.source with ⟨reserved, reservation⟩ | ⟨_, rekeyed⟩ | fresh
    · have := armed reserved reservation.member (reservation.id ▸ same)
      simp [unbegunOnly reserved reservation.member reservation.id.symm] at this
    · exact rekeyed.fresh formed.issuer stands (same ▸ below)
    · exact fresh.fresh formed.issuer stands (same ▸ below)
  -- The reservation the request names is unbegun and holds no item: a re-keyed one goes (DC26).
  have named : ∀ occurrence ∈ before.occurrences, request.reserved = some occurrence.id →
      occurrence.begun = false ∧
        ∀ item ∈ itemList before.openItems, item.id.occurrence ≠ occurrence.id ∧ item.attachedTo ≠ some occurrence.id :=
    fun occurrence member same => by
      obtain ⟨unbegun, free, _⟩ := (admitted occurrence.id (by simp [names, same])).1.2 occurrence member rfl
      exact ⟨unbegun, free⟩
  have perm := begins.occurrences formed.distinct.occurrencesKeyed
  have kept : ∀ occurrence ∈ after.occurrences, occurrence ≠ begun → occurrence ∈ before.occurrences ∧
      occurrence.id ≠ begun.id ∧ request.reserved ≠ some occurrence.id := fun occurrence member other => by
    rcases List.mem_append.mp (perm.mem_iff.mp member) with old | new
    · obtain ⟨inside, differs⟩ := List.mem_filter.mp old
      simp only [Bool.and_eq_true, bne_iff_ne, ne_eq] at differs
      exact ⟨inside, differs⟩
    · exact absurd (List.mem_singleton.mp new) other
  have members : ∀ occurrence ∈ after.occurrences, occurrence = begun ∨
      (occurrence ∈ before.occurrences ∧ occurrence.id ≠ begun.id ∧ request.reserved ≠ some occurrence.id) :=
      fun occurrence member => by
    by_cases same : occurrence = begun
    · exact .inl same
    · exact .inr (kept occurrence member same)
  have begunIn : begun ∈ after.occurrences := perm.mem_iff.mpr (by simp)
  have startsAfter : starts after = starts before ++ [{ occurrence := key after begun, owner := begun.scope, sourceType }] := by
    simp [starts, begins.transitions, begins.started]
  -- An occurrence `before` held that is not the begun one stands after it.
  have stays : ∀ occurrence ∈ before.occurrences, occurrence.id ≠ begun.id → request.reserved ≠ some occurrence.id →
      occurrence ∈ after.occurrences :=
    fun occurrence member differs unnamed => by
      exact perm.mem_iff.mpr (List.mem_append_left _ (List.mem_filter.mpr ⟨member, by simpa [differs] using unnamed⟩))
  have housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after := fun occurrence member => by
    rw [scopeIds, begins.scopes]
    rcases members occurrence member with rfl | ⟨old, _⟩
    · exact begins.scope ▸ stands
    · exact formed.owned.occurrenceScopes occurrence old
  refine ⟨?issued, ?distinct, ?startedOnce, ?activations, ?reservations, ?owned, ?rooted,
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled, ?attachedReserved, ?typed,
    ?worked, ?roles, ?raises, ?bodyRoles, ?itemRoles, ?issuer⟩
  case issued =>
    exact ⟨fun occurrence member => by
        rcases members occurrence member with rfl | ⟨old, _⟩
        · exact begunBelow
        · exact issued _ (formed.issued.occurrences occurrence old),
      fun item member => by
        have member' := begins.items ▸ member
        obtain ⟨owner, below, tabled⟩ := formed.issued.items item member'
        refine ⟨owner, fun ⟨found, present, same⟩ n committed => ?_,
          fun unit index fresh => (begins.table formed.issuer) _ _ (tabled unit index fresh)⟩
        rcases members found present with rfl | ⟨old, _, unnamed⟩
        · exact absurd same.symm (itemsFree item member').1
        · rcases begins.itemMap.2 with ordinals | ⟨id, reserved, _, erased⟩
          · rw [ordinals]; exact below ⟨found, old, same⟩ n committed
          · rw [erased, getD_erase_ne fun equal => unnamed (by rw [reserved, same, equal])]
            exact below ⟨found, old, same⟩ n committed,
      fun entry member => grows.issued (formed.issued.scopes entry (begins.scopes ▸ member)),
      formed.issued.positionsKept (fun _ member => begins.scopes ▸ member) (begins.table formed.issuer),
      fun occurrence member unit index fresh => by
        rcases members occurrence member with rfl | ⟨old, _⟩
        · rcases begins.positioned unit index fresh with ⟨reserved, inside, same⟩ | tabled
          · obtain ⟨slot, held⟩ := formed.issued.occurrencePositions reserved inside unit index (same.trans fresh)
            exact ⟨slot, (begins.table formed.issuer) _ _ held⟩
          · exact tabled
        · obtain ⟨slot, held⟩ := formed.issued.occurrencePositions occurrence old unit index fresh
          exact ⟨slot, (begins.table formed.issuer) _ _ held⟩⟩
  case distinct =>
    refine ⟨begins.occurrencesKeyed formed.distinct.occurrencesKeyed, begins.itemMap.1 ▸ formed.distinct.items,
      begins.scopeMap ▸ formed.distinct.scopesKeyed, ?_⟩
    · rw [funext keys, (perm.map _).nodup_iff, List.map_append, List.nodup_append]
      refine ⟨formed.distinct.keys.sublist (List.filter_sublist.map _), by simp, ?_⟩
      intro k old other new
      obtain ⟨occurrence, inside, named⟩ := List.mem_map.mp old
      simp at new
      subst named new
      obtain ⟨member, differs⟩ := List.mem_filter.mp inside
      simp only [Bool.and_eq_true, bne_iff_ne, ne_eq] at differs
      exact keyNew occurrence member differs.1 differs.2
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
    rcases begins.source with ⟨_, reservation⟩ | ⟨_, rekeyed⟩ | fresh
    · exact ⟨reservation.activations ▸ formed.activations.keys, reservation.activations ▸ formed.activations.positive⟩
    · exact ⟨rekeyed.activations ▸ formed.activations.keys, rekeyed.activations ▸ formed.activations.positive⟩
    · exact fresh.activated.keyed formed.activations
  case reservations =>
    exact fun occurrence member unbegun fact started => by
      rcases members occurrence member with rfl | ⟨old, differs, unnamed⟩
      · simp [begins.isBegun] at unbegun
      · rw [startsAfter] at started
        rw [keys]
        rcases List.mem_append.mp started with earlier | new
        · exact formed.reservations occurrence old unbegun fact earlier
        · simp at new
          subst new
          intro same
          exact keyNew occurrence old differs unnamed (by rw [← same, keys])
  case owned =>
    exact {
      occurrenceScopes := housed
      itemScopes := fun item member => by
        simpa [scopeIds, begins.scopes] using formed.owned.itemScopes item (begins.items ▸ member)
      itemOccurrences := fun item member => by
        rw [begins.items] at member
        obtain ⟨occurrence, inside, same, rest⟩ := formed.owned.itemOccurrences item member
        exact ⟨occurrence, stays occurrence inside (same ▸ (itemsFree item member).1)
          (fun reserved => ((named occurrence inside reserved).2 item member).1 same.symm), same, rest⟩
      attachments := fun item member host attached => by
        rw [begins.items] at member
        obtain ⟨occurrence, inside, same, rest⟩ := formed.owned.attachments item member host attached
        refine ⟨occurrence, stays occurrence inside (fun equal => (itemsFree item member).2 ?_)
          (fun reserved => ((named occurrence inside reserved).2 item member).2 ?_), same, rest⟩
        · rw [attached, ← same, equal]
        · rw [attached, ← same]
      scopeOwners := fun entry member owner owned => by
        rw [begins.scopes] at member
        obtain ⟨occurrence, inside, same, begunFlag⟩ := formed.owned.scopeOwners entry member owner owned
        refine ⟨occurrence, stays occurrence inside (fun hit => ?_) (fun reserved => ?_), same, begunFlag⟩
        · simp [unbegunOnly occurrence inside hit] at begunFlag
        · simp [(named occurrence inside reserved).1] at begunFlag
      variableScopes := by simpa [scopeIds, begins.variables, begins.scopes] using formed.owned.variableScopes
      tokenScopes := by simpa [scopeIds, begins.tokens, begins.scopes] using formed.owned.tokenScopes }
  case rooted =>
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, begins.scopes] using present, by simpa [begins.scopes] using parentless, ?_⟩
    intro scope member
    exact Within.congr begins.scopes (reach scope (begins.scopes ▸ member))
  case failure => simpa [FailureRecorded, begins.failure, begins.status] using formed.failure
  case queue =>
    have queue := formed.queue
    refine ⟨fun host element scope queued => ?_, fun scope queued => ?_, fun occurrence gateway scope queued => ?_,
      fun status failure queued => queue.ends status failure (begins.signals ▸ queued), fun id leave writes rule queued => ?_⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := queue.arm host element scope (begins.signals ▸ queued)
      refine ⟨issued _ hostBelow, grows.issued scopeBelow, fun found member named => ?_⟩
      rcases members found member with rfl | ⟨old, _⟩
      · exact absurd named (unarmed host hostBelow fun found inside same => (facts found inside same).1)
      · exact facts found old named
    · exact grows.issued (queue.armScope scope (begins.signals ▸ queued))
    · obtain ⟨occurrenceBelow, scopeBelow, facts⟩ := queue.armGateway occurrence gateway scope (begins.signals ▸ queued)
      refine ⟨issued _ occurrenceBelow, grows.issued scopeBelow, fun found member named => ?_⟩
      rcases members found member with rfl | ⟨old, _⟩
      · exact absurd named (unarmed occurrence occurrenceBelow fun found inside same => (facts found inside same).1)
      · exact facts found old named
    · exact issued _ (queue.completes id leave writes rule (begins.signals ▸ queued))
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
        refine ⟨issued _ below, fun occurrence member same => ?_⟩
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
      scopesIssued := fun other queued =>
        grows.issued (formed.claimed.scopesIssued other (by simpa [Queued, begins.signals, begins.tokens] using queued))
      innerPlaced := fun other queued id named found member same => by
        have queuedBefore : Queued before other := by simpa [Queued, begins.signals, begins.tokens] using queued
        rcases members found member with rfl | ⟨old, _⟩
        · exact absurd (same ▸ (List.mem_append_right _ named : id ∈ names other)) (unclaimed other queuedBefore)
        · exact formed.claimed.innerPlaced other queuedBefore id named found old same }
  case settled =>
    exact formed.settled.transport (.same begins.slots) issued grows
      (fun found inside unbegun => by
        rcases members found inside with rfl | ⟨old, _⟩
        · simp [begins.isBegun] at unbegun
        · exact .inl old)
      (fun _ queued => by simpa [Queued, begins.signals, begins.tokens] using queued)
      (fun _ member => begins.signals ▸ member) (fun _ member => .inl (begins.scopes ▸ member))
  -- No open item waits on the begun occurrence: a reservation's item went before it began, a fresh one has none.
  case attachedReserved | typed =>
    have waited : ∀ item ∈ itemList after.openItems, ∀ occurrence ∈ after.occurrences, occurrence.id = item.id.occurrence →
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
    · rcases begins.source with ⟨reserved, reservation⟩ | ⟨reserved, rekeyed⟩ | fresh
      · exact .inr ⟨reserved, reservation.member, reservation.element.symm, reservation.role.symm⟩
      · exact .inr ⟨reserved, rekeyed.member, rekeyed.element.symm, rekeyed.role.symm⟩
      · exact .inl fun event => fresh.roled.trans (roled (fresh.element ▸ event))
    · exact .inr ⟨found, old, rfl, rfl⟩
  case bodyRoles =>
    refine formed.bodyRoles.transport fun found inside body => ?_
    rcases members found inside with rfl | ⟨old, _⟩
    · rcases begins.source with ⟨reserved, reservation⟩ | ⟨reserved, rekeyed⟩ | fresh
      · exact .inr ⟨reserved, reservation.member, reservation.element.symm, reservation.role.symm⟩
      · exact .inr ⟨reserved, rekeyed.member, rekeyed.element.symm, rekeyed.role.symm⟩
      · rw [fresh.element]
        exact .inl (bodied (fresh.roled.symm.trans body))
    · exact .inr ⟨found, old, rfl, rfl⟩
  -- No open item waits on the begun occurrence, as for `AttachedReserved`.
  case issuer => exact begins.issuer formed.issuer
  case itemRoles =>
    intro item member found inside named
    rcases members found inside with rfl | ⟨old, _⟩
    · exact absurd named.symm (itemsFree item (begins.items ▸ member)).1
    · exact formed.itemRoles item (begins.items ▸ member) found old named
  case raises =>
    refine formed.raises.transport (fun _ _ queued => begins.signals ▸ queued) grows issued
      fun found inside unbegun => ?_
    rcases members found inside with rfl | ⟨old, _⟩
    · simp [begins.isBegun] at unbegun
    · exact old

end Kernel.Laws.State
