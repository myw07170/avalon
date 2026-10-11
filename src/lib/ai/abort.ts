/** Apply cancellation to the entire operation, including response-body reads. */
export async function withAbort<T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return operation();

  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([aborted, operation()]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
