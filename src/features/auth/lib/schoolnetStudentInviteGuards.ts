// Client-side UI eligibility; database RLS remains the authorization boundary.
export type SchoolnetInviteMode = "student-invite" | "family-invite" | null;
export type AuthMarkerUser = {
  app_metadata?: Record<string, unknown> | null;
};

export function isSchoolnetNoEmailStudent(user: AuthMarkerUser | null | undefined): boolean {
  return user?.app_metadata?.schoolnet_no_email_student === true;
}

export function isInvitationSessionEligible(
  session: { user?: AuthMarkerUser | null } | null | undefined,
  mode: SchoolnetInviteMode,
): boolean {
  const user = session?.user;
  if (!user) return false;
  if (mode === "family-invite") {
    return user.app_metadata?.schoolnet_family_invitation === true;
  }
  if (mode === "student-invite") {
    // Server-owned app_metadata, never user_metadata.
    return isSchoolnetNoEmailStudent(user) &&
      user.app_metadata?.schoolnet_family_invitation !== true;
  }
  return true;
}
