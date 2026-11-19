module

public import Kernel.State.Slots
import all Kernel.State.Slots

/-! # Laws of the kernel state: the feature slots

What `Kernel.State.Slots`' operations do, read from their bodies; this is the one module that sees them. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- `FeatureSlots.clear` filters each slot by the scope occurrences it removes: what `Kernel.Laws.State.Removal` reads
of the slots when it clears a scope occurrence. -/
theorem featureSlotsClear_eq (slots : FeatureSlots) (inside nested : List ScopeOccurrenceId) :
    slots.clear inside nested = {
      parked := slots.parked.filter (!inside.contains ·.scope)
      held := slots.held.filter (!inside.contains ·.scope)
      multiInstances := slots.multiInstances.filter (!inside.contains ·.scope)
      compensation := {
        retained := slots.compensation.retained.filter (!nested.contains ·.scope)
        runs := slots.compensation.runs.filter (!inside.contains ·.scope) }
      instances := slots.instances.filter (!nested.contains ·.root) } := by
  simp only [FeatureSlots.clear]

/-- A held occurrence is suspended, leaving by its outgoing flows. -/
theorem held_suspended {slots : FeatureSlots} {held : Held} (mem : held ∈ slots.held) :
    { element := held.occurrence.element, scope := held.scope, leave := .outgoing : Suspended } ∈ slots.suspended :=
  List.mem_append_left _ (List.mem_map.mpr ⟨held, mem, rfl⟩)

/-- A compensation run that completes an existing occurrence once its handlers end, as a waiting Compensation throw's
does, holds that occurrence suspended. -/
theorem resume_suspended {slots : FeatureSlots} {run : CompensationRun} {occurrence : OccurrenceId} {leave : Leave}
    (mem : run ∈ slots.compensation.runs) (resume : run.resume = some (.complete occurrence leave)) :
    { element := occurrence.element, scope := occurrence.scope, leave : Suspended } ∈ slots.suspended :=
  List.mem_append_right _ (List.mem_filterMap.mpr ⟨run, mem, by simp [resume]⟩)

end Kernel.Laws.State
