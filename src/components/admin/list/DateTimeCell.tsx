import { formatTimestampParts } from "@/lib/format-date";

export function DateTimeCell({ iso }: { iso: string | null | undefined }) {
  const parts = formatTimestampParts(iso);
  if (!parts) return <span className="text-gray-400">—</span>;
  return (
    <div className="leading-tight">
      <div>{parts.date}</div>
      <div className="text-gray-400">{parts.time}</div>
    </div>
  );
}

export function UpdatedDateTimeCell({
  createdAt,
  updatedAt,
}: {
  createdAt: string | null | undefined;
  updatedAt: string | null | undefined;
}) {
  if (!updatedAt) return <span className="text-gray-400">—</span>;
  if (
    createdAt &&
    new Date(createdAt).getTime() === new Date(updatedAt).getTime()
  ) {
    return <span className="text-gray-400">—</span>;
  }
  return <DateTimeCell iso={updatedAt} />;
}
