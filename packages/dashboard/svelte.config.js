import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// App version shown in the UI. The Docker build passes APP_VERSION from the
// release tag (e.g. 0.4.0); local dev falls back to the package.json version.
// Exposed to the app via `import { version } from "$app/environment"`.
const appVersion = process.env.APP_VERSION || pkg.version;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    version: {
      name: appVersion,
    },
  },
};

export default config;
