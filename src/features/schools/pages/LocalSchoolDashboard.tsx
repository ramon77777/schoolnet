// SCHOOLNET — Tableau de bord local intentionnellement limite.
 // Aucun acces aux modules scolaires historiques tant que leur RLS
 // n'est pas isolee par etablissement et recette.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAdminSchools, type SchoolRecord } from "@/features/schools/lib/schoolManagementApi";

export default function LocalSchoolDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || user.isDemo) {
      setSchools([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getAdminSchools()
      .then((data) => { if (!cancelled) setSchools(data); })
      .catch(() => {
        if (!cancelled) {
          setError("Impossible de charger vos établissements autorisés.");
          setSchools([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, user?.isDemo, authLoading]);

  return (
    <main className="space-y-6 pb-10">
      <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-50 p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-700">
          SCHOOLNET · Administration d'établissement
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
          Bienvenue dans votre espace
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Cet espace est indépendant de l'administration centrale SCHOOLNET.
          Vous ne pouvez consulter que les établissements auxquels votre compte est rattaché.
        </p>
      </header>

      <section className="sn-card space-y-3 p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-950">Mon établissement</h2>
        {loading ? <p className="text-sm text-slate-600">Vérification des droits…</p> : null}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!loading && schools.length === 0 && (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            Aucun établissement actif n'est associé à ce compte.
            Contactez le Super Administrateur SCHOOLNET.
          </p>
        )}
        {schools.map((school) => (
          <article key={school.id} className="rounded-xl border border-slate-200 p-4">
            <p className="text-base font-bold text-slate-900">{school.name}</p>
            <p className="mt-1 font-mono text-xs text-slate-500">{school.code}</p>
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              Accès local vérifié
            </p>
          </article>
        ))}
      </section>

      <section className="sn-card space-y-3 p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-950">Modules scolaires</h2>
        <p className="text-sm leading-6 text-slate-600">
          La gestion des classes, enseignants, apprenants, bulletins et documents sera
          activée progressivement, après vérification de l'isolation des données
          entre établissements. Aucun accès global n'est attribué à ce compte.
        </p>
        <Link to="/app/profile" className="sn-btn-ghost inline-flex">
          Consulter mon profil
        </Link>
      </section>
    </main>
  );
}
