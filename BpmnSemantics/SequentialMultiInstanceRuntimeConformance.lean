import BpmnSemantics.SequentialMultiInstanceConformanceFixtures

/-! # Sequential Multi-Instance runtime conformance

Positive runtime, lifecycle, binding, interruption, and empty-collection facts for the shared
Sequential Multi-Instance fixture chain.
-/

namespace BpmnSemantics.SequentialMultiInstanceConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

/-! ## Instance-search budget

Every fact below compares one wide tuple, and the `DecidableEq` instance for a tuple is one
`instDecidableEqProd` application per component plus one for each component's own type. The default
`synthInstance.maxSize` of 128 is a budget on that total, and these fixtures cross it: a six-component
tuple of primitives resolves, a seven-component one does not, and a six-component one whose members
are lists of pairs does not either. The failure is a search that ran out of budget rather than a type
without an instance, which is why it is raised here instead of being worked around.

The alternatives were both worse. Projecting each tuple member to a narrower type would silently
shrink what the fixture compares, and splitting each fact into several narrow ones would reduce the
state chain once per fragment, which is the expensive half of this module. Raising the budget changes
no proposition, adds no axiom, and leaves every comparison exactly as wide as it was.

The figure is a cap with headroom rather than a measured requirement. The widest facts here, the
entry projection and the empty-collection closure, still fail at 400 because a member that is a list
of pairs, or a list of `VariableBinding` reaching `VariableValue`, costs far more than a primitive.
Fitting the cap to what those need exactly would turn one added tuple member into a build failure
rather than a fixture edit, and nothing is spent by a budget that is not reached.
-/

set_option synthInstance.maxSize 2000

/-- Every state this run reaches is one the reviewed runtime-state invariant admits.

The positive fact that keeps the refusals below honest, and the one the quantified laws do not supply:
preservation across these arms is an open lane, so this is the decided instance of it. -/
theorem every_state_of_the_run_is_well_formed :
    [entered?, afterFirstResult?, afterSecondResult?, afterThirdResult?,
      interruptedAfterFirstResult?].map
        (·.map (runtimeStateWellFormed program instanceId)) =
      [some true, some true, some true, some true, some true] := by
  decide +kernel

/-- The shared live-body invariant is not enough for an SMI controller: its body must be the exact
User Task declared by the bound operation. A live child scope belongs to another Activity family and
must be refused before evaluation or projection. -/
def enteredWithChildScopeBody? : Option RuntimeState := do
  let state ← entered?
  let record ← state.activityOccurrences.head?
  pure { state with activityOccurrences := [{ record with body := .childScope record.owner }] }

theorem child_scope_body_is_not_a_valid_sequential_multi_instance_binding :
    enteredWithChildScopeBody?.map (runtimeStateWellFormed program instanceId) = some false := by
  decide +kernel

/-- The state alone is not the whole invariant. Changing the declared task name while retaining the
same runtime wait leaves every occurrence identity live and uniquely declared, but breaks the exact
program-to-controller binding. -/
def renamedTaskProgram : Program :=
  { program with
    operations := program.operations.map fun
      | .awaitSequentialMultiInstanceUserTask id origin input task data normalOutput boundaryTimer
          limits =>
          .awaitSequentialMultiInstanceUserTask id origin input
            { task with name := some "Different task" } data normalOutput boundaryTimer limits
      | operation => operation }

theorem controller_binding_rejects_a_different_declared_task :
    entered?.map (runtimeStateWellFormed renamedTaskProgram instanceId) = some false := by
  decide +kernel

private def sequentialMultiInstanceOperationIds : List OperationId :=
  program.operations.filterMap fun
    | .awaitSequentialMultiInstanceUserTask id .. => some id
    | _ => none

def missingSequentialMultiInstanceOwnerProgram : Program :=
  { program with
    operationScopes := program.operationScopes.filter fun ownership =>
      !sequentialMultiInstanceOperationIds.contains ownership.operationId }

def duplicateSequentialMultiInstanceOwnerProgram : Program :=
  { program with
    operationScopes := program.operationScopes.flatMap fun ownership =>
      if sequentialMultiInstanceOperationIds.contains ownership.operationId then
        [ownership, ownership]
      else [ownership] }

/-- Definition admission owns malformed operation-scope structure while no matching runtime artifact
exists, so neither the initial-state theorem nor public empty progress needs an ownership fact. -/
theorem empty_runtime_does_not_duplicate_program_ownership_admission :
    (sequentialMultiInstanceProgramBindingsValid missingSequentialMultiInstanceOwnerProgram
        initialState,
      sequentialMultiInstanceProgramBindingsValid duplicateSequentialMultiInstanceOwnerProgram
        initialState) = (true, true) := by
  decide +kernel

/-- The missing and duplicate owner counterexamples separate that responsibility boundary: once the
SMI Activity is live, both malformed definitions make its runtime binding invalid. -/
theorem live_runtime_requires_exactly_one_operation_owner :
    (entered?.map (sequentialMultiInstanceProgramBindingsValid
        missingSequentialMultiInstanceOwnerProgram),
      entered?.map (sequentialMultiInstanceProgramBindingsValid
        duplicateSequentialMultiInstanceOwnerProgram)) = (some false, some false) := by
  decide +kernel

/-- The reverse half of the state binding: an open operation-owned Activity record cannot outlive the
controller that carries its immutable snapshot and accumulated output slots. -/
def enteredWithoutController? : Option RuntimeState :=
  entered?.map fun state => { state with sequentialMultiInstanceControllers := [] }

theorem controller_binding_rejects_an_open_record_without_its_controller :
    enteredWithoutController?.map (runtimeStateWellFormed program instanceId) = some false := by
  decide +kernel

/-- A second operation-owned task wait outside the record is not another iteration. The exact profile
has one active inner task, so advancing its high-water mark does not make the extra wait admissible. -/
def enteredWithUnrecordedTaskWait? : Option RuntimeState := do
  let state ← entered?
  let wait ← state.waits.head?
  pure
    { state with
      waits := state.waits ++ [{ wait with activation := wait.activation + 1 }]
      activations := state.activations.map fun activation =>
        if activation.taskId == wait.task.id then
          { activation with count := activation.count + 1 }
        else activation }

theorem controller_binding_rejects_an_extra_operation_owned_task_wait :
    enteredWithUnrecordedTaskWait?.map (runtimeStateWellFormed program instanceId) = some false := by
  decide +kernel

/-- A second operation-owned lifetime Timer outside the record is likewise surplus profile state. -/
def enteredWithUnrecordedTimerWait? : Option RuntimeState := do
  let state ← entered?
  let wait ← state.timerWaits.head?
  pure
    { state with
      timerWaits := state.timerWaits ++
        [{ wait with activation := wait.activation + 1, deadlineMs := wait.deadlineMs + 1 }]
      timerActivations := state.timerActivations.map fun activation =>
        if activation.elementId == wait.elementId then
          { activation with count := activation.count + 1 }
        else activation }

theorem controller_binding_rejects_an_extra_operation_owned_timer_wait :
    enteredWithUnrecordedTimerWait?.map (runtimeStateWellFormed program instanceId) = some false := by
  decide +kernel

/-- `SMI-ENTER-01`, generating arm: one task, one deadline, one record, one controller, no output.

Three identities from three counter families, all at ordinal one, which is the coincidence every join
the ownership record retired used to read as a pair. The incoming token is consumed and no token is
produced, because the outer Activity is now open rather than finished. -/
theorem entry_arms_one_inner_task_one_lifetime_deadline_and_one_controller :
    entered?.map (fun state =>
      (state.waits.map fun wait => (wait.task.id.value, wait.activation),
        state.timerWaits.map fun wait => (wait.elementId.value, wait.activation, wait.deadlineMs),
        state.activityOccurrences.map (·.activation),
        state.sequentialMultiInstanceControllers.map fun controller =>
          (controller.snapshot, controller.outputSlots),
        state.tokens.map (·.placeId.value),
        state.variables.process.bindings.map (·.name))) =
      some ([("UserTask_Review", 1)], [("BoundaryTimer_Review", 1, 5000)], [1],
        [(["Invoice_1", "Invoice_2", "Invoice_3"], [])], [],
          ["DataObjectReference_InputItems"]) := by
  decide +kernel

/-- `SMI-ITERATE-01` twice: the body advances, the deadline does not, and slots fill in index order.

The three-tuple of activations is the whole content of the turnover amendment seen from this family.
After one iteration the body is at ordinal two while its handler and its Activity occurrence are still
at one, and after two iterations the body is at three while both are still at one. An evaluator that
re-armed the deadline for each iteration would answer `2` or `3` in the middle column, and one that
re-armed the outer Activity would answer it in the third. -/
theorem iteration_advances_the_body_and_stands_the_deadline_still :
    [afterFirstResult?, afterSecondResult?].map (·.map fun state =>
      (state.waits.map (·.activation),
        state.timerWaits.map fun wait => (wait.activation, wait.deadlineMs),
        state.activityOccurrences.map (·.activation),
        state.sequentialMultiInstanceControllers.map (·.outputSlots),
        state.variables.process.bindings.map (·.name))) =
      [some ([2], [(1, 5000)], [1], [["Reviewed_1"]], ["DataObjectReference_InputItems"]),
        some ([3], [(1, 5000)], [1], [["Reviewed_1", "Reviewed_2"]],
          ["DataObjectReference_InputItems"])] := by
  decide +kernel

/-- `SMI-COMPLETE-01`: the exact ordered collection, published once, and the repetition closed.

The published items are the slots in index order, and the Process scope holds exactly the input
collection it started with plus this one output binding, canonically ordered by name. The controller,
the record, the final inner task, and the lifetime deadline are all gone, and the only enabled route is
the normal one. -/
theorem final_completion_publishes_the_exact_ordered_collection_and_closes :
    afterThirdResult?.map (fun state =>
      (state.variables.process.bindings,
        state.waits.length, state.timerWaits.length, state.activityOccurrences.length,
        state.sequentialMultiInstanceControllers.length,
        state.tokens.map (·.placeId.value))) =
      some
        ([{ name := "DataObjectReference_InputItems"
            value := .stringList ["Invoice_1", "Invoice_2", "Invoice_3"] },
          { name := "DataObjectReference_OutputResults"
            value := .stringList ["Reviewed_1", "Reviewed_2", "Reviewed_3"] }],
          0, 0, 0, 0, ["place:Flow_Review_Completed"]) := by
  decide +kernel

/-- `SMI-CANCEL-01` after one accepted result: nothing published, only the boundary route enabled.

The accepted `Reviewed_1` is discarded with the controller that held it, so Process scope still holds
exactly the input collection and no output binding of any kind. Logical time advances to the committed
deadline rather than to a submitted instant. -/
theorem interruption_discards_partial_results_and_publishes_nothing :
    interruptedAfterFirstResult?.map (fun state =>
      (state.variables.process.bindings,
        state.waits.length, state.timerWaits.length, state.activityOccurrences.length,
        state.sequentialMultiInstanceControllers.length,
        state.tokens.map (·.placeId.value), state.logicalTimeMs)) =
      some
        ([{ name := "DataObjectReference_InputItems"
            value := .stringList ["Invoice_1", "Invoice_2", "Invoice_3"] }],
          0, 0, 0, 0, ["place:Flow_Timer_Escalation"], 5000) := by
  decide +kernel

/-- The entered state with a second live deadline listed by the same Activity occurrence record.

Hand-perturbed rather than reached by a transition, because this profile arms exactly one boundary
Timer and no admitted schedule reaches this state. What it perturbs is the number of deadlines and not
the shape of the join: each wait is still claimed by exactly one record and both are live under that
record's own owner, which is the state `attachedTimersUnambiguous` admits. -/
def enteredWithSecondDeadline? : Option RuntimeState := do
  let state ← entered?
  let record ← state.activityOccurrences.head?
  let fired ← record.timerHandlerOccurrences.head?
  let deadline ← state.timerWaits.find? (timerIdNamesWait fired)
  pure
    { state with
      activityOccurrences :=
        [{ record with
            attachedHandlers :=
              record.attachedHandlers ++
                [.timer { fired with activation := fired.activation + 1 }] }]
      timerWaits :=
        state.timerWaits ++
          [{ deadline with
              activation := deadline.activation + 1
              deadlineMs := deadline.deadlineMs + 1000 }] }

/-- Interruption withdraws every deadline the record listed, the one not yet due included.

The second deadline stands at 6000 while the fired one is at 5000, so a post-state that keeps it live
is exactly the stranding this withdrawal prevents: the record that named it is removed in the same
step, leaving a wait no record owns. Both deadlines, the active task, the record, and the controller
leave together, only the boundary route is enabled, and logical time advances to the fired instant
rather than to the later one. -/
theorem interruption_withdraws_both_deadlines_the_record_listed :
    (do
      let arm ← arm?
      let state ← enteredWithSecondDeadline?
      let record ← state.activityOccurrences.head?
      let fired ← record.timerHandlerOccurrences.head?
      let deadline ← state.timerWaits.find? (timerIdNamesWait fired)
      let interrupted ← interruptSequentialMultiInstance? arm state fired deadline.deadlineMs
      pure
        (state.timerWaits.map (·.deadlineMs),
          interrupted.timerWaits.length, interrupted.waits.length,
          interrupted.activityOccurrences.length,
          interrupted.sequentialMultiInstanceControllers.length,
          interrupted.tokens.map (·.placeId.value), interrupted.logicalTimeMs)) =
      some ([5000, 6000], 0, 0, 0, 0, ["place:Flow_Timer_Escalation"], 5000) := by
  decide +kernel

/-- `SMI-ENTER-01`, empty arm: no inner instance, no deadline, and the empty collection published.

Its own fact rather than a variant of the generating arm, because the profile makes it a different
transition: a zero-item collection publishes the empty output collection and follows normal control in
one step, so no controller, record, task, or deadline ever exists to be resumed. -/
def emptyEntry? : Option RuntimeState := do
  let arm ← arm?
  let state ← preEntryWith []
  enterSequentialMultiInstance? arm state

theorem empty_collection_completes_atomically_and_publishes_an_empty_collection :
    emptyEntry?.map (fun state =>
      (runtimeStateWellFormed program instanceId state,
        state.waits.length, state.timerWaits.length, state.activityOccurrences.length,
        state.sequentialMultiInstanceControllers.length,
        state.tokens.map (·.placeId.value), state.variables.process.bindings)) =
      some (true, 0, 0, 0, 0, ["place:Flow_Review_Completed"],
        [{ name := "DataObjectReference_InputItems", value := .stringList [] },
          { name := "DataObjectReference_OutputResults", value := .stringList [] }]) := by
  decide +kernel


end BpmnSemantics.SequentialMultiInstanceConformance
