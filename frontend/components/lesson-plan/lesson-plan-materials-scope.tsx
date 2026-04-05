"use client";

import { App, Card, Checkbox, Space, Tag, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useEffect, useRef } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { chaptersApi, type Document, type DocumentKeywordsOut } from "@/lib/api";

const { Text, Paragraph } = Typography;

interface Props {
  courseId: string;
  chapterId: string;
  documents: Document[];
  selectedDocumentIds: string[];
  onDocumentSelectionChange: (ids: string[]) => void;
  selectedKeywords: string[];
  onKeywordSelectionChange: (keywords: string[]) => void;
}

export function LessonPlanMaterialsScope({
  courseId,
  chapterId,
  documents,
  selectedDocumentIds,
  onDocumentSelectionChange,
  selectedKeywords,
  onKeywordSelectionChange,
}: Props) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const autoExtractToastShown = useRef(false);

  const completedDocs = documents.filter((d) => d.conversion_status === "completed");

  // useQueries auto-fires on mount. When keyword_cache is NULL in the DB the backend
  // runs a synchronous extraction inside the GET handler — no manual trigger needed.
  // Polling continues at 4 s intervals only while the server reports status="extracting"
  // (i.e. a background re-extract job is in progress after the user clicks Re-extract).
  const keywordQueries = useQueries({
    queries: completedDocs.map((doc) => ({
      queryKey: ["doc-keywords", courseId, chapterId, doc.id],
      queryFn: () =>
        chaptersApi.getDocumentKeywords(courseId, chapterId, doc.id).then((r) => r.data),
      refetchInterval: (query: { state: { data: DocumentKeywordsOut | undefined } }) => {
        if (query.state.data?.status === "extracting") return 4000;
        return false;
      },
    })),
  });

  // Show a one-time informational toast only when the backend is actually doing
  // work (no cached result yet). If all queries resolve instantly from the DB
  // cache, the toast is suppressed entirely.
  useEffect(() => {
    // Only show the toast if at least one query is loading AND its cached value
    // is not already available (i.e. the backend will actually run extraction).
    const anyTrulyExtracting = keywordQueries.some(
      (q) => q.isLoading && q.data === undefined,
    );
    if (anyTrulyExtracting && !autoExtractToastShown.current && completedDocs.length > 0) {
      autoExtractToastShown.current = true;
      message.info({
        content:
          "Automatically analysing your files to extract section headings. This may take a moment — you can leave this page and come back; results will be saved.",
        duration: 7,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordQueries.map((q) => `${q.isLoading}:${q.data?.status ?? "none"}`).join(",")]);

  const handleDocToggle = (docId: string, checked: boolean) => {
    if (checked) {
      onDocumentSelectionChange([...selectedDocumentIds, docId]);
    } else {
      onDocumentSelectionChange(selectedDocumentIds.filter((id) => id !== docId));
    }
  };

  const handleKeywordToggle = (kw: string) => {
    const next = selectedKeywords.includes(kw)
      ? selectedKeywords.filter((k) => k !== kw)
      : [...selectedKeywords, kw];
    onKeywordSelectionChange(next);
  };

  const handleReExtract = async (docId: string) => {
    try {
      await chaptersApi.refreshDocumentKeywords(courseId, chapterId, docId);
      await qc.invalidateQueries({
        queryKey: ["doc-keywords", courseId, chapterId, docId],
      });
      message.info({
        content:
          "Re-extraction started — this may take a minute. You can leave and come back; keywords will update automatically.",
        duration: 6,
      });
    } catch {
      message.error("Failed to start re-extraction. Please try again.");
    }
  };

  // Collect all ready keywords grouped by doc (preserving doc order).
  // This lets us show per-doc keyword groups in the section below.
  const keywordsByDoc = completedDocs.map((doc, idx) => {
    const q = keywordQueries[idx];
    return {
      doc,
      q,
      isLoadingFirst: q.isLoading,
      isReExtracting: !q.isLoading && q.data?.status === "extracting",
      isReady: !q.isLoading && q.data?.status === "ready",
      items: q.data?.status === "ready" ? (q.data?.items ?? []) : [],
    };
  });

  const anyBusy = keywordsByDoc.some((d) => d.isLoadingFirst || d.isReExtracting);
  // Flat deduplicated list still needed for selected-keyword tracking
  const allReadyKeywords = Array.from(new Set(keywordsByDoc.flatMap((d) => d.items)));

  return (
    <Card title="Materials Scope (AI context)" size="small">
      <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
        Select which files the AI should read. Section keywords are extracted automatically —
        tick the ones most relevant to focus the lesson plan.
      </Paragraph>

      {completedDocs.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          No completed documents for this chapter. Please upload files on the chapter page first.
        </Text>
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          {keywordsByDoc.map(({ doc, q, isLoadingFirst, isReExtracting, isReady, items }) => (
            <div key={doc.id}>
              {/* ── Doc row: checkbox + filename + status badge ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Checkbox
                  checked={selectedDocumentIds.includes(doc.id)}
                  onChange={(e) => handleDocToggle(doc.id, e.target.checked)}
                >
                  <Text style={{ fontSize: 13 }}>{doc.original_filename}</Text>
                </Checkbox>

                {/* Auto-extracting on first load */}
                {isLoadingFirst && (
                  <span>
                    <LoadingOutlined spin style={{ fontSize: 11, color: "#1677ff" }} />
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                      Analysing...
                    </Text>
                  </span>
                )}

                {/* Background re-extract running */}
                {isReExtracting && (
                  <span>
                    <LoadingOutlined spin style={{ fontSize: 11, color: "#1677ff" }} />
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                      Re-extracting...
                    </Text>
                  </span>
                )}

                {/* Done — show count */}
                {isReady && items.length > 0 && (
                  <Text type="success" style={{ fontSize: 11 }}>
                    ✓ {items.length} headings
                  </Text>
                )}
                {isReady && items.length === 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    No headings found
                  </Text>
                )}

                {/* Re-extract link — only when not busy */}
                {isReady && (
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => handleReExtract(doc.id)}
                  >
                    Re-extract
                  </Text>
                )}

                {q.isError && (
                  <Text type="danger" style={{ fontSize: 11 }}>
                    Failed to load
                  </Text>
                )}
              </div>

              {/* ── Per-doc keyword tags (indented under the filename) ── */}
              {isReady && items.length > 0 && (
                <div style={{ marginLeft: 24, marginTop: 4 }}>
                  <Space size={[4, 4]} wrap>
                    {items.map((kw) => (
                      <Tag
                        key={kw}
                        color={selectedKeywords.includes(kw) ? "blue" : "default"}
                        style={{ cursor: "pointer", fontSize: 11, marginBottom: 0 }}
                        onClick={() => handleKeywordToggle(kw)}
                      >
                        {kw}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}
            </div>
          ))}
        </Space>
      )}

      {/* ── Keywords / Sections summary footer ── */}
      {completedDocs.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 6 }}>
            Selected for AI focus{" "}
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>
              ({selectedKeywords.length} selected — click tags above to toggle)
            </Text>
          </Text>

          {anyBusy && allReadyKeywords.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <LoadingOutlined spin style={{ fontSize: 11, marginRight: 6 }} />
              Analysing files...
            </Text>
          ) : selectedKeywords.length > 0 ? (
            // Show only the selected keywords as a compact summary
            <Space size={[4, 4]} wrap>
              {selectedKeywords.map((kw) => (
                <Tag
                  key={kw}
                  color="blue"
                  closable
                  style={{ fontSize: 11 }}
                  onClose={() => handleKeywordToggle(kw)}
                >
                  {kw}
                </Tag>
              ))}
            </Space>
          ) : allReadyKeywords.length > 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              None selected — tick keywords above to narrow the AI focus.
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              No section headings found in the uploaded files.
            </Text>
          )}
        </div>
      )}
    </Card>
  );
}
