"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { progressApi, type StudentProgress } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MasteryBadge } from "@/components/shared/mastery-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CourseProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);

  const { data: progress, isLoading } = useQuery({
    queryKey: ["progress", courseId],
    queryFn: () => progressApi.listCourseProgress(courseId).then((r) => r.data),
  });

  if (isLoading) return <LoadingSpinner />;

  // Group by student
  const byStudent = (progress ?? []).reduce(
    (acc, p) => {
      if (!acc[p.student_id]) acc[p.student_id] = [];
      acc[p.student_id]!.push(p);
      return acc;
    },
    {} as Record<string, StudentProgress[]>
  );

  const topics = [...new Set((progress ?? []).map((p) => p.topic))];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Student Progress</h1>

      {!progress?.length ? (
        <div className="text-center py-20 text-muted-foreground">No progress data yet.</div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Class Overview</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  {topics.map((t) => (
                    <TableHead key={t}>{t}</TableHead>
                  ))}
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(byStudent).map(([studentId, rows]) => (
                  <TableRow key={studentId}>
                    <TableCell className="font-medium">{studentId.slice(0, 8)}…</TableCell>
                    {topics.map((t) => {
                      const row = rows?.find((r) => r.topic === t);
                      return (
                        <TableCell key={t}>
                          {row ? (
                            <MasteryBadge level={row.mastery_level} />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                    <Button variant="outline" size="sm" render={<Link href={`/courses/${courseId}/progress/students/${studentId}`} />}>
                      View
                    </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
