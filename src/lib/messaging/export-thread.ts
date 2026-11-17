import type { MessagingMessage } from "@/lib/messaging/types";

/** Build a plain-text export. Never includes attachment binaries. */
export function buildMessagingThreadExport(input: {
  title: string;
  conversationId: string;
  messages: MessagingMessage[];
}): string {
  const lines = [
    `LinkBooks Messages export`,
    `Conversation: ${input.title}`,
    `Id: ${input.conversationId}`,
    `Exported at: ${new Date().toISOString()}`,
    `Messages: ${input.messages.length}`,
    "",
    "---",
    "",
  ];
  for (const message of input.messages) {
    lines.push(
      `#${message.seq} · ${message.created_at} · ${message.author_name ?? message.author_user_id ?? "system"}`,
    );
    lines.push(message.is_redacted ? "[Message removed]" : message.body);
    lines.push("");
  }
  lines.push("---");
  lines.push("This export is for authorised internal use. Chat text never posts or pays.");
  return lines.join("\n");
}

export function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
