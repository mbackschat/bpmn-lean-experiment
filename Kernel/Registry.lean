module

public import Kernel.Feature.Data
public import Kernel.Feature.Decision
public import Kernel.Feature.Flow
public import Kernel.Feature.Work
public import Kernel.Feature.Compensation
public import Kernel.Feature.MultiInstance
public import Kernel.Feature.Propagation
public import Kernel.Feature.Scopes
public import Kernel.Feature.Subscriptions

/-! # Registry: the hooks record the features fill. Only `Kernel.Run` imports it. -/

public section

namespace Kernel.Registry

def hooks : Hooks :=
  { arriveStart := Feature.Subscriptions.arriveStart
    arriveActivity := Feature.Work.arriveActivity { runDecision := Feature.Decision.runDecision }
    arriveMultiInstance := Feature.MultiInstance.arriveMultiInstance
    arriveScope := Feature.Scopes.arriveScope
    arriveGateway := Feature.Flow.arriveGateway
    arriveLink := Feature.Flow.arriveLink
    arriveCatch := Feature.Subscriptions.arriveCatch
    arriveThrow := Feature.Propagation.arriveThrow
    completeScope := Feature.Scopes.completeScope
    completeCall := Feature.Work.completeCall
    completeBody := Feature.MultiInstance.completeBody
    completeUserTask := Feature.Work.completeUserTask
    effectResult := Feature.Work.effectResult
    resolveIncident := Feature.Work.resolveIncident
    triggerActivity := Feature.Work.triggerActivity
    trigger := Feature.Subscriptions.trigger
    arm := Feature.Subscriptions.arm
    armScope := Feature.Subscriptions.armScope
    armGateway := Feature.Subscriptions.armGateway
    raise := Feature.Propagation.raise
      { mappedErrorOutputs := Feature.Work.mappedErrorOutputs Feature.Data.writeOutputs
        writeCaught := fun ctx scope writes => Feature.Data.writeOutputs ctx scope writes .outward
        callOutputs := fun ctx root state => do
          let (scope, writes) ← Feature.Work.Call.raisedOutputs ctx root state
          Feature.Data.writeOutputs ctx scope writes .outward state }
    compensate := Feature.Compensation.compensate
    failCompensation := Feature.Compensation.failCompensation
    leave := Feature.Subscriptions.leave
    select := Feature.Flow.select
    writeOutputs := Feature.Data.writeOutputs
    removeVariables := Feature.Data.removeVariables
    completed := Feature.Compensation.completed
    outflow := Feature.Flow.outflow
    instanceCompleted := Feature.MultiInstance.instanceCompleted
    handlerCompleted := Feature.Compensation.handlerCompleted
    evaluate := Feature.Data.evaluate
    catches := Feature.Subscriptions.catches
    correlates := Feature.Subscriptions.correlates
    selectStart := Feature.Subscriptions.selectStart
    eventStart := Feature.Scopes.eventStart }

end Kernel.Registry
