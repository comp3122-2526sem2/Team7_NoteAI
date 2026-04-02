"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Divider, Form, Input, Space, Table, Typography } from "antd";
import { UserAddOutlined, DeleteOutlined } from "@ant-design/icons";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MarkdownInput } from "@/components/shared/markdown-input";
import type { User } from "@/lib/api";

const { Title } = Typography;

export default function CourseSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [newStudentId, setNewStudentId] = useState("");

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: () => coursesApi.get(id).then((r) => r.data),
  });

  const { data: students } = useQuery({
    queryKey: ["course-students", id],
    queryFn: () => coursesApi.listStudents(id).then((r) => r.data),
    enabled: isTeacher,
  });

  const updateMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; syllabus?: string }) =>
      coursesApi.update(id, values),
    onSuccess: () => {
      message.success("Course updated");
      qc.invalidateQueries({ queryKey: ["course", id] });
    },
    onError: () => message.error("Failed to update"),
  });

  const enrollMutation = useMutation({
    mutationFn: () => coursesApi.enrollStudent(id, newStudentId),
    onSuccess: () => {
      message.success("Student enrolled");
      qc.invalidateQueries({ queryKey: ["course-students", id] });
      setNewStudentId("");
    },
    onError: () => message.error("Failed to enroll student"),
  });

  const unenrollMutation = useMutation({
    mutationFn: (studentId: string) => coursesApi.unenrollStudent(id, studentId),
    onSuccess: () => {
      message.success("Student removed");
      qc.invalidateQueries({ queryKey: ["course-students", id] });
    },
    onError: () => message.error("Failed to remove student"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!course) return <div>Course not found.</div>;
  if (!isTeacher) return <div>Access denied.</div>;

  const studentColumns = [
    { title: "Name", dataIndex: "nickname", key: "nickname" },
    { title: "Username", dataIndex: "username", key: "username", render: (v: string) => `@${v}` },
    {
      title: "Action",
      key: "action",
      width: 80,
      render: (_: unknown, record: User) => (
        <ConfirmDialog
          title="Remove student?"
          description={`Remove ${record.nickname} from this course?`}
          onConfirm={() => unenrollMutation.mutate(record.id)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </ConfirmDialog>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>Course Settings</Title>

      <Card title="Details" style={{ marginBottom: 24 }}>
        {/*
          key={course.id} forces the Form (and MarkdownInput inside it) to
          fully re-mount with the loaded data as initialValues, so the editor
          receives the existing syllabus content correctly.
        */}
        <Form
          key={course.id}
          layout="vertical"
          initialValues={{
            name: course.name,
            description: course.description ?? "",
            syllabus: course.syllabus ?? "",
          }}
          onFinish={(v) => updateMutation.mutate(v)}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="syllabus" label="Syllabus">
            <MarkdownInput placeholder="Write the course syllabus…" minHeight={240} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
              Save Changes
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Divider />

      <Card title="Students">
        <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
          <Input
            placeholder="Student user ID"
            value={newStudentId}
            onChange={(e) => setNewStudentId(e.target.value)}
          />
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => enrollMutation.mutate()}
            loading={enrollMutation.isPending}
            disabled={!newStudentId}
          >
            Enroll
          </Button>
        </Space.Compact>
        <Table
          dataSource={students ?? []}
          columns={studentColumns}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: "No students enrolled." }}
        />
      </Card>
    </div>
  );
}
