module

public import Kernel.Laws.State.Issue

/-! # Laws of the kernel state: reserving and starting where it stands

What `WellFormed` keeps through a reservation (`Reserves`) and the start of one where it stands (`StartsReserved`),
stated over the fields alone. `Kernel.Laws.State` shows `State.reserve` and `State.startReserved` make them; this
module reads no body. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

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
    {reserved : Occurrence} (formed : WellFormed program before) (reserves : Reserves before after element scope reserved)
    (stands : scope ∈ scopeIds before) :
    WellFormed program after ∧ ∀ request, Queued after request → reserved.id ∉ names request := by
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
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled, ?attachedReserved, ?typed⟩
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
    have queue := formed.queue
    refine ⟨fun host element scope queued => ?_, fun scope queued => ?_, fun occurrence gateway scope queued => ?_,
      fun status failure queued => queue.ends status failure (reserves.signals ▸ queued), fun id leave writes rule queued => ?_⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := queue.arm host element scope (reserves.signals ▸ queued)
      refine ⟨by omega, by omega, fun found member named => ?_⟩
      rcases members found member with rfl | old
      · omega
      · exact facts found old named
    · have := queue.armScope scope (reserves.signals ▸ queued)
      omega
    · obtain ⟨occurrenceBelow, scopeBelow, facts⟩ := queue.armGateway occurrence gateway scope (reserves.signals ▸ queued)
      refine ⟨by omega, by omega, fun found member named => ?_⟩
      rcases members found member with rfl | old
      · omega
      · exact facts found old named
    · have := queue.completes id leave writes rule (reserves.signals ▸ queued)
      omega
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
        omega
      innerPlaced := fun request queued id named found member same => by
        rcases members found member with rfl | old
        · have := ((formed.claimed.named request (queuedBefore request queued)).2 id
            (List.mem_append_right _ named : id ∈ names request)).1
          omega
        · exact formed.claimed.innerPlaced request (queuedBefore request queued) id named found old same }
  case settled =>
    exact formed.settled.transport (.same reserves.slots) (by omega)
      (fun found inside _ => by
        rcases members found inside with rfl | old
        · exact .inr (by omega)
        · exact .inl old)
      queuedBefore (fun _ member => reserves.signals ▸ member) (fun _ member => .inl (reserves.scopes ▸ member))
  case attachedReserved | typed =>
    have begun : ∀ occurrence ∈ after.occurrences, occurrence.begun = true → occurrence ∈ before.occurrences :=
      fun occurrence member flag => (members occurrence member).elim (fun same => by simp [same, reserves.unbegun] at flag) fun old => old
    first
      | exact formed.attachedReserved.shrink (fun _ member => reserves.openItems ▸ member) begun
      | exact formed.typed.shrink (fun _ member => reserves.openItems ▸ member) begun fun _ member => reserves.signals ▸ member

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

/-- Starting an unbegun reservation that no queued begin names and no open item waits on keeps a state well-formed. -/
theorem StartsReserved.wellFormed {before after : State} {occurrence : Occurrence} {sourceType : String}
    (formed : WellFormed program before) (starts_ : StartsReserved before after occurrence sourceType)
    (member : occurrence ∈ before.occurrences) (unbegun : occurrence.begun = false)
    (unnamed : ∀ request, Queued before request → occurrence.id ∉ names request)
    (waitless : ∀ item ∈ before.openItems, item.occurrence ≠ occurrence.id) : WellFormed program after := by
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
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled, ?attachedReserved, ?typed⟩
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
    have queue := formed.queue
    refine ⟨fun host element scope queued => ?_, fun scope queued => ?_, fun found gateway scope queued => ?_,
      fun status failure queued => queue.ends status failure (starts_.signals ▸ queued),
      fun id leave writes rule queued => issued ▸ queue.completes id leave writes rule (starts_.signals ▸ queued)⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := queue.arm host element scope (starts_.signals ▸ queued)
      refine ⟨issued ▸ hostBelow, issued ▸ scopeBelow, fun found inside named => ?_⟩
      rcases members found inside with rfl | ⟨old, _⟩
      · simp [(facts occurrence member named).1] at unbegun
      · exact facts found old named
    · rw [issued]
      exact queue.armScope scope (starts_.signals ▸ queued)
    · obtain ⟨foundBelow, scopeBelow, facts⟩ := queue.armGateway found gateway scope (starts_.signals ▸ queued)
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
      scopesIssued := fun request queued => issued ▸ formed.claimed.scopesIssued request (queuedBefore request queued)
      innerPlaced := fun request queued id named found inside same => by
        rcases members found inside with rfl | ⟨old, _⟩
        · exact formed.claimed.innerPlaced request (queuedBefore request queued) id named occurrence member same
        · exact formed.claimed.innerPlaced request (queuedBefore request queued) id named found old same }
  case settled =>
    exact formed.settled.transport (.same starts_.slots) (Nat.le_of_eq issued.symm)
      (fun found inside unbegun => by
        rcases members found inside with rfl | ⟨old, _⟩
        · simp at unbegun
        · exact .inl old)
      queuedBefore (fun _ member => starts_.signals ▸ member) (fun _ member => .inl (starts_.scopes ▸ member))
  case attachedReserved | typed =>
    have waited : ∀ item ∈ after.openItems, ∀ found ∈ after.occurrences, found.id = item.occurrence →
        found.begun = true → found ∈ before.occurrences := fun item inside found present named _ => by
      rcases members found present with rfl | ⟨old, _⟩
      · exact absurd named.symm (waitless item (starts_.openItems ▸ inside))
      · exact old
    first
      | exact formed.attachedReserved.transport (fun _ member => starts_.openItems ▸ member) waited
      | exact formed.typed.transport (fun _ member => starts_.openItems ▸ member) waited fun _ member => starts_.signals ▸ member

end Kernel.Laws.State
