import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_FIELDS = [
  "vorname", "stadt", "interessen", "kategorie",
  "personality", "energy_level", "relationship_depth",
];

const RATE_LIMIT = 20; // max requests per day per user

// ============================================================
// PROMPT TEMPLATES
// ============================================================
const PROMPTS: Record<string, (payload: Record<string, unknown>) => string> = {
  extract: (p) => `Du bist ein Assistent der aus Freitext strukturierte Profildaten extrahiert.

Analysiere den folgenden Text und extrahiere ein JSON-Objekt mit diesen Feldern:
- vorname (string)
- stadt (string oder null)
- interessen (string[] — Liste von Hobbys/Interessen)
- kategorie ("friend" | "romantic" | "family" | "work")
- personality (kurze Beschreibung in 2-3 Worten)
- energy_level ("low" | "medium" | "high")
- relationship_depth ("neu" | "bekannt" | "eng" | "sehr_eng")

Text: "${p.text}"

Antworte NUR mit validem JSON, keine Erklärungen.`,

  activity: (p) => `Du bist ein kreativer Aktivitäts-Planer.

Basierend auf diesem Freundesprofil, schlage EINE passende Aktivität vor:
${JSON.stringify(p.profile, null, 2)}

Antworte als JSON:
{
  "name": "Aktivitätsname",
  "beschreibung": "Kurze Beschreibung",
  "ort": "Vorgeschlagener Ort",
  "budget": "geschätztes Budget pro Person in Euro",
  "energie": "low|medium|high",
  "dauer": "geschätzte Dauer in Stunden",
  "warum": "Warum passt diese Aktivität zu diesem Freund"
}

Antworte NUR mit validem JSON.`,

  gift: (p) => `Du bist ein Geschenk-Berater.

Basierend auf diesem Freundesprofil, schlage 3 passende Geschenkideen vor:
${JSON.stringify(p.profile, null, 2)}

Antworte als JSON-Array:
[
  { "idee": "Name", "beschreibung": "Warum passend", "budget": "ca. X€" },
  { "idee": "Name", "beschreibung": "Warum passend", "budget": "ca. X€" },
  { "idee": "Name", "beschreibung": "Warum passend", "budget": "ca. X€" }
]

Antworte NUR mit validem JSON.`,

  match: (p) => `Du bist ein Gruppen-Matching-Experte.

Hier sind mehrere Freundesprofile:
${JSON.stringify(p.profiles, null, 2)}

Finde die besten Gruppen-Kombinationen (2-4 Personen) basierend auf gemeinsamen Interessen, Energielevel und Persönlichkeit.

Antworte als JSON-Array:
[
  {
    "gruppe": ["Name1", "Name2"],
    "aktivitaet": "Vorgeschlagene gemeinsame Aktivität",
    "grund": "Warum passen diese Personen zusammen"
  }
]

Antworte NUR mit validem JSON.`,
};

// ============================================================
// HELPERS
// ============================================================
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(error: string, code: string, status = 400) {
  return jsonResponse({ error, code }, status);
}

function filterPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  // Allow 'text' for extract type, 'profile'/'profiles' for others
  if (typeof payload.text === "string") filtered.text = payload.text;
  if (payload.profile && typeof payload.profile === "object") {
    filtered.profile = pick(payload.profile as Record<string, unknown>, ALLOWED_FIELDS);
  }
  if (Array.isArray(payload.profiles)) {
    filtered.profiles = payload.profiles.map((p: unknown) =>
      typeof p === "object" && p ? pick(p as Record<string, unknown>, ALLOWED_FIELDS) : {}
    );
  }
  return filtered;
}

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) result[k] = obj[k];
  }
  return result;
}

// ============================================================
// MAIN HANDLER
// ============================================================
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Nur POST-Requests erlaubt.", "METHOD_NOT_ALLOWED", 405);
  }

  // --- Auth ---
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization-Header fehlt.", "UNAUTHORIZED", 401);
  }
  const jwt = authHeader.replace("Bearer ", "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Validate JWT and get user
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return errorResponse("Ungültiger Token.", "UNAUTHORIZED", 401);
  }

  // --- Parse body ---
  let body: { type?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Ungültiger JSON-Body.", "BAD_REQUEST", 400);
  }

  const { type, payload } = body;
  if (!type || !PROMPTS[type]) {
    return errorResponse(
      `Ungültiger Typ. Erlaubt: ${Object.keys(PROMPTS).join(", ")}`,
      "INVALID_TYPE",
    );
  }
  if (!payload || typeof payload !== "object") {
    return errorResponse("Payload fehlt oder ungültig.", "BAD_PAYLOAD");
  }

  // --- Check ai_enabled on profile ---
  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.settings?.ai_enabled) {
    return errorResponse(
      "AI-Features sind für dieses Konto nicht aktiviert.",
      "AI_DISABLED",
      403,
    );
  }

  // --- Rate limit: max 20/day ---
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("ai_suggestions_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", todayStart.toISOString());

  if ((count ?? 0) >= RATE_LIMIT) {
    return errorResponse(
      `Tageslimit erreicht (${RATE_LIMIT} Anfragen/Tag). Versuche es morgen erneut.`,
      "RATE_LIMITED",
      429,
    );
  }

  // --- Filter payload (allowlist) ---
  const safePayload = filterPayload(payload);

  // --- Build prompt & call Anthropic ---
  const prompt = PROMPTS[type](safePayload);
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return errorResponse("AI-Service nicht konfiguriert.", "CONFIG_ERROR", 500);
  }

  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    return errorResponse(
      `Anthropic API nicht erreichbar: ${(err as Error).message}`,
      "AI_FETCH_ERROR",
      502,
    );
  }

  const aiData = await aiResponse.json();

  if (aiData.error) {
    return errorResponse(
      `AI-Fehler: ${aiData.error.message ?? "Unbekannt"}`,
      "AI_ERROR",
      502,
    );
  }

  // --- Parse response ---
  const outputText = aiData.content?.[0]?.text ?? "";
  const tokensIn = aiData.usage?.input_tokens ?? 0;
  const tokensOut = aiData.usage?.output_tokens ?? 0;

  let parsedOutput: unknown;
  try {
    const cleaned = outputText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    parsedOutput = JSON.parse(cleaned);
  } catch {
    parsedOutput = outputText;
  }

  // --- Log to ai_suggestions_log ---
  await supabase.from("ai_suggestions_log").insert({
    user_id: user.id,
    type,
    input_sent: safePayload,
    output: parsedOutput,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });

  // --- Return result ---
  return jsonResponse({
    type,
    result: parsedOutput,
    usage: { tokens_in: tokensIn, tokens_out: tokensOut },
  });
});
