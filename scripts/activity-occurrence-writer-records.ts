/**
 * The reviewed classification of every production writer of the Activity-occurrence collection.
 *
 * This is the census's oracle, not its parser: [the guard](activity-occurrence-writer-census.test.ts)
 * discovers writer sites from source and fails when the discovered set and this map disagree, so a
 * new writer stays unclassified until its row and its evidence land together.
 *
 * Keys are `<relative path>#<owner>@<ordinal>`, where the ordinal separates several writes inside one
 * owner. Evidence markers are exact substrings of the named file, so a renamed theorem or a reworded
 * test message invalidates the row rather than silently continuing to vouch for it.
 */
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

export const writerRecords = new Map<string, WriterRecord>([
  ["BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean#replacedState@1", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.BodyReplacement,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem replacedState_activity_identity_discipline"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean",
      markers: ["theorem replaceBodyIn_preserves_activityBodyClaimsUnique"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ActivityDataInput.lean#activateDataInputUserTask?@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityDataInput.lean",
      markers: ["theorem activateDataInputUserTask_issues_fresh_activity"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityBodyClaimWriterPreservation.lean",
      markers: ["theorem activateDataInputUserTask_preserves_activityBodyClaimsUnique"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ActivityDataInput.lean#completeDataInputUserTask?@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityDataInput.lean",
      markers: ["theorem completeDataInputUserTask_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ActivityDataOutput.lean#activateDataOutputUserTask?@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityDataOutput.lean",
      markers: ["theorem activateDataOutputUserTask_issues_fresh_activity"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityBodyClaimWriterPreservation.lean",
      markers: ["theorem activateDataOutputUserTask_preserves_activityBodyClaimsUnique"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ActivityDataOutput.lean#completeDataOutputUserTask?@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityDataOutput.lean",
      markers: ["theorem completeDataOutputUserTask_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/CompensationTriggerHandlerCompletion.lean#compensationFailureSuccessor@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/CompensationTriggerHandlerCompletion.lean",
      markers: ["theorem compensationFailureSuccessor_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/CompensationTriggerHandlerCancellation.lean#CompensationHandlerFailureCancellationStep@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/CompensationTriggerHandlerCancellation.lean",
      markers: ["theorem CompensationHandlerFailureCancellationStep.activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/BoundedScope.lean#BoundedScopeVictoryStep@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem boundedScopeVictoryStep_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/BoundedScope.lean#completeBoundedScope?@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem completeBoundedScope_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/BoundedScopeArming.lean#armScopeDeadline@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/BoundedScopeArming.lean",
      markers: ["theorem armScopeDeadline_issues_fresh_activity", "activityIdentityIssuingDiscipline state"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityBodyClaimWriterPreservation.lean",
      markers: ["theorem armBoundedScopeState_preserves_activityBodyClaimsUnique"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/MessageBoundedTask.lean#MessageBoundedTaskVictoryStep@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/MessageBoundedTask.lean",
      markers: ["theorem messageBoundedTaskVictory_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/MessageBoundedTask.lean#MessageBoundedTaskVictoryStep@2", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/MessageBoundedTask.lean",
      markers: ["theorem messageBoundedTaskVictory_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/MessageBoundedTask.lean#activateMessageBoundedUserTask@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/MessageBoundedTask.lean",
      markers: ["theorem activateMessageBoundedUserTask_issues_fresh_activity"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/MessageBoundedTaskLaws.lean",
      markers: ["theorem activateMessageBoundedUserTask_preserves_activityBodyClaimsUnique"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/MessageBoundedTask.lean#commitMessageBoundedVictory@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/MessageBoundedTask.lean",
      markers: ["theorem commitMessageBoundedVictory_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#closeSharedParallelRegion@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem closeSharedParallelRegion_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#progressedSharedParallelCompletionState@1", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.MemberRemoval,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem replaceParallelRecordBody_activity_identity_discipline"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityBodyClaimWriterPreservation.lean",
      markers: ["theorem replaceParallelRecordBody_preserves_activityBodyClaimsUnique"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#enterSharedParallelMultiInstance?@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem enterSharedParallelMultiInstance_issues_fresh_activity"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEntryPreservation.lean",
      markers: ["theorem sharedParallelEntry_preserves_runtimeStateWellFormed"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#SharedParallelMultiInstanceCompletionStep@1", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.MemberRemoval,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem replaceParallelRecordBody_activity_identity_discipline"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityBodyClaimWriterPreservation.lean",
      markers: ["theorem replaceParallelRecordBody_preserves_activityBodyClaimsUnique"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#SharedParallelMultiInstanceEntryStep@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem enterSharedParallelMultiInstance_issues_fresh_activity"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEntryPreservation.lean",
      markers: ["theorem sharedParallelEntry_preserves_runtimeStateWellFormed"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/RuntimeState.lean#initialState@1", {
    classification: WriterClassification.Initializer,
    claimPreservation: ClaimPreservation.Initializer,
  }],
  ["BpmnSemantics/SemanticProcess/ScopeCancellation.lean#cancelScopeSubtree@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem cancelScopeSubtree_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/SequentialMultiInstanceRewrite.lean#finalCompletionState@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem finalCompletionState_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/SequentialMultiInstanceRewrite.lean#interruptionState@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem interruptionState_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/WaitActivation.lean#activateBoundedUserTask@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/WaitActivation.lean",
      markers: ["theorem activateBoundedUserTask_issues_fresh_activity", "activityIdentityIssuingDiscipline state"],
    },
    claimEvidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ActivityBodyClaimWriterPreservation.lean",
      markers: ["theorem activateBoundedUserTask_preserves_activityBodyClaimsUnique"],
    },
  }],
  ["packages/semantic-core/src/activity-body-turnover.ts#replaceActivityBodyTask@1", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.BodyReplacement,
    evidence: {
      relativePath: "packages/semantic-core/test/activity-body-turnover.test.ts",
      markers: ["runtimeStateRegressions(before, after)", "preserving the exact outer identity"],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/activity-body-turnover.test.ts",
      markers: ["RuntimeStateDefect.DuplicateActivityBodyClaim", "body replacement preserves unique Activity body claims"],
    },
  }],
  ["packages/semantic-core/src/compensation-trigger-handler-completion.ts#completeFailure@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
    evidence: {
      relativePath: "packages/semantic-core/test/compensation-trigger-handler-completion.test.ts",
      markers: [
        "assert.deepEqual(failed.state.activityOccurrences, []);",
        "assert.deepEqual(failed.state.variables.activities, []);",
      ],
    },
  }],
  ["packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts#armBoundedScope@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "packages/semantic-core/test/subprocess-boundary-timer.test.ts",
      markers: ["runtimeStateRegressions(pair.before, pair.after)", "RuntimeStateRegression.ActivityOccurrenceIssue"],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/subprocess-boundary-timer.test.ts",
      markers: ["RuntimeStateDefect.DuplicateActivityBodyClaim", "bounded scope arming inserts a disjoint Activity body claim"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts#withdrawBoundedScopeDeadline@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-activity-arming.ts#armActivityWithBoundaryTimer@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "packages/semantic-core/test/activity-boundary-timer.test.ts",
      markers: ["runtimeStateRegressions(pair.before, pair.after)", "RuntimeStateRegression.ActivityOccurrenceIssue"],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/activity-boundary-timer.test.ts",
      markers: ["RuntimeStateDefect.DuplicateActivityBodyClaim", "bounded User Task arming inserts a disjoint Activity body claim"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-activity-data-input-runtime.ts#armDataInputUserTask@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "packages/semantic-core/test/activity-data-input.test.ts",
      markers: [
        "runtimeStateRegressions(initialState, started)",
        "RuntimeStateRegression.ActivityOccurrenceIssue",
      ],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/activity-data-input.test.ts",
      markers: [
        "RuntimeStateDefect.DuplicateActivityBodyClaim",
        "data-input arming inserts a disjoint Activity body claim",
      ],
    },
  }],
  ["packages/semantic-core/src/semantic-process-activity-data-input-runtime.ts#completeDataInputUserTask@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-activity-data-output-runtime.ts#armDataOutputUserTask@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "packages/semantic-core/test/activity-data-output.test.ts",
      markers: [
        "runtimeStateRegressions(initialState, state)",
        "RuntimeStateRegression.ActivityOccurrenceIssue",
      ],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/activity-data-output.test.ts",
      markers: [
        "RuntimeStateDefect.DuplicateActivityBodyClaim",
        "data-output arming inserts a disjoint Activity body claim",
      ],
    },
  }],
  ["packages/semantic-core/src/semantic-process-activity-data-output-runtime.ts#completeDataOutputUserTask@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-bounded-task-runtime.ts#commitVictory@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-call-runtime.ts#removeCalledProcessTree@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-monitored-task-runtime.ts#completeMonitoredUserTask@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-message-bounded-task-runtime.ts#armMessageBoundedUserTask@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "packages/semantic-core/test/activity-boundary-message.test.ts",
      markers: [
        "runtimeStateRegressions(initialState, state)",
        "RuntimeStateRegression.ActivityOccurrenceIssue",
      ],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/activity-boundary-message.test.ts",
      markers: [
        "RuntimeStateDefect.DuplicateActivityBodyClaim",
        "Message-bounded User Task arming inserts a disjoint Activity body claim",
      ],
    },
  }],
  ["packages/semantic-core/src/semantic-process-message-bounded-task-runtime.ts#commitVictory@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-monitored-task-runtime.ts#spawnFromMonitoredUserTask@1", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.ProjectionPreserving,
    evidence: {
      relativePath: "packages/semantic-core/test/non-interrupting-boundary-timer.test.ts",
      markers: ["runtimeStateRegressions(state, spawned.state)", "preserves the exact host Activity identity"],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/non-interrupting-boundary-timer.test.ts",
      markers: ["RuntimeStateDefect.DuplicateActivityBodyClaim", "claim-projection-preserving spawn keeps every Activity body claim"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-parallel-multi-instance-runtime.ts#closeParallelMultiInstance@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-parallel-multi-instance-runtime.ts#completeParallelMultiInstanceChild@1", {
    classification: WriterClassification.IdentityPreserving,
    claimPreservation: ClaimPreservation.MemberRemoval,
    evidence: {
      relativePath: "packages/semantic-core/test/parallel-multi-instance-entry.test.ts",
      markers: [
        "runtimeStateRegressions(entered.state, third.state)",
        "parallel child turnover preserves the exact outer identity",
      ],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/parallel-multi-instance-entry.test.ts",
      markers: ["RuntimeStateDefect.DuplicateActivityBodyClaim", "parallel member removal preserves unique Activity body claims"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-parallel-multi-instance-runtime.ts#enterParallelMultiInstanceUserTask@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "packages/semantic-core/test/parallel-multi-instance-entry.test.ts",
      markers: [
        "runtimeStateRegressions(before, entered.state)",
        "RuntimeStateRegression.ActivityOccurrenceIssue",
      ],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/parallel-multi-instance-entry.test.ts",
      markers: ["RuntimeStateDefect.DuplicateActivityBodyClaim", "parallel entry inserts one disjoint multi-member Activity body"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-scope-cancellation.ts#removeScopeOccurrenceRegion@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-sequential-multi-instance-runtime.ts#completeSequentialMultiInstanceIteration@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-sequential-multi-instance-runtime.ts#enterSequentialMultiInstanceUserTask@1", {
    classification: WriterClassification.Issuer,
    claimPreservation: ClaimPreservation.DisjointInsertion,
    evidence: {
      relativePath: "packages/semantic-core/test/sequential-multi-instance-entry.test.ts",
      markers: ["runtimeStateRegressions(before, state)", "RuntimeStateRegression.ActivityOccurrenceIssue"],
    },
    claimEvidence: {
      relativePath: "packages/semantic-core/test/sequential-multi-instance-entry.test.ts",
      markers: ["RuntimeStateDefect.DuplicateActivityBodyClaim", "sequential entry inserts one disjoint Activity body claim"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-sequential-multi-instance-runtime.ts#interruptSequentialMultiInstance@1", {
    classification: WriterClassification.IdentityRemoving,
    claimPreservation: ClaimPreservation.Removal,
  }],
  ["packages/semantic-core/src/semantic-process-state.ts#initialState@1", {
    classification: WriterClassification.Initializer,
    claimPreservation: ClaimPreservation.Initializer,
  }],
]);
