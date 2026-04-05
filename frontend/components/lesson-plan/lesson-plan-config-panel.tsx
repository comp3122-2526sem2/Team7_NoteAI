"use client";

import {
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { LessonPlanConfig } from "@/lib/api";

const { Paragraph } = Typography;

const METHOD_OPTIONS = ["講授", "小組討論", "示範", "探究活動", "遊戲化學習"];
const ASSESSMENT_OPTIONS = ["問答", "工作紙", "小測驗", "專題研習", "口頭匯報"];
const PRESET_MINUTES = [35, 40, 80] as const;

interface Props {
  value: LessonPlanConfig;
  onChange: (next: LessonPlanConfig) => void;
}

export function LessonPlanConfigPanel({ value, onChange }: Props) {
  const objectives = Array.isArray(value.objectives) ? (value.objectives as string[]) : [];

  const setField = (key: string, fieldValue: unknown) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const addObjective = () => setField("objectives", [...objectives, ""]);
  const updateObjective = (idx: number, text: string) => {
    const next = [...objectives];
    next[idx] = text;
    setField("objectives", next);
  };
  const removeObjective = (idx: number) =>
    setField(
      "objectives",
      objectives.filter((_, i) => i !== idx)
    );

  const dm = Number(value.duration_minutes ?? 40);
  const durationPreset = PRESET_MINUTES.includes(dm as (typeof PRESET_MINUTES)[number])
    ? String(dm)
    : "custom";

  const setDurationFromPreset = (preset: string) => {
    if (preset === "custom") {
      setField(
        "duration_minutes",
        PRESET_MINUTES.includes(dm as (typeof PRESET_MINUTES)[number]) ? 45 : dm
      );
    } else {
      setField("duration_minutes", Number(preset));
    }
  };

  return (
    <Card title="教案設定（可選）" size="small">
      <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
        最少填「課題」與「時長」即可產生；其餘愈完整，AI 越能配合你的班級。
      </Paragraph>
      <Space orientation="vertical" style={{ width: "100%" }} size={14}>
        <div>
          <Tooltip title="本課主題或單元名稱。">
            <div>課題</div>
          </Tooltip>
          <Input
            value={(value.topic as string) ?? ""}
            onChange={(e) => setField("topic", e.target.value)}
            placeholder="例如：海圖與避碰規則"
            style={{ marginTop: 6 }}
          />
        </div>

        <div>
          <Tooltip title="預設 35／40／80 分鐘，或自訂。">
            <div>課堂時長</div>
          </Tooltip>
          <Radio.Group
            value={durationPreset}
            onChange={(e) => setDurationFromPreset(e.target.value)}
            style={{ marginTop: 6, marginBottom: durationPreset === "custom" ? 8 : 0 }}
          >
            <Radio value="35">35</Radio>
            <Radio value="40">40</Radio>
            <Radio value="80">80</Radio>
            <Radio value="custom">自訂</Radio>
          </Radio.Group>
          {durationPreset === "custom" && (
            <InputNumber
              min={1}
              max={600}
              value={dm}
              onChange={(val) => setField("duration_minutes", val ?? 1)}
              style={{ width: "100%" }}
              addonAfter="分鐘"
            />
          )}
        </div>

        <div>
          <Tooltip title="整體難度。">
            <div>難度</div>
          </Tooltip>
          <Radio.Group
            value={(value.difficulty as string) ?? "intermediate"}
            onChange={(e) => setField("difficulty", e.target.value)}
            style={{ marginTop: 6 }}
            options={[
              { label: "基礎", value: "basic" },
              { label: "中等", value: "intermediate" },
              { label: "進階", value: "advanced" },
            ]}
          />
        </div>

        <Space orientation="vertical" style={{ width: "100%" }} size={14}>
          <div>
            <div>教學法</div>
            <Checkbox.Group
              style={{ marginTop: 6 }}
              value={(value.teaching_method as string[]) ?? []}
              options={METHOD_OPTIONS}
              onChange={(vals) => setField("teaching_method", vals)}
            />
          </div>

          <div>
            <div>教學內容重點</div>
            <Input.TextArea
              style={{ marginTop: 6 }}
              rows={3}
              value={(value.teaching_content as string) ?? ""}
              onChange={(e) => setField("teaching_content", e.target.value)}
              placeholder="本課要涵蓋的概念或技能（可空）"
            />
          </div>

          <div>
            <div>學生程度</div>
            <Radio.Group
              value={(value.student_level as string) ?? "medium"}
              onChange={(e) => setField("student_level", e.target.value)}
              style={{ marginTop: 6 }}
              options={[
                { label: "較弱", value: "low" },
                { label: "中等", value: "medium" },
                { label: "較強", value: "high" },
              ]}
            />
          </div>

          <div>
            <div>評量方式</div>
            <Checkbox.Group
              style={{ marginTop: 6 }}
              value={(value.assessment as string[]) ?? []}
              options={ASSESSMENT_OPTIONS}
              onChange={(vals) => setField("assessment", vals)}
            />
          </div>

          <div>
            <div style={{ marginBottom: 8 }}>學習目標</div>
            <Space orientation="vertical" style={{ width: "100%" }}>
              {objectives.map((item, idx) => (
                <Space key={idx} style={{ width: "100%" }} wrap>
                  <Tag>{idx + 1}</Tag>
                  <Input
                    style={{ flex: 1, minWidth: 120 }}
                    value={item}
                    onChange={(e) => updateObjective(idx, e.target.value)}
                    placeholder="學習目標"
                  />
                  <Button danger size="small" onClick={() => removeObjective(idx)}>
                    移除
                  </Button>
                </Space>
              ))}
              <Button size="small" onClick={addObjective}>
                + 新增目標
              </Button>
            </Space>
          </div>
        </Space>
      </Space>
    </Card>
  );
}
