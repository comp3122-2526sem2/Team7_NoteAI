import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status =
  | "draft"
  | "published"
  | "archived"
  | "pending"
  | "submitted"
  | "graded"
  | "completed"
  | "failed";

const styles: Record<Status, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  published: "bg-blue-100 text-blue-700 border-blue-200",
  archived: "bg-purple-100 text-purple-700 border-purple-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  submitted: "bg-blue-100 text-blue-700 border-blue-200",
  graded: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant="outline" className={cn("capitalize", styles[status])}>
      {status}
    </Badge>
  );
}
