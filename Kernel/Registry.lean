module

public import Kernel.Feature.Data
public import Kernel.Feature.Flow
public import Kernel.Feature.Work
public import Kernel.Feature.Propagation
public import Kernel.Feature.Scopes
public import Kernel.Feature.Subscriptions

/-! # Registry: the hooks record the features fill. Only `Kernel.Run` imports it. -/

public section

namespace Kernel.Registry

def hooks : Hooks :=
  { startProcess := Feature.Flow.startProcess
    arriveActivity := Feature.Work.arriveActivity
    arriveGateway := Feature.Flow.arriveGateway
    arriveLink := Feature.Flow.arriveLink
    arriveCatch := Feature.Subscriptions.arriveCatch
    trigger := Feature.Subscriptions.trigger
    arm := Feature.Subscriptions.arm
    armGateway := Feature.Subscriptions.armGateway
    catches := Feature.Subscriptions.catches
    arriveScope := Feature.Scopes.arriveScope
    arriveThrow := Feature.Propagation.arriveThrow
    completeScope := Feature.Scopes.completeScope
    raise := Feature.Propagation.raise
    startEventSubProcess := Feature.Scopes.startEventSubProcess
    eventStart := Feature.Scopes.eventStart
    armScope := Feature.Subscriptions.armScope
    completeUserTask := Feature.Work.completeUserTask
    effectResult := Feature.Work.effectResult
    triggerActivity := Feature.Work.triggerActivity
    evaluate := Feature.Data.evaluate }

end Kernel.Registry
