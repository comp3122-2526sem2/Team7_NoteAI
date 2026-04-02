"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import "highlight.js/styles/github.css";

interface Props {
  content: string;
  cssStyle?: string;
}

export function MarkdownRenderer({ content, cssStyle }: Props) {
  return (
    <>
      {cssStyle && <style dangerouslySetInnerHTML={{ __html: cssStyle }} />}
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight, rehypeRaw]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </>
  );
}
