"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { assignmentsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Submission } from "@/lib/api";

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; aid: string }>;
}) {
  const { id: courseId, aid: assignmentId } = use(params);
  const { isTeacher, user } = useAuth();
  const qc = useQueryClient();

  const { data: assignment, isLoading } = useQuery({
    queryKey: ["assignment", courseId, assignmentId],
    queryFn: () => assignmentsApi.get(courseId, assignmentId).then((r) => r.data),
  });

  const { data: submissions } = useQuery({
    queryKey: ["submissions", courseId, assignmentId],
    queryFn: () => assignmentsApi.listSubmissions(courseId, assignmentId).then((r) => r.data),
    enabled: !!assignment,
  });

  const [submitText, setSubmitText] = useState("");
  const [gradeData, setGradeData] = useState<Record<string, { score: string; feedback: string }>>({});

  const submitMutation = useMutation({
    mutationFn: () => assignmentsApi.submit(courseId, assignmentId, submitText),
    onSuccess: () => {
      toast.success("Assignment submitted");
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
      setSubmitText("");
    },
    onError: () => toast.error("Failed to submit"),
  });

  const gradeMutation = useMutation({
    mutationFn: ({ subId, score, feedback }: { subId: string; score: number; feedback: string }) =>
      assignmentsApi.grade(courseId, assignmentId, subId, {
        score,
        teacher_feedback: feedback,
      }),
    onSuccess: () => {
      toast.success("Graded");
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
    },
    onError: () => toast.error("Failed to grade"),
  });

  const aiFeedbackMutation = useMutation({
    mutationFn: (subId: string) =>
      assignmentsApi.generateAiFeedback(courseId, assignmentId, subId),
    onSuccess: () => {
      toast.success("AI feedback generated");
      qc.invalidateQueries({ queryKey: ["submissions", courseId, assignmentId] });
    },
    onError: () => toast.error("Failed to generate feedback"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!assignment) return <div>Assignment not found.</div>;

  const mySubmission = submissions?.find((s) => s.student_id === user?.id);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{assignment.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="capitalize">{assignment.assignment_type}</Badge>
            {assignment.topic && <Badge variant="secondary">{assignment.topic}</Badge>}
            {assignment.due_date && (
              <span className="text-xs text-muted-foreground">
                Due {new Date(assignment.due_date).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        {assignment.max_score && (
          <Badge variant="outline">Max: {assignment.max_score} pts</Badge>
        )}
      </div>

      {assignment.description && (
        <Card>
          <CardContent className="pt-4">
            <MarkdownRenderer content={assignment.description} />
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Student view */}
      {!isTeacher && (
        <div className="space-y-4">
          {!mySubmission ? (
            <Card>
              <CardHeader>
                <CardTitle>Submit Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Your answer or comments…"
                  value={submitText}
                  onChange={(e) => setSubmitText(e.target.value)}
                  rows={5}
                />
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? "Submitting…" : "Submit"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Your Submission</CardTitle>
                <StatusBadge status={mySubmission.submission_status} />
              </CardHeader>
              <CardContent className="space-y-4">
                {mySubmission.student_feedback && (
                  <div>
                    <p className="text-sm font-medium mb-1">Your answer</p>
                    <p className="text-sm text-muted-foreground">{mySubmission.student_feedback}</p>
                  </div>
                )}
                {mySubmission.score !== undefined && mySubmission.score !== null && (
                  <div>
                    <p className="text-sm font-medium">Score</p>
                    <p className="text-lg font-bold">
                      {mySubmission.score} / {assignment.max_score ?? "?"}
                    </p>
                  </div>
                )}
                {mySubmission.teacher_feedback && (
                  <div>
                    <p className="text-sm font-medium mb-1">Teacher Feedback</p>
                    <MarkdownRenderer content={mySubmission.teacher_feedback} />
                  </div>
                )}
                {mySubmission.ai_feedback && (
                  <div>
                    <p className="text-sm font-medium mb-1 flex items-center gap-1">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Feedback
                    </p>
                    <MarkdownRenderer content={mySubmission.ai_feedback} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Teacher view */}
      {isTeacher && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Submissions ({submissions?.length ?? 0})
          </h2>
          {!submissions?.length ? (
            <p className="text-muted-foreground text-sm">No submissions yet.</p>
          ) : (
            submissions.map((sub) => (
              <SubmissionCard
                key={sub.id}
                sub={sub}
                maxScore={assignment.max_score}
                gradeData={gradeData[sub.id] ?? { score: String(sub.score ?? ""), feedback: sub.teacher_feedback ?? "" }}
                onChange={(data) => setGradeData((p) => ({ ...p, [sub.id]: data }))}
                onGrade={() => {
                  const d = gradeData[sub.id];
                  gradeMutation.mutate({
                    subId: sub.id,
                    score: Number(d?.score ?? sub.score ?? 0),
                    feedback: d?.feedback ?? sub.teacher_feedback ?? "",
                  });
                }}
                onAiFeedback={() => aiFeedbackMutation.mutate(sub.id)}
                isGrading={gradeMutation.isPending}
                isGenerating={aiFeedbackMutation.isPending}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({
  sub,
  maxScore,
  gradeData,
  onChange,
  onGrade,
  onAiFeedback,
  isGrading,
  isGenerating,
}: {
  sub: Submission;
  maxScore?: number;
  gradeData: { score: string; feedback: string };
  onChange: (d: { score: string; feedback: string }) => void;
  onGrade: () => void;
  onAiFeedback: () => void;
  isGrading: boolean;
  isGenerating: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="text-sm text-muted-foreground">
          Submitted {sub.submission_date ? new Date(sub.submission_date).toLocaleString() : "—"}
        </div>
        <StatusBadge status={sub.submission_status} />
      </CardHeader>
      <CardContent className="space-y-4">
        {sub.student_feedback && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Student Answer</p>
            <p className="text-sm">{sub.student_feedback}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Score{maxScore ? ` / ${maxScore}` : ""}</Label>
            <Input
              type="number"
              value={gradeData.score}
              onChange={(e) => onChange({ ...gradeData, score: e.target.value })}
              className="h-8"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Teacher Feedback (Markdown)</Label>
          <Textarea
            value={gradeData.feedback}
            onChange={(e) => onChange({ ...gradeData, feedback: e.target.value })}
            rows={3}
          />
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={onGrade} disabled={isGrading}>
            {isGrading ? "Saving…" : "Save Grade"}
          </Button>
          <Button size="sm" variant="outline" onClick={onAiFeedback} disabled={isGenerating}>
            <Sparkles className="h-4 w-4 mr-1" />
            {isGenerating ? "Generating…" : "AI Feedback"}
          </Button>
        </div>

        {sub.ai_feedback && (
          <div className="border rounded-md p-3 bg-muted/40">
            <p className="text-xs font-medium flex items-center gap-1 mb-2">
              <Sparkles className="h-3 w-3 text-primary" /> AI Feedback
            </p>
            <MarkdownRenderer content={sub.ai_feedback} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
