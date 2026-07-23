# BPMN 2.0.2 local reference corpus

This directory provides a local research corpus for OMG **Business Process Model and Notation, Version 2.0.2**, January 2014, document `formal/13-12-09`.

## Local material

The following downloaded or generated paths are intentionally Git-ignored:

- `BPMN-2.0.2.pdf` — official 532-page normative PDF;
- `BPMN-2.0.2.md` — digital-first Markdown conversion;
- `BPMN-2_0_2_images/` — 333 extracted figures referenced by the Markdown;
- `machine-readable/` — eleven official normative CMOF, XSD, and XSLT files listed by OMG.
- `examples/` — the official non-normative BPMN 2.0 by Example PDF/archive and machine-readable example archive.

The Markdown conversion used PyMuPDF4LLM without OCR because 530 pages have a text layer and only two pages are image-only. Verification confirmed 14,442 Markdown lines, all 333 referenced image paths present exactly once in the extracted corpus, reconstructed headings through Clause 15 and the annexes, and readable execution-semantics figures such as the Activity lifecycle.

## Tracked project material

- [BPMN conformance target](../../BPMN-CONFORMANCE-TARGET.md) — original project interpretation and formalization map;
- [LOCAL-CORPUS.sha256](LOCAL-CORPUS.sha256) — reproducibility hashes for the ignored downloaded and converted files;
- [project sources](../../SOURCES.md) — authoritative URLs and wider source hierarchy.

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

The OMG PDF includes conditions on copying, modification, posting, and conformance claims. A full Markdown conversion is a modified copy, so the PDF, conversion, figures, and machine-readable corpus remain local and ignored rather than becoming repository content. The tracked digest paraphrases the standard for this special-purpose implementation and assurance project; it does not replace the normative source.
