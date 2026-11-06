// SCHOOLNET LIVE - Supabase Edge Function
// POST { "session_id": "uuid" } - returns a short-lived Daily meeting credential.
// Daily API key and privileged Supabase key never reach the browser.

import { createClient } from 'npm:@supabase/supabase-js@2';

type SessionRow = {
  id: string;
  course_id: string;
  class_id: string;
  teacher_id: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  starts_at: string;
  ends_at: string;
};

type DailyRoom = {
  name?: string;
  url?: string;
  privacy?: string;
};

type StoredRoom = {
  daily_room_name: string;
  daily_room_url: string;
  expires_at: string;
};

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const DAILY_API = 'https://api.daily.co/v1';
const DAILY_DOMAIN = 'schoolnet-live.daily.co';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EARLY_MINUTES = 15;
const LATE_MINUTES = 10;

function envKey(jsonVariable: string, singleVariable: string, legacyVariable: string): string {
  const explicit = Deno.env.get(singleVariable);
  if (explicit) return explicit;
  try {
    const available = JSON.parse(Deno.env.get(jsonVariable) ?? '{}') as Record<string, unknown>;
    if (typeof available.default === 'string') return available.default;
  } catch {
    // A malformed environment value must fail closed.
  }
  return Deno.env.get(legacyVariable) ?? '';
}

const allowedOrigins = new Set(
  (Deno.env.get('SCHOOLNET_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function responseHeaders(origin: string | null): HeadersInit {
  return {
    ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function respond(payload: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...responseHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function dailyRequest<T>(
  apiKey: string,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const result = await fetch(`${DAILY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000),
  });

  let data: T | null = null;
  try { data = await result.json() as T; } catch { /* Daily returned no JSON. */ }
  return { ok: result.ok, status: result.status, data };
}

function validateDailyRoom(room: DailyRoom | null, roomName: string): asserts room is DailyRoom & {
  name: string;
  url: string;
  privacy: 'private';
} {
  if (!room || room.name !== roomName || room.privacy !== 'private' || !room.url) {
    throw new ApiError(502, 'Configuration de la salle video invalide.');
  }
  try {
    const url = new URL(room.url);
    if (url.protocol !== 'https:' || url.hostname !== DAILY_DOMAIN ||
      url.pathname.replace(/^\/+|\/+$/g, '') !== roomName || url.search || url.hash) {
      throw new Error('Unexpected Daily domain or path');
    }
  } catch {
    throw new ApiError(502, 'Adresse de la salle video invalide.');
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) {
    return respond({ error: 'Origine non autorisee.' }, 403, null);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return respond({ error: 'Methode non autorisee.' }, 405, origin);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const publicKey = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
    const secretKey = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
    const dailyKey = Deno.env.get('DAILY_API_KEY') ?? '';
    if (!supabaseUrl || !publicKey || !secretKey || !dailyKey) {
      throw new ApiError(503, 'Le service de visioconference est indisponible.');
    }

    const bearer = request.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(bearer);
    if (!match) throw new ApiError(401, 'Connexion requise.');

    const raw = await request.text();
    if (raw.length > 2048) throw new ApiError(413, 'Requete trop volumineuse.');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'Corps JSON invalide.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, 'Parametres invalides.');
    }
    const sessionId = (body as Record<string, unknown>).session_id;
    if (typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
      throw new ApiError(400, 'Identifiant de seance invalide.');
    }

    // Independent clients: user auth never modifies the privileged client's headers.
    const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
    const authClient = createClient(supabaseUrl, publicKey, clientOptions);
    const admin = createClient(supabaseUrl, secretKey, clientOptions);
    const { data: authData, error: authError } = await authClient.auth.getUser(match[1]);
    if (authError || !authData.user) throw new ApiError(401, 'Session de connexion invalide.');
    const userId = authData.user.id;

    const [profileResult, sessionResult] = await Promise.all([
      admin.from('profiles').select('id, role, full_name').eq('id', userId).maybeSingle(),
      admin.from('live_sessions')
        .select('id, course_id, class_id, teacher_id, status, starts_at, ends_at')
        .eq('id', sessionId)
        .maybeSingle(),
    ]);
    if (profileResult.error || sessionResult.error) throw new ApiError(503, 'Lecture de la seance indisponible.');
    const profile = profileResult.data;
    const session = sessionResult.data as SessionRow | null;
    if (!profile || !session) throw new ApiError(404, 'Seance introuvable.');
    if (session.status !== 'scheduled' && session.status !== 'live') {
      throw new ApiError(409, 'Cette seance ne peut plus etre rejointe.');
    }

    const startsAt = Date.parse(session.starts_at);
    const endsAt = Date.parse(session.ends_at);
    const now = Date.now();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) ||
      now < startsAt - EARLY_MINUTES * 60000 || now >= endsAt) {
      throw new ApiError(409, 'La salle n\'est pas ouverte a cette heure.');
    }

    const isTeacher = profile.role === 'teacher' && session.teacher_id === userId;
    const isStudent = profile.role === 'student';
    if (!isTeacher && !isStudent) throw new ApiError(403, 'Acces reserve aux enseignants et apprenants autorises.');

    if (isTeacher) {
      const [classAssignment, courseAssignment, course] = await Promise.all([
        admin.from('class_teachers').select('class_id').eq('class_id', session.class_id).eq('teacher_id', userId).maybeSingle(),
        admin.from('course_teachers').select('course_id').eq('course_id', session.course_id).eq('teacher_id', userId).maybeSingle(),
        admin.from('courses').select('id, class_id, created_by, status').eq('id', session.course_id).maybeSingle(),
      ]);
      if (classAssignment.error || courseAssignment.error || course.error) {
        throw new ApiError(503, 'Verification des affectations indisponible.');
      }
      if (!classAssignment.data || !course.data || course.data.status !== 'active' ||
        course.data.class_id !== session.class_id ||
        (course.data.created_by !== userId && !courseAssignment.data)) {
        throw new ApiError(403, 'Vous n\'etes plus affecte a ce cours et a cette classe.');
      }
    } else {
      if (session.status !== 'live') {
        throw new ApiError(409, 'En attente du demarrage du cours par l\'enseignant.');
      }
      const [classMember, activeEnrollment] = await Promise.all([
        admin.from('class_students').select('student_id').eq('student_id', userId).eq('class_id', session.class_id).maybeSingle(),
        admin.from('student_enrollments').select('id').eq('student_id', userId)
          .eq('class_id', session.class_id).eq('status', 'active').maybeSingle(),
      ]);
      if (classMember.error || activeEnrollment.error) {
        throw new ApiError(503, 'Verification de l\'inscription indisponible.');
      }
      if (!classMember.data || !activeEnrollment.data) {
        throw new ApiError(403, 'Vous n\'etes pas inscrit dans cette classe.');
      }
    }

    const roomName = `sn-${session.id.replace(/-/g, '')}`;
    const expiryTime = endsAt + LATE_MINUTES * 60000;
    const { data: stored, error: roomReadError } = await admin.from('live_session_rooms')
      .select('daily_room_name, daily_room_url, expires_at')
      .eq('session_id', session.id).maybeSingle();
    if (roomReadError) throw new ApiError(503, 'Acces aux salles indisponible.');

    let roomUrl: string;
    if (stored) {
      const existing = stored as StoredRoom;
      validateDailyRoom({
        name: existing.daily_room_name, url: existing.daily_room_url, privacy: 'private',
      }, roomName);
      if (Date.parse(existing.expires_at) < expiryTime - 1000) {
        throw new ApiError(409, 'Expiration de la salle incoherente.');
      }
      roomUrl = existing.daily_room_url;
    } else {
      // Deterministic name: concurrent calls for one session target the same room.
      const created = await dailyRequest<DailyRoom>(dailyKey, '/rooms', 'POST', {
        name: roomName,
        privacy: 'private',
        properties: {
          nbf: Math.floor((startsAt - EARLY_MINUTES * 60000) / 1000),
          exp: Math.floor(expiryTime / 1000),
          eject_at_room_exp: true,
          enable_prejoin_ui: true,
          enable_chat: true,
        },
      });
      let dailyRoom = created.ok ? created.data : null;
      if (!dailyRoom && (created.status === 400 || created.status === 409)) {
        // Daily may return a conflict if another authorized request won the race.
        const retrieved = await dailyRequest<DailyRoom>(
          dailyKey, `/rooms/${encodeURIComponent(roomName)}`, 'GET',
        );
        if (retrieved.ok) dailyRoom = retrieved.data;
      }
      if (!dailyRoom) throw new ApiError(502, 'Impossible de creer la salle Daily.');
      validateDailyRoom(dailyRoom, roomName);
      roomUrl = dailyRoom.url;

      const { error: saveError } = await admin.from('live_session_rooms').upsert({
        session_id: session.id,
        daily_room_name: roomName,
        daily_room_url: roomUrl,
        expires_at: new Date(expiryTime).toISOString(),
      }, { onConflict: 'session_id' });
      if (saveError) throw new ApiError(503, 'Impossible de memoriser la salle video.');
    }

    // Room-specific, identity-bound token; learners do not receive moderator rights.
    const tokenResponse = await dailyRequest<{ token?: string }>(dailyKey, '/meeting-tokens', 'POST', {
      properties: {
        room_name: roomName,
        user_id: userId,
        user_name: String(profile.full_name ?? (isTeacher ? 'Enseignant' : 'Apprenant')).slice(0, 100),
        is_owner: isTeacher,
        nbf: Math.floor((startsAt - EARLY_MINUTES * 60000) / 1000),
        exp: Math.floor(expiryTime / 1000),
        eject_at_token_exp: true,
        enable_screenshare: isTeacher,
        start_video_off: !isTeacher,
        start_audio_off: !isTeacher,
      },
    });
    if (!tokenResponse.ok || !tokenResponse.data?.token) {
      throw new ApiError(502, 'Impossible de generer l\'acces temporaire Daily.');
    }

    if (isTeacher && session.status === 'scheduled') {
      const { data: started, error: startError } = await admin.from('live_sessions')
        .update({ status: 'live', started_at: new Date().toISOString() })
        .eq('id', session.id).eq('status', 'scheduled').select('id').maybeSingle();
      if (startError) throw new ApiError(503, 'Impossible de demarrer cette seance.');
      if (!started) {
        const { data: latest, error: latestError } = await admin.from('live_sessions')
          .select('status').eq('id', session.id).maybeSingle();
        if (latestError || latest?.status !== 'live') {
          throw new ApiError(409, 'La seance a change de statut.');
        }
      }
    }

    return respond({
      session_id: session.id,
      room_url: roomUrl,
      meeting_token: tokenResponse.data.token,
      is_teacher: isTeacher,
      expires_at: new Date(expiryTime).toISOString(),
    }, 200, origin);
  } catch (error) {
    if (error instanceof ApiError) return respond({ error: error.message }, error.status, origin);
    console.error('SchoolNet Live: unexpected server failure',
      error instanceof Error ? error.message : 'unknown');
    return respond({ error: 'Erreur temporaire du service video.' }, 500, origin);
  }
});
