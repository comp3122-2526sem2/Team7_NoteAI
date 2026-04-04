"use client";

import { Card, Radio, Space, Tag, Typography, Input } from "antd";
import type { AssignmentContent, MCQuestion, LongQuestion, PassageSection } from "@/lib/api";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const OPTION_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function QuestionBlock({ num, question, answer, showSuggestedAnswer = false }: {
  num: number;
  question: MCQuestion | LongQuestion;
  answer: string;
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
          <Radio.Group value={answer || undefined} disabled>
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
          <TextArea rows={4} value={answer} disabled style={{ maxWidth: 600 }} />
          {showSuggestedAnswer && long.suggested_answer && (
            <div style={{
              marginTop: 8, padding: "8px 12px",
              background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 6, maxWidth: 600,
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

export function AnswersDisplay({ content, answers, showSuggestedAnswer = false }: {
  content: AssignmentContent;
  answers: Record<string, string>;
  showSuggestedAnswer?: boolean;
}) {
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
            answer={answers[String(n)] ?? ""} showSuggestedAnswer={showSuggestedAnswer} />
        );
      }
    } else {
      qNum++;
      const n = qNum;
      nodes.push(
        <QuestionBlock key={`q-${n}`} num={n} question={section as MCQuestion | LongQuestion}
          answer={answers[String(n)] ?? ""} showSuggestedAnswer={showSuggestedAnswer} />
      );
    }
  }

  return <div>{nodes}</div>;
}
