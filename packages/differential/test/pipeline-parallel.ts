/** Waits for every owned lane before surfacing the first failure, so cleanup cannot race siblings. */
export async function settleOwnedLanes<Values extends readonly unknown[]>(
  lanes: { readonly [Index in keyof Values]: Promise<Values[Index]> },
): Promise<Values> {
  const settled = await Promise.allSettled(lanes);
  const failed = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed !== undefined) {
    throw failed.reason;
  }
  return settled.map((result) => {
    if (result.status !== "fulfilled") {
      throw new Error("settled pipeline lane lost its fulfilled value");
    }
    return result.value;
  }) as unknown as Values;
}
