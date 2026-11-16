module

public import Kernel.Laws.Propagation.Rules

/-! # Laws of propagation: the witnesses

The non-vacuity witnesses of `Kernel.Laws.Propagation.Rules`: values that satisfy each law and, where the law could
otherwise hold of everything, values that violate it. They read the rules alone, so they stay outside
`Kernel.Feature.Propagation`'s rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Propagation

open Kernel

/-! ## Non-vacuity

A catch-all `C` on the raising Activity's boundary and an exact code `E` one level out. -/

def catchAll : ElementId := ⟨"C"⟩
def exact : ElementId := ⟨"E"⟩
def silent : ElementId := ⟨"S"⟩

def rank (candidate : ElementId) : Option Nat :=
  if candidate = exact then some 0 else if candidate = catchAll then some 1 else none

theorem nearer_catch_all : Chosen rank [[catchAll], [exact]] (some catchAll) :=
  ⟨0, [catchAll], ⟨rfl, by simp⟩, fun _ nearer => absurd nearer (Nat.not_lt_zero _), 1, by simp [rank, catchAll, exact],
    fun candidate mem other ranks => by simp at mem; subst mem; simp [rank, catchAll, exact] at ranks; exact .inr ⟨ranks, by simp⟩⟩

/-- Choosing the farther exact code over the nearer catch-all is rejected. -/
theorem farther_exact_rejected : ¬ Chosen rank [[catchAll], [exact]] (some exact) := by
  rintro ⟨index, level, ⟨at_, mem⟩, rest⟩
  have nearer := rest.1
  rcases index with _ | _ | index
  · simp at at_
    subst at_
    simp [exact, catchAll] at mem
  · have := nearer 0 (by omega) [catchAll] rfl catchAll (by simp)
    simp [rank, catchAll, exact] at this
  · simp at at_

theorem exact_in_level : Chosen rank [[catchAll, exact]] (some exact) :=
  ⟨0, [catchAll, exact], ⟨rfl, by simp⟩, fun _ nearer => absurd nearer (Nat.not_lt_zero _), 0, by simp [rank],
    fun candidate mem other ranks => by
      simp at mem
      rcases mem with rfl | rfl
      · simp [rank, catchAll, exact] at ranks
        exact .inl (by omega)
      · simp [rank] at ranks
        exact .inr ⟨ranks, Nat.le_refl _⟩⟩

/-- Choosing the catch-all over the exact code of its own level is rejected. -/
theorem catch_all_in_level_rejected : ¬ Chosen rank [[catchAll, exact]] (some catchAll) := by
  rintro ⟨index, level, ⟨at_, _⟩, rest⟩
  obtain ⟨precedence, ranked, least⟩ := rest.2
  rcases index with _ | index
  · simp at at_
    subst at_
    simp [rank, catchAll, exact] at ranked
    subst ranked
    rcases least exact (by simp) 0 (by simp [rank]) with lower | ⟨same, _⟩ <;> omega
  · simp at at_

theorem none_catches : Chosen rank [[silent]] none := by
  simp [Chosen, rank, silent, exact, catchAll]

/-- Calling an event caught that no candidate catches is rejected. -/
theorem silent_caught_rejected : ¬ Chosen rank [[silent], [exact]] none := fun law => by
  have := law [exact] (by simp) exact (by simp)
  simp [rank] at this

def raising : ScopeOccurrenceId := ⟨3⟩
def handlerContext : ScopeOccurrenceId := ⟨2⟩
def above : ScopeOccurrenceId := ⟨1⟩
def recordScope : ScopeOccurrenceId := ⟨0⟩
def triggerScope : ScopeOccurrenceId := ⟨0⟩

theorem stops_at_handler :
    Searched .failsInstance [raising, handlerContext, above] (some 1) [recordScope] [raising, handlerContext] :=
  ⟨fun _ => rfl, fun wrong => by simp at wrong⟩

/-- Under `failsInstance`, searching past the handler's context is rejected. -/
theorem past_handler_rejected :
    ¬ Searched .failsInstance [raising, handlerContext, above] (some 1) [recordScope] [raising, handlerContext, above] :=
  fun law => by
    have := law.1 rfl
    simp [raising, handlerContext, above] at this

theorem on_from_record :
    Searched .propagatesFromTrigger [raising, handlerContext, above] (some 1) [recordScope]
      [raising, handlerContext, recordScope] :=
  ⟨fun wrong => by simp at wrong, fun _ => rfl⟩

/-- Under `propagatesFromTrigger`, going on to the handler context's parent, the trigger's scope occurrence, instead of
the scope occurrence holding the subject's record is rejected. -/
theorem on_from_context_rejected :
    ¬ Searched .propagatesFromTrigger [raising, handlerContext, above] (some 1) [recordScope]
      [raising, handlerContext, above] := fun law => by
  have := law.2 rfl
  simp [above, recordScope] at this

def boundaryFlow : FlowId := ⟨"ToRecovery"⟩
def counter : ActivationCount := { processInstance := "p", element := exact, role := .element, count := 2 }

def running : State :=
  { instanceId := "p", scopes := [{ id := triggerScope, element := none, parent := none },
      { id := raising, element := some ⟨"Sub"⟩, parent := some triggerScope }],
    tokens := [.flow ⟨"Inner"⟩ raising], activations := [counter] }

def recovered : State :=
  { running with
    scopes := [{ id := triggerScope, element := none, parent := none }]
    tokens := [.flow boundaryFlow triggerScope] }

theorem catch_interrupts : InterruptingCatch true (· = raising) triggerScope [boundaryFlow] running recovered := fun _ =>
  ⟨by simp [recovered, triggerScope, raising], ⟨[], rfl, by simp⟩, fun counter' mem => ⟨counter', mem, rfl, rfl, rfl, Nat.le_refl _⟩⟩

/-- Keeping the interrupted scope occurrence is rejected. -/
theorem keeps_inner_scope_rejected :
    ¬ InterruptingCatch true (· = raising) triggerScope [boundaryFlow] running { recovered with scopes := running.scopes } :=
  fun law => (law rfl).1 { id := raising, element := some ⟨"Sub"⟩, parent := some triggerScope } (by simp [running]) rfl

/-- Adding no token on the catcher's flow is rejected. -/
theorem no_boundary_token_rejected :
    ¬ InterruptingCatch true (· = raising) triggerScope [boundaryFlow] running { recovered with tokens := [] } := fun law => by
  obtain ⟨_, ⟨kept, split, _⟩, _⟩ := law rfl
  have := congrArg List.length split
  simp at this

/-- Resetting an activation counter is rejected. -/
theorem counter_reset_rejected :
    ¬ InterruptingCatch true (· = raising) triggerScope [boundaryFlow] running
      { recovered with activations := [{ counter with count := 0 }] } := fun law => by
  obtain ⟨_, _, monotonic⟩ := law rfl
  obtain ⟨later, mem, same⟩ := monotonic counter (by simp [running])
  obtain ⟨_, _, _, le⟩ := same
  simp at mem
  subst mem
  simp [counter] at le

def failed : State := { instanceId := "p", status := .failed }

theorem uncaught_fails : UncaughtError .failsInstance false (.ok failed) :=
  fun _ => ⟨fun _ => ⟨failed, rfl, rfl, rfl⟩, fun wrong => by simp at wrong⟩

/-- Under `failsInstance`, leaving the instance running is rejected. -/
theorem uncaught_running_rejected : ¬ UncaughtError .failsInstance false (.ok running) := fun law => by
  obtain ⟨after, same, status, _⟩ := (law rfl).1 rfl
  simp at same
  subst same
  simp [running] at status

theorem uncaught_ends_path : UncaughtError .endsThrowingPath false (.ok recovered) :=
  fun _ => ⟨fun wrong => by simp at wrong, fun _ after same => by cases same; intro failed; cases failed⟩

/-- Under `endsThrowingPath`, failing the instance is rejected. -/
theorem ends_path_fails_rejected : ¬ UncaughtError .endsThrowingPath false (.ok failed) := fun law =>
  (law rfl).2 rfl failed rfl rfl

def leaveThrower (state : State) : State := { state with tokens := [] }

theorem escalation_leaves_only : UncaughtEscalation false leaveThrower running (leaveThrower running) := fun _ => rfl

/-- An uncaught Escalation that fails the instance is rejected. -/
theorem escalation_fails_rejected : ¬ UncaughtEscalation false leaveThrower running { leaveThrower running with status := .failed } :=
  fun law => by
    have := congrArg State.status (law rfl)
    revert this
    simp [leaveThrower, running]

theorem cancel_admitted : CancelAdmission true 1 none := ⟨rfl, by omega⟩

theorem cancel_uncaught_refused : CancelAdmission true 0 (some "throw.cancel.uncaught") := .inr ⟨rfl, rfl, rfl⟩

/-- Admitting a Cancel throw whose Transaction has no Cancel boundary is rejected. -/
theorem cancel_uncaught_admitted_rejected : ¬ CancelAdmission true 0 none := fun law =>
  absurd law.caught (Nat.lt_irrefl 0)
end Kernel.Laws.Propagation
