module

public import Kernel.Step.Finish
import all Kernel.Step.Finish

/-! # Laws of the step function: the finish of a Multi-Instance body

What `Kernel.Step.Finish` does, read from its bodies: only a completion's work is keyed under a finish root
(`finishKey_completion`) and only a compensation run's readiness under a readiness root (`readyKey_ready`,
`groupKeys_grouped`), and neither key reads a unit, so the finish and the readiness work run under one key whichever
completion queued them (`finishKey_unit`, `groupKey_unit`, DC30). This is the one module that sees `Kernel.Step.Finish`'s bodies; `Kernel.Laws.Step`
re-exports it.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- Only a completion's work runs under a finish root. -/
theorem finishKey_completion {ctx : Ctx} {state : State} {work : SignalWork} {key : UnitKey}
    (keyed : finishKey? ctx state work = .ok (some key)) : work.completion = true := by
  unfold finishKey? at keyed
  cases found : finishOf? ctx state work with
  | none => rw [found] at keyed; cases keyed
  | some run =>
    unfold finishOf? at found
    split at found
    · cases found
    · split at found
      · assumption
      · cases found

/-- **DC30**: a body's finish key reads no unit, so the unit that queued the finish does not decide the unit it runs
as: the running unit and its issue count are the only state the micro-step that queued it changes beyond the closure's
content. -/
theorem finishKey_unit (ctx : Ctx) (state : State) (work : SignalWork) (unit : UnitKey) (next : Nat) :
    finishKey? ctx { state with issuing := unit, issueNext := next } work = finishKey? ctx state work := by
  unfold finishKey? finishOf? finishOrdinal
  rfl

/-- Only a compensation run's readiness work runs under a readiness root. -/
theorem readyKey_ready {state : State} {work : SignalWork} {key : UnitKey}
    (keyed : readyKey? state work = .ok (some key)) : work.ready.isSome = true := by
  unfold readyKey? at keyed
  cases found : work.ready with
  | none => rw [found] at keyed; cases keyed
  | some _ => rfl

/-- Only a completion or a compensation run's readiness runs under a group root. -/
theorem groupKey_grouped {ctx : Ctx} {state : State} {work : SignalWork} {key : UnitKey}
    (keyed : groupKey? ctx state work = .ok (some key)) : work.completion = true ∨ work.ready.isSome = true := by
  unfold groupKey? at keyed
  cases finished : finishKey? ctx state work with
  | error _ => rw [finished] at keyed; cases keyed
  | ok found =>
    rw [finished] at keyed
    cases found with
    | some _ => exact .inl (finishKey_completion finished)
    | none => exact .inr (readyKey_ready keyed)

/-- **DC30**: a compensation run's readiness key reads no unit, so the handler whose completion released the work does
not decide the unit it runs as, and neither does a body's finish (`finishKey_unit`). -/
theorem groupKey_unit (ctx : Ctx) (state : State) (work : SignalWork) (unit : UnitKey) (next : Nat) :
    groupKey? ctx { state with issuing := unit, issueNext := next } work = groupKey? ctx state work := by
  unfold groupKey? readyKey? freeOrdinal
  rw [finishKey_unit]

/-- The group keys of a list of works, a batch's in `Step.conclude`, key completions and readinesses only. -/
theorem groupKeys_grouped {α : Type} {ctx : Ctx} {state : State} {work : α → SignalWork} :
    ∀ {items : List α} {groups : List (Option UnitKey)},
      items.mapM (fun item => groupKey? ctx state (work item)) = .ok groups →
      ∀ (index : Nat) (key : UnitKey), groups[index]?.join = some key →
        ∃ item, items[index]? = some item ∧ ((work item).completion = true ∨ (work item).ready.isSome = true)
  | [], groups, ran, index, key, found => by
    simp only [List.mapM_nil, pure, Except.pure, Except.ok.injEq] at ran
    subst ran
    simp at found
  | item :: rest, groups, ran, index, key, found => by
    simp only [List.mapM_cons, bind, Except.bind, pure, Except.pure] at ran
    split at ran
    · cases ran
    · rename_i first keyedFirst
      split at ran
      · cases ran
      · rename_i others keyedRest
        cases ran
        cases index with
        | zero =>
          simp only [List.getElem?_cons_zero, Option.join_some] at found
          subst found
          exact ⟨item, rfl, groupKey_grouped keyedFirst⟩
        | succ index =>
          simp only [List.getElem?_cons_succ] at found ⊢
          exact groupKeys_grouped keyedRest index key found

end Kernel.Laws.Step
