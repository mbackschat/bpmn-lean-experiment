module

public import Kernel.Step.Finish
import all Kernel.Step.Finish

/-! # Laws of the step function: the finish of a Multi-Instance body

What `Kernel.Step.Finish` does, read from its bodies: only a completion's work is keyed under a finish root
(`finishKey_completion`, `finishKeys_completion`), and the key reads no unit, so the finish runs under one key whichever instance's completion
queued it (`finishKey_unit`, DC30). This is the one module that sees `Kernel.Step.Finish`'s bodies; `Kernel.Laws.Step`
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

/-- The finish keys of a list of works, a batch's in `Step.conclude`, key completions only. -/
theorem finishKeys_completion {α : Type} {ctx : Ctx} {state : State} {work : α → SignalWork} :
    ∀ {items : List α} {finishes : List (Option UnitKey)},
      items.mapM (fun item => finishKey? ctx state (work item)) = .ok finishes →
      ∀ (index : Nat) (key : UnitKey), finishes[index]?.join = some key →
        ∃ item, items[index]? = some item ∧ (work item).completion = true
  | [], finishes, ran, index, key, found => by
    simp only [List.mapM_nil, pure, Except.pure, Except.ok.injEq] at ran
    subst ran
    simp at found
  | item :: rest, finishes, ran, index, key, found => by
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
          exact ⟨item, rfl, finishKey_completion keyedFirst⟩
        | succ index =>
          simp only [List.getElem?_cons_succ] at found ⊢
          exact finishKeys_completion keyedRest index key found

end Kernel.Laws.Step
