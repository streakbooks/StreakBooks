// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import type { Plugin } from "vite";

function releaseRevision(): Plugin {
  return {
    name: "linkbooks-release-revision",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle() {
      const commit = process.env["VERCEL_GIT_COMMIT_SHA"];
      if (process.env["VERCEL_ENV"] !== "production" || !commit || !/^[a-f0-9]{40}$/.test(commit))
        return;
      this.emitFile({
        type: "asset",
        fileName: "release-revision.json",
        source: JSON.stringify({ commit, environment: "production" }),
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Override Lovable's default Cloudflare Nitro preset for Vercel deploys.
  vite: {
    plugins: [releaseRevision(), nitro({ preset: "vercel" })],
  },
});
