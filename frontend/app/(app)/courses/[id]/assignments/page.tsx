"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Button, DatePicker, Form, Input, InputNumber, Modal, Select,
  Space, Table, Typography, message,
} from "antd";
import { PlusOutlined, EyeOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { assignmentsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Assignment, AssignmentCreateData } from "@/lib/api";

const { Title } = Typography;
const { TextArea } = Input;

const TYPES = ["quiz", "homework", "project", "exam"] as const;

export default function AssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const { isTeacher } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["assignments", courseId],
    queryFn: () => assignmentsApi.list(courseId).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: AssignmentCreateData & { due_date_picker?: dayjs.Dayjs }) => {
      const { due_date_picker, ...rest } = values;
      return assignmentsApi.create(courseId, {
        ...rest,
        due_date: due_date_picker?.toISOString(),
      });
    },
    onSuccess: () => {
      message.success("Assignment created");
      qc.invalidateQueries({ queryKey: ["assignments", courseId] });
      setOpen(false);
      form.resetFields();
    },
    onError: () => message.error("Failed to create assignment"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assignmentsApi.delete(courseId, id),
    onSuccess: () => {
      message.success("Deleted");
      qc.invalidateQueries({ queryKey: ["assignments", courseId] });
    },
    onError: () => message.error("Failed to delete"),
  });

  if (isLoading) return <LoadingSpinner />;

  const columns = [
    { title: "Name", dataIndex: "name", key: "name" },
    {
      title: "Type",
      dataIndex: "assignment_type",
      key: "type",
      render: (v: string) => <StatusBadge status={v as "quiz"} />,
    },
    { title: "Topic", dataIndex: "topic", key: "topic", render: (v: string) => v ?? "—" },
    {
      title: "Due Date",
      dataIndex: "due_date",
      key: "due_date",
      render: (v: string) => (v ? new Date(v).toLocaleDateString() : "—"),
    },
    {
      title: "Max Score",
      dataIndex: "max_score",
      key: "max_score",
      render: (v: number) => v ?? "—",
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_: unknown, record: Assignment) => (
        <Space>
          <Link href={`/courses/${courseId}/assignments/${record.id}`}>
            <Button type="text" icon={<EyeOutlined />} size="small" />
          </Link>
          {isTeacher && (
            <ConfirmDialog
              title="Delete assignment?"
              onConfirm={() => deleteMutation.mutate(record.id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
            </ConfirmDialog>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Assignments</Title>
        {isTeacher && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New Assignment
          </Button>
        )}
      </div>

      <Table
        dataSource={assignments ?? []}
        columns={columns}
        rowKey="id"
        locale={{ emptyText: "No assignments yet." }}
      />

      <Modal
        title="Create Assignment"
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
