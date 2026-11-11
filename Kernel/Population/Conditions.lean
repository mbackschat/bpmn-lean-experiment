module

public import Kernel.Population.Signals

/-! # Population: Conditional start evaluations

An `evaluateConditions` command evaluates every Conditional root start in scope over the submitted variables and starts
an instance at each start that holds, each start its own unit of commitment (PC-CONDITION-02, CIB-EXT-0044,
[specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
-/

public section

namespace Kernel.Population

/-- The Conditional root starts of the deployments in scope, each with its public identifier: those of the selected
deployment, or of each key's current deployment (CIB-INT-0031); deployments in deploy order, starts in document order
(docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#conditional-start-evaluations). -/
def conditionalStarts (registry : List Deployment) (scope : Option Deployment) : List (Deployment × Header × String) :=
  (scope.map ([·])).getD (currentDeployments registry) |>.flatMap fun deployment =>
    ((deployment.program.children none).filterMap Element.start?).filterMap fun (header, start) =>
      (start.subscription.bind (·.trigger.condition?)).map fun _ =>
        (deployment, header, (deployment.program.publicId header.id).value)

/-- Whether the Conditional root start `input` names in `program` holds, or the failure of its predicate: the start
step's own predicate (`Hooks.startsFired`) over the start's own input, so a caller passes the exact input it then starts
the instance with, its identity, business key, logical time and submitted variables alone included (CIB-EXT-0044). -/
def conditionalStartVerdict (hooks : Hooks) (program : Program) (input : StartInput) : Except Failure Bool :=
  match hooks.startsFired (Step.context hooks program) input with
  | .ok [] => .ok false
  | .ok (_ :: _) => .ok true
  | .error failure => .error failure

/-- Reach the Conditional root start `receiver` names for `evaluation` at `atMs`: a start whose predicate does not hold
records nothing, one whose predicate fails its `failed` entry, and one that holds starts its instance with the business
key and every submitted variable and records the start's entry. The predicate is asked first
(`conditionalStartVerdict`), so a false start is never read off a refused start step. -/
def evaluateStart (hooks : Hooks) (registry : List Deployment) (evaluation : ConditionEvaluation) (atMs : Nat)
    (instances : List Instance) : Receiver → Except String Reached
  | .start deploymentId publicStart => do
    let (deployment, header) ← rootStart registry deploymentId publicStart
    let input : StartInput :=
      { instanceId := startedInstanceId evaluation.commandId deploymentId publicStart
        startEvent := some header.id, variables := evaluation.variables, trigger := .condition
        businessKey := evaluation.businessKey, atMs := some atMs }
    match conditionalStartVerdict hooks deployment.program input with
    | .ok false => pure (instances, none, none)
    | .ok true =>
      let (started, entry) ← startInstance hooks deployment publicStart input
      pure (instances ++ started.toList, some entry, started.map fun member => (member.state, deployment.program))
    | .error failure => pure (instances, some (.failed (.start deploymentId publicStart) failure), none)
  -- An evaluation's fan-out names only Conditional starts itself, so an occurrence here is a harness defect.
  | .occurrence _ => throw "conditional-receiver-without-start"

/-- Evaluate the Conditional root starts in scope at `atMs` (PC-CONDITION-02): each that holds starts one instance,
each start its own unit of commitment, so a failing start leaves every other start's instance in place (CIB starts all
or none, CIB-INT-0033). Every start takes one of the fan-out's receivers, held or not, and the intents a started
instance's step left cascade before the next start. The answer is the fan-out of the starts that held or failed and of their cascades, in order,
and `fanOut []` when none held. A selector naming no registered deployment is `rejected definition-not-deployed`, a
scope without a Conditional start `rejected no-conditional-start` and an `order` naming other starts
`rejected discovery-order-mismatch`. -/
def evaluateConditions (hooks : Hooks) (registry : List Deployment) (instances : List Instance) (atMs : Nat)
    (evaluation : ConditionEvaluation) : Except String (List Instance × Resolution) := do
  let some scope := selected registry evaluation.definition | return (instances, .rejected "definition-not-deployed")
  let starts := conditionalStarts registry scope
  if starts.isEmpty then return (instances, .rejected "no-conditional-start")
  let some ordered := inOrder (fun (deployment, _, start) => .start deployment.deploymentId start) starts evaluation.order
    | return (instances, .rejected "discovery-order-mismatch")
  let root := ordered.map fun (deployment, _, start) => .receiver none (.start deployment.deploymentId start)
  let fanning ← fanOut hooks registry atMs (evaluateStart hooks registry evaluation atMs) pendingFuel
    { instances, machine := fanOutBegin evaluation.commandId root cascadeBound }
  pure (fanning.instances, .fanOut fanning.entries)

end Kernel.Population
