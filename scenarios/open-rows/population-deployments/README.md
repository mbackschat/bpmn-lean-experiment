# Deployments of a population

Answer-free population schedules for how [`Population.deploy`](../../../Kernel/Population.lean) numbers versions and decides which copies of other deployments' processes a program keeps ([population contract](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#deployments), PC-SCOPE-03). The profile is `bpmn-2.0.2` with no source overlay. All three documents share one `targetNamespace`, so the caller's unprefixed `calledElement` names `Process_Callee` in it.

## Models

| Model | What it holds |
|---|---|
| [callee](callee.bpmn) | `Process_Callee`: a None start, the User Task *Check the order*, an end. |
| [callee-refused](callee-refused.bpmn) | `Process_Callee` again, started by a Conditional start, which the standards profile refuses (`start.condition`). |
| [caller](caller.bpmn) | `Process_Caller`: a None start, a Call Activity naming `Process_Callee` with the default `latest` binding, an end. |

## Population schedules

| Schedule | Steps |
|---|---|
| [refused-callee-between](refused-callee-between.population-scenario.json) | Deploy callee at 0, callee-refused at 10 and caller at 20, then start the caller at 30. The refused deployment registers no version, and the copy of its process is removed from the caller's program, so the Call can bind only the callee's version 1. |

The schedules carry no expected deployment, instance, task or variable. CIB Seven `2.2.0` does not refuse the second deployment: it deploys the Conditional start, which it executes as an extension ([CIB-EXT-0044](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0044--cib-evaluates-a-root-conditional-start-over-the-variables-a-request-submits)), registers it as `Process_Callee` version 2, and its Call binds that version. The retained CIB answer therefore observes no refused deployment; only the kernel's side of this schedule exercises one.
