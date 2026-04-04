"use client";

import dynamic from "next/dynamic";

const MarkdownInputInner = dynamic(
  () => import("./markdown-input-inner").then((m) => m.MarkdownInputInner),
  {
    ssr: false,
    loading: () => (
      <div style={{ minHeight: 160, background: "#fafafa" }} />
    ),
  }
);

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Total editor height including toolbar (px). Defaults to 160. */
  minHeight?: number;
}

const TOOLBAR_HEIGHT = 38;

/**
 * Controlled markdown rich-text input backed by Lexical.
 * Drop-in replacement for antd TextArea inside Form.Item — receives
 * `value` / `onChange` automatically from Form context.
 */
export function MarkdownInput({ value, onChange, placeholder, minHeight = 160 }: Props) {
  const contentMinHeight = Math.max(60, minHeight - TOOLBAR_HEIGHT);

  return (
    <div
      style={{
        border: "1px solid #d9d9d9",
        borderRadius: 6,
        overflow: "visible",
      }}
    >
      <style>{`.lexical-content-editable { min-height: ${contentMinHeight}px !important; }`}</style>
      <MarkdownInputInner value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
