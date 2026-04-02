"use client";

import { useQuery } from "@tanstack/react-query";
import { progressApi, type StudentProgress } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MasteryBadge } from "@/components/shared/mastery-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp } from "lucide-react";

export default function MyProgressPage() {
  const { data: progress, isLoading } = useQuery({
    queryKey: ["my-progress"],
    queryFn: () => progressApi.myProgress().then((r) => r.data),
  });

  if (isLoading) return <LoadingSpinner />;

  // Group by course
  const byCourse = (progress ?? []).reduce(
    (acc, p) => {
      if (!acc[p.course_id]) acc[p.course_id] = [];
      acc[p.course_id]!.push(p);
      return acc;
    },
    {} as Record<string, StudentProgress[]>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Progress</h1>
        <p className="text-muted-foreground text-sm">Your topic mastery across all courses</p>
      </div>

      {!progress?.length ? (
        <div className="text-center py-20 text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No progress data yet.</p>
        </div>
      ) : (
        Object.entries(byCourse).map(([courseId, rows]) => (
          <Card key={courseId}>
            <CardHeader>
              <CardTitle className="text-base">Course: {courseId.slice(0, 8)}…</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    <TableHead>Mastery</TableHead>
                    <TableHead>Last Assessed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows?.map((p) => (
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
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
