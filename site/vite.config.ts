import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import { CATALOG, formatCOP, lowestPrice, shortDate } from "../shared/catalog.ts";

/** Replaces {{tokens}} in HTML with values from shared/catalog.ts (no hardcoded prices/dates). */
function catalogTokens(): Plugin {
  let base = "/";
  const tokens: Record<string, string> = {
    fromPrice: formatCOP(lowestPrice()),
    opensShort: shortDate(CATALOG.presaleOpens),
    closesShort: shortDate(CATALOG.presaleCloses),
    // Doto's period reads like a comma, so dates shown in Doto get a drawn square dot
    opensDot: shortDate(CATALOG.presaleOpens).replace(".", '<span class="pt" aria-hidden="true"></span>'),
    closesDot: shortDate(CATALOG.presaleCloses).replace(".", '<span class="pt" aria-hidden="true"></span>'),
    stockTotal: String(CATALOG.stockTotal),
    botNumber: CATALOG.botNumber,
    instagram: CATALOG.instagram,
    studioSite: CATALOG.studioSite,
    siteUrl: CATALOG.siteUrl,
  };
  return {
    name: "catalog-tokens",
    configResolved(c) {
      base = c.base;
      tokens.base = base;
    },
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
        // non-blocking: "Spalla Fallback" (metric-matched) shows until the kit arrives
        { tag: "link", attrs: { rel: "stylesheet", href: `https://use.typekit.net/${id}.css`, media: "print", onload: "this.media='all'" }, injectTo: "head" },
        { tag: "noscript", children: `<link rel="stylesheet" href="https://use.typekit.net/${id}.css">`, injectTo: "head" },
      ];
    },
  };
}

export default defineConfig(({ command }) => ({
  // served from a sub-path on GitHub Pages (e.g. /tote/); the dev server stays at /
  base: command === "build" ? new URL(CATALOG.siteUrl).pathname : "/",
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
}));
