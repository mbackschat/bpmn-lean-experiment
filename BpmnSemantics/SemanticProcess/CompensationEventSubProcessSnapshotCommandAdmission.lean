import BpmnSemantics.SemanticProcess.CommandAdmission
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot

/-! # Compensation Event Sub-Process snapshot command admission

This focused lane validates the optional hidden snapshot state once per command and stages root
reservation after ordinary start admission but before internal closure. Keeping it outside the base
command owner prevents declaration-free kernel fixtures from importing and reducing the complete
snapshot runtime account.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Carry a pre-start root reservation into the independently constructed running state.

The reservation is decided against the submitted not-started state because start mutation must not
precede capacity refusal. The running-state builder remains the authority for every other field. -/
def reserveRootCompensationParentContextBeforeStart (program : Program)
    (before started : RuntimeState) : CompensationParentContextResult :=
  match program.compensationEventSubProcessSnapshots with
  | none =>
      if before.compensationParentContextRetentions.isEmpty then .disabled started
      else .refused .invalidState before
  | some _ =>
      match started.scopeOccurrences.filter fun occurrence => occurrence.parent.isNone with
      | [root] =>
          match reserveCompensationParentContext program before root with
          | .disabled _ => .disabled started
          | .applied reserved =>
              .applied
                { started with
                  compensationParentContextRetentions :=
                    reserved.compensationParentContextRetentions }
          | .refused reason _ => .refused reason before
      | _ => .refused .invalidState before

/-- A declaration-free Program preserves the original start state exactly when no hidden snapshot
state has been injected. This is both the byte-compatibility rule and the fast path that keeps old
kernel-decided fixtures out of the snapshot validator. -/
theorem reserveRootCompensationParentContextBeforeStart_withoutDeclaration
    (program : Program) (before started : RuntimeState)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (empty : before.compensationParentContextRetentions = []) :
    reserveRootCompensationParentContextBeforeStart program before started =
      .disabled started := by
  simp [reserveRootCompensationParentContextBeforeStart, absent, empty]

private def prepareStartedSnapshotState (program : Program) (before : RuntimeState)
    (admission : ExternalAdmission) : ExternalAdmission :=
  match admission.outcome with
  | .committed =>
      match reserveRootCompensationParentContextBeforeStart program before admission.state with
      | .disabled successor | .applied successor =>
          { outcome := .committed, state := successor }
      | .refused _ _ => { outcome := .rejected, state := before }
  | .rolledBack | .rejected | .semanticFailure | .unsupported => admission

/-- Admit one command through the snapshot state gate and pre-mutation root reservation. -/
def admitStimulusWithCompensationSnapshots (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) : ExternalAdmission :=
  match program.compensationEventSubProcessSnapshots with
  | none => admitStimulus program state stimulus
  | some _ =>
      if !compensationEventSubProcessSnapshotStateValid program state then
        { outcome := .rejected, state }
      else
        let admission := admitStimulus program state stimulus
        match stimulus with
        | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart .. =>
            prepareStartedSnapshotState program state admission
        | .completeUserTaskInstance .. | .deliverMessage .. | .deliverPayloadMessage ..
        | .deliverCorrelatedPayloadMessage .. | .fireTimer .. | .completeEffect ..
        | .reportEffectFailure .. | .retryIncident .. | .cancelIncidentProcess .. => admission

/-- Declaration-free Programs retain the exact base admission function. -/
theorem admitStimulusWithCompensationSnapshots_withoutDeclaration
    (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    admitStimulusWithCompensationSnapshots program state stimulus =
      admitStimulus program state stimulus := by
  simp [admitStimulusWithCompensationSnapshots, absent]

end BpmnSemantics.SemanticProcess
