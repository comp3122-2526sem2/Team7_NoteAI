import { Tag } from "antd";

type Status =
  | "draft"
  | "published"
  | "archived"
  | "pending"
  | "submitted"
  | "graded"
  | "completed"
  | "failed"
  | "quiz"
  | "homework"
  | "project"
  | "exam";

const colors: Record<Status, string> = {
  draft: "default",
  published: "blue",
  archived: "purple",
  pending: "warning",
  submitted: "processing",
  graded: "success",
  completed: "success",
  failed: "error",
  quiz: "cyan",
  homework: "geekblue",
  project: "volcano",
  exam: "magenta",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Tag color={colors[status] ?? "default"} style={{ textTransform: "capitalize" }}>
      {status}
    </Tag>
  );
}
