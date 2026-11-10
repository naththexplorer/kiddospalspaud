import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const allowedAudioTypes = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]);
const maxAudioBytes = 10 * 1024 * 1024;
const sessionSeconds = 4 * 60 * 60;
const loginAttempts = new Map<string, { count: number; expiresAt: number }>();

async function adminSigningKey(usages: KeyUsage[]) {
  const rootSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!rootSecret) throw new Error("Supabase service key is not configured");
  const rootKey = await crypto.subtle.importKey("raw", encoder.encode(rootSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derived = await crypto.subtle.sign("HMAC", rootKey, encoder.encode("kiddospals-admin-session-v1"));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, usages);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function createAdminToken() {
  const payload = base64Url(encoder.encode(JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + sessionSeconds })));
  const key = await adminSigningKey(["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return payload + "." + base64Url(signature);
}

async function isAdmin(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/iu, "") || "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const key = await adminSigningKey(["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload))) return false;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return claims.role === "admin" && Number(claims.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const count = Math.max(a.length, b.length);
  for (let i = 0; i < count; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

function database() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase server secrets are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  const route = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);

  try {
    if (request.method === "POST" && route === "admin-login") {
      const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const now = Date.now();
      const attempt = loginAttempts.get(ip);
      if (attempt && attempt.expiresAt > now && attempt.count >= 10) {
        return json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit." }, 429);
      }
      if (!attempt || attempt.expiresAt <= now) loginAttempts.set(ip, { count: 1, expiresAt: now + 15 * 60 * 1000 });
      else loginAttempts.set(ip, { ...attempt, count: attempt.count + 1 });
      const body = await request.json().catch(() => ({}));
      const expectedEmail = Deno.env.get("ADMIN_EMAIL") || "";
      const expectedPassword = Deno.env.get("ADMIN_PASSWORD") || "";
      if (!expectedEmail || !expectedPassword) return json({ error: "Admin secrets belum dipasang." }, 503);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!safeEqual(email, expectedEmail.trim().toLowerCase()) || !safeEqual(password, expectedPassword)) {
        return json({ error: "Email atau kata sandi salah." }, 401);
      }
      loginAttempts.delete(ip);
      return json({ token: await createAdminToken(), expiresIn: sessionSeconds });
    }

    if (request.method === "POST" && route === "upload") {
      const form = await request.formData();
      const childName = String(form.get("childName") || "").trim().replace(/\s+/gu, " ").slice(0, 80);
      const durationSeconds = Number(form.get("durationSeconds"));
      const audio = form.get("audio");
      if (!childName) return json({ error: "Nama anak wajib diisi." }, 400);
      if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 60) {
        return json({ error: "Durasi rekaman harus 1 sampai 60 detik." }, 400);
      }
      if (!(audio instanceof File) || !audio.size || audio.size > maxAudioBytes) {
        return json({ error: "File rekaman kosong atau melebihi batas 10 MB." }, 400);
      }
      const contentType = audio.type.split(";")[0].trim().toLowerCase();
      if (!allowedAudioTypes.has(contentType)) return json({ error: "Format audio tidak didukung." }, 415);
      const extension = contentType === "audio/ogg" ? "ogg" : contentType === "audio/mp4" ? "m4a" : contentType === "audio/mpeg" ? "mp3" : "webm";
      const audioPath = crypto.randomUUID() + "." + extension;
      const client = database();
      const { error: uploadError } = await client.storage.from("voice-notes").upload(audioPath, audio, {
        contentType,
        upsert: false,
      });
      if (uploadError) return json({ error: "Upload rekaman gagal." }, 502);
      const { data, error: insertError } = await client.from("voice_notes").insert({
        child_id: null,
        child_name: childName,
        audio_path: audioPath,
        duration_seconds: durationSeconds,
      }).select("id, child_name, audio_path, duration_seconds, created_at").single();
      if (insertError) {
        await client.storage.from("voice-notes").remove([audioPath]);
        return json({ error: "Metadata rekaman gagal disimpan." }, 502);
      }
      return json({ note: data }, 201);
    }

    if (request.method === "GET" && route === "admin-notes") {
      if (!await isAdmin(request)) return json({ error: "Sesi admin tidak valid atau sudah berakhir." }, 401);
      const client = database();
      const { data, error } = await client.from("voice_notes")
        .select("id, child_id, child_name, audio_path, duration_seconds, created_at")
        .order("created_at", { ascending: false }).limit(200);
      if (error) return json({ error: "Rekaman gagal dimuat." }, 502);
      const notes = await Promise.all((data || []).map(async note => {
        const { data: signed } = await client.storage.from("voice-notes").createSignedUrl(note.audio_path, 3600);
        return { ...note, audioUrl: signed?.signedUrl || null };
      }));
      return json({ notes });
    }

    if (request.method === "POST" && route === "admin-delete") {
      if (!await isAdmin(request)) return json({ error: "Sesi admin tidak valid atau sudah berakhir." }, 401);
      const body = await request.json().catch(() => ({}));
      const id = String(body.id || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
        return json({ error: "ID rekaman tidak valid." }, 400);
      }
      const client = database();
      const { data: note, error: findError } = await client.from("voice_notes")
        .select("id, child_id, child_name, audio_path, duration_seconds, created_at")
        .eq("id", id).maybeSingle();
      if (findError) return json({ error: "Rekaman gagal ditemukan." }, 502);
      if (!note) return json({ error: "Rekaman sudah tidak ada." }, 404);

      const { error: deleteError } = await client.from("voice_notes").delete().eq("id", id);
      if (deleteError) return json({ error: "Data rekaman gagal dihapus." }, 502);

      const { error: storageError } = await client.storage.from("voice-notes").remove([note.audio_path]);
      if (storageError) {
        const { error: restoreError } = await client.from("voice_notes").insert(note);
        if (restoreError) console.error("voice note metadata restore failed", note.id);
        return json({ error: "File audio gagal dihapus. Data rekaman dipulihkan bila memungkinkan." }, 502);
      }
      return json({ success: true });
    }

    return json({ error: "Rute tidak ditemukan." }, 404);
  } catch (error) {
    console.error("voice-notes function error", error instanceof Error ? error.message : "unknown");
    return json({ error: "Permintaan tidak dapat diproses." }, 500);
  }
});
