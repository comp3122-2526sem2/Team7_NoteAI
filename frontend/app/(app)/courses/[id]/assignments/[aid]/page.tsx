"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  App, Button, Card, Divider, Input, Radio, Space, Table, Tag, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { EyeOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { assignmentsApi } from "@/lib/api";
import type { Assignment, AssignmentContent, MCQuestion, LongQuestion, PassageSection, Submission } from "@/lib/api";
import { AnswersDisplay } from "./answers-display";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;


// ── Question renderer ─────────────────────────────────────────────────────────

function renderQuestions(
  content: AssignmentContent,
  answers: Record<string, string>,
  onChange: (key: string, value: string) => void,
  readOnly = false,
  showSuggestedAnswer = false,
) {
  let qNum = 0;
  const nodes: React.ReactNode[] = [];

  for (const section of content.sections) {
    if (section.type === "passage") {
      const passage = section as PassageSection;
      nodes.push(
        <Card
          key={`passage-${nodes.length}`}
          size="small"
          style={{ marginBottom: 20, background: "#f9f9f9" }}
          title={<Text strong style={{ fontSize: 13 }}>Reading Passage</Text>}
        >
          <Paragraph style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, marginBottom: 0 }}>
            {passage.passage}
          </Paragraph>
        </Card>
      );
      for (const sq of passage.questions) {
        qNum++;
        const n = qNum;
        nodes.push(
          <QuestionBlock key={`q-${n}`} num={n} question={sq}
            answer={answers[String(n)] ?? ""} onChange={(v) => onChange(String(n), v)}
            readOnly={readOnly} showSuggestedAnswer={showSuggestedAnswer} />
        );
      }
    } else {
      qNum++;
      const n = qNum;
      nodes.push(
        <QuestionBlock key={`q-${n}`} num={n} question={section as MCQuestion | LongQuestion}
          answer={answers[String(n)] ?? ""} onChange={(v) => onChange(String(n), v)}
          readOnly={readOnly} showSuggestedAnswer={showSuggestedAnswer} />
      );
    }
  }
  return nodes;
}

const OPTION_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function QuestionBlock({ num, question, answer, onChange, readOnly, showSuggestedAnswer = false }: {
  num: number;
  question: MCQuestion | LongQuestion;
  answer: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  showSuggestedAnswer?: boolean;
}) {
  const mc = question as MCQuestion;
  const long = question as LongQuestion;

  return (
    <div style={{ marginBottom: 24 }}>
      <Text strong style={{ fontSize: 14 }}>
        Q{num}.{" "}
        <Tag color={question.type === "mc" ? "blue" : "green"} style={{ fontSize: 11, marginLeft: 4 }}>
          {question.type === "mc" ? "MC" : "Long"}
        </Tag>
      </Text>
      <Paragraph style={{ marginTop: 4, marginBottom: 10 }}>{question.question}</Paragraph>

      {question.type === "mc" ? (
        <>
          <Radio.Group value={answer || undefined} onChange={(e) => !readOnly && onChange(e.target.value)} disabled={readOnly}>
            <Space direction="vertical">
              {mc.options.map((opt, idx) => {
                const label = OPTION_LABELS[idx];
                const isCorrect = showSuggestedAnswer && mc.correct_answer === label;
                return (
                  <Radio key={label} value={label}>
                    <Text strong style={{ marginRight: 6 }}>{label}.</Text>
                    {opt}
                    {isCorrect && <Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>correct</Tag>}
                  </Radio>
                );
              })}
            </Space>
          </Radio.Group>
          {showSuggestedAnswer && mc.correct_answer && (
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
              Correct: <Text strong>{mc.correct_answer}</Text>
            </Text>
          )}
        </>
      ) : (
        <>
          <TextArea rows={4} placeholder="Write your answer here…" value={answer}
            onChange={(e) => !readOnly && onChange(e.target.value)} disabled={readOnly} style={{ maxWidth: 600 }} />
          {showSuggestedAnswer && long.suggested_answer && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 6, maxWidth: 600 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Suggested answer</Text>
              <Paragraph style={{ margin: 0, marginTop: 2 }}>{long.suggested_answer}</Paragraph>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AssignmentDetailPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id: courseId, aid: assignmentId } = use(params);
  const { isTeacher, user } = useAuth();
  const { message } = App.useApp();
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

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");

  const hasContent = !!assignment?.content?.sections?.length;

  const submitMutation = useMutation({
    mutationFn: () =>
      assignmentsApi.submit(courseId, assignmentId, hasContent ? { answers } : { student_feedback: freeText }),
    onSuccess: () => {
      message.success("Assignment submitted");
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
      setAnswers({});
      setFreeText("");
    },
    onError: () => message.error("Failed to submit"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!assignment) return <div>Assignment not found.</div>;

  const mySubmission = submissions?.find((s) => s.student_id === user?.id);

  return (
    <div>
      {/* Header */}
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

      {/* ── Student view ── */}
      {!isTeacher && (
        <>
          {!mySubmission ? (
            <Card title="Answer Questions">
              {hasContent ? (
                <>
                  {renderQuestions(assignment.content!, answers, (k, v) => setAnswers((p) => ({ ...p, [k]: v })), false)}
                  <Divider style={{ margin: "8px 0 16px" }} />
                  <Button type="primary" onClick={() => submitMutation.mutate()} loading={submitMutation.isPending}
                    disabled={Object.keys(answers).length === 0}>
                    Submit
                  </Button>
                </>
              ) : (
                <>
                  <TextArea placeholder="Your answer or comments…" value={freeText}
                    onChange={(e) => setFreeText(e.target.value)} rows={5} style={{ marginBottom: 12 }} />
                  <Button type="primary" onClick={() => submitMutation.mutate()} loading={submitMutation.isPending}>
                    Submit
                  </Button>
                </>
              )}
            </Card>
          ) : (
            <Card title="Your Submission" extra={<StatusBadge status={mySubmission.submission_status} />}>
              {mySubmission.answers && hasContent ? (
                <AnswersDisplay content={assignment.content!} answers={mySubmission.answers} />
              ) : mySubmission.student_feedback ? (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Your answer</Text>
                  <p style={{ color: "#666" }}>{mySubmission.student_feedback}</p>
                </div>
              ) : null}

              {mySubmission.score != null && (
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

      {/* ── Teacher view: submissions table ── */}
      {isTeacher && (
        <SubmissionsTable
          submissions={submissions ?? []}
          assignment={assignment}
          courseId={courseId}
          assignmentId={assignmentId}
        />
      )}
    </div>
  );
}


// ── Teacher submissions table ─────────────────────────────────────────────────

function SubmissionsTable({ submissions, assignment, courseId, assignmentId }: {
  submissions: Submission[];
  assignment: Assignment;
  courseId: string;
  assignmentId: string;
}) {
  const columns: ColumnsType<Submission> = [
    {
      title: "Student",
      key: "student",
      render: (_: unknown, sub: Submission) => (
        <Space direction="vertical" size={0}>
          <Text strong>{sub.student_name ?? "—"}</Text>
          {sub.student_username && (
            <Text type="secondary" style={{ fontSize: 12 }}>@{sub.student_username}</Text>
          )}
        </Space>
      ),
    },
    {
      title: "Submitted",
      dataIndex: "submission_date",
      key: "submission_date",
      render: (d: string | undefined) =>
        d ? new Date(d).toLocaleString() : <Text type="secondary">—</Text>,
    },
    {
      title: "Status",
      key: "status",
      render: (_: unknown, sub: Submission) => <StatusBadge status={sub.submission_status} />,
    },
    {
      title: "Score",
      key: "score",
      render: (_: unknown, sub: Submission) =>
        sub.score != null ? (
          <Text>{sub.score}{assignment.max_score ? ` / ${assignment.max_score}` : ""}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "AI Feedback",
      key: "ai_feedback",
      render: (_: unknown, sub: Submission) =>
        sub.ai_feedback ? (
          <Tag color="blue" icon={<ThunderboltOutlined />}>Generated</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "",
      key: "action",
      align: "right",
      render: (_: unknown, sub: Submission) => (
        <Link href={`/courses/${courseId}/assignments/${assignmentId}/submissions/${sub.id}`}>
          <Button size="small" icon={<EyeOutlined />}>Review</Button>
        </Link>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        Submissions ({submissions.length})
      </Title>
      {submissions.length === 0 ? (
        <Text type="secondary">No submissions yet.</Text>
      ) : (
        <Table
          dataSource={submissions}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="middle"
        />
      )}
    </div>
  );
}
