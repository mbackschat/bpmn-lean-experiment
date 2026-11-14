module

public import Kernel.Laws.Step
public import Kernel.Laws.Data
public import Kernel.Laws.Population

/-! # Proofs: the state invariant (P2)

The statements of the proof wave's state-invariant lane ([PLAN, P2](../../docs/PLAN.md#proof-wave)): `Step` and
`Population`'s calls of it keep `Laws.State.WellFormed`, through every feature's hooks and the closure loop. Each is
stated over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of `Registry.hooks`. The state premise is
`WellFormed` of the before-state; there is no model premise, since the invariant speaks of the state alone.

The invariant holds at input boundaries only: inside a closure `Kernel/Step/Stale.lean` lets a queued signal name a
scope occurrence an interruption already removed, so the closure is proved through a weaker invariant of its own, from
`Laws.Step.settle_induction`, that `WellFormed` follows from once the closure settles. Nothing executable imports this
module.
-/

public section

namespace Kernel.Proofs.State

open Kernel
open Kernel.Laws.State (WellFormed)

/-- A committed input keeps the state well-formed. -/
def StepKeepsWellFormed (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    WellFormed before → Step.step hooks program (some before) input = .ok after → WellFormed after

/-- A committed start makes a well-formed state. -/
def StartIsWellFormed (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), Step.step hooks program none input = .ok after → WellFormed after

/-- Every instance a committed population run holds is well-formed: `Population` reaches an instance only through
`Step.step`, from no state or from one it holds. -/
def PopulationKeepsWellFormed (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result → ∀ instance_ ∈ result.instances, WellFormed instance_.state

end Kernel.Proofs.State
