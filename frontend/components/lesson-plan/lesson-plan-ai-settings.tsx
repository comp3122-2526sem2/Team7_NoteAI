"use client";

import { Card, Input, Radio, Select, Space, Typography } from "antd";
import type { LessonPlanOutputLanguage, LessonPlanStylePreset } from "@/lib/api";

const { Text, Paragraph } = Typography;

const STYLE_OPTIONS: { value: LessonPlanStylePreset; label: string }[] = [
  { value: "balanced", label: "Balanced (lecture + activity)" },
  { value: "activity_heavy", label: "Activity-heavy (group / hands-on)" },
  { value: "lecture_focus", label: "Lecture-focused" },
  { value: "exam_prep", label: "Exam preparation" },
  { value: "public_lesson", label: "Open lesson / observation" },
];

interface Props {
  outputLanguage: LessonPlanOutputLanguage;
  stylePreset: LessonPlanStylePreset;
  focusInstruction: string;
  onOutputLanguageChange: (v: LessonPlanOutputLanguage) => void;
  onStylePresetChange: (v: LessonPlanStylePreset) => void;
  onFocusChange: (v: string) => void;
}

export function LessonPlanAiSettings({
  outputLanguage,
  stylePreset,
  focusInstruction,
  onOutputLanguageChange,
  onStylePresetChange,
  onFocusChange,
}: Props) {
  return (
    <Card size="small" title="AI Settings">
      <Space orientation="vertical" style={{ width: "100%" }} size={12}>
        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
          Language and style apply to both &quot;Generate&quot; and &quot;Rewrite&quot;. Focus / keywords help align with your materials.
        </Paragraph>
        <div>
          <Text type="secondary">Output language</Text>
          <div style={{ marginTop: 6 }}>
            <Radio.Group
              value={outputLanguage}
              onChange={(e) =>
                onOutputLanguageChange(e.target.value as LessonPlanOutputLanguage)
              }
              optionType="button"
              buttonStyle="solid"
              block
            >
              <Radio.Button value="zh" style={{ width: "50%", textAlign: "center" }}>
                Traditional Chinese
              </Radio.Button>
              <Radio.Button value="en" style={{ width: "50%", textAlign: "center" }}>
                English
              </Radio.Button>
            </Radio.Group>
          </div>
        </div>
        <div>
          <Text type="secondary">Classroom style</Text>
          <Select<LessonPlanStylePreset>
            style={{ width: "100%", marginTop: 6 }}
            value={stylePreset}
            onChange={onStylePresetChange}
            options={STYLE_OPTIONS}
          />
        </div>
        <div>
          <Text type="secondary">Focus / keywords for this lesson (optional)</Text>
          <Input.TextArea
            style={{ marginTop: 6 }}
            rows={2}
            value={focusInstruction}
            onChange={(e) => onFocusChange(e.target.value)}
            placeholder="e.g. Simplifying expressions, lab safety, reading strategies..."
          />
        </div>
      </Space>
    </Card>
  );
}
