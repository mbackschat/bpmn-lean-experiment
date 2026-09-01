/** Stable classes of malformed committed runtime state. */
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
} as const;

export type RuntimeStateDefect =
  (typeof RuntimeStateDefect)[keyof typeof RuntimeStateDefect];
