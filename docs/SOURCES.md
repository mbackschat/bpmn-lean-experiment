# Sources

This document owns source provenance and read-only navigation. Reference checkouts are not project dependencies and must not be modified from this repository.

## OMG BPMN 2.0.2

The normative standard source is OMG **Business Process Model and Notation, Version 2.0.2**, January 2014, document `formal/13-12-09`. The official specification catalog and machine-readable catalog are:

- `https://www.omg.org/spec/BPMN/2.0.2`
- `https://www.omg.org/spec/BPMN/machine-readable`
- `https://issues.omg.org/issues/spec/BPMN/2.0.2`

The downloaded PDF, digital-first Markdown conversion, figures, and normative CMOF/XSD/XSLT files are described in the local [BPMN 2.0.2 reference corpus](reference/bpmn-2.0.2/README.md). They are Git-ignored because the full Markdown is a modified copy of the copyrighted standard; the tracked [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md) is an original project digest.

## Architecture handoff

The project-local [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) preserves the supplied content with trailing Markdown whitespace normalized and is the primary requirements source for this experiment.

The handoff reports an investigation of CIB Seven source revision `5a45b47ea22688d774de97277c3ff7013f54fdd2` (`2.3.0-SNAPSHOT`) while its embedded prototype executed published CIB Seven `2.2.0`, Java 17, and H2 `2.3.232`. This mismatch is architectural evidence only; it must not become one merged semantic profile.

## CIB Seven

Read-only checkout: [cibseven/cibseven](../../oss/cibseven/cibseven/README.md)

- Remote: `https://github.com/cibseven/cibseven.git`
- Checked-out revision: `5a45b47ea22688d774de97277c3ff7013f54fdd2`
- Published `v2.2.0` tag revision: `834a9874760de8a0107f7c1b32806e37f17fb017`
- Inherited baseline: Camunda `7.22.0` at `1727de82ed7b655ade4f84fe70eff7b52e81a5ca`
- Role: complete executable behavioral oracle source and diagnostic reference, never a semantic-core dependency

The checked-out `main` revision exactly matches the source revision named by the handoff.

The core BPMN Java and resource trees, and the BPMN model-API Java and resource trees, are byte-identical between CIB Seven `v2.2.0` and the investigated `main` revision. The initial executable oracle can therefore use the published release without losing any core BPMN test evidence found on `main`.

| Test tree | Git tree identity |
|---|---|
| Core BPMN Java tests | `bda480226e6537d97d656395cfa3ed056c37f351` |
| Core BPMN resource fixtures | `ac70d17dce2e5e26878e8b6dc7f43bfc48caabfb` |
| BPMN model-API Java tests | `e171ab57b80291bd1225ed8efbb700befd38c231` |
| BPMN model-API resource fixtures | `e03b50769d00a6ca559179ab5e99a66c7d5e5cba` |

The core execution corpus at both revisions contains 261 Java files, 1,808 explicit `@Test` methods, and 1,144 paired BPMN fixtures under `engine/src/test/.../bpmn`. The entire engine test resource tree contains 1,947 BPMN models. Most of this evidence is inherited from Camunda 7.22; the CIB fork adds only one core BPMN test class and five net engine fixtures relative to that baseline.

CIB’s [implemented-standards page](https://docs.cibseven.org/manual/latest/introduction/implemented-standards/) claims support for BPMN 2.0, while its [BPMN implementation reference](https://docs.cibseven.org/manual/latest/reference/bpmn20/) documents product coverage. Neither the repository nor the documentation declares BPMN 2.0.2 Process Execution Conformance, an OMG certificate, or passage of an OMG execution TCK. Its executable corpus is the compatibility oracle for a pinned CIB profile, not proof of the independent standards claim.

## Temporal TypeScript SDK

Read-only checkout: [temporalio/sdk-typescript](../../oss/temporal/sdk-typescript/README.md)

- Remote: `https://github.com/temporalio/sdk-typescript.git`
- Inspected revision: `2595d1b62cf5c3ff1748df0df2f9b303902bb31c`
- Role: authoritative implementation reference for TypeScript Workflow replay, timers, Activities, cancellation, delivery, and SDK boundaries

This revision is a development reference, not yet a project dependency or profile pin.

## Temporal TypeScript samples

Read-only checkout: [temporalio/samples-typescript](../../oss/temporal/samples-typescript/README.md)

- Remote: `https://github.com/temporalio/samples-typescript.git`
- Inspected revision: `fb0aa23d75394a132646de883842dfacdacd5aa0`
- Role: concrete Workflow, Activity, signal, update, timer, cancellation, testing, and replay-pattern research

The samples can inform adapter mechanics but cannot define BPMN behavior.

## BPMN XML/metamodel reference

Read-only checkout: [bpmn-io/bpmn-moddle](../../oss/bpmn-io/bpmn-moddle/README.md)

- Remote: `https://github.com/bpmn-io/bpmn-moddle.git`
- Inspected revision: `47d8f75eed773829f20537adbb7086b290096006`
- Role: independent research reference for parsing, serializing, and representing BPMN 2.0 XML and its metamodel in JavaScript

This project may teach ingestion techniques but is neither a normative semantic authority nor an adopted dependency.

## BPMN MIWG interchange corpus

Read-only checkout: [bpmn-miwg-test-suite](../../oss/bpmn-miwg/bpmn-miwg-test-suite/README.md)

- Remote: `https://github.com/bpmn-miwg/bpmn-miwg-test-suite.git`
- Checked-out revision: `cb2629519cee6280ab521f99dc46a9815a221a35`
- Role: OMG working-group BPMN XML import, export, round-trip, and cross-tool reference models
- License: Creative Commons Attribution 3.0 Unported

This suite can support ingestion and interchange qualification. It is not an execution-semantics oracle.

The suite should be reused at three boundaries:

1. Validate that the XML front end accepts the published reference models and resolves their namespaces and references without inventing execution meaning.
2. If export is implemented, compare normalized import/export/import models while preserving allowed extension and diagram-interchange data.
3. Record tool-specific fixtures as interoperability evidence, separately from semantic execution cases.

Passing these models demonstrates interchange coverage only. It does not establish token semantics, Activity lifecycle behavior, CIB compatibility, or Temporal refinement.

At the pinned revision, `Reference/` contains 21 BPMN models and 25 reference images. `test-case-structure.json`, `BPMN 2.0 Attribute Coverage Matrix.xlsx`, and submitted vendor round-trip results provide additional interchange inputs.

## Betsy cross-engine execution benchmark

Read-only checkout: [uniba-dsg/betsy](../../oss/uniba-dsg/betsy/README.md)

- Remote: `https://github.com/uniba-dsg/betsy.git`
- Checked-out revision: `fd402415665e914ba7e4d9948de66c4156f08bab`
- Last release: `2.1.0`, September 2015
- Role: historical black-box BPMN execution cases and cross-engine observation strategy
- License: LGPL-3.0

Betsy groups executable cases into gateways, Activities, errors, Events, basics, data, patterns, and minimal cases, and it automates deployments and observations against old Camunda, Activiti, and jBPM releases. Its models can seed modern separating examples, but its installers and engine transforms are obsolete, its supported engines predate current CIB Seven, and it is not an OMG-issued TCK. Adopt only independently reviewed cases with recorded provenance.

## Other engine evidence

The public evidence pattern across Camunda 7, Camunda 8, Flowable, Activiti, jBPM, and Kogito is a product coverage matrix plus product-specific regression suites. No maintained OMG-issued BPMN Process Execution TCK or public execution-conformance certificate was found.

- Camunda 7’s [`7.24` BPMN implementation reference](https://docs.camunda.org/manual/7.24/reference/bpmn20/) is a coverage map, and its core BPMN package has 261 Java files and 1,144 paired BPMN models. This is the direct lineage of nearly all CIB evidence.
- Activiti exposes named project “conformance” test sets, but they assert Activiti APIs and runtime events rather than OMG conformance points.
- Flowable, jBPM, Kogito, and Camunda 8 publish substantial execution suites while also documenting subsets, deviations, or separate profiles.

These engines are useful for discovering ambiguity and constructing hostile separating cases. They cannot vote on the standard, override the pinned CIB oracle, or substitute for the Lean and Temporal assurance lanes. Additional large checkouts are deferred until a requirement needs one that CIB, MIWG, or Betsy does not already supply.

## Lean sibling experiment

Read-only checkout: [a12-kernel-lean](../../oss/a12/a12-kernel-lean/README.md)

- Inspected revision: `6f9bbf64489c3eee9ffebf72b70116f7e02e36b5`
- Role: precedent for a pinned dependency-free Lean toolchain, executable-first semantic capsules, proof/evidence separation, documentation ownership, honest claim boundaries, and shared `CLAUDE.md`/`AGENTS.md` guidance

This project adopts those working conventions where they fit, but it does not copy A12 domain semantics, evidence, or project-specific governance.
