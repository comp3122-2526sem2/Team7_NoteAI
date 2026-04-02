"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button, Card, Col, Empty, Form, Input, Modal, Row, Typography, message } from "antd";
import { PlusOutlined, BookOutlined } from "@ant-design/icons";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function CoursesPage() {
  const { isTeacher } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => coursesApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; syllabus?: string }) =>
      coursesApi.create(values),
    onSuccess: () => {
      message.success("Course created");
      qc.invalidateQueries({ queryKey: ["courses"] });
      setOpen(false);
      form.resetFields();
    },
    onError: () => message.error("Failed to create course"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Courses</Title>
          <Text type="secondary">Your enrolled or assigned courses</Text>
        </div>
        {isTeacher && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New Course
          </Button>
        )}
      </div>

      {!courses?.length ? (
        <Empty description="No courses yet" />
      ) : (
        <Row gutter={[16, 16]}>
          {courses.map((course) => (
            <Col key={course.id} xs={24} sm={12} lg={8}>
              <Card
                hoverable
                actions={[
                  <Link key="view" href={`/courses/${course.id}`}>
                    <Button type="link" size="small">View Course</Button>
                  </Link>,
                ]}
              >
                <Card.Meta
                  avatar={<BookOutlined style={{ fontSize: 24, color: "#1677ff" }} />}
                  title={course.name}
                  description={
                    <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ margin: 0 }}>
                      {course.description ?? "No description"}
                    </Paragraph>
                  }
                />
                <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: "block" }}>
                  Created {new Date(course.created_at).toLocaleDateString()}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="Create Course"
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="syllabus" label="Syllabus (Markdown)">
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={createMutation.isPending}>
              Create Course
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
