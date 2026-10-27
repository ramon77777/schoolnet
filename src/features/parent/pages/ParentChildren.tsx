import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type ParentProfileRow = {
  id: string;
  child_ids: string[] | null;
};

type ChildProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type ClassStudentRow = {
  student_id: string;
  class_id: string;
};

type ClassRow = {
  id: string;
  name: string | null;
};

type ChildView = {
  id: string;
  name: string;
  classLabel: string;
};

export default function ParentChildren() {
  const { user, loading: authLoading } = useAuth();

  const [children, setChildren] = useState<ChildView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChildren = useCallback(async () => {
    if (!user || user.isDemo) {
      setChildren([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      /*
       * 1. Lire le profil du parent connecté.
       *
       * La relation Parent -> Enfant est stockée
       * dans profiles.child_ids.
       */
      const {
        data: parentProfileData,
        error: parentProfileError,
      } = await supabase
        .from("profiles")
        .select("id, child_ids")
        .eq("id", user.id)
        .eq("role", "parent")
        .maybeSingle();

      if (parentProfileError) {
        throw parentProfileError;
      }

      const parentProfile =
        parentProfileData as ParentProfileRow | null;

      if (!parentProfile) {
        setChildren([]);
        setError(
          "Le profil parent associé à ce compte est introuvable.",
        );
        return;
      }

      const childIds = Array.from(
        new Set(
          (parentProfile.child_ids ?? []).filter(
            (childId): childId is string =>
              typeof childId === "string" &&
              childId.trim().length > 0,
          ),
        ),
      );

      if (childIds.length === 0) {
        setChildren([]);
        return;
      }

      /*
       * 2. Lire uniquement les profils enfants liés.
       */
      const {
        data: childProfilesData,
        error: childProfilesError,
      } = await supabase
        .from("profiles")
        .select(
          `
          id,
          full_name,
          role
          `,
        )
        .in("id", childIds)
        .eq("role", "student")
        .order("full_name");

      if (childProfilesError) {
        throw childProfilesError;
      }

      const childProfiles =
        (childProfilesData ?? []) as ChildProfileRow[];

      /*
       * 3. Lire les inscriptions des enfants dans les classes.
       *
       * On n'utilise plus profiles.class_name :
       * la classe réelle vient de class_students.
       */
      const {
        data: classStudentsData,
        error: classStudentsError,
      } = await supabase
        .from("class_students")
        .select(
          `
          student_id,
          class_id
          `,
        )
        .in("student_id", childIds);

      if (classStudentsError) {
        throw classStudentsError;
      }

      const classStudents =
        (classStudentsData ?? []) as ClassStudentRow[];

      /*
       * 4. Récupérer les classes correspondantes.
       */
      const classIds = Array.from(
        new Set(
          classStudents
            .map((row) => row.class_id)
            .filter(
              (classId): classId is string =>
                typeof classId === "string" &&
                classId.trim().length > 0,
            ),
        ),
      );

      let classes: ClassRow[] = [];

      if (classIds.length > 0) {
        const {
          data: classesData,
          error: classesError,
        } = await supabase
          .from("classes")
          .select(
            `
            id,
            name
            `,
          )
          .in("id", classIds);

        if (classesError) {
          throw classesError;
        }

        classes =
          (classesData ?? []) as ClassRow[];
      }

      /*
       * 5. Construire les index pour retrouver rapidement
       * le profil et la classe de chaque enfant.
       */
      const profileById = new Map(
        childProfiles.map((profile) => [
          profile.id,
          profile,
        ]),
      );

      const classById = new Map(
        classes.map((classRow) => [
          classRow.id,
          classRow,
        ]),
      );

      const classIdByStudentId =
        new Map<string, string>();

      classStudents.forEach((row) => {
        /*
         * En cas de plusieurs inscriptions historiques,
         * on conserve ici la première relation trouvée.
         *
         * Pour la structure actuelle de SchoolNet,
         * un élève actif possède une classe principale.
         */
        if (
          !classIdByStudentId.has(row.student_id)
        ) {
          classIdByStudentId.set(
            row.student_id,
            row.class_id,
          );
        }
      });

      /*
       * 6. Construire la liste finale.
       *
       * La classe affichée provient maintenant de :
       *
       * profiles
       *   -> class_students
       *   -> classes.name
       */
      const finalChildren: ChildView[] = childIds
        .map((childId) => {
          const profile =
            profileById.get(childId);

          if (!profile) {
            return null;
          }

          const classId =
            classIdByStudentId.get(childId);

          const classRow = classId
            ? classById.get(classId)
            : undefined;

          return {
            id: profile.id,
            name:
              profile.full_name?.trim() ||
              "Élève",
            classLabel:
              classRow?.name?.trim() ||
              "Classe non renseignée",
          };
        })
        .filter(
          (
            child,
          ): child is ChildView =>
            child !== null,
        );

      setChildren(finalChildren);
    } catch (err) {
      console.error(
        "[ParentChildren] loadChildren error:",
        err,
      );

      setError(
        "Impossible de charger les enfants liés à ce compte.",
      );

      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadChildren();
  }, [authLoading, loadChildren]);

  const isLoading =
    authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">
            Mes enfants
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Consultez les enfants liés à votre compte
            Parent / Tuteur.
          </div>
        </div>

        {!isLoading &&
          !error &&
          !user?.isDemo && (
            <button
              type="button"
              className="sn-btn-ghost"
              onClick={() =>
                void loadChildren()
              }
            >
              Actualiser
            </button>
          )}
      </div>

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode démo actif : les données réelles ne
          sont pas chargées.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({
            length: 2,
          }).map((_, index) => (
            <div
              key={index}
              className="sn-card animate-pulse space-y-4 p-5"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-gray-200" />

                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 rounded bg-gray-200" />
                  <div className="h-3 w-1/3 rounded bg-gray-100" />
                </div>
              </div>

              <div className="h-12 rounded-xl bg-gray-100" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card border border-red-200 bg-red-50 p-5">
          <div className="font-medium text-red-700">
            Chargement impossible
          </div>

          <div className="mt-1 text-sm text-red-600">
            {error}
          </div>

          <button
            type="button"
            className="sn-btn-ghost mt-4"
            onClick={() =>
              void loadChildren()
            }
          >
            Réessayer
          </button>
        </div>
      )}

      {!isLoading &&
        !error &&
        !user?.isDemo &&
        children.length === 0 && (
          <div className="sn-card p-8 text-center">
            <div className="text-base font-semibold">
              Aucun enfant lié
            </div>

            <div className="mt-2 text-sm text-gray-500">
              Aucun profil élève n&apos;est
              actuellement rattaché à ce compte
              parent.
            </div>
          </div>
        )}

      {!isLoading &&
        !error &&
        children.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {children.length}{" "}
                {children.length > 1
                  ? "enfants liés"
                  : "enfant lié"}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {children.map(
                (child) => (
                  <div
                    key={child.id}
                    className="sn-card sn-card-hover p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-600">
                        {child.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold">
                          {child.name}
                        </div>

                        <div className="mt-1 text-sm text-gray-500">
                          {child.classLabel}
                        </div>

                        <div className="mt-3">
                          <span className="sn-badge sn-badge-green">
                            Élève
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 rounded-xl bg-gray-50 p-4">
                      <div className="text-xs text-gray-500">
                        Profil scolaire
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {child.classLabel}
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          </>
        )}
    </div>
  );
}