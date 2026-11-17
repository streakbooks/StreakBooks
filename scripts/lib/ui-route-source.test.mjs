import assert from "node:assert/strict";
import test from "node:test";
import { readUiSource } from "./ui-route-source.mjs";

test("source audit follows a directory screen to its index", () => {
  const result = readUiSource("src/routes/_authenticated/messages/index.tsx");
  assert.ok(result.screens.includes("src/screens/messages/index.tsx"));
  assert.match(result.source, /ListWorkspace/);
});

test("source audit still follows a standalone screen", () => {
  const result = readUiSource("src/routes/_authenticated/ai-assistant.tsx");
  assert.deepEqual(result.screens, ["src/screens/ai-assistant.tsx"]);
  assert.match(result.source, /AiAssistant/);
});
