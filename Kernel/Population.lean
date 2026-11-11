module

public import Kernel.Population.Deploy
public import Kernel.Population.Messages
public import Kernel.Step

/-! # Population

Mechanisms across process instances ([architecture](../docs/kernel/ARCHITECTURE-SPEC.md#population)). Every input
reaches an instance through `Step.step`; this layer only decides which instance an input goes to. A scenario is one
ordered list of stimuli mixing deployments, instance inputs and population commands, each at a logical time.
Implemented: deployments with versions per process key and the copies of other deployments' processes they may
carry (`deploy`), instances of possibly different deployments, each driven by its own inputs, and Message key
correlation with exact-cardinality routing ([specification](../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)): a
publication addresses one deployment and a Message channel and carries the modeled correlation criteria; the
candidates are the open subscriptions of that deployment's instances that `Hooks.correlates` accepts; exactly one is
delivered to, while zero or several reject the publication and change no instance. Candidate order never picks a
winner. Every other command form is parsed and answered `unsupported population-not-implemented`.

A refused deployment, an instance input that does not commit and a delivery a target refuses are results, never
harness errors; a candidate whose key cannot be evaluated is no match.
-/

public section

namespace Kernel.Population

/-- What a run has done so far: deployments, instances by script, command results and their ledger, input
failures. -/
structure Progress where
  registry : List Deployment := []
  deployments : List DeploymentResult := []
  instances : List (Nat × Instance) := []
  steps : List StepResult := []
  ledger : List LedgerEntry := []
  inputFailures : List (String × Failure) := []

/-- The deploy ordinals of the refused deployments, which no copy may come from. -/
def Progress.refused (progress : Progress) : List Nat :=
  progress.deployments.filterMap fun deployment =>
    match deployment.outcome with
    | .deployed => none
    | .refused _ => some deployment.deploymentId

/-- The deployment an instance input reaches: its instance's, or for a new instance its definition's latest. -/
def Progress.deploymentFor (progress : Progress) (script : Nat) (definitionRef : String) : Option Deployment :=
  match progress.instances.find? (·.1 == script) with
  | some (_, member) => some member.deployment
  | none => (progress.registry.filter (·.definitionRef == definitionRef)).getLast?

def route (hooks : Hooks) (progress : Progress) : Command → Except String (List Instance × Resolution)
  | .publish publication => publish hooks progress.registry (progress.instances.map (·.2)) publication
  | .broadcast _ | .evaluateConditions _ | .timerStart _ => pure (progress.instances.map (·.2), notImplemented)

/-- Apply one stimulus. A command sees the instances started so far. -/
def apply (hooks : Hooks) (admission : Program → Option String) (progress : Progress) : Stimulus → Except String Progress
  | .deploy definitionRef ref program atMs =>
    let (result, deployment) := deploy admission progress.registry progress.refused (progress.deployments.length + 1)
      definitionRef ref program atMs
    .ok { progress with registry := progress.registry ++ deployment.toList, deployments := progress.deployments ++ [result] }
  | .deployRefused definitionRef _ code _ =>
    .ok { progress with deployments := progress.deployments ++
      [{ deploymentId := progress.deployments.length + 1, definitionRef, versions := [], outcome := .refused code }] }
  | .input script definitionRef commandId input =>
    let failed (failure : Failure) : Progress :=
      { progress with inputFailures := progress.inputFailures ++ [(commandId, failure)] }
    match progress.deploymentFor script definitionRef with
    | none => .ok (failed (.rejected "definition-not-deployed"))
    | some deployment =>
      let before := (progress.instances.find? (·.1 == script)).map (·.2.state)
      match Step.step hooks deployment.program before input with
      | .error failure => .ok (failed failure)
      | .ok state =>
        let others := progress.instances.filter (·.1 != script)
        .ok { progress with instances := others ++ [(script, { deployment, state })] }
  | .command issued atMs digest => do
    let (instances, resolution) ← route hooks progress issued
    let result : StepResult :=
      { commandId := issued.commandId, ordinal := progress.steps.length + 1, atMs, resolution }
    let scripts := progress.instances.map (·.1)
    pure { progress with instances := scripts.zip instances, steps := progress.steps ++ [result]
                         ledger := progress.ledger ++ [{ commandId := issued.commandId, digest, result }] }

/-- Fold the stimuli in order; `admission` is the admission registry a deployment runs. -/
def runStimuli (hooks : Hooks) (admission : Program → Option String) (stimuli : List Stimulus) : Except String Result := do
  let progress ← stimuli.foldlM (apply hooks admission) ({} : Progress)
  let ids := progress.instances.map (·.2.state.instanceId)
  unless ids.eraseDups.length == ids.length do throw "instance-id-duplicate"
  pure { deployments := progress.deployments
         steps := progress.steps
         inputFailures := progress.inputFailures
         instances := (progress.instances.map (·.2)).mergeSort fun left right =>
           decide (left.state.instanceId ≤ right.state.instanceId) }

end Kernel.Population
