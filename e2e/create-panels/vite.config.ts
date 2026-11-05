import path from "node:path";
import base from "../voice/vite.config.ts";
const api = base.plugins![0] as { load: (id: string) => string | undefined };
export default {
  ...base,
  root: import.meta.dirname,
  cacheDir: path.resolve(import.meta.dirname, "../../node_modules/.vite-create-panels"),
  plugins: [
    {
      ...base.plugins![0],
      load(id: string) {
        return api
          .load(id)
          ?.replace(
            JSON.stringify(path.resolve(import.meta.dirname, "../voice/server-fixture.ts")),
            JSON.stringify(path.resolve(import.meta.dirname, "server-fixture.ts")),
          );
      },
    },
    ...base.plugins!.slice(1),
  ],
  server: { host: "127.0.0.1", port: 8107, strictPort: true, hmr: false, watch: null },
};
