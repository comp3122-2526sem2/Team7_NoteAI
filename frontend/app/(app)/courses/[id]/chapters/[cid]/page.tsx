"use client";

import { use, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  App, Button, Card, Col, DatePicker, Divider, Empty, Form, Input,
  InputNumber, List, Modal, Row, Select, Space, Table, Tag, Typography, Upload,
} from "antd";
import {
  PlusOutlined, ThunderboltOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined,
  FileOutlined, UploadOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import { assignmentsApi, chaptersApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/lib/auth-store";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { MarkdownInput } from "@/components/shared/markdown-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Assignment, AssignmentCreateData, Document } from "@/lib/api";

const { Title, Text, Paragraph } = Typography;

const TYPES = ["quiz", "homework", "project", "exam"] as const;

export default function ChapterDetailPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id: courseId, cid: chapterId } = use(params);
  const { isTeacher } = useAuth();
  const { token } = useAuthStore();
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [streaming, setStreaming] = useState(false);
  const streamedRef = useRef("");

  const { data: chapter, isLoading: chapterLoading } = useQuery({
    queryKey: ["chapter", courseId, chapterId],
    queryFn: () => chaptersApi.get(courseId, chapterId).then((r) => r.data),
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["assignments", courseId, { chapterId }],
    queryFn: () =>
      assignmentsApi
        .list(courseId)
        .then((r) => r.data.filter((a) => a.chapter_id === chapterId)),
  });

  const { data: aiComment, refetch: refetchAIComment } = useQuery({
    queryKey: ["chapter-ai-comment", courseId, chapterId],
    queryFn: () => chaptersApi.getAIComment(courseId, chapterId).then((r) => r.data),
    enabled: !isTeacher,
  });

  const [streamedComment, setStreamedComment] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: documents, refetch: refetchDocs } = useQuery({
    queryKey: ["chapter-documents", courseId, chapterId],
    queryFn: () => chaptersApi.listDocuments(courseId, chapterId).then((r) => r.data),
    enabled: isTeacher,
  });

  const generateMutation = useMutation({
    mutationFn: () => chaptersApi.generateAIComment(courseId, chapterId),
    onSuccess: () => {
      message.success("AI comment generated");
      refetchAIComment();
    },
    onError: () => message.error("Failed to generate AI comment"),
  });

  const handleStreamAI = useCallback(async () => {
    setStreaming(true);
    streamedRef.current = "";
    setStreamedComment("");
    const url = chaptersApi.aiCommentStreamUrl(courseId, chapterId);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
            setStreamedComment(streamedRef.current);
          }
        }
      }
      message.success("AI comment updated");
      refetchAIComment();
    } catch {
      message.error("Streaming failed");
    } finally {
      setStreaming(false);
    }
  }, [courseId, chapterId, token, refetchAIComment]);

  const createMutation = useMutation({
    mutationFn: (values: AssignmentCreateData & { due_date_picker?: dayjs.Dayjs }) => {
      const { due_date_picker, ...rest } = values;
      return assignmentsApi.create(courseId, {
        ...rest,
        due_date: due_date_picker?.toISOString(),
        chapter_id: chapterId,
      });
    },
    onSuccess: () => {
      message.success("Assignment created");
      qc.invalidateQueries({ queryKey: ["assignments", courseId, { chapterId }] });
      setCreateOpen(false);
      form.resetFields();
    },
    onError: () => message.error("Failed to create assignment"),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => chaptersApi.deleteDocument(courseId, chapterId, docId),
    onSuccess: () => {
      message.success("Document removed");
      refetchDocs();
    },
    onError: () => message.error("Failed to remove document"),
  });

  const handleUpload = async (file: UploadFile) => {
    setUploadingFile(true);
    const formData = new FormData();
    formData.append("file", file as unknown as Blob);
    try {
      await chaptersApi.uploadDocument(courseId, chapterId, formData);
      message.success(`${file.name} uploaded and embedded`);
      refetchDocs();
    } catch {
      message.error(`Failed to upload ${file.name}`);
    } finally {
      setUploadingFile(false);
    }
    return false; // prevent default antd upload behaviour
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assignmentsApi.delete(courseId, id),
    onSuccess: () => {
      message.success("Assignment deleted");
      qc.invalidateQueries({ queryKey: ["assignments", courseId, { chapterId }] });
    },
    onError: () => message.error("Failed to delete"),
  });

  if (chapterLoading) return <LoadingSpinner />;
  if (!chapter) return <div>Chapter not found.</div>;

  const displayedComment = streamedComment ?? aiComment?.comment;

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: Assignment) => (
        <Link href={`/courses/${courseId}/assignments/${record.id}`}>
          <Button type="link" style={{ padding: 0 }}>{name}</Button>
        </Link>
      ),
    },
    {
      title: "Type",
      dataIndex: "assignment_type",
      key: "type",
      render: (t: string) => <Tag color="blue" style={{ textTransform: "capitalize" }}>{t}</Tag>,
    },
    {
      title: "Due",
      dataIndex: "due_date",
      key: "due",
      render: (d?: string) => d ? new Date(d).toLocaleDateString() : "—",
    },
    {
      title: "Max Score",
      dataIndex: "max_score",
      key: "score",
      render: (s?: number) => s ?? "—",
    },
    ...(isTeacher
      ? [
          {
            title: "",
            key: "actions",
            width: 60,
            render: (_: unknown, record: Assignment) => (
              <ConfirmDialog title="Delete this assignment?" onConfirm={() => deleteMutation.mutate(record.id)}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </ConfirmDialog>
            ),
          },
        ]
      : [
          {
            title: "",
            key: "view",
            width: 60,
            render: (_: unknown, record: Assignment) => (
              <Link href={`/courses/${courseId}/assignments/${record.id}`}>
                <Button type="text" size="small" icon={<EyeOutlined />} />
              </Link>
            ),
          },
        ]),
  ];

  return (
    <div>
      {/* Chapter header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>{chapter.title}</Title>
        {chapter.description && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {chapter.description}
          </Paragraph>
        )}
      </div>

      <Row gutter={[24, 24]}>
        {/* Assignments column */}
        <Col xs={24} lg={!isTeacher ? 14 : 24}>
          <Card
            title={`Assignments (${assignments?.length ?? 0})`}
            extra={
              isTeacher && (
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateOpen(true)}
                >
                  Add
                </Button>
              )
            }
          >
            {assignmentsLoading ? (
              <LoadingSpinner />
            ) : !assignments?.length ? (
              <Empty description="No assignments in this chapter yet." />
            ) : (
              <Table
                dataSource={assignments}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="small"
              />
            )}
          </Card>
        </Col>

        {/* AI Comment column – students only */}
        {!isTeacher && (
          <Col xs={24} lg={10}>
            <Card
              title={
                <Space>
                  <ThunderboltOutlined style={{ color: "#1677ff" }} />
                  <span>AI Study Comment</span>
                </Space>
              }
              extra={
                <Space>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={generateMutation.isPending}
                    onClick={() => generateMutation.mutate()}
                  >
                    Refresh
                  </Button>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={streaming}
                    onClick={handleStreamAI}
                  >
                    Stream
                  </Button>
                </Space>
              }
            >
              {displayedComment ? (
                <MarkdownRenderer content={displayedComment} />
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <Text type="secondary">No AI comment yet.</Text>
                  <br />
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    style={{ marginTop: 12 }}
                    loading={generateMutation.isPending}
                    onClick={() => generateMutation.mutate()}
                  >
                    Generate
                  </Button>
                </div>
              )}
              {aiComment && (
                <>
                  <Divider style={{ margin: "12px 0" }} />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Last updated {new Date(aiComment.updated_at).toLocaleString()}
                  </Text>
                </>
              )}
            </Card>
          </Col>
        )}
      </Row>

      {/* Documents section – teachers only */}
      {isTeacher && (
        <Card
          title={
            <Space>
              <FileOutlined />
              <span>Chapter Documents</span>
              <Tag color="blue">{documents?.length ?? 0}</Tag>
            </Space>
          }
          extra={
            <Upload
              accept=".pdf,.docx,.doc,.txt,.md"
              showUploadList={false}
              beforeUpload={(file) => { handleUpload(file as unknown as UploadFile); return false; }}
            >
              <Button icon={<UploadOutlined />} loading={uploadingFile} size="small">
                Upload
              </Button>
            </Upload>
          }
          style={{ marginTop: 24 }}
        >
          {!documents?.length ? (
            <Empty
              description="No documents uploaded yet. Upload files to embed them into this chapter's AI workspace."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <List
              dataSource={documents}
              size="small"
              renderItem={(doc: Document) => (
                <List.Item
                  actions={[
                    <Tag
                      key="status"
                      color={
                        doc.conversion_status === "completed"
                          ? "green"
                          : doc.conversion_status === "failed"
                          ? "red"
                          : "orange"
                      }
                    >
                      {doc.conversion_status}
                    </Tag>,
                    <Button
                      key="del"
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => deleteDocMutation.mutate(doc.id)}
                      loading={deleteDocMutation.isPending}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<FileOutlined style={{ fontSize: 18, color: "#1677ff" }} />}
                    title={doc.original_filename}
                    description={
                      <Space size={4}>
                        <Tag>{doc.original_file_type.toUpperCase()}</Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {new Date(doc.created_at).toLocaleDateString()}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      )}

      {/* Create Assignment Modal */}
      <Modal
        title="Add Assignment"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <MarkdownInput placeholder="Describe the assignment…" minHeight={120} />
          </Form.Item>
          <Space style={{ width: "100%" }} align="start">
            <Form.Item name="assignment_type" label="Type" initialValue="homework" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={TYPES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="max_score" label="Max Score">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Space style={{ width: "100%" }} align="start">
            <Form.Item name="topic" label="Topic">
              <Input style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="due_date_picker" label="Due Date">
              <DatePicker style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={createMutation.isPending}>
              Create
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
