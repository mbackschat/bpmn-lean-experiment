module

public import Kernel.Laws.State.Initial

/-! # Laws of the kernel state: the issuer

What changing the running unit's issuer keeps (DC12): taking its next issue (`issue_wellFormed`), and the micro-step's
issuer reset before its body (`enterUnit_wellFormed`) and back to the seed's once its transition is journalled
(`leaveUnit_wellFormed`), which `Kernel.Proofs.Step` assembles into `Laws.Step.ClosurePhases`. Nothing executable imports
this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- A state with only its issuer and issue table changed is well-formed when the table only grows and the new issuer is
fresh (DC12): every key issued stays issued, and nothing else reads the issuer. -/
theorem issuer_wellFormed {s : State} (formed : WellFormed program s) (unit : UnitKey) (next : Nat)
    (tabled : Std.ExtTreeMap Issue ClaimSlot compare) (grown : TableGrows s { s with issuing := unit, issueNext := next, issued := tabled })
    (fresh : IssuerFresh { s with issuing := unit, issueNext := next, issued := tabled }) : WellFormed program { s with issuing := unit, issueNext := next, issued := tabled } := by
  have table : TableGrows s { s with issuing := unit, issueNext := next, issued := tabled } := grown
  have grows : ScopeGrows s { s with issuing := unit, issueNext := next, issued := tabled } := .of_same rfl rfl table
  have issuedGrows : OccurrenceGrows s { s with issuing := unit, issueNext := next, issued := tabled } := .of_same rfl rfl rfl table
  have keys : key { s with issuing := unit, issueNext := next, issued := tabled } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  have sameItems : (itemList ({ s with issuing := unit, issueNext := next, issued := tabled } : State).openItems) = itemList s.openItems :=
    items_congr rfl
  exact {
  issued := ⟨fun occurrence member => issuedGrows _ (formed.issued.occurrences occurrence member),
    fun item member =>
      let ⟨owner, below, tabled⟩ := formed.issued.items item (items_same member rfl)
      ⟨owner, below, fun unit index fresh => table _ _ (tabled unit index fresh)⟩,
    fun scope member => grows.issued (formed.issued.scopes scope member)⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, fun item member => formed.owned.itemScopes item (items_same member rfl),
    fun item member => formed.owned.itemOccurrences item (items_same member rfl),
    fun item member => formed.owned.attachments item (items_same member rfl), formed.owned.scopeOwners,
    formed.owned.variableScopes, formed.owned.tokenScopes⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
    Within.congr (s := s) (t := { s with issuing := unit, issueNext := next, issued := tabled }) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := formed.failure
  queue := {
    arm := fun host element scope queued => by
      obtain ⟨host', scope', begun⟩ := formed.queue.arm host element scope queued
      exact ⟨issuedGrows _ host', grows.issued scope', begun⟩
    armScope := fun scope queued => grows.issued (formed.queue.armScope scope queued)
    armGateway := fun occurrence gateway scope queued => by
      obtain ⟨occurrence', scope', begun⟩ := formed.queue.armGateway occurrence gateway scope queued
      exact ⟨issuedGrows _ occurrence', grows.issued scope', begun⟩
    ends := formed.queue.ends
    completes := fun id leave writes rule queued => issuedGrows _ (formed.queue.completes id leave writes rule queued) }
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := formed.claimed.shrink (fun _ member => items_same member rfl) (fun _ member => member)
    formed.owned.occurrenceScopes (fun _ member => member) (fun _ _ => by apply instanceOf_congr <;> rfl) issuedGrows
    grows (.refl _) (.refl _)
  settled := formed.settled.transport (.same rfl) issuedGrows grows (fun _ member _ => .inl member)
    (fun _ queued => queued) (fun _ member => member) (fun _ member => .inl member)
  attachedReserved := by unfold AttachedReserved; rw [sameItems]; exact formed.attachedReserved
  typed := by unfold Typed; rw [sameItems]; exact formed.typed
  worked := by unfold Worked; rw [sameItems]; exact formed.worked
  roles := formed.roles
  bodyRoles := formed.bodyRoles
  itemRoles := by unfold ItemRoles; rw [sameItems]; exact formed.itemRoles
  raises := formed.raises.transport (fun _ _ queued => queued) grows issuedGrows fun _ member _ => member
  issuer := fresh }


/-- Taking the running unit's next issue keeps a state well-formed under its fresh issuer (DC12): the table only
grows, so every key issued stays issued, and the issuer stays fresh (`IssuerFresh.issue`). -/
theorem issue_wellFormed {s : State} (formed : WellFormed program s) (slot : ClaimSlot) :
    WellFormed program { s with issueNext := s.issueNext + 1, issued := s.issued.insert (.fresh s.issuing s.issueNext) slot } :=
  issuer_wellFormed formed s.issuing (s.issueNext + 1) _ (.insert formed.issuer.next rfl)
    (formed.issuer.issue rfl rfl rfl rfl)

/-- `Step.microStep`'s issuer reset keeps a state well-formed (`Laws.Step.ClosurePhases.enterUnit`): its unit has not
run, so it holds no issue, and the issuer it replaces holds none either. -/
theorem enterUnit_wellFormed {s : State} (formed : WellFormed program s) {unit : UnitKey}
    (unrun : s.transitions.contains unit = false) (untabled : ∀ index, s.issued[Issue.fresh s.issuing index]? = none) :
    WellFormed program { s with issuing := unit, issueNext := 0 } :=
  have unissued : ∀ index slot, s.issued[Issue.fresh unit index]? ≠ some slot := fun index slot held => by
    rcases formed.issuer.ran unit index slot held with contains | same
    · simp [unrun] at contains
    · subst same; simp [untabled index] at held
  issuer_wellFormed formed unit 0 s.issued (fun _ _ held => held) <| by
    refine ⟨formed.issuer.fresh, fun index slot held => absurd held (unissued index slot), fun other index slot held => ?_⟩
    rcases formed.issuer.ran other index slot held with contains | same
    · exact .inl contains
    · subst same; simp [untabled index] at held

/-- `Step.conclude`'s issuer reset to the seed's keeps a state well-formed (`Laws.Step.ClosurePhases.leaveUnit`): the
replaced issuer has run, and the table holds no issue of the seed's. -/
theorem leaveUnit_wellFormed {s : State} (formed : WellFormed program s) (ran : s.transitions.contains s.issuing = true)
    (seed : ∀ index, s.issued[Issue.fresh (.ofRoot .seed) index]? = none) :
    WellFormed program { s with issuing := .ofRoot .seed, issueNext := 0 } :=
  issuer_wellFormed formed (.ofRoot .seed) 0 s.issued (fun _ _ held => held) <| by
    refine ⟨formed.issuer.fresh, fun index slot held => by simp [seed index] at held, fun other index slot held => ?_⟩
    rcases formed.issuer.ran other index slot held with contains | same
    · exact .inl contains
    · exact .inl (same ▸ ran)

end Kernel.Laws.State
