# CIB Seven oracle runner

This Java 21 module executes selected scenarios against pinned CIB Seven releases and projects public engine observations into the project's canonical evidence format. It is calibration and compatibility infrastructure, not a reusable BPMN semantic kernel.

## What you can do

Run the retained CIB oracle cases, inspect bounded source-grounded probes, and explicitly replace content-bound evidence after review. The runner deploys exact BPMN resources, uses public engine services, reports diagnostics separately from canonical results, and removes scenario-owned engine state after each run.

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
- [Testing specification](../../docs/TESTING-SPEC.md) owns oracle, evidence-replacement, and differential gates.
- [`implementation-status-owner:ASSURANCE-ADOPTION`](../../docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) records exact current CIB profile and evidence coverage.
