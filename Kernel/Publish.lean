module

public import Kernel.Hooks

/-! # Publish

The one generic projection from runtime state to the public state observation of the
[canonical result](../contracts/schemas/canonical-result.schema.json). Owns matching on `OpenKind` with `Step`.
-/

public section

namespace Kernel.Publish

structure TaskRef where
  processInstanceId : String
  elementId : String
  activation : Nat
  deriving Repr

structure ActiveWait where
  elementId : String
  kind : String
  multiplicity : Nat
  deriving Repr

structure OpenUserTask where
  id : TaskRef
  name : Option String
  candidateGroups : List String
  formFields : List (String × String)
  deriving Repr

structure EnabledInteraction where
  kind : String
  taskId : TaskRef
  deriving Repr

structure Observation where
  instanceId : String
  status : String
  activeWaits : List ActiveWait
  openUserTasks : List OpenUserTask
  variables : List (String × Value)
  enabledInteractions : List EnabledInteraction
  logicalTimeMs : Nat
  deriving Repr

def waitKind : OpenKind → String
  | .userTask _ => "userTask"
  | .receive => "message"
  | .timer => "timer"
  | .subscription => "message"
  | .effect => "effect"
  | .incident => "incident"
  | .evaluation => "evaluation"

def statusName : InstanceStatus → String
  | .running => "running"
  | .completed => "completed"
  | .terminated => "terminated"

/-- One wait per element and kind, counting its open items, in the order the first of them opened. -/
def activeWaits (items : List OpenItem) : List ActiveWait :=
  items.foldl (fun waits item =>
    let kind := waitKind item.kind
    if waits.any (fun wait => wait.elementId == item.element.value && wait.kind == kind) then
      waits.map fun wait =>
        if wait.elementId == item.element.value && wait.kind == kind then
          { wait with multiplicity := wait.multiplicity + 1 }
        else wait
    else waits ++ [{ elementId := item.element.value, kind, multiplicity := 1 }]) []

def taskRef (state : State) (item : OpenItem) : TaskRef :=
  { processInstanceId := state.instanceId, elementId := item.element.value, activation := item.activation }

def openUserTasks (state : State) : List OpenUserTask :=
  state.openItems.filterMap fun item =>
    match item.kind with
    | .userTask detail =>
      some { id := taskRef state item, name := detail.name, candidateGroups := detail.candidateGroups,
             formFields := detail.formFields }
    | .receive => none
    | .timer => none
    | .subscription => none
    | .effect => none
    | .incident => none
    | .evaluation => none

def observe (state : State) : Observation :=
  let tasks := openUserTasks state
  { instanceId := state.instanceId
    status := statusName state.status
    activeWaits := activeWaits state.openItems
    openUserTasks := tasks
    variables := (((state.variables.find? (·.scope == State.root)).map (·.entries)).getD []).mergeSort
      fun left right => decide (left.1 ≤ right.1)
    enabledInteractions := tasks.map fun task => { kind := "completeUserTaskInstance", taskId := task.id }
    logicalTimeMs := state.logicalTimeMs }

end Kernel.Publish
