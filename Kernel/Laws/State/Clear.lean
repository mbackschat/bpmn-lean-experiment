module

public import Kernel.Laws.State.Frames

/-! # Laws of the kernel state: clearing, pruning and leaving

What `WellFormed` keeps through the changes that remove entries along the scope tree, stated over the fields alone, as
`Kernel.Laws.State.Frames` states the others: the clearing of a scope occurrence (`Cleared`), which `Kernel.Laws.State`
shows `State.clearInside` makes, the pruning of occurrences and items (`Prunes`) and the leaving of a scope occurrence
(`Left`). It reads no body. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## Clearing a scope occurrence -/

/-- What `State.clearInside before scope keep` leaves of `before`, read through the scope tree: the scope occurrences
and variable sets not strictly within `scope`, the occurrences, open items and tokens not within it but those of the
kept occurrences, and everything else as it was but the draft's end and cancelled facts; what stands keeps its process
instance. P3's cancellation lane and the phases that clear (`Step.endInstance`, `State.leaveScope`) build on it. -/
structure Cleared (before after : State) (scope : ScopeOccurrenceId) (keep : List Nat) : Prop where
  scopes : ∀ entry, entry ∈ after.scopes ↔ entry ∈ before.scopes ∧ ¬ StrictlyWithin before entry.id scope
  occurrences : ∀ occurrence, occurrence ∈ after.occurrences ↔
    occurrence ∈ before.occurrences ∧ (¬ Within before occurrence.scope scope ∨ occurrence.id ∈ keep)
  items : ∀ item, item ∈ after.items ↔
    item ∈ before.items ∧ (¬ Within before item.scope scope ∨ item.id.occurrence ∈ keep)
  tokens : ∀ token, token ∈ after.tokens ↔ token ∈ before.tokens ∧ ¬ Within before token.busyScope scope
  variables : ∀ variables, variables ∈ after.variables ↔
    variables ∈ before.variables ∧ ¬ StrictlyWithin before variables.scope scope
  scopesSublist : after.scopes.Sublist before.scopes
  occurrencesSublist : after.occurrences.Sublist before.occurrences
  openItemsSub : ItemsSub after.openItems before.openItems
  ordinals : ∀ occurrence ∈ after.occurrences,
    after.itemOrdinals.getD occurrence.id 0 = before.itemOrdinals.getD occurrence.id 0
  tokensSublist : after.tokens.Sublist before.tokens
  variablesSublist : after.variables.Sublist before.variables
  instances : ∀ x ∈ scopeIds after, after.instanceOf x = before.instanceOf x
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  signals : after.signals = before.signals
  status : after.status = before.status
  failure : after.failure = before.failure
  journal : after.journal = before.journal
  started : after.draft.started = before.draft.started
  slots : SlotsWithin before after
  /-- The Multi-Instance bodies that stay are those whose scope occurrence does not lie within `scope`. -/
  bodies : after.slots.multiInstances = before.slots.multiInstances.filter (!(before.subtree scope).contains ·.scope)

/-- A scope occurrence that lies within `State.root` and not strictly within a cleared `scope` still does after the
clearing: nothing on its way up lies strictly within `scope`, or it would itself. -/
private theorem Cleared.reaches {before after : State} {scope : ScopeOccurrenceId} {keep : List Nat}
    (formed : WellFormed program before) (cleared : Cleared before after scope keep) {x : ScopeOccurrenceId}
    (within : Within before x State.root) : ¬ StrictlyWithin before x scope → Within after x State.root := by
  generalize rooted : State.root = root at within
  induction within with
  | refl => intro _; subst rooted; exact .refl _
  | parent child parent _ member link _ ih =>
    intro outside
    refine .parent child parent _ ((cleared.scopes child).mpr ⟨member, outside⟩) link (ih rooted fun ⟨inside, other⟩ => ?_)
    have childInside : Within before child.id scope := .parent child parent scope member link inside
    have same : child.id = scope := Classical.byContradiction fun distinct => outside ⟨childInside, distinct⟩
    exact parent_not_within formed member link (same ▸ inside)

/-- A cleared well-formed state is well-formed when every occurrence the clearing keeps lies in no scope occurrence
strictly within the cleared one, and every open item the clearing leaves hangs on an occurrence it leaves. -/
theorem Cleared.wellFormed {before after : State} {scope : ScopeOccurrenceId} {keep : List Nat} (formed : WellFormed program before)
    (cleared : Cleared before after scope keep) (present : scope ∈ scopeIds before)
    (kept : ∀ occurrence ∈ before.occurrences, occurrence.id ∈ keep → ¬ StrictlyWithin before occurrence.scope scope)
    (attached : ∀ item ∈ before.items, (¬ Within before item.scope scope ∨ item.id.occurrence ∈ keep) → ∀ host,
      item.attachedTo = some host → ∀ occurrence ∈ before.occurrences, occurrence.id = host →
        ¬ Within before occurrence.scope scope ∨ host ∈ keep) :
    WellFormed program after := by
  have sameStarts : starts after = starts before := by simp [starts, cleared.journal, cleared.started]
  -- A scope occurrence of `before` that is no strict descendant of `scope` stands after the clearing.
  have stays : ∀ id, id ∈ scopeIds before → ¬ StrictlyWithin before id scope → id ∈ scopeIds after := fun id member outside => by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    exact List.mem_map.mpr ⟨entry, (cleared.scopes entry).mpr ⟨inside, named ▸ outside⟩, named⟩
  have notStrict : ∀ id, ¬ Within before id scope → ¬ StrictlyWithin before id scope := fun _ outside strict =>
    outside strict.1
  -- An occurrence of `before` that the clearing leaves lies in a scope occurrence that stands.
  have occurrenceStays : ∀ occurrence ∈ before.occurrences, (¬ Within before occurrence.scope scope ∨ occurrence.id ∈ keep) →
      occurrence.scope ∈ scopeIds after := fun occurrence member left => by
    refine stays _ (formed.owned.occurrenceScopes occurrence member) ?_
    rcases left with outside | keeps
    · exact notStrict _ outside
    · exact kept occurrence member keeps
  have housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after := fun occurrence member => by
    obtain ⟨old, left⟩ := (cleared.occurrences occurrence).mp member
    exact occurrenceStays occurrence old left
  have keys : ∀ occurrence ∈ after.occurrences, key after occurrence = key before occurrence := fun occurrence member =>
    key_congr (cleared.instances _ (housed occurrence member))
  constructor
  · exact ⟨fun occurrence member => cleared.nextIssue ▸ formed.issued.occurrences occurrence
        (cleared.occurrencesSublist.subset member),
      issuedItems_transport cleared.openItemsSub (fun _ member => cleared.occurrencesSublist.subset member) cleared.ordinals formed.issued.items,
      fun entry member => cleared.nextIssue ▸ formed.issued.scopes entry (cleared.scopesSublist.subset member)⟩
  · refine ⟨formed.distinct.occurrences.sublist (cleared.occurrencesSublist.map _),
      cleared.openItemsSub.keyed formed.distinct.items,
      formed.distinct.scopes.sublist (cleared.scopesSublist.map _), ?_⟩
    rw [List.map_congr_left keys]
    exact formed.distinct.keys.sublist (cleared.occurrencesSublist.map _)
  · have once := formed.startedOnce
    unfold StartedOnce at once ⊢
    rw [sameStarts]
    exact once
  · exact ⟨cleared.activations ▸ formed.activations.keys, cleared.activations ▸ formed.activations.positive⟩
  · intro occurrence member unbegun fact started
    rw [keys occurrence member]
    exact formed.reservations occurrence (cleared.occurrencesSublist.subset member) unbegun fact
      (show fact ∈ starts before from sameStarts ▸ started)
  · constructor
    · exact housed
    · intro item member
      obtain ⟨old, left⟩ := (cleared.items item).mp member
      obtain ⟨occurrence, inside, facts⟩ := formed.owned.itemOccurrences item old
      obtain ⟨named, _, placed⟩ := facts
      rw [← placed]
      refine occurrenceStays occurrence inside ?_
      rcases left with outside | keeps
      · exact .inl (placed ▸ outside)
      · exact .inr (named ▸ keeps)
    · intro item member
      obtain ⟨old, left⟩ := (cleared.items item).mp member
      obtain ⟨occurrence, inside, facts⟩ := formed.owned.itemOccurrences item old
      obtain ⟨named, element, placed⟩ := facts
      refine ⟨occurrence, (cleared.occurrences occurrence).mpr ⟨inside, ?_⟩, named, element, placed⟩
      rcases left with outside | keeps
      · exact .inl (placed ▸ outside)
      · exact .inr (named ▸ keeps)
    · intro item member host link
      obtain ⟨old, left⟩ := (cleared.items item).mp member
      obtain ⟨occurrence, inside, named, facts⟩ := formed.owned.attachments item old host link
      exact ⟨occurrence, (cleared.occurrences occurrence).mpr
        ⟨inside, named ▸ attached item old left host link occurrence inside named⟩, named, facts⟩
    · intro entry member owner owned
      obtain ⟨old, outside⟩ := (cleared.scopes entry).mp member
      obtain ⟨occurrence, inside, named, begun⟩ := formed.owned.scopeOwners entry old owner owned
      refine ⟨occurrence, (cleared.occurrences occurrence).mpr ⟨inside, ?_⟩, named, begun⟩
      by_cases keeps : occurrence.id ∈ keep
      · exact .inr keeps
      · refine .inl fun within => ?_
        have link := formed.ownedBelow entry old occurrence inside (named ▸ owned)
        have entryInside : Within before entry.id scope := .parent entry occurrence.scope scope old link within
        have same : entry.id = scope := Classical.byContradiction fun distinct => outside ⟨entryInside, distinct⟩
        exact parent_not_within formed old link (same ▸ within)
    · intro variables member
      obtain ⟨old, outside⟩ := (cleared.variables variables).mp member
      exact stays _ (formed.owned.variableScopes variables old) outside
    · intro token member
      obtain ⟨old, outside⟩ := (cleared.tokens token).mp member
      exact stays _ (formed.owned.tokenScopes token old) (notStrict _ outside)
  · obtain ⟨rootPresent, parentless, reach⟩ := formed.rooted
    obtain ⟨scopeEntry, scopeInside, scopeNamed⟩ := List.mem_map.mp present
    refine ⟨stays _ rootPresent fun ⟨inside, distinct⟩ => distinct (Within.antisymm formed rootPresent inside
      (scopeNamed ▸ reach scopeEntry scopeInside)), fun entry member => parentless entry
      (cleared.scopesSublist.subset member), fun entry member => ?_⟩
    obtain ⟨old, outside⟩ := (cleared.scopes entry).mp member
    exact cleared.reaches formed (reach entry old) outside
  · exact ⟨formed.variables.scopes.sublist (cleared.variablesSublist.map _),
      fun variables member => formed.variables.names variables (cleared.variablesSublist.subset member)⟩
  · simpa [FailureRecorded, cleared.status, cleared.failure] using formed.failure
  · have queue := formed.queue
    refine ⟨fun host element scope queued => ?_, by simpa [cleared.signals, cleared.nextIssue] using queue.armScope,
      fun occurrence gateway scope queued => ?_, by simpa [cleared.signals] using queue.ends,
      by simpa [cleared.signals, cleared.nextIssue] using queue.completes⟩
    · obtain ⟨host_, scope_, facts⟩ := queue.arm host element scope (cleared.signals ▸ queued)
      exact ⟨cleared.nextIssue ▸ host_, cleared.nextIssue ▸ scope_,
        fun found member => facts found (cleared.occurrencesSublist.subset member)⟩
    · obtain ⟨occurrence_, scope_, facts⟩ := queue.armGateway occurrence gateway scope (cleared.signals ▸ queued)
      exact ⟨cleared.nextIssue ▸ occurrence_, cleared.nextIssue ▸ scope_,
        fun found member => facts found (cleared.occurrencesSublist.subset member)⟩
  · intro fact started
    exact (formed.counted fact (show fact ∈ starts before from sameStarts ▸ started)).congr cleared.activations
  · intro occurrence member
    rw [keys occurrence member]
    exact (formed.occurrencesCounted occurrence (cleared.occurrencesSublist.subset member)).congr cleared.activations
  · intro entry member occurrence inside owned
    exact formed.ownedBelow entry (cleared.scopesSublist.subset member) occurrence
      (cleared.occurrencesSublist.subset inside) owned
  · exact formed.claimed.shrink (fun _ member => cleared.openItemsSub.items member)
      (fun _ member => cleared.occurrencesSublist.subset member) housed
      (fun x member => by
        obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
        exact List.mem_map.mpr ⟨entry, cleared.scopesSublist.subset inside, named⟩)
      cleared.instances (Nat.le_of_eq cleared.nextIssue.symm) (by rw [cleared.signals]; exact .refl _) cleared.tokensSublist
  · exact formed.settled.transport cleared.slots (Nat.le_of_eq cleared.nextIssue.symm)
      (fun _ member _ => .inl (cleared.occurrencesSublist.subset member))
      (fun _ queued => queued.shrink (by rw [cleared.signals]; exact .refl _) cleared.tokensSublist)
      (fun _ member => cleared.signals ▸ member) (fun _ member => .inl (cleared.scopesSublist.subset member))
  · exact formed.attachedReserved.shrink (fun _ member => cleared.openItemsSub.items member)
      fun _ member _ => cleared.occurrencesSublist.subset member
  · exact formed.typed.shrink (fun _ member => cleared.openItemsSub.items member)
      (fun _ member _ => cleared.occurrencesSublist.subset member) fun _ member => cleared.signals ▸ member
  · exact formed.worked.shrink (fun _ member => cleared.openItemsSub.items member)
      fun _ member _ => cleared.occurrencesSublist.subset member
  · exact formed.roles.shrink fun _ member => cleared.occurrencesSublist.subset member
  · exact formed.raises.transport (fun _ _ queued => cleared.signals ▸ queued) (Nat.le_of_eq cleared.nextIssue.symm)
      (fun x present _ => ⟨by
        obtain ⟨entry, inside, named⟩ := List.mem_map.mp present
        exact List.mem_map.mpr ⟨entry, cleared.scopesSublist.subset inside, named⟩, cleared.instances x present⟩)
      (fun _ counted => counted.congr cleared.activations) fun _ member _ => cleared.occurrencesSublist.subset member
  · exact formed.bodyRoles.shrink fun _ member => cleared.occurrencesSublist.subset member
  · exact formed.itemRoles.shrink (fun _ member => cleared.openItemsSub.items member)
      fun _ member => cleared.occurrencesSublist.subset member

/-! ## Pruning occurrences and items -/

/-- `after` holds `before` with some occurrences and open items removed and nothing else `WellFormed` reads changed,
and every item that stays waits for and hangs on occurrences that stay, as every scope occurrence's owner stays:
`State.disarm`, and the removal of an occurrence record nothing refers to. -/
structure Prunes (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  instances : ∀ x, after.instanceOf x = before.instanceOf x
  occurrences : after.occurrences.Sublist before.occurrences
  items : ItemsSub after.openItems before.openItems
  ordinals : ∀ occurrence ∈ after.occurrences,
    after.itemOrdinals.getD occurrence.id 0 = before.itemOrdinals.getD occurrence.id 0
  tokens : after.tokens = before.tokens
  signals : after.signals = before.signals
  variables : after.variables = before.variables
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  journal : after.journal = before.journal
  started : after.draft.started = before.draft.started
  status : after.status = before.status
  failure : after.failure = before.failure
  slots : after.slots = before.slots
  waited : ∀ item ∈ after.items, ∀ occurrence ∈ before.occurrences,
    (occurrence.id = item.id.occurrence ∨ item.attachedTo = some occurrence.id) → occurrence ∈ after.occurrences
  owners : ∀ entry ∈ after.scopes, ∀ occurrence ∈ before.occurrences, entry.occurrence = some occurrence.id →
    occurrence ∈ after.occurrences

theorem Prunes.wellFormed {before after : State} (formed : WellFormed program before) (prunes : Prunes before after) :
    WellFormed program after := by
  have keys : ∀ occurrence, key after occurrence = key before occurrence := fun _ => key_congr (prunes.instances _)
  have sameStarts : starts after = starts before := by simp [starts, prunes.journal, prunes.started]
  have kept := prunes.occurrences.subset
  have items : after.items ⊆ before.items := by rw [items_eq, items_eq]; exact prunes.items.subset
  have housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after := fun occurrence member => by
    simpa [scopeIds, prunes.scopes] using formed.owned.occurrenceScopes occurrence (kept member)
  refine ⟨?issued, ?distinct, ?startedOnce, ?activations, ?reservations, ?owned, ?rooted, ?variables,
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled, ?attachedReserved, ?typed,
    ?worked, ?roles, ?raises, ?bodyRoles, ?itemRoles⟩
  case issued =>
    exact ⟨fun occurrence member => prunes.nextIssue ▸ formed.issued.occurrences occurrence (kept member),
      issuedItems_transport prunes.items (fun _ member => prunes.occurrences.subset member) prunes.ordinals formed.issued.items,
      by simpa [prunes.scopes, prunes.nextIssue] using formed.issued.scopes⟩
  case distinct =>
    refine ⟨formed.distinct.occurrences.sublist (prunes.occurrences.map _),
      prunes.items.keyed formed.distinct.items, by simpa [scopeIds, prunes.scopes] using formed.distinct.scopes,
      ?_⟩
    rw [funext keys]
    exact formed.distinct.keys.sublist (prunes.occurrences.map _)
  case startedOnce => simpa [StartedOnce, sameStarts] using formed.startedOnce
  case activations => exact ⟨prunes.activations ▸ formed.activations.keys, prunes.activations ▸ formed.activations.positive⟩
  case reservations =>
    intro occurrence member unbegun fact started
    rw [keys]
    exact formed.reservations occurrence (kept member) unbegun fact (sameStarts ▸ started)
  case owned =>
    refine ⟨housed, fun item member => ?_, fun item member => ?_, fun item member host attached => ?_,
      fun entry member owner owned => ?_, ?_, ?_⟩
    · simpa [scopeIds, prunes.scopes] using formed.owned.itemScopes item (items member)
    · obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.itemOccurrences item (items member)
      exact ⟨occurrence, prunes.waited item member occurrence inside (.inl named), named, rest⟩
    · obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.attachments item (items member) host attached
      exact ⟨occurrence, prunes.waited item member occurrence inside (.inr (named ▸ attached)), named, rest⟩
    · obtain ⟨occurrence, inside, named, begunFlag⟩ :=
        formed.owned.scopeOwners entry (prunes.scopes ▸ member) owner owned
      exact ⟨occurrence, prunes.owners entry member occurrence inside (named ▸ owned), named, begunFlag⟩
    · simpa [scopeIds, prunes.variables, prunes.scopes] using formed.owned.variableScopes
    · simpa [scopeIds, prunes.tokens, prunes.scopes] using formed.owned.tokenScopes
  case rooted =>
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, prunes.scopes] using present, by simpa [prunes.scopes] using parentless, ?_⟩
    intro x member
    exact Within.congr prunes.scopes (reach x (prunes.scopes ▸ member))
  case variables =>
    exact ⟨by simpa [prunes.variables] using formed.variables.scopes,
      by simpa [prunes.variables] using formed.variables.names⟩
  case failure => simpa [FailureRecorded, prunes.failure, prunes.status] using formed.failure
  case queue =>
    have queue := formed.queue
    refine ⟨fun host element scope queued => ?_, by simpa [prunes.signals, prunes.nextIssue] using queue.armScope,
      fun occurrence gateway scope queued => ?_, by simpa [prunes.signals] using queue.ends,
      by simpa [prunes.signals, prunes.nextIssue] using queue.completes⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := queue.arm host element scope (prunes.signals ▸ queued)
      exact ⟨prunes.nextIssue ▸ hostBelow, prunes.nextIssue ▸ scopeBelow, fun found member => facts found (kept member)⟩
    · obtain ⟨below, scopeBelow, facts⟩ := queue.armGateway occurrence gateway scope (prunes.signals ▸ queued)
      exact ⟨prunes.nextIssue ▸ below, prunes.nextIssue ▸ scopeBelow, fun found member => facts found (kept member)⟩
  case counted =>
    exact fun fact started => (formed.counted fact (sameStarts ▸ started)).congr prunes.activations
  case occurrencesCounted =>
    intro occurrence member
    rw [keys]
    exact (formed.occurrencesCounted occurrence (kept member)).congr prunes.activations
  case ownedBelow =>
    exact fun entry member occurrence inside owned =>
      formed.ownedBelow entry (prunes.scopes ▸ member) occurrence (kept inside) owned
  case claimed =>
    exact formed.claimed.shrink (fun _ member => items member) (fun _ member => kept member) housed
      (by simp [scopeIds, prunes.scopes]) (fun x _ => prunes.instances x) (Nat.le_of_eq prunes.nextIssue.symm)
      (by rw [prunes.signals]; exact .refl _) (by rw [prunes.tokens]; exact .refl _)
  case settled =>
    exact formed.settled.transport (.same prunes.slots) (Nat.le_of_eq prunes.nextIssue.symm)
      (fun _ member _ => .inl (kept member))
      (fun _ queued => queued.shrink (by rw [prunes.signals]; exact .refl _) (by rw [prunes.tokens]; exact .refl _))
      (fun _ member => prunes.signals ▸ member) (fun _ member => .inl (prunes.scopes ▸ member))
  case attachedReserved => exact formed.attachedReserved.shrink (fun _ member => items member) fun _ member _ => kept member
  case typed =>
    exact formed.typed.shrink (fun _ member => items member) (fun _ member _ => kept member) fun _ member => prunes.signals ▸ member
  case worked => exact formed.worked.shrink (fun _ member => items member) fun _ member _ => kept member
  case roles => exact formed.roles.shrink fun _ member => kept member
  case bodyRoles => exact formed.bodyRoles.shrink fun _ member => kept member
  case itemRoles => exact formed.itemRoles.shrink (fun _ member => items member) fun _ member => kept member
  case raises =>
    exact formed.raises.transport (fun _ _ queued => prunes.signals ▸ queued) (Nat.le_of_eq prunes.nextIssue.symm)
      (fun x present _ => ⟨by simpa [scopeIds, prunes.scopes] using present, prunes.instances x⟩)
      (fun _ counted => counted.congr prunes.activations) fun _ member _ => kept member

/-- `s` without the occurrence record `id`: what `State.removeOccurrence` removes first. -/
def withoutRecord (s : State) (id : Nat) : State :=
  { s with occurrences := s.occurrences.filter (·.id != id), itemOrdinals := s.itemOrdinals.erase id }

/-! ## Leaving a scope occurrence -/

/-- What `State.leaveScope before scope` leaves of `before`, read through the scope tree: what does not lie within
`scope`, which goes with everything inside it, and everything else as it was but the draft's end and cancelled facts;
what stands keeps its process instance. `State.removeOccurrence` leaves the scope occurrences the removed occurrence
owns. -/
structure Left (before after : State) (scope : ScopeOccurrenceId) : Prop where
  scopes : ∀ entry, entry ∈ after.scopes ↔ entry ∈ before.scopes ∧ ¬ Within before entry.id scope
  occurrences : ∀ occurrence, occurrence ∈ after.occurrences ↔
    occurrence ∈ before.occurrences ∧ ¬ Within before occurrence.scope scope
  items : ∀ item, item ∈ after.items ↔ item ∈ before.items ∧ ¬ Within before item.scope scope
  tokens : ∀ token, token ∈ after.tokens ↔ token ∈ before.tokens ∧ ¬ Within before token.busyScope scope
  variables : ∀ variables, variables ∈ after.variables ↔
    variables ∈ before.variables ∧ ¬ Within before variables.scope scope
  scopesSublist : after.scopes.Sublist before.scopes
  occurrencesSublist : after.occurrences.Sublist before.occurrences
  openItemsSub : ItemsSub after.openItems before.openItems
  ordinals : ∀ occurrence ∈ after.occurrences,
    after.itemOrdinals.getD occurrence.id 0 = before.itemOrdinals.getD occurrence.id 0
  tokensSublist : after.tokens.Sublist before.tokens
  variablesSublist : after.variables.Sublist before.variables
  instances : ∀ x ∈ scopeIds after, after.instanceOf x = before.instanceOf x
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  signals : after.signals = before.signals
  status : after.status = before.status
  failure : after.failure = before.failure
  journal : after.journal = before.journal
  started : after.draft.started = before.draft.started
  slots : SlotsWithin before after

/-- A scope occurrence that lies within `State.root` and not within a left `scope` still does after leaving it:
nothing on its way up lies within `scope`, or it would itself. -/
private theorem Left.reaches {before after : State} {scope : ScopeOccurrenceId} (left : Left before after scope)
    {x : ScopeOccurrenceId} (within : Within before x State.root) : ¬ Within before x scope → Within after x State.root := by
  generalize rooted : State.root = root at within
  induction within with
  | refl => intro _; subst rooted; exact .refl _
  | parent child parent _ member link _ ih =>
    intro outside
    exact .parent child parent _ ((left.scopes child).mpr ⟨member, outside⟩) link
      (ih rooted fun inside => outside (.parent child parent scope member link inside))

/-- Leaving a present scope occurrence other than the root keeps a state well-formed: whatever stands outside it waits
for, hangs on and is owned by occurrences outside it, since an item hangs on an occurrence of its own scope occurrence
and a scope occurrence lies directly below its owner's. -/
theorem Left.wellFormed {before after : State} {scope : ScopeOccurrenceId} (formed : WellFormed program before)
    (left : Left before after scope) (present : scope ∈ scopeIds before) (notRoot : scope ≠ State.root) :
    WellFormed program after := by
  have sameStarts : starts after = starts before := by simp [starts, left.journal, left.started]
  have stays : ∀ id, id ∈ scopeIds before → ¬ Within before id scope → id ∈ scopeIds after := fun id member outside => by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    exact List.mem_map.mpr ⟨entry, (left.scopes entry).mpr ⟨inside, named ▸ outside⟩, named⟩
  have housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after := fun occurrence member => by
    obtain ⟨old, outside⟩ := (left.occurrences occurrence).mp member
    exact stays _ (formed.owned.occurrenceScopes occurrence old) outside
  have keys : ∀ occurrence ∈ after.occurrences, key after occurrence = key before occurrence := fun occurrence member =>
    key_congr (left.instances _ (housed occurrence member))
  have kept := left.occurrencesSublist.subset
  refine ⟨?issued, ?distinct, ?startedOnce, ?activations, ?reservations, ?owned, ?rooted, ?variables,
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled, ?attachedReserved, ?typed,
    ?worked, ?roles, ?raises, ?bodyRoles, ?itemRoles⟩
  case issued =>
    exact ⟨fun occurrence member => left.nextIssue ▸ formed.issued.occurrences occurrence (kept member),
      issuedItems_transport left.openItemsSub (fun _ member => left.occurrencesSublist.subset member) left.ordinals formed.issued.items,
      fun entry member => left.nextIssue ▸ formed.issued.scopes entry (left.scopesSublist.subset member)⟩
  case distinct =>
    refine ⟨formed.distinct.occurrences.sublist (left.occurrencesSublist.map _),
      left.openItemsSub.keyed formed.distinct.items,
      formed.distinct.scopes.sublist (left.scopesSublist.map _), ?_⟩
    rw [List.map_congr_left keys]
    exact formed.distinct.keys.sublist (left.occurrencesSublist.map _)
  case startedOnce => simpa [StartedOnce, sameStarts] using formed.startedOnce
  case activations => exact ⟨left.activations ▸ formed.activations.keys, left.activations ▸ formed.activations.positive⟩
  case reservations =>
    intro occurrence member unbegun fact started
    rw [keys occurrence member]
    exact formed.reservations occurrence (kept member) unbegun fact (sameStarts ▸ started)
  case owned =>
    refine ⟨housed, fun item member => ?_, fun item member => ?_, fun item member host attached => ?_,
      fun entry member owner owned => ?_, fun variables member => ?_, fun token member => ?_⟩
    · obtain ⟨old, outside⟩ := (left.items item).mp member
      exact stays _ (formed.owned.itemScopes item old) outside
    · obtain ⟨old, outside⟩ := (left.items item).mp member
      obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.itemOccurrences item old
      exact ⟨occurrence, (left.occurrences occurrence).mpr ⟨inside, rest.2 ▸ outside⟩, named, rest⟩
    · obtain ⟨old, outside⟩ := (left.items item).mp member
      obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.attachments item old host attached
      exact ⟨occurrence, (left.occurrences occurrence).mpr ⟨inside, rest.2 ▸ outside⟩, named, rest⟩
    · obtain ⟨old, outside⟩ := (left.scopes entry).mp member
      obtain ⟨occurrence, inside, named, begunFlag⟩ := formed.owned.scopeOwners entry old owner owned
      refine ⟨occurrence, (left.occurrences occurrence).mpr ⟨inside, fun within => outside ?_⟩, named, begunFlag⟩
      exact .parent entry occurrence.scope scope old (formed.ownedBelow entry old occurrence inside (named ▸ owned)) within
    · obtain ⟨old, outside⟩ := (left.variables variables).mp member
      exact stays _ (formed.owned.variableScopes variables old) outside
    · obtain ⟨old, outside⟩ := (left.tokens token).mp member
      exact stays _ (formed.owned.tokenScopes token old) outside
  case rooted =>
    obtain ⟨rootPresent, parentless, reach⟩ := formed.rooted
    obtain ⟨scopeEntry, scopeInside, scopeNamed⟩ := List.mem_map.mp present
    refine ⟨stays _ rootPresent fun inside => notRoot (Within.antisymm formed rootPresent inside
      (scopeNamed ▸ reach scopeEntry scopeInside)).symm, fun entry member => parentless entry
      (left.scopesSublist.subset member), fun entry member => ?_⟩
    obtain ⟨old, outside⟩ := (left.scopes entry).mp member
    exact left.reaches (reach entry old) outside
  case variables =>
    exact ⟨formed.variables.scopes.sublist (left.variablesSublist.map _),
      fun variables member => formed.variables.names variables (left.variablesSublist.subset member)⟩
  case failure => simpa [FailureRecorded, left.status, left.failure] using formed.failure
  case queue =>
    have queue := formed.queue
    refine ⟨fun host element scope queued => ?_, by simpa [left.signals, left.nextIssue] using queue.armScope,
      fun occurrence gateway scope queued => ?_, by simpa [left.signals] using queue.ends,
      by simpa [left.signals, left.nextIssue] using queue.completes⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := queue.arm host element scope (left.signals ▸ queued)
      exact ⟨left.nextIssue ▸ hostBelow, left.nextIssue ▸ scopeBelow, fun found member => facts found (kept member)⟩
    · obtain ⟨below, scopeBelow, facts⟩ := queue.armGateway occurrence gateway scope (left.signals ▸ queued)
      exact ⟨left.nextIssue ▸ below, left.nextIssue ▸ scopeBelow, fun found member => facts found (kept member)⟩
  case counted =>
    exact fun fact started => (formed.counted fact (sameStarts ▸ started)).congr left.activations
  case occurrencesCounted =>
    intro occurrence member
    rw [keys occurrence member]
    exact (formed.occurrencesCounted occurrence (kept member)).congr left.activations
  case ownedBelow =>
    exact fun entry member occurrence inside owned =>
      formed.ownedBelow entry (left.scopesSublist.subset member) occurrence (kept inside) owned
  case claimed =>
    exact formed.claimed.shrink (fun _ member => left.openItemsSub.items member) (fun _ member => kept member)
      housed (fun x member => by
        obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
        exact List.mem_map.mpr ⟨entry, left.scopesSublist.subset inside, named⟩)
      left.instances (Nat.le_of_eq left.nextIssue.symm) (by rw [left.signals]; exact .refl _) left.tokensSublist
  case settled =>
    exact formed.settled.transport left.slots (Nat.le_of_eq left.nextIssue.symm) (fun _ member _ => .inl (kept member))
      (fun _ queued => queued.shrink (by rw [left.signals]; exact .refl _) left.tokensSublist)
      (fun _ member => left.signals ▸ member) (fun _ member => .inl (left.scopesSublist.subset member))
  case attachedReserved =>
    exact formed.attachedReserved.shrink (fun _ member => left.openItemsSub.items member) fun _ member _ => kept member
  case typed =>
    exact formed.typed.shrink (fun _ member => left.openItemsSub.items member) (fun _ member _ => kept member)
      fun _ member => left.signals ▸ member
  case worked => exact formed.worked.shrink (fun _ member => left.openItemsSub.items member) fun _ member _ => kept member
  case roles => exact formed.roles.shrink fun _ member => kept member
  case bodyRoles => exact formed.bodyRoles.shrink fun _ member => kept member
  case itemRoles =>
    exact formed.itemRoles.shrink (fun _ member => left.openItemsSub.items member) fun _ member => kept member
  case raises =>
    exact formed.raises.transport (fun _ _ queued => left.signals ▸ queued) (Nat.le_of_eq left.nextIssue.symm)
      (fun x present _ => ⟨by
        obtain ⟨entry, inside, named⟩ := List.mem_map.mp present
        exact List.mem_map.mpr ⟨entry, left.scopesSublist.subset inside, named⟩, left.instances x present⟩)
      (fun _ counted => counted.congr left.activations) fun _ member _ => kept member

end Kernel.Laws.State
