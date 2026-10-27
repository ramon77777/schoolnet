// src/features/admin/pages/AdminAverages.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type TabKey =
  | "overview"
  | "classes"
  | "periods"
  | "subjects";

type SchoolYearRow = {
  id: string;
  name: string;
  starts_on: string;
  is_current: boolean;
};

type GradingPeriodRow = {
  id: string;
  school_year_id: string;
  code: string;
  name: string;
  starts_on: string;
  ends_on: string;
  scale: number;
  is_published: boolean;
  published_at: string | null;
  published_by: string | null;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
};

type AcademicSubjectRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type StudentProfileRow = {
  id: string;
  full_name: string | null;
};

type ClassRow = {
  id: string;
  name: string;
};

type PeriodAverageRow = {
  student_id: string;
  period_id: string;
  general_average: number | null;
  subjects_count: number | null;
  subjects_coefficient_total: number | null;
};

type SubjectAverageRow = {
  student_id: string;
  subject_id: string;
  period_id: string;
  subject_average: number | null;
  assessments_count: number | null;
  assessments_coefficient_total: number | null;
};

type RankingRow = {
  student_id: string;
  class_id: string;
  period_id: string;
  general_average: number | null;
  rank_position: number | null;
  ranked_students_count: number | null;
};

type PeriodFormState = {
  schoolYearId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  scale: string;
};

type SubjectFormState = {
  code: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
};

const tabs: Array<{
  key: TabKey;
  label: string;
  icon: string;
}> = [
  {
    key: "overview",
    label: "Vue d’ensemble",
    icon: "📊",
  },
  {
    key: "classes",
    label: "Par classe",
    icon: "🏫",
  },
  {
    key: "periods",
    label: "Périodes",
    icon: "📅",
  },
  {
    key: "subjects",
    label: "Matières",
    icon: "📚",
  },
];

const EMPTY_PERIOD_FORM: PeriodFormState = {
  schoolYearId: "",
  name: "",
  startsOn: "",
  endsOn: "",
  scale: "20",
};

const EMPTY_SUBJECT_FORM: SubjectFormState = {
  code: "",
  name: "",
  sortOrder: "10",
  isActive: true,
};

function getErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    return String(
      (error as { code?: unknown }).code ?? "",
    );
  }

  return "";
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    const value = (
      error as { message?: unknown }
    ).message;

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function adminErrorMessage(
  error: unknown,
  fallback: string,
) {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  if (
    code === "23505" ||
    message.includes("duplicate") ||
    message.includes("unique")
  ) {
    return "Un élément avec ces informations existe déjà.";
  }

  if (
    code === "23503" ||
    message.includes("foreign key")
  ) {
    return (
      "Cet élément est déjà utilisé par d’autres données " +
      "de SchoolNet et ne peut pas être supprimé."
    );
  }

  if (
    code === "42501" ||
    message.includes("permission denied")
  ) {
    return "Vous n’avez pas l’autorisation d’effectuer cette opération.";
  }

  return getErrorMessage(error) || fallback;
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("fr-FR");
}

function formatScore(value: number | null) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return Number(value).toFixed(2).replace(".", ",");
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("fr");
}

function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
) {
  const totalPages = Math.max(
    1,
    Math.ceil(rows.length / pageSize),
  );

  const safePage = Math.min(
    Math.max(page, 1),
    totalPages,
  );

  const start =
    (safePage - 1) * pageSize;

  return {
    rows: rows.slice(
      start,
      start + pageSize,
    ),
    page: safePage,
    totalPages,
  };
}

type ListToolbarProps = {
  searchValue: string;
  placeholder: string;
  pageSize: number;
  onSearchChange: (value: string) => void;
  onPageSizeChange: (value: number) => void;
};

function ListToolbar({
  searchValue,
  placeholder,
  pageSize,
  onSearchChange,
  onPageSizeChange,
}: ListToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input
        type="search"
        value={searchValue}
        onChange={(event) =>
          onSearchChange(event.target.value)
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:max-w-xl"
      />

      <select
        value={pageSize}
        onChange={(event) =>
          onPageSizeChange(
            Number(event.target.value),
          )
        }
        className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        <option value={10}>10 / page</option>
        <option value={20}>20 / page</option>
        <option value={50}>50 / page</option>
      </select>
    </div>
  );
}

type PaginationControlsProps = {
  totalItems: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

function PaginationControls({
  totalItems,
  page,
  totalPages,
  onPageChange,
}: PaginationControlsProps) {
  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-gray-500">
        {totalItems} résultat
        {totalItems > 1 ? "s" : ""}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() =>
            onPageChange(
              Math.max(1, page - 1),
            )
          }
          className="sn-btn-ghost sn-press disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Précédent
        </button>

        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600">
          Page {page} / {totalPages}
        </div>

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() =>
            onPageChange(
              Math.min(
                totalPages,
                page + 1,
              ),
            )
          }
          className="sn-btn-ghost sn-press disabled:cursor-not-allowed disabled:opacity-40"
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}

function normalizePeriodCodePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\bPREMIER(?:E)?\b/g, "1")
    .replace(/\bDEUXIEME\b/g, "2")
    .replace(/\bTROISIEME\b/g, "3")
    .replace(/\bQUATRIEME\b/g, "4")
    .replace(/\b1ER(?:E)?\b/g, "1")
    .replace(/\b2E(?:ME)?\b/g, "2")
    .replace(/\b3E(?:ME)?\b/g, "3")
    .replace(/\b4E(?:ME)?\b/g, "4")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function generatePeriodCode(
  periodName: string,
  schoolYearName: string,
) {
  const normalizedName =
    normalizePeriodCodePart(periodName);

  const normalizedSchoolYear =
    normalizePeriodCodePart(schoolYearName);

  if (!normalizedName) {
    return "";
  }

  const nameParts = normalizedName
    .split("_")
    .filter(Boolean);

  const firstPart = nameParts[0] ?? "";

  const normalizedSemanticName =
    /^\d+$/.test(firstPart) &&
    nameParts.length > 1
      ? [
          ...nameParts.slice(1),
          firstPart,
        ].join("_")
      : normalizedName;

  return normalizedSchoolYear
    ? `${normalizedSemanticName}_${normalizedSchoolYear}`
    : normalizedSemanticName;
}

export default function AdminAverages() {
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] =
    useState<TabKey>("overview");

  const [schoolYears, setSchoolYears] = useState<
    SchoolYearRow[]
  >([]);

  const [periods, setPeriods] = useState<
    GradingPeriodRow[]
  >([]);

  const [subjects, setSubjects] = useState<
    AcademicSubjectRow[]
  >([]);

  const [periodAverages, setPeriodAverages] =
    useState<PeriodAverageRow[]>([]);

  const [subjectAverages, setSubjectAverages] =
    useState<SubjectAverageRow[]>([]);

  const [rankings, setRankings] = useState<
    RankingRow[]
  >([]);

  const [studentProfiles, setStudentProfiles] =
    useState<StudentProfileRow[]>([]);

  const [classes, setClasses] =
    useState<ClassRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  // Périodes
  const [periodForm, setPeriodForm] =
    useState<PeriodFormState>(
      EMPTY_PERIOD_FORM,
    );

  const [editingPeriodId, setEditingPeriodId] =
    useState<string | null>(null);

  const [savingPeriod, setSavingPeriod] =
    useState(false);

  const [busyPeriodId, setBusyPeriodId] =
    useState<string | null>(null);

  const [periodFormError, setPeriodFormError] =
    useState<string | null>(null);

  // Matières
  const [subjectForm, setSubjectForm] =
    useState<SubjectFormState>(
      EMPTY_SUBJECT_FORM,
    );

  const [editingSubjectId, setEditingSubjectId] =
    useState<string | null>(null);

  const [savingSubject, setSavingSubject] =
    useState(false);

  const [busySubjectId, setBusySubjectId] =
    useState<string | null>(null);

  const [subjectFormError, setSubjectFormError] =
    useState<string | null>(null);

const [overviewSearch, setOverviewSearch] = useState("");
const [overviewPage, setOverviewPage] = useState(1);
const [overviewPageSize, setOverviewPageSize] = useState(10);

const [classSearch, setClassSearch] = useState("");
const [classPage, setClassPage] = useState(1);
const [classPageSize, setClassPageSize] = useState(10);

const [periodSearch, setPeriodSearch] = useState("");
const [periodPage, setPeriodPage] = useState(1);
const [periodPageSize, setPeriodPageSize] = useState(10);

const [subjectSearch, setSubjectSearch] = useState("");
const [subjectPage, setSubjectPage] = useState(1);
const [subjectPageSize, setSubjectPageSize] = useState(10);

  const loadData = useCallback(
    async (silent = false) => {
      if (!user || user.isDemo) {
        setSchoolYears([]);
        setPeriods([]);
        setSubjects([]);
        setPeriodAverages([]);
        setSubjectAverages([]);
        setRankings([]);
        setStudentProfiles([]);
        setClasses([]);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        return;
      }

      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const [
          schoolYearsResult,
          periodsResult,
          subjectsResult,
          periodAveragesResult,
          subjectAveragesResult,
          rankingsResult,
          profilesResult,
          classesResult,
        ] = await Promise.all([
          supabase
            .from("school_years")
            .select(
              "id, name, starts_on, is_current",
            )
            .order("starts_on", {
              ascending: false,
            }),

          supabase
            .from("grading_periods")
            .select(
                "id, school_year_id, code, name, starts_on, ends_on, scale, is_published, published_at, published_by, is_locked, locked_at, locked_by",
            )
            .order("starts_on", {
                ascending: false,
            }),

          supabase
            .from("academic_subjects")
            .select(
              "id, code, name, sort_order, is_active",
            )
            .order("sort_order", {
              ascending: true,
            })
            .order("name", {
              ascending: true,
            }),

          supabase
            .from("student_period_averages")
            .select("*"),

          supabase
            .from("student_subject_averages")
            .select("*"),

          supabase
            .from("student_period_rankings")
            .select("*"),

          supabase
            .from("profiles")
            .select("id, full_name")
            .eq("role", "student"),

          supabase
            .from("classes")
            .select("id, name"),
        ]);
        

        if (schoolYearsResult.error) {
          throw schoolYearsResult.error;
        }

        if (periodsResult.error) {
          throw periodsResult.error;
        }

        if (subjectsResult.error) {
          throw subjectsResult.error;
        }

        if (periodAveragesResult.error) {
          throw periodAveragesResult.error;
        }

        if (subjectAveragesResult.error) {
          throw subjectAveragesResult.error;
        }

        if (rankingsResult.error) {
          throw rankingsResult.error;
        }

        if (profilesResult.error) {
          throw profilesResult.error;
        }

        if (classesResult.error) {
          throw classesResult.error;
        }

        setSchoolYears(
          (schoolYearsResult.data ??
            []) as SchoolYearRow[],
        );

        setPeriods(
          (periodsResult.data ??
            []) as GradingPeriodRow[],
        );

        setSubjects(
          (subjectsResult.data ??
            []) as AcademicSubjectRow[],
        );

        setPeriodAverages(
          (periodAveragesResult.data ??
            []) as PeriodAverageRow[],
        );

        setSubjectAverages(
          (subjectAveragesResult.data ??
            []) as SubjectAverageRow[],
        );

        setRankings(
          (rankingsResult.data ??
            []) as RankingRow[],
        );

        setStudentProfiles(
          (profilesResult.data ??
            []) as StudentProfileRow[],
        );

        setClasses(
          (classesResult.data ??
            []) as ClassRow[],
        );
      } catch (loadError) {
        console.error(
          "[AdminAverages] loadData error:",
          loadError,
        );

        setError(
          adminErrorMessage(
            loadError,
            "Impossible de charger le module Moyennes.",
          ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;

    void loadData();
  }, [authLoading, loadData]);

  const currentSchoolYear = useMemo(
    () =>
      schoolYears.find(
        (item) => item.is_current,
      ) ??
      schoolYears[0] ??
      null,
    [schoolYears],
  );

  useEffect(() => {
    if (
      periodForm.schoolYearId ||
      !currentSchoolYear
    ) {
      return;
    }

    setPeriodForm((current) => ({
      ...current,
      schoolYearId: currentSchoolYear.id,
    }));
  }, [
    currentSchoolYear,
    periodForm.schoolYearId,
  ]);

  const schoolYearById = useMemo(
    () =>
      schoolYears.reduce<
        Record<string, SchoolYearRow>
      >((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {}),
    [schoolYears],
  );

  const selectedPeriodSchoolYear =
    periodForm.schoolYearId
      ? schoolYearById[
          periodForm.schoolYearId
        ] ?? null
      : null;

  const generatedPeriodCode =
    generatePeriodCode(
      periodForm.name,
      selectedPeriodSchoolYear?.name ?? "",
    );

  const editingPeriod = useMemo(
    () =>
      editingPeriodId
        ? periods.find(
            (item) =>
              item.id === editingPeriodId,
          ) ?? null
        : null,
    [editingPeriodId, periods],
  );

  const periodCodePreview =
    editingPeriod?.code?.trim() ||
    generatedPeriodCode;

  const periodById = useMemo(
    () =>
      periods.reduce<
        Record<string, GradingPeriodRow>
      >((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {}),
    [periods],
  );


  const studentNameById = useMemo(
    () =>
      studentProfiles.reduce<
        Record<string, string>
      >((acc, profile) => {
        acc[profile.id] =
          profile.full_name?.trim() ||
          "Apprenant sans nom";

        return acc;
      }, {}),
    [studentProfiles],
  );

  const classNameById = useMemo(
    () =>
      classes.reduce<Record<string, string>>(
        (acc, item) => {
          acc[item.id] = item.name;
          return acc;
        },
        {},
      ),
    [classes],
  );

  const rankedStudentsCount = useMemo(
    () =>
      new Set(
        rankings.map(
          (item) => item.student_id,
        ),
      ).size,
    [rankings],
  );

  const averageGeneral = useMemo(() => {
    const values = periodAverages
      .map((item) =>
        Number(item.general_average),
      )
      .filter((value) =>
        Number.isFinite(value),
      );

    if (values.length === 0) {
      return null;
    }

    return (
      values.reduce(
        (sum, value) => sum + value,
        0,
      ) / values.length
    );
  }, [periodAverages]);

  const periodAverageByStudentPeriod = useMemo(() => {
    const map = new Map<string, number>();

    periodAverages.forEach((row) => {
        const average = Number(row.general_average);

        if (Number.isFinite(average) && row.general_average !== null) {
            map.set(
            `${row.student_id}:${row.period_id}`,
            average,
            );
        }
    });

    return map;
    }, [periodAverages]);

const overviewRankingRows = useMemo(
  () =>
    rankings
      .map((row) => ({
        ...row,
        general_average:
          periodAverageByStudentPeriod.get(
            `${row.student_id}:${row.period_id}`,
          ) ??
          Number(row.general_average ?? 0),
      }))
      .sort(
        (a, b) =>
          (a.rank_position ??
            Number.MAX_SAFE_INTEGER) -
          (b.rank_position ??
            Number.MAX_SAFE_INTEGER),
      ),
  [
    rankings,
    periodAverageByStudentPeriod,
  ],
);

const classAverageRows = useMemo(() => {
  const groups = new Map<
    string,
    {
      classId: string;
      periodId: string;
      total: number;
      count: number;
      highest: number;
      lowest: number;
    }
  >();

  rankings.forEach((row) => {
    const periodAverage =
      periodAverageByStudentPeriod.get(
        `${row.student_id}:${row.period_id}`,
      );

    const rankingAverage =
      row.general_average === null
        ? null
        : Number(row.general_average);

    const average =
      periodAverage ?? rankingAverage;

    if (
      average === null ||
      !Number.isFinite(average)
    ) {
      return;
    }

    const key =
      `${row.class_id}:${row.period_id}`;

    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        classId: row.class_id,
        periodId: row.period_id,
        total: average,
        count: 1,
        highest: average,
        lowest: average,
      });

      return;
    }

    current.total += average;
    current.count += 1;
    current.highest = Math.max(
      current.highest,
      average,
    );
    current.lowest = Math.min(
      current.lowest,
      average,
    );
  });

  return Array.from(groups.values())
    .map((group) => ({
      classId: group.classId,
      periodId: group.periodId,

      className:
        classNameById[group.classId] ??
        "Classe inconnue",

      periodName:
        periodById[group.periodId]?.name ??
        "Période inconnue",

      studentsCount: group.count,

      average:
        group.count > 0
          ? group.total / group.count
          : null,

      highest: group.highest,
      lowest: group.lowest,
    }))
    .sort(
      (a, b) =>
        a.className.localeCompare(
          b.className,
          "fr",
        ) ||
        a.periodName.localeCompare(
          b.periodName,
          "fr",
        ),
    );
}, [
  rankings,
  periodAverageByStudentPeriod,
  classNameById,
  periodById,
]);

const filteredOverviewRows = useMemo(() => {
  const query =
    normalizeSearch(overviewSearch);

  if (!query) {
    return overviewRankingRows;
  }

  return overviewRankingRows.filter(
    (row) => {
      const studentName =
        studentNameById[
          row.student_id
        ] ?? "";

      const className =
        classNameById[
          row.class_id
        ] ?? "";

      const periodName =
        periodById[
          row.period_id
        ]?.name ?? "";

      return [
        studentName,
        className,
        periodName,
        row.general_average,
        row.rank_position,
      ].some((value) =>
        String(value ?? "")
          .toLocaleLowerCase("fr")
          .includes(query),
      );
    },
  );
}, [
  overviewSearch,
  overviewRankingRows,
  studentNameById,
  classNameById,
  periodById,
]);

const filteredClassRows = useMemo(() => {
  const query =
    normalizeSearch(classSearch);

  if (!query) {
    return classAverageRows;
  }

  return classAverageRows.filter(
    (row) =>
      [
        row.className,
        row.periodName,
        row.studentsCount,
        row.average,
        row.highest,
        row.lowest,
      ].some((value) =>
        String(value ?? "")
          .toLocaleLowerCase("fr")
          .includes(query),
      ),
  );
}, [
  classSearch,
  classAverageRows,
]);

const filteredPeriods = useMemo(() => {
  const query =
    normalizeSearch(periodSearch);

  if (!query) {
    return periods;
  }

  return periods.filter((period) => {
    const schoolYearName =
      schoolYearById[
        period.school_year_id
      ]?.name ?? "";

    return [
      period.code,
      period.name,
      schoolYearName,
      period.starts_on,
      period.ends_on,
      period.scale,
      period.is_published
        ? "publiée"
        : "non publiée",
      period.is_locked
        ? "verrouillée"
        : "déverrouillée",
    ].some((value) =>
      String(value ?? "")
        .toLocaleLowerCase("fr")
        .includes(query),
    );
  });
}, [
  periodSearch,
  periods,
  schoolYearById,
]);

const filteredSubjects = useMemo(() => {
  const query =
    normalizeSearch(subjectSearch);

  if (!query) {
    return subjects;
  }

  return subjects.filter((subject) =>
    [
      subject.code,
      subject.name,
      subject.sort_order,
      subject.is_active
        ? "active"
        : "inactive",
    ].some((value) =>
      String(value ?? "")
        .toLocaleLowerCase("fr")
        .includes(query),
    ),
  );
}, [
  subjectSearch,
  subjects,
]);

const overviewPagination =
  paginateRows(
    filteredOverviewRows,
    overviewPage,
    overviewPageSize,
  );

const classPagination =
  paginateRows(
    filteredClassRows,
    classPage,
    classPageSize,
  );

const periodPagination =
  paginateRows(
    filteredPeriods,
    periodPage,
    periodPageSize,
  );

const subjectPagination =
  paginateRows(
    filteredSubjects,
    subjectPage,
    subjectPageSize,
  );

  const activeSubjectsCount = subjects.filter(
    (item) => item.is_active,
  ).length;

  const publishedPeriodsCount =
    periods.filter(
      (item) => item.is_published,
    ).length;

  const lockedPeriodsCount =
    periods.filter(
      (item) => item.is_locked,
    ).length;

  function resetPeriodForm() {
    setEditingPeriodId(null);
    setPeriodFormError(null);

    setPeriodForm({
      ...EMPTY_PERIOD_FORM,
      schoolYearId:
        currentSchoolYear?.id ?? "",
    });
  }

  function editPeriod(
    row: GradingPeriodRow,
  ) {
    setEditingPeriodId(row.id);
    setPeriodFormError(null);
    setSuccessMessage(null);

    setPeriodForm({
      schoolYearId: row.school_year_id,
      name: row.name,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      scale: String(row.scale),
    });
  }

  const canSavePeriod = useMemo(() => {
    const scale = Number(periodForm.scale);

    return (
      periodForm.schoolYearId.length > 0 &&
      periodForm.name.trim().length > 0 &&
      generatedPeriodCode.length > 0 &&
      periodForm.startsOn.length > 0 &&
      periodForm.endsOn.length > 0 &&
      Number.isFinite(scale) &&
      scale > 0 &&
      !savingPeriod
    );
  }, [
    generatedPeriodCode,
    periodForm,
    savingPeriod,
  ]);

  async function savePeriod() {
    if (!canSavePeriod) return;

    const codeToSave =
      editingPeriod?.code?.trim() ||
      generatedPeriodCode;

    if (!codeToSave) {
      setPeriodFormError(
        "Le code de la période n’a pas pu être généré. Vérifiez le nom et l’année scolaire.",
      );
      return;
    }

    try {
      setSavingPeriod(true);
      setPeriodFormError(null);
      setSuccessMessage(null);

      const starts = new Date(
        periodForm.startsOn,
      ).getTime();

      const ends = new Date(
        periodForm.endsOn,
      ).getTime();

      if (
        Number.isNaN(starts) ||
        Number.isNaN(ends)
      ) {
        throw new Error(
          "Les dates renseignées sont invalides.",
        );
      }

      if (ends < starts) {
        throw new Error(
          "La date de fin doit être postérieure à la date de début.",
        );
      }

      const payload = {
        school_year_id:
          periodForm.schoolYearId,

        code: codeToSave,

        name: periodForm.name.trim(),

        starts_on: periodForm.startsOn,
        ends_on: periodForm.endsOn,

        scale: Number(periodForm.scale),
      };

      if (editingPeriodId) {
        if (editingPeriod?.is_locked) {
          setPeriodFormError(
            "Cette période est verrouillée. Déverrouillez-la avant de la modifier.",
          );
          return;
        }

        const { error: updateError } =
          await supabase
            .from("grading_periods")
            .update(payload)
            .eq("id", editingPeriodId);

        if (updateError) {
          throw updateError;
        }

        setSuccessMessage(
          "La période a été modifiée avec succès.",
        );
      } else {
        const { error: insertError } =
          await supabase
            .from("grading_periods")
            .insert(payload);

        if (insertError) {
          throw insertError;
        }

        setSuccessMessage(
          `La période a été créée avec le code « ${codeToSave} ».`,
        );
      }

      resetPeriodForm();
      await loadData(true);
    } catch (saveError) {
      console.error(
        "[AdminAverages] savePeriod error:",
        saveError,
      );

      setPeriodFormError(
        adminErrorMessage(
          saveError,
          "Impossible d’enregistrer cette période.",
        ),
      );
    } finally {
      setSavingPeriod(false);
    }
  }

  async function togglePeriodPublished(
    row: GradingPeriodRow,
  ) {
    if (busyPeriodId) return;

    if (row.is_locked) {
      alert(
        "Cette période est verrouillée. Déverrouillez-la avant de modifier sa publication.",
      );
      return;
    }

    const nextValue = !row.is_published;

    const confirmed = window.confirm(
      nextValue
        ? `Publier la période « ${row.name} » ?`
        : `Retirer la publication de « ${row.name} » ?`,
    );

    if (!confirmed) return;

    try {
      setBusyPeriodId(row.id);
      setError(null);
      setSuccessMessage(null);

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const actorId =
        authData.user?.id ?? null;

      const { error: updateError } =
        await supabase
          .from("grading_periods")
          .update({
            is_published: nextValue,
            published_at: nextValue
              ? new Date().toISOString()
              : null,
            published_by: nextValue
              ? actorId
              : null,
          })
          .eq("id", row.id);

      if (updateError) {
        throw updateError;
      }

      setSuccessMessage(
        nextValue
          ? `La période « ${row.name} » est maintenant publiée.`
          : `La période « ${row.name} » n’est plus publiée.`,
      );

      await loadData(true);
    } catch (toggleError) {
      console.error(
        "[AdminAverages] togglePeriodPublished:",
        toggleError,
      );

      setError(
        adminErrorMessage(
          toggleError,
          "Impossible de modifier la publication de cette période.",
        ),
      );
    } finally {
      setBusyPeriodId(null);
    }
  }

  async function togglePeriodLocked(
    row: GradingPeriodRow,
  ) {
    if (busyPeriodId) return;

    const nextValue = !row.is_locked;

    const confirmed = window.confirm(
      nextValue
        ? `Verrouiller la période « ${row.name} » ?`
        : `Déverrouiller la période « ${row.name} » ?`,
    );

    if (!confirmed) return;

    try {
      setBusyPeriodId(row.id);
      setError(null);
      setSuccessMessage(null);

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const actorId =
        authData.user?.id ?? null;

      const { error: updateError } =
        await supabase
          .from("grading_periods")
          .update({
            is_locked: nextValue,
            locked_at: nextValue
              ? new Date().toISOString()
              : null,
            locked_by: nextValue
              ? actorId
              : null,
          })
          .eq("id", row.id);

      if (updateError) {
        throw updateError;
      }

      setSuccessMessage(
        nextValue
          ? `La période « ${row.name} » a été verrouillée.`
          : `La période « ${row.name} » a été déverrouillée.`,
      );

      await loadData(true);
    } catch (toggleError) {
      console.error(
        "[AdminAverages] togglePeriodLocked:",
        toggleError,
      );

      setError(
        adminErrorMessage(
          toggleError,
          "Impossible de modifier le verrouillage de cette période.",
        ),
      );
    } finally {
      setBusyPeriodId(null);
    }
  }

  async function deletePeriod(
    row: GradingPeriodRow,
  ) {
    if (busyPeriodId) return;

    if (
      row.is_published ||
      row.is_locked
    ) {
      alert(
        "Cette période doit être non publiée et déverrouillée avant de pouvoir être supprimée.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Supprimer définitivement la période « ${row.name} » ?`,
    );

    if (!confirmed) return;

    try {
      setBusyPeriodId(row.id);
      setError(null);
      setSuccessMessage(null);

      const { error: deleteError } =
        await supabase
          .from("grading_periods")
          .delete()
          .eq("id", row.id);

      if (deleteError) {
        throw deleteError;
      }

      if (editingPeriodId === row.id) {
        resetPeriodForm();
      }

      setSuccessMessage(
        `La période « ${row.name} » a été supprimée.`,
      );

      await loadData(true);
    } catch (deleteError) {
      console.error(
        "[AdminAverages] deletePeriod:",
        deleteError,
      );

      setError(
        adminErrorMessage(
          deleteError,
          "Impossible de supprimer cette période.",
        ),
      );
    } finally {
      setBusyPeriodId(null);
    }
  }

  function resetSubjectForm() {
    setEditingSubjectId(null);
    setSubjectFormError(null);

    setSubjectForm(
      EMPTY_SUBJECT_FORM,
    );
  }

  function editSubject(
    row: AcademicSubjectRow,
  ) {
    setEditingSubjectId(row.id);
    setSubjectFormError(null);
    setSuccessMessage(null);

    setSubjectForm({
      code: row.code,
      name: row.name,
      sortOrder: String(row.sort_order),
      isActive: row.is_active,
    });
  }

  const canSaveSubject = useMemo(() => {
    const sortOrder = Number(
      subjectForm.sortOrder,
    );

    return (
      subjectForm.code.trim().length > 0 &&
      subjectForm.name.trim().length > 0 &&
      Number.isInteger(sortOrder) &&
      sortOrder >= 0 &&
      !savingSubject
    );
  }, [subjectForm, savingSubject]);

  async function saveSubject() {
    if (!canSaveSubject) return;

    try {
      setSavingSubject(true);
      setSubjectFormError(null);
      setSuccessMessage(null);

      const payload = {
        code: subjectForm.code
          .trim()
          .toUpperCase(),

        name: subjectForm.name.trim(),

        sort_order: Number(
          subjectForm.sortOrder,
        ),

        is_active:
          subjectForm.isActive,
      };

      if (editingSubjectId) {
        const { error: updateError } =
          await supabase
            .from("academic_subjects")
            .update(payload)
            .eq("id", editingSubjectId);

        if (updateError) {
          throw updateError;
        }

        setSuccessMessage(
          "La matière a été modifiée avec succès.",
        );
      } else {
        const { error: insertError } =
          await supabase
            .from("academic_subjects")
            .insert(payload);

        if (insertError) {
          throw insertError;
        }

        setSuccessMessage(
          "La matière a été créée avec succès.",
        );
      }

      resetSubjectForm();
      await loadData(true);
    } catch (saveError) {
      console.error(
        "[AdminAverages] saveSubject:",
        saveError,
      );

      setSubjectFormError(
        adminErrorMessage(
          saveError,
          "Impossible d’enregistrer cette matière.",
        ),
      );
    } finally {
      setSavingSubject(false);
    }
  }

  async function toggleSubjectActive(
    row: AcademicSubjectRow,
  ) {
    if (busySubjectId) return;

    try {
      setBusySubjectId(row.id);
      setError(null);
      setSuccessMessage(null);

      const nextValue = !row.is_active;

      const { error: updateError } =
        await supabase
          .from("academic_subjects")
          .update({
            is_active: nextValue,
          })
          .eq("id", row.id);

      if (updateError) {
        throw updateError;
      }

      setSuccessMessage(
        nextValue
          ? `La matière « ${row.name} » est maintenant active.`
          : `La matière « ${row.name} » a été désactivée.`,
      );

      await loadData(true);
    } catch (toggleError) {
      console.error(
        "[AdminAverages] toggleSubjectActive:",
        toggleError,
      );

      setError(
        adminErrorMessage(
          toggleError,
          "Impossible de modifier cette matière.",
        ),
      );
    } finally {
      setBusySubjectId(null);
    }
  }

  async function deleteSubject(
    row: AcademicSubjectRow,
  ) {
    if (busySubjectId) return;

    const confirmed = window.confirm(
      `Supprimer définitivement la matière « ${row.name} » ?`,
    );

    if (!confirmed) return;

    try {
      setBusySubjectId(row.id);
      setError(null);
      setSuccessMessage(null);

      const { error: deleteError } =
        await supabase
          .from("academic_subjects")
          .delete()
          .eq("id", row.id);

      if (deleteError) {
        throw deleteError;
      }

      if (editingSubjectId === row.id) {
        resetSubjectForm();
      }

      setSuccessMessage(
        `La matière « ${row.name} » a été supprimée.`,
      );

      await loadData(true);
    } catch (deleteError) {
      console.error(
        "[AdminAverages] deleteSubject:",
        deleteError,
      );

      setError(
        adminErrorMessage(
          deleteError,
          "Impossible de supprimer cette matière.",
        ),
      );
    } finally {
      setBusySubjectId(null);
    }
  }

  const isLoading =
    authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-gray-900">
            Moyennes
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Gérez les périodes, matières,
            coefficients et résultats scolaires.
          </div>
        </div>

        <button
          type="button"
          className="sn-btn-ghost sn-press"
          onClick={() =>
            void loadData(true)
          }
          disabled={
            isLoading ||
            refreshing ||
            savingPeriod ||
            savingSubject ||
            Boolean(busyPeriodId) ||
            Boolean(busySubjectId)
          }
        >
          {refreshing
            ? "Actualisation..."
            : "↻ Actualiser"}
        </button>
      </div>

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode démo actif : les données réelles du
          module Moyennes ne sont pas chargées.
        </div>
      )}

      {successMessage && (
        <div className="sn-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <div className="font-semibold">
            ✅ Opération réussie
          </div>

          <div className="mt-1">
            {successMessage}
          </div>
        </div>
      )}

      {error && (
        <div className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">
            Une erreur est survenue
          </div>

          <div className="mt-1">
            {error}
          </div>
        </div>
      )}

      <div className="sn-card p-2">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const selected =
              activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() =>
                  setActiveTab(tab.key)
                }
                className={[
                  "whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                ].join(" ")}
              >
                <span className="mr-2">
                  {tab.icon}
                </span>

                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Périodes
              </div>

              <div className="mt-2 text-3xl font-semibold">
                {isLoading
                  ? "—"
                  : periods.length}
              </div>

              <div className="mt-1 text-xs text-gray-400">
                {publishedPeriodsCount} publiée(s)
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Matières actives
              </div>

              <div className="mt-2 text-3xl font-semibold text-blue-700">
                {isLoading
                  ? "—"
                  : activeSubjectsCount}
              </div>

              <div className="mt-1 text-xs text-gray-400">
                {subjects.length} au total
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Moyennes générales
              </div>

              <div className="mt-2 text-3xl font-semibold text-violet-700">
                {isLoading
                  ? "—"
                  : periodAverages.length}
              </div>

              <div className="mt-1 text-xs text-gray-400">
                Calculs disponibles
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Élèves classés
              </div>

              <div className="mt-2 text-3xl font-semibold text-emerald-700">
                {isLoading
                  ? "—"
                  : rankedStudentsCount}
              </div>

              <div className="mt-1 text-xs text-gray-400">
                Classements calculés
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Moyenne globale
              </div>

              <div className="mt-2 text-3xl font-semibold text-amber-700">
                {isLoading
                  ? "—"
                  : averageGeneral === null
                    ? "—"
                    : `${formatScore(
                        averageGeneral,
                      )}/20`}
              </div>

              <div className="mt-1 text-xs text-gray-400">
                {lockedPeriodsCount} période(s)
                verrouillée(s)
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.7fr_0.8fr]">
            <div className="sn-card overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-4">
                    <div className="font-semibold text-gray-900">
                        Résultats et classements
                    </div>

                    <div className="mt-1 text-sm text-gray-500">
                        Aperçu des moyennes générales
                        calculées par période.
                    </div>
                </div>

                <div className="border-b border-gray-100 px-5 py-4">
                    <ListToolbar
                        searchValue={overviewSearch}
                        placeholder="Rechercher un élève, une classe ou une période..."
                        pageSize={overviewPageSize}
                        onSearchChange={(value) => {
                        setOverviewSearch(value);
                        setOverviewPage(1);
                        }}
                        onPageSizeChange={(value) => {
                        setOverviewPageSize(value);
                        setOverviewPage(1);
                        }}
                    />
                </div>

              {isLoading ? (
                <div className="p-6 text-sm text-gray-500">
                  Chargement des résultats...
                </div>
              ) : filteredOverviewRows.length ===
              0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  Aucun classement disponible.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-b border-gray-100 bg-gray-50/80">
                      <tr className="text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-5 py-4 font-semibold">
                          Élève
                        </th>

                        <th className="px-5 py-4 font-semibold">
                          Classe
                        </th>

                        <th className="px-5 py-4 font-semibold">
                          Période
                        </th>

                        <th className="px-5 py-4 font-semibold">
                          Moyenne
                        </th>

                        <th className="px-5 py-4 font-semibold">
                          Rang
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {overviewPagination.rows.map(
                        (row) => (
                          <tr
                            key={`${row.student_id}-${row.period_id}-${row.class_id}`}
                            className="border-b border-gray-100 last:border-b-0"
                          >
                            <td className="px-5 py-4 font-medium text-gray-900">
                              {studentNameById[
                                row.student_id
                              ] ??
                                "Apprenant"}
                            </td>

                            <td className="px-5 py-4 text-sm text-gray-600">
                              {classNameById[
                                row.class_id
                              ] ?? "—"}
                            </td>

                            <td className="px-5 py-4 text-sm text-gray-600">
                              {periodById[
                                row.period_id
                              ]?.name ?? "—"}
                            </td>

                            <td className="px-5 py-4">
                              <span className="font-semibold text-blue-700">
                                {formatScore(
                                  row.general_average,
                                )}
                                /20
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <span className="sn-badge sn-badge-green">
                                {row.rank_position ??
                                  "—"}
                                /
                                {row.ranked_students_count ??
                                  "—"}
                              </span>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                    <div className="border-t border-gray-100 px-5 py-4">
                        <PaginationControls
                            totalItems={
                            filteredOverviewRows.length
                            }
                            page={
                            overviewPagination.page
                            }
                            totalPages={
                            overviewPagination.totalPages
                            }
                            onPageChange={
                            setOverviewPage
                            }
                        />
                    </div>
                </div>
              )}
            </div>

            <div className="sn-card p-5">
              <div className="font-semibold text-gray-900">
                État du moteur
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600">
                    Notes normalisées
                  </span>

                  <span className="sn-badge sn-badge-green">
                    Actif
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600">
                    Moyennes matières
                  </span>

                  <span className="font-semibold text-gray-900">
                    {subjectAverages.length}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600">
                    Moyennes générales
                  </span>

                  <span className="font-semibold text-gray-900">
                    {periodAverages.length}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600">
                    Classements
                  </span>

                  <span className="font-semibold text-gray-900">
                    {rankings.length}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                Les calculs affichés proviennent
                directement des vues de moyennes
                validées dans Supabase.
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "classes" && (
        <div className="space-y-6">
            <div className="sn-card p-5">
            <div className="font-semibold text-gray-900">
                Moyennes par classe
            </div>

            <div className="mt-1 text-sm text-gray-500">
                Synthèse des résultats des apprenants
                pour chaque classe et chaque période.
            </div>
            </div>

            <div className="sn-card overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
                <div className="font-semibold text-gray-900">
                Résultats des classes
                </div>

                <div className="mt-1 text-sm text-gray-500">
                    {filteredClassRows.length} résultat
                    {filteredClassRows.length !== 1 ? "s" : ""} disponible
                    {filteredClassRows.length !== 1 ? "s" : ""}.
                </div>
            </div>
            
            <div className="border-b border-gray-100 px-5 py-4">
                <ListToolbar
                    searchValue={classSearch}
                    placeholder="Rechercher une classe ou une période..."
                    pageSize={classPageSize}
                    onSearchChange={(value) => {
                    setClassSearch(value);
                    setClassPage(1);
                    }}
                    onPageSizeChange={(value) => {
                    setClassPageSize(value);
                    setClassPage(1);
                    }}
                />
            </div>

            {isLoading ? (
                <div className="p-6 text-sm text-gray-500">
                Chargement des moyennes par classe...
                </div>
            ) : filteredClassRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                Aucune moyenne de classe disponible.
                </div>
            ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="border-b border-gray-100 bg-gray-50/80">
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-5 py-4 font-semibold">
                        Classe
                        </th>

                        <th className="px-5 py-4 font-semibold">
                        Période
                        </th>

                        <th className="px-5 py-4 font-semibold">
                        Élèves classés
                        </th>

                        <th className="px-5 py-4 font-semibold">
                        Moyenne classe
                        </th>

                        <th className="px-5 py-4 font-semibold">
                        Meilleure moyenne
                        </th>

                        <th className="px-5 py-4 font-semibold">
                        Plus faible
                        </th>
                    </tr>
                    </thead>

                    <tbody>
                    {classPagination.rows.map((row) => (
                        <tr
                        key={`${row.classId}-${row.periodId}`}
                        className="border-b border-gray-100 last:border-b-0"
                        >
                        <td className="px-5 py-4 font-semibold text-gray-900">
                            {row.className}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600">
                            {row.periodName}
                        </td>

                        <td className="px-5 py-4">
                            <span className="sn-badge">
                            {row.studentsCount}
                            </span>
                        </td>

                        <td className="px-5 py-4">
                            <span className="font-semibold text-blue-700">
                            {row.average === null
                                ? "—"
                                : `${formatScore(
                                    row.average,
                                )}/20`}
                            </span>
                        </td>

                        <td className="px-5 py-4">
                            <span className="font-semibold text-emerald-700">
                            {formatScore(
                                row.highest,
                            )}
                            /20
                            </span>
                        </td>

                        <td className="px-5 py-4">
                            <span className="font-semibold text-amber-700">
                            {formatScore(
                                row.lowest,
                            )}
                            /20
                            </span>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                <div className="border-t border-gray-100 px-5 py-4">
                    <PaginationControls
                        totalItems={
                        filteredClassRows.length
                        }
                        page={
                        classPagination.page
                        }
                        totalPages={
                        classPagination.totalPages
                        }
                        onPageChange={
                        setClassPage
                        }
                    />
                </div>
                </div>
            )}
            </div>
        </div>
    )}

      {activeTab === "periods" && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.65fr]">
          <div className="sn-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">
                  {editingPeriodId
                    ? "Modifier la période"
                    : "Nouvelle période"}
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Trimestre, semestre ou période
                  personnalisée.
                </div>
              </div>

              {editingPeriodId && (
                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  onClick={resetPeriodForm}
                  disabled={savingPeriod}
                >
                  Annuler
                </button>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Année scolaire
                </label>

                <select
                  value={
                    periodForm.schoolYearId
                  }
                  onChange={(event) =>
                    setPeriodForm(
                      (current) => ({
                        ...current,
                        schoolYearId:
                          event.target.value,
                      }),
                    )
                  }
                  disabled={savingPeriod}
                  className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">
                    Sélectionner une année
                  </option>

                  {schoolYears.map(
                    (schoolYear) => (
                      <option
                        key={schoolYear.id}
                        value={schoolYear.id}
                      >
                        {schoolYear.name}
                        {schoolYear.is_current
                          ? " — active"
                          : ""}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Nom
                </label>

                <input
                  value={periodForm.name}
                  onChange={(event) =>
                    setPeriodForm(
                      (current) => ({
                        ...current,
                        name: event.target.value,
                      }),
                    )
                  }
                  placeholder="Ex. 1er trimestre"
                  disabled={savingPeriod}
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Code automatique
                </label>

                <div className="mt-1 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <div className="break-all text-sm font-semibold text-gray-700">
                    {periodCodePreview ||
                      "Généré automatiquement"}
                  </div>

                  <div className="mt-1 text-xs leading-5 text-gray-400">
                    {editingPeriod
                      ? "Le code existant est conservé lors de la modification afin de préserver les références déjà utilisées."
                      : periodCodePreview
                        ? "Code généré automatiquement à partir du nom et de l’année scolaire."
                        : "Saisissez le nom de la période pour générer automatiquement son code."}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Début
                  </label>

                  <input
                    type="date"
                    value={
                      periodForm.startsOn
                    }
                    onChange={(event) =>
                      setPeriodForm(
                        (current) => ({
                          ...current,
                          startsOn:
                            event.target.value,
                        }),
                      )
                    }
                    disabled={savingPeriod}
                    className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Fin
                  </label>

                  <input
                    type="date"
                    value={periodForm.endsOn}
                    onChange={(event) =>
                      setPeriodForm(
                        (current) => ({
                          ...current,
                          endsOn:
                            event.target.value,
                        }),
                      )
                    }
                    disabled={savingPeriod}
                    className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Barème
                </label>

                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={periodForm.scale}
                  onChange={(event) =>
                    setPeriodForm(
                      (current) => ({
                        ...current,
                        scale: event.target.value,
                      }),
                    )
                  }
                  disabled={savingPeriod}
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />

                <div className="mt-1 text-xs text-gray-400">
                  20 pour une moyenne sur 20.
                </div>
              </div>

              {periodFormError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {periodFormError}
                </div>
              )}

              <button
                type="button"
                className="sn-btn-primary sn-press w-full"
                disabled={!canSavePeriod}
                onClick={() =>
                  void savePeriod()
                }
              >
                {savingPeriod
                  ? "Enregistrement..."
                  : editingPeriodId
                    ? "Enregistrer les modifications"
                    : "Créer la période"}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="sn-card p-4">
                <ListToolbar
                    searchValue={periodSearch}
                    placeholder="Rechercher une période, un code ou une année scolaire..."
                    pageSize={periodPageSize}
                    onSearchChange={(value) => {
                    setPeriodSearch(value);
                    setPeriodPage(1);
                    }}
                    onPageSizeChange={(value) => {
                    setPeriodPageSize(value);
                    setPeriodPage(1);
                    }}
                />
            </div>
            {isLoading && (
              <div className="sn-card p-6 text-sm text-gray-500">
                Chargement des périodes...
              </div>
            )}

            {!isLoading &&
              filteredPeriods.length === 0 && (
                <div className="sn-card p-8 text-center text-sm text-gray-500">
                  Aucune période enregistrée.
                </div>
              )}

            {!isLoading &&
              periodPagination.rows.map(
                (period) => (
                <div
                  key={period.id}
                  className="sn-card sn-card-hover p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-gray-900">
                          {period.name}
                        </div>

                        {period.is_published && (
                          <span className="sn-badge sn-badge-green">
                            Publiée
                          </span>
                        )}

                        {period.is_locked && (
                          <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            🔒 Verrouillée
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        {period.code} ·{" "}
                        {schoolYearById[
                          period.school_year_id
                        ]?.name ?? "—"}
                      </div>

                      <div className="mt-2 text-sm text-gray-600">
                        {formatDate(
                          period.starts_on,
                        )}{" "}
                        →{" "}
                        {formatDate(
                          period.ends_on,
                        )}{" "}
                        · Barème /{period.scale}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="sn-btn-ghost sn-press"
                        onClick={() =>
                          editPeriod(period)
                        }
                        disabled={
                          Boolean(
                            busyPeriodId,
                          ) ||
                          period.is_locked
                        }
                      >
                        Modifier
                      </button>

                      <button
                        type="button"
                        className="sn-btn-ghost sn-press"
                        onClick={() =>
                          void togglePeriodPublished(
                            period,
                          )
                        }
                        disabled={
                          Boolean(
                            busyPeriodId,
                          ) ||
                          period.is_locked
                        }
                      >
                        {period.is_published
                          ? "Dépublier"
                          : "Publier"}
                      </button>

                      <button
                        type="button"
                        className="sn-btn-ghost sn-press"
                        onClick={() =>
                          void togglePeriodLocked(
                            period,
                          )
                        }
                        disabled={Boolean(
                          busyPeriodId,
                        )}
                      >
                        {period.is_locked
                          ? "🔓 Déverrouiller"
                          : "🔒 Verrouiller"}
                      </button>

                      <button
                        type="button"
                        className="sn-btn-ghost sn-press text-red-600"
                        onClick={() =>
                          void deletePeriod(
                            period,
                          )
                        }
                        disabled={Boolean(
                          busyPeriodId,
                        )}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
                {filteredPeriods.length > 0 && (
                    <div className="sn-card p-4">
                        <PaginationControls
                        totalItems={
                            filteredPeriods.length
                        }
                        page={
                            periodPagination.page
                        }
                        totalPages={
                            periodPagination.totalPages
                        }
                        onPageChange={
                            setPeriodPage
                        }
                        />
                    </div>
                )}
          </div>
        </div>
      )}

      {activeTab === "subjects" && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.65fr]">
          <div className="sn-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">
                  {editingSubjectId
                    ? "Modifier la matière"
                    : "Nouvelle matière"}
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Référentiel académique utilisé
                  pour le calcul des moyennes.
                </div>
              </div>

              {editingSubjectId && (
                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  onClick={resetSubjectForm}
                  disabled={savingSubject}
                >
                  Annuler
                </button>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Code
                </label>

                <input
                  value={subjectForm.code}
                  onChange={(event) =>
                    setSubjectForm(
                      (current) => ({
                        ...current,
                        code: event.target.value,
                      }),
                    )
                  }
                  placeholder="Ex. MATH"
                  disabled={savingSubject}
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Nom
                </label>

                <input
                  value={subjectForm.name}
                  onChange={(event) =>
                    setSubjectForm(
                      (current) => ({
                        ...current,
                        name: event.target.value,
                      }),
                    )
                  }
                  placeholder="Ex. Mathématiques"
                  disabled={savingSubject}
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Ordre d’affichage
                </label>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    subjectForm.sortOrder
                  }
                  onChange={(event) =>
                    setSubjectForm(
                      (current) => ({
                        ...current,
                        sortOrder:
                          event.target.value,
                      }),
                    )
                  }
                  disabled={savingSubject}
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 p-4">
                <div>
                  <div className="text-sm font-semibold text-gray-800">
                    Matière active
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    Disponible pour les
                    coefficients et les cours.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={
                    subjectForm.isActive
                  }
                  onChange={(event) =>
                    setSubjectForm(
                      (current) => ({
                        ...current,
                        isActive:
                          event.target.checked,
                      }),
                    )
                  }
                  disabled={savingSubject}
                  className="h-5 w-5"
                />
              </label>

              {subjectFormError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {subjectFormError}
                </div>
              )}

              <button
                type="button"
                className="sn-btn-primary sn-press w-full"
                disabled={!canSaveSubject}
                onClick={() =>
                  void saveSubject()
                }
              >
                {savingSubject
                  ? "Enregistrement..."
                  : editingSubjectId
                    ? "Enregistrer les modifications"
                    : "Créer la matière"}
              </button>
            </div>
          </div>

          <div className="sn-card overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="font-semibold text-gray-900">
                Matières académiques
              </div>

                <div className="mt-1 text-sm text-gray-500">
                    {filteredSubjects.length} matière
                    {filteredSubjects.length !== 1 ? "s" : ""}{" "}
                    enregistrée
                    {filteredSubjects.length !== 1 ? "s" : ""}.
                </div>
            </div>

            <div className="border-b border-gray-100 px-5 py-4">
                <ListToolbar
                    searchValue={subjectSearch}
                    placeholder="Rechercher une matière ou un code..."
                    pageSize={subjectPageSize}
                    onSearchChange={(value) => {
                    setSubjectSearch(value);
                    setSubjectPage(1);
                    }}
                    onPageSizeChange={(value) => {
                    setSubjectPageSize(value);
                    setSubjectPage(1);
                    }}
                />
            </div>

            {isLoading ? (
              <div className="p-6 text-sm text-gray-500">
                Chargement des matières...
              </div>
            ) : filteredSubjects.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Aucune matière enregistrée.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-gray-100 bg-gray-50/80">
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-5 py-4 font-semibold">
                        Ordre
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        Code
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        Matière
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        État
                      </th>

                      <th className="px-5 py-4 text-right font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {subjectPagination.rows.map(
                      (subject) => (
                        <tr
                          key={subject.id}
                          className="border-b border-gray-100 last:border-b-0"
                        >
                          <td className="px-5 py-4 text-sm text-gray-600">
                            {
                              subject.sort_order
                            }
                          </td>

                          <td className="px-5 py-4">
                            <code className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-700">
                              {subject.code}
                            </code>
                          </td>

                          <td className="px-5 py-4 font-medium text-gray-900">
                            {subject.name}
                          </td>

                          <td className="px-5 py-4">
                            {subject.is_active ? (
                              <span className="sn-badge sn-badge-green">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                                Inactive
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="sn-btn-ghost sn-press"
                                onClick={() =>
                                  editSubject(
                                    subject,
                                  )
                                }
                                disabled={Boolean(
                                  busySubjectId,
                                )}
                              >
                                Modifier
                              </button>

                              <button
                                type="button"
                                className="sn-btn-ghost sn-press"
                                onClick={() =>
                                  void toggleSubjectActive(
                                    subject,
                                  )
                                }
                                disabled={Boolean(
                                  busySubjectId,
                                )}
                              >
                                {subject.is_active
                                  ? "Désactiver"
                                  : "Activer"}
                              </button>

                              <button
                                type="button"
                                className="sn-btn-ghost sn-press text-red-600"
                                onClick={() =>
                                  void deleteSubject(
                                    subject,
                                  )
                                }
                                disabled={Boolean(
                                  busySubjectId,
                                )}
                              >
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                <div className="border-t border-gray-100 px-5 py-4">
                    <PaginationControls
                        totalItems={
                        filteredSubjects.length
                        }
                        page={
                        subjectPagination.page
                        }
                        totalPages={
                        subjectPagination.totalPages
                        }
                        onPageChange={
                        setSubjectPage
                        }
                    />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}