"use client";

import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { progressApi } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MasteryBadge } from "@/components/shared/mastery-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function StudentProgressPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id: courseId, sid: studentId } = use(params);
  const qc = useQueryClient();

  const { data: progress, isLoading } = useQuery({
    queryKey: ["student-progress", courseId, studentId],
    queryFn: () =>
      progressApi.getStudentProgress(courseId, studentId).then((r) => r.data),
  });

  const { data: recommendations } = useQuery({
    queryKey: ["recommendations", courseId, studentId],
    queryFn: () =>
      progressApi.getRecommendations(courseId, studentId).then((r) => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: () => progressApi.generateRecommendation(courseId, studentId),
    onSuccess: () => {
      toast.success("Recommendation generated");
      qc.invalidateQueries({ queryKey: ["recommendations", courseId, studentId] });
    },
    onError: () => toast.error("Failed to generate"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Student Progress Detail</h1>
      <p className="text-muted-foreground text-sm">Student ID: {studentId}</p>

      <Card>
        <CardHeader>
          <CardTitle>Topic Mastery</CardTitle>
        </CardHeader>
        <CardContent>
          {!progress?.length ? (
            <p className="text-muted-foreground text-sm">No progress data.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Mastery</TableHead>
                  <TableHead>Last Assessed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progress.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.topic}</TableCell>
                    <TableCell>
                      <MasteryBadge level={p.mastery_level} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {p.last_assessed_at
                        ? new Date(p.last_assessed_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Recommendations</h2>
        <Button
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          <Sparkles className="h-4 w-4 mr-1" />
          {generateMutation.isPending ? "Generating…" : "Generate Recommendation"}
        </Button>
      </div>

      {!recommendations?.length ? (
        <p className="text-muted-foreground text-sm">No recommendations yet.</p>
      ) : (
        <div className="space-y-4">
          {recommendations.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </CardHeader>
              <CardContent>
                <MarkdownRenderer content={r.recommendation} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
