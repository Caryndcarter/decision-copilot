"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useCallback, useImperativeHandle, forwardRef } from "react";

function textToContent(text: string) {
  return {
    type: "doc" as const,
    content: [
      {
        type: "paragraph" as const,
        content: text.trim() ? [{ type: "text" as const, text }] : [],
      },
    ],
  };
}

export function contentToText(json: { content?: Array<Record<string, unknown>> }): string {
  const p = json.content?.find((n) => n.type === "paragraph");
  const pContent = p?.content as Array<{ text?: string }> | undefined;
  if (!pContent) return "";
  return pContent.map((n) => n.text ?? "").join("");
}

export interface ClarificationAnswerEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Unique key so editor is recreated when switching question */
  editorKey: string;
  /** Optional: lighter inline styling (e.g. for brief summary/recommendation) */
  variant?: "default" | "inline";
}

export interface ClarificationAnswerEditorHandle {
  getValue(): string;
}

export const ClarificationAnswerEditor = forwardRef<
  ClarificationAnswerEditorHandle,
  ClarificationAnswerEditorProps
>(function ClarificationAnswerEditor(
  { value, onChange, className = "", editorKey, variant = "default" },
  ref
) {
  const editor = useEditor({
    key: editorKey,
    extensions: [StarterKit.configure({ bulletList: false, orderedList: false, listItem: false })],
    content: textToContent(value),
    editable: true,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          variant === "inline"
            ? "min-h-[1.5rem] w-full rounded border-0 bg-transparent px-0 py-1 text-slate-800 focus:outline-none focus:ring-0"
            : "min-h-[2.5rem] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500",
      },
    },
  });

  const getValue = useCallback(() => (editor ? contentToText(editor.getJSON()) : ""), [editor]);
  useImperativeHandle(ref, () => ({ getValue }), [getValue]);

  useEffect(() => {
    if (!editor) return;
    const onBlur = () => {
      onChange(contentToText(editor.getJSON()));
    };
    editor.on("blur", onBlur);
    return () => editor.off("blur", onBlur);
  }, [editor, onChange]);

  return (
    <div className={className}>
      <EditorContent editor={editor} />
    </div>
  );
});
