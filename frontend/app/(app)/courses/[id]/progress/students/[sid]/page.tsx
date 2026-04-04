"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  App, Button, Card, Collapse, Drawer, Empty, Space, Tag, Typography,
} from "antd";
import {
  ArrowLeftOutlined, BookOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CommentOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { chaptersApi, coursesApi, type StudentChapterPerformance } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  pending: "default",
  submitted: "blue",
  graded: "green",
};

export default function StudentProgressPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id: courseId, sid: studentId } = use(params);
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [drawerChapter, setDrawerChapter] = useState<StudentChapterPerformance | null>(null);
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);

  const { data: students } = useQuery({
    queryKey: ["course-students", courseId],
    queryFn: () => coursesApi.listStudents(courseId).then((r) => r.data),
  });

  const { data: performance, isLoading } = useQuery({
    queryKey: ["student-chapter-performance", courseId, studentId],
    queryFn: () => chaptersApi.getStudentChapterPerformance(courseId, studentId).then((r) => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: ({ chapterId }: { chapterId: string }) =>
      chaptersApi.generateAICommentForStudent(courseId, chapterId, studentId),
    onMutate: ({ chapterId }) => setGeneratingChapterId(chapterId),
    onSuccess: (res, { chapterId }) => {
      message.success("AI study comment generated");
      qc.invalidateQueries({ queryKey: ["student-chapter-performance", courseId, studentId] });
      setDrawerChapter((prev) =>
        prev && prev.chapter_id === chapterId
          ? { ...prev, has_ai_comment: true, ai_comment: res.data.comment, ai_comment_updated_at: res.data.created_at }
          : prev
      );
    },
    onError: () => message.error("Failed to generate AI comment"),
    onSettled: () => setGeneratingChapterId(null),
  });

  const student = students?.find((s) => s.id === studentId);

  if (isLoading) return <LoadingSpinner />;

  const items = (performance ?? []).map((chapter, idx) => {
    const isGenerating = generatingChapterId === chapter.chapter_id;
    return {
      key: chapter.chapter_id,
      label: (
        <Space>
          <BookOutlined />
          <Text strong>{idx + 1}. {chapter.chapter_title}</Text>
          {chapter.has_ai_comment
            ? <Tag icon={<CheckCircleOutlined />} color="success">AI Comment</Tag>
            : <Tag icon={<CloseCircleOutlined />} color="default">No AI Comment</Tag>}
          {chapter.submissions.length > 0 && (
            <Tag color="blue">{chapter.submissions.length} assignment{chapter.submissions.length !== 1 ? "s" : ""}</Tag>
          )}
        </Space>
      ),
      children: (
        <div>
          {/* AI Study Comment row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Text type="secondary">AI Study Comment:</Text>
            {chapter.has_ai_comment && (
              <Button
                size="small"
                icon={<CommentOutlined />}
                onClick={() => setDrawerChapter(chapter)}
              >
                View
              </Button>
            )}
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={isGenerating}
              disabled={!!generatingChapterId && !isGenerating}
              onClick={() => generateMutation.mutate({ chapterId: chapter.chapter_id })}
            >
              {chapter.has_ai_comment ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {/* Assignments */}
          {chapter.submissions.length === 0 ? (
            <Text type="secondary">No assignments linked to this chapter.</Text>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {chapter.submissions.map((sub) => (
                <div
                  key={sub.assignment_id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "#fafafa", borderRadius: 6,
                    border: "1px solid #f0f0f0",
                  }}
                >
                  <Text>{sub.assignment_name}</Text>
                  <Space>
                    <Tag
                      color={STATUS_COLOR[sub.status] ?? "default"}
                      style={{ textTransform: "capitalize", margin: 0 }}
                    >
                      {sub.status}
                    </Tag>
                    {sub.status === "graded" && sub.score != null && (
                      <Text style={{ fontSize: 13 }}>
                        {sub.score} / {sub.max_score ?? "—"}
                      </Text>
                    )}
                  </Space>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/courses/${courseId}/progress`}>
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ padding: 0, marginBottom: 8 }}>
            Back to Students
          </Button>
        </Link>
        <Title level={3} style={{ margin: 0 }}>
          {student ? student.nickname : "Student"} — Progress
        </Title>
        {student && (
          <Text type="secondary">@{student.username}</Text>
        )}
      </div>

      {!performance?.length ? (
        <Card>
          <Empty description="No chapters in this course yet." />
        </Card>
      ) : (
        <Collapse
          items={items}
          defaultActiveKey={performance.map((c) => c.chapter_id)}
          style={{ background: "transparent" }}
        />
      )}

      <Drawer
        title={
          drawerChapter && (
            <Space direction="vertical" size={0}>
              <Text strong>{student?.nickname ?? "Student"}</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                AI Study Comment — {drawerChapter.chapter_title}
              </Text>
            </Space>
          )
        }
        open={!!drawerChapter}
        onClose={() => setDrawerChapter(null)}
        width={520}
      >
        {drawerChapter?.ai_comment ? (
          <>
            {drawerChapter.ai_comment_updated_at && (
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                Generated: {new Date(drawerChapter.ai_comment_updated_at).toLocaleString()}
              </Text>
            )}
            <MarkdownRenderer content={drawerChapter.ai_comment} />
          </>
        ) : (
          <Empty description="No AI comment available." />
        )}
      </Drawer>
    </div>
  );
}
