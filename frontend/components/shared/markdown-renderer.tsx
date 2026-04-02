"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import "highlight.js/styles/github.css";
import { cn } from "@/lib/utils";

interface Props {
  content: string;
  className?: string;
  cssStyle?: string;
}

export function MarkdownRenderer({ content, className, cssStyle }: Props) {
  return (
    <>
      {cssStyle && <style dangerouslySetInnerHTML={{ __html: cssStyle }} />}
      <div className={cn("prose prose-sm max-w-none dark:prose-invert", className)}>
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
