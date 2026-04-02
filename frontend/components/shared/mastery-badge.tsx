import { Tag } from "antd";

type MasteryLevel = "weak" | "developing" | "proficient";

const colors: Record<MasteryLevel, string> = {
  weak: "error",
  developing: "warning",
  proficient: "success",
};

export function MasteryBadge({ level }: { level: MasteryLevel }) {
  return (
    <Tag color={colors[level]} style={{ textTransform: "capitalize" }}>
      {level}
    </Tag>
  );
}
