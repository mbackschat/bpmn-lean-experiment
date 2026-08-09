/** Bounds one asynchronous host operation without changing its domain result. */
export function withDeadline<Value>(
  promise: Promise<Value>,
  timeoutMs: number,
  operation: string,
): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

/** Preserves an observed Error and gives non-Error failures an owned message. */
export function normalizeError(
  error: unknown,
  fallbackMessage: string,
): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}
