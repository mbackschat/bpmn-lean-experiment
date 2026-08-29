# Parallel Multi-Instance risk review scenarios

The [process](process.bpmn) performs independent security, privacy, and financial risk assessments concurrently.

- The [`all` schedule](all.scenario.json) completes the three reviews out of source-index order and proves that the published result collection still follows source order.
- The [`first` schedule](first.scenario.json) models an immediate-stop screening policy in which the first accepted result terminates the two remaining reviews.
- The [interrupted schedule](interrupted.scenario.json) completes one review, fires the shared outer `PT5S` deadline, and then submits a stale completion that must be refused.

All three scenarios are answer-free and use the standards-only [parallel Multi-Instance profile](../../profiles/bpmn-2.0.2-parallel-multi-instance-user-task-draft/README.md). Their CIB references are provenance for separate source calibration only; the scenarios select no CIB Multi-Instance target.
