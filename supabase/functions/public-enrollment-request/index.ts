// SCHOOLNET: public intake must use server-side credentials only.
import { createClient } from 'npm:@supabase/supabase-js@2';

type Payload = {
  student_full_name?: unknown;
  student_gender?: unknown;
  requested_level?: unknown;
  guardian_full_name?: unknown;
  guardian_relationship?: unknown;
  guardian_phone?: unknown;
  guardian_email?: unknown;
  message?: unknown;
  consent?: unknown;
  captcha_token?: unknown;
};

const allowedOrigins = (Deno.env.get('SCHOOLNET_ALLOWED_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function json(data: unknown, code: number, origin: string) {
  return new Response(JSON.stringify(data), {
    status: code,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8',
               'Cache-Control': 'no-store' },
  });
}

function clean(value: unknown, maximum: number) {
  if (typeof value !== 'string') return '';
  const v = value.trim().replace(/\s+/g, ' ');
  return v.length <= maximum ? v : '';
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? '';
  if (!allowedOrigins.includes(origin)) {
    return new Response('Forbidden origin', { status: 403 });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin);
  }

  // Fail closed in an unconfigured production environment.
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!turnstileSecret || !url || !serviceKey) {
    return json({ error: 'Le formulaire est temporairement indisponible.' }, 503, origin);
  }

  let body: Payload;
  try {
    const text = await request.text();
    if (text.length > 8000) return json({ error: 'Formulaire trop volumineux.' }, 413, origin);
    body = JSON.parse(text) as Payload;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
  } catch {
    return json({ error: 'Donnees non valides.' }, 400, origin);
  }

  const studentName = clean(body.student_full_name, 160);
  const gender = clean(body.student_gender, 12);
  const level = clean(body.requested_level, 80);
  const guardianName = clean(body.guardian_full_name, 160);
  const relationship = clean(body.guardian_relationship, 12);
  const phone = clean(body.guardian_phone, 30);
  const email = clean(body.guardian_email, 254).toLowerCase();
  const message = clean(body.message, 1000);
  const token = clean(body.captcha_token, 4096);

  if (body.consent !== true || studentName.length < 3 || guardianName.length < 3 ||
      level.length < 2 || phone.length < 8 ||
      !['male', 'female'].includes(gender) ||
      !['mother', 'father', 'guardian'].includes(relationship) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !token) {
    return json({ error: 'Verifiez les champs obligatoires et le controle de securite.' }, 400, origin);
  }

  try {
    const verification = new FormData();
    verification.set('secret', turnstileSecret);
    verification.set('response', token);
    const captchaResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: verification });
    if (!captchaResponse.ok) throw Error('Captcha unavailable');
    const checked = await captchaResponse.json() as { success?: boolean };
    if (checked.success !== true) {
      return json({ error: 'Verification de securite non valide. Reessayez.' }, 400, origin);
    }
  } catch {
    return json({ error: 'Verification de securite temporairement indisponible.' }, 503, origin);
  }

  try {
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await db.from('public_enrollment_requests')
      .insert({
        student_full_name: studentName,
        student_gender: gender,
        requested_level: level,
        guardian_full_name: guardianName,
        guardian_relationship: relationship,
        guardian_phone: phone,
        guardian_email: email || null,
        message: message || null,
      })
      .select('reference').single();
    if (error || !data) throw Error('Database failed');
    return json({ success: true, reference: data.reference }, 201, origin);
  } catch (error) {
    console.error('Public enrollment intake failed:', error);
    return json({ error: 'Votre demande n\'a pas pu etre transmise. Reessayez plus tard.' }, 500, origin);
  }
});
