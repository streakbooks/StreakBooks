import { z } from "zod";
import { API_ROUTES, type ApiRoute } from "./contracts";

type JsonSchema = Record<string, unknown>;

function schema(type: z.ZodType, io: "input" | "output"): JsonSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(type, {
    io,
    unrepresentable: "any",
  }) as JsonSchema;
  return rest;
}

function envelope(data: JsonSchema): JsonSchema {
  return {
    type: "object",
    required: ["data", "error", "meta"],
    properties: {
      data,
      error: { type: "null" },
      meta: { $ref: "#/components/schemas/Meta" },
    },
  };
}

function parameters(route: ApiRoute): JsonSchema[] {
  const out: JsonSchema[] = [];
  for (const [location, shape] of [
    ["path", route.params],
    ["query", route.query],
  ] as const) {
    if (!shape) continue;
    const json = schema(shape, "input") as {
      properties?: Record<string, JsonSchema>;
      required?: string[];
    };
    for (const [name, property] of Object.entries(json.properties ?? {})) {
      out.push({
        name,
        in: location,
        required: location === "path" || (json.required ?? []).includes(name),
        schema: property,
      });
    }
  }
  if (route.idempotent) {
    out.push({
      name: "Idempotency-Key",
      in: "header",
      required: false,
      description: "Replays the first response for 24 hours; a different body is a conflict.",
      schema: { type: "string", pattern: "^[A-Za-z0-9_.:-]{8,128}$" },
    });
  }
  return out;
}

function security(route: ApiRoute): JsonSchema[] | undefined {
  if (route.auth === "public" || route.auth === "signature") return [];
  if (route.auth === "user") return [{ bearerAuth: [] }];
  return [{ bearerAuth: [] }, { apiKey: [route.scope ?? "billing:read"] }];
}

const ERRORS: Record<string, string> = {
  "400": "Invalid request",
  "401": "Missing or invalid credentials",
  "403": "Not permitted",
  "404": "Not found",
  "409": "Conflict (including idempotency conflicts)",
  "422": "Business rule refused the request",
  "500": "Unexpected error",
};

export function buildOpenApiDocument(): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const route of API_ROUTES) {
    const operation: JsonSchema = {
      operationId: route.id,
      tags: [route.tag],
      summary: route.summary,
      security: security(route),
      parameters: parameters(route),
      responses: {
        "200": {
          description: "Success",
          content: { "application/json": { schema: envelope(schema(route.response, "output")) } },
        },
        ...Object.fromEntries(
          Object.entries(ERRORS).map(([status, description]) => [
            status,
            {
              description,
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } },
              },
            },
          ]),
        ),
      },
    };
    if (route.scope) operation["x-required-scope"] = route.scope;
    if (route.body) {
      operation["requestBody"] = {
        required: true,
        content: { "application/json": { schema: schema(route.body, "input") } },
      };
    }
    paths[route.path] = { ...(paths[route.path] ?? {}), [route.method.toLowerCase()]: operation };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "LinkBooks Billing API",
      version: "1.0.0",
      description:
        "Billing, subscriptions, invoices and partners. Amounts are integer minor units. " +
        "Users authenticate with their Supabase access token; external systems use a platform " +
        "API key with scopes. The database enforces every permission.",
    },
    servers: [{ url: "/" }],
    tags: [...new Set(API_ROUTES.map((route) => route.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Supabase JWT" },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-Api-Key",
          description: "Platform API key; scopes billing:read and billing:analytics",
        },
      },
      schemas: {
        Meta: {
          type: "object",
          required: ["requestId"],
          properties: { requestId: { type: "string" } },
        },
        ErrorEnvelope: {
          type: "object",
          required: ["data", "error", "meta"],
          properties: {
            data: { type: "null" },
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: ["object", "null"] },
              },
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
      },
    },
  };
}
