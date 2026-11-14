module

public import Kernel.Laws.MultiInstance.Rules

/-! # Laws of Multi-Instance Activities: what a body keeps while it enters

What a running body keeps while `Kernel.Feature.MultiInstance` enters and queues its instances (`Entering`), and the
left-fold lemmas the entering runs on, stated without reading the feature so that they stay outside its rebuild cone
(guard 15); `Kernel.Laws.MultiInstance` proves what each entering step keeps of them. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Laws.MultiInstance

open Kernel

variable {inv : State → Prop} {settled : State → Nat → Prop}

/-- A property every step of a left fold keeps over the list's members holds of the fold. -/
theorem foldl_keeps {α β : Type} (P : α → Prop) (f : α → β → α) :
    ∀ (l : List β) (a : α), (∀ a b, b ∈ l → P a → P (f a b)) → P a → P (l.foldl f a)
  | [], _, _, holds => holds
  | b :: l, a, step, holds =>
    foldl_keeps P f l (f a b) (fun a' b' member => step a' b' (List.mem_cons_of_mem _ member)) (step a b (by simp) holds)

/-- A property of the members folded so far, which each step of a left fold over `whole` extends by its member, holds
of the fold with all of `whole`. -/
theorem foldl_prefix {α β : Type} (P : List β → α → Prop) (f : α → β → α) (whole : List β) :
    ∀ (rest pre : List β) (a : α), pre ++ rest = whole →
      (∀ pre b post a, whole = pre ++ b :: post → P pre a → P (pre ++ [b]) (f a b)) → P pre a →
      P whole (rest.foldl f a)
  | [], pre, _, split, _, holds => by
    rw [List.append_nil] at split
    exact split ▸ holds
  | b :: rest, pre, a, split, step, holds =>
    foldl_prefix P f whole rest (pre ++ [b]) (f a b) (by rw [← split]; simp) step (step pre b rest a split.symm holds)

/-- What a body keeps while it enters and queues its instances, `instances` its slots so far: `inv`, that its
occurrence has settled, its scope occurrence, its instances' placement and the scope occurrences the queued begins
name. -/
def Entering (inv : State → Prop) (settled : State → Nat → Prop) (run : MultiInstanceRun) (state : State)
    (instances : List Iteration) (requests : List BeginRequest) : Prop :=
  inv state ∧ settled state run.occurrence ∧ run.scope ∈ Laws.State.scopeIds state ∧
    Laws.State.Placed state { run with instances } ∧
    ∀ request ∈ requests, Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds state

/-- A change that keeps the scope occurrences and the counter keeps what a body keeps while it enters. -/
theorem Entering.frame {run : MultiInstanceRun}
    {state after : State} {instances : List Iteration} {requests : List BeginRequest}
    (entering : Entering inv settled run state instances requests) (holds : inv after)
    (carried : settled after run.occurrence) (scopes : after.scopes = state.scopes)
    (issued : after.nextIssue = state.nextIssue) : Entering inv settled run after instances requests := by
  obtain ⟨_, _, stands, rest⟩ := entering
  obtain ⟨placed, queued⟩ := rest
  have same : Laws.State.scopeIds after = Laws.State.scopeIds state := by simp [Laws.State.scopeIds, scopes]
  exact ⟨holds, carried, same ▸ stands, placed.transport (Nat.le_of_eq issued.symm)
    (fun _ member => .inl (scopes ▸ member)), fun request member => same ▸ queued request member⟩

end Kernel.Laws.MultiInstance
