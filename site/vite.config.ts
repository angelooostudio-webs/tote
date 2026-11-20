import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import { CATALOG, formatCOP, lowestPrice, shortDate } from "../shared/catalog.ts";

/** Replaces {{tokens}} in HTML with values from shared/catalog.ts (no hardcoded prices/dates). */
function catalogTokens(): Plugin {
  const tokens: Record<string, string> = {
    fromPrice: formatCOP(lowestPrice()),
    opensShort: shortDate(CATALOG.presaleOpens),
    closesShort: shortDate(CATALOG.presaleCloses),
    stockTotal: String(CATALOG.stockTotal),
    instagram: CATALOG.instagram,
    studioSite: CATALOG.studioSite,
  };
  return {
    name: "catalog-tokens",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(/\{\{(\w+)\}\}/g, (m, k) => {
          if (!(k in tokens)) throw new Error(`Unknown catalog token ${m}`);
          return tokens[k];
        });
      },
    },
  };
}

/** Injects the Adobe Fonts (Spalla) stylesheet when a kit ID is set in shared/catalog.ts. */
function adobeFonts(): Plugin {
  return {
    name: "adobe-fonts",
    transformIndexHtml() {
      const id = CATALOG.ADOBE_FONTS_KIT_ID;
      if (!id) return [];
      return [
        { tag: "link", attrs: { rel: "preconnect", href: "https://use.typekit.net", crossorigin: "" }, injectTo: "head-prepend" },
        { tag: "link", attrs: { rel: "stylesheet", href: `https://use.typekit.net/${id}.css` }, injectTo: "head" },
      ];
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [catalogTokens(), adobeFonts()],
  server: { fs: { allow: [".."] }, host: true },
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        privacidad: resolve(import.meta.dirname, "privacidad/index.html"),
      },
    },
  },
});
