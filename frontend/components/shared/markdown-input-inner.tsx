"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "./markdown-renderer";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $convertToMarkdownString,
  $convertFromMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import {
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  $getSelection,
  $isRangeSelection,
  type EditorState,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import {
  $createHeadingNode,
  $isHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $createParagraphNode, $isParagraphNode } from "lexical";
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  $isListNode,
  ListNode as LexicalListNode,
} from "@lexical/list";
import { $getNearestNodeOfType } from "@lexical/utils";

// ── Toolbar ────────────────────────────────────────────────────────────────

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "bullet" | "number";

interface ToolbarPluginProps {
  showPreview: boolean;
  onTogglePreview: () => void;
}

function ToolbarPlugin({ showPreview, onTogglePreview }: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");

  // Sync toolbar state with current selection
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        setIsBold(selection.hasFormat("bold"));
        setIsItalic(selection.hasFormat("italic"));

        const anchorNode = selection.anchor.getNode();
        const element =
          anchorNode.getKey() === "root"
            ? anchorNode
            : anchorNode.getTopLevelElementOrThrow();

        if ($isListNode(element)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parentList = $getNearestNodeOfType(anchorNode as any, LexicalListNode as any) as LexicalListNode | null;
          const type = parentList
            ? parentList.getListType() === "bullet"
              ? "bullet"
              : "number"
            : "bullet";
          setBlockType(type);
        } else if ($isHeadingNode(element)) {
          setBlockType(element.getTag() as BlockType);
        } else if ($isParagraphNode(element)) {
          setBlockType("paragraph");
        }
      });
    });
  }, [editor]);

  const formatBlock = (type: BlockType) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (type === "bullet") {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      } else if (type === "number") {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      } else if (type === "paragraph") {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () =>
          $createHeadingNode(type as HeadingTagType)
        );
      }
    });
  };

  const btn = (
    active: boolean,
    label: string,
    title: string,
    onClick: () => void
  ) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        border: "1px solid",
        borderColor: active ? "#1677ff" : "#d9d9d9",
        background: active ? "#e6f4ff" : "transparent",
        color: active ? "#1677ff" : "#333",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        lineHeight: "22px",
      }}
    >
      {label}
    </button>
  );

  const sep = (
    <span
      style={{
        width: 1,
        height: 20,
        background: "#d9d9d9",
        display: "inline-block",
        margin: "0 4px",
        verticalAlign: "middle",
      }}
    />
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderBottom: "1px solid #d9d9d9",
        flexWrap: "wrap",
        minHeight: 38,
        background: "#fafafa",
        borderRadius: "6px 6px 0 0",
      }}
    >
      {!showPreview && (
        <>
          {btn(false, "↩", "Undo", () =>
            editor.dispatchCommand(UNDO_COMMAND, undefined)
          )}
          {btn(false, "↪", "Redo", () =>
            editor.dispatchCommand(REDO_COMMAND, undefined)
          )}
          {sep}
          <select
            value={blockType}
            onChange={(e) => formatBlock(e.target.value as BlockType)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              fontSize: 13,
              border: "1px solid #d9d9d9",
              borderRadius: 4,
              padding: "2px 4px",
              background: "white",
              cursor: "pointer",
              lineHeight: "22px",
            }}
          >
            <option value="paragraph">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="bullet">Bullet List</option>
            <option value="number">Numbered List</option>
          </select>
          {sep}
          {btn(isBold, "B", "Bold", () =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
          )}
          {btn(isItalic, "I", "Italic", () =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
          )}
        </>
      )}
      <div style={{ marginLeft: "auto" }}>
        {btn(showPreview, "Preview", "Toggle preview", onTogglePreview)}
      </div>
    </div>
  );
}

// ── Value sync plugin ───────────────────────────────────────────────────────

interface SyncPluginProps {
  value: string;
  onChange?: (value: string) => void;
  lastEmittedRef: React.MutableRefObject<string>;
}

function SyncPlugin({ value, onChange, lastEmittedRef }: SyncPluginProps) {
  const [editor] = useLexicalComposerContext();
  const isFirstRender = useRef(true);

  // Push external value changes (form reset, initial load) into the editor
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (value !== lastEmittedRef.current) {
      editor.update(() => {
        $convertFromMarkdownString(value ?? "", TRANSFORMERS);
      });
      lastEmittedRef.current = value ?? "";
    }
  }, [value, editor, lastEmittedRef]);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const markdown = $convertToMarkdownString(TRANSFORMERS);
        lastEmittedRef.current = markdown;
        onChange?.(markdown);
      });
    },
    [onChange, lastEmittedRef]
  );

  return <OnChangePlugin onChange={handleChange} />;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip an outer ```[lang]\n...\n``` fence that some AI-generated values
 * are wrapped in, so the editor always receives plain markdown.
 */
function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:[a-zA-Z]*)?\n([\s\S]*?)\n?```$/);
  return match ? match[1] : raw;
}

// ── Public component ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EDITOR_NODES: any[] = [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode, AutoLinkNode];

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function MarkdownInputInner({ value, onChange, placeholder }: Props) {
  const cleanValue = stripMarkdownFence(value ?? "");
  const lastEmittedRef = useRef<string>(cleanValue);
  const [showPreview, setShowPreview] = useState(false);

  const initialConfig = {
    namespace: "MarkdownEditor",
    nodes: EDITOR_NODES,
    onError: (error: Error) => console.error(error),
    editorState: () => {
      $convertFromMarkdownString(cleanValue, TRANSFORMERS);
    },
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ToolbarPlugin
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((p) => !p)}
      />

      {showPreview ? (
        <div
          style={{
            padding: "8px 12px",
            minHeight: "inherit",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {cleanValue.trim() ? (
            <MarkdownRenderer content={cleanValue} />
          ) : (
            <span style={{ color: "#bfbfbf" }}>Nothing to preview.</span>
          )}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="lexical-content-editable"
                style={{
                  outline: "none",
                  padding: "8px 12px",
                  minHeight: "inherit",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              />
            }
            placeholder={
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  left: 12,
                  color: "#bfbfbf",
                  pointerEvents: "none",
                  fontSize: 14,
                  userSelect: "none",
                }}
              >
                {placeholder ?? "Write markdown here…"}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      )}

      <HistoryPlugin />
      <ListPlugin />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <SyncPlugin
        value={cleanValue}
        onChange={onChange}
        lastEmittedRef={lastEmittedRef}
      />
    </LexicalComposer>
  );
}
