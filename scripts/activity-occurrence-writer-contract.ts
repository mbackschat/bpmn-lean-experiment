export const SourceLanguage = {
  Lean: "lean",
  TypeScript: "typescript",
} as const;

export type SourceLanguage = typeof SourceLanguage[keyof typeof SourceLanguage];

export const WriterClassification = {
  Initializer: "initializer",
  Issuer: "issuer",
  IdentityPreserving: "identity-preserving",
  IdentityRemoving: "identity-removing",
} as const;

export type WriterClassification = typeof WriterClassification[keyof typeof WriterClassification];

export const ClaimPreservation = {
  Initializer: "initializer",
  DisjointInsertion: "disjoint-insertion",
  Removal: "removal",
  BodyReplacement: "body-replacement",
  MemberRemoval: "member-removal",
  ProjectionPreserving: "claim-projection-preserving",
} as const;

export type ClaimPreservation = typeof ClaimPreservation[keyof typeof ClaimPreservation];

export type Evidence = Readonly<{
  relativePath: string;
  markers: ReadonlyArray<string>;
}>;

export type WriterRecord = Readonly<{
  classification: WriterClassification;
  claimPreservation: ClaimPreservation;
  evidence?: Evidence;
  claimEvidence?: Evidence;
}>;
