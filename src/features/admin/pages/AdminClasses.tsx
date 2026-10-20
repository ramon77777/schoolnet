// src/features/admin/pages/AdminClasses.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PAGE_SIZE = 10;

type LevelRow = {
  id: number;
  name: string;
  order_index: number;
};

type SchoolYearRow = {
  id: string;
  name: string;
  starts_on: string;
  is_current: boolean;
};

type ClassRow = {
  id: string;
  level_id: number;
  name: string;
  school_year: string;
  school_year_id: string | null;
};

type ClassStudentRow = {
  class_id: string;
  student_id: string;
};

type ClassTeacherRow = {
  class_id: string;
  teacher_id: string;
  assignment_role: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

type TeacherOption = {
  id: string;
  name: string;
};

type StudentOption = {
  id: string;
  name: string;
};

type StudentView = {
  id: string;
  name: string;
};

type TeacherView = {
  id: string;
  name: string;
  assignmentRole: string;
};

type ClassView = {
  id: string;
  name: string;
  schoolYear: string;
  schoolYearId: string | null;
  levelId: number;
  levelName: string;
  levelOrder: number;
  studentCount: number;
  students: StudentView[];
  teachers: TeacherView[];
};

type Metrics = {
  students: number;
  teachers: number;
};

type AssignmentRole = "main" | "assistant";

function teacherRoleLabel(role: string) {
  if (role === "main") return "Principal";
  if (role === "assistant") return "Assistant";

  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code ?? "");
  }

  return "";
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "";
}

export default function AdminClasses() {
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRow[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);

  const [metrics, setMetrics] = useState<Metrics>({
    students: 0,
    teachers: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [schoolYearFilter, setSchoolYearFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Création d'une classe
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newClassName, setNewClassName] = useState("");
  const [newLevelId, setNewLevelId] = useState("");
  const [newSchoolYearId, setNewSchoolYearId] = useState("");

  // Gestion des affectations d'une classe
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedAssignmentRole, setSelectedAssignmentRole] =
    useState<AssignmentRole>("main");

  const [assigningTeacher, setAssigningTeacher] = useState(false);
  const [removingTeacherKey, setRemovingTeacherKey] = useState<string | null>(
    null
  );

  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentSuccess, setAssignmentSuccess] = useState<string | null>(
    null
  );

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [assigningStudent, setAssigningStudent] = useState(false);
  const [removingStudentKey, setRemovingStudentKey] = useState<string | null>(
    null
  );
  const [studentAssignmentError, setStudentAssignmentError] = useState<
    string | null
  >(null);
  const [studentAssignmentSuccess, setStudentAssignmentSuccess] = useState<
    string | null
  >(null);

  const loadClasses = useCallback(async (silent = false) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const [
        levelsResult,
        schoolYearsResult,
        classesResult,
        classStudentsResult,
        classTeachersResult,
        teacherProfilesResult,
        studentProfilesResult,
      ] = await Promise.all([
        supabase
          .from("levels")
          .select("id, name, order_index")
          .order("order_index", { ascending: true }),

        supabase
          .from("school_years")
          .select("id, name, starts_on, is_current")
          .order("starts_on", { ascending: false }),

        supabase
          .from("classes")
          .select("id, level_id, name, school_year, school_year_id")
          .order("school_year", { ascending: false })
          .order("name", { ascending: true }),

        supabase
          .from("class_students")
          .select("class_id, student_id"),

        supabase
          .from("class_teachers")
          .select("class_id, teacher_id, assignment_role"),

        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "teacher"),

        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "student"),
      ]);

      if (levelsResult.error) throw levelsResult.error;
      if (schoolYearsResult.error) throw schoolYearsResult.error;
      if (classesResult.error) throw classesResult.error;
      if (classStudentsResult.error) throw classStudentsResult.error;
      if (classTeachersResult.error) throw classTeachersResult.error;
      if (teacherProfilesResult.error) throw teacherProfilesResult.error;
      if (studentProfilesResult.error) throw studentProfilesResult.error;

      const levelsData = (levelsResult.data ?? []) as LevelRow[];
      const schoolYearsData = (schoolYearsResult.data ?? []) as SchoolYearRow[];
      const classesData = (classesResult.data ?? []) as ClassRow[];

      const classStudentsData = (classStudentsResult.data ??
        []) as ClassStudentRow[];

      const classTeachersData = (classTeachersResult.data ??
        []) as ClassTeacherRow[];

      const teacherProfilesData = (teacherProfilesResult.data ??
        []) as ProfileRow[];

      const studentProfilesData = (studentProfilesResult.data ??
        []) as ProfileRow[];

      const levelById = levelsData.reduce<Record<number, LevelRow>>(
        (acc, level) => {
          acc[level.id] = level;
          return acc;
        },
        {}
      );

      const teacherNameById = teacherProfilesData.reduce<Record<string, string>>(
        (acc, profile) => {
          acc[profile.id] =
            profile.full_name?.trim() ||
            `Enseignant (${profile.id.slice(0, 8)}…)`;

          return acc;
        },
        {}
      );

      const allTeacherOptions: TeacherOption[] = teacherProfilesData
        .map((profile) => ({
          id: profile.id,
          name:
            profile.full_name?.trim() ||
            `Enseignant (${profile.id.slice(0, 8)}…)`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));

      const studentNameById = studentProfilesData.reduce<Record<string, string>>(
        (acc, profile) => {
          acc[profile.id] = profile.full_name?.trim() || "Apprenant sans nom";
          return acc;
        },
        {}
      );

      const allStudentOptions: StudentOption[] = studentProfilesData
        .map((profile) => ({
          id: profile.id,
          name: profile.full_name?.trim() || "Apprenant sans nom",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));

      const studentCountByClass = classStudentsData.reduce<
        Record<string, number>
      >((acc, row) => {
        acc[row.class_id] = (acc[row.class_id] ?? 0) + 1;
        return acc;
      }, {});

      const studentsByClass = classStudentsData.reduce<
        Record<string, StudentView[]>
      >((acc, row) => {
        if (!acc[row.class_id]) {
          acc[row.class_id] = [];
        }

        acc[row.class_id].push({
          id: row.student_id,
          name: studentNameById[row.student_id] ?? "Apprenant sans nom",
        });

        return acc;
      }, {});

      Object.values(studentsByClass).forEach((studentList) => {
        studentList.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      });

      const teachersByClass = classTeachersData.reduce<
        Record<string, TeacherView[]>
      >((acc, row) => {
        if (!acc[row.class_id]) {
          acc[row.class_id] = [];
        }

        acc[row.class_id].push({
          id: row.teacher_id,
          name:
            teacherNameById[row.teacher_id] ??
            `Enseignant (${row.teacher_id.slice(0, 8)}…)`,
          assignmentRole: row.assignment_role,
        });

        return acc;
      }, {});

      Object.values(teachersByClass).forEach((teacherList) => {
        teacherList.sort((a, b) => {
          if (a.assignmentRole !== b.assignmentRole) {
            if (a.assignmentRole === "main") return -1;
            if (b.assignmentRole === "main") return 1;
          }

          return a.name.localeCompare(b.name, "fr");
        });
      });

      const finalClasses: ClassView[] = classesData
        .map((classRow) => {
          const level = levelById[classRow.level_id];

          return {
            id: classRow.id,
            name: classRow.name,
            schoolYear: classRow.school_year,
            schoolYearId: classRow.school_year_id,
            levelId: classRow.level_id,
            levelName: level?.name ?? "Niveau non renseigné",
            levelOrder: level?.order_index ?? 9999,
            studentCount: studentCountByClass[classRow.id] ?? 0,
            students: studentsByClass[classRow.id] ?? [],
            teachers: teachersByClass[classRow.id] ?? [],
          };
        })
        .sort((a, b) => {
          if (a.schoolYear !== b.schoolYear) {
            return b.schoolYear.localeCompare(a.schoolYear, "fr");
          }

          if (a.levelOrder !== b.levelOrder) {
            return a.levelOrder - b.levelOrder;
          }

          return a.name.localeCompare(b.name, "fr");
        });

      setLevels(levelsData);
      setSchoolYears(schoolYearsData);
      setClasses(finalClasses);
      setTeacherOptions(allTeacherOptions);
      setStudentOptions(allStudentOptions);

      setMetrics({
        students: new Set(
          classStudentsData.map((row) => row.student_id)
        ).size,

        teachers: new Set(
          classTeachersData.map((row) => row.teacher_id)
        ).size,
      });
    } catch (err) {
      console.error("[AdminClasses] loadClasses error:", err);

      setError("Impossible de charger les classes.");
      setClasses([]);
      setLevels([]);
      setSchoolYears([]);
      setTeacherOptions([]);
      setStudentOptions([]);

      setMetrics({
        students: 0,
        teachers: 0,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  const schoolYearFilterOptions = useMemo(() => {
    return Array.from(
      new Set(
        classes
          .map((item) => item.schoolYear)
          .filter(Boolean)
      )
    ).sort((a, b) => b.localeCompare(a, "fr"));
  }, [classes]);

  const filteredClasses = useMemo(() => {
    const cleanSearch = search.trim().toLocaleLowerCase("fr");

    return classes.filter((item) => {
      const matchesLevel =
        levelFilter === "all" ||
        String(item.levelId) === levelFilter;

      const matchesSchoolYear =
        schoolYearFilter === "all" ||
        item.schoolYear === schoolYearFilter;

      const matchesSearch =
        !cleanSearch ||
        item.name.toLocaleLowerCase("fr").includes(cleanSearch) ||
        item.levelName.toLocaleLowerCase("fr").includes(cleanSearch) ||
        item.schoolYear.toLocaleLowerCase("fr").includes(cleanSearch) ||
        item.teachers.some((teacher) =>
          teacher.name.toLocaleLowerCase("fr").includes(cleanSearch)
        ) ||
        item.students.some((student) =>
          student.name.toLocaleLowerCase("fr").includes(cleanSearch)
        );

      return matchesLevel && matchesSchoolYear && matchesSearch;
    });
  }, [classes, search, levelFilter, schoolYearFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, levelFilter, schoolYearFilter]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredClasses.length / PAGE_SIZE)
  );

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const paginatedClasses = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredClasses.slice(start, start + PAGE_SIZE);
  }, [filteredClasses, page]);

  const firstDisplayed =
    filteredClasses.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  const lastDisplayed = Math.min(
    page * PAGE_SIZE,
    filteredClasses.length
  );

  const selectedClass = useMemo(() => {
    if (!selectedClassId) return null;

    return classes.find((item) => item.id === selectedClassId) ?? null;
  }, [classes, selectedClassId]);

  const availableTeacherOptions = useMemo(() => {
    if (!selectedClass) return teacherOptions;

    const assignedIds = new Set(
      selectedClass.teachers.map((teacher) => teacher.id)
    );

    return teacherOptions.filter(
      (teacher) => !assignedIds.has(teacher.id)
    );
  }, [selectedClass, teacherOptions]);

  const availableStudentOptions = useMemo(() => {
    if (!selectedClass) return studentOptions;

    const assignedStudentIdsForSchoolYear = new Set<string>();

    classes.forEach((item) => {
      if (item.schoolYear !== selectedClass.schoolYear) return;

      item.students.forEach((student) => {
        assignedStudentIdsForSchoolYear.add(student.id);
      });
    });

    return studentOptions.filter(
      (student) => !assignedStudentIdsForSchoolYear.has(student.id)
    );
  }, [classes, selectedClass, studentOptions]);

  useEffect(() => {
    if (!manageModalOpen) return;

    if (
      selectedTeacherId &&
      availableTeacherOptions.some(
        (teacher) => teacher.id === selectedTeacherId
      )
    ) {
      return;
    }

    setSelectedTeacherId(availableTeacherOptions[0]?.id ?? "");
  }, [
    manageModalOpen,
    availableTeacherOptions,
    selectedTeacherId,
  ]);

  useEffect(() => {
    if (!manageModalOpen) return;

    if (
      selectedStudentId &&
      availableStudentOptions.some(
        (student) => student.id === selectedStudentId
      )
    ) {
      return;
    }

    setSelectedStudentId(availableStudentOptions[0]?.id ?? "");
  }, [
    manageModalOpen,
    availableStudentOptions,
    selectedStudentId,
  ]);

  function openCreateModal() {
    const currentSchoolYear =
      schoolYears.find((schoolYear) => schoolYear.is_current) ??
      schoolYears[0];

    setNewClassName("");
    setNewLevelId(levels[0] ? String(levels[0].id) : "");
    setNewSchoolYearId(currentSchoolYear?.id ?? "");
    setCreateError(null);
    setSuccessMessage(null);
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (creating) return;

    setCreateOpen(false);
    setCreateError(null);
  }

  async function createClass() {
    if (creating) return;

    const cleanName = newClassName.trim();
    const levelId = Number(newLevelId);

    if (!cleanName) {
      setCreateError("Veuillez saisir le nom de la classe.");
      return;
    }

    if (!newLevelId || !Number.isFinite(levelId)) {
      setCreateError("Veuillez sélectionner un niveau.");
      return;
    }

    if (!newSchoolYearId) {
      setCreateError("Veuillez sélectionner une année scolaire.");
      return;
    }

    const selectedSchoolYear = schoolYears.find(
      (schoolYear) => schoolYear.id === newSchoolYearId
    );

    if (!selectedSchoolYear) {
      setCreateError("L’année scolaire sélectionnée est introuvable.");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      setSuccessMessage(null);

      const { error: insertError } = await supabase
        .from("classes")
        .insert({
          name: cleanName,
          level_id: levelId,
          school_year: selectedSchoolYear.name,
          school_year_id: selectedSchoolYear.id,
        });

      if (insertError) {
        throw insertError;
      }

      setCreateOpen(false);
      setNewClassName("");
      setNewLevelId("");
      setNewSchoolYearId("");

      setSuccessMessage(
        `La classe « ${cleanName} » a été créée avec succès.`
      );

      await loadClasses(true);
    } catch (err) {
      console.error("[AdminClasses] createClass error:", err);

      const code = getErrorCode(err);
      const message = getErrorMessage(err).toLowerCase();

      if (
        code === "23505" ||
        message.includes("duplicate") ||
        message.includes("unique")
      ) {
        setCreateError(
          "Cette classe existe déjà pour ce niveau et cette année scolaire."
        );
      } else {
        setCreateError(
          "Impossible de créer la classe. Veuillez réessayer."
        );
      }
    } finally {
      setCreating(false);
    }
  }

  function openManageModal(item: ClassView) {
    const alreadyAssignedTeacherIds = new Set(
      item.teachers.map((teacher) => teacher.id)
    );

    const firstAvailableTeacher = teacherOptions.find(
      (teacher) => !alreadyAssignedTeacherIds.has(teacher.id)
    );

    const alreadyHasMainTeacher = item.teachers.some(
      (teacher) => teacher.assignmentRole === "main"
    );

    const assignedStudentIdsForSchoolYear = new Set<string>();

    classes.forEach((classItem) => {
      if (classItem.schoolYear !== item.schoolYear) return;

      classItem.students.forEach((student) => {
        assignedStudentIdsForSchoolYear.add(student.id);
      });
    });

    const firstAvailableStudent = studentOptions.find(
      (student) => !assignedStudentIdsForSchoolYear.has(student.id)
    );

    setSelectedClassId(item.id);
    setSelectedTeacherId(firstAvailableTeacher?.id ?? "");
    setSelectedStudentId(firstAvailableStudent?.id ?? "");

    setSelectedAssignmentRole(
      alreadyHasMainTeacher ? "assistant" : "main"
    );

    setAssignmentError(null);
    setAssignmentSuccess(null);
    setStudentAssignmentError(null);
    setStudentAssignmentSuccess(null);
    setSuccessMessage(null);
    setManageModalOpen(true);
  }

  function closeManageModal() {
    if (
      assigningTeacher ||
      removingTeacherKey ||
      assigningStudent ||
      removingStudentKey
    ) {
      return;
    }

    setManageModalOpen(false);
    setSelectedClassId(null);
    setSelectedTeacherId("");
    setSelectedStudentId("");
    setSelectedAssignmentRole("main");
    setAssignmentError(null);
    setAssignmentSuccess(null);
    setStudentAssignmentError(null);
    setStudentAssignmentSuccess(null);
  }

  async function assignTeacher() {
    if (
      !selectedClass ||
      assigningTeacher ||
      !selectedTeacherId
    ) {
      return;
    }

    const teacher = teacherOptions.find(
      (item) => item.id === selectedTeacherId
    );

    if (!teacher) {
      setAssignmentError(
        "L’enseignant sélectionné est introuvable."
      );
      return;
    }

    const alreadyAssigned = selectedClass.teachers.some(
      (item) => item.id === selectedTeacherId
    );

    if (alreadyAssigned) {
      setAssignmentError(
        "Cet enseignant est déjà affecté à cette classe."
      );
      return;
    }

    try {
      setAssigningTeacher(true);
      setAssignmentError(null);
      setAssignmentSuccess(null);
      setStudentAssignmentError(null);
      setStudentAssignmentSuccess(null);

      const { error: insertError } = await supabase
        .from("class_teachers")
        .insert({
          class_id: selectedClass.id,
          teacher_id: selectedTeacherId,
          assignment_role: selectedAssignmentRole,
        });

      if (insertError) {
        throw insertError;
      }

      const roleLabel = teacherRoleLabel(selectedAssignmentRole);

      setAssignmentSuccess(
        `${teacher.name} a été affecté à la classe ${selectedClass.name} comme ${roleLabel.toLowerCase()}.`
      );

      setSuccessMessage(
        `${teacher.name} a été affecté à la classe « ${selectedClass.name} ».`
      );

      setSelectedTeacherId("");

      await loadClasses(true);
    } catch (err) {
      console.error("[AdminClasses] assignTeacher error:", err);

      const code = getErrorCode(err);
      const message = getErrorMessage(err).toLowerCase();

      if (
        code === "23505" ||
        message.includes("duplicate") ||
        message.includes("unique")
      ) {
        setAssignmentError(
          "Cet enseignant est déjà affecté à cette classe."
        );
      } else {
        setAssignmentError(
          "Impossible d’affecter cet enseignant. Veuillez réessayer."
        );
      }
    } finally {
      setAssigningTeacher(false);
    }
  }

  async function removeTeacher(
    classItem: ClassView,
    teacher: TeacherView
  ) {
    if (removingTeacherKey) return;

    const confirmed = window.confirm(
      `Retirer ${teacher.name} de la classe ${classItem.name} ?`
    );

    if (!confirmed) return;

    const removalKey = `${classItem.id}-${teacher.id}`;

    try {
      setRemovingTeacherKey(removalKey);
      setAssignmentError(null);
      setAssignmentSuccess(null);
      setStudentAssignmentError(null);
      setStudentAssignmentSuccess(null);

      const { error: deleteError } = await supabase
        .from("class_teachers")
        .delete()
        .eq("class_id", classItem.id)
        .eq("teacher_id", teacher.id);

      if (deleteError) {
        throw deleteError;
      }

      setAssignmentSuccess(
        `${teacher.name} a été retiré de la classe ${classItem.name}.`
      );

      setSuccessMessage(
        `${teacher.name} a été retiré de la classe « ${classItem.name} ».`
      );

      await loadClasses(true);
    } catch (err) {
      console.error("[AdminClasses] removeTeacher error:", err);

      setAssignmentError(
        "Impossible de retirer cet enseignant. Veuillez réessayer."
      );
    } finally {
      setRemovingTeacherKey(null);
    }
  }


  async function assignStudent() {
    if (
      !selectedClass ||
      assigningStudent ||
      !selectedStudentId
    ) {
      return;
    }

    const student = studentOptions.find(
      (item) => item.id === selectedStudentId
    );

    if (!student) {
      setStudentAssignmentError(
        "L’apprenant sélectionné est introuvable."
      );
      return;
    }

    const alreadyAssignedToSelectedClass = selectedClass.students.some(
      (item) => item.id === selectedStudentId
    );

    if (alreadyAssignedToSelectedClass) {
      setStudentAssignmentError(
        "Cet apprenant est déjà affecté à cette classe."
      );
      return;
    }

    const alreadyAssignedForSchoolYear = classes.some(
      (classItem) =>
        classItem.schoolYear === selectedClass.schoolYear &&
        classItem.students.some((item) => item.id === selectedStudentId)
    );

    if (alreadyAssignedForSchoolYear) {
      setStudentAssignmentError(
        `Cet apprenant est déjà affecté à une classe pour l’année scolaire ${selectedClass.schoolYear}.`
      );
      return;
    }

    try {
      setAssigningStudent(true);
      setStudentAssignmentError(null);
      setStudentAssignmentSuccess(null);
      setAssignmentError(null);
      setAssignmentSuccess(null);

      const { error: rpcError } = await supabase.rpc(
        "admin_assign_student_to_class",
        {
          p_class_id: selectedClass.id,
          p_student_id: selectedStudentId,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      setStudentAssignmentSuccess(
        `${student.name} a été affecté à la classe ${selectedClass.name} pour ${selectedClass.schoolYear}.`
      );

      setSuccessMessage(
        `${student.name} a été affecté à la classe « ${selectedClass.name} ».`
      );

      setSelectedStudentId("");

      await loadClasses(true);
    } catch (err) {
      console.error("[AdminClasses] assignStudent error:", err);

      const code = getErrorCode(err);
      const message = getErrorMessage(err).toLowerCase();

      if (
        code === "23505" ||
        message.includes("déjà") ||
        message.includes("already") ||
        message.includes("school year") ||
        message.includes("année scolaire") ||
        message.includes("single class")
      ) {
        setStudentAssignmentError(
          `Cet apprenant est déjà affecté à une classe pour l’année scolaire ${selectedClass.schoolYear}.`
        );
      } else if (
        message.includes("student") ||
        message.includes("apprenant") ||
        message.includes("role") ||
        message.includes("rôle")
      ) {
        setStudentAssignmentError(
          "Le profil sélectionné n’est pas un compte apprenant valide."
        );
      } else {
        setStudentAssignmentError(
          "Impossible d’affecter cet apprenant. Veuillez réessayer."
        );
      }
    } finally {
      setAssigningStudent(false);
    }
  }

  async function removeStudent(
    classItem: ClassView,
    student: StudentView
  ) {
    if (removingStudentKey) return;

    const confirmed = window.confirm(
      `Retirer ${student.name} de la classe ${classItem.name} pour ${classItem.schoolYear} ?`
    );

    if (!confirmed) return;

    const removalKey = `${classItem.id}-${student.id}`;

    try {
      setRemovingStudentKey(removalKey);
      setStudentAssignmentError(null);
      setStudentAssignmentSuccess(null);
      setAssignmentError(null);
      setAssignmentSuccess(null);

      const { error: rpcError } = await supabase.rpc(
        "admin_remove_student_from_class",
        {
          p_class_id: classItem.id,
          p_student_id: student.id,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      setStudentAssignmentSuccess(
        `${student.name} a été retiré de la classe ${classItem.name} pour ${classItem.schoolYear}.`
      );

      setSuccessMessage(
        `${student.name} a été retiré de la classe « ${classItem.name} ».`
      );

      await loadClasses(true);
    } catch (err) {
      console.error("[AdminClasses] removeStudent error:", err);

      setStudentAssignmentError(
        "Impossible de retirer cet apprenant. Veuillez réessayer."
      );
    } finally {
      setRemovingStudentKey(null);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">Classes</div>

            <div className="text-sm text-gray-500">
              Consultez les classes, leurs niveaux, leurs effectifs et les
              affectations des enseignants et des apprenants.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="sn-btn-ghost sn-press"
              onClick={() => void loadClasses(true)}
              disabled={
                loading ||
                refreshing ||
                creating ||
                assigningTeacher ||
                assigningStudent ||
                Boolean(removingTeacherKey) ||
                Boolean(removingStudentKey)
              }
            >
              {refreshing ? "Actualisation..." : "Actualiser"}
            </button>

            <button
              type="button"
              className="sn-btn-primary sn-press"
              onClick={openCreateModal}
              disabled={
                loading ||
                refreshing ||
                levels.length === 0 ||
                schoolYears.length === 0
              }
            >
              + Nouvelle classe
            </button>
          </div>
        </div>

        {successMessage && (
          <div className="sn-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <div className="font-semibold">✅ Opération réussie</div>
            <div className="mt-1">{successMessage}</div>
          </div>
        )}

        {error && (
          <div className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="font-semibold">Chargement impossible</div>
            <div className="mt-1">{error}</div>

            <button
              type="button"
              className="mt-3 sn-btn-ghost sn-press"
              onClick={() => void loadClasses()}
            >
              Réessayer
            </button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="sn-card p-5">
            <div className="text-sm text-gray-500">Classes</div>

            <div className="mt-2 text-3xl font-semibold">
              {loading ? "—" : classes.length}
            </div>

            <div className="mt-1 text-xs text-gray-400">
              Classes enregistrées
            </div>
          </div>

          <div className="sn-card p-5">
            <div className="text-sm text-gray-500">Niveaux</div>

            <div className="mt-2 text-3xl font-semibold">
              {loading ? "—" : levels.length}
            </div>

            <div className="mt-1 text-xs text-gray-400">
              Niveaux disponibles
            </div>
          </div>

          <div className="sn-card p-5">
            <div className="text-sm text-gray-500">
              Élèves affectés
            </div>

            <div className="mt-2 text-3xl font-semibold text-blue-700">
              {loading ? "—" : metrics.students}
            </div>

            <div className="mt-1 text-xs text-gray-400">
              Élèves présents dans une classe
            </div>
          </div>

          <div className="sn-card p-5">
            <div className="text-sm text-gray-500">
              Enseignants affectés
            </div>

            <div className="mt-2 text-3xl font-semibold text-emerald-700">
              {loading ? "—" : metrics.teachers}
            </div>

            <div className="mt-1 text-xs text-gray-400">
              Enseignants associés aux classes
            </div>
          </div>
        </div>

        <div className="sn-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une classe, un niveau, une année, un enseignant, un élève..."
              className="min-w-[260px] flex-1 rounded-2xl border border-gray-200 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />

            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">Tous les niveaux</option>

              {levels.map((level) => (
                <option key={level.id} value={String(level.id)}>
                  {level.name}
                </option>
              ))}
            </select>

            <select
              value={schoolYearFilter}
              onChange={(event) =>
                setSchoolYearFilter(event.target.value)
              }
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">Toutes les années</option>

              {schoolYearFilterOptions.map((schoolYear) => (
                <option key={schoolYear} value={schoolYear}>
                  {schoolYear}
                </option>
              ))}
            </select>

            <div className="text-sm text-gray-500">
              {filteredClasses.length} résultat
              {filteredClasses.length > 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="sn-card animate-pulse p-5"
              >
                <div className="h-4 w-48 rounded bg-gray-200" />
                <div className="mt-3 h-3 w-72 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && filteredClasses.length === 0 && (
          <div className="sn-card p-8 text-center">
            <div className="text-lg font-semibold text-gray-700">
              Aucune classe
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Aucune classe ne correspond aux critères sélectionnés.
            </div>
          </div>
        )}

        {!loading && !error && filteredClasses.length > 0 && (
          <div className="sn-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-100 bg-gray-50/80">
                  <tr className="text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-4 font-semibold">
                      Classe
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Niveau
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Année scolaire
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Effectif
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Enseignant(s)
                    </th>

                    <th className="px-5 py-4 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedClasses.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-gray-100 last:border-b-0"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-gray-900">
                          {item.name}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                          {item.levelName}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-700">
                        {item.schoolYear}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-gray-900">
                          {item.studentCount}
                        </div>

                        <div className="text-xs text-gray-500">
                          élève{item.studentCount > 1 ? "s" : ""}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {item.teachers.length === 0 ? (
                          <span className="text-sm text-amber-600">
                            Aucun enseignant affecté
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {item.teachers.map((teacher) => (
                              <div
                                key={`${item.id}-${teacher.id}`}
                                className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                              >
                                <div className="text-sm font-medium text-gray-800">
                                  {teacher.name}
                                </div>

                                <div className="text-xs text-gray-500">
                                  {teacherRoleLabel(
                                    teacher.assignmentRole
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          className="sn-btn-ghost sn-press whitespace-nowrap"
                          onClick={() => openManageModal(item)}
                          disabled={
                            refreshing ||
                            assigningTeacher ||
                            assigningStudent ||
                            Boolean(removingTeacherKey) ||
                            Boolean(removingStudentKey)
                          }
                        >
                          👥 Gérer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
              <div className="text-sm text-gray-500">
                Affichage {firstDisplayed} à {lastDisplayed} sur{" "}
                {filteredClasses.length}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((current) =>
                      Math.max(1, current - 1)
                    )
                  }
                >
                  ← Précédent
                </button>

                <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                  Page {page} / {pageCount}
                </div>

                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  disabled={page >= pageCount}
                  onClick={() =>
                    setPage((current) =>
                      Math.min(pageCount, current + 1)
                    )
                  }
                >
                  Suivant →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-gray-900">
                  Nouvelle classe
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Créez une classe et rattachez-la à un niveau et
                  une année scolaire.
                </div>
              </div>

              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-500 hover:bg-gray-200"
                onClick={closeCreateModal}
                disabled={creating}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <form
              className="mt-6 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void createClass();
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Nom de la classe
                </label>

                <input
                  type="text"
                  value={newClassName}
                  onChange={(event) =>
                    setNewClassName(event.target.value)
                  }
                  placeholder="Ex. : 6e B"
                  autoFocus
                  disabled={creating}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Niveau
                </label>

                <select
                  value={newLevelId}
                  onChange={(event) =>
                    setNewLevelId(event.target.value)
                  }
                  disabled={creating}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Sélectionner un niveau</option>

                  {levels.map((level) => (
                    <option
                      key={level.id}
                      value={String(level.id)}
                    >
                      {level.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Année scolaire
                </label>

                <select
                  value={newSchoolYearId}
                  onChange={(event) =>
                    setNewSchoolYearId(event.target.value)
                  }
                  disabled={creating}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">
                    Sélectionner une année scolaire
                  </option>

                  {schoolYears.map((schoolYear) => (
                    <option
                      key={schoolYear.id}
                      value={schoolYear.id}
                    >
                      {schoolYear.name}
                      {schoolYear.is_current
                        ? " — Année courante"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-5">
                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  onClick={closeCreateModal}
                  disabled={creating}
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="sn-btn-primary sn-press"
                  disabled={
                    creating ||
                    !newClassName.trim() ||
                    !newLevelId ||
                    !newSchoolYearId
                  }
                >
                  {creating
                    ? "Création..."
                    : "Créer la classe"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {manageModalOpen && selectedClass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeManageModal();
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-gray-900">
                  Gestion de la classe
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Classe{" "}
                  <span className="font-semibold text-gray-700">
                    {selectedClass.name}
                  </span>
                  {" · "}
                  {selectedClass.levelName}
                  {" · "}
                  {selectedClass.schoolYear}
                </div>
              </div>

              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-500 hover:bg-gray-200"
                onClick={closeManageModal}
                disabled={
                  assigningTeacher ||
                  assigningStudent ||
                  Boolean(removingTeacherKey) ||
                  Boolean(removingStudentKey)
                }
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            {(assignmentSuccess || studentAssignmentSuccess) && (
              <div className="mt-5 space-y-2">
                {assignmentSuccess && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    ✅ {assignmentSuccess}
                  </div>
                )}

                {studentAssignmentSuccess && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    ✅ {studentAssignmentSuccess}
                  </div>
                )}
              </div>
            )}

            {(assignmentError || studentAssignmentError) && (
              <div className="mt-5 space-y-2">
                {assignmentError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {assignmentError}
                  </div>
                )}

                {studentAssignmentError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {studentAssignmentError}
                  </div>
                )}
              </div>
            )}

            <section className="mt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">
                    Enseignants affectés
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    {selectedClass.teachers.length} enseignant
                    {selectedClass.teachers.length > 1 ? "s" : ""} affecté
                    {selectedClass.teachers.length > 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {selectedClass.teachers.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
                  Aucun enseignant n’est encore affecté à cette classe.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {selectedClass.teachers.map((teacher) => {
                    const removalKey = `${selectedClass.id}-${teacher.id}`;
                    const isRemoving = removingTeacherKey === removalKey;

                    return (
                      <div
                        key={removalKey}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4"
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {teacher.name}
                          </div>

                          <div className="mt-1">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                teacher.assignmentRole === "main"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-violet-50 text-violet-700"
                              }`}
                            >
                              {teacherRoleLabel(teacher.assignmentRole)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            assigningTeacher ||
                            assigningStudent ||
                            Boolean(removingTeacherKey) ||
                            Boolean(removingStudentKey)
                          }
                          onClick={() =>
                            void removeTeacher(selectedClass, teacher)
                          }
                        >
                          {isRemoving ? "Retrait..." : "Retirer"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="my-6 h-px bg-gray-100" />

            <section>
              <div className="font-semibold text-gray-900">
                Affecter un enseignant
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Sélectionnez un enseignant disponible et son rôle dans cette
                classe.
              </div>

              {teacherOptions.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  Aucun compte enseignant n’est actuellement disponible.
                </div>
              ) : availableTeacherOptions.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  Tous les enseignants disponibles sont déjà affectés à cette
                  classe.
                </div>
              ) : (
                <form
                  className="mt-5 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void assignTeacher();
                  }}
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Enseignant
                    </label>

                    <select
                      value={selectedTeacherId}
                      onChange={(event) => {
                        setSelectedTeacherId(event.target.value);
                        setAssignmentError(null);
                        setAssignmentSuccess(null);
                      }}
                      disabled={
                        assigningTeacher ||
                        assigningStudent ||
                        Boolean(removingTeacherKey) ||
                        Boolean(removingStudentKey)
                      }
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">Sélectionner un enseignant</option>

                      {availableTeacherOptions.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Rôle dans la classe
                    </label>

                    <select
                      value={selectedAssignmentRole}
                      onChange={(event) =>
                        setSelectedAssignmentRole(
                          event.target.value as AssignmentRole
                        )
                      }
                      disabled={
                        assigningTeacher ||
                        assigningStudent ||
                        Boolean(removingTeacherKey) ||
                        Boolean(removingStudentKey)
                      }
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="main">Principal</option>
                      <option value="assistant">Assistant</option>
                    </select>

                    <div className="text-xs text-gray-400">
                      Principal correspond au rôle <code>main</code> et Assistant
                      au rôle <code>assistant</code>.
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="sn-btn-primary sn-press"
                      disabled={
                        assigningTeacher ||
                        assigningStudent ||
                        Boolean(removingTeacherKey) ||
                        Boolean(removingStudentKey) ||
                        !selectedTeacherId
                      }
                    >
                      {assigningTeacher
                        ? "Affectation..."
                        : "Affecter l’enseignant"}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <div className="my-6 h-px bg-gray-100" />

            <section>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">
                    Élèves affectés
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    {selectedClass.students.length} élève
                    {selectedClass.students.length > 1 ? "s" : ""} affecté
                    {selectedClass.students.length > 1 ? "s" : ""} à cette
                    classe pour {selectedClass.schoolYear}
                  </div>
                </div>
              </div>

              {selectedClass.students.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
                  Aucun élève n’est encore affecté à cette classe pour cette
                  année scolaire.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {selectedClass.students.map((student) => {
                    const removalKey = `${selectedClass.id}-${student.id}`;
                    const isRemoving = removingStudentKey === removalKey;

                    return (
                      <div
                        key={removalKey}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4"
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {student.name}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {selectedClass.name} · {selectedClass.schoolYear}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            assigningTeacher ||
                            assigningStudent ||
                            Boolean(removingTeacherKey) ||
                            Boolean(removingStudentKey)
                          }
                          onClick={() =>
                            void removeStudent(selectedClass, student)
                          }
                        >
                          {isRemoving ? "Retrait..." : "Retirer"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="my-6 h-px bg-gray-100" />

            <section>
              <div className="font-semibold text-gray-900">
                Affecter un élève
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Sélectionnez un apprenant disponible pour l’année scolaire{" "}
                <span className="font-medium text-gray-700">
                  {selectedClass.schoolYear}
                </span>
                . Un apprenant ne peut appartenir qu’à une seule classe pour une
                même année scolaire.
              </div>

              {studentOptions.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  Aucun compte apprenant n’est actuellement disponible.
                </div>
              ) : availableStudentOptions.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  Aucun autre apprenant n’est disponible pour cette année
                  scolaire. Les apprenants déjà affectés à une classe de{" "}
                  {selectedClass.schoolYear} ne sont pas proposés ici.
                </div>
              ) : (
                <form
                  className="mt-5 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void assignStudent();
                  }}
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Élève
                    </label>

                    <select
                      value={selectedStudentId}
                      onChange={(event) => {
                        setSelectedStudentId(event.target.value);
                        setStudentAssignmentError(null);
                        setStudentAssignmentSuccess(null);
                      }}
                      disabled={
                        assigningTeacher ||
                        assigningStudent ||
                        Boolean(removingTeacherKey) ||
                        Boolean(removingStudentKey)
                      }
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">Sélectionner un élève</option>

                      {availableStudentOptions.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="sn-btn-primary sn-press"
                      disabled={
                        assigningTeacher ||
                        assigningStudent ||
                        Boolean(removingTeacherKey) ||
                        Boolean(removingStudentKey) ||
                        !selectedStudentId
                      }
                    >
                      {assigningStudent
                        ? "Affectation..."
                        : "Affecter l’élève"}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <div className="mt-6 flex justify-end border-t border-gray-100 pt-5">
              <button
                type="button"
                className="sn-btn-ghost sn-press"
                onClick={closeManageModal}
                disabled={
                  assigningTeacher ||
                  assigningStudent ||
                  Boolean(removingTeacherKey) ||
                  Boolean(removingStudentKey)
                }
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}