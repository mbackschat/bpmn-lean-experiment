module

public import Kernel.Step.Offer
public import Kernel.Laws.Step.Ran
public import Kernel.Laws.State.Slots
import all Kernel.Step.Offer

/-! # Laws of the step function: the parked joins a quiescent closure offers again

What `Kernel.Step.Offer` does, read from its bodies: a join offered again is offered an arrival parked on it, in its
scope occurrence, whatever order `offerOrder` takes the parked arrivals in and whichever arrival `slotOffer` picks, and
runs its gateway's hook under the offer's unit (`reoffer_ok`). This is the one module that sees `Kernel.Step.Offer`'s
bodies; `Kernel.Laws.Step` re-exports it.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- `offerOrder` only reorders the parked arrivals. -/
theorem mem_offerOrder {ctx : Ctx} {parked : List Parked} {waiting : Parked} (member : waiting ∈ offerOrder ctx parked) :
    waiting ∈ parked := by
  unfold offerOrder at member
  split at member
  · exact member
  · exact List.mem_mergeSort.mp member

/-- The arrival `slotOffer` picks is one of the slot's. -/
theorem slotOffer_mem {ctx : Ctx} {slot : List Parked} {offered : Parked} (found : slotOffer ctx slot = some offered) :
    offered ∈ slot := by
  unfold slotOffer at found
  split at found
  · exact List.mem_of_getLast? found
  · exact Laws.State.leastBy_mem found

/-- A parked join offered again ran its gateway's hook on the state the closure reached, for an occurrence it found,
under the offer's unit as the issuer (DC12). -/
theorem reoffer_ok {hooks : Hooks} {ctx : Ctx} {state : State} {gateway : ElementId} {scope : ScopeOccurrenceId}
    {named : OccurrenceId} {offered : State} (ran : reoffer? hooks ctx state = .ok (some (gateway, scope, named, offered))) :
    ∃ id occurrence header payload, (∃ waiting ∈ state.slots.parked, waiting.occurrence = id ∧ ∃ element,
      (ctx.program.target? waiting.flow).bind ctx.program.element? = some element ∧
        element.gateway? = some (header, payload)) ∧
      state.occurrence? id = some occurrence ∧ occurrence.id = named ∧ ∃ unit,
        UnitKey.offerUnit? occurrence.id (offerRound state occurrence.id) = some unit ∧
          hooks.arriveGateway ctx header payload occurrence { state with issuing := unit, issueNext := 0 } = .ok offered := by
  unfold reoffer? at ran
  refine foldlM_finds (fun found => ∃ id occurrence header payload, (∃ waiting ∈ state.slots.parked,
    waiting.occurrence = id ∧ ∃ element, (ctx.program.target? waiting.flow).bind ctx.program.element? = some element ∧
      element.gateway? = some (header, payload)) ∧ state.occurrence? id = some occurrence ∧ occurrence.id = found.2.2.1 ∧
      ∃ unit, UnitKey.offerUnit? occurrence.id (offerRound state occurrence.id) = some unit ∧
        hooks.arriveGateway ctx header payload occurrence { state with issuing := unit, issueNext := 0 } = .ok found.2.2.2)
    (fun found waiting result kept stepped => ?_) _ none _ (by simp) ran _ rfl
  split at stepped
  · exact (Except.ok.inj stepped) ▸ kept
  unfold offerParked at stepped
  split at stepped
  · simp at stepped
  · rename_i element targeted
    split at stepped
    · rename_i occurrence isGateway lookup
      split at stepped
      rotate_left
      · simp at stepped
      rename_i unit keyed
      obtain ⟨offeredState, offering, made⟩ := bind_ok stepped
      obtain ⟨last, isLast, found⟩ := Option.bind_eq_some_iff.mp lookup
      have kept := List.mem_filter.mp (slotOffer_mem isLast)
      have sameTarget : ctx.program.target? last.flow = ctx.program.target? waiting.flow := by
        have matched := kept.2
        simp only [Bool.and_eq_true, beq_iff_eq] at matched
        exact matched.2
      intro result same
      rw [← Except.ok.inj made] at same
      split at same
      · simp at same
      · rw [← Option.some.inj same]
        exact ⟨_, _, _, _, ⟨last, kept.1, rfl, element, sameTarget ▸ targeted, isGateway⟩, found, rfl, unit, keyed, offering⟩
    · simp at stepped

end Kernel.Laws.Step
