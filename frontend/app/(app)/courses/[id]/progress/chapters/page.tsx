"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  App, Button, Card, Drawer, Empty, Select, Space, Table, Tag, Tooltip, Typography,
} from "antd";
import {
  CheckCircleOutlined, CloseCircleOutlined, CommentOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { chaptersApi, type ChapterStudentPerformance, type ChapterSubmissionSummary } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { useAuth } from "@/hooks/useAuth";

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  pending: "default",
  submitted: "blue",
  graded: "green",
};

function SubmissionCell({ sub }: { sub: ChapterSubmissionSummary | undefined }) {
  if (!sub || sub.status === "pending") {
    return <Text type="secondary">—</Text>;
  }
  return (
    <Space direction="vertical" size={2}>
      <Tag color={STATUS_COLOR[sub.status] ?? "default"} style={{ textTransform: "capitalize" }}>
        {sub.status}
      </Tag>
      {sub.status === "graded" && sub.score != null && (
        <Text style={{ fontSize: 12 }}>
          {sub.score}/{sub.max_score ?? "—"}
        </Text>
      )}
    </Space>
  );
}

export default function ChapterPerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [drawerStudent, setDrawerStudent] = useState<ChapterStudentPerformance | null>(null);
  const [generatingStudentId, setGeneratingStudentId] = useState<string | null>(null);

  const { data: chapters, isLoading: chaptersLoading } = useQuery({
    queryKey: ["chapters", courseId],
    queryFn: () => chaptersApi.list(courseId).then((r) => r.data),
  });

  useEffect(() => {
    if (chapters?.length && !selectedChapterId) {
      setSelectedChapterId(chapters[0]!.id);
    }
  }, [chapters, selectedChapterId]);

  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ["chapter-performance", courseId, selectedChapterId],
    queryFn: () => chaptersApi.getChapterPerformance(courseId, selectedChapterId!).then((r) => r.data),
    enabled: !!selectedChapterId,
  });

  const generateMutation = useMutation({
    mutationFn: ({ studentId }: { studentId: string }) =>
      chaptersApi.generateAICommentForStudent(courseId, selectedChapterId!, studentId),
    onMutate: ({ studentId }) => setGeneratingStudentId(studentId),
    onSuccess: (res, { studentId }) => {
      message.success("AI study comment generated");
      qc.invalidateQueries({ queryKey: ["chapter-performance", courseId, selectedChapterId] });
      // Update drawer if it's open for this student
      setDrawerStudent((prev) =>
        prev && String(prev.student_id) === studentId
          ? { ...prev, has_ai_comment: true, ai_comment: res.data.comment, ai_comment_updated_at: res.data.created_at }
          : prev
      );
    },
    onError: () => message.error("Failed to generate AI comment"),
    onSettled: () => setGeneratingStudentId(null),
  });

  if (!isTeacher) {
    return <Empty description="This section is for teachers only." />;
  }

  if (chaptersLoading) return <LoadingSpinner />;

  if (!chapters?.length) {
    return (
      <div>
        <Title level={3} style={{ marginBottom: 24 }}>Chapter Performance</Title>
        <Empty description="No chapters in this course yet." />
      </div>
    );
  }

  const selectedChapter = chapters.find((c) => c.id === selectedChapterId);

  const assignmentCols: ColumnsType<ChapterStudentPerformance> =
    performance && performance.length > 0 && performance[0]!.submissions.length > 0
      ? performance[0]!.submissions.map((sub) => ({
          title: (
            <Tooltip title={sub.assignment_name}>
              <span style={{ maxWidth: 120, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sub.assignment_name}
              </span>
            </Tooltip>
          ),
          key: sub.assignment_id,
          width: 130,
          render: (_: unknown, record: ChapterStudentPerformance) => {
            const s = record.submissions.find((s) => s.assignment_id === sub.assignment_id);
            return <SubmissionCell sub={s} />;
          },
        }))
      : [];

  const columns: ColumnsType<ChapterStudentPerformance> = [
    {
      title: "Student",
      dataIndex: "student_name",
      key: "student_name",
      fixed: "left",
      width: 160,
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "AI Study Comment",
      key: "ai_comment",
      width: 220,
      render: (_: unknown, record: ChapterStudentPerformance) => {
        const studentId = String(record.student_id);
        const isGenerating = generatingStudentId === studentId;
        return (
          <Space wrap>
            {record.has_ai_comment ? (
              <>
                <Tag icon={<CheckCircleOutlined />} color="success">Generated</Tag>
                <Button
                  type="link"
                  size="small"
                  icon={<CommentOutlined />}
                  onClick={() => setDrawerStudent(record)}
                  style={{ padding: 0 }}
                >
                  View
                </Button>
              </>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="default">Not generated</Tag>
            )}
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={isGenerating}
              disabled={!!generatingStudentId && !isGenerating}
              onClick={() => generateMutation.mutate({ studentId })}
            >
              {record.has_ai_comment ? "Regenerate" : "Generate"}
            </Button>
          </Space>
        );
      },
    },
    ...assignmentCols,
  ];

  const hasAssignments = assignmentCols.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Chapter Performance</Title>
          <Text type="secondary">Assignment submissions and AI study comments per student per chapter</Text>
        </div>
      </div>

      <Card
        title={
          <Space>
            <Text>Chapter:</Text>
            <Select
              value={selectedChapterId}
              onChange={(v) => { setSelectedChapterId(v); setDrawerStudent(null); }}
              style={{ minWidth: 220 }}
              options={chapters.map((c, idx) => ({
                label: `${idx + 1}. ${c.title}`,
                value: c.id,
              }))}
            />
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        {perfLoading ? (
          <LoadingSpinner />
        ) : !performance?.length ? (
          <Empty description="No students enrolled yet." />
        ) : (
          <>
            {!hasAssignments && (
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary">No assignments linked to this chapter.</Text>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <Table
                dataSource={performance}
                columns={columns}
                rowKey="student_id"
                pagination={false}
                size="middle"
                scroll={{ x: "max-content" }}
              />
            </div>
          </>
        )}
      </Card>

      <Drawer
        title={
          <Space direction="vertical" size={0}>
            <Text strong>{drawerStudent?.student_name}</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              AI Study Comment — {selectedChapter?.title}
            </Text>
          </Space>
        }
        open={!!drawerStudent}
        onClose={() => setDrawerStudent(null)}
        width={520}
      >
        {drawerStudent?.ai_comment ? (
          <>
            {drawerStudent.ai_comment_updated_at && (
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                Generated: {new Date(drawerStudent.ai_comment_updated_at).toLocaleString()}
              </Text>
            )}
            <MarkdownRenderer content={drawerStudent.ai_comment} />
          </>
        ) : (
          <Empty description="No AI comment available." />
        )}
      </Drawer>
    </div>
  );
}
