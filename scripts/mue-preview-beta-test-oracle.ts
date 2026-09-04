export type MuePreviewBetaTestOracleRow = Readonly<{
  id:
    | "SEQUENTIAL-MULTI-INSTANCE"
    | "INTERNAL-COMMUTATION"
    | "PARALLEL-MULTI-INSTANCE"
    | "MECHANISM-MATURITY-EVIDENCE"
    | "DATA-AND-TASK-MECHANISMS"
    | "EVENT-SUBSCRIPTIONS"
    | "COMPENSATION-TRANSACTIONS";
  title: string;
  evidenceKind:
    | "generatedEvidence"
    | "productionJourney"
    | "registeredExecutableCapability"
    | "reviewedCheckpointOnly";
  evidenceLabel: string;
  productSurface: "About" | "Definitions / Triggers" | "None" | "Operations";
  productSurfaceLabel: string;
  boundary: string;
  remainingLimit: string;
}>;

/**
 * Independent test oracle for the MUE Preview Beta rows.
 *
 * This fixture neither owns nor generates the artifacts it checks. PLAN owns the denominator, the
 * Beta specification owns the reviewed evidence matrix, and Product 2 owns its presentation catalog;
 * all three remain separate handwritten statements compared against this fourth test-only statement.
 * See docs/MUE-PREVIEW-BETA-SPEC.md#acceptance-and-tag-boundary.
 */
export const muePreviewBetaTestOracle = [
  {
    id: "SEQUENTIAL-MULTI-INSTANCE",
    title: "Sequential Multi-Instance",
    evidenceKind: "productionJourney",
    evidenceLabel: "Production journey",
    productSurface: "Operations",
    productSurfaceLabel: "Operations",
    boundary: "Closure-reviewed bounded natural and Timer-interrupted Sequential Multi-Instance journey",
    remainingLimit: "broader Multi-Instance behavior remains outside the slice.",
  },
  {
    id: "INTERNAL-COMMUTATION",
    title: "Internal Commutation",
    evidenceKind: "reviewedCheckpointOnly",
    evidenceLabel: "Reviewed checkpoint only",
    productSurface: "None",
    productSurfaceLabel: "No Product 2 executable surface",
    boundary: "Approved first green final-implementation semantic checkpoint",
    remainingLimit: "scheduled-mode admission, region footprints, and arbitrary-batch theorem remain open.",
  },
  {
    id: "PARALLEL-MULTI-INSTANCE",
    title: "Parallel Multi-Instance",
    evidenceKind: "registeredExecutableCapability",
    evidenceLabel: "Registered executable capability",
    productSurface: "About",
    productSurfaceLabel: "About",
    boundary: "Closure-reviewed bounded parallel User Task capability",
    remainingLimit: "no dedicated Product 2 journey is claimed.",
  },
  {
    id: "MECHANISM-MATURITY-EVIDENCE",
    title: "Mechanism Maturity Evidence",
    evidenceKind: "generatedEvidence",
    evidenceLabel: "Generated evidence",
    productSurface: "About",
    productSurfaceLabel: "About",
    boundary: "Complete generated family vector with separate dimensions",
    remainingLimit: "it is not a support percentage or semantic capability.",
  },
  {
    id: "DATA-AND-TASK-MECHANISMS",
    title: "Data and Task Mechanisms",
    evidenceKind: "registeredExecutableCapability",
    evidenceLabel: "Registered executable capability",
    productSurface: "About",
    productSurfaceLabel: "About",
    boundary: "Closure-reviewed direct Activity input and output slices",
    remainingLimit: "no Work form or browser data-editing workflow is claimed.",
  },
  {
    id: "EVENT-SUBSCRIPTIONS",
    title: "Event Subscriptions",
    evidenceKind: "productionJourney",
    evidenceLabel: "Production journey",
    productSurface: "Definitions / Triggers",
    productSurfaceLabel: "Definitions / Triggers",
    boundary: "Closure-reviewed one-key definition-scoped Message correlation",
    remainingLimit: "composite keys, buffering, broadcast, and other Message loci remain open.",
  },
  {
    id: "COMPENSATION-TRANSACTIONS",
    title: "Compensation and Transactions",
    evidenceKind: "reviewedCheckpointOnly",
    evidenceLabel: "Reviewed checkpoint only",
    productSurface: "None",
    productSurfaceLabel: "No Product 2 executable surface",
    boundary: "First reviewed end-to-end private Compensation checkpoint",
    remainingLimit: "profile registration, public commands, corpus, and Product 2 capability remain absent.",
  },
] as const satisfies ReadonlyArray<MuePreviewBetaTestOracleRow>;
