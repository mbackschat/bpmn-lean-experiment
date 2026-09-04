export const MuePreviewBetaEvidenceKind = {
  GeneratedEvidence: "generatedEvidence",
  ProductionJourney: "productionJourney",
  RegisteredExecutableCapability: "registeredExecutableCapability",
  ReviewedCheckpointOnly: "reviewedCheckpointOnly",
} as const;

export type MuePreviewBetaEvidenceKind =
  typeof MuePreviewBetaEvidenceKind[keyof typeof MuePreviewBetaEvidenceKind];

export const MuePreviewBetaProductSurface = {
  About: "About",
  DefinitionsAndTriggers: "Definitions / Triggers",
  None: "None",
  Operations: "Operations",
} as const;

export type MuePreviewBetaProductSurface =
  typeof MuePreviewBetaProductSurface[keyof typeof MuePreviewBetaProductSurface];

export type MuePreviewBetaCheckpoint = Readonly<{
  id:
    | "SEQUENTIAL-MULTI-INSTANCE"
    | "INTERNAL-COMMUTATION"
    | "PARALLEL-MULTI-INSTANCE"
    | "MECHANISM-MATURITY-EVIDENCE"
    | "DATA-AND-TASK-MECHANISMS"
    | "EVENT-SUBSCRIPTIONS"
    | "COMPENSATION-TRANSACTIONS";
  title: string;
  evidenceKind: MuePreviewBetaEvidenceKind;
  productSurface: MuePreviewBetaProductSurface;
  boundary: string;
  remainingLimit: string;
}>;

const checkpoint = (
  value: MuePreviewBetaCheckpoint,
): MuePreviewBetaCheckpoint => Object.freeze(value);

export const muePreviewBetaCheckpoints = Object.freeze([
  checkpoint({
    id: "SEQUENTIAL-MULTI-INSTANCE",
    title: "Sequential Multi-Instance",
    evidenceKind: MuePreviewBetaEvidenceKind.ProductionJourney,
    productSurface: MuePreviewBetaProductSurface.Operations,
    boundary: "Closure-reviewed bounded natural and Timer-interrupted Sequential Multi-Instance journey",
    remainingLimit: "broader Multi-Instance behavior remains outside the slice.",
  }),
  checkpoint({
    id: "INTERNAL-COMMUTATION",
    title: "Internal Commutation",
    evidenceKind: MuePreviewBetaEvidenceKind.ReviewedCheckpointOnly,
    productSurface: MuePreviewBetaProductSurface.None,
    boundary: "Approved first green final-implementation semantic checkpoint",
    remainingLimit: "scheduled-mode admission, region footprints, and arbitrary-batch theorem remain open.",
  }),
  checkpoint({
    id: "PARALLEL-MULTI-INSTANCE",
    title: "Parallel Multi-Instance",
    evidenceKind: MuePreviewBetaEvidenceKind.RegisteredExecutableCapability,
    productSurface: MuePreviewBetaProductSurface.About,
    boundary: "Closure-reviewed bounded parallel User Task capability",
    remainingLimit: "no dedicated Product 2 journey is claimed.",
  }),
  checkpoint({
    id: "MECHANISM-MATURITY-EVIDENCE",
    title: "Mechanism Maturity Evidence",
    evidenceKind: MuePreviewBetaEvidenceKind.GeneratedEvidence,
    productSurface: MuePreviewBetaProductSurface.About,
    boundary: "Complete generated family vector with separate dimensions",
    remainingLimit: "it is not a support percentage or semantic capability.",
  }),
  checkpoint({
    id: "DATA-AND-TASK-MECHANISMS",
    title: "Data and Task Mechanisms",
    evidenceKind: MuePreviewBetaEvidenceKind.RegisteredExecutableCapability,
    productSurface: MuePreviewBetaProductSurface.About,
    boundary: "Closure-reviewed direct Activity input and output slices",
    remainingLimit: "no Work form or browser data-editing workflow is claimed.",
  }),
  checkpoint({
    id: "EVENT-SUBSCRIPTIONS",
    title: "Event Subscriptions",
    evidenceKind: MuePreviewBetaEvidenceKind.ProductionJourney,
    productSurface: MuePreviewBetaProductSurface.DefinitionsAndTriggers,
    boundary: "Closure-reviewed one-key definition-scoped Message correlation",
    remainingLimit: "composite keys, buffering, broadcast, and other Message loci remain open.",
  }),
  checkpoint({
    id: "COMPENSATION-TRANSACTIONS",
    title: "Compensation and Transactions",
    evidenceKind: MuePreviewBetaEvidenceKind.ReviewedCheckpointOnly,
    productSurface: MuePreviewBetaProductSurface.None,
    boundary: "First reviewed end-to-end private Compensation checkpoint",
    remainingLimit: "profile registration, public commands, corpus, and Product 2 capability remain absent.",
  }),
]);
