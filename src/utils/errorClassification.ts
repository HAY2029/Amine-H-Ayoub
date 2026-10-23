export type AppErrorKind = "offline" | "service" | "application";

const NETWORK_FAILURE_PATTERN =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|err_(?:internet_disconnected|connection|name_not_resolved|address_unreachable)|request timeout|timed out/i;

/** Avoid labeling ordinary application/runtime errors as internet failures. */
export function classifyAppError(error: unknown, isOnline: boolean): AppErrorKind {
  if (!isOnline) return "offline";

  const details =
    error && typeof error === "object"
      ? `${"name" in error ? String(error.name) : ""} ${"message" in error ? String(error.message) : ""}`
      : String(error ?? "");

  if (NETWORK_FAILURE_PATTERN.test(details)) return "service";

  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  if ([500, 502, 503, 504].includes(status)) return "service";

  return "application";
}
