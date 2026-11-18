/**
 * SCHOOLNET 5D-I — authorized, read-only Parent annual-class service core.
 *
 * No Supabase client, HTTP, Auth user metadata or SQL direct access here.
 * Callback implementations MUST come from a private server after verifying
 * the Supabase Auth user and role. Not called from the browser.
 * Fails closed when any required read is unavailable.
 */
import {
  resolveAuthorizedCurrentYearClasses,
  type AnnualEnrollmentInfo,
  type AnnualClassInfo,
  type CurrentYearClass,
} from "../../../src/features/parent/lib/parentYearClassProposal.ts";

export type ParentAnnualRead = {
  schoolYearId: string | null;
  children: CurrentYearClass[];
};

type TrustedReader = {
  parentId: string;
  getConfirmedRole: (id: string) => Promise<string | null>;
  getVerifiedLinks: (id: string) => Promise<readonly {student_id: string}[]>;
  getCurrentYears: () => Promise<readonly {id: string}[]>;
  getAnnualEnrollments: (ids: readonly string[], year: string) =>
    Promise<readonly AnnualEnrollmentInfo[]>;
  getYearClasses: (ids: readonly string[], year: string) =>
    Promise<readonly (AnnualClassInfo & {school_year_id: string | null})[]>;
};

const unique = (rows: readonly string[]) => [...new Set(rows)];

export async function readVerifiedParentAnnualClasses(
  input: TrustedReader,
): Promise<ParentAnnualRead> {
  if (!input.parentId) throw new Error("unverified_parent");
  const role = await input.getConfirmedRole(input.parentId);
  if (role !== "parent") throw new Error("parent_role_required");
  const links = await input.getVerifiedLinks(input.parentId);
  const ids = unique(links.map((l) => l.student_id?.trim()).filter(Boolean));
  if (ids.length > 100 || links.length > 100) throw new Error("too_many_links");
  if (ids.length === 0) return {schoolYearId: null, children: []};
  const years = await input.getCurrentYears();
  if (years.length !== 1 || !years[0]?.id) {
    return {
      schoolYearId: null,
      children: resolveAuthorizedCurrentYearClasses({
        verifiedParentLinks: links,
        currentYearId: null,
        annualEnrollments: null,
        classes: [],
      }),
    };
  }
  const currentYearId = years[0].id;
  const received = await input.getAnnualEnrollments(ids, currentYearId);
  if (received.length > 200) throw new Error("too_many_enrollments");
  // The client ID list does NOT authorize additional student records;
  // data loaders must also constrain by IDs and year server-side.
  const belongs = new Set(ids);
  const annualRows = received.filter((r) =>
    belongs.has(r.student_id) && r.school_year_id === currentYearId &&
    r.status === "active"
  );
  const classIds = unique(annualRows.map((r) => r.class_id).filter(Boolean));
  const loaded = classIds.length ? await input.getYearClasses(classIds, currentYearId) : [];
  const classes = loaded.filter((c) =>
    classIds.includes(c.id) && c.school_year_id === currentYearId
  );
  return {
    schoolYearId: currentYearId,
    children: resolveAuthorizedCurrentYearClasses({
      verifiedParentLinks: links,
      currentYearId,
      annualEnrollments: annualRows,
      classes,
    }),
  };
}
