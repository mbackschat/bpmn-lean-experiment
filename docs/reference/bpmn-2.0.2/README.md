# BPMN 2.0.2 external reference corpus

This tracked directory is the project pointer and digest manifest for the external local research corpus at [the sibling OMG source root](../../../../oss/omg-bpmn-2.0.2). The corpus contains OMG **Business Process Model and Notation, Version 2.0.2**, January 2014, document `formal/13-12-09`; external placement keeps source material out of the project documentation tree and redistribution boundary.

## Local material

The external corpus may contain:

- `BPMN-2.0.2.pdf` — official 532-page normative PDF;
- `machine-readable/` — eleven official normative CMOF, XSD, and XSLT files listed by OMG.
- `examples/` — the official non-normative BPMN 2.0 by Example PDF/archive and machine-readable example archive.
- `BPMN-2.0.2.md` and `BPMN-2_0_2_images/` — optional disposable digital-first conversion cache, not fetched or verified as an official input.

The existing Markdown conversion used PyMuPDF4LLM without OCR because 530 pages have a text layer and only two pages are image-only. Its original QA confirmed 14,442 Markdown lines, all 333 referenced image paths present exactly once, reconstructed headings through Clause 15 and the annexes, and readable execution-semantics figures such as the Activity lifecycle. The conversion is a research cache rather than a reproducible or authoritative input; regenerate and re-check it when the cache is needed.

## Fetch and verification

From repository root, fetch every official input into the default sibling location and verify it before installation:

```sh
./scripts/fetch-bpmn-corpus.sh
```

Verify an existing corpus without downloading:

```sh
./scripts/verify-bpmn-corpus.sh
```

Set `BPMN_CORPUS_ROOT` to use another local destination. The fetch refuses to overwrite an existing target, downloads only from `www.omg.org`, verifies all 15 official files against the tracked manifest in a temporary directory, and moves them into place only after the complete verification succeeds.

For full clean-machine setup, including pinned Git evidence checkouts and diagnostics, follow the [contributor setup guide](../../CONTRIBUTOR-SETUP-GUIDE.md).

## Tracked project material

- [BPMN conformance target](../../BPMN-CONFORMANCE-TARGET.md) — original project interpretation and formalization map;
- [LOCAL-CORPUS.sha256](LOCAL-CORPUS.sha256) — reproducibility hashes for the 15 official downloaded inputs;
- [NORMATIVE-LABELS.digest](NORMATIVE-LABELS.digest) — the bare clause and table labels the standard declares, plus the row-qualifier tokens a reference may name;
- [project sources](../../SOURCES.md) — authoritative URLs and wider source hierarchy.

The label digest exists because the conversion above is optional and disposable while [the reference guard](../../../scripts/normative-reference-resolution.test.ts) runs in the default lane, which is complete on a machine that holds only the hash-bound official inputs. Reading the conversion directly made that guard pass locally and fail every hosted run. The digest carries numbers and identifiers rather than expression, so it stays inside the redistribution boundary below, and it records the conversion's SHA-256 so drift is detectable wherever both exist.

Regenerate it after replacing the conversion, and use `--check` to detect drift without writing:

```sh
node scripts/update-bpmn-normative-labels.ts
node scripts/update-bpmn-normative-labels.ts --check
```

## Official sources

- Specification catalog: `https://www.omg.org/spec/BPMN/`
- Version-pinned specification catalog: `https://www.omg.org/spec/BPMN/2.0.2`
- Normative PDF: `https://www.omg.org/spec/BPMN/2.0.2/PDF`
- Machine-readable catalog: `https://www.omg.org/spec/BPMN/machine-readable`
- Open issues: `https://issues.omg.org/issues/spec/BPMN/2.0.2`

The normative machine-readable set retained locally is `BPMN20.cmof`, `BPMNDI.cmof`, `DC.cmof`, `DI.cmof`, `BPMN20.xsd`, `BPMNDI.xsd`, `DC.xsd`, `DI.xsd`, `Semantic.xsd`, `BPMN20-FromXMI.xslt`, and `Infrastructure.cmof`.

Clause 15 mentions `BPMN20-ToXMI.xslt`, and the PDF cover mentions `Semantic.cmof`, but neither file is in OMG’s current BPMN 2.0.2 normative machine-readable catalog and both corresponding direct URLs returned 404 during ingestion. They are therefore recorded as source inconsistencies rather than silently substituted from an unofficial mirror.

The local non-normative fixtures come from OMG documents `dtc/10-06-02` and `dtc/10-06-03`. Both ZIP archives passed full integrity checks. They are examples and parser/interchange inputs, not normative semantic evidence.

## Redistribution boundary

The OMG PDF includes conditions on copying, modification, posting, and conformance claims. A full Markdown conversion is a modified copy, so the PDF, conversion, figures, machine-readable corpus, and examples remain local outside the repository rather than becoming project content. The tracked digest paraphrases the standard for this special-purpose implementation and assurance project; it does not replace the normative source.
