import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type MasteryLevel = "weak" | "developing" | "proficient";

const styles: Record<MasteryLevel, string> = {
  weak: "bg-red-100 text-red-700 border-red-200",
  developing: "bg-yellow-100 text-yellow-700 border-yellow-200",
  proficient: "bg-green-100 text-green-700 border-green-200",
};

export function MasteryBadge({ level }: { level: MasteryLevel }) {
  return (
    <Badge variant="outline" className={cn("capitalize", styles[level])}>
      {level}
    </Badge>
  );
}
