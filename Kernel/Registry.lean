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
public import Kernel.Feature.Subscriptions.Delivery
public import Kernel.Feature.Starts
public import Kernel.Feature.Correlation

/-! # Registry: the hooks record the features fill. Only `Kernel.Run` imports it. -/

public section

namespace Kernel.Registry

/-- What Work reaches of its sub-features: Decision's tables, Correlation's API criteria and a Message payload's
bindings. -/
def workHooks : Feature.Work.WorkHooks :=
  { runDecision := Feature.Decision.runDecision, criteriaHold := Feature.Correlation.criteriaHold
    payloadBindings := Feature.Subscriptions.payloadBindings }

/-- What Starts reaches of Subscriptions: whether a trigger fires a start, and a Message payload's bindings. -/
def startsHooks : Feature.Starts.StartsHooks :=
  { fires := Feature.Subscriptions.fires, payloadBindings := Feature.Subscriptions.payloadBindings }

/-- What Subscriptions reaches of Correlation: the recheck of a Message firing's correlation. -/
def subscriptionsHooks : Feature.Subscriptions.SubscriptionsHooks :=
  { correlationAccepts := Feature.Correlation.correlationAccepts }

def hooks : Hooks :=
  { arriveStart := Feature.Starts.arriveStart startsHooks
    arriveActivity := Feature.Work.arriveActivity workHooks
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
    retryIncident := Feature.Work.retryIncident
    cancelIncidentProcess := Feature.Work.cancelIncidentProcess
    triggerActivity := Feature.Work.triggerActivity workHooks
    trigger := Feature.Subscriptions.trigger subscriptionsHooks
    arm := Feature.Subscriptions.arm
    armScope := Feature.Subscriptions.armScope
    armGateway := Feature.Subscriptions.armGateway
    raise := Feature.Propagation.raise
      { mappedErrorOutputs := Feature.Work.mappedErrorOutputs Feature.Data.writeOutputs
        writeCaught := fun ctx scope writes => Feature.Data.writeOutputs ctx scope writes .outward
        callOutputs := fun ctx root state => do
          let (scope, writes) ← Feature.Work.Call.raisedOutputs ctx root state
          Feature.Data.writeOutputs ctx scope writes .outward state
        dropRuns := Feature.Compensation.dropWithin }
    compensate := Feature.Compensation.compensate
    failCompensation := Feature.Compensation.failCompensation
    leave := Feature.Subscriptions.leave
    written := Feature.Subscriptions.offerWrites
    select := Feature.Flow.select
    writeOutputs := Feature.Data.writeOutputs
    removeVariables := Feature.Data.removeVariables
    completed := Feature.Compensation.completed
    outflow := Feature.Flow.outflow
    instanceCompleted := Feature.MultiInstance.instanceCompleted
    handlerCompleted := Feature.Compensation.handlerCompleted
    handlerEnded := Feature.Compensation.handlerEnded
    evaluate := Feature.Data.evaluate
    catches := Feature.Subscriptions.catches
    competes := Feature.Subscriptions.competes
    correlates := Feature.Correlation.correlates
    startsFired := Feature.Starts.startsFired startsHooks
    delivered := Feature.Subscriptions.delivered
    eventStart := Feature.Scopes.eventStart }

end Kernel.Registry
