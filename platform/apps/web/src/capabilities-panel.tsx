import { useState } from "react";
import { Button, ButtonVariant, InlineDisclosure } from "@bpmn-lean/platform-ui-kit";

import { HostLimitUnit, hostRestrictions } from "../../../../model-corpus/host-restrictions.ts";
import type { HostLimit } from "../../../../model-corpus/host-restrictions.ts";
import {
  BpmnCapabilitySupport,
  CibCapabilityEvidenceKind,
  mvpBpmnRestrictions,
  mvpCapabilityCatalog,
} from "../../../../model-corpus/mvp-capabilities.ts";
import type {
  BpmnCapabilitySupport as BpmnCapabilitySupportValue,
  CibCapabilityEvidence,
} from "../../../../model-corpus/mvp-capabilities.ts";
import { OutsideTargetReach, outsideTargetFeatures } from "../../../../model-corpus/outside-target-features.ts";
import type { OutsideTargetReach as OutsideTargetReachValue } from "../../../../model-corpus/outside-target-features.ts";
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
  const [expandedFamilies, setExpandedFamilies] = useState<ReadonlySet<string>>(() => new Set());
  const [expandedAreas, setExpandedAreas] = useState<ReadonlySet<string>>(() => new Set());
  const families = Map.groupBy(mvpCapabilityCatalog.capabilities, (capability) => capability.family);
  const elements = new Map(mvpCapabilityCatalog.capabilities.map(({ id, element }) => [id, element]));
  const outsideTarget = Map.groupBy(outsideTargetFeatures, ({ capability }) => capability);
  const areas = new Map([...Map.groupBy(mvpBpmnRestrictions, ({ basis }) => restrictionArea(basis))]
    .sort(([left], [right]) => left.localeCompare(right, "en")));

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
        <strong>Not a conformance claim.</strong> Each row is an exact, restricted executable variant. BPMN coverage, selected CIB compatibility evidence, and platform journey coverage remain separate measures.
      </aside>
      <aside className={styles.boundary} aria-label="Runtime qualification exceptions">
        <strong>Runtime qualification exceptions.</strong> Three recorded runtime defects have no released correction and are accepted as disclosed exceptions: TD-001, where a read of a process can time out while Temporal evicts its Workflow Run; TD-002, where an input delivered during a read can be timed differently live and on replay; and TD-005, where a Script Task stopped by its timeout can abort its Worker process. A fourth, TD-003, a native crash during garbage collection, is corrected in the adopted Node release, but its separating witness has not run on Linux arm64, the evaluation image's platform. The Temporal defects ledger records each one.
      </aside>
      <InlineDisclosure title="Implementation checkpoints">
      <div className={styles.beta}>
        <h3 id="implementation-checkpoints-heading">Implementation checkpoints</h3>
        <p>Historical MUE Preview Beta evidence: these seven checkpoints record the boundaries and remaining limits at that delivery checkpoint. This is not full MUE closure or BPMN conformance. The executable overview describes current supported variants.</p>
        <ul className={styles.checkpoints} aria-labelledby="implementation-checkpoints-heading">
          {muePreviewBetaCheckpoints.map((checkpoint) => (
            <li key={checkpoint.id} data-beta-content-id={checkpoint.id}>
                <h4>{checkpoint.title}</h4>
                <dl className={styles.checkpointDetails}>
                  <div><dt>Evidence</dt><dd>{betaEvidenceLabel(checkpoint.evidenceKind)}</dd></div>
                  <div><dt>Product surface</dt><dd>{betaSurfaceLabel(checkpoint.productSurface)}</dd></div>
                  <div><dt>Remaining limit</dt><dd>{checkpoint.boundary}; {checkpoint.remainingLimit}</dd></div>
                </dl>
            </li>
          ))}
        </ul>
      </div>
      </InlineDisclosure>
      <InlineDisclosure title="Executable BPMN elements and variants">
        <section className={styles.families} aria-label="Executable BPMN element and semantic-variant overview">
          <p>{mvpCapabilityCatalog.capabilities.length} element variants in {families.size} families. Expand a family to inspect its restrictions and evidence.</p>
          <div className={styles.familyActions}>
            <Button variant={ButtonVariant.Secondary} onPress={() => setExpandedFamilies(new Set(families.keys()))}>Expand all families</Button>
            <Button variant={ButtonVariant.Secondary} onPress={() => setExpandedFamilies(new Set())}>Collapse all families</Button>
          </div>
          {[...families].map(([family, capabilities]) => (
            <InlineDisclosure key={family} title={`${family} (${capabilities.length})`} isExpanded={expandedFamilies.has(family)} onExpandedChange={(expanded) => setExpandedFamilies((previous) => toggled(previous, family, expanded))}>
              <div className={`${styles.tableOwner} ${styles.capabilityTable}`}>
                <table>
                  <caption>{family} — elements and variants</caption>
                  <thead>
                    <tr>
                      <th scope="col">Element or variant</th>
                      <th scope="col">Current status</th>
                      <th scope="col">Current restriction</th>
                      <th scope="col">CIB Seven evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capabilities.map((capability) => (
                      <tr key={capability.id} data-capability-id={capability.id}>
                        <th scope="row" data-label="Element or variant">{capability.element}</th>
                        <td data-label="Current status">
                          {supportLabel(capability.support)}
                          {(outsideTarget.get(capability.id) ?? []).map(({ feature, reach, basis }) => (
                            <span key={basis} className={styles.outsideTargetNote}>{`Outside the Practical CIB7 target: ${feature} (${reachLabel(reach).toLowerCase()})`}</span>
                          ))}
                        </td>
                        <td data-label="Current restriction">{capability.restriction}</td>
                        <td data-label="CIB Seven evidence">{cibEvidenceLabel(capability.cibEvidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </InlineDisclosure>
          ))}
        </section>
      </InlineDisclosure>
      <InlineDisclosure title="Refused BPMN forms">
        <section className={styles.families} aria-label="Refused BPMN forms by semantic area">
          <p>{mvpBpmnRestrictions.length} forms in {areas.size} semantic areas are refused when a definition is deployed. Each refusal names its stable refusal code; the basis names the semantics document and relation-register entries that record why.</p>
          <div className={styles.familyActions}>
            <Button variant={ButtonVariant.Secondary} onPress={() => setExpandedAreas(new Set(areas.keys()))}>Expand all areas</Button>
            <Button variant={ButtonVariant.Secondary} onPress={() => setExpandedAreas(new Set())}>Collapse all areas</Button>
          </div>
          {[...areas].map(([area, restrictions]) => (
            <InlineDisclosure key={area} title={`${area} (${restrictions.length})`} isExpanded={expandedAreas.has(area)} onExpandedChange={(expanded) => setExpandedAreas((previous) => toggled(previous, area, expanded))}>
              <div className={`${styles.tableOwner} ${styles.restrictionTable}`}>
                <table>
                  <caption>{area} — refused forms</caption>
                  <thead>
                    <tr>
                      <th scope="col">Refusal code</th>
                      <th scope="col">What it refuses</th>
                      <th scope="col">Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restrictions.map((restriction) => (
                      <tr key={restriction.refusalCode} data-refusal-code={restriction.refusalCode}>
                        <th scope="row" data-label="Refusal code"><code>{restriction.refusalCode}</code></th>
                        <td data-label="What it refuses">{restriction.restriction}</td>
                        <td data-label="Basis">{restriction.basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </InlineDisclosure>
          ))}
        </section>
      </InlineDisclosure>
      <InlineDisclosure title="Hosted engine restrictions">
        <section className={styles.families} aria-label="Hosted engine restriction overview">
          <p>The kernel executes these, but the hosted engine refuses them with a stable host code. It runs each process instance as a chain of Temporal Workflow Runs whose capacity limits a large or busy instance can meet. An open issue tracks each restriction.</p>
          <div className={`${styles.tableOwner} ${styles.hostTable}`}>
            <table>
              <caption>Hosted engine — restrictions and limits</caption>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">What it refuses</th>
                  <th scope="col">Limit</th>
                  <th scope="col">Tracked in</th>
                </tr>
              </thead>
              <tbody>
                {hostRestrictions.map((restriction) => (
                  <tr key={restriction.code} data-host-restriction-code={restriction.code}>
                    <th scope="row" data-label="Code"><code>{restriction.code}</code></th>
                    <td data-label="What it refuses">{restriction.restriction}</td>
                    <td data-label="Limit">{limitLabel(restriction.limit)}</td>
                    <td data-label="Tracked in">{`Issue #${String(restriction.issue)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </InlineDisclosure>
      <InlineDisclosure title="Outside the Practical CIB7 target">
        <section className={styles.families} aria-label="Supported features outside the Practical CIB7 target">
          <p>The kernel supports these, but CIB Seven 2.2.0 lacks them, so they lie outside the Practical CIB7 target and count toward none of its rows. Most run only under the standards profile: the cibseven profiles refuse such a model or, for Multi-Instance output aggregation, write no output collection. The basis names the relation-register entry that records what CIB Seven lacks; the capability rows they belong to carry a note.</p>
          <div className={`${styles.tableOwner} ${styles.outsideTargetTable}`}>
            <table>
              <caption>Outside the Practical CIB7 target — supported features</caption>
              <thead>
                <tr>
                  <th scope="col">Element or variant</th>
                  <th scope="col">Feature</th>
                  <th scope="col">What it does</th>
                  <th scope="col">Runs under</th>
                  <th scope="col">Basis</th>
                </tr>
              </thead>
              <tbody>
                {outsideTargetFeatures.map(({ capability, feature, description, reach, basis }) => (
                  <tr key={JSON.stringify([capability, basis])} data-outside-target-capability={capability} data-outside-target-basis={basis}>
                    <th scope="row" data-label="Element or variant">{elements.get(capability) ?? capability}</th>
                    <td data-label="Feature">{feature}</td>
                    <td data-label="What it does">{description}</td>
                    <td data-label="Runs under">{reachLabel(reach)}</td>
                    <td data-label="Basis">{basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </InlineDisclosure>
      <p className={styles.followUp}>
        The repository requirement ledger owns BPMN dispositions; the kernel status map owns exact current evidence. Unsupported or broader behavior remains outside these rows until its semantic profile and tests are approved.
      </p>
    </section>
  );
}

function toggled(previous: ReadonlySet<string>, key: string, expanded: boolean): ReadonlySet<string> {
  const next = new Set(previous);
  if (expanded) next.add(key);
  else next.delete(key);
  return next;
}

/**
 * The semantic area a restriction row belongs to: its basis's first part, a semantics document name such as
 * `MULTI-INSTANCE-SEMANTICS-SPEC`, read as "Multi-instance" (`scripts/capability-catalog-disclosures.test.ts` holds
 * every row's basis to begin with one).
 */
function restrictionArea(basis: string): string {
  const area = (basis.split(";")[0] ?? "").trim().replace(/-SEMANTICS-SPEC$/u, "");
  return area.charAt(0) + area.slice(1).toLowerCase();
}

function reachLabel(reach: OutsideTargetReachValue): string {
  switch (reach) {
    case OutsideTargetReach.StandardsProfile:
      return "Standards profile only";
  }
}

function limitLabel(limit: HostLimit | null): string {
  if (limit === null) return "No numeric limit";
  switch (limit.unit) {
    case HostLimitUnit.Bytes:
      return `${String(limit.value / 1_024)} KiB`;
    case HostLimitUnit.Count:
      return limit.value.toLocaleString("en-US");
  }
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
