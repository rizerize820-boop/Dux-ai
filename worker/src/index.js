const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

async function requireSupabaseUser(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { error: json({ error: "Server authentication is not configured." }, 503) };
  }
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return { error: json({ error: "Sign-in is required." }, 401) };
  }
  const response = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
    headers: {
      Authorization: authorization,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });
  if (!response.ok) return { error: json({ error: "Your session is invalid or expired." }, 401) };
  return { user: await response.json() };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "dux-ai" });
    }

    if (url.pathname === "/api/image" && request.method === "POST") {
      const auth = await requireSupabaseUser(request, env);
      if (auth.error) return auth.error;
      if (!env.AI) return json({ error: "Cloudflare Workers AI binding is not configured." }, 503);

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Request body must be valid JSON." }, 400); }

      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return json({ error: "A non-empty prompt is required." }, 400);
      if (prompt.length > 1000) return json({ error: "Prompt must be 1000 characters or fewer." }, 400);

      try {
        const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt });
        let bytes;
        if (result instanceof ReadableStream) {
          bytes = new Uint8Array(await new Response(result).arrayBuffer());
        } else if (typeof result?.image === "string") {
          bytes = Uint8Array.from(atob(result.image), (ch) => ch.charCodeAt(0));
        } else {
          return json({ error: "The image model returned an unsupported response." }, 502);
        }
        return json({ image: bytesToBase64(bytes), mimeType: "image/jpeg" });
      } catch (error) {
        console.error("Image generation failed:", error);
        return json({ error: "Image generation failed. Check Workers AI availability and account limits." }, 502);
      }
    }
    return json({ error: "Not found" }, 404);
  },
};