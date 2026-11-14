module

public import Kernel.Laws.State.Keeps

/-! # Laws of the kernel state: what entering a scope occurrence keeps

That `State.enterScope` keeps `WellFormed` when it enters below a scope occurrence that stands, owned, if at all, by a
begun occurrence running there, composed from `Kernel.Laws.State.enterScope_eq`; it reads no body. The new scope
occurrence takes the counter's identity, so nothing standing or queued names it, and what stood keeps its process
instance, since its parent chain is unchanged (`Laws.State.instanceOf_kept`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- A containment holds in a state that keeps every scope occurrence. -/
theorem Within.grow {s t : State} (scopes : ∀ entry ∈ s.scopes, entry ∈ t.scopes) {inner outer : ScopeOccurrenceId}
    (within : Within s inner outer) : Within t inner outer := by
  induction within with
  | refl scope => exact .refl scope
  | parent child parent outer member link _ ih => exact .parent child parent outer (scopes child member) link ih

/-- Entering a scope occurrence below one that stands, owned, if at all, by a begun occurrence running there, keeps a
state well-formed. -/
theorem enterScope_wellFormed {s : State} (formed : WellFormed s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value)) {owner : Option Nat}
    (ownerBegun : ∀ id, owner = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = parent) :
    WellFormed (s.enterScope element parent locals owner).1 := by
  rw [enterScope_eq]
  generalize entered : ({ id := ⟨s.nextIssue⟩, element := some element, parent := some parent, occurrence := owner } :
    ScopeOccurrence) = entry
  have entryId : entry.id = ⟨s.nextIssue⟩ := by rw [← entered]
  have entryParent : entry.parent = some parent := by rw [← entered]
  have entryOwner : entry.occurrence = owner := by rw [← entered]
  dsimp only
  generalize afterState : ({ s with
      nextIssue := s.nextIssue + 1
      scopes := s.scopes ++ [entry]
      variables := s.variables ++ [{ scope := ⟨s.nextIssue⟩, entries := keyed locals }] } : State) = after
  have scopes : after.scopes = s.scopes ++ [entry] := by rw [← afterState]
  have members : ∀ found ∈ after.scopes, found ∈ s.scopes ∨ found = entry := fun found inside => by
    simpa [scopes] using inside
  have grows : ∀ found ∈ s.scopes, found ∈ after.scopes := fun found inside => by
    rw [scopes]
    exact List.mem_append_left _ inside
  have fresh : ∀ found ∈ s.scopes, found.id ≠ entry.id := fun found inside same => by
    have := formed.issued.scopes found inside
    rw [same, entryId] at this
    exact Nat.lt_irrefl _ this
  have ids : scopeIds after = scopeIds s ++ [entry.id] := by simp [scopeIds, scopes]
  have nodup : (scopeIds after).Nodup := by
    rw [ids, List.nodup_append]
    exact ⟨formed.distinct.scopes, by simp, fun a old b new same => by
      obtain ⟨found, inside, rfl⟩ := List.mem_map.mp old
      simp at new
      exact fresh found inside (same.trans new)⟩
  have rootBelow : State.root.value < s.nextIssue := by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp formed.rooted.1
    exact named ▸ formed.issued.scopes found inside
  have notRoot : entry.id ≠ State.root := fun same => by
    have := congrArg ScopeOccurrenceId.value same
    rw [entryId] at this
    dsimp only at this
    omega
  have below : ∀ x ∈ scopeIds s, x.value < s.nextIssue := fun x member => by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp member
    exact named ▸ formed.issued.scopes found inside
  have idsGrow : ∀ x ∈ scopeIds s, x ∈ scopeIds after := fun x member => by
    rw [ids]
    exact List.mem_append_left _ member
  have hNext : after.nextIssue = s.nextIssue + 1 := by rw [← afterState]
  have hOcc : after.occurrences = s.occurrences := by rw [← afterState]
  have hItems : after.openItems = s.openItems := by rw [← afterState]
  have hTokens : after.tokens = s.tokens := by rw [← afterState]
  have hSignals : after.signals = s.signals := by rw [← afterState]
  have hVars : after.variables = s.variables ++ [{ scope := ⟨s.nextIssue⟩, entries := keyed locals }] := by
    rw [← afterState]
  have hSlots : after.slots = s.slots := by rw [← afterState]
  have startsEq : starts after = starts s := by rw [← afterState]; rfl
  have countedEq : ∀ k, Counted after k ↔ Counted s k := by rw [← afterState]; exact fun _ => Iff.rfl
  have queuedEq : ∀ request, Queued after request ↔ Queued s request := by simp [Queued, hSignals, hTokens]
  have parentless : ∀ found ∈ after.scopes, found.parent = none → found.id = State.root := fun found inside orphan => by
    rcases members found inside with old | rfl
    · exact (formed.rooted.2.1 found old).mp orphan
    · simp [entryParent] at orphan
  have instances : ∀ x ∈ scopeIds s, after.instanceOf x = s.instanceOf x := fun x present =>
    instanceOf_kept formed nodup parentless (by rw [← afterState]) present fun found inside _ => grows found inside
  have keys : ∀ occurrence ∈ s.occurrences, key after occurrence = key s occurrence := fun occurrence member =>
    key_congr (instances _ (formed.owned.occurrenceScopes occurrence member))
  have parentWithin : Within s parent State.root := by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp stands
    exact named ▸ formed.rooted.2.2 found inside
  have issued : IssuedBelow after := ⟨fun occurrence member => by
      rw [hNext]
      rw [hOcc] at member
      exact Nat.lt_succ_of_lt (formed.issued.occurrences occurrence member),
    fun item member => by
      rw [hNext]
      rw [hItems] at member
      exact Nat.lt_succ_of_lt (formed.issued.items item member),
    fun found member => by
      rw [hNext]
      rcases members found member with old | rfl
      · exact Nat.lt_succ_of_lt (formed.issued.scopes found old)
      · rw [entryId]
        exact Nat.lt_succ_self _⟩
  have distinct : Distinct after := ⟨by simpa [occurrenceIds, hOcc] using formed.distinct.occurrences,
    by simpa [hItems] using formed.distinct.items, nodup, by
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
      · rw [entryOwner] at link
        obtain ⟨occurrence, inside, named, begun⟩ := ownerBegun id link
        exact ⟨occurrence, inside, named, begun.1⟩,
    fun variables member => by
      rw [hVars] at member
      rcases List.mem_append.mp member with old | new
      · exact idsGrow _ (formed.owned.variableScopes variables old)
      · rw [List.mem_singleton.mp new, ids]
        simp [entryId],
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
      · exact .parent _ parent _ (by rw [scopes]; exact List.mem_append_right _ (List.mem_singleton_self _)) entryParent
          (parentWithin.grow grows)⟩
  have variables : VariablesKeyed after := ⟨by
      rw [hVars, List.map_append, List.nodup_append]
      refine ⟨formed.variables.scopes, by simp, fun a old b new same => ?_⟩
      obtain ⟨found, inside, rfl⟩ := List.mem_map.mp old
      have := below _ (formed.owned.variableScopes found inside)
      simp at new
      rw [same, new] at this
      exact Nat.lt_irrefl _ this,
    fun found member => by
      rw [hVars] at member
      rcases List.mem_append.mp member with old | new
      · exact formed.variables.names found old
      · rw [List.mem_singleton.mp new]
        exact keyed_names locals⟩
  have queue : QueueSound after := ⟨fun host element scope member => by
      rw [hSignals] at member
      obtain ⟨hostBelow, scopeBelow, placed⟩ := formed.queue.arm host element scope member
      rw [hNext, hOcc]
      exact ⟨Nat.lt_succ_of_lt hostBelow, Nat.lt_succ_of_lt scopeBelow, placed⟩,
    fun scope member => by
      rw [hSignals] at member
      rw [hNext]
      exact Nat.lt_succ_of_lt (formed.queue.armScope scope member),
    fun occurrence gateway scope member => by
      rw [hSignals] at member
      obtain ⟨hostBelow, scopeBelow, placed⟩ := formed.queue.armGateway occurrence gateway scope member
      rw [hNext, hOcc]
      exact ⟨Nat.lt_succ_of_lt hostBelow, Nat.lt_succ_of_lt scopeBelow, placed⟩,
    fun status failure member => by
      rw [hSignals] at member
      exact formed.queue.ends status failure member⟩
  have ownedBelow : OwnedBelow after := fun found member occurrence present link => by
    rw [hOcc] at present
    rcases members found member with old | rfl
    · exact formed.ownedBelow found old occurrence present link
    · rw [entryOwner] at link
      obtain ⟨owner, inside, named, begun⟩ := ownerBegun occurrence.id link
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
      refine ⟨by rw [hNext]; omega, fun occurrence member same => ?_⟩
      rw [hOcc] at member
      obtain ⟨unbegun, free, instance_⟩ := facts occurrence member same
      refine ⟨unbegun, by rw [hItems]; exact free, fun present => ?_⟩
      rw [ids] at present
      rcases List.mem_append.mp present with old | new
      · rw [instances _ old, instances _ (formed.owned.occurrenceScopes occurrence member)]
        exact instance_ old
      · have issuedScope := formed.claimed.scopesIssued request ((queuedEq request).mp queued)
        rw [List.mem_singleton.mp new, entryId] at issuedScope
        exact absurd issuedScope (Nat.lt_irrefl _),
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
    fun request queued => by
      rw [hNext]
      exact Nat.lt_succ_of_lt (formed.claimed.scopesIssued request ((queuedEq request).mp queued))⟩
  exact ⟨issued, distinct, by simpa [StartedOnce, startsEq] using formed.startedOnce, by
      rw [← afterState]
      exact ⟨formed.activations.keys, formed.activations.positive⟩,
    fun occurrence member unbegun fact started => by
      rw [hOcc] at member
      rw [startsEq] at started
      rw [keys occurrence member]
      exact formed.reservations occurrence member unbegun fact started,
    owned, rooted, variables, by
      rw [← afterState]
      exact formed.failure,
    queue, fun fact member => (countedEq _).mpr (formed.counted fact (startsEq ▸ member)),
    fun occurrence member => by
      rw [hOcc] at member
      rw [keys occurrence member]
      exact (countedEq _).mpr (formed.occurrencesCounted occurrence member),
    ownedBelow, claimed,
    formed.settled.transport (SlotsWithin.same hSlots) (by rw [hNext]; omega) (fun occurrence member _ => .inl (hOcc ▸ member))
      (fun request queued => (queuedEq request).mp queued) (fun signal member => hSignals ▸ member)⟩
