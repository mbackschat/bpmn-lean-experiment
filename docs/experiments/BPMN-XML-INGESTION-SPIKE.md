# BPMN XML ingestion spike

## Question and accounts

Can the published `bpmn-moddle@10.0.0` package provide the first structural BPMN ingestion boundary without becoming the source of record or losing distinctions that the semantic pipeline needs?

The separating accounts were:

1. **graph-is-source:** the imported moddle object graph and its serializer are sufficiently preserving to become the canonical source model;
2. **bytes-plus-derived-view:** exact original bytes and hash remain canonical, while the moddle graph is a derived structural view whose warnings and losses affect admission.

The spike supports account 2 and rejects account 1.

## Scope and provenance

The probe used the exact published [`bpmn-moddle@10.0.0`](https://www.npmjs.com/package/bpmn-moddle) tarball with integrity `sha512-vXePD5jkatcILmM3zwJG/m6IIHIghTGB7WvgcdEraEw8E8VdJHrTgrvBUhbzqaXJpnsGQz15QS936xeBY6l9aA==`. Its self-contained published UMD bundle was loaded read-only from a temporary directory, so the project dependency graph and lockfile were not changed.

Inputs were the project-authored [Milestone 0 BPMN fixture](../../scenarios/m0-sequential-user-task/process.bpmn), all 21 reference models from the pinned BPMN MIWG checkout at `cb2629519cee6280ab521f99dc46a9815a221a35`, one upstream invalid-reference fixture, and three project-authored in-memory DOCTYPE/entity witnesses.

This is interchange and parser evidence only. It does not establish schema validity, executable admission, BPMN behavior, CIB compatibility, Temporal refinement, or conformance.

The exact `v10.0.0` source tag’s four BPMN/DD CMOF inputs were compared with the official local BPMN 2.0.2 artifacts using XML canonicalization and were identical. The five XSD files shipped in the published package were identical to the official local XSD files after CRLF normalization. This establishes input-resource alignment, not correctness of every generated descriptor or runtime import behavior.

## Executed probes

The temporary probe performed:

- import of the Milestone 0 fixture;
- export and re-import of that fixture;
- import, export, and re-import of every MIWG reference model;
- comparison of sorted `$type:id` projections across each round trip;
- capture of all import and re-import warning messages;
- a warning-object shape inspection;
- bare DOCTYPE, internal-entity, and external-entity probes;
- CMOF canonical comparison and XSD newline-normalized comparison against the official BPMN 2.0.2 machine-readable corpus.

The implementation used the public shape:

```javascript
const moddle = new BpmnModdle();
const imported = await moddle.fromXML(xml);
const { xml: serialized } = await moddle.toXML(imported.rootElement);
const reparsed = await moddle.fromXML(serialized);
```

No retained executable was added because the candidate dependency is not approved. If approved, the package tests listed in [the proposed decision](../BPMN-XML-INGESTION-DECISION.md#first-implementation-slice-after-approval) replace this one-off probe with a project-owned gate.

## Results

### Milestone 0 fixture

The fixture imported with no warnings. The definitions, Process, Start Event, User Task, End Event, and two Sequence Flows retained their IDs and BPMN types after export and re-import.

The original input was 1,015 bytes and serializer output was 1,009 bytes. They were not byte-identical. This is enough to reject the graph-is-source account even on the smallest clean model.

### MIWG reference corpus

All 21 reference files produced a BPMN definitions graph. Across 2,818 ID-indexed elements, the limited sorted `$type:id` projection was equal after export and re-import for every file. The entire probe completed in approximately 396 milliseconds using the bundled published implementation on the development machine.

This projection does not compare every attribute, child order, extension body, reference, default, diagram coordinate, or lexical property. It is a smoke discriminator, not an interchange-conformance result.

Seven files produced initial warnings:

| Files | Observation |
|---|---|
| `A.1.0`, `A.2.0`, `A.3.0`, `A.4.0`, `B.1.0`, `B.2.0` | Each declares ISO-8859-1; the parser warned that the encoding is unsupported and that it was falling back to UTF-8 |
| `C.8.1` | Three `triso:unspecified` message references were unresolved |

No file was byte-identical to its serialized form.

The three unresolved `C.8.1` references no longer produced warnings after serializer output was re-imported: `triso:unspecified` occurred three times in the source and zero times in serializer output. The library had removed the unresolved reference values from the structural form used for serialization. Exact source bytes and retained warnings are therefore necessary even when a coarse element-identity projection survives.

### Diagnostics

Runtime warnings are objects, not strings. They always exposed a message in the sampled cases; unresolved-reference warnings also exposed the owning element, property, and unresolved value. Some parse warnings embed line and column text only in the message. The matching `@types/bpmn-moddle@10.0.0` package incorrectly declares `warnings` as `string[]`, so it is not proposed as a dependency.

### DTD and entity behavior

A bare DOCTYPE was accepted without a warning. Internal and external entity declarations were not expanded in the tested attribute; the literal entity reference remained and generated parse/illegal-ID warnings. The spike does not claim general XML entity safety from three cases. It establishes that the project must reject DTD/DOCTYPE before parsing rather than infer a security contract from current tokenizer behavior.

## Result and confidence

The structural importer is a good candidate when wrapped behind exact byte identity, normalized diagnostics, warning-blocked admission, project-owned compilation, and a private external object graph. Confidence is high for adopting that bounded role because the package is BPMN-specific, the current fixture is clean, the full small MIWG reference set is ingestible, and the negative cases expose where preservation must remain project-owned.

Confidence is deliberately low for lexical round-trip preservation, non-UTF-8 handling, stable source locations, warning-free foreign-reference handling, or accepting untrusted large XML in-process. Those are explicit boundaries, not inferred capabilities.

## Remaining decision and stop condition

The exact dependency proposal is in [BPMN-XML-INGESTION-DECISION.md](../BPMN-XML-INGESTION-DECISION.md). Stop before adding it to `package.json` or `pnpm-lock.yaml` until the owner approves `bpmn-moddle@10.0.0` for the isolated `@bpmn-lean/bpmn-source` package.

After approval, the next discriminator is a red test that requires exact byte/hash retention while a warning-producing unresolved reference blocks executable admission. A parser adapter that silently drops the reference, regenerates source bytes, exposes moddle objects outside the package, or permits the semantic core/Temporal Workflow to import the parser fails the experiment’s conclusion.
