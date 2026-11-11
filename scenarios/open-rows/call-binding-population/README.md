# Call binding across deployments

Kernel-only population witnesses of PC-SCOPE-03's program assembly: a deployment carries a renamed copy of each other deployment's process its Calls name, and publication and addressing still use the identifiers the callee's author wrote.

- [Copied callee boundary](copied-callee-boundary.population-scenario.json) deploys the [assessment](assessment.bpmn) as deployment 1 and the [intake](intake.bpmn), whose Call names `assessment:AssessClaim` in the assessment's namespace, as deployment 2. The intake's program carries the assessment's process as a copy whose element and boundary identifiers are renamed for deployment 1. The schedule starts a claim and fires the timer boundary *Review overdue* of the called instance's *Review the claim* by its authored identifier.

No expected result appears in target input; the CIB runner's population mode will compare them once it exists.
