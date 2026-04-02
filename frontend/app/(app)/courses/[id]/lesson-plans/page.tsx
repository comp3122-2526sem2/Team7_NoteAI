"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { App, Button, Card, Col, Empty, Form, Input, Modal, Row, Space, Typography } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { lessonPlansApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const { Title, Text } = Typography;

export default function LessonPlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: plans, isLoading } = useQuery({
    queryKey: ["lesson-plans", courseId],
    queryFn: () => lessonPlansApi.list(courseId).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: { title: string }) =>
      lessonPlansApi.create(courseId, values),
    onSuccess: () => {
      message.success("Lesson plan created");
      qc.invalidateQueries({ queryKey: ["lesson-plans", courseId] });
      setOpen(false);
      form.resetFields();
    },
    onError: () => message.error("Failed to create"),
  });

  const deleteMutation = useMutation({
    mutationFn: (planId: string) => lessonPlansApi.delete(courseId, planId),
    onSuccess: () => {
      message.success("Deleted");
      qc.invalidateQueries({ queryKey: ["lesson-plans", courseId] });
    },
    onError: () => message.error("Failed to delete"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Lesson Plans</Title>
        {isTeacher && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New Plan
          </Button>
        )}
      </div>

      {!plans?.length ? (
        <Empty description="No lesson plans yet." />
      ) : (
        <Row gutter={[16, 16]}>
          {plans.map((plan) => (
            <Col key={plan.id} xs={24} sm={12} lg={8}>
              <Card
                hoverable
                actions={[
                  <Link key="edit" href={`/courses/${courseId}/lesson-plans/${plan.id}`}>
                    <Button type="link" icon={<EditOutlined />} size="small">Edit</Button>
                  </Link>,
                  isTeacher ? (
                    <ConfirmDialog
                      key="delete"
                      title="Delete lesson plan?"
                      onConfirm={() => deleteMutation.mutate(plan.id)}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                    </ConfirmDialog>
                  ) : <span key="empty" />,
                ]}
              >
                <Card.Meta
                  title={
                    <Space>
                      <span>{plan.title}</span>
                      <StatusBadge status={plan.status} />
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Updated {new Date(plan.updated_at).toLocaleDateString()}
                    </Text>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="Create Lesson Plan"
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)} style={{ marginTop: 16 }}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
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
