# CIB Seven oracle runner

This Java 21 module executes selected scenarios against pinned CIB Seven releases and projects public engine observations into the project's canonical evidence format. It is calibration and compatibility infrastructure, not a reusable BPMN semantic kernel.

## What you can do

Run the retained CIB oracle cases, inspect bounded source-grounded probes, and explicitly replace content-bound evidence after review. The runner deploys exact BPMN resources, uses public engine services, reports diagnostics separately from canonical results, and removes scenario-owned engine state after each run.

The same JSON-lines boundary also runs population scenarios (`kind: populationScenario`): several deployments at logical times, instance steps and population commands, answered with a `cibSevenPopulationResult` that keeps the kernel's population result within CIB's observation boundary.

A population run names every root instance by the identity the scenario gives it or the [population semantics](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md) derive for it; an instance it cannot name fails the run as a harness failure rather than being observed under a guessed identity. Runner limitations of that mapping:

- CIB records no link from an instance a thrown Signal started to the throw, so the emitter is the one throw of that Signal the step began; a step with several throws of it, or a broadcast whose receiver rethrows the broadcast's own Signal, cannot be named.
- An emitter's activation is its position in CIB's occurrence order, which does not cover a throw inside concurrent Multi-Instance instances, and an emitter in a called instance that ended inside the step has no public identifier left.
- A publication carrying a definition selector outside start-only mode has no CIB form (CIB-INT-0032).

## Quick start

Run the complete pinned oracle gate:

```sh
./scripts/test-cibseven-oracle.sh
```

The script uses Java 21 and the repository Maven wrapper. `BPMN_JAVA_HOME`, `BPMN_MAVEN_SETTINGS`, and `BPMN_MAVEN_REPO_LOCAL` override the Java installation, Maven settings, and isolated artifact cache.

Ordinary verification never rewrites retained evidence. Use `./scripts/pnpm.sh run replace:cib-evidence` only for the explicit verifier-checked replacement operation.

## Learn more

- [Source map](SOURCE-MAP.md) maps the runner, projectors, protocols, probes, and replacement tool to their source owners.
- [CIB Seven BPMN relation register](../../docs/CIB-BPMN-RELATION-REGISTER.md) owns every selected compatibility relationship and candidate deviation.
- [Reference instrumentation policy](../../docs/REFERENCE-INSTRUMENTATION-POLICY.md) owns the boundary between public observation, diagnostics, and experimental instrumentation.
- The [engineering rules](../../docs/kernel/ENGINEERING-POLICY.md#contracts-and-evidence) own oracle, evidence-replacement, and differential gates.
- The [kernel status map](../../docs/kernel/KERNEL-STATUS-MAP.md#assurance-and-adoption) records current CIB evidence coverage.
