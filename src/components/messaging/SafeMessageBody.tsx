import { extractMentionTokens } from "@/lib/messaging/mentions";

/** Renders plain message text safely in React, highlighting @mentions. */
export function SafeMessageBody({ body }: { body: string }) {
  const tokens = new Set(extractMentionTokens(body));
  if (!tokens.size) {
    return <p className="whitespace-pre-wrap text-sm">{body}</p>;
  }

  const parts = body.split(/(@[^\s@]+)/g);
  return (
    <p className="whitespace-pre-wrap text-sm">
      {parts.map((part, index) => {
        if (part.startsWith("@")) {
          const token = part.slice(1).replace(/[.,;:!?)]+$/g, "").toLowerCase();
          if (tokens.has(token) || tokens.has("everyone")) {
            return (
              <span key={`${part}-${index}`} className="font-medium text-primary">
                {part}
              </span>
            );
          }
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </p>
  );
}
