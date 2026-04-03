"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  App, Button, Card, Col, Divider, Form, Input, InputNumber,
  Radio, Row, Space, Tag, Typography,
} from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { assignmentsApi } from "@/lib/api";
import type { Assignment, AssignmentContent, MCQuestion, LongQuestion, PassageSection, Submission } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;


// ── Question renderer (student view) ─────────────────────────────────────────

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
        const n = qNum; // capture current value — prevents closure-in-loop bug
        nodes.push(
          <QuestionBlock
            key={`q-${n}`}
            num={n}
            question={sq}
            answer={answers[String(n)] ?? ""}
            onChange={(v) => onChange(String(n), v)}
            readOnly={readOnly}
            showSuggestedAnswer={showSuggestedAnswer}
          />
        );
      }
    } else {
      qNum++;
      const n = qNum; // capture current value
      nodes.push(
        <QuestionBlock
          key={`q-${n}`}
          num={n}
          question={section as MCQuestion | LongQuestion}
          answer={answers[String(n)] ?? ""}
          onChange={(v) => onChange(String(n), v)}
          readOnly={readOnly}
          showSuggestedAnswer={showSuggestedAnswer}
        />
      );
    }
  }

  return nodes;
}

const OPTION_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function QuestionBlock({
  num,
  question,
  answer,
  onChange,
  readOnly,
  showSuggestedAnswer = false,
}: {
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
          <Radio.Group
            value={answer || undefined}
            onChange={(e) => !readOnly && onChange(e.target.value)}
            disabled={readOnly}
          >
            <Space direction="vertical">
              {mc.options.map((opt, idx) => {
                const label = OPTION_LABELS[idx];
                const isCorrect = showSuggestedAnswer && mc.correct_answer === label;
                return (
                  <Radio key={label} value={label}>
                    <Text strong style={{ marginRight: 6 }}>{label}.</Text>
                    {opt}
                    {isCorrect && (
                      <Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>correct</Tag>
                    )}
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
          <TextArea
            rows={4}
            placeholder="Write your answer here…"
            value={answer}
            onChange={(e) => !readOnly && onChange(e.target.value)}
            disabled={readOnly}
            style={{ maxWidth: 600 }}
          />
          {showSuggestedAnswer && long.suggested_answer && (
            <div style={{
              marginTop: 8, padding: "8px 12px",
              background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 6,
              maxWidth: 600,
            }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Suggested answer</Text>
              <Paragraph style={{ margin: 0, marginTop: 2 }}>{long.suggested_answer}</Paragraph>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ── Student answers display (read-only, e.g. after submission) ────────────────

function AnswersDisplay({
  content,
  answers,
  showSuggestedAnswer = false,
}: {
  content: AssignmentContent;
  answers: Record<string, string>;
  showSuggestedAnswer?: boolean;
}) {
  return (
    <div>
      {renderQuestions(content, answers, () => {}, true, showSuggestedAnswer)}
    </div>
  );
}


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; aid: string }>;
}) {
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

  // Per-question answers state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
  const [gradeData, setGradeData] = useState<Record<string, { score: string; feedback: string }>>({});

  const setAnswer = (key: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const hasContent = !!assignment?.content?.sections?.length;

  const submitMutation = useMutation({
    mutationFn: () =>
      assignmentsApi.submit(courseId, assignmentId,
        hasContent
          ? { answers }
          : { student_feedback: freeText }
      ),
    onSuccess: () => {
      message.success("Assignment submitted");
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
      setAnswers({});
      setFreeText("");
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

      {/* Student view */}
      {!isTeacher && (
        <>
          {!mySubmission ? (
            <Card title="Answer Questions">
              {hasContent ? (
                <>
                  {renderQuestions(assignment.content!, answers, setAnswer, false)}
                  <Divider style={{ margin: "8px 0 16px" }} />
                  <Button
                    type="primary"
                    onClick={() => submitMutation.mutate()}
                    loading={submitMutation.isPending}
                    disabled={Object.keys(answers).length === 0}
                  >
                    Submit
                  </Button>
                </>
              ) : (
                <>
                  <TextArea
                    placeholder="Your answer or comments…"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
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
                </>
              )}
            </Card>
          ) : (
            <Card
              title="Your Submission"
              extra={<StatusBadge status={mySubmission.submission_status} />}
            >
              {/* Show structured answers if available */}
              {mySubmission.answers && hasContent ? (
                <AnswersDisplay
                  content={assignment.content!}
                  answers={mySubmission.answers}
                />
              ) : mySubmission.student_feedback ? (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Your answer</Text>
                  <p style={{ color: "#666" }}>{mySubmission.student_feedback}</p>
                </div>
              ) : null}

              {mySubmission.score !== undefined && mySubmission.score !== null && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Score: </Text>
                  <Text style={{ fontSize: 18 }}>
                    {mySubmission.score} / {assignment.max_score ?? "?"}
                  </Text>
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
                assignment={assignment}
                gradeData={gradeData[sub.id] ?? {
                  score: String(sub.score ?? ""),
                  feedback: sub.teacher_feedback ?? "",
                }}
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


// ── Submission card (teacher grading view) ────────────────────────────────────

function SubmissionCard({
  sub,
  assignment,
  gradeData,
  onChange,
  onGrade,
  onAiFeedback,
  isGrading,
  isGenerating,
}: {
  sub: Submission;
  assignment: Assignment;
  gradeData: { score: string; feedback: string };
  onChange: (d: { score: string; feedback: string }) => void;
  onGrade: () => void;
  onAiFeedback: () => void;
  isGrading: boolean;
  isGenerating: boolean;
}) {
  const hasContent = !!assignment.content?.sections?.length;

  return (
    <Card
      style={{ marginBottom: 16 }}
      size="small"
      title={
        sub.student_name ? (
          <Space>
            <Text strong>{sub.student_name}</Text>
            {sub.student_username && (
              <Text type="secondary" style={{ fontSize: 12 }}>@{sub.student_username}</Text>
            )}
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>Student ID: {sub.student_id}</Text>
        )
      }
      extra={<StatusBadge status={sub.submission_status} />}
    >
      {/* Student answers */}
      {sub.answers && hasContent ? (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>Student Answers</Text>
          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <AnswersDisplay
              content={assignment.content!}
              answers={sub.answers}
              showSuggestedAnswer
            />
          </div>
        </>
      ) : sub.student_feedback ? (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Student Answer</Text>
          <p>{sub.student_feedback}</p>
        </div>
      ) : null}

      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Score{assignment.max_score ? ` / ${assignment.max_score}` : ""}
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
