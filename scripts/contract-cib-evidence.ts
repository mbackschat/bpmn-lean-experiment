/**
 * Retained CIB evidence as the artifact reader sees it. `contracts/schemas/cibseven-evidence.schema.json` owns the shape of
 * `producerObservations`; no TypeScript consumer reads them, because the generic CIB runner's open-wait projector owns the
 * projection to the canonical result and the hosted lane reproduces every retained result from them.
 */
export type CibSevenEvidence = Readonly<{
  kind: "cibSevenScenarioEvidence";
  scenario: Readonly<{ id: string; sha256: string }>;
  profile: Readonly<{ id: string; sha256: string }>;
  producer: Readonly<{
    engineVersion: string;
    engineRevision: string;
  }>;
  producerObservations: Readonly<Record<string, unknown>>;
  result: Readonly<{
    outcome: unknown;
    trace: ReadonlyArray<Readonly<Record<string, unknown>>>;
  }>;
}>;
