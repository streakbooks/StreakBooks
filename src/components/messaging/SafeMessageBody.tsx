import { segmentMessagingBody } from "@/lib/messaging/linkify";

/** Renders plain message text safely in React, with mentions and http(s) links. */
export function SafeMessageBody({ body }: { body: string }) {
  const segments = segmentMessagingBody(body);
  return (
    <p className="whitespace-pre-wrap text-sm">
      {segments.map((segment, index) => {
        if (segment.type === "mention") {
          return (
            <span key={`${segment.value}-${index}`} className="font-medium text-primary">
              {segment.value}
            </span>
          );
        }
        if (segment.type === "url") {
          return (
            <a
              key={`${segment.href}-${index}`}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-2"
            >
              {segment.value}
            </a>
          );
        }
        return <span key={`text-${index}`}>{segment.value}</span>;
      })}
    </p>
  );
}
