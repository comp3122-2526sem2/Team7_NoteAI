"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Popover, Space, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface Props {
  containerRef: React.RefObject<HTMLElement | null>;
  loading?: boolean;
  onRegenerate: (selectedText: string, instruction: string) => void;
}

/**
 * Floating bar near the current text selection inside the editor container.
 * Clicks on the trigger would collapse the selection before mouseup; we snapshot
 * text on mousedown and skip clearing the bar while the popover is open.
 */
export function SelectionAiFloat({ containerRef, loading, onRegenerate }: Props) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  /** Set synchronously on trigger mousedown so mouseup handler does not clear the bar. */
  const skipSelectionSyncRef = useRef(false);

  const updateFromSelection = useCallback(() => {
    if (skipSelectionSyncRef.current || popoverOpen) {
      return;
    }
    const root = containerRef.current;
    if (!root) {
      setAnchor(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setAnchor(null);
      return;
    }
    const t = sel.toString().trim();
    if (!t) {
      setAnchor(null);
      return;
    }
    let node: Node | null = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }
    if (!node || !root.contains(node)) {
      setAnchor(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setAnchor(null);
      return;
    }
    setSelectedText(t);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 48);
    setAnchor({ top, left });
  }, [containerRef, popoverOpen]);

  useEffect(() => {
    const onMouseUp = () => {
      requestAnimationFrame(() => {
        updateFromSelection();
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [updateFromSelection]);

  useEffect(() => {
    const onScroll = () => {
      if (anchor && !popoverOpen) updateFromSelection();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [anchor, popoverOpen, updateFromSelection]);

  const handleOpenChange = (open: boolean) => {
    setPopoverOpen(open);
    if (!open) {
      skipSelectionSyncRef.current = false;
      setInstruction("");
      setAnchor(null);
    }
  };

  const handleTriggerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      const t = sel.toString().trim();
      if (t) setSelectedText(t);
    }
    skipSelectionSyncRef.current = true;
    setPopoverOpen(true);
  };

  if (!anchor) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: anchor.top,
        left: anchor.left,
        zIndex: 1050,
        pointerEvents: "auto",
      }}
    >
      <Popover
        open={popoverOpen}
        onOpenChange={handleOpenChange}
        trigger={[]}
        placement="bottomLeft"
        title="AI 重寫選取文字"
        getPopupContainer={(node) => node.parentElement ?? document.body}
        content={
          <Space orientation="vertical" style={{ width: 280 }} size={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              告訴 AI 想點改（例如：簡化、加例子、改成英文）。
            </Text>
            <Input.TextArea
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="改寫指示…"
            />
            <Button
              type="primary"
              block
              size="small"
              icon={<ThunderboltOutlined />}
              loading={loading}
              onClick={() => {
                const text = selectedText.trim();
                if (!text) {
                  handleOpenChange(false);
                  return;
                }
                const instr = instruction.trim() || "請改寫得更清晰、適合課堂使用。";
                onRegenerate(text, instr);
                handleOpenChange(false);
              }}
            >
              重寫
            </Button>
          </Space>
        }
      >
        <Button
          type="primary"
          size="small"
          icon={<ThunderboltOutlined />}
          onMouseDown={handleTriggerMouseDown}
        >
          AI 重寫
        </Button>
      </Popover>
    </div>
  );
}
