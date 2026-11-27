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

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "dux-ai-api" });
    }

    if (url.pathname === "/api/image" && request.method === "POST") {
      if (!env.AI) return json({ error: "Cloudflare Workers AI binding is not configured." }, 503);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Request body must be valid JSON." }, 400);
      }

      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return json({ error: "A non-empty prompt is required." }, 400);
      if (prompt.length > 1000) return json({ error: "Prompt must be 1000 characters or fewer." }, 400);

      try {
        const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt });

        // FLUX returns an image stream on the standard Workers AI response path.
        if (result instanceof ReadableStream) {
          return withCors(new Response(result, {
            headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
          }));
        }

        // Keep compatibility with model responses that wrap image bytes as base64.
        const encoded = result?.image;
        if (typeof encoded === "string") {
          const binary = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
          return withCors(new Response(binary, {
            headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
          }));
        }

        return json({ error: "The image model returned an unsupported response." }, 502);
      } catch (error) {
        console.error("Image generation failed:", error);
        return json({ error: "Image generation failed. Check Workers AI availability and account limits." }, 502);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};
