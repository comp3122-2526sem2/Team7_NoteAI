"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Card, Col, Divider, Form, Input, InputNumber,
  Row, Space, Tag, Typography, message,
} from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { assignmentsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import type { Submission } from "@/lib/api";

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; aid: string }>;
}) {
  const { id: courseId, aid: assignmentId } = use(params);
  const { isTeacher, user } = useAuth();
  const qc = useQueryClient();

  const { data: assignment, isLoading } = useQuery({
    queryKey: ["assignment", courseId, assignmentId],
    queryFn: () => assignmentsApi.get(courseId, assignmentId).then((r) => r.data),
  });

  const { data: submissions } = useQuery({
    queryKey: ["submissions", courseId, assignmentId],
    queryFn: () => assignmentsApi.listSubmissions(courseId, assignmentId).then((r) => r.data),
    enabled: !!assignment,
  });

  const [submitText, setSubmitText] = useState("");
  const [gradeData, setGradeData] = useState<Record<string, { score: string; feedback: string }>>({});

  const submitMutation = useMutation({
    mutationFn: () => assignmentsApi.submit(courseId, assignmentId, submitText),
    onSuccess: () => {
      message.success("Assignment submitted");
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
      setSubmitText("");
    },
    onError: () => message.error("Failed to submit"),
  });

  const gradeMutation = useMutation({
    mutationFn: ({ subId, score, feedback }: { subId: string; score: number; feedback: string }) =>
      assignmentsApi.grade(courseId, assignmentId, subId, { score, teacher_feedback: feedback }),
    onSuccess: () => {
      message.success("Graded");
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
    },
    onError: () => message.error("Failed to grade"),
  });

  const aiFeedbackMutation = useMutation({
    mutationFn: (subId: string) =>
      assignmentsApi.generateAiFeedback(courseId, assignmentId, subId),
    onSuccess: () => {
      message.success("AI feedback generated");
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
    },
    onError: () => message.error("Failed to generate feedback"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!assignment) return <div>Assignment not found.</div>;

  const mySubmission = submissions?.find((s) => s.student_id === user?.id);

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{assignment.name}</Title>
          <Space style={{ marginTop: 8 }}>
            <Tag color="blue" style={{ textTransform: "capitalize" }}>{assignment.assignment_type}</Tag>
            {assignment.topic && <Tag>{assignment.topic}</Tag>}
            {assignment.due_date && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Due {new Date(assignment.due_date).toLocaleDateString()}
              </Text>
            )}
          </Space>
        </div>
        {assignment.max_score && <Tag color="gold">Max: {assignment.max_score} pts</Tag>}
      </div>

      {assignment.description && (
        <Card style={{ marginBottom: 24 }}>
          <MarkdownRenderer content={assignment.description} />
        </Card>
      )}

      <Divider />

      {/* Student view */}
      {!isTeacher && (
        <>
          {!mySubmission ? (
            <Card title="Submit Assignment">
              <TextArea
                placeholder="Your answer or comments…"
                value={submitText}
                onChange={(e) => setSubmitText(e.target.value)}
                rows={5}
                style={{ marginBottom: 12 }}
              />
              <Button
                type="primary"
                onClick={() => submitMutation.mutate()}
                loading={submitMutation.isPending}
              >
                Submit
              </Button>
            </Card>
          ) : (
            <Card
              title="Your Submission"
              extra={<StatusBadge status={mySubmission.submission_status} />}
            >
              {mySubmission.student_feedback && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Your answer</Text>
                  <p style={{ color: "#666" }}>{mySubmission.student_feedback}</p>
                </div>
              )}
              {mySubmission.score !== undefined && mySubmission.score !== null && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Score: </Text>
                  <Text style={{ fontSize: 18 }}>{mySubmission.score} / {assignment.max_score ?? "?"}</Text>
                </div>
              )}
              {mySubmission.teacher_feedback && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Teacher Feedback</Text>
                  <MarkdownRenderer content={mySubmission.teacher_feedback} />
                </div>
              )}
              {mySubmission.ai_feedback && (
                <div>
                  <Text strong>
                    <ThunderboltOutlined style={{ color: "#1677ff" }} /> AI Feedback
                  </Text>
                  <MarkdownRenderer content={mySubmission.ai_feedback} />
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Teacher view */}
      {isTeacher && (
        <div>
          <Title level={4}>Submissions ({submissions?.length ?? 0})</Title>
          {!submissions?.length ? (
            <Text type="secondary">No submissions yet.</Text>
          ) : (
            submissions.map((sub) => (
              <SubmissionCard
                key={sub.id}
                sub={sub}
                maxScore={assignment.max_score}
                gradeData={gradeData[sub.id] ?? { score: String(sub.score ?? ""), feedback: sub.teacher_feedback ?? "" }}
                onChange={(data) => setGradeData((p) => ({ ...p, [sub.id]: data }))}
                onGrade={() => {
                  const d = gradeData[sub.id];
                  gradeMutation.mutate({
                    subId: sub.id,
                    score: Number(d?.score ?? sub.score ?? 0),
                    feedback: d?.feedback ?? sub.teacher_feedback ?? "",
                  });
                }}
                onAiFeedback={() => aiFeedbackMutation.mutate(sub.id)}
                isGrading={gradeMutation.isPending}
                isGenerating={aiFeedbackMutation.isPending}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({
  sub,
  maxScore,
  gradeData,
  onChange,
  onGrade,
  onAiFeedback,
  isGrading,
  isGenerating,
}: {
  sub: Submission;
  maxScore?: number;
  gradeData: { score: string; feedback: string };
  onChange: (d: { score: string; feedback: string }) => void;
  onGrade: () => void;
  onAiFeedback: () => void;
  isGrading: boolean;
  isGenerating: boolean;
}) {
  return (
    <Card
      style={{ marginBottom: 16 }}
      extra={<StatusBadge status={sub.submission_status} />}
      size="small"
    >
      {sub.student_feedback && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Student Answer</Text>
          <p>{sub.student_feedback}</p>
        </div>
      )}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Score{maxScore ? ` / ${maxScore}` : ""}
          </Text>
          <InputNumber
            value={Number(gradeData.score) || undefined}
            onChange={(v) => onChange({ ...gradeData, score: String(v ?? "") })}
            style={{ display: "block", width: "100%", marginTop: 4 }}
            size="small"
          />
        </Col>
      </Row>
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Teacher Feedback</Text>
        <Input.TextArea
          value={gradeData.feedback}
          onChange={(e) => onChange({ ...gradeData, feedback: e.target.value })}
          rows={3}
          style={{ marginTop: 4 }}
        />
      </div>
      <Space>
        <Button type="primary" size="small" onClick={onGrade} loading={isGrading}>
          Save Grade
        </Button>
        <Button icon={<ThunderboltOutlined />} size="small" onClick={onAiFeedback} loading={isGenerating}>
          AI Feedback
        </Button>
      </Space>
      {sub.ai_feedback && (
        <div style={{ marginTop: 12, background: "#f6f8fa", borderRadius: 6, padding: 12 }}>
          <Text style={{ fontSize: 12 }}>
            <ThunderboltOutlined style={{ color: "#1677ff" }} /> AI Feedback
          </Text>
          <MarkdownRenderer content={sub.ai_feedback} />
        </div>
      )}
    </Card>
  );
}
