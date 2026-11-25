module

public import Kernel.Laws.State.Keeps
public import Kernel.Laws.State.Called

/-! # Laws of the kernel state: entering a scope occurrence and queuing bare begins

That `State.enterScope` keeps `WellFormed` when it enters below a scope occurrence that stands, owned, if at all, by a
begun occurrence running there, composed from `Kernel.Laws.State.enterScope_eq`; it reads no body. The new scope
occurrence takes a key no history holds (`Laws.State.entered_unissued`), so nothing standing or queued names it, and
every history grows into one that does (`ScopeGrows.enter`); what stood keeps its process
instance, since its parent chain is unchanged (`Laws.State.instanceOf_kept`). A bare begin, which names no
reservation, queued as a signal or deferred onto the work stack in a scope occurrence that stands, claims nothing, so
it keeps the claims single and what has settled settled. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/-- A containment holds in a state that keeps every scope occurrence. -/
theorem Within.grow {s t : State} (scopes : ∀ entry ∈ s.scopes, entry ∈ t.scopes) {inner outer : ScopeOccurrenceId}
    (within : Within s inner outer) : Within t inner outer := by
  induction within with
  | refl scope => exact .refl scope
  | parent child parent outer member link _ ih => exact .parent child parent outer (scopes child member) link ih

/-- What entering the scope occurrence `entry` makes of `before`, apart from the key it takes: `entry` joins the scope
occurrences with its variable set, holding `locals`; the slots hold nothing new and nothing else changes but the
instances a called root records (`State.enterScope`, `State.enterCalled`). -/
structure ScopeAppended (before after : State) (entry : ScopeOccurrence) (locals : List (String × Value)) : Prop where
  occurrenceOrdinals : after.occurrenceOrdinals = before.occurrenceOrdinals
  scopeMap : after.scopeMap = before.scopeMap.insert entry.id entry
  variables : after.variables = before.variables.insert entry.id (Variables.ofBindings locals)
  occurrenceMap : after.occurrenceMap = before.occurrenceMap
  itemMap : after.openItems = before.openItems ∧ after.itemOrdinals = before.itemOrdinals
  tokens : allQueuedTokens after = allQueuedTokens before
  signals : allSignals after = allSignals before
  activations : after.activations = before.activations
  journal : after.journal = before.journal
  transitions : after.transitions = before.transitions
  draft : after.draft = before.draft
  status : after.status = before.status
  failure : after.failure = before.failure
  instanceId : after.instanceId = before.instanceId
  slots : SlotsWithin before after

/-- The occurrences stay: the occurrence map does (`occurrenceMap`). -/
theorem ScopeAppended.occurrences {before after : State} {entry : ScopeOccurrence} {locals : List (String × Value)}
    (appended : ScopeAppended before after entry locals) : after.occurrences = before.occurrences :=
  occurrences_congr appended.occurrenceMap

/-- The scope occurrences after an entry under a key none holds: the old ones and the entry. -/
theorem ScopeAppended.mem_scopes {before after : State} {entry : ScopeOccurrence} {locals : List (String × Value)}
    (appended : ScopeAppended before after entry locals) (keyed : ScopesKeyed before.scopeMap)
    (fresh : ∀ old ∈ before.scopes, old.id ≠ entry.id) {found : ScopeOccurrence} :
    found ∈ after.scopes ↔ found ∈ before.scopes ∨ found = entry := by
  rw [scopes_eq after, appended.scopeMap]
  exact mem_scopeList_insert_fresh keyed fresh

/-- What entering the scope occurrence `entry` makes of `before`: `ScopeAppended`, under a key never issued, every
history growing into one that holds it, the issue table growing and the issuer staying fresh (DC12). -/
structure Enters (before after : State) (entry : ScopeOccurrence) (locals : List (String × Value)) : Prop
    extends ScopeAppended before after entry locals where
  unissued : ¬ ScopeIssued before entry.id
  scopeGrows : ScopeGrows before after
  entered : Historic before → ScopeIssued after entry.id
  table : TableGrows before after
  issuer : IssuerFresh before → IssuerFresh after
  positionTabled : ∀ unit index, entry.position = .fresh unit index → after.issued[Issue.fresh unit index]? = some .position
  /-- Entering issues no activation. -/
  slotsFrom : ∀ (issue : Issue) (slot : ActivationSlot), after.issued[issue]? = some (.activation slot) → before.issued[issue]? = some (.activation slot)

/-- The item list stays: the item map does (`itemMap`). -/
theorem Enters.items {before after : State} {entry : ScopeOccurrence} {locals : List (String × Value)}
    (frame : Enters before after entry locals) : itemList after.openItems = itemList before.openItems :=
  items_congr frame.itemMap.1

/-- Entering a scope occurrence below one that stands, owned, if at all, by a begun occurrence running there, keeps a
state well-formed. -/
theorem Enters.wellFormed {s after : State} {entry : ScopeOccurrence} {locals : List (String × Value)}
    (formed : WellFormed program s) (enters : Enters s after entry locals) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (entryParent : entry.parent = some parent)
    (ownerBegun : ∀ id, entry.occurrence = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧
      occurrence.begun = true ∧ occurrence.scope = parent)
    (entryNamed : ∀ name, entry.calledInstance = some name → NameTabled after name) :
    WellFormed program after := by
  have fresh : ∀ found ∈ s.scopes, found.id ≠ entry.id := fun found inside same =>
    enters.unissued (same ▸ formed.issued.scopes found inside)
  have keyedAfter : ScopesKeyed after.scopeMap := by
    rw [enters.scopeMap]; exact scopesKeyed_insert formed.distinct.scopesKeyed entry
  have memAfter : ∀ found, found ∈ after.scopes ↔ found ∈ s.scopes ∨ found = entry := fun _ =>
    enters.mem_scopes formed.distinct.scopesKeyed fresh
  have members : ∀ found ∈ after.scopes, found ∈ s.scopes ∨ found = entry := fun found inside => (memAfter found).mp inside
  have grows : ∀ found ∈ s.scopes, found ∈ after.scopes := fun found inside => (memAfter found).mpr (.inl inside)
  have idsMem : ∀ x, x ∈ scopeIds after ↔ x ∈ scopeIds s ∨ x = entry.id := fun x => by
    simp only [scopeIds, List.mem_map, memAfter]
    constructor
    · rintro ⟨found, old | rfl, rfl⟩; exact .inl ⟨found, old, rfl⟩; exact .inr rfl
    · rintro (⟨found, old, rfl⟩ | rfl); exact ⟨found, .inl old, rfl⟩; exact ⟨entry, .inr rfl, rfl⟩
  have nodup : (scopeIds after).Nodup := by rw [scopeIds, scopes_eq]; exact scopeList_nodup keyedAfter
  have rootBelow : ScopeIssued s State.root := by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp formed.rooted.1
    exact named ▸ formed.issued.scopes found inside
  have notRoot : entry.id ≠ State.root := fun same => enters.unissued (same ▸ rootBelow)
  have below : ∀ x ∈ scopeIds s, ScopeIssued s x := fun x member => by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp member
    exact named ▸ formed.issued.scopes found inside
  have idsGrow : ∀ x ∈ scopeIds s, x ∈ scopeIds after := fun x member => (idsMem x).mpr (.inl member)
  have occurrenceGrows : OccurrenceGrows s after := .enter enters.scopeGrows (fun x standing => by
      change x ∈ scopeIds after at standing
      rcases (idsMem x).mp standing with old | new
      · exact .inl old
      · rw [new]; exact .inr enters.unissued) enters.occurrenceOrdinals enters.table
  have hOcc := enters.occurrences
  have hItems := enters.items
  have hTokens := enters.tokens
  have hSignals := enters.signals
  have hVars := enters.variables
  have startsEq : starts after = starts s := by simp [starts, enters.transitions, enters.draft]
  have countedEq : ∀ k, Counted s k → Counted after k := fun _ => Counted.congr enters.activations enters.table
  have queuedEq : ∀ request, Queued after request ↔ Queued s request := by simp [Queued, hSignals, hTokens]
  have parentless : ∀ found ∈ after.scopes, found.parent = none → found.id = State.root := fun found inside orphan => by
    rcases members found inside with old | rfl
    · exact (formed.rooted.2.1 found old).mp orphan
    · simp [entryParent] at orphan
  have instances : ∀ x ∈ scopeIds s, after.instanceOf x = s.instanceOf x := fun x present =>
    instanceOf_kept formed nodup parentless enters.instanceId present fun found inside _ => grows found inside
  have keys : ∀ occurrence ∈ s.occurrences, key after occurrence = key s occurrence := fun occurrence member =>
    key_congr (instances _ (formed.owned.occurrenceScopes occurrence member))
  have parentWithin : Within s parent State.root := by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp stands
    exact named ▸ formed.rooted.2.2 found inside
  have issued : IssuedBelow after := ⟨fun occurrence member => by
      rw [hOcc] at member
      exact occurrenceGrows _ (formed.issued.occurrences occurrence member),
    fun item member => by
      rw [hItems] at member
      obtain ⟨committed, below, tabled⟩ := formed.issued.items item member
      exact ⟨committed, fun present => by rw [enters.itemMap.2]; exact below (hOcc ▸ present),
        fun unit index fresh => enters.table _ _ (tabled unit index fresh)⟩,
    fun found member => by
      rcases members found member with old | rfl
      · exact enters.scopeGrows.issued (formed.issued.scopes found old)
      · exact enters.entered rootBelow.historic,
    fun found member unit index pending => by
      rcases members found member with old | rfl
      · exact enters.table _ _ (formed.issued.positions found old unit index pending)
      · exact enters.positionTabled unit index pending,
    fun found member unit index pending =>
      let ⟨slot, held⟩ := formed.issued.occurrencePositions found (hOcc ▸ member) unit index pending
      ⟨slot, enters.table _ _ held⟩,
    fun found member name called => by
      rcases members found member with old | rfl
      · exact (formed.issued.names found old name called).grow enters.table
      · exact entryNamed name called,
    formed.issued.slotsGrow enters.table fun issue slot held => .inl (enters.slotsFrom issue slot held)⟩
  have distinct : Distinct after := ⟨enters.occurrenceMap ▸ formed.distinct.occurrencesKeyed,
    enters.itemMap.1 ▸ formed.distinct.items, keyedAfter, by
      rw [hOcc, List.map_congr_left keys]
      exact formed.distinct.keys⟩
  have owned : Owned after := ⟨fun occurrence member => by
      rw [hOcc] at member
      exact idsGrow _ (formed.owned.occurrenceScopes occurrence member),
    fun item member => by
      rw [hItems] at member
      exact idsGrow _ (formed.owned.itemScopes item member),
    fun item member => by
      rw [hOcc]
      rw [hItems] at member
      exact formed.owned.itemOccurrences item member,
    fun item member host attached => by
      rw [hOcc]
      rw [hItems] at member
      exact formed.owned.attachments item member host attached,
    fun found member id link => by
      rw [hOcc]
      rcases members found member with old | rfl
      · exact formed.owned.scopeOwners found old id link
      · obtain ⟨occurrence, inside, named, begun⟩ := ownerBegun id link
        exact ⟨occurrence, inside, named, begun.1⟩,
    fun x member => by
      rw [hVars, Std.ExtTreeMap.mem_insert, Std.LawfulEqCmp.compare_eq_iff_eq] at member
      rcases member with rfl | old
      · exact (idsMem _).mpr (.inr rfl)
      · exact idsGrow _ (formed.owned.variableScopes x old),
    fun token member => by
      rw [hTokens] at member
      exact idsGrow _ (formed.owned.tokenScopes token member)⟩
  have rooted : Rooted after := ⟨idsGrow _ formed.rooted.1, fun found member => by
      rcases members found member with old | rfl
      · exact formed.rooted.2.1 found old
      · exact ⟨fun orphan => by simp [entryParent] at orphan, fun same => absurd same notRoot⟩,
    fun found member => by
      rcases members found member with old | rfl
      · exact (formed.rooted.2.2 found old).grow grows
      · exact .parent _ parent _ ((memAfter _).mpr (.inr rfl)) entryParent
          (parentWithin.grow grows)⟩
  have queue : QueueSound after := ⟨fun host element scope member => by
      rw [hSignals] at member
      obtain ⟨hostBelow, scopeBelow, placed⟩ := formed.queue.arm host element scope member
      rw [hOcc]
      exact ⟨occurrenceGrows _ hostBelow, enters.scopeGrows.issued scopeBelow, placed⟩,
    fun scope member => by
      rw [hSignals] at member
      exact enters.scopeGrows.issued (formed.queue.armScope scope member),
    fun occurrence gateway scope member => by
      rw [hSignals] at member
      obtain ⟨hostBelow, scopeBelow, placed⟩ := formed.queue.armGateway occurrence gateway scope member
      rw [hOcc]
      exact ⟨occurrenceGrows _ hostBelow, enters.scopeGrows.issued scopeBelow, placed⟩,
    fun status failure member => by
      rw [hSignals] at member
      exact formed.queue.ends status failure member,
    fun id leave writes rule member => by
      rw [hSignals] at member
      exact occurrenceGrows _ (formed.queue.completes id leave writes rule member)⟩
  have ownedBelow : OwnedBelow after := fun found member occurrence present link => by
    rw [hOcc] at present
    rcases members found member with old | rfl
    · exact formed.ownedBelow found old occurrence present link
    · obtain ⟨owner, inside, named, begun⟩ := ownerBegun occurrence.id link
      have same : owner = occurrence := nodup_map_eq formed.distinct.occurrences inside present named
      rw [entryParent, ← same, begun.2]
  have claimed : ReservationsClaimed after := ⟨fun item member attached reserved other inside same => by
      rw [hItems] at member inside
      rw [hOcc] at reserved
      exact formed.claimed.attached item member attached reserved other inside same,
    fun request queued => by
      obtain ⟨distinctNames, beginnable⟩ := formed.claimed.named request ((queuedEq request).mp queued)
      refine ⟨distinctNames, fun id named => ?_⟩
      obtain ⟨idBelow, facts⟩ := beginnable id named
      refine ⟨occurrenceGrows _ idBelow, fun occurrence member same => ?_⟩
      rw [hOcc] at member
      obtain ⟨unbegun, free, instance_⟩ := facts occurrence member same
      refine ⟨unbegun, by rw [hItems]; exact free, fun present => ?_⟩
      rcases (idsMem _).mp present with old | new
      · rw [instances _ old, instances _ (formed.owned.occurrenceScopes occurrence member)]
        exact instance_ old
      · have issuedScope := formed.claimed.scopesIssued request ((queuedEq request).mp queued)
        rw [new] at issuedScope
        exact absurd issuedScope enters.unissued,
    fun first second pair => by
      rw [hSignals] at pair
      exact formed.claimed.signalsApart first second pair,
    fun first second pair => by
      rw [hTokens] at pair
      exact formed.claimed.tokensApart first second pair,
    fun first second signal token => by
      rw [hSignals] at signal
      rw [hTokens] at token
      exact formed.claimed.queuesApart first second signal token,
    fun request id leave writes rule queued named => by
      rw [hSignals]
      exact formed.claimed.uncompleted request id leave writes rule ((queuedEq request).mp queued) named,
    fun request queued => enters.scopeGrows.issued (formed.claimed.scopesIssued request ((queuedEq request).mp queued)),
    fun request queued id named occurrence member => by
      rw [hOcc] at member
      exact formed.claimed.innerPlaced request ((queuedEq request).mp queued) id named occurrence member⟩
  exact ⟨issued, distinct, by simpa [StartedOnce, startsEq] using formed.startedOnce,
    ⟨by rw [enters.activations]; exact formed.activations.keys,
      by rw [enters.activations]; exact formed.activations.positive,
      by rw [enters.activations]; exact formed.activations.resolved⟩,
    fun occurrence member unbegun fact started => by
      rw [hOcc] at member
      rw [startsEq] at started
      rw [keys occurrence member]
      exact formed.reservations occurrence member unbegun fact started,
    owned, rooted, by
      unfold FailureRecorded
      rw [enters.failure, enters.status]
      exact formed.failure,
    queue, fun fact member => countedEq _ (formed.counted fact (startsEq ▸ member)),
    fun occurrence member => by
      rw [hOcc] at member
      rw [keys occurrence member]
      exact countedEq _ (formed.occurrencesCounted occurrence member),
    ownedBelow, claimed,
    formed.settled.transport enters.slots occurrenceGrows enters.scopeGrows
      (fun occurrence member _ => .inl (hOcc ▸ member))
      (fun request queued => (queuedEq request).mp queued) (fun signal member => hSignals ▸ member)
      fun found member => (members found member).imp (fun old => old) fun same => by rw [same]; exact enters.unissued,
    formed.attachedReserved.shrink (fun _ member => enters.items ▸ member) fun _ member _ => hOcc ▸ member,
    formed.typed.shrink (fun _ member => enters.items ▸ member) (fun _ member _ => hOcc ▸ member)
      fun _ member => hSignals ▸ member,
    formed.worked.shrink (fun _ member => enters.items ▸ member) (fun _ member _ => hOcc ▸ member),
    formed.roles.shrink fun _ member => hOcc ▸ member,
    formed.raises.transport (fun _ _ queued => hSignals ▸ queued) enters.scopeGrows occurrenceGrows
      fun _ member _ => hOcc ▸ member,
    formed.bodyRoles.shrink fun _ member => hOcc ▸ member,
    formed.itemRoles.shrink (fun _ member => enters.items ▸ member) fun _ member => hOcc ▸ member,
    enters.issuer formed.issuer⟩

/-- A state whose scope map is another's with one entry inserted under its own key stands on the old keys and that key. -/
theorem keys_insert {s t : State} {k : ScopeOccurrenceId} {new : ScopeOccurrence} (map : t.scopeMap = s.scopeMap.insert k new)
    (named : new.id = k) : ∀ x ∈ standingKeys t, x ∈ standingKeys s ∨ x = k := by
  intro x member
  obtain ⟨scope, inside, rfl⟩ := List.mem_map.mp member
  rw [scopes_eq, map] at inside
  rcases mem_scopeList_insert_sub inside with rfl | old
  · exact .inr named
  · exact .inl (List.mem_map.mpr ⟨scope, (scopes_eq s) ▸ old, rfl⟩)

theorem keys_insert_self {s t : State} {k : ScopeOccurrenceId} {new : ScopeOccurrence} (map : t.scopeMap = s.scopeMap.insert k new)
    (named : new.id = k) : k ∈ standingKeys t :=
  List.mem_map.mpr ⟨new, by rw [scopes_eq, map]; exact mem_scopeList.mpr ⟨k, Std.ExtTreeMap.getElem?_insert_self⟩, named⟩

/-- Entering a scope occurrence issues a scope and a position, no activation. -/
theorem entered_slots {m : Std.ExtTreeMap Issue ClaimSlot compare} {k k' issue : Issue} {scope : ScopeSlot}
    {slot : ActivationSlot} (held : ((m.insert k (.scope scope)).insert k' .position)[issue]? = some (.activation slot)) :
    m[issue]? = some (.activation slot) := by
  rcases activation_of_insert held with held | bad
  · rcases activation_of_insert held with held | bad
    · exact held
    · cases bad
  · cases bad

/-- Entering a scope occurrence under a fresh issuer grows the issue table by the issuer's next issue (DC12). -/
theorem enterScope_table {s : State} (fresh : IssuerFresh s) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (owner : Option OccurrenceId) : TableGrows s (s.enterScope element parent locals owner).1 :=
  .insert_insert (first := .scope { parent, element }) (second := .position) fresh (by simp [enterScope_eq])

/-- Entering a scope occurrence below one that stands, owned, if at all, by a begun occurrence running there, keeps a
state well-formed. -/
theorem enterScope_wellFormed {s : State} (formed : WellFormed program s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value)) {owner : Option OccurrenceId}
    (ownerBegun : ∀ id, owner = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = parent) :
    WellFormed program (s.enterScope element parent locals owner).1 := by
  have ⟨grows, entered⟩ := ScopeGrows.enter (element := element) (t := (s.enterScope element parent locals owner).1)
    stands formed.issuer.next (keys_insert (by rw [enterScope_eq]) rfl) (by simp [enterScope_eq])
    (enterScope_table formed.issuer element parent locals owner)
    (by rw [enterScope_eq]; exact getElem?_insert_insert_first _ _ _ _ _)
  have table := enterScope_table formed.issuer element parent locals owner
  rw [enterScope_eq] at grows entered table ⊢
  exact Enters.wellFormed (entry := { id := parent.child element (.fresh s.issuing s.issueNext), element := some element, position := .fresh s.issuing (s.issueNext + 1), occurrence := owner }) formed {
      unissued := entered_unissued parent element formed.issuer.next, scopeGrows := grows, entered, table,
      issuer := fun fresh => fresh.issue_issue rfl rfl rfl rfl, occurrenceOrdinals := rfl, scopeMap := rfl,
      positionTabled := fun _ _ fresh => by obtain ⟨rfl, rfl⟩ := Issue.fresh.inj fresh; simp,
      slotsFrom := fun _ _ held => entered_slots held,
      variables := rfl, occurrenceMap := rfl, itemMap := ⟨rfl, rfl⟩, tokens := rfl, signals := rfl, activations := rfl, journal := rfl, transitions := rfl, draft := rfl, status := rfl, failure := rfl,
      instanceId := rfl, slots := .same rfl }
    stands (ScopeOccurrenceId.parent?_child _ _ _) ownerBegun fun _ none => nomatch none

/-- A well-formed state has an issue history: its root's key was issued. -/
theorem WellFormed.historic {s : State} (formed : WellFormed program s) : Historic s := by
  obtain ⟨entry, member, _⟩ := List.mem_map.mp formed.rooted.1
  exact (formed.issued.scopes entry member).historic

/-- Entering below a scope occurrence that stands takes a key no history of the state held, and every history grows
into one that holds it. -/
theorem enterScope_fresh {s : State} (historic : Historic s) (fresh : IssuerFresh s) (element : ElementId)
    {parent : ScopeOccurrenceId} (stands : parent ∈ scopeIds s) (locals : List (String × Value))
    (owner : Option OccurrenceId) :
    ScopeFresh s (s.enterScope element parent locals owner).1 (s.enterScope element parent locals owner).2 := by
  have ⟨grows, entered⟩ := ScopeGrows.enter (element := element) (t := (s.enterScope element parent locals owner).1)
    stands fresh.next (keys_insert (by rw [enterScope_eq]) rfl) (by simp [enterScope_eq])
    (enterScope_table fresh element parent locals owner) (by rw [enterScope_eq]; exact getElem?_insert_insert_first _ _ _ _ _)
  rw [enterScope_eq] at grows entered ⊢
  exact ⟨entered_unissued parent element fresh.next, entered historic, grows⟩

/-- No scope occurrence holds the key of the running unit's next issue: its key was issued, and the table holds no
such issue (DC12). -/
theorem scopes_fresh {s : State} (formed : WellFormed program s) {parent : ScopeOccurrenceId} {element : ElementId} :
    ∀ entry ∈ s.scopes, entry.id ≠ parent.child element (.fresh s.issuing s.issueNext) :=
  fun entry inside same =>
    entered_unissued parent element formed.issuer.next (same ▸ formed.issued.scopes entry inside)

/-- A Call entering its called root below its own scope occurrence, which stands, takes a key no history of the state
held, and every history grows into one that holds it. -/
theorem enterCalled_fresh {s : State} (formed : WellFormed program s) (called : Program) {call : Occurrence}
    (stands : call.scope ∈ scopeIds s) (variables : List (String × Value)) (definition : DefinitionRef) :
    ScopeFresh s (s.enterCalled called call variables definition).1 (s.enterCalled called call variables definition).2 := by
  have ⟨grows, entered⟩ := ScopeGrows.enter (element := call.element)
    (t := (s.enterCalled called call variables definition).1) stands formed.issuer.next
    (keys_insert (by rw [enterCalled_eq _ _ _ _ _]) rfl)
    (by simp [enterCalled_eq _ _ _ _ _])
    (.insert_insert (first := .scope { parent := call.scope, element := call.element }) (second := .position) formed.issuer
      (by simp [enterCalled_eq _ _ _ _ _]))
    (by rw [enterCalled_eq _ _ _ _ _]; exact getElem?_insert_insert_first _ _ _ _ _)
  rw [enterCalled_eq _ _ _ _ _] at grows entered ⊢
  exact ⟨entered_unissued call.scope call.element formed.issuer.next, entered formed.historic, grows⟩

/-- A Call entering its called root below its own scope occurrence, which stands, issues no fewer occurrence keys. -/
theorem enterCalled_occurrenceGrows {s : State} (formed : WellFormed program s) (called : Program) {call : Occurrence}
    (stands : call.scope ∈ scopeIds s) (variables : List (String × Value)) (definition : DefinitionRef) :
    OccurrenceGrows s (s.enterCalled called call variables definition).1 := by
  obtain ⟨unissued, _, grows⟩ := enterCalled_fresh formed called stands variables definition
  refine .enter grows (fun x standing => ?_) (by rw [enterCalled_eq _ _ _ _ _])
    (.insert_insert (first := .scope { parent := call.scope, element := call.element }) (second := .position) formed.issuer
      (by rw [enterCalled_eq _ _ _ _ _]))
  rw [enterCalled_eq _ _ _ _ _] at standing unissued
  rcases keys_insert (s := s) (k := call.scope.child call.element (.fresh s.issuing s.issueNext)) rfl rfl x standing with old | new
  · exact .inl old
  · exact .inr (new ▸ unissued)

/-- A pending activation a counted key carries is in the issue table as an activation of the key's instance. -/
theorem Counted.tabled {s : State} {k : OccurrenceKey} (counted : Counted s k) :
    k.activation.isFresh = true → ∃ slot : ActivationSlot, s.issued[k.activation]? = some (.activation slot) ∧
      slot.processInstance = k.processInstanceId := by
  unfold Counted at counted
  split at counted
  · rename_i activation; simp [activation]
  · rename_i activation; intro _; rw [activation]; exact ⟨_, counted, rfl⟩

/-- A begun Call entering its called root below its own scope occurrence keeps a state well-formed: the root's recorded
instance names no occurrence, item or queued begin, since all were issued before it. -/
theorem enterCalled_wellFormed {s : State} (formed : WellFormed program s) (called : Program) {call : Occurrence}
    (member : call ∈ s.occurrences) (begun : call.begun = true) (variables : List (String × Value))
    (definition : DefinitionRef) : WellFormed program (s.enterCalled called call variables definition).1 := by
  have stands := formed.owned.occurrenceScopes call member
  have ⟨grows, entered⟩ := ScopeGrows.enter (element := call.element)
    (t := (s.enterCalled called call variables definition).1) stands formed.issuer.next
    (keys_insert (by rw [enterCalled_eq _ _ _ _ _]) rfl)
    (by simp [enterCalled_eq _ _ _ _ _])
    (.insert_insert (first := .scope { parent := call.scope, element := call.element }) (second := .position) formed.issuer
      (by simp [enterCalled_eq _ _ _ _ _]))
    (by rw [enterCalled_eq _ _ _ _ _]; exact getElem?_insert_insert_first _ _ _ _ _)
  rw [enterCalled_eq _ _ _ _ _] at grows entered ⊢
  exact Enters.wellFormed (entry := { id := call.scope.child call.element (.fresh s.issuing s.issueNext), element := some call.element, position := .fresh s.issuing (s.issueNext + 1), occurrence := some call.id, calledInstance := some ((s.instanceOf call.scope).calledBy (called.publicId call.element) call.activation) }) formed {
      unissued := entered_unissued call.scope call.element formed.issuer.next, scopeGrows := grows, entered,
      table := .insert_insert formed.issuer rfl, issuer := fun fresh => fresh.issue_issue rfl rfl rfl rfl,
      positionTabled := fun _ _ fresh => by obtain ⟨rfl, rfl⟩ := Issue.fresh.inj fresh; simp,
      slotsFrom := fun _ _ held => entered_slots held, occurrenceOrdinals := rfl,
      scopeMap := rfl,
      variables := rfl, occurrenceMap := rfl, itemMap := ⟨rfl, rfl⟩, tokens := rfl, signals := rfl, activations := rfl, journal := rfl, transitions := rfl, draft := rfl, status := rfl, failure := rfl,
      instanceId := rfl, slots := ⟨fun _ inside => inside, fun _ inside => inside, fun _ inside => inside⟩ } stands
    (ScopeOccurrenceId.parent?_child _ _ _) (fun id named => ⟨call, member, Option.some.inj named, begun, rfl⟩)
    fun name same => by
      obtain rfl := Option.some.inj same
      exact (calledBy_tabled (instanceOf_tabled formed.issued call.scope)
        (formed.occurrencesCounted call member).tabled).grow (.insert_insert formed.issuer rfl)

/-- A begun Call that enters its Activity's locals and then its called root, both below its own scope occurrence for its
own element, gives them distinct keys: the two draw on the one counter of that parent and element, so the root's key
was never issued while the locals' stands. The state stays well-formed, its standing keys apart (`Unique.scopes`). -/
theorem localsCalled_apart {s : State} (formed : WellFormed program s) (called : Program) {call : Occurrence}
    (member : call ∈ s.occurrences) (begun : call.begun = true) (locals variables : List (String × Value))
    (definition : DefinitionRef) :
    ((s.enterScope call.element call.scope locals (some call.id)).1.enterCalled called call variables definition).2 ≠
        (s.enterScope call.element call.scope locals (some call.id)).2 ∧
      WellFormed program
        ((s.enterScope call.element call.scope locals (some call.id)).1.enterCalled called call variables definition).1 := by
  have first := enterScope_wellFormed formed call.element (formed.owned.occurrenceScopes call member) locals
    (owner := some call.id) fun id named => ⟨call, member, Option.some.inj named, begun, rfl⟩
  have kept : call ∈ (s.enterScope call.element call.scope locals (some call.id)).1.occurrences := by
    rw [enterScope_eq]; exact member
  refine ⟨fun same => ?_, enterCalled_wellFormed first called kept begun variables definition⟩
  apply (enterCalled_fresh first called (first.owned.occurrenceScopes call kept) variables definition).1
  rw [same]
  exact first.historic.issued_key (by rw [enterScope_eq]; exact keys_insert_self rfl rfl)

/-- Entering a scope occurrence below one that stands issues no fewer occurrence keys: the scope occurrence key it takes
was never issued, and the occurrence counters stay. -/
theorem enterScope_occurrenceGrows {s : State} (historic : Historic s) (fresh : IssuerFresh s) (element : ElementId)
    {parent : ScopeOccurrenceId} (stands : parent ∈ scopeIds s) (locals : List (String × Value))
    (owner : Option OccurrenceId) : OccurrenceGrows s (s.enterScope element parent locals owner).1 := by
  obtain ⟨unissued, _, grows⟩ := enterScope_fresh historic fresh element stands locals owner
  refine .enter grows (fun x standing => ?_) (by rw [enterScope_eq])
    (.insert_insert (first := .scope { parent, element }) (second := .position) fresh (by rw [enterScope_eq]))
  rw [enterScope_eq] at standing unissued
  rcases keys_insert (s := s) (k := parent.child element (.fresh s.issuing s.issueNext)) rfl rfl x standing with old | new
  · exact .inl old
  · exact .inr (new ▸ unissued)

/-! ## Bare begins -/

/-- What has settled stays settled through a change that issues nothing back, keeps the occurrences and queues only
begins naming no reservation. -/
theorem Settled.bare {s t : State} {id : OccurrenceId} (settled : Settled s id) (issued : OccurrenceGrows s t)
    (occurrences : t.occurrences = s.occurrences)
    (queued : ∀ request, Queued t request → Queued s request ∨ names request = []) : Settled t id := by
  obtain ⟨below, begun, unnamed⟩ := settled
  refine ⟨issued _ below, occurrences ▸ begun, fun request named inside => ?_⟩
  rcases queued request named with old | bare
  · exact unnamed request old inside
  · rw [bare] at inside
    simp at inside

/-- A bare begin, queued, keeps what has settled. -/
theorem Settled.begin {s : State} {id : OccurrenceId} (settled : Settled s id) {request : BeginRequest}
    (bare : names request = []) : Settled (s.signal (.begin request)) id := by
  rw [signal_eq]
  refine settled.bare (.refl _) rfl fun other named => ?_
  rcases named with signal | token
  · rcases List.mem_append.mp (allSignals_append s _ ▸ signal) with old | new
    · exact .inl (.inl old)
    · rw [Signal.begin.inj (List.mem_singleton.mp new)]
      exact .inr bare
  · exact .inl (.inr token)

/-- Bare begins, deferred, keep what has settled. -/
theorem Settled.defer {s : State} {id : OccurrenceId} (settled : Settled s id) {requests : List BeginRequest}
    (bare : ∀ request ∈ requests, names request = []) : Settled (s.deferBegins requests) id := by
  rw [deferBegins_eq]
  refine settled.bare (.refl _) rfl fun other named => ?_
  rcases named with signal | token
  · exact .inl (.inl signal)
  · rcases List.mem_append.mp (allQueuedTokens_append s _ ▸ token) with old | new
    · exact .inl (.inr old)
    · exact .inr (bare other (by simpa using new))

/-- Entering a scope occurrence below one that stands keeps what has settled: it issues no occurrence key, takes a scope
occurrence key never issued, and queues nothing. -/
theorem Settled.enter {s : State} {id : OccurrenceId} (settled : Settled s id) (historic : Historic s)
    (fresh : IssuerFresh s) (element : ElementId) {parent : ScopeOccurrenceId} (stands : parent ∈ scopeIds s)
    (locals : List (String × Value)) (owner : Option OccurrenceId) : Settled (s.enterScope element parent locals owner).1 id := by
  have issued := enterScope_occurrenceGrows historic fresh element stands locals owner
  rw [enterScope_eq] at issued ⊢
  exact settled.transport issued (fun _ member _ => .inl member) fun _ queued => queued

/-- The slots stay settled through such a change that keeps them and the scope occurrences and queues no
compensation. -/
theorem SlotsSettled.bare {s t : State} (settled : SlotsSettled s) (slots : t.slots = s.slots)
    (scopes : t.scopes = s.scopes) (ordinals : t.scopeOrdinals = s.scopeOrdinals) (table : TableGrows s t)
    (issued : OccurrenceGrows s t)
    (occurrences : t.occurrences = s.occurrences)
    (queued : ∀ request, Queued t request → Queued s request ∨ names request = [])
    (compensations : ∀ scope activity trigger leave resume,
      Signal.compensate scope activity trigger leave resume ∈ allSignals t →
        Signal.compensate scope activity trigger leave resume ∈ allSignals s)
    (raises : ∀ raised origin, Signal.raise raised origin ∈ allSignals t → Signal.raise raised origin ∈ allSignals s) :
    SlotsSettled t where
  parked waiting member := (settled.parked waiting (slots ▸ member)).bare issued occurrences queued
  bodies run member := (settled.bodies run (slots ▸ member)).bare issued occurrences queued
  resumed run member occurrence leave resume :=
    (settled.resumed run (slots ▸ member) occurrence leave resume).bare issued occurrences queued
  queued scope activity trigger leave occurrence resume member :=
    (settled.queued scope activity trigger leave occurrence resume
      (compensations scope activity trigger leave _ member)).bare issued occurrences queued
  placed run member := (settled.placed run (slots ▸ member)).transport
    (.of_same (congrArg (List.map ScopeOccurrence.id) scopes) ordinals table) fun _ inside => .inl (scopes ▸ inside)
  runsPlaced run member := (settled.runsPlaced run (slots ▸ member)).transport
    (.of_same (congrArg (List.map ScopeOccurrence.id) scopes) ordinals table) fun _ inside => .inl (scopes ▸ inside)
  grouped scope activity trigger leave context member :=
    settled.grouped scope activity trigger leave context (compensations scope activity trigger leave _ member)
  raised raised origin host member named :=
    (settled.raised raised origin host (raises raised origin member) named).bare issued occurrences queued

/-- Queuing a bare begin in a scope occurrence that stands keeps the claims single. That the begin is no completion,
`Kernel.Proofs.Step` tells. -/
theorem signal_claimed_begin {s : State} {request : BeginRequest} (formed : WellFormed program s) (bare : names request = [])
    (stands : request.scope ∈ scopeIds s)
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
  have named : ∀ other, Queued { s with batchSignals := s.batchSignals ++ [.begin request] } other → ∀ id ∈ names other,
      Queued s other := fun other queuedOther id inside => (queued other queuedOther).resolve_right fun same => by
    rw [same, bare] at inside
    simp at inside
  refine ⟨(fun item member attached reserved other inside same => formed.claimed.attached item
      (items_same member rfl) attached reserved other (items_same inside rfl) same), fun other queuedOther => ?_, fun first second pair id inside => ?_,
    formed.claimed.tokensApart, fun first second signal token id inside => ?_,
    fun other id leave writes rule queuedOther inside completed => ?_, fun other queuedOther => ?_,
    fun other queuedOther id inside => ?_⟩
  · rcases queued other queuedOther with old | rfl
    · exact (formed.claimed.named other old).imp id fun beginnable id inside =>
        (beginnable id inside).congr (.refl _) rfl (Laws.State.items_congr rfl) rfl fun _ => by apply instanceOf_congr <;> rfl
    · rw [bare]
      exact ⟨List.nodup_nil, fun _ inside => by simp at inside⟩
  · by_cases same : second = request
    · rw [same, bare]
      exact List.not_mem_nil
    · exact formed.claimed.signalsApart first second (pair_of_append (allSignals_append s _ ▸ pair) fun equal => same (Signal.begin.inj equal))
        id inside
  · rcases List.mem_append.mp (allSignals_append s _ ▸ signal) with old | new
    · exact formed.claimed.queuesApart first second old token id inside
    · rw [Signal.begin.inj (List.mem_singleton.mp new), bare] at inside
      simp at inside
  · rcases List.mem_append.mp (allSignals_append s _ ▸ completed) with old | new
    · exact formed.claimed.uncompleted other id leave writes rule (named other queuedOther id inside) inside old
    · exact notComplete id leave writes rule (List.mem_singleton.mp new).symm
  · rcases queued other queuedOther with old | rfl
    · exact formed.claimed.scopesIssued other old
    · obtain ⟨entry, member, named⟩ := List.mem_map.mp stands
      exact named ▸ formed.issued.scopes entry member
  · rcases queued other queuedOther with old | rfl
    · exact formed.claimed.innerPlaced other old id inside
    · have named : id ∈ names other := List.mem_append_right _ inside
      simp [bare] at named

/-- Queuing a bare begin keeps the slots settled: it claims nothing. That the begin is no compensation,
`Kernel.Proofs.Step` tells. -/
theorem signal_settled_begin {s : State} {request : BeginRequest} (formed : WellFormed program s) (bare : names request = [])
    (notCompensate : ∀ scope activity trigger leave resume,
      Signal.begin request ≠ .compensate scope activity trigger leave resume)
    (notRaise : ∀ raised origin, Signal.begin request ≠ .raise raised origin) :
    SlotsSettled (s.signal (.begin request)) := by
  rw [signal_eq]
  refine formed.settled.bare rfl rfl rfl (.refl _) (.refl _) rfl (fun other named => ?_)
    (fun scope activity trigger leave resume member => ?_) fun raised origin member => ?_
  · rcases named with signal | token
    · rcases List.mem_append.mp (allSignals_append s _ ▸ signal) with old | new
      · exact .inl (.inl old)
      · rw [Signal.begin.inj (List.mem_singleton.mp new)]
        exact .inr bare
    · exact .inl (.inr token)
  · rcases List.mem_append.mp (allSignals_append s _ ▸ member) with old | new
    · exact old
    · exact absurd (List.mem_singleton.mp new).symm (notCompensate scope activity trigger leave resume)
  · rcases List.mem_append.mp (allSignals_append s _ ▸ member) with old | new
    · exact old
    · exact absurd (List.mem_singleton.mp new).symm (notRaise raised origin)

/-- Deferring bare begins, each in a scope occurrence that stands, keeps a state well-formed. -/
theorem deferBegins_wellFormed {s : State} (formed : WellFormed program s) {requests : List BeginRequest}
    (bare : ∀ request ∈ requests, names request = [] ∧ request.scope ∈ scopeIds s) :
    WellFormed program (s.deferBegins requests) := by
  rw [deferBegins_eq]
  have fresh : ∀ request, Token.begin request ∈ (requests.map Token.begin).reverse → request ∈ requests :=
    fun request member => by simpa using member
  have housed : ∀ token ∈ (requests.map Token.begin).reverse, token.busyScope ∈ scopeIds s := fun token member => by
    obtain ⟨request, inside, rfl⟩ := List.mem_map.mp (List.mem_reverse.mp member)
    rw [busyScope_begin]
    exact (bare request inside).2
  generalize (requests.map Token.begin).reverse = added at fresh housed
  have queued : ∀ request, Queued { s with batchTokens := s.batchTokens ++ added } request →
      Queued s request ∨ request ∈ requests := fun request named => by
    rcases named with signal | token
    · exact .inl (.inl signal)
    · rcases List.mem_append.mp (allQueuedTokens_append s _ ▸ token) with old | new
      · exact .inl (.inr old)
      · exact .inr (fresh request new)
  have nameless : ∀ request ∈ requests, ∀ id, id ∉ names request := fun request inside id named => by
    rw [(bare request inside).1] at named
    simp at named
  have keys : key { s with batchTokens := s.batchTokens ++ added } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  have claimed : ReservationsClaimed { s with batchTokens := s.batchTokens ++ added } := ⟨(fun item member attached reserved other inside same => formed.claimed.attached item
      (items_same member rfl) attached reserved other (items_same inside rfl) same),
    fun request named => by
      rcases queued request named with old | new
      · exact (formed.claimed.named request old).imp id fun beginnable id inside =>
          (beginnable id inside).congr (.refl _) rfl (Laws.State.items_congr rfl) rfl fun _ => by apply instanceOf_congr <;> rfl
      · rw [(bare request new).1]
        exact ⟨List.nodup_nil, fun _ inside => by simp at inside⟩,
    formed.claimed.signalsApart,
    fun first second pair id inside => by
      by_cases late : second ∈ requests
      · exact nameless second late id
      · have early : first ∉ requests := fun named => nameless first named id inside
        exact formed.claimed.tokensApart first second (pair_of_append_absent (allQueuedTokens_append s _ ▸ pair) (fun member => early (fresh _ member))
          fun member => late (fresh _ member)) id inside,
    fun first second signal token id inside => by
      rcases List.mem_append.mp (allQueuedTokens_append s _ ▸ token) with old | new
      · exact formed.claimed.queuesApart first second signal old id inside
      · exact nameless second (fresh second new) id,
    fun request id leave writes rule named inside => by
      rcases queued request named with old | new
      · exact formed.claimed.uncompleted request id leave writes rule old inside
      · exact absurd inside (nameless request new id),
    fun request named => by
      rcases queued request named with old | new
      · exact formed.claimed.scopesIssued request old
      · obtain ⟨entry, member, same⟩ := List.mem_map.mp (bare request new).2
        exact same ▸ formed.issued.scopes entry member,
    fun request named id inside => by
      rcases queued request named with old | new
      · exact formed.claimed.innerPlaced request old id inside
      · exact absurd (List.mem_append_right _ inside) (nameless request new id)⟩
  exact {
  issued := ⟨formed.issued.occurrences, (fun item member => formed.issued.items item (items_same member rfl)), formed.issued.scopes,
    formed.issued.positions, formed.issued.occurrencePositions,
    formed.issued.namesKept (fun _ member => member) (.of_eq rfl), formed.issued.slotsKept rfl⟩
  distinct := ⟨formed.distinct.occurrencesKeyed, formed.distinct.items, formed.distinct.scopesKeyed, keys ▸ formed.distinct.keys⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive, formed.activations.resolved⟩
  reservations := by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, (fun item member => formed.owned.itemScopes item (items_same member rfl)), (fun item member => formed.owned.itemOccurrences item (items_same member rfl)),
    (fun item member => formed.owned.attachments item (items_same member rfl)), formed.owned.scopeOwners, formed.owned.variableScopes, fun token member =>
      (List.mem_append.mp (allQueuedTokens_append s _ ▸ member)).elim (formed.owned.tokenScopes token) (housed token)⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
    Within.congr (s := s) (t := { s with batchTokens := s.batchTokens ++ added }) rfl (formed.rooted.2.2 scope member)⟩
  failure := formed.failure
  queue := ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends, formed.queue.completes⟩
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := claimed
  settled := formed.settled.bare rfl rfl rfl (.refl _) (.refl _) rfl (fun request named =>
    (queued request named).imp id fun new => (bare request new).1) (fun _ _ _ _ _ member => member)
    fun _ _ member => member
  attachedReserved := (fun item member => formed.attachedReserved item (items_same member rfl))
  typed := (fun item member started => (formed.typed item (items_same member rfl) started).imp id fun rest =>
      ⟨fun other inside => rest.1 other (items_same inside rfl), rest.2⟩)
  worked := (fun item member => formed.worked item (items_same member rfl))
  roles := formed.roles
  bodyRoles := formed.bodyRoles
  itemRoles := (fun item member => formed.itemRoles item (items_same member rfl))
  raises := formed.raises.same rfl rfl rfl rfl rfl rfl
  issuer := formed.issuer.same rfl rfl rfl rfl }
