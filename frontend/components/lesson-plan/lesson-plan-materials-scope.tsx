"use client";

import { useState } from "react";
import { Button, Checkbox, Space, Spin, Typography } from "antd";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { chaptersApi, type Document } from "@/lib/api";

const { Text } = Typography;

interface Props {
  courseId: string;
  chapterId: string;
  documents: Document[];
  selectedDocumentIds: string[];
  onDocumentSelectionChange: (ids: string[]) => void;
  selectedKeywords: string[];
  onKeywordSelectionChange: (phrases: string[]) => void;
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
  const [refreshingDocId, setRefreshingDocId] = useState<string | null>(null);
  const completed = documents.filter((d) => d.conversion_status === "completed");

  const keywordQueries = useQueries({
    queries: selectedDocumentIds.map((docId) => ({
      queryKey: ["chapter-doc-keywords", courseId, chapterId, docId],
      queryFn: () =>
        chaptersApi.getDocumentKeywords(courseId, chapterId, docId).then((r) => r.data),
      enabled: !!docId && selectedDocumentIds.length > 0,
      staleTime: 1000 * 60 * 5,
    })),
  });

  const toggleKeyword = (phrase: string, checked: boolean) => {
    const next = new Set(selectedKeywords);
    if (checked) next.add(phrase);
    else next.delete(phrase);
    onKeywordSelectionChange([...next]);
  };

  const docById = Object.fromEntries(documents.map((d) => [d.id, d]));

  return (
    <div>
      <Text strong style={{ display: "block", marginBottom: 8 }}>
        教材範圍（AI 讀取）
      </Text>
      <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 10 }}>
        勾選要納入教案產生嘅檔案。下列候選由<strong>原始上傳檔直接分析</strong>（唔係問答或內文摘句）；轉檔亂碼會自動略過。可按「重抽」重新分析。
      </Text>

      {completed.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 13 }}>
          此章節尚未有已完成轉檔嘅教材；請先到章節頁上傳檔案。
        </Text>
      ) : (
        <Checkbox.Group
          style={{ width: "100%" }}
          value={selectedDocumentIds}
          onChange={(vals) => onDocumentSelectionChange(vals as string[])}
        >
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            {completed.map((d) => (
              <Checkbox key={d.id} value={d.id}>
                {d.original_filename}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      )}

      {selectedDocumentIds.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Text strong style={{ display: "block", marginBottom: 6 }}>
            關鍵字／小節（選填）
          </Text>
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            {selectedDocumentIds.map((docId, idx) => {
              const q = keywordQueries[idx]!;
              const doc = docById[docId];
              const label = doc?.original_filename ?? docId;
              if (!q) return null;
              return (
                <div key={docId}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {label}
                    </Text>
                    <Button
                      type="link"
                      size="small"
                      loading={refreshingDocId === docId}
                      onClick={async () => {
                        setRefreshingDocId(docId);
                        try {
                          await chaptersApi.refreshDocumentKeywords(courseId, chapterId, docId);
                          await qc.invalidateQueries({
                            queryKey: ["chapter-doc-keywords", courseId, chapterId, docId],
                          });
                        } finally {
                          setRefreshingDocId(null);
                        }
                      }}
                    >
                      重抽標題
                    </Button>
                  </div>
                  {q.isLoading ? (
                    <Spin size="small" />
                  ) : q.isError ? (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      無法載入關鍵字
                    </Text>
                  ) : (
                    <Space wrap size={[8, 8]}>
                      {(q.data?.items ?? []).map((phrase) => (
                        <Checkbox
                          key={`${docId}-${phrase}`}
                          checked={selectedKeywords.includes(phrase)}
                          onChange={(e) => toggleKeyword(phrase, e.target.checked)}
                        >
                          {phrase}
                        </Checkbox>
                      ))}
                    </Space>
                  )}
                </div>
              );
            })}
          </Space>
        </div>
      )}
    </div>
  );
}
