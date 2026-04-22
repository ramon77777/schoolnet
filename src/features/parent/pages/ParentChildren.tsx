import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type ProfileRow = {
  id: string;
  full_name: string | null;
};

type ClassStudentRow = {
  student_id: string;
  class_id: string;
};

type ClassRow = {
  id: string;
  name: string;
  school_year: string;
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

      // 1) récupérer les liens parent -> enfants
      const { data: linksData, error: linksError } = await supabase
        .from("parent_links")
        .select("student_id")
        .eq("parent_id", user.id);

      if (linksError) throw linksError;

      const childIds = (linksData ?? [])
        .map((row) => row.student_id)
        .filter(Boolean) as string[];

      if (childIds.length === 0) {
        setChildren([]);
        return;
      }

      // 2) récupérer les profils enfants
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", childIds);

      if (profilesError) throw profilesError;

      const profiles = (profilesData ?? []) as ProfileRow[];

      // 3) récupérer les affectations classe des enfants
      const { data: classStudentsData, error: classStudentsError } = await supabase
        .from("class_students")
        .select("student_id, class_id")
        .in("student_id", childIds);

      if (classStudentsError) throw classStudentsError;

      const classStudents = (classStudentsData ?? []) as ClassStudentRow[];

      const classIds = Array.from(
        new Set(classStudents.map((row) => row.class_id).filter(Boolean))
      );

      let classesById: Record<string, string> = {};

      if (classIds.length > 0) {
        const { data: classesData, error: classesError } = await supabase
          .from("classes")
          .select("id, name, school_year")
          .in("id", classIds);

        if (classesError) throw classesError;

        classesById = ((classesData ?? []) as ClassRow[]).reduce<Record<string, string>>(
          (acc, row) => {
            acc[row.id] = `${row.name} (${row.school_year})`;
            return acc;
          },
          {}
        );
      }

      const classByStudentId = classStudents.reduce<Record<string, string>>((acc, row) => {
        acc[row.student_id] = classesById[row.class_id] ?? "Non assigné";
        return acc;
      }, {});

      const finalChildren: ChildView[] = childIds.map((childId) => {
        const profile = profiles.find((p) => p.id === childId);

        return {
          id: childId,
          name: profile?.full_name?.trim() || "Élève",
          classLabel: classByStudentId[childId] ?? "Non assigné",
        };
      });

      setChildren(finalChildren);
    } catch (err) {
      console.error("[ParentChildren] loadChildren error:", err);
      setError("Impossible de charger les enfants.");
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadChildren();
  }, [authLoading, loadChildren]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Mes enfants</div>
        <div className="text-sm text-gray-500">
          Retrouvez ici les enfants qui vous sont liés et leur classe actuelle.
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les données réelles ne sont pas chargées.
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="sn-card p-4 animate-pulse space-y-2">
              <div className="h-4 w-1/2 rounded bg-gray-200" />
              <div className="h-3 w-1/3 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && children.length === 0 && (
        <div className="sn-card p-6 text-center text-gray-500">
          Aucun enfant lié pour le moment.
        </div>
      )}

      {!isLoading && !error && children.length > 0 && (
        <div className="space-y-3">
          {children.map((child) => (
            <div key={child.id} className="sn-card p-4">
              <div className="font-semibold">{child.name}</div>
              <div className="text-sm text-gray-500">{child.classLabel}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}