/**
 * The classes of malformed committed state this account refuses.
 *
 * A defect names a failing class, not a rule identifier: no value here reaches a public command
 * result, and `admit` returns its ordinary refusal outcome rather than a diagnosis. The names exist
 * so a fixture can assert *which* class rejected a state instead of only that something did.
 */
export const RuntimeStateDefect = {
  ForeignInstance: "foreignInstance",
  NotStartedWithWork: "notStartedWithWork",
  DanglingWaitOwner: "danglingWaitOwner",
  DuplicateWaitIdentity: "duplicateWaitIdentity",
  LiveIdentityAboveCounter: "liveIdentityAboveCounter",
  UndeclaredWaitIdentity: "undeclaredWaitIdentity",
  UndeclaredHiddenRecord: "undeclaredHiddenRecord",
  UnorderedCollection: "unorderedCollection",
  ActivityOccurrenceBodyAbsent: "activityOccurrenceBodyAbsent",
  DuplicateActivityBodyClaim: "duplicateActivityBodyClaim",
  UnownedAttachedWait: "unownedAttachedWait",
  DuplicateActivityOccurrence: "duplicateActivityOccurrence",
  SequentialMultiInstanceControllerProfileMismatch:
    "sequentialMultiInstanceControllerProfileMismatch",
  SequentialMultiInstanceControllerUnowned: "sequentialMultiInstanceControllerUnowned",
  SequentialMultiInstanceControllerBindingMismatch:
    "sequentialMultiInstanceControllerBindingMismatch",
  DuplicateSequentialMultiInstanceController: "duplicateSequentialMultiInstanceController",
  SequentialMultiInstanceExhausted: "sequentialMultiInstanceExhausted",
  ParallelMultiInstanceControllerProfileMismatch:
    "parallelMultiInstanceControllerProfileMismatch",
  ParallelMultiInstanceControllerUnowned: "parallelMultiInstanceControllerUnowned",
  ParallelMultiInstanceControllerBindingMismatch:
    "parallelMultiInstanceControllerBindingMismatch",
  DuplicateParallelMultiInstanceController: "duplicateParallelMultiInstanceController",
  ParallelMultiInstanceExhausted: "parallelMultiInstanceExhausted",
  CompensationActivityRetentionProfileMismatch:
    "compensationActivityRetentionProfileMismatch",
  CompensationActivityRetentionInvalid: "compensationActivityRetentionInvalid",
  CompensationEventSubProcessSnapshotProfileMismatch:
    "compensationEventSubProcessSnapshotProfileMismatch",
  CompensationEventSubProcessSnapshotInvalid:
    "compensationEventSubProcessSnapshotInvalid",
  CompensationExecutionProfileMismatch: "compensationExecutionProfileMismatch",
  CompensationExecutionInvalid: "compensationExecutionInvalid",
} as const;

export type RuntimeStateDefect =
  (typeof RuntimeStateDefect)[keyof typeof RuntimeStateDefect];
