"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";

export default function CourseSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isTeacher } = useAuth();
  const qc = useQueryClient();

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: () => coursesApi.get(id).then((r) => r.data),
  });

  const { data: students } = useQuery({
    queryKey: ["course-students", id],
    queryFn: () => coursesApi.listStudents(id).then((r) => r.data),
    enabled: isTeacher,
  });

  const [editForm, setEditForm] = useState<{ name: string; description: string; syllabus: string } | null>(null);
  const [newStudentId, setNewStudentId] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => coursesApi.update(id, editForm!),
    onSuccess: () => {
      toast.success("Course updated");
      qc.invalidateQueries({ queryKey: ["course", id] });
      setEditForm(null);
    },
    onError: () => toast.error("Failed to update"),
  });

  const enrollMutation = useMutation({
    mutationFn: () => coursesApi.enrollStudent(id, newStudentId),
    onSuccess: () => {
      toast.success("Student enrolled");
      qc.invalidateQueries({ queryKey: ["course-students", id] });
      setNewStudentId("");
    },
    onError: () => toast.error("Failed to enroll student"),
  });

  const unenrollMutation = useMutation({
    mutationFn: (studentId: string) => coursesApi.unenrollStudent(id, studentId),
    onSuccess: () => {
      toast.success("Student removed");
      qc.invalidateQueries({ queryKey: ["course-students", id] });
    },
    onError: () => toast.error("Failed to remove student"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!course) return <div>Course not found.</div>;
  if (!isTeacher) return <div>Access denied.</div>;

  const form = editForm ?? { name: course.name, description: course.description ?? "", syllabus: course.syllabus ?? "" };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Course Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setEditForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setEditForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Syllabus (Markdown)</Label>
            <Textarea
              value={form.syllabus}
              onChange={(e) => setEditForm({ ...form, syllabus: e.target.value })}
              rows={5}
            />
          </div>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Students</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Student user ID"
              value={newStudentId}
              onChange={(e) => setNewStudentId(e.target.value)}
            />
            <Button
              onClick={() => enrollMutation.mutate()}
              disabled={!newStudentId || enrollMutation.isPending}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Enroll
            </Button>
          </div>
          {students?.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="font-medium text-sm">{s.nickname}</p>
                <p className="text-xs text-muted-foreground">@{s.username}</p>
              </div>
              <ConfirmDialog
                title="Remove student?"
                description={`Remove ${s.nickname} from this course?`}
                onConfirm={() => unenrollMutation.mutate(s.id)}
              >
                <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </ConfirmDialog>
            </div>
          ))}
          {!students?.length && (
            <p className="text-sm text-muted-foreground">No students enrolled.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
