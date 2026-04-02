"use client";

import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect,
  Separator,
  UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function MarkdownInputInner({ value, onChange, placeholder }: Props) {
  return (
    <MDXEditor
      markdown={value ?? ""}
      onChange={onChange}
      placeholder={placeholder ?? "Write markdown here…"}
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarContents: () => (
            <>
              <UndoRedo />
              <Separator />
              <BlockTypeSelect />
              <Separator />
              <BoldItalicUnderlineToggles />
              <Separator />
              <ListsToggle />
            </>
          ),
        }),
      ]}
      contentEditableClassName="mdxeditor-content"
    />
  );
}
