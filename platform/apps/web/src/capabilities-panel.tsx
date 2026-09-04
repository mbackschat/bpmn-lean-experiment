import {
  BpmnCapabilitySupport,
  CibCapabilityEvidenceKind,
  mvpCapabilityCatalog,
} from "../../../../model-corpus/mvp-capabilities.ts";
import type {
  BpmnCapabilitySupport as BpmnCapabilitySupportValue,
  CibCapabilityEvidence,
} from "../../../../model-corpus/mvp-capabilities.ts";
import {
  MuePreviewBetaEvidenceKind,
  MuePreviewBetaProductSurface,
  muePreviewBetaCheckpoints,
} from "./mue-preview-beta-checkpoints.ts";
import type {
  MuePreviewBetaEvidenceKind as MuePreviewBetaEvidenceKindValue,
  MuePreviewBetaProductSurface as MuePreviewBetaProductSurfaceValue,
} from "./mue-preview-beta-checkpoints.ts";

import styles from "./capabilities-panel.module.css";

export type CapabilitiesPanelProps = Readonly<{
  productVersion: string;
}>;

export function CapabilitiesPanel({ productVersion }: CapabilitiesPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="capabilities-heading">
      <div className={styles.introduction}>
        <p className={styles.eyebrow}>Version and capabilities</p>
        <h2 id="capabilities-heading">BPMN Lean {productVersion}</h2>
        <p>
          This pre-release build has a BPMN {mvpCapabilityCatalog.standard.version} {mvpCapabilityCatalog.standard.target} target and uses {mvpCapabilityCatalog.compatibilityBaseline.product} {mvpCapabilityCatalog.compatibilityBaseline.version} as its current compatibility baseline.
        </p>
      </div>
      <dl className={styles.summary}>
        <div>
          <dt>Build</dt>
          <dd>{productVersion} pre-release</dd>
        </div>
        <div>
          <dt>BPMN target</dt>
          <dd>BPMN {mvpCapabilityCatalog.standard.version}</dd>
        </div>
        <div>
          <dt>Evidence-backed variants</dt>
          <dd>{mvpCapabilityCatalog.capabilities.length}</dd>
        </div>
        <div>
          <dt>CIB baseline</dt>
          <dd>{mvpCapabilityCatalog.compatibilityBaseline.product} {mvpCapabilityCatalog.compatibilityBaseline.version}</dd>
        </div>
      </dl>
      <aside className={styles.boundary} aria-label="Coverage boundary">
        <strong>Not a conformance claim.</strong> Each row is an exact, restricted executable profile. BPMN coverage, selected CIB compatibility evidence, and platform journey coverage remain separate measures.
      </aside>
      <div className={styles.beta}>
        <h3>MUE Preview Beta</h3>
        <p>All seven reviewed checkpoint boundaries are integrated. This delivery checkpoint is not full MUE closure or BPMN conformance; each evidence kind and remaining limit stays explicit.</p>
        <div className={`${styles.tableOwner} ${styles.betaTable}`}>
          <table>
            <caption>MUE Preview Beta checkpoint boundaries</caption>
            <thead>
              <tr>
                <th scope="col">Checkpoint</th>
                <th scope="col">Evidence</th>
                <th scope="col">Product surface</th>
                <th scope="col">Remaining limit</th>
              </tr>
            </thead>
            <tbody>
              {muePreviewBetaCheckpoints.map((checkpoint) => (
                <tr key={checkpoint.id} data-beta-content-id={checkpoint.id}>
                  <th scope="row" data-label="Checkpoint">{checkpoint.title}</th>
                  <td data-label="Evidence">{betaEvidenceLabel(checkpoint.evidenceKind)}</td>
                  <td data-label="Product surface">{betaSurfaceLabel(checkpoint.productSurface)}</td>
                  <td data-label="Remaining limit">{checkpoint.boundary}; {checkpoint.remainingLimit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={`${styles.tableOwner} ${styles.capabilityTable}`}>
        <table>
          <caption>Executable BPMN element and semantic-variant overview</caption>
          <thead>
            <tr>
              <th scope="col">Family</th>
              <th scope="col">Element or variant</th>
              <th scope="col">Current status</th>
              <th scope="col">Current restriction</th>
              <th scope="col">CIB Seven evidence</th>
            </tr>
          </thead>
          <tbody>
            {mvpCapabilityCatalog.capabilities.map((capability) => (
              <tr key={capability.id} data-capability-id={capability.id}>
                <td data-label="Family">{capability.family}</td>
                <th scope="row" data-label="Element or variant">{capability.element}</th>
                <td data-label="Current status">{supportLabel(capability.support)}</td>
                <td data-label="Current restriction">{capability.restriction}</td>
                <td data-label="CIB Seven evidence">{cibEvidenceLabel(capability.cibEvidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.followUp}>
        The repository requirement ledger owns BPMN dispositions; the implementation map owns exact current evidence. Unsupported or broader behavior remains outside these rows until its semantic profile and tests are approved.
      </p>
    </section>
  );
}

function supportLabel(support: BpmnCapabilitySupportValue): string {
  switch (support) {
    case BpmnCapabilitySupport.BoundedStandard:
      return "Bounded BPMN 2.0.2 support";
    case BpmnCapabilitySupport.ProjectExtension:
      return "Project extension";
  }
}

function cibEvidenceLabel(evidence: CibCapabilityEvidence): string {
  switch (evidence.kind) {
    case CibCapabilityEvidenceKind.ExactSelectedProfile:
      return `Exact selected-profile pipeline, CIB Seven ${evidence.version}`;
    case CibCapabilityEvidenceKind.NotSelected:
      return "No CIB target selected";
    case CibCapabilityEvidenceKind.NotApplicable:
      return "Not a CIB compatibility claim";
  }
}

function betaEvidenceLabel(evidenceKind: MuePreviewBetaEvidenceKindValue): string {
  switch (evidenceKind) {
    case MuePreviewBetaEvidenceKind.GeneratedEvidence:
      return "Generated evidence";
    case MuePreviewBetaEvidenceKind.ProductionJourney:
      return "Production journey";
    case MuePreviewBetaEvidenceKind.RegisteredExecutableCapability:
      return "Registered executable capability";
    case MuePreviewBetaEvidenceKind.ReviewedCheckpointOnly:
      return "Reviewed checkpoint only";
  }
}

function betaSurfaceLabel(surface: MuePreviewBetaProductSurfaceValue): string {
  switch (surface) {
    case MuePreviewBetaProductSurface.None:
      return "No Product 2 executable surface";
    case MuePreviewBetaProductSurface.About:
    case MuePreviewBetaProductSurface.DefinitionsAndTriggers:
    case MuePreviewBetaProductSurface.Operations:
      return surface;
  }
}
