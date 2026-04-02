"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, BookOpen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export default function CoursesPage() {
  const { isTeacher } = useAuth();
  const qc = useQueryClient();

  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => coursesApi.list().then((r) => r.data),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", syllabus: "" });

  const createMutation = useMutation({
    mutationFn: () => coursesApi.create(form),
    onSuccess: () => {
      toast.success("Course created");
      qc.invalidateQueries({ queryKey: ["courses"] });
      setOpen(false);
      setForm({ name: "", description: "", syllabus: "" });
    },
    onError: () => toast.error("Failed to create course"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Courses</h1>
          <p className="text-muted-foreground text-sm">Your enrolled or assigned courses</p>
        </div>
        {isTeacher && (
          <>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Course
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Course</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Syllabus (Markdown)</Label>
                  <Textarea value={form.syllabus} onChange={(e) => setForm((p) => ({ ...p, syllabus: e.target.value }))} rows={4} />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={!form.name || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating…" : "Create Course"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </>
        )}
      </div>

      {!courses?.length ? (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">No courses yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <Card key={course.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{course.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {course.description ?? "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Created {new Date(course.created_at).toLocaleDateString()}
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm" className="w-full" render={<Link href={`/courses/${course.id}`} />}>
                  View Course
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
