import {
  useEffect,
  useState,
} from "react";

import PublicPageContent from "@/features/public/components/PublicPageContent";
import { supabase } from "@/lib/supabaseClient";

type ContactItem = {
  id: string;
  item_key: string;
  item_type: string;
  label: string;
  value: string;
  href: string | null;
  description: string | null;
  icon: string | null;
  sort_order: number;
};

function getContactHref(
  item: ContactItem
) {
  if (item.href?.trim()) {
    return item.href.trim();
  }

  if (
    item.item_type === "email" &&
    item.value.trim()
  ) {
    return `mailto:${item.value.trim()}`;
  }

  if (
    item.item_type === "phone" &&
    item.value.trim()
  ) {
    const phone = item.value.replace(
      /[^\d+]/g,
      ""
    );

    return phone
      ? `tel:${phone}`
      : null;
  }

  return null;
}

function ContactItems() {
  const [items, setItems] = useState<
    ContactItem[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    const loadItems = async () => {
      try {
        const {
          data,
          error: loadError,
        } = await supabase
          .from("public_contact_items")
          .select(
            `
              id,
              item_key,
              item_type,
              label,
              value,
              href,
              description,
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
          setItems(
            (data ?? []) as ContactItem[]
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

    void loadItems();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {[1, 2].map((item) => (
          <div
            key={item}
            className="h-48 animate-pulse rounded-3xl bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (error || items.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 grid gap-5 md:grid-cols-2">
      {items.map((item) => {
        const href =
          getContactHref(item);

        const isExternal =
          href?.startsWith("http://") ||
          href?.startsWith("https://");

        const content = (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-3xl">
              {item.icon || "✦"}
            </div>

            <div className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-blue-600">
              {item.label}
            </div>

            <div className="mt-2 break-words text-xl font-black text-slate-950">
              {item.value}
            </div>

            {item.description && (
              <p className="mt-3 leading-7 text-slate-500">
                {item.description}
              </p>
            )}

            {href && (
              <div className="mt-5 text-sm font-bold text-blue-600">
                Ouvrir →
              </div>
            )}
          </>
        );

        if (href) {
          return (
            <a
              key={item.id}
              href={href}
              target={
                isExternal
                  ? "_blank"
                  : undefined
              }
              rel={
                isExternal
                  ? "noreferrer"
                  : undefined
              }
              className="group rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
            >
              {content}
            </a>
          );
        }

        return (
          <article
            key={item.id}
            className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"
          >
            {content}
          </article>
        );
      })}
    </div>
  );
}

export default function PublicContact() {
  return (
    <PublicPageContent slug="contact">
      {(page) => (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
              {page.eyebrow?.trim() ||
                "Nous contacter"}
            </div>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              {page.title?.trim() ||
                page.nav_title ||
                "Contact"}
            </h1>

            <p className="mt-5 leading-8 text-slate-600">
              {page.intro?.trim() ||
                "Besoin d'informations sur SchoolNet, l'adhésion ou le fonctionnement de la plateforme ?"}
            </p>

            {page.body?.trim() && (
              <p className="mt-5 whitespace-pre-line leading-8 text-slate-600">
                {page.body}
              </p>
            )}
          </div>

          <ContactItems />
        </section>
      )}
    </PublicPageContent>
  );
}