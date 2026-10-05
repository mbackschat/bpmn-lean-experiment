import { ClaimPreservation, WriterClassification } from "./activity-occurrence-writer-contract.ts";
import type { WriterRecord } from "./activity-occurrence-writer-contract.ts";

export const repeatedScopeWriterRecords: ReadonlyArray<readonly [string, WriterRecord]> = [
  ["BpmnSemantics/SemanticProcess/SequentialScopeRuntime.lean#completeSequentialScopeResult?@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/SequentialScopeRuntimeLaws.lean",
      markers: ["theorem sequentialScope_completion_activity_identity"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/SequentialScopeRuntime.lean#completeSequentialScopeResult?@2", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.BodyReplacement,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/SequentialScopeRuntimeLaws.lean",
      markers: ["theorem sequentialScope_completion_activity_identity"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/SequentialScopeRuntimeLaws.lean",
      markers: ["theorem sequentialScope_completion_body_claims"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/SequentialScopeRuntime.lean#enterSequentialScopeResult?@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/SequentialScopeRuntimeLaws.lean",
      markers: ["theorem sequentialScope_entry_activity_identity"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/SequentialScopeRuntimeLaws.lean",
      markers: ["theorem sequentialScope_entry_body_claims"],
    },
  }],
  ["packages/semantic-core/src/sequential-scope-runtime.ts#completeSequentialScopeStep@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/sequential-scope-runtime.ts#completeSequentialScopeStep@2", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.BodyReplacement,
    evidence: {
      relativePath: "packages/semantic-core/test/sequential-scope-runtime.test.ts",
      markers: ["quiescent body turnover keeps the outer identity and total, reinitializes locals, and issues one fresh child"],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/sequential-scope-runtime.test.ts",
      markers: ["turnover and terminal completion preserve unrelated scope data, tokens and Activity claims"],
    },
  }],
  ["packages/semantic-core/src/sequential-scope-runtime.ts#enterSequentialScope@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "packages/semantic-core/test/sequential-scope-runtime.test.ts",
      markers: ["positive repeated scope issues one fresh body and initializes locals from the unchanged parent"],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/sequential-scope-runtime.test.ts",
      markers: ["repeated scope entry preserves a sibling and inserts a disjoint body claim"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelScopeRuntime.lean#enterParallelScope?@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: { relativePath: "BpmnSemantics/ParallelScopeRuntimeConformance.lean", markers: ["theorem parallel_entry_disjoint_ownership_fixture"] },
    claimEvidence: { relativePath: "BpmnSemantics/ParallelScopeRuntimeConformance.lean", markers: ["theorem parallel_entry_disjoint_ownership_fixture"] },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelScopeRuntime.lean#completeParallelScope?@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: { relativePath: "BpmnSemantics/ParallelScopeRuntimeConformance.lean", markers: ["theorem parallel_terminal_cleanup_fixture"] },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelScopeRuntime.lean#completeParallelScope?@2", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.MemberRemoval,
    evidence: { relativePath: "BpmnSemantics/ParallelScopeRuntimeConformance.lean", markers: ["theorem parallel_retirement_identity_and_sibling_fixture"] },
    claimEvidence: { relativePath: "BpmnSemantics/ParallelScopeRuntimeConformance.lean", markers: ["theorem parallel_retirement_identity_and_sibling_fixture"] },
  }],
  ["packages/semantic-core/src/parallel-scope-runtime.ts#enterParallelScope@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: { relativePath: "packages/semantic-core/test/parallel-scope-runtime.test.ts", markers: ["entry and partial retirement preserve an unrelated Activity and disjoint body ownership"] },
    claimEvidence: { relativePath: "packages/semantic-core/test/parallel-scope-runtime.test.ts", markers: ["entry and partial retirement preserve an unrelated Activity and disjoint body ownership"] },
  }],
  ["packages/semantic-core/src/parallel-scope-runtime.ts#completeParallelScope@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: { relativePath: "packages/semantic-core/test/parallel-scope-runtime.test.ts", markers: ["both completion orders issue exactly one continuation and keep historical counters"] },
  }],
  ["packages/semantic-core/src/parallel-scope-runtime.ts#completeParallelScope@2", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.MemberRemoval,
    evidence: { relativePath: "packages/semantic-core/test/parallel-scope-runtime.test.ts", markers: ["retirement requires whole-body quiescence and selects the full occurrence identity"] },
    claimEvidence: { relativePath: "packages/semantic-core/test/parallel-scope-runtime.test.ts", markers: ["retirement requires whole-body quiescence and selects the full occurrence identity"] },
  }],
];
