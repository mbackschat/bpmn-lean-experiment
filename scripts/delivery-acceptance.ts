import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { requireExecutableModelCorpusManifest } from "./executable-model-corpus-manifest.ts";
import type { CorpusModel } from "./executable-model-corpus-manifest.ts";
import { assertIndependentlyApproved, correctionAuditRounds, parseReceipt, ReviewStage } from "./independent-review-receipt.ts";
import { scanMarkdownAnchors, scanMarkdownLinks } from "./markdown-link-lexer.ts";
import { markdownTableRows, withoutBackticks } from "./markdown-tables.ts";
import { exactMarkdownSection, markdownSections, sha256 } from "./semantic-review-text.ts";

export type DeliveryFileBinding = Readonly<{ path: string; sha256: string }>;
export type ReviewedDeliveryBinding = Readonly<{
  variantId: string;
  modelId: string;
  relationship: "exactRepresentative" | "reviewedComposition";
  scope: ReadonlyArray<DeliveryFileBinding & { headingPath: string }>;
  source: DeliveryFileBinding;
  scenario: DeliveryFileBinding;
  profile: DeliveryFileBinding;
  sourceOverlay: (DeliveryFileBinding & { id: string }) | null;
  configuration: Readonly<{
    files: ReadonlyArray<DeliveryFileBinding>;
    handlerFactory: Readonly<{ modulePath: string; exportName: string }>;
  }>;
}>;
export type DeliveryEvidenceReader = Readonly<{
  current: (relativePath: string) => Promise<Uint8Array | null>;
  reviewed: (target: string, relativePath: string) => Promise<Uint8Array | null>;
}>;
export type SelectedDeliveryRow = Readonly<{
  id: string;
  modelId: string;
  scopeSha256: string;
  bindingSha256: string | null;
  status: "accepted" | "open";
  reasons: ReadonlyArray<string>;
  closure: Readonly<{ owner: string; target: string | null; verdict: string }>;
}>;
export type SelectedDeliveryCohort = Readonly<{
  rows: ReadonlyArray<SelectedDeliveryRow>;
  acceptedVariants: number;
  openVariants: number;
}>;

const digestPattern = /^[a-f0-9]{64}$/u;
const receiptTitle = "Independent cold-review receipt";
const bindingTitle = "Reviewed delivery bindings";
const manifestPath = "model-corpus/manifest.json";

function object(value: unknown, keys: ReadonlyArray<string>): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Object.keys(value).sort().join() !== [...keys].sort().join()) throw new TypeError("invalid delivery binding fields");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError("invalid delivery binding text");
  return value;
}
function relativePath(value: unknown): string {
  const name = text(value);
  if (path.posix.isAbsolute(name) || name.includes("\\") || name.includes("|") || name.includes(":") ||
      /[\u0000-\u001f]/u.test(name) || name.split("/").some(part => part === ".." || part === "." || part === "")) {
    throw new TypeError("delivery paths must be repository-relative");
  }
  return name;
}
function fileBinding(value: unknown, extraKeys: ReadonlyArray<string> = []): DeliveryFileBinding {
  const file = object(value, ["path", "sha256", ...extraKeys]);
  if (!digestPattern.test(text(file.sha256))) throw new TypeError("invalid delivery binding digest");
  return { path: relativePath(file.path), sha256: text(file.sha256) };
}
function nonemptyArray(value: unknown): ReadonlyArray<unknown> {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError("delivery binding needs a nonempty list");
  return value;
}
function distinct<T>(entries: ReadonlyArray<T>, key: (entry: T) => string): ReadonlyArray<T> {
  if (new Set(entries.map(key)).size !== entries.length) throw new TypeError("duplicate delivery binding entry");
  return [...entries].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}

/** The closure owner records qualified files explicitly; a corpus model is a relationship, not a byte substitute. */
export function requireReviewedDeliveryBinding(value: unknown): ReviewedDeliveryBinding {
  const binding = object(value, ["variantId", "modelId", "relationship", "scope", "source", "scenario", "profile", "sourceOverlay", "configuration"]);
  if (binding.relationship !== "exactRepresentative" && binding.relationship !== "reviewedComposition") throw new TypeError("invalid representative relationship");
  const scope = distinct(nonemptyArray(binding.scope).map(value => {
    const section = object(value, ["path", "sha256", "headingPath"]);
    const headingPath = text(section.headingPath);
    if (headingPath.split(" > ").some(part => part === "Status" || part === receiptTitle)) throw new TypeError("scope cannot fingerprint mutable review state");
    return { ...fileBinding(value, ["headingPath"]), headingPath };
  }), section => `${section.path}#${section.headingPath}`);
  const configuration = object(binding.configuration, ["files", "handlerFactory"]);
  const files = distinct(nonemptyArray(configuration.files).map(value => fileBinding(value)), file => file.path);
  const factory = object(configuration.handlerFactory, ["modulePath", "exportName"]);
  const modulePath = relativePath(factory.modulePath);
  const exportName = text(factory.exportName);
  if (!/^[a-zA-Z_$][\w$]*$/u.test(exportName) || !files.some(file => file.path === modulePath)) throw new TypeError("handler factory must name a bound configuration module");
  const overlay = binding.sourceOverlay === null ? null : {
    ...fileBinding(binding.sourceOverlay, ["id"]), id: text(object(binding.sourceOverlay, ["id", "path", "sha256"]).id),
  };
  return { variantId: text(binding.variantId), modelId: text(binding.modelId), relationship: binding.relationship,
    scope, source: fileBinding(binding.source), scenario: fileBinding(binding.scenario), profile: fileBinding(binding.profile),
    sourceOverlay: overlay, configuration: { files, handlerFactory: { modulePath, exportName } } };
}

function sectionNamed(document: string, title: string): string {
  const matches = markdownSections(document).filter(section => section.headingPath.split(" > ").at(-1) === title);
  if (matches.length !== 1) throw new TypeError(`missing or repeated ${title} section`);
  return matches[0]!.text;
}
function bindingRows(document: string): Map<string, Readonly<{ raw: string; value: unknown }>> {
  const receipt = sectionNamed(document, receiptTitle);
  const sections = markdownSections(receipt).filter(section => section.headingPath === `${receiptTitle} > ${bindingTitle}`);
  if (sections.length === 0) return new Map();
  if (sections.length !== 1) throw new TypeError("missing reviewed delivery binding table");
  const lines = sections[0]!.text.split("\n").filter(line => line.startsWith("|"));
  if (lines[0] !== "| Variant ID | Delivery binding |" || lines[1] !== "|---|---|") throw new TypeError("invalid delivery binding table header");
  const result = new Map<string, Readonly<{ raw: string; value: unknown }>>();
  for (const raw of lines.slice(2)) {
    const cells = raw.split("|").slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 2) throw new TypeError("invalid delivery binding table row");
    const id = withoutBackticks(cells[0]!);
    if (result.has(id)) throw new TypeError("duplicate delivery variant binding");
    const json = cells[1]!;
    if (!json.startsWith("`") || !json.endsWith("`")) throw new TypeError("delivery binding must be a JSON code span");
    result.set(id, { raw, value: JSON.parse(json.slice(1, -1)) });
  }
  return result;
}
function localReference(cell: string): Readonly<{ path: string; anchor: string }> {
  const links = scanMarkdownLinks(cell);
  if (links.length !== 1) throw new TypeError("selected variant needs exactly one owner reference");
  const [destination, fragment, ...extra] = links[0]!.destination.split("#");
  if (extra.length !== 0 || !destination || !fragment) throw new TypeError("selected variant needs a section owner");
  return { path: relativePath(path.posix.normalize(path.posix.join("docs", destination))), anchor: decodeURIComponent(fragment) };
}
function representativeScope(model: CorpusModel) {
  return { id: model.id, source: model.source, profile: model.profile, constructs: model.constructs, mechanisms: model.mechanisms };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function utf8(bytes: Uint8Array): string { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }

/** Reads Git objects only to bind approval, never to reconstruct progress dates. */
export function deliveryEvidenceReader(projectRoot: string): DeliveryEvidenceReader {
  return {
    current: async name => {
      try { return await readFile(path.join(projectRoot, relativePath(name))); }
      catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    },
    reviewed: async (target, name) => {
      const result = spawnSync("git", ["show", `${target}:${relativePath(name)}`], {
        cwd: projectRoot, timeout: 5_000, maxBuffer: 16 * 1024 * 1024,
      });
      return result.status === 0 ? result.stdout : null;
    },
  };
}

/** Missing evidence retains the selected denominator and an open row; approved exact bindings alone close it. */
export async function readSelectedDeliveryCohort(
  targetDocument: string,
  models: ReadonlyArray<CorpusModel>,
  reader: DeliveryEvidenceReader,
): Promise<SelectedDeliveryCohort> {
  const selectedSection = sectionNamed(targetDocument, "Selected behavioral variants");
  if (selectedSection.split("\n").find(line => line.startsWith("|")) !==
      "| Variant ID | Obligation families | Contract owner | Representative model ID | Acceptance owner |") {
    throw new TypeError("selected variant table columns changed");
  }
  const selected = markdownTableRows(`${selectedSection}\n## End`,
    "## Selected behavioral variants", "\n## End", 5);
  const seen = new Set<string>();
  const rows: SelectedDeliveryRow[] = [];
  const cached = new Map<string, Promise<Uint8Array | null>>();
  const current = (name: string) => {
    if (!cached.has(name)) cached.set(name, reader.current(name));
    return cached.get(name)!;
  };
  for (const cells of selected) {
    const id = text(withoutBackticks(cells[0]!));
    if (seen.has(id)) throw new TypeError(`duplicate selected variant ID: ${id}`);
    seen.add(id);
    const modelId = text(withoutBackticks(cells[3]!));
    const contract = localReference(cells[2]!);
    const owner = localReference(cells[4]!);
    const model = models.find(model => model.id === modelId);
    const reasons: string[] = [];
    const observed: Record<string, string | null> = {};
    let binding: ReviewedDeliveryBinding | null = null;
    let rawBinding: string | null = null;
    let target: string | null = null;
    let verdict = "missing";
    const ownerBytes = await current(owner.path);
    if (ownerBytes === null) reasons.push("closureOwnerMissing");
    else {
      let document = "";
      try { document = utf8(ownerBytes); }
      catch { reasons.push("closureMalformed"); }
      try {
        const closure = parseReceipt(document, owner.path).get(ReviewStage.Closure)!;
        verdict = closure.verdict;
        switch (closure.verdict) {
          case "approve": case "approve-with-required-edits":
            assertIndependentlyApproved(closure, owner.path);
            target = correctionAuditRounds(closure.correctionAudit).at(-1) ?? closure.target;
            break;
          case "reject": reasons.push("closureFailed"); break;
          default: reasons.push("closurePending");
        }
      } catch { reasons.push("closureMalformed"); }
      try {
        const row = bindingRows(document).get(id);
        if (row === undefined) reasons.push("bindingMissing");
        else { rawBinding = row.raw; binding = requireReviewedDeliveryBinding(row.value); }
      } catch { reasons.push("bindingMalformed"); }
    }
    const contractBytes = await current(contract.path);
    let selectedContract: string | null = null;
    try {
      if (contractBytes === null) throw new Error("missing contract");
      const document = utf8(contractBytes);
      const anchor = scanMarkdownAnchors(document).find(anchor => anchor.name === contract.anchor);
      if (anchor === undefined) throw new Error("missing contract section");
      selectedContract = document.slice(anchor.start, anchor.end);
    } catch { reasons.push("contractScopeMissing"); }
    observed.selectedContract = selectedContract === null ? null : sha256(selectedContract);
    if (binding !== null) {
      if (model === undefined || binding.variantId !== id || binding.modelId !== modelId || model.source.kind !== "retainedScenario") reasons.push("representativeMismatch");
      else {
        if (binding.profile.path !== `profiles/${model.profile}/profile.json`) reasons.push("profileMismatch");
        if (binding.relationship === "exactRepresentative" && (binding.source.path !== model.source.bpmnRelativePath ||
            binding.source.sha256 !== model.source.sha256 || binding.scenario.path !== model.source.scenarioRelativePath)) reasons.push("representativeMismatch");
      }
      const fileBindings = [binding.source, binding.scenario, binding.profile, ...binding.configuration.files,
        ...(binding.sourceOverlay === null ? [] : [binding.sourceOverlay])];
      const bytesByPath = new Map<string, Uint8Array>();
      for (const file of fileBindings) {
        const bytes = await current(file.path);
        observed[file.path] = bytes === null ? null : sha256(bytes);
        if (bytes === null) reasons.push("inputMissing");
        else {
          bytesByPath.set(file.path, bytes);
          if (sha256(bytes) !== file.sha256) reasons.push("inputMismatch");
        }
        if (target !== null) {
          const reviewed = await reader.reviewed(target, file.path);
          if (reviewed === null || sha256(reviewed) !== file.sha256) reasons.push("reviewedInputMismatch");
        }
      }
      let includesContract = false;
      for (const scope of binding.scope) {
        const bytes = await current(scope.path);
        try {
          if (bytes === null) throw new Error("missing scope");
          const section = exactMarkdownSection(utf8(bytes), scope.headingPath);
          observed[`${scope.path}#${scope.headingPath}`] = sha256(section);
          if (sha256(section) !== scope.sha256) reasons.push("scopeMismatch");
          if (scope.path === contract.path && section === selectedContract) includesContract = true;
          if (target !== null) {
            const reviewed = await reader.reviewed(target, scope.path);
            if (reviewed === null || sha256(exactMarkdownSection(utf8(reviewed), scope.headingPath)) !== scope.sha256) reasons.push("reviewedScopeMismatch");
          }
        } catch { observed[`${scope.path}#${scope.headingPath}`] = null; reasons.push("scopeMissing"); }
      }
      if (!includesContract || !binding.scope.some(scope => scope.path === owner.path)) reasons.push("scopeIncomplete");
      try {
        const scenario = JSON.parse(utf8(bytesByPath.get(binding.scenario.path)!));
        const profile = JSON.parse(utf8(bytesByPath.get(binding.profile.path)!));
        if (profile.kind !== "semanticProfile" || profile.id !== model?.profile || scenario.kind !== "scenario" ||
            scenario.profile !== model?.profile || scenario.bpmn?.relativePath !== binding.source.path ||
            scenario.bpmn?.sha256 !== binding.source.sha256) reasons.push("scenarioProfileMismatch");
        const expectedOverlay = binding.sourceOverlay === null ? undefined : { id: binding.sourceOverlay.id, sha256: binding.sourceOverlay.sha256 };
        if (canonical(scenario.bpmn?.sourceOverlay) !== canonical(expectedOverlay)) reasons.push("overlayMismatch");
        if (binding.sourceOverlay !== null) {
          const overlay = JSON.parse(utf8(bytesByPath.get(binding.sourceOverlay.path)!));
          if (overlay.kind !== "bpmnSourceOverlay" || overlay.id !== binding.sourceOverlay.id || overlay.semanticProfile !== model?.profile) reasons.push("overlayMismatch");
        }
      } catch { reasons.push("scenarioProfileMalformed"); }
      if (target !== null) {
        const reviewedOwner = await reader.reviewed(target, owner.path);
        try {
          if (reviewedOwner === null || bindingRows(utf8(reviewedOwner)).get(id)?.raw !== rawBinding) reasons.push("bindingUnreviewed");
          const reviewedManifest = await reader.reviewed(target, manifestPath);
          const reviewedModel = reviewedManifest === null ? undefined : requireExecutableModelCorpusManifest(JSON.parse(utf8(reviewedManifest)))
            .models.find(model => model.id === modelId);
          if (model === undefined || reviewedModel === undefined || canonical(representativeScope(reviewedModel)) !== canonical(representativeScope(model))) reasons.push("representativeUnreviewed");
        } catch { reasons.push("bindingUnreviewed"); }
      }
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    rows.push({ id, modelId, bindingSha256: binding === null ? null : sha256(canonical(binding)),
      scopeSha256: sha256(canonical({ selection: cells, representative: model === undefined ? null : representativeScope(model), binding, observed })),
      status: binding !== null && target !== null && uniqueReasons.length === 0 ? "accepted" : "open", reasons: uniqueReasons,
      closure: { owner: owner.path, target, verdict } });
  }
  rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const acceptedVariants = rows.filter(row => row.status === "accepted").length;
  return { rows, acceptedVariants, openVariants: rows.length - acceptedVariants };
}

/** Validates compact persisted facts without upgrading an open or unbound row into acceptance. */
export function requireSelectedDeliveryCohort(value: unknown): SelectedDeliveryCohort {
  const cohort = object(value, ["rows", "acceptedVariants", "openVariants"]);
  if (!Array.isArray(cohort.rows)) throw new TypeError("invalid selected delivery cohort");
  const ids = new Set<string>();
  for (const value of cohort.rows) {
    const row = object(value, ["id", "modelId", "scopeSha256", "bindingSha256", "status", "reasons", "closure"]);
    const id = text(row.id);
    text(row.modelId);
    if (ids.has(id)) throw new TypeError(`duplicate selected variant ID: ${id}`);
    ids.add(id);
    if (!digestPattern.test(text(row.scopeSha256)) || row.bindingSha256 !== null && !digestPattern.test(text(row.bindingSha256))) throw new TypeError("invalid selected scope digest");
    const closure = object(row.closure, ["owner", "target", "verdict"]);
    relativePath(closure.owner);
    text(closure.verdict);
    if (closure.target !== null && !/^[0-9a-f]{7,40}$/u.test(text(closure.target))) throw new TypeError("invalid closure target");
    if (!Array.isArray(row.reasons) || !row.reasons.every(reason => typeof reason === "string" && reason.length > 0) ||
        new Set(row.reasons).size !== row.reasons.length) throw new TypeError("invalid selected acceptance reasons");
    switch (row.status) {
      case "accepted":
        if (row.bindingSha256 === null || closure.target === null || row.reasons.length !== 0 ||
            !["approve", "approve-with-required-edits"].includes(String(closure.verdict))) throw new TypeError("invalid selected acceptance claim");
        break;
      case "open":
        if (row.reasons.length === 0) throw new TypeError("open selected acceptance needs a missing or failed input");
        break;
      default: throw new TypeError("invalid selected acceptance status");
    }
  }
  const accepted = cohort.rows.filter(row => (row as SelectedDeliveryRow).status === "accepted").length;
  if (cohort.acceptedVariants !== accepted || cohort.openVariants !== cohort.rows.length - accepted) throw new TypeError("selected acceptance counts disagree with rows");
  return value as SelectedDeliveryCohort;
}

/** New or changed bindings are scope facts; a rate uses only unchanged, previously bound identities. */
export function compareSelectedDeliveryCohorts(
  before: SelectedDeliveryCohort | undefined,
  after: SelectedDeliveryCohort | undefined,
  elapsedWindowMs: number,
) {
  const oldRows = new Map(before?.rows.map(row => [row.id, row]) ?? []);
  const newRows = new Map(after?.rows.map(row => [row.id, row]) ?? []);
  const shared = [...oldRows.keys()].filter(id => newRows.has(id)).sort();
  const sameIdentity = shared.filter(id => oldRows.get(id)!.modelId === newRows.get(id)!.modelId);
  const stable = sameIdentity.filter(id => oldRows.get(id)!.bindingSha256 !== null &&
    oldRows.get(id)!.bindingSha256 === newRows.get(id)!.bindingSha256 && oldRows.get(id)!.scopeSha256 === newRows.get(id)!.scopeSha256);
  const accepted = (rows: Map<string, SelectedDeliveryRow>, id: string) => rows.get(id)!.status === "accepted";
  const closedVariantIds = stable.filter(id => !accepted(oldRows, id) && accepted(newRows, id));
  const openedVariantIds = stable.filter(id => accepted(oldRows, id) && !accepted(newRows, id));
  return {
    beforeTotal: before?.rows.length ?? null, afterTotal: after?.rows.length ?? null,
    beforeAcceptedVariants: before?.acceptedVariants ?? null, afterAcceptedVariants: after?.acceptedVariants ?? null,
    afterOpenVariantIds: after === undefined ? null : after.rows.filter(row => row.status === "open").map(row => row.id).sort(),
    addedIds: [...newRows.keys()].filter(id => !oldRows.has(id)).sort(),
    removedIds: [...oldRows.keys()].filter(id => !newRows.has(id)).sort(),
    identityChangedIds: shared.filter(id => !sameIdentity.includes(id)),
    scopeChangedIds: sameIdentity.filter(id => oldRows.get(id)!.scopeSha256 !== newRows.get(id)!.scopeSha256),
    bindingIntroducedIds: sameIdentity.filter(id => oldRows.get(id)!.bindingSha256 === null && newRows.get(id)!.bindingSha256 !== null),
    bindingRemovedIds: sameIdentity.filter(id => oldRows.get(id)!.bindingSha256 !== null && newRows.get(id)!.bindingSha256 === null),
    bindingChangedIds: sameIdentity.filter(id => oldRows.get(id)!.bindingSha256 !== null && newRows.get(id)!.bindingSha256 !== null &&
      oldRows.get(id)!.bindingSha256 !== newRows.get(id)!.bindingSha256),
    stableBoundCount: stable.length, stableAcceptedBefore: stable.filter(id => accepted(oldRows, id)).length,
    stableAcceptedAfter: stable.filter(id => accepted(newRows, id)).length, closedVariantIds, openedVariantIds,
    ratePerDay: stable.length === 0 ? null : (closedVariantIds.length - openedVariantIds.length) * 86_400_000 / elapsedWindowMs,
    rateBasis: "Net accepted variants per calendar day on unchanged, previously bound IDs/scopes only; no ETA or effort estimate.",
  };
}
