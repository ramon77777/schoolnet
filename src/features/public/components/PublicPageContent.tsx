import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";

import {
  loadPublicPage,
  type PublicPage,
} from "@/features/public/lib/publicCms";

type PublicPageContentProps = {
  slug: string;
  children: (page: PublicPage) => ReactNode;
};

export default function PublicPageContent({
  slug,
  children,
}: PublicPageContentProps) {
  const [page, setPage] =
    useState<PublicPage | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      setLoading(true);
      setError(null);

      try {
        const result =
          await loadPublicPage(slug);

        if (!active) {
          return;
        }

        setPage(result);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setPage(null);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger cette page."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="text-3xl">
            ⏳
          </div>

          <div className="mt-4 font-black text-slate-900">
            Chargement…
          </div>

          <p className="mt-2 text-sm text-slate-500">
            Le contenu de cette page est en cours de chargement.
          </p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-10 text-center">
          <div className="text-3xl">
            ⚠️
          </div>

          <h1 className="mt-4 text-xl font-black text-red-900">
            Impossible de charger la page
          </h1>

          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-red-700">
            {error}
          </p>
        </div>
      </section>
    );
  }

  if (!page) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="text-4xl">
            📄
          </div>

          <h1 className="mt-4 text-2xl font-black text-slate-900">
            Page indisponible
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Cette page n’est pas publiée actuellement.
          </p>

          <Link
            to="/"
            className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Retour à l’accueil
          </Link>
        </div>
      </section>
    );
  }

  return <>{children(page)}</>;
}