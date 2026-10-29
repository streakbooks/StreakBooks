import { describe, expect, it } from "vitest";
import { getVoiceServerConfig, voicePublicConfig } from "./server-config";

const valid = {
  OPENAI_API_KEY: "test-only-not-real",
  VOICE_REALTIME_MODEL: "configured-model",
  VOICE_REALTIME_VOICE: "configured-voice",
};

describe("Realtime server configuration", () => {
  it("fails closed when credentials or model are missing", () => {
    expect(() => getVoiceServerConfig({})).toThrow(/not configured/);
    expect(() => getVoiceServerConfig({ ...valid, OPENAI_API_KEY: "" })).toThrow(/not configured/);
    expect(() => getVoiceServerConfig({ ...valid, VOICE_REALTIME_MODEL: "" })).toThrow(/not configured/);
  });
  it("rejects unsafe endpoints and unbounded quotas", () => {
    expect(() => getVoiceServerConfig({ ...valid, VOICE_REALTIME_BASE_URL: "http://example.com" })).toThrow(/https:\/\/api\.openai\.com\/v1/);
    expect(() => getVoiceServerConfig({ ...valid, VOICE_REALTIME_BASE_URL: "https://u:p@example.com" })).toThrow(/https:\/\/api\.openai\.com\/v1/);
    expect(() => getVoiceServerConfig({ ...valid, VOICE_MAX_SESSION_SECONDS: "999999" })).toThrow(/not configured/);
  });
  it("never exposes the server key in the public config", () => {
    const cfg = getVoiceServerConfig(valid);
    const exposed = voicePublicConfig(cfg);
    expect(exposed.model).toBe("configured-model");
    expect(JSON.stringify(exposed)).not.toContain(valid.OPENAI_API_KEY);
    expect(Object.keys(exposed)).not.toContain("OPENAI_API_KEY");
  });
});
