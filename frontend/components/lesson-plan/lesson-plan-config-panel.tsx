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

const METHOD_OPTIONS = ["Lecture", "Group discussion", "Demonstration", "Inquiry activity", "Gamified learning"];
const ASSESSMENT_OPTIONS = ["Q&A", "Worksheet", "Quiz", "Project-based", "Oral presentation"];
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
    <Card title="Lesson Plan Settings (optional)" size="small">
      <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
        At minimum, fill in &quot;Topic&quot; and &quot;Duration&quot; to generate. The more complete, the better AI can tailor to your class.
      </Paragraph>
      <Space orientation="vertical" style={{ width: "100%" }} size={14}>
        <div>
          <Tooltip title="Topic or unit name for this lesson.">
            <div>Topic</div>
          </Tooltip>
          <Input
            value={(value.topic as string) ?? ""}
            onChange={(e) => setField("topic", e.target.value)}
            placeholder="e.g. Charts and Collision Avoidance Rules"
            style={{ marginTop: 6 }}
          />
        </div>

        <div>
          <Tooltip title="Default: 35 / 40 / 80 minutes, or custom.">
            <div>Duration</div>
          </Tooltip>
          <Radio.Group
            value={durationPreset}
            onChange={(e) => setDurationFromPreset(e.target.value)}
            style={{ marginTop: 6, marginBottom: durationPreset === "custom" ? 8 : 0 }}
          >
            <Radio value="35">35</Radio>
            <Radio value="40">40</Radio>
            <Radio value="80">80</Radio>
            <Radio value="custom">Custom</Radio>
          </Radio.Group>
          {durationPreset === "custom" && (
            <InputNumber
              min={1}
              max={600}
              value={dm}
              onChange={(val) => setField("duration_minutes", val ?? 1)}
              style={{ width: "100%" }}
              addonAfter="min"
            />
          )}
        </div>

        <div>
          <Tooltip title="Overall difficulty.">
            <div>Difficulty</div>
          </Tooltip>
          <Radio.Group
            value={(value.difficulty as string) ?? "intermediate"}
            onChange={(e) => setField("difficulty", e.target.value)}
            style={{ marginTop: 6 }}
            options={[
              { label: "Basic", value: "basic" },
              { label: "Intermediate", value: "intermediate" },
              { label: "Advanced", value: "advanced" },
            ]}
          />
        </div>

        <Space orientation="vertical" style={{ width: "100%" }} size={14}>
          <div>
            <div>Teaching Methods</div>
            <Checkbox.Group
              style={{ marginTop: 6 }}
              value={(value.teaching_method as string[]) ?? []}
              options={METHOD_OPTIONS}
              onChange={(vals) => setField("teaching_method", vals)}
            />
          </div>

          <div>
            <div>Teaching Focus</div>
            <Input.TextArea
              style={{ marginTop: 6 }}
              rows={3}
              value={(value.teaching_content as string) ?? ""}
              onChange={(e) => setField("teaching_content", e.target.value)}
              placeholder="Concepts or skills to cover this lesson (optional)"
            />
          </div>

          <div>
            <div>Student Level</div>
            <Radio.Group
              value={(value.student_level as string) ?? "medium"}
              onChange={(e) => setField("student_level", e.target.value)}
              style={{ marginTop: 6 }}
              options={[
                { label: "Low", value: "low" },
                { label: "Medium", value: "medium" },
                { label: "High", value: "high" },
              ]}
            />
          </div>

          <div>
            <div>Assessment Methods</div>
            <Checkbox.Group
              style={{ marginTop: 6 }}
              value={(value.assessment as string[]) ?? []}
              options={ASSESSMENT_OPTIONS}
              onChange={(vals) => setField("assessment", vals)}
            />
          </div>

          <div>
            <div style={{ marginBottom: 8 }}>Learning Objectives</div>
            <Space orientation="vertical" style={{ width: "100%" }}>
              {objectives.map((item, idx) => (
                <Space key={idx} style={{ width: "100%" }} wrap>
                  <Tag>{idx + 1}</Tag>
                  <Input
                    style={{ flex: 1, minWidth: 120 }}
                    value={item}
                    onChange={(e) => updateObjective(idx, e.target.value)}
                    placeholder="e.g. Students can identify..."
                  />
                  <Button danger size="small" onClick={() => removeObjective(idx)}>
                    Remove
                  </Button>
                </Space>
              ))}
              <Button size="small" onClick={addObjective}>
                + Add objective
              </Button>
            </Space>
          </div>
        </Space>
      </Space>
    </Card>
  );
}
