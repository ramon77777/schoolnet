import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
};

type SymbolGroup = {
  title: string;
  items: string[];
};

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    title: "Mathématiques",
    items: ["π", "√", "∑", "∫", "∞", "≈", "≠", "≤", "≥", "±", "×", "÷", "∆", "θ", "α", "β", "γ"],
  },
  {
    title: "Puissances / indices",
    items: ["x²", "x³", "aⁿ", "H₂O", "CO₂", "O₂", "N₂", "10⁻³", "m/s²"],
  },
  {
    title: "Physique",
    items: ["F = ma", "E = mc²", "P = UI", "U = RI", "v = d/t", "ρ = m/V", "λ", "Ω", "μ", "g = 9,8 m/s²"],
  },
  {
    title: "Chimie",
    items: ["H⁺", "OH⁻", "NaCl", "H₂SO₄", "CaCO₃", "→", "⇌", "aq", "mol", "pH"],
  },
  {
    title: "Formules utiles",
    items: ["Δ = b² - 4ac", "A = πr²", "P = 2πr", "V = L × l × h", "m = ρV", "C = n/V"],
  },
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Écrivez votre réponse...",
  editable = true,
}: Props) {
  const [showSymbols, setShowSymbols] = useState(false);

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;

    const current = editor.getHTML();

    if (current !== value) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  function insertText(text: string) {
    if (!editor || !editable) return;

    editor.chain().focus().insertContent(`${text} `).run();
  }

  if (!editor) return null;

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-2 bg-gray-50">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editable}
        >
          B
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editable}
        >
          I
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={!editable}
        >
          • Liste
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          disabled={!editable}
        >
          Gauche
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          disabled={!editable}
        >
          Centre
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          disabled={!editable}
        >
          Droite
        </ToolbarButton>

        <ToolbarButton
          active={showSymbols}
          onClick={() => setShowSymbols((v) => !v)}
          disabled={!editable}
        >
          ∑ Symboles
        </ToolbarButton>
      </div>

      {showSymbols && editable && (
        <div className="border-b border-gray-100 bg-white p-3 space-y-3">
          {SYMBOL_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-xs font-semibold text-gray-500">{group.title}</div>

              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <button
                    key={`${group.title}-${item}`}
                    type="button"
                    onClick={() => insertText(item)}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <EditorContent
        editor={editor}
        className="min-h-[220px] p-4 text-sm text-gray-900 focus:outline-none"
      />
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? "bg-blue-600 text-white"
          : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}