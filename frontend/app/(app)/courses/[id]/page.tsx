"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Settings, ClipboardList, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isTeacher } = useAuth();

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: () => coursesApi.get(id).then((r) => r.data),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!course) return <div className="p-4">Course not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{course.name}</h1>
          <p className="text-muted-foreground text-sm">{course.description}</p>
        </div>
        {isTeacher && (
          <Button variant="outline" size="sm" render={<Link href={`/courses/${id}/settings`} />}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          {isTeacher && <TabsTrigger value="lesson-plans">Lesson Plans</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Syllabus</CardTitle>
            </CardHeader>
            <CardContent>
              {course.syllabus ? (
                <MarkdownRenderer content={course.syllabus} />
              ) : (
                <p className="text-muted-foreground text-sm">No syllabus provided.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button variant="outline" size="sm" render={<Link href={`/courses/${id}/assignments`} />}>
              <ClipboardList className="h-4 w-4 mr-2" />
              View All Assignments
            </Button>
          </div>
        </TabsContent>

        {isTeacher && (
          <TabsContent value="lesson-plans" className="mt-4">
            <div className="flex justify-end mb-4">
              <Button variant="outline" size="sm" render={<Link href={`/courses/${id}/lesson-plans`} />}>
                <BookOpen className="h-4 w-4 mr-2" />
                View All Lesson Plans
              </Button>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
