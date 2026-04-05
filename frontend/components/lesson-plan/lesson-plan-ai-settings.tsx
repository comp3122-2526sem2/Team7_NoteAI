"use client";

import { Card, Input, Radio, Select, Space, Typography } from "antd";
import type { LessonPlanOutputLanguage, LessonPlanStylePreset } from "@/lib/api";

const { Text, Paragraph } = Typography;

const STYLE_OPTIONS: { value: LessonPlanStylePreset; label: string }[] = [
  { value: "balanced", label: "均衡（講授＋活動）" },
  { value: "activity_heavy", label: "活動為主（小組／操作）" },
  { value: "lecture_focus", label: "講授為主" },
  { value: "exam_prep", label: "測驗備戰" },
  { value: "public_lesson", label: "公開課／觀課" },
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
    <Card size="small" title="AI 設定">
      <Space orientation="vertical" style={{ width: "100%" }} size={12}>
        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
          語言與風格會套用於「AI 產生」與「選取重寫」。焦點／關鍵字會幫忙對準教材。
        </Paragraph>
        <div>
          <Text type="secondary">輸出語言</Text>
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
                繁中
              </Radio.Button>
              <Radio.Button value="en" style={{ width: "50%", textAlign: "center" }}>
                English
              </Radio.Button>
            </Radio.Group>
          </div>
        </div>
        <div>
          <Text type="secondary">課堂風格</Text>
          <Select<LessonPlanStylePreset>
            style={{ width: "100%", marginTop: 6 }}
            value={stylePreset}
            onChange={onStylePresetChange}
            options={STYLE_OPTIONS}
          />
        </div>
        <div>
          <Text type="secondary">本課焦點／關鍵字（選填）</Text>
          <Input.TextArea
            style={{ marginTop: 6 }}
            rows={2}
            value={focusInstruction}
            onChange={(e) => onFocusChange(e.target.value)}
            placeholder="例：代數式化簡、實驗安全、閱讀策略…"
          />
        </div>
      </Space>
    </Card>
  );
}
