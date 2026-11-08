module

public import Kernel.Feature.Data
public import Kernel.Feature.Flow
public import Kernel.Feature.Work
public import Kernel.Feature.Propagation

/-! # Registry: the hooks record the features fill. Only `Kernel.Run` imports it. -/

public section

namespace Kernel.Registry

def hooks : Hooks :=
  { startProcess := Feature.Flow.startProcess
    arriveActivity := Feature.Work.arriveActivity
    arriveGateway := Feature.Flow.arriveGateway
    arriveThrow := Feature.Propagation.arriveThrow
    completeUserTask := Feature.Work.completeUserTask
    evaluate := Feature.Data.evaluate }

end Kernel.Registry
