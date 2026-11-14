module

public import Kernel.Registry
import all Kernel.Registry

/-! # Laws of the registry

Which feature fills each field of the hooks record `Kernel.Registry` registers, so that a proof about `Step.step`,
which takes the hooks as a parameter, reaches the feature that runs. This is the one module that sees the registry's
body ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)); a field enters here when a proof
first needs it, one statement per field, never a copy of the record. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Registry

open Kernel

/-- Flow arrives at every Gateway. -/
theorem hooks_arriveGateway : Registry.hooks.arriveGateway = Feature.Flow.arriveGateway := by
  simp only [Registry.hooks]

/-- Flow queues every outgoing token. -/
theorem hooks_outflow : Registry.hooks.outflow = Feature.Flow.outflow := by
  simp only [Registry.hooks]

/-- Flow arrives at every Link. -/
theorem hooks_arriveLink : Registry.hooks.arriveLink = Feature.Flow.arriveLink := by
  simp only [Registry.hooks]

/-- Starts arrives at every start Event, with the registry's hooks for firing and payloads. -/
theorem hooks_arriveStart : Registry.hooks.arriveStart = Feature.Starts.arriveStart Registry.startsHooks := by
  simp only [Registry.hooks]

/-- Propagation arrives at every throw Event. -/
theorem hooks_arriveThrow : Registry.hooks.arriveThrow = Feature.Propagation.arriveThrow := by
  simp only [Registry.hooks]

/-- Scopes arrives at every Scope. -/
theorem hooks_arriveScope : Registry.hooks.arriveScope = Feature.Scopes.arriveScope := by
  simp only [Registry.hooks]

/-- Scopes completes every idle Scope. -/
theorem hooks_completeScope : Registry.hooks.completeScope = Feature.Scopes.completeScope := by
  simp only [Registry.hooks]

/-- No feature is told of a cancelled occurrence: the registry keeps the hook's default. -/
theorem hooks_cancelled (ctx : Ctx) (occurrence : Occurrence) (state : State) :
    Registry.hooks.cancelled ctx occurrence state = .ok state := by
  simp only [Registry.hooks]

/-- Subscriptions finds the item every delivery fires. -/
theorem hooks_delivered : Registry.hooks.delivered = Feature.Subscriptions.delivered := by
  simp only [Registry.hooks]

/-- Work completes every User Task. -/
theorem hooks_completeUserTask : Registry.hooks.completeUserTask = Feature.Work.completeUserTask := by
  simp only [Registry.hooks]

/-- Work takes every effect result. -/
theorem hooks_effectResult : Registry.hooks.effectResult = Feature.Work.effectResult := by
  simp only [Registry.hooks]

/-- Work retries every incident. -/
theorem hooks_retryIncident : Registry.hooks.retryIncident = Feature.Work.retryIncident := by
  simp only [Registry.hooks]

/-- Work cancels every incident's process. -/
theorem hooks_cancelIncidentProcess : Registry.hooks.cancelIncidentProcess = Feature.Work.cancelIncidentProcess := by
  simp only [Registry.hooks]

/-- Subscriptions disarms every completing occurrence. -/
theorem hooks_leave : Registry.hooks.leave = Feature.Subscriptions.leave := by
  simp only [Registry.hooks]

/-- Subscriptions offers every write. -/
theorem hooks_written : Registry.hooks.written = Feature.Subscriptions.offerWrites := by
  simp only [Registry.hooks]

/-- Compensation retains every completion's record. -/
theorem hooks_completed : Registry.hooks.completed = Feature.Compensation.completed := by
  simp only [Registry.hooks]

/-- Compensation runs every queued trigger. -/
theorem hooks_compensate : Registry.hooks.compensate = Feature.Compensation.compensate := by
  simp only [Registry.hooks]

/-- Compensation releases every completed handler's context. -/
theorem hooks_handlerCompleted : Registry.hooks.handlerCompleted = Feature.Compensation.handlerCompleted := by
  simp only [Registry.hooks]

/-- Compensation decides every handler left without completing. -/
theorem hooks_handlerEnded : Registry.hooks.handlerEnded = Feature.Compensation.handlerEnded := by
  simp only [Registry.hooks]

/-- Compensation fails every handler left uncaught. -/
theorem hooks_failCompensation : Registry.hooks.failCompensation = Feature.Compensation.failCompensation := by
  simp only [Registry.hooks]

/-- Subscriptions arrives at every catch Event. -/
theorem hooks_arriveCatch : Registry.hooks.arriveCatch = Feature.Subscriptions.arriveCatch := by
  simp only [Registry.hooks]

/-- Subscriptions opens every arming's boundaries. -/
theorem hooks_arm : Registry.hooks.arm = Feature.Subscriptions.arm := by
  simp only [Registry.hooks]

/-- Subscriptions opens every scope's Event Sub-Process starts. -/
theorem hooks_armScope : Registry.hooks.armScope = Feature.Subscriptions.armScope := by
  simp only [Registry.hooks]

/-- Subscriptions opens every Event-Based Gateway's arms. -/
theorem hooks_armGateway : Registry.hooks.armGateway = Feature.Subscriptions.armGateway := by
  simp only [Registry.hooks]

/-- Work answers every delivery to an Activity. -/
theorem hooks_triggerActivity : Registry.hooks.triggerActivity = Feature.Work.triggerActivity Registry.workHooks := by
  simp only [Registry.hooks]

/-- Subscriptions fires every other item. -/
theorem hooks_trigger : Registry.hooks.trigger = Feature.Subscriptions.trigger Registry.subscriptionsHooks := by
  simp only [Registry.hooks]

/-- Work returns from every called instance. -/
theorem hooks_completeCall : Registry.hooks.completeCall = Feature.Work.completeCall := by
  simp only [Registry.hooks]

/-- Multi-Instance completes every idle body. -/
theorem hooks_completeBody : Registry.hooks.completeBody = Feature.MultiInstance.completeBody := by
  simp only [Registry.hooks]

/-- Work takes every Activity that arrives, with the registry's decision runner. -/
theorem hooks_arriveActivity : Registry.hooks.arriveActivity = Feature.Work.arriveActivity Registry.workHooks := by
  simp only [Registry.hooks]

/-- Multi-Instance enters every body that arrives. -/
theorem hooks_arriveMultiInstance : Registry.hooks.arriveMultiInstance = Feature.MultiInstance.arriveMultiInstance := by
  simp only [Registry.hooks]

/-- Multi-Instance records every instance's completion. -/
theorem hooks_instanceCompleted : Registry.hooks.instanceCompleted = Feature.MultiInstance.instanceCompleted := by
  simp only [Registry.hooks]

/-- Data applies every write. -/
theorem hooks_writeOutputs : Registry.hooks.writeOutputs = Feature.Data.writeOutputs := by
  simp only [Registry.hooks]

/-- Data removes every variable. -/
theorem hooks_removeVariables : Registry.hooks.removeVariables = Feature.Data.removeVariables := by
  simp only [Registry.hooks]

end Kernel.Laws.Registry
