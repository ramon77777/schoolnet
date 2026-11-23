/**
 * SCHOOLNET — rendu lecture seule du HTML produit par RichTextEditor (TipTap).
 *
 * Ce module NE réinjecte jamais le HTML dans le DOM. Il construit un arbre
 * strictement contrôlé de texte et de balises de mise en forme ; le rendu est
 * ensuite effectué par React, qui échappe les textes automatiquement.
 *
 * Aucun attribut HTML de l'éditeur n'est conservé, à l'exception d'une
 * valeur text-align explicitement validée. Aucun lien, image, iframe,
 * événement JavaScript ou style arbitraire n'est transféré au rendu.
 */

const FORMATTING_TAGS = new Set([
  "p", "div", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "del",
  "h1", "h2", "h3",
  "ul", "ol", "li", "blockquote", "code", "pre",
  "sub", "sup", "span",
] as const);

/** Supprimer entièrement les balises non textuelles et leurs descendants. */
const DROP_WITH_CONTENTS = new Set([
  "script", "style", "iframe", "object", "embed", "applet",
  "svg", "math", "template", "noscript", "head", "base", "link", "meta",
  "form", "input", "button", "textarea", "select", "option",
  "img", "picture", "source", "audio", "video", "track", "canvas",
  "frame", "frameset", "portal",
] as const);

export type SafeRichTag =
  | "p" | "div" | "br" | "hr"
  | "strong" | "b" | "em" | "i" | "u" | "s" | "del"
  | "h1" | "h2" | "h3"
  | "ul" | "ol" | "li" | "blockquote" | "code" | "pre"
  | "sub" | "sup" | "span";

export type SafeTextAlign = "left" | "center" | "right" | "justify";

export type SafeRichNode =
  | { kind: "text"; text: string }
  | {
      kind: "element";
      tag: SafeRichTag;
      children: SafeRichNode[];
      align?: SafeTextAlign;
    };

const ALIGNABLE_TAGS = new Set(["p", "div", "h1", "h2", "h3"]);
const MAX_NESTING_DEPTH = 48;

function getSafeAlignment(node: Element): SafeTextAlign | undefined {
  const raw = node.getAttribute("style") ?? "";
  const match = raw.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i);
  if (!match) return undefined;
  const align = match[1].toLowerCase();
  if (align === "left" || align === "center" || align === "right" || align === "justify") {
    return align;
  }
  return undefined;
}

/** Conversion structurelle testable indépendamment de DOMParser. */
export function mapSafeRichNode(node: Node, depth = 0): SafeRichNode[] {
  if (depth > MAX_NESTING_DEPTH) return [];
  if (node.nodeType === 3) {
    const text = node.textContent ?? "";
    return text ? [{ kind: "text", text }] : [];
  }
  if (node.nodeType !== 1) return [];

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (DROP_WITH_CONTENTS.has(tag as never)) return [];

  const children = Array.from(element.childNodes).flatMap((child) =>
    mapSafeRichNode(child, depth + 1),
  );

  // Une balise inconnue (y compris <a href="javascript:...">) est
  // ignorée, mais son texte reste lisible. Aucun attribut n'est copié.
  if (!FORMATTING_TAGS.has(tag as SafeRichTag)) return children;

  const safeTag = tag as SafeRichTag;
  const align = ALIGNABLE_TAGS.has(safeTag) ? getSafeAlignment(element) : undefined;
  return [{ kind: "element", tag: safeTag, children, ...(align ? { align } : {}) }];
}

export function parseSafeRichText(html: string): SafeRichNode[] {
  if (!html) return [];
  // Le site est une SPA Vite. Un fallback textuel demeure sûr si ce module
  // est un jour rendu côté serveur, sans injecter de balises non contrôlées.
  if (typeof DOMParser === "undefined") return [{ kind: "text", text: html }];

  try {
    // Document inerte, jamais inséré dans le DOM de la page.
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return Array.from(parsed.body.childNodes).flatMap((node) => mapSafeRichNode(node));
  } catch {
    // Ne jamais contourner le validateur par innerHTML en cas d'erreur.
    return [{ kind: "text", text: html }];
  }
}
