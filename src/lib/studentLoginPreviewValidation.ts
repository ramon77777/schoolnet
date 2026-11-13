// SCHOOLNET 5.C-B.2 - Pure UI validation and visibility policy.
// No client-side credential verification or network calls here.
export type StudentLoginFormMode = "hidden" | "local-preview" | "sandbox" | "production";

export function resolveStudentLoginFormMode(input: {
  isDev: boolean;
  projectUrl: string;
  sandboxEnabled: boolean;
  productionEnabled?: boolean;
}): StudentLoginFormMode {
  if (input.isDev) return "local-preview";
  if (input.productionEnabled && input.projectUrl === "https://anttmbhaphkhmkoqsofd.supabase.co") return "production";
  if (input.sandboxEnabled && input.projectUrl === "https://onqlsvphmrqhelislpry.supabase.co") {
    return "sandbox";
  }
  return "hidden";
}

export type StudentLoginPreviewInput = {
  phone: string;
  studentCode: string;
  password: string;
};

export function validateStudentLoginPreview(input: StudentLoginPreviewInput): {
  phoneE164: string;
  studentCode: string;
} {
  if (typeof input.phone !== "string" || input.phone.length > 64 ||
      typeof input.studentCode !== "string" || input.studentCode.length > 60 ||
      typeof input.password !== "string" || input.password.length < 12 ||
      input.password.length > 256) {
    throw new Error("PREVIEW_INVALID_FIELDS");
  }
  if (!/^[+\d\s().-]+$/.test(input.phone)) {
    throw new Error("PREVIEW_INVALID_PHONE");
  }
  const compactPhone = input.phone.replace(/[\s().-]/g, "");
  let phoneE164 = compactPhone;
  if (/^0[157]\d{8}$/.test(phoneE164)) phoneE164 = `+225${phoneE164}`;
  else if (/^2250[157]\d{8}$/.test(phoneE164)) phoneE164 = `+${phoneE164}`;
  else if (/^00225(0[157]\d{8})$/.test(phoneE164)) phoneE164 = `+${phoneE164.slice(2)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) {
    throw new Error("PREVIEW_INVALID_PHONE");
  }
  const compactCode = input.studentCode.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^SN[A-HJ-NP-Z2-9]{12}$/.test(compactCode)) {
    throw new Error("PREVIEW_INVALID_CODE");
  }
  const studentCode = `SN-${compactCode.slice(2, 6)}-${compactCode.slice(6, 10)}-${compactCode.slice(10, 14)}`;
  return {phoneE164, studentCode};
}