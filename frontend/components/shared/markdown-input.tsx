"use client";

import dynamic from "next/dynamic";

const MarkdownInputInner = dynamic(
  () => import("./markdown-input-inner").then((m) => m.MarkdownInputInner),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          minHeight: 160,
          background: "#fafafa",
          borderRadius: "0 0 6px 6px",
          border: "1px solid #d9d9d9",
        }}
      />
    ),
  }
);

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * Controlled markdown rich-text input backed by MDXEditor.
 * Drop-in replacement for antd TextArea inside Form.Item — receives
 * `value` / `onChange` automatically from Form context.
 */
export function MarkdownInput({ value, onChange, placeholder, minHeight }: Props) {
  return (
    <div
      style={{
        border: "1px solid #d9d9d9",
        borderRadius: 6,
        // Must be visible (not hidden) so the toolbar's floating
        // BlockTypeSelect dropdown is not clipped by this container.
        overflow: "visible",
      }}
    >
      <MarkdownInputInner
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
      />
    </div>
  );
}
