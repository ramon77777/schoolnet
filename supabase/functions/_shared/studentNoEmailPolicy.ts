// SCHOOLNET 5.C-B.2 - pure, server-only validation for a child's new Auth identity.
// No SQL, network requests or secrets. Never derive authorization from user_metadata.
import {normalizeSchoolnetFamilyPhone,SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN} from './schoolnetStudentIdentity.ts';

export type StudentRequest = {
  id: string;
  request_type: string;
  status: string;
  student_full_name: string;
  student_email: string | null;
  guardian_email: string | null;
  guardian_phone: string;
};
export type ParentInvitation = {
  recipient: string;
  expected_role: string;
  status: string;
  email: string;
  user_id: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateStudentNoEmailRequest(
  request: StudentRequest, parent: ParentInvitation,
): {parentId: string; familyPhone: string; studentName: string} {
  if (!uuid.test(request.id) || request.request_type !== 'student_enrollment' ||
    request.status === 'rejected' || request.status === 'processed' ||
    (request.student_email ?? '').trim() !== '') throw new Error('INELIGIBLE_REQUEST');
  const guardian = (request.guardian_email ?? '').trim().toLowerCase();
  const parentEmail = (parent.email ?? '').trim().toLowerCase();
  if (!guardian || guardian.length > 254 || !guardian.includes('@') ||
      parent.recipient !== 'parent' || parent.expected_role !== 'parent' ||
      parent.status !== 'activated' || !uuid.test(parent.user_id ?? '') ||
      parentEmail !== guardian) throw new Error('PARENT_PROOF_REQUIRED');
  const studentName = request.student_full_name.trim();
  if (studentName.length < 3 || studentName.length > 160) throw new Error('INVALID_STUDENT_NAME');
  return {parentId:parent.user_id!,familyPhone:normalizeSchoolnetFamilyPhone(request.guardian_phone),studentName};
}

export function technicalSchoolnetAlias(requestId: string, domain = SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN): string {
  if (!uuid.test(requestId)) throw new Error('INVALID_REQUEST_ID');
  // Uniquement le domaine interne convenu ; jamais une adresse pouvant recevoir un e-mail.
  if (domain !== SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN)
    throw new Error('TECHNICAL_DOMAIN_NOT_APPROVED');
  return `sn-${requestId.replace(/-/g,'').toLowerCase()}@${domain}`;
}

export const NO_EMAIL_STATUS_TRANSITIONS = {
  reserved:['reserved','auth_created','requires_review'],
  auth_created:['auth_created','prepared','requires_review'],
  prepared:['prepared','sent_declared','requires_review'],
  sent_declared:['sent_declared','enabled','requires_review'],
  enabled:['enabled','revoked'],
  requires_review:['requires_review'],
  revoked:['revoked'],
} as const;
export type NoEmailStatus = keyof typeof NO_EMAIL_STATUS_TRANSITIONS;
export function canAdvanceNoEmailStatus(from: NoEmailStatus, to: NoEmailStatus): boolean {
  return (NO_EMAIL_STATUS_TRANSITIONS[from] as readonly NoEmailStatus[]).includes(to);
}

export function validateAdminVerification(value: unknown): string {
  if (typeof value !== 'string') throw new Error('ADMIN_VERIFICATION_REQUIRED');
  const trimmed=value.trim();
  if (trimmed.length < 10 || trimmed.length > 1000) throw new Error('ADMIN_VERIFICATION_REQUIRED');
  return trimmed;
}