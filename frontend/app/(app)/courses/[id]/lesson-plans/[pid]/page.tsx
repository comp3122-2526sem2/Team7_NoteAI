"use client";

import { use, useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  App, Button, Drawer, Form, Input, Modal, Space, Spin, Table,
  Typography,
} from "antd";
import {
  SaveOutlined, ThunderboltOutlined, HistoryOutlined, DownloadOutlined,
  PlusOutlined, DeleteOutlined, EditOutlined, LoadingOutlined,
} from "@ant-design/icons";
import { lessonPlansApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Topic, TopicCreateData } from "@/lib/api";

const { Title, Text } = Typography;
const { TextArea } = Input;

const CodeMirrorEditor = dynamic(
  () => import("@/components/lesson-plan/code-mirror-editor").then((m) => m.CodeMirrorEditor),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
        <Spin indicator={<LoadingOutlined />} />
      </div>
    ),
  }
);

export default function LessonPlanEditorPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id: courseId, pid: planId } = use(params);
  const { token } = useAuthStore();
  const { message } = App.useApp();
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
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const streamedRef = useRef("");

  useEffect(() => {
    if (plan?.content && content === "") {
      setContent(plan.content ?? "");
    }
  }, [plan?.content, content]);

  const saveMutation = useMutation({
    mutationFn: () => lessonPlansApi.update(courseId, planId, { content }),
    onSuccess: () => {
      message.success("Saved");
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, planId] });
      qc.invalidateQueries({ queryKey: ["versions", courseId, planId] });
    },
    onError: () => message.error("Failed to save"),
  });

  const aiGenerateMutation = useMutation({
    mutationFn: () => lessonPlansApi.aiGenerate(courseId, planId, { prompt: aiPrompt }),
    onSuccess: (res) => {
      setContent(res.data.content ?? "");
      message.success("AI generation complete");
      setAiModalOpen(false);
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, planId] });
    },
    onError: () => message.error("AI generation failed"),
  });

  const handleAiStream = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setStreaming(true);
    streamedRef.current = "";
    const url = lessonPlansApi.aiStreamUrl(courseId, planId);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            const text = line.slice(6);
            if (text === "[DONE]") break;
            streamedRef.current += text;
            setContent(streamedRef.current);
          }
        }
      }
      message.success("Stream complete");
      setAiModalOpen(false);
    } catch {
      message.error("Streaming failed");
    } finally {
      setStreaming(false);
    }
  }, [aiPrompt, courseId, planId, token]);

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => lessonPlansApi.restoreVersion(courseId, planId, versionId),
    onSuccess: (res) => {
      setContent(res.data.content ?? "");
      message.success("Version restored");
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, planId] });
    },
    onError: () => message.error("Failed to restore"),
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
    message.success("PDF exported");
  }, [content, plan?.title]);

  if (isLoading) return <LoadingSpinner />;
  if (!plan) return <div>Lesson plan not found.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 104px)" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Title level={4} style={{ margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {plan.title}
        </Title>
        <StatusBadge status={plan.status} />
        <Button icon={<SaveOutlined />} type="primary" size="small" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
          Save
        </Button>
        <Button icon={<DownloadOutlined />} size="small" onClick={handleExportPdf}>PDF</Button>
        <Button icon={<ThunderboltOutlined />} size="small" onClick={() => setAiModalOpen(true)}>AI Generate</Button>
        <Button size="small" onClick={() => setTopicsOpen(true)}>Topics</Button>
        <Button icon={<HistoryOutlined />} size="small" onClick={() => setHistoryOpen(true)}>History</Button>
      </div>

      {/* Split pane */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        {/* Preview */}
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 12px", background: "#fafafa", borderBottom: "1px solid #f0f0f0", fontSize: 12, color: "#666" }}>
            Preview
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {content ? (
              <MarkdownRenderer content={content} cssStyle={plan.css_style ?? undefined} />
            ) : (
              <Text type="secondary">Start writing in the editor…</Text>
            )}
          </div>
        </div>

        {/* Editor */}
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 12px", background: "#fafafa", borderBottom: "1px solid #f0f0f0", fontSize: 12, color: "#666" }}>
            Editor
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeMirrorEditor value={content} onChange={setContent} className="h-full" />
          </div>
        </div>
      </div>

      {/* AI Modal */}
      <Modal
        title="AI Generate Content"
        open={aiModalOpen}
        onCancel={() => setAiModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <TextArea
            placeholder="Describe what you want to generate…"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={4}
            style={{ marginBottom: 12 }}
          />
          <Space style={{ width: "100%" }}>
            <Button
              type="primary"
              block
              onClick={() => aiGenerateMutation.mutate()}
              loading={aiGenerateMutation.isPending}
              disabled={streaming || !aiPrompt}
            >
              Generate
            </Button>
            <Button
              block
              onClick={handleAiStream}
              loading={streaming}
              disabled={aiGenerateMutation.isPending || !aiPrompt}
            >
              Stream
            </Button>
          </Space>
        </div>
      </Modal>

      {/* Topics Drawer */}
      <Drawer title="Topics" open={topicsOpen} onClose={() => setTopicsOpen(false)} width={400}>
        <TopicsPanel
          courseId={courseId}
          planId={planId}
          topics={topics ?? []}
          onRefresh={() => refetchTopics()}
        />
      </Drawer>

      {/* Version History Drawer */}
      <Drawer title="Version History" open={historyOpen} onClose={() => setHistoryOpen(false)} width={400}>
        {!versions?.length ? (
          <Text type="secondary">No versions yet.</Text>
        ) : (
          versions.map((v) => (
            <div key={v.id} style={{ border: "1px solid #f0f0f0", borderRadius: 6, padding: 12, marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{new Date(v.created_at).toLocaleString()}</Text>
              <p style={{ margin: "6px 0", fontSize: 12, color: "#666", overflow: "hidden", maxHeight: 48 }}>
                {v.snapshot_content.slice(0, 120)}…
              </p>
              <ConfirmDialog
                title="Restore this version?"
                description="Current content will be saved before restoring."
                onConfirm={() => restoreMutation.mutate(v.id)}
              >
                <Button size="small" block>Restore</Button>
              </ConfirmDialog>
            </div>
          ))
        )}
      </Drawer>
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
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editId, setEditId] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: (values: TopicCreateData) => lessonPlansApi.addTopic(courseId, planId, values),
    onSuccess: () => { onRefresh(); form.resetFields(); message.success("Topic added"); },
    onError: () => message.error("Failed to add topic"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TopicCreateData> }) =>
      lessonPlansApi.updateTopic(courseId, planId, id, data),
    onSuccess: () => { onRefresh(); setEditId(null); message.success("Topic updated"); },
    onError: () => message.error("Failed to update topic"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lessonPlansApi.deleteTopic(courseId, planId, id),
    onSuccess: () => { onRefresh(); message.success("Topic deleted"); },
    onError: () => message.error("Failed to delete"),
  });

  const topicColumns = [
    {
      title: "Topic",
      key: "topic",
      render: (_: unknown, t: Topic) =>
        editId === t.id ? (
          <Form form={editForm} layout="vertical" onFinish={(v) => updateMutation.mutate({ id: t.id, data: v })} size="small">
            <Form.Item name="topic" initialValue={t.topic} style={{ marginBottom: 4 }}>
              <Input placeholder="Topic" />
            </Form.Item>
            <Form.Item name="teaching_method" initialValue={t.teaching_method} style={{ marginBottom: 4 }}>
              <Input placeholder="Method" />
            </Form.Item>
            <Form.Item name="teaching_content" initialValue={t.teaching_content} style={{ marginBottom: 4 }}>
              <TextArea rows={2} placeholder="Content" />
            </Form.Item>
            <Space>
              <Button htmlType="submit" type="primary" size="small" loading={updateMutation.isPending}>Save</Button>
              <Button size="small" onClick={() => setEditId(null)}>Cancel</Button>
            </Space>
          </Form>
        ) : (
          <div>
            <Text strong style={{ fontSize: 13 }}>{t.topic}</Text>
            {t.teaching_method && <div style={{ fontSize: 12, color: "#666" }}>{t.teaching_method}</div>}
          </div>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 70,
      render: (_: unknown, t: Topic) =>
        editId !== t.id ? (
          <Space>
            <Button type="text" icon={<EditOutlined />} size="small" onClick={() => setEditId(t.id)} />
            <ConfirmDialog title="Delete topic?" onConfirm={() => deleteMutation.mutate(t.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
            </ConfirmDialog>
          </Space>
        ) : null,
    },
  ];

  return (
    <div>
      <Table
        dataSource={topics}
        columns={topicColumns}
        rowKey="id"
        size="small"
        pagination={false}
        style={{ marginBottom: 16 }}
        locale={{ emptyText: "No topics yet." }}
      />
      <Text strong style={{ display: "block", marginBottom: 8 }}>Add Topic</Text>
      <Form form={form} layout="vertical" onFinish={(v) => addMutation.mutate(v)} size="small">
        <Form.Item name="topic" rules={[{ required: true }]} style={{ marginBottom: 6 }}>
          <Input placeholder="Topic name" />
        </Form.Item>
        <Form.Item name="teaching_method" style={{ marginBottom: 6 }}>
          <Input placeholder="Teaching method" />
        </Form.Item>
        <Form.Item name="teaching_content" style={{ marginBottom: 6 }}>
          <TextArea rows={2} placeholder="Teaching content" />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block loading={addMutation.isPending}>
          Add Topic
        </Button>
      </Form>
    </div>
  );
}
