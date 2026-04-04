"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  App, Button, Card, Col, Divider, InputNumber, Row, Space, Spin, Tag, Typography,
} from "antd";
import { ArrowLeftOutlined, ThunderboltOutlined, LoadingOutlined } from "@ant-design/icons";
import { assignmentsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { MarkdownInput } from "@/components/shared/markdown-input";
import { AnswersDisplay } from "../../answers-display";

const { Title, Text } = Typography;


export default function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string; aid: string; sid: string }>;
}) {
  const { id: courseId, aid: assignmentId, sid: submissionId } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data: assignment, isLoading: assignmentLoading } = useQuery({
    queryKey: ["assignment", courseId, assignmentId],
    queryFn: () => assignmentsApi.get(courseId, assignmentId).then((r) => r.data),
  });

  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ["submission", courseId, assignmentId, submissionId],
    queryFn: () => assignmentsApi.getSubmission(courseId, assignmentId, submissionId).then((r) => r.data),
  });

  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string>("");

  // Sync form when data loads (only once)
  const [initialised, setInitialised] = useState(false);
  if (sub && !initialised) {
    setScore(sub.score ?? null);
    setFeedback(sub.teacher_feedback ?? "");
    setInitialised(true);
  }

  const gradeMutation = useMutation({
    mutationFn: () =>
      assignmentsApi.grade(courseId, assignmentId, submissionId, {
        score: score ?? undefined,
        teacher_feedback: feedback,
      }),
    onSuccess: (res) => {
      message.success("Grade saved");
      qc.setQueryData(["submission", courseId, assignmentId, submissionId], res);
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
    },
    onError: () => message.error("Failed to save grade"),
  });

  const aiFeedbackMutation = useMutation({
    mutationFn: () => assignmentsApi.generateAiFeedback(courseId, assignmentId, submissionId),
    onSuccess: (res) => {
      message.success("AI feedback generated");
      qc.setQueryData(["submission", courseId, assignmentId, submissionId], res);
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
    },
    onError: () => message.error("Failed to generate AI feedback"),
  });

  if (assignmentLoading || subLoading) return <LoadingSpinner />;
  if (!assignment || !sub) return <div>Submission not found.</div>;
  if (!isTeacher) return <div>Access denied.</div>;

  const hasContent = !!assignment.content?.sections?.length;

  return (
    <div>
      {/* Back + header */}
      <div style={{ marginBottom: 24 }}>
        <Link href={`/courses/${courseId}/assignments/${assignmentId}`}>
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 8 }}>
            Back to {assignment.name}
          </Button>
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {sub.student_name ?? "Student"}
              {sub.student_username && (
                <Text type="secondary" style={{ fontWeight: 400, fontSize: 14, marginLeft: 8 }}>
                  @{sub.student_username}
                </Text>
              )}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {assignment.name}
              {sub.submission_date && ` · Submitted ${new Date(sub.submission_date).toLocaleString()}`}
            </Text>
          </div>
          <StatusBadge status={sub.submission_status} />
        </div>
      </div>

      <Row gutter={[24, 24]}>
        {/* Left: student answers */}
        <Col xs={24} lg={14}>
          <Card title="Student Answers" style={{ marginBottom: 0 }}>
            {hasContent && sub.answers ? (
              <AnswersDisplay content={assignment.content!} answers={sub.answers} showSuggestedAnswer />
            ) : sub.student_feedback ? (
              <Text>{sub.student_feedback}</Text>
            ) : (
              <Text type="secondary">No answers submitted.</Text>
            )}
          </Card>
        </Col>

        {/* Right: grading + feedback */}
        <Col xs={24} lg={10}>
          {/* Grade */}
          <Card
            title="Grade"
            style={{ marginBottom: 16 }}
            extra={
              sub.score != null ? (
                <Tag color="green">{sub.score}{assignment.max_score ? ` / ${assignment.max_score}` : ""} pts</Tag>
              ) : null
            }
          >
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Score{assignment.max_score ? ` (out of ${assignment.max_score})` : ""}
              </Text>
              <InputNumber
                value={score ?? undefined}
                onChange={(v) => setScore(v ?? null)}
                min={0}
                max={assignment.max_score ?? undefined}
                style={{ display: "block", width: "100%", marginTop: 4 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Teacher Feedback</Text>
              <div style={{ marginTop: 4 }}>
                <MarkdownInput
                  value={feedback}
                  onChange={setFeedback}
                  placeholder="Write feedback for the student…"
                  minHeight={120}
                />
              </div>
            </div>

            <Button
              type="primary"
              block
              onClick={() => gradeMutation.mutate()}
              loading={gradeMutation.isPending}
            >
              Save Grade
            </Button>
          </Card>

          {/* AI Feedback */}
          <Card
            title={
              <Space>
                <ThunderboltOutlined style={{ color: "#1677ff" }} />
                <span>AI Feedback</span>
              </Space>
            }
            extra={
              <Button
                size="small"
                icon={aiFeedbackMutation.isPending
                  ? <Spin indicator={<LoadingOutlined spin />} size="small" />
                  : <ThunderboltOutlined />}
                onClick={() => aiFeedbackMutation.mutate()}
                loading={aiFeedbackMutation.isPending}
                disabled={aiFeedbackMutation.isPending}
              >
                {sub.ai_feedback ? "Regenerate" : "Generate"}
              </Button>
            }
          >
            {sub.ai_feedback ? (
              <>
                <Divider style={{ margin: "0 0 12px" }} />
                <MarkdownRenderer content={sub.ai_feedback} />
              </>
            ) : (
              <Text type="secondary">
                Click Generate to create AI-powered feedback for this submission.
              </Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
