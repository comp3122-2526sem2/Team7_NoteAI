"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  App, Button, Card, Col, Empty, Form, Input,
  Modal, Row, Typography,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, OrderedListOutlined } from "@ant-design/icons";
import { chaptersApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MarkdownInput } from "@/components/shared/markdown-input";

const { Title, Text, Paragraph } = Typography;

export default function ChaptersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editChapter, setEditChapter] = useState<{ id: string; title: string; description?: string } | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const { data: chapters, isLoading } = useQuery({
    queryKey: ["chapters", courseId],
    queryFn: () => chaptersApi.list(courseId).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: { title: string; description?: string }) =>
      chaptersApi.create(courseId, values),
    onSuccess: () => {
      message.success("Chapter created");
      qc.invalidateQueries({ queryKey: ["chapters", courseId] });
      setCreateOpen(false);
      form.resetFields();
    },
    onError: () => message.error("Failed to create chapter"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: { title?: string; description?: string } }) =>
      chaptersApi.update(courseId, id, values),
    onSuccess: () => {
      message.success("Chapter updated");
      qc.invalidateQueries({ queryKey: ["chapters", courseId] });
      setEditChapter(null);
    },
    onError: () => message.error("Failed to update chapter"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => chaptersApi.delete(courseId, id),
    onSuccess: () => {
      message.success("Chapter deleted");
      qc.invalidateQueries({ queryKey: ["chapters", courseId] });
    },
    onError: () => message.error("Failed to delete chapter"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Chapters</Title>
          <Text type="secondary">Course content organised by chapter</Text>
        </div>
        {isTeacher && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New Chapter
          </Button>
        )}
      </div>

      {!chapters?.length ? (
        <Empty description="No chapters yet." />
      ) : (
        <Row gutter={[16, 16]}>
          {chapters.map((chapter, idx) => (
            <Col key={chapter.id} xs={24} sm={12} lg={8}>
              <Card
                hoverable
                actions={[
                  <Link key="open" href={`/courses/${courseId}/chapters/${chapter.id}`}>
                    <Button type="text" size="small" icon={<OrderedListOutlined />}>Open</Button>
                  </Link>,
                  ...(isTeacher
                    ? [
                        <Button
                          key="edit"
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditChapter(chapter);
                            editForm.setFieldsValue({
                              title: chapter.title,
                              description: chapter.description,
                            });
                          }}
                        >
                          Edit
                        </Button>,
                        <ConfirmDialog
                          key="delete"
                          title="Delete this chapter?"
                          description="All assignments in this chapter will be unlinked."
                          onConfirm={() => deleteMutation.mutate(chapter.id)}
                        >
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                        </ConfirmDialog>,
                      ]
                    : []),
                ]}
              >
                <Card.Meta
                  avatar={
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "#1677ff", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: 16,
                    }}>
                      {idx + 1}
                    </div>
                  }
                  title={
                    <Link href={`/courses/${courseId}/chapters/${chapter.id}`} style={{ color: "inherit" }}>
                      {chapter.title}
                    </Link>
                  }
                  description={
                    chapter.description ? (
                      <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ margin: 0 }}>
                        {chapter.description}
                      </Paragraph>
                    ) : (
                      <Text type="secondary" style={{ fontStyle: "italic" }}>No description</Text>
                    )
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Create Modal */}
      <Modal
        title="New Chapter"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)} style={{ marginTop: 16 }}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input placeholder="Chapter title" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <MarkdownInput placeholder="Brief chapter description…" minHeight={100} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={createMutation.isPending}>
              Create
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="Edit Chapter"
        open={!!editChapter}
        onCancel={() => setEditChapter(null)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(v) => editChapter && updateMutation.mutate({ id: editChapter.id, values: v })}
          style={{ marginTop: 16 }}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <MarkdownInput placeholder="Brief chapter description…" minHeight={100} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={updateMutation.isPending}>
              Save
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
