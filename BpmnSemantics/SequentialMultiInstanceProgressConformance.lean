module

public import BpmnSemantics.SemanticProcess.SequentialMultiInstanceLaws
public import BpmnSemantics.SequentialMultiInstanceProgramBindingConformance
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all Init.Data.List.Control
import all Init.Data.String.Basic
import all Init.Data.String.Bootstrap
import all Init.Data.String.Decode
import all Init.Data.String.Defs
import all Init.Data.String.Extra
import all Init.Data.String.FindPos
import all Init.Data.String.Hashable
import all Init.Data.String.Iter
import all Init.Data.String.Iter.Basic
import all Init.Data.String.Iter.Intercalate
import all Init.Data.String.Iterate
import all Init.Data.String.Iterator
import all Init.Data.String.Legacy
import all Init.Data.String.Length
import all Init.Data.String.Modify
import all Init.Data.String.OrderInstances
import all Init.Data.String.Pattern
import all Init.Data.String.Pattern.Basic
import all Init.Data.String.Pattern.Char
import all Init.Data.String.Pattern.Pred
import all Init.Data.String.Pattern.String
import all Init.Data.String.PosRaw
import all Init.Data.String.Search
import all Init.Data.String.Slice
import all Init.Data.String.Stream
import all Init.Data.String.Subslice
import all Init.Data.String.Substring
import all Init.Data.String.TakeDrop
import all Init.Data.String.Termination
import all Init.Data.String.ToSlice
import all Lean.Data.Json.Basic
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream

/-! # Sequential Multi-Instance progress conformance

The satisfiability witness for
[the conditional closure law](SemanticProcess/SequentialMultiInstanceLaws.lean). That law assumes an
enabled accepted target event at every pair a trace from its start can reach; this module shows the
assumption is inhabited at the state the public Start command produces for the reviewed fixture, and
that the same assumption over every state is not.

One decided fact about the entered state supplies readiness. The progress hypothesis and the closing
trace then come from the quantified readiness laws, so no further state is reduced.

Scope boundary: one admitted arm and its entered state. The witness shows that readiness holds at this
Start and therefore that closure is a conditional statement about a real run; it claims no scheduler,
no human completion, no Timer delivery, and nothing about states other than this entered one.
-/

@[expose] public section

namespace BpmnSemantics.SequentialMultiInstanceProgressConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

/-- The entered state carries one controller, and the outer deadline is armed against it.

The decided half of the witness: running control, the controller, the record naming it, its attached
Timer handler and the wait that handler names. The entered state is the public Start command's result,
which `public_start_enters_through_the_distinct_operation` fixes, so this is a fact about the state a
client-visible command produces and not about a hand-built one. -/
theorem entered_state_is_ready_for_the_outer_deadline :
    ∃ arm initial controller, arm? = some arm ∧ entered? = some initial ∧
      initial.sequentialMultiInstanceControllers = [controller] ∧
        SequentialMultiInstanceInterruptionReady arm controller instanceId initial := by
  have decided : (arm?.bind fun arm => entered?.map fun state =>
      decide (state.sequentialMultiInstanceControllers.length = 1) &&
        state.sequentialMultiInstanceControllers.all fun controller =>
          decide (SequentialMultiInstanceInterruptionReady arm controller instanceId state)) =
      some true := by
    decide +kernel
  cases armed : arm? with
  | none => simp [armed] at decided
  | some arm =>
      cases entry : entered? with
      | none => simp [armed, entry] at decided
      | some initial =>
          simp only [armed, entry, Option.bind_some, Option.map_some, Option.some.injEq,
            Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true] at decided
          obtain ⟨single, ready⟩ := decided
          obtain ⟨controller, only⟩ := List.length_eq_one_iff.mp single
          exact ⟨arm, initial, controller, rfl, rfl, only, by
            simpa [only] using ready controller (by simp [only])⟩

/-- The relativized progress hypothesis holds at the entered state, exactly as the closure law states
it, and a closing conditional trace follows from applying that law.

Readiness is carried by every non-final iteration and the outer Timer is enabled wherever it holds,
so the hypothesis needs no human completion and no Timer-delivery fairness. -/
theorem entered_state_discharges_the_relativized_progress_hypothesis :
    ∃ arm initial controller, arm? = some arm ∧ entered? = some initial ∧
      initial.sequentialMultiInstanceControllers = [controller] ∧
      (∀ target current,
        SequentialMultiInstanceConditionalReach arm controller initial target current →
          ∃ nextTarget next,
            SequentialMultiInstanceTargetAcceptedEvent arm target current nextTarget next) ∧
      ∃ final, SequentialMultiInstanceConditionalTrace arm controller initial final := by
  obtain ⟨arm, initial, controller, armed, entry, only, ready⟩ :=
    entered_state_is_ready_for_the_outer_deadline
  have progress := interruption_ready_start_discharges_the_progress_hypothesis ready
  exact ⟨arm, initial, controller, armed, entry, only, progress,
    finite_snapshot_conditional_progress_eventually_closes arm controller initial progress⟩

/-- The same assumption over every controller and state fails for the fixture arm.

The separating fact beside the witness: the relativization is what makes the hypothesis inhabited, not
a property this arm happens to have. -/
theorem fixture_arm_refutes_the_unrelativized_progress_hypothesis :
    ∃ arm, arm? = some arm ∧
      ¬ ∀ (target : SequentialMultiInstanceController) (current : RuntimeState),
        ∃ nextTarget next,
          SequentialMultiInstanceTargetAcceptedEvent arm target current nextTarget next := by
  obtain ⟨arm, _, _, armed, _⟩ := entered_state_is_ready_for_the_outer_deadline
  exact ⟨arm, armed, unrelativized_progress_hypothesis_is_unsatisfiable arm⟩

end BpmnSemantics.SequentialMultiInstanceProgressConformance
