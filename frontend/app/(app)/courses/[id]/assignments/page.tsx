"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { assignmentsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import type { AssignmentCreateData } from "@/lib/api";

const TYPES = ["quiz", "homework", "project", "exam"] as const;

export default function AssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const { isTeacher } = useAuth();
  const qc = useQueryClient();

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["assignments", courseId],
    queryFn: () => assignmentsApi.list(courseId).then((r) => r.data),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssignmentCreateData>({
    name: "",
    description: "",
    assignment_type: "homework",
    topic: "",
    due_date: "",
    max_score: undefined,
  });

  const createMutation = useMutation({
    mutationFn: () => assignmentsApi.create(courseId, form),
    onSuccess: () => {
      toast.success("Assignment created");
      qc.invalidateQueries({ queryKey: ["assignments", courseId] });
      setOpen(false);
    },
    onError: () => toast.error("Failed to create assignment"),
  });

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) => assignmentsApi.delete(courseId, assignmentId),
    onSuccess: () => {
      toast.success("Assignment deleted");
      qc.invalidateQueries({ queryKey: ["assignments", courseId] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assignments</h1>
        {isTeacher && (
          <>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Assignment
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Assignment</DialogTitle>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.assignment_type} onValueChange={(v) => setForm((p) => ({ ...p, assignment_type: v as AssignmentCreateData["assignment_type"] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Score</Label>
                    <Input type="number" value={form.max_score ?? ""} onChange={(e) => setForm((p) => ({ ...p, max_score: e.target.value ? Number(e.target.value) : undefined }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Topic</Label>
                    <Input value={form.topic ?? ""} onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
                  </div>
                </div>
                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}>
                  {createMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </>
        )}
      </div>

      {!assignments?.length ? (
        <div className="text-center py-20 text-muted-foreground">No assignments yet.</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Max Score</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><StatusBadge status={a.assignment_type as "pending"} /></TableCell>
                  <TableCell className="text-muted-foreground">{a.topic ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.due_date ? new Date(a.due_date).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>{a.max_score ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" render={<Link href={`/courses/${courseId}/assignments/${a.id}`} />}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isTeacher && (
                        <ConfirmDialog
                          title="Delete assignment?"
                          onConfirm={() => deleteMutation.mutate(a.id)}
                        >
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </ConfirmDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
