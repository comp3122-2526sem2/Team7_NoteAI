"use client";

import { use, useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { lessonPlansApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Save, Sparkles, History, Download, Plus, Trash2, Pencil, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { Topic, TopicCreateData } from "@/lib/api";

const CodeMirrorEditor = dynamic(
  () => import("@/components/lesson-plan/code-mirror-editor").then((m) => m.CodeMirrorEditor),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin h-5 w-5" /></div> }
);

export default function LessonPlanEditorPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id: courseId, pid: planId } = use(params);
  const { token } = useAuthStore();
  const qc = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["lesson-plan", courseId, planId],
    queryFn: () => lessonPlansApi.get(courseId, planId).then((r) => r.data),
  });

  const { data: topics, refetch: refetchTopics } = useQuery({
    queryKey: ["topics", courseId, planId],
    queryFn: () => lessonPlansApi.listTopics(courseId, planId).then((r) => r.data),
    enabled: !!plan,
  });

  const { data: versions } = useQuery({
    queryKey: ["versions", courseId, planId],
    queryFn: () => lessonPlansApi.listVersions(courseId, planId).then((r) => r.data),
    enabled: !!plan,
  });

  const [content, setContent] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const streamedRef = useRef("");

  useEffect(() => {
    if (plan?.content && content === "") {
      setContent(plan.content ?? "");
    }
  }, [plan?.content, content]);

  const saveMutation = useMutation({
    mutationFn: () =>
      lessonPlansApi.update(courseId, planId, { content }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, planId] });
      qc.invalidateQueries({ queryKey: ["versions", courseId, planId] });
    },
    onError: () => toast.error("Failed to save"),
  });

  const aiGenerateMutation = useMutation({
    mutationFn: () =>
      lessonPlansApi.aiGenerate(courseId, planId, { prompt: aiPrompt }),
    onSuccess: (res) => {
      setContent(res.data.content ?? "");
      toast.success("AI generation complete");
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, planId] });
    },
    onError: () => toast.error("AI generation failed"),
  });

  const handleAiStream = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setStreaming(true);
    streamedRef.current = "";

    const url = lessonPlansApi.aiStreamUrl(courseId, planId);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      if (!res.body) throw new Error("No stream body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const text = line.slice(6);
            if (text === "[DONE]") break;
            streamedRef.current += text;
            setContent(streamedRef.current);
          }
        }
      }
      toast.success("Stream complete");
    } catch {
      toast.error("Streaming failed");
    } finally {
      setStreaming(false);
    }
  }, [aiPrompt, courseId, planId, token]);

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      lessonPlansApi.restoreVersion(courseId, planId, versionId),
    onSuccess: (res) => {
      setContent(res.data.content ?? "");
      toast.success("Version restored");
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, planId] });
    },
    onError: () => toast.error("Failed to restore"),
  });

  const handleExportPdf = useCallback(async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: html2canvas } = await import("html2canvas");
    const { marked } = await import("marked");

    const html = await marked(content);
    const el = document.createElement("div");
    el.style.cssText = "padding:40px;width:794px;font-family:sans-serif;background:#fff;";
    el.innerHTML = html;
    document.body.appendChild(el);

    const canvas = await html2canvas(el, { scale: 2 });
    document.body.removeChild(el);

    const pdf = new jsPDF({ unit: "px", format: "a4" });
    const imgData = canvas.toDataURL("image/png");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const ratio = pdfWidth / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, canvas.height * ratio);
    pdf.save(`${plan?.title ?? "lesson-plan"}.pdf`);
    toast.success("PDF exported");
  }, [content, plan?.title]);

  if (isLoading) return <LoadingSpinner />;
  if (!plan) return <div>Lesson plan not found.</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h1 className="text-lg font-bold flex-1 truncate">{plan.title}</h1>
        <StatusBadge status={plan.status} />
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1" />
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleExportPdf}>
          <Download className="h-4 w-4 mr-1" />
          PDF
        </Button>

        {/* AI Panel */}
        <Dialog>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>
            <Sparkles className="h-4 w-4 mr-1" />
            AI Generate
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>AI Generate Content</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Textarea
                placeholder="Describe what you want to generate…"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => aiGenerateMutation.mutate()}
                  disabled={aiGenerateMutation.isPending || streaming || !aiPrompt}
                >
                  {aiGenerateMutation.isPending ? "Generating…" : "Generate"}
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={handleAiStream}
                  disabled={streaming || aiGenerateMutation.isPending || !aiPrompt}
                >
                  {streaming ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Streaming…</>
                  ) : (
                    "Stream"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Topics Panel */}
        <Sheet>
          <SheetTrigger render={<Button size="sm" variant="outline" />}>Topics</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Topics</SheetTitle>
            </SheetHeader>
            <TopicsPanel
              courseId={courseId}
              planId={planId}
              topics={topics ?? []}
              onRefresh={() => refetchTopics()}
            />
          </SheetContent>
        </Sheet>

        {/* Version History */}
        <Sheet>
          <SheetTrigger render={<Button size="sm" variant="outline" />}>
            <History className="h-4 w-4 mr-1" />
            History
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Version History</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-full mt-4">
              {!versions?.length ? (
                <p className="text-sm text-muted-foreground">No versions yet.</p>
              ) : (
                <div className="space-y-3">
                  {versions.map((v) => (
                    <div key={v.id} className="border rounded-md p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()}
                      </p>
                      <p className="text-xs line-clamp-2 text-muted-foreground">
                        {v.snapshot_content.slice(0, 120)}…
                      </p>
                      <ConfirmDialog
                        title="Restore this version?"
                        description="Current content will be saved as a new version before restoring."
                        onConfirm={() => restoreMutation.mutate(v.id)}
                        destructive={false}
                      >
                        <Button size="sm" variant="outline" className="w-full">Restore</Button>
                      </ConfirmDialog>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>

      {/* Split pane */}
      <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
        {/* Left — Preview */}
        <div className="border rounded-md overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 border-b text-xs font-medium text-muted-foreground bg-muted/40">
            Preview
          </div>
          <ScrollArea className="flex-1 p-4">
            {content ? (
              <MarkdownRenderer content={content} cssStyle={plan.css_style ?? undefined} />
            ) : (
              <p className="text-muted-foreground text-sm">Start writing in the editor…</p>
            )}
          </ScrollArea>
        </div>

        {/* Right — Editor */}
        <div className="border rounded-md overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 border-b text-xs font-medium text-muted-foreground bg-muted/40">
            Editor
          </div>
          <div className="flex-1 min-h-0">
            <CodeMirrorEditor value={content} onChange={setContent} className="h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TopicsPanel({
  courseId,
  planId,
  topics,
  onRefresh,
}: {
  courseId: string;
  planId: string;
  topics: Topic[];
  onRefresh: () => void;
}) {
  const [form, setForm] = useState<TopicCreateData>({ topic: "", teaching_method: "", teaching_content: "" });
  const [editId, setEditId] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: () => lessonPlansApi.addTopic(courseId, planId, form),
    onSuccess: () => { onRefresh(); setForm({ topic: "", teaching_method: "", teaching_content: "" }); toast.success("Topic added"); },
    onError: () => toast.error("Failed to add topic"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TopicCreateData> }) =>
      lessonPlansApi.updateTopic(courseId, planId, id, data),
    onSuccess: () => { onRefresh(); setEditId(null); toast.success("Topic updated"); },
    onError: () => toast.error("Failed to update topic"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lessonPlansApi.deleteTopic(courseId, planId, id),
    onSuccess: () => { onRefresh(); toast.success("Topic deleted"); },
    onError: () => toast.error("Failed to delete"),
  });

  return (
    <ScrollArea className="h-full mt-4">
      <div className="space-y-4">
        {topics.map((t) =>
          editId === t.id ? (
            <div key={t.id} className="border rounded-md p-3 space-y-2">
              <Input
                value={form.topic}
                onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))}
                placeholder="Topic"
              />
              <Input
                value={form.teaching_method ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, teaching_method: e.target.value }))}
                placeholder="Teaching method"
              />
              <Textarea
                value={form.teaching_content ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, teaching_content: e.target.value }))}
                placeholder="Teaching content"
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => updateMutation.mutate({ id: t.id, data: form })}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div key={t.id} className="border rounded-md p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{t.topic}</p>
                  {t.teaching_method && <p className="text-xs text-muted-foreground">{t.teaching_method}</p>}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => { setEditId(t.id); setForm({ topic: t.topic, teaching_method: t.teaching_method ?? "", teaching_content: t.teaching_content ?? "" }); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <ConfirmDialog title="Delete topic?" onConfirm={() => deleteMutation.mutate(t.id)}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </ConfirmDialog>
                </div>
              </div>
            </div>
          )
        )}

        <Separator />
        <div className="space-y-2">
          <Label className="text-xs">Add Topic</Label>
          <Input value={form.topic} onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))} placeholder="Topic name" />
          <Input value={form.teaching_method ?? ""} onChange={(e) => setForm((p) => ({ ...p, teaching_method: e.target.value }))} placeholder="Teaching method" />
          <Textarea value={form.teaching_content ?? ""} onChange={(e) => setForm((p) => ({ ...p, teaching_content: e.target.value }))} placeholder="Teaching content" rows={2} />
          <Button size="sm" className="w-full" onClick={() => addMutation.mutate()} disabled={!form.topic || addMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}
