module

public import Kernel.Population.Messages

/-! # Population: Timer starts

A Timer-start occurrence named by its due instant and fired at a command's logical time (PC-TIMER-04): the schedule's
origin and due instants are population semantics, so a host asks this check rather than reimplementing it
([specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
-/

public section

namespace Kernel.Population

/-- The identity of the instance a Timer-start occurrence starts
(docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#timer-starts): bound to the occurrence, not to a command, so one
occurrence can never start two instances under any firing time or command identity. -/
def timerInstanceId (deploymentId : Nat) (startEvent : String) (dueMs : Nat) : String :=
  let deployment := toString deploymentId
  s!"timer:{deployment.utf8ByteSize}:{deployment}:{startEvent.utf8ByteSize}:{startEvent}:{dueMs}"

/-- Whether an occurrence of a start resolved as `resolved`, deployed at `originMs`, may fire at `atMs`: `dueMs` must be
one of its due instants (`timer-occurrence-unknown`) and the firing not before it (`timer-not-due`). -/
def timerFiring (originMs dueMs atMs : Nat) (resolved : Timer.Resolved) : Option String :=
  if !Timer.occurs originMs dueMs resolved then some "timer-occurrence-unknown"
  else if atMs < dueMs then some "timer-not-due"
  else none

/-- A single-instance Timer start is the degenerate population: one deployment at 0, its occurrence named by the
trigger's time and fired on time (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#timer-starts, PC-TIMER-04). The
start `named`, else the sole Timer start, is checked; any other start is left to the step. -/
def onTimeRefusal (program : Program) (named : Option ElementId) (dueMs : Nat) : Option String :=
  match (timerStarts program).filter fun (header, _) => named.all (· == header.id) with
  | [(_, resolved)] => timerFiring 0 dueMs dueMs resolved
  | _ => none

/-- Whether the occurrence `dueMs` of the root Timer start `startEvent` of `deploymentId` may fire at `atMs`, over the
registered deployments' summaries; `consumed` is whether it already started an instance. The deployment must be
registered (`definition-not-deployed`), `startEvent` one of its root Timer starts (`no-start-event`), the occurrence due
(`timerFiring`), the deployment still current for its key, as CIB deletes every Timer-start job of a key it redeploys
(`timer-start-superseded`, `BpmnDeployer.java:251-258`), and the occurrence unconsumed
(`timer-start-occurrence-consumed`). -/
def timerStartCheck (registry : List DeploymentSummary) (deploymentId : Nat) (startEvent : String) (dueMs atMs : Nat)
    (consumed : Bool) : Option String :=
  match registry.find? (·.deploymentId == deploymentId) with
  | none => some "definition-not-deployed"
  | some deployment =>
    match deployment.timerStarts.find? (·.1 == startEvent) with
    | none => some "no-start-event"
    | some (_, resolved) =>
      let superseded := (currentSummary registry deployment.key).all (·.deploymentId != deploymentId)
      timerFiring deployment.deployedAtMs dueMs atMs resolved <|>
        (if superseded then some "timer-start-superseded" else none) <|>
        (if consumed then some "timer-start-occurrence-consumed" else none)

/-- Fire a Timer-start occurrence at `atMs` (PC-TIMER-04, CIB-INT-0029, CIB-INT-0031) unless `timerStartCheck` refuses
it. The instance takes the firing time; a committed start consumes the occurrence. -/
def timerStart (hooks : Hooks) (registry : List Deployment) (instances : List Instance)
    (consumed : List TimerOccurrence) (atMs : Nat) (fired : TimerStart) :
    Except String (List Instance × List TimerOccurrence × Resolution) := do
  let spent := consumed.any fun occurrence => occurrence.deploymentId == fired.deploymentId &&
    occurrence.startEvent == fired.startEvent && occurrence.dueMs == fired.dueMs
  let refusal := timerStartCheck (registry.map (·.summary)) fired.deploymentId fired.startEvent fired.dueMs atMs spent
  if let some code := refusal then return (instances, consumed, .rejected code)
  let some deployment := registry.find? (·.deploymentId == fired.deploymentId) | throw "timer-start-without-deployment"
  let program := deployment.program
  let reached (start : Header × Timer.Resolved) : Bool := (program.publicId start.1.id).value == fired.startEvent
  let some (header, _) := (timerStarts program).find? reached | throw "timer-start-without-start"
  let instanceId := timerInstanceId fired.deploymentId fired.startEvent fired.dueMs
  let (started, entry) ← startInstance hooks deployment fired.startEvent
    { instanceId, startEvent := some header.id, trigger := .timer atMs, atMs := some atMs }
  let occurrence : TimerOccurrence :=
    { deploymentId := fired.deploymentId, startEvent := fired.startEvent, dueMs := fired.dueMs }
  pure (instances ++ started.toList, consumed ++ (started.map fun _ => occurrence).toList, .fanOut [entry])

end Kernel.Population
