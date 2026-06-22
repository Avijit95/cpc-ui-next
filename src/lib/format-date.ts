// Admin list-page date formatters.
// Format: "DD MMM YYYY, hh:mm A" (e.g. "28 May 2026, 04:30 PM") in IST.
// Backend serves UTC ISO strings; we render in Asia/Kolkata to match the API's
// IST-based reporting (Sprint 5a, ist-time.ts).

const DATE_TIME_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const DATE_ONLY_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const TIME_ONLY_FMT = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // en-IN with hour12 emits e.g. "28 May 2026, 04:30 pm" — uppercase the meridiem.
  return DATE_TIME_FMT.format(d).replace(/\b(am|pm)\b/i, (m) =>
    m.toUpperCase(),
  );
}

/** Returns separate date and time strings for two-line rendering. */
export function formatTimestampParts(
  iso: string | null | undefined,
): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: DATE_ONLY_FMT.format(d),
    time: TIME_ONLY_FMT.format(d).replace(/\b(am|pm)\b/i, (m) =>
      m.toUpperCase(),
    ),
  };
}

export function formatUpdated(
  createdAt: string | null | undefined,
  updatedAt: string | null | undefined,
): string {
  if (!updatedAt) return "—";
  if (createdAt && new Date(createdAt).getTime() === new Date(updatedAt).getTime()) {
    return "—";
  }
  return formatTimestamp(updatedAt);
}
