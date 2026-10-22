import {
  useEffect,
  useState,
} from "react";

import PublicPageContent from "@/features/public/components/PublicPageContent";
import { supabase } from "@/lib/supabaseClient";

type AboutSection = {
  id: string;
  section_key: string;
  eyebrow: string | null;
  title: string;
  content: string | null;
  icon: string | null;
  sort_order: number;
};

function AboutSections() {
  const [sections, setSections] =
    useState<AboutSection[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSections = async () => {
      try {
        const {
          data,
          error: loadError,
        } = await supabase
          .from("public_about_sections")
          .select(
            `
              id,
              section_key,
              eyebrow,
              title,
              content,
              icon,
              sort_order
            `
          )
          .eq("is_visible", true)
          .order("sort_order", {
            ascending: true,
          });

        if (loadError) {
          throw loadError;
        }

        if (mounted) {
          setSections(
            (data ?? []) as AboutSection[]
          );
        }
      } catch {
        if (mounted) {
          setError(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadSections();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          {[1, 2, 3, 4].map(
            (item) => (
              <div
                key={item}
                className="h-56 animate-pulse rounded-[2rem] bg-slate-100"
              />
            )
          )}
        </div>
      </section>
    );
  }

  if (error || sections.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="grid gap-5 md:grid-cols-2">
        {sections.map((section) => (
          <article
            key={section.id}
            className="group rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-3xl transition group-hover:scale-105">
              {section.icon || "✦"}
            </div>

            {section.eyebrow && (
              <div className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                {section.eyebrow}
              </div>
            )}

            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {section.title}
            </h2>

            {section.content && (
              <p className="mt-4 whitespace-pre-line leading-7 text-slate-600">
                {section.content}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function PublicAbout() {
  return (
    <PublicPageContent slug="a-propos">
      {(page) => (
        <>
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
                  {page.eyebrow?.trim() ||
                    "Notre vision"}
                </div>

                <h1 className="mt-3 text-4xl font-black tracking-tight">
                  {page.title?.trim() ||
                    page.nav_title ||
                    "À propos de SchoolNet"}
                </h1>

                <p className="mt-5 leading-8 text-slate-600">
                  {page.intro?.trim() ||
                    "SchoolNet ambitionne de simplifier le quotidien scolaire en réunissant apprentissage, communication, évaluation et suivi pédagogique dans un même environnement numérique."}
                </p>

                {page.body?.trim() && (
                  <p className="mt-5 whitespace-pre-line leading-8 text-slate-600">
                    {page.body}
                  </p>
                )}
              </div>

              <div className="rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-600 p-10 text-white shadow-xl">
                <div className="text-4xl">
                  🚀
                </div>

                <div className="mt-5 text-2xl font-black">
                  Connecter toute la communauté
                  éducative.
                </div>

                <p className="mt-4 leading-7 text-blue-100">
                  Élèves, enseignants, parents et
                  administrateurs disposent chacun
                  d'un espace adapté à leur rôle.
                </p>
              </div>
            </div>
          </section>

          <AboutSections />
        </>
      )}
    </PublicPageContent>
  );
}