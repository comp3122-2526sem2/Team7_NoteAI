"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { lessonPlansApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function LessonPlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const { isTeacher } = useAuth();
  const qc = useQueryClient();

  const { data: plans, isLoading } = useQuery({
    queryKey: ["lesson-plans", courseId],
    queryFn: () => lessonPlansApi.list(courseId).then((r) => r.data),
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const createMutation = useMutation({
    mutationFn: () => lessonPlansApi.create(courseId, { title }),
    onSuccess: () => {
      toast.success("Lesson plan created");
      qc.invalidateQueries({ queryKey: ["lesson-plans", courseId] });
      setOpen(false);
      setTitle("");
    },
    onError: () => toast.error("Failed to create"),
  });

  const deleteMutation = useMutation({
    mutationFn: (planId: string) => lessonPlansApi.delete(courseId, planId),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["lesson-plans", courseId] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lesson Plans</h1>
        {isTeacher && (
          <>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Plan
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Lesson Plan</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!title || createMutation.isPending}>
                  {createMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </>
        )}
      </div>

      {!plans?.length ? (
        <div className="text-center py-20 text-muted-foreground">No lesson plans yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{plan.title}</CardTitle>
                  <StatusBadge status={plan.status} />
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Updated {new Date(plan.updated_at).toLocaleDateString()}
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" render={<Link href={`/courses/${courseId}/lesson-plans/${plan.id}`} />}>
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                {isTeacher && (
                  <ConfirmDialog
                    title="Delete lesson plan?"
                    onConfirm={() => deleteMutation.mutate(plan.id)}
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </ConfirmDialog>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
