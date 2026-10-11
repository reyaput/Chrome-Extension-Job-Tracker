"use strict";

globalThis.AiRoutes = (() => {
  const PROVIDERS = {
    openai: { name: "OpenAI", endpoint: "https://api.openai.com/v1/chat/completions" },
    anthropic: { name: "Anthropic", endpoint: "https://api.anthropic.com/v1/messages" },
    openrouter: { name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1/chat/completions" }
  };

  function createRoute(provider, model, endpoint) {
    const value = model.trim();
    if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value)) {
      throw new Error("Rute model tidak valid. Gunakan ID model lengkap tanpa spasi, bukan nama tampilannya.");
    }
    if (provider !== "compatible" && provider !== "openrouter" && value.includes("/")) {
      throw new Error(`Rute ${PROVIDERS[provider].name} langsung memakai ID model setelah tanda titik dua, tanpa awalan organisasi.`);
    }
    const url = new URL(endpoint || PROVIDERS[provider].endpoint);
    return {
      provider,
      name: PROVIDERS[provider]?.name || "API kompatibel OpenAI",
      model: value,
      endpoint: url.href,
      permissionOrigin: `${url.protocol}//${url.hostname}/*`
    };
  }

  function resolve(value) {
    const route = typeof value === "string" ? value.trim() : "";
    if (!route) throw new Error("Isi Rute model terlebih dahulu.");
    const prefixed = route.match(/^(openai|anthropic|openrouter):(.+)$/i);
    if (prefixed) return createRoute(prefixed[1].toLowerCase(), prefixed[2]);

    if (/^https?:\/\//i.test(route)) {
      let url;
      try { url = new URL(route); } catch { throw new Error("URL pada Rute model tidak valid."); }
      if (url.username || url.password) throw new Error("Rute model tidak boleh memuat kredensial dalam URL. Masukkan kunci pada Kunci API.");
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (host === "openrouter.ai" && !url.hash && !url.pathname.startsWith("/api/")) {
        let model;
        try { model = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")); }
        catch { throw new Error("ID model dalam URL OpenRouter tidak valid."); }
        if (!/^[^/]+\/[^/]+$/.test(model)) {
          throw new Error("Gunakan URL halaman model OpenRouter yang lengkap, atau openrouter:organisasi/id-model.");
        }
        return createRoute("openrouter", model);
      }
      if (!url.hash) {
        throw new Error("Untuk API lain, isi rute lengkap: https://alamat-api/v1#id-model. Rute harus menyertakan ID model setelah #.");
      }
      let model;
      try { model = decodeURIComponent(url.hash.slice(1)); } catch { throw new Error("ID model setelah # tidak valid."); }
      url.hash = "";
      const provider = host === "api.anthropic.com" ? "anthropic" : host === "api.openai.com" ? "openai"
        : host === "openrouter.ai" ? "openrouter" : "compatible";
      const suffix = provider === "anthropic" ? "/messages" : "/chat/completions";
      url.pathname = url.pathname.replace(/\/+$/, "");
      if (!url.pathname.endsWith(suffix)) url.pathname += suffix;
      return createRoute(provider, model, url.href);
    }

    // ID organisasi/model tanpa penanda mengikuti format katalog OpenRouter.
    if (/^[^/\s]+\/[^/\s]+$/.test(route)) return createRoute("openrouter", route);
    if (/^(?:gpt-|o\d(?:-|$))/.test(route)) return createRoute("openai", route);
    if (route.startsWith("claude-")) return createRoute("anthropic", route);
    throw new Error("Gunakan rute lengkap, misalnya openai:gpt-4.1-mini, anthropic:claude-sonnet-4-6, atau openrouter:organisasi/id-model. Nama tampilan saja tidak cukup.");
  }

  function migrateLegacySettings(settings) {
    if (typeof settings.modelRoute === "string") return settings.modelRoute;
    const base = typeof settings.baseUrl === "string" ? settings.baseUrl.trim() : "";
    const model = typeof settings.model === "string" ? settings.model.trim() : "";
    try {
      // Versi lama bisa menyimpan URL halaman model sebagai URL dasar API.
      if (base) {
        const url = new URL(base);
        if (url.hostname.replace(/^www\./, "") === "openrouter.ai" && !url.pathname.startsWith("/api/")) {
          const parsed = resolve(base);
          return `openrouter:${parsed.model}`;
        }
        if (model) {
          const parsed = resolve(`${base.replace(/\/+$/, "")}#${encodeURIComponent(model)}`);
          if (parsed.provider === "compatible") return `${base.replace(/\/+$/, "")}#${encodeURIComponent(model)}`;
          return `${parsed.provider}:${parsed.model}`;
        }
      }
      if (model) { resolve(model); return model; }
    } catch {
      // Konfigurasi lama yang tidak bisa dikenali perlu diisi ulang, tanpa mengganti kunci.
    }
    return "";
  }

  return Object.freeze({ resolve, migrateLegacySettings });
})();
