import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  applyVisitorReply,
  createInitialChatState,
  openingMessages,
  type AdvisorChatMessage,
  type AdvisorChatState,
} from "@/lib/advisors/chat-engine";
import {
  getDefaultAdvisorService,
  isAdvisorServiceCode,
  normalizePublicAdvisorCatalogue,
} from "@/lib/advisors/catalogue";

const startSchema = z
  .object({
    serviceCode: z.enum(["bookkeeping", "coaching"]),
    consent: z.literal(true),
  })
  .strict();

const messageSchema = z
  .object({
    token: z.string().min(16).max(128),
    serviceCode: z.enum(["bookkeeping", "coaching"]),
    text: z.string().trim().min(1).max(2000),
    state: z.object({
      serviceCode: z.enum(["bookkeeping", "coaching"]),
      step: z.enum(["greet", "q1", "q2", "q3", "q4", "recommend", "handoff"]),
      answers: z.record(z.string(), z.unknown()).optional(),
      recommendedPlanCode: z.string().nullable(),
      consentGiven: z.boolean(),
    }),
  })
  .strict();

function clientBucket(): string {
  const forwarded = getRequestHeader("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || getRequestHeader("x-real-ip") || "anonymous";
  return `advisors-chat:${ip.slice(0, 64)}`;
}

async function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key || url.includes(".invalid")) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadService(serviceCode: "bookkeeping" | "coaching") {
  const client = await publicClient();
  if (!client) return getDefaultAdvisorService(serviceCode);
  const { data, error } = await client.rpc("list_public_advisor_services" as never);
  if (error) return getDefaultAdvisorService(serviceCode);
  const services = normalizePublicAdvisorCatalogue(data);
  return (
    services.find((service) => service.code === serviceCode) ??
    getDefaultAdvisorService(serviceCode)
  );
}

export const startAdvisorChat = createServerFn({ method: "POST" })
  .validator((input: unknown) => startSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const service = await loadService(data.serviceCode);
    const messages = openingMessages(service);
    const state = {
      ...createInitialChatState(data.serviceCode),
      step: "q1" as const,
      consentGiven: true,
    };
    const client = await publicClient();
    let token: string | null = null;
    if (client) {
      const { data: started, error } = await client.rpc(
        "advisors_start_conversation" as never,
        {
          _service_code: data.serviceCode,
          _consent: true,
          _bucket: clientBucket(),
        } as never,
      );
      if (!error && started && typeof started === "object") {
        token = String((started as Record<string, unknown>)["token"] ?? "") || null;
        if (token) {
          for (const message of messages) {
            await client.rpc(
              "advisors_append_message" as never,
              {
                _token: token,
                _role: message.role,
                _content: message.content,
                _bucket: clientBucket(),
              } as never,
            );
          }
        }
      }
    }
    return {
      token,
      state,
      messages,
      aiDisclosure:
        "This assistant is AI-powered guidance for StreakBooks Advisors. It is not a human advisor and does not provide regulated professional advice.",
      source: token ? ("database" as const) : ("local" as const),
    };
  });

export const sendAdvisorChatMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => messageSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    if (!isAdvisorServiceCode(data.serviceCode)) throw new Error("Invalid service.");
    if (!data.state.consentGiven) throw new Error("Consent is required to continue this chat.");
    const service = await loadService(data.serviceCode);
    const currentState = data.state as AdvisorChatState;
    const result = applyVisitorReply(currentState, data.text, service);
    const now = new Date().toISOString();
    const visitorMessage: AdvisorChatMessage = {
      id: `v-${now}`,
      role: "visitor",
      content: data.text.trim(),
      createdAt: now,
    };
    const assistantMessages: AdvisorChatMessage[] = result.replies.map((content, index) => ({
      id: `a-${now}-${index}`,
      role: "assistant",
      content,
      createdAt: now,
    }));

    const client = await publicClient();
    if (client && data.token) {
      await client.rpc(
        "advisors_append_message" as never,
        {
          _token: data.token,
          _role: "visitor",
          _content: visitorMessage.content,
          _bucket: clientBucket(),
        } as never,
      );
      for (const message of assistantMessages) {
        await client.rpc(
          "advisors_append_message" as never,
          {
            _token: data.token,
            _role: "assistant",
            _content: message.content,
            _bucket: clientBucket(),
          } as never,
        );
      }
      if (result.state.step === "handoff" || result.state.recommendedPlanCode) {
        await client.rpc(
          "advisors_capture_lead" as never,
          {
            _token: data.token,
            _payload: {
              planCode: result.state.recommendedPlanCode,
              source: result.state.step === "handoff" ? "handoff" : "chat",
              notes: JSON.stringify(result.state.answers),
            },
            _bucket: clientBucket(),
          } as never,
        );
      }
    }

    return {
      state: result.state,
      messages: [visitorMessage, ...assistantMessages],
    };
  });
