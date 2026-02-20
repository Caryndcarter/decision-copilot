"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from "react";

/** Convert string[] to Tiptap doc with bullet list */
function itemsToContent(items: string[]) {
  const listItems = (items.length ? items : [""]).map((text) => ({
    type: "listItem" as const,
    content: [
      {
        type: "paragraph" as const,
        content: text.trim() ? [{ type: "text" as const, text }] : [],
      },
    ],
  }));
  return {
    type: "doc" as const,
    content: [
      {
        type: "bulletList" as const,
        content: listItems,
      },
    ],
  };
}

/** Extract string[] from Tiptap JSON (bulletList -> listItem -> paragraph -> text) */
function contentToItems(json: { content?: Array<Record<string, unknown>> }): string[] {
  const items: string[] = [];
  const bulletList = json.content?.find((n) => n.type === "bulletList");
  const listContent = bulletList?.content as Array<{ content?: Array<Record<string, unknown>> }> | undefined;
  if (!listContent) return items;
  for (const node of listContent) {
    if (node.type !== "listItem") continue;
    const paragraph = node.content?.find((n) => n.type === "paragraph");
    const pContent = paragraph?.content as Array<{ text?: string }> | undefined;
    const text = pContent?.map((n) => n.text ?? "").join("") ?? "";
    items.push(text);
  }
  return items.filter((t) => t.trim().length > 0);
}

export interface LensBoxEditorProps {
  items: string[];
  onSave: (items: string[]) => void;
  editable: boolean;
  placeholder?: string;
  className?: string;
  /** Unique key so editor is recreated when switching section (e.g. "risk.top_risks") */
  editorKey: string;
  /** When true, hide the "save when you click away" hint and Save button (e.g. inside brief) */
  hideSaveHint?: boolean;
}

export interface LensBoxEditorHandle {
  getItems(): string[];
}

export const LensBoxEditor = forwardRef<LensBoxEditorHandle, LensBoxEditorProps>(function LensBoxEditor(
  {
    items,
    onSave,
    editable,
    placeholder = "Add items…",
    className = "",
    editorKey,
    hideSaveHint = false,
  },
  ref
) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const editor = useEditor({
    key: editorKey,
    extensions: [StarterKit],
    content: itemsToContent(items),
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[80px] outline-none focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor || !editable) return;
    const onBlur = () => {
      const next = contentToItems(editor.getJSON());
      onSaveRef.current(next);
    };
    editor.on("blur", onBlur);
    return () => editor.off("blur", onBlur);
  }, [editor, editable]);

  const handleSave = useCallback(() => {
    if (!editor) return;
    const next = contentToItems(editor.getJSON());
    onSaveRef.current(next);
  }, [editor]);

  const getItems = useCallback(() => (editor ? contentToItems(editor.getJSON()) : []), [editor]);

  useImperativeHandle(ref, () => ({ getItems }), [getItems]);

  if (!editor) {
    return (
      <div className={`animate-pulse rounded border border-slate-200 bg-slate-50 p-3 ${className}`}>
        <p className="text-sm text-slate-500">Loading editor…</p>
      </div>
    );
  }

  return (
    <div className={`lens-box-editor ${className}`}>
      <EditorContent editor={editor} />
      {editable && !hideSaveHint && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Edit inline; changes save when you click away or press Save.</p>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
});
