// SchoolNet: public applications are verified server-side. No browser table writes.
import { createClient } from 'npm:@supabase/supabase-js@2';

type Payload = {
  request_type?: unknown;
  student_full_name?: unknown;
  student_gender?: unknown;
  requested_level?: unknown;
  student_email?: unknown;
  guardian_full_name?: unknown;
  guardian_relationship?: unknown;
  guardian_phone?: unknown;
  guardian_email?: unknown;
  message?: unknown;
  consent?: unknown;
  captcha_token?: unknown;
};

type TurnstileResult = { success?: boolean; hostname?: string };

const allowedOrigins = (Deno.env.get('SCHOOLNET_ALLOWED_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    headers: {
      ...cors(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function clean(value: unknown, maximum: number) {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned.length <= maximum ? cleaned : '';
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
    return json({ error: 'Methode non autorisee.' }, 405, origin);
  }

  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!turnstileSecret || !supabaseUrl || !serviceKey) {
    return json({ error: 'Le formulaire est temporairement indisponible.' }, 503, origin);
  }

  let body: Payload;
  try {
    const raw = await request.text();
    if (raw.length > 8000) {
      return json({ error: 'Formulaire trop volumineux.' }, 413, origin);
    }
    body = JSON.parse(raw) as Payload;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
  } catch {
    return json({ error: 'Donnees non valides.' }, 400, origin);
  }

  // Accept existing frontends during rollout; new clients always send request_type.
  const requestType = clean(body.request_type, 40) || 'student_enrollment';
  const isStudentRequest = requestType === 'student_enrollment';
  const isParentRequest = requestType === 'parent_access';
  const studentName = clean(body.student_full_name, 160);
  const gender = clean(body.student_gender, 12);
  const level = clean(body.requested_level, 80);
  const studentEmail = clean(body.student_email, 254).toLowerCase();
  const guardianName = clean(body.guardian_full_name, 160);
  const relationship = clean(body.guardian_relationship, 12);
  const phone = clean(body.guardian_phone, 30);
  const guardianEmail = clean(body.guardian_email, 254).toLowerCase();
  const message = clean(body.message, 1000);
  const token = clean(body.captcha_token, 4096);

  // Parent email is always required; learner email is optional if no personal inbox.
  if ((!isStudentRequest && !isParentRequest) ||
      body.consent !== true || studentName.length < 3 || guardianName.length < 3 ||
      phone.length < 8 || !emailPattern.test(guardianEmail) || !token ||
      !['mother', 'father', 'guardian'].includes(relationship) ||
      (isStudentRequest && (level.length < 2 || !['male', 'female'].includes(gender))) ||
      (isStudentRequest && studentEmail !== '' && !emailPattern.test(studentEmail)) ||
      (isStudentRequest && studentEmail !== '' && studentEmail === guardianEmail)) {
    return json({ error: 'Verifiez les informations obligatoires et les adresses e-mail.' }, 400, origin);
  }

  try {
    const verification = new FormData();
    verification.set('secret', turnstileSecret);
    verification.set('response', token);
    const challenge = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: verification,
    });
    if (!challenge.ok) throw Error('Turnstile unavailable');
    const checked = await challenge.json() as TurnstileResult;
    if (checked.success !== true || checked.hostname !== new URL(origin).hostname) {
      return json({ error: 'Verification de securite non valide. Reessayez.' }, 400, origin);
    }
  } catch {
    return json({ error: 'Verification de securite temporairement indisponible.' }, 503, origin);
  }

  try {
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.from('public_enrollment_requests').insert({
      request_type: requestType,
      student_full_name: studentName,
      student_gender: isStudentRequest ? gender : null,
      requested_level: isStudentRequest ? level : null,
      student_email: isStudentRequest ? (studentEmail || null) : null,
      guardian_full_name: guardianName,
      guardian_relationship: relationship,
      guardian_phone: phone,
      guardian_email: guardianEmail,
      message: message || null,
    }).select('reference').single();

    if (error || !data) throw Error('Database insert failed');
    return json({ success: true, reference: data.reference }, 201, origin);
  } catch (error) {
    console.error('SchoolNet public application failed:', error);
    return json({ error: 'Votre demande n\'a pas pu etre transmise. Reessayez plus tard.' }, 500, origin);
  }
});
