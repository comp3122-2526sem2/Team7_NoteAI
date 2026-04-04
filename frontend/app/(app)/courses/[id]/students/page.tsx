"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  App,
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  LineChartOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { coursesApi, type User } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const { Title, Text } = Typography;

export default function StudentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: courseId } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [newStudentId, setNewStudentId] = useState("");
  const [search, setSearch] = useState("");

  const { data: students, isLoading } = useQuery({
    queryKey: ["course-students", courseId],
    queryFn: () => coursesApi.listStudents(courseId).then((r) => r.data),
  });

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => coursesApi.get(courseId).then((r) => r.data),
  });

  const enrollMutation = useMutation({
    mutationFn: () => coursesApi.enrollStudent(courseId, newStudentId.trim()),
    onSuccess: () => {
      message.success("Student enrolled successfully.");
      qc.invalidateQueries({ queryKey: ["course-students", courseId] });
      setNewStudentId("");
    },
    onError: () => message.error("Failed to enroll student. Check the user ID and try again."),
  });

  const unenrollMutation = useMutation({
    mutationFn: (studentId: string) =>
      coursesApi.unenrollStudent(courseId, studentId),
    onSuccess: () => {
      message.success("Student removed.");
      qc.invalidateQueries({ queryKey: ["course-students", courseId] });
    },
    onError: () => message.error("Failed to remove student."),
  });

  if (!isTeacher) return <div>Access denied.</div>;
  if (isLoading) return <LoadingSpinner />;

  const filtered = (students ?? []).filter(
    (s) =>
      !search ||
      s.nickname.toLowerCase().includes(search.toLowerCase()) ||
      s.username.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      title: "Student",
      key: "student",
      render: (_: unknown, record: User) => (
        <Space>
          <Avatar icon={<UserOutlined />} size="small" />
          <div>
            <Text strong style={{ display: "block", lineHeight: 1.3 }}>
              {record.nickname}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              @{record.username}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 100,
      render: (_: unknown, record: User) =>
        record.is_active ? (
          <Badge status="success" text="Active" />
        ) : (
          <Badge status="default" text="Inactive" />
        ),
    },
    {
      title: "Last Login",
      key: "last_login",
      width: 180,
      render: (_: unknown, record: User) =>
        record.last_login_at ? (
          <Tooltip title={new Date(record.last_login_at).toLocaleString()}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {new Date(record.last_login_at).toLocaleDateString()}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            Never
          </Text>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 140,
      render: (_: unknown, record: User) => (
        <Space size="small">
          <Tooltip title="View progress">
            <Link href={`/courses/${courseId}/progress/students/${record.id}`}>
              <Button
                size="small"
                icon={<LineChartOutlined />}
                type="text"
              />
            </Link>
          </Tooltip>
          <ConfirmDialog
            title="Remove student?"
            description={`Remove ${record.nickname} from this course? Their progress data will be kept.`}
            onConfirm={() => unenrollMutation.mutate(record.id)}
          >
            <Button
              size="small"
              icon={<DeleteOutlined />}
              type="text"
              danger
            />
          </ConfirmDialog>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href={`/courses/${courseId}`}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            style={{ padding: 0, marginBottom: 8 }}
          >
            Back to {course?.name ?? "Course"}
          </Button>
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Space align="center">
            <TeamOutlined style={{ fontSize: 22, color: "#1677ff" }} />
            <Title level={3} style={{ margin: 0 }}>
              Students
            </Title>
            <Tag color="blue">{students?.length ?? 0} enrolled</Tag>
          </Space>
        </div>
      </div>

      {/* Enroll card */}
      <Card title="Enroll a Student" style={{ marginBottom: 20 }}>
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          Enter the student&apos;s user ID to add them to this course.
        </Text>
        <Space.Compact style={{ width: "100%", maxWidth: 480 }}>
          <Input
            placeholder="Student user ID"
            value={newStudentId}
            onChange={(e) => setNewStudentId(e.target.value)}
            onPressEnter={() =>
              newStudentId.trim() && enrollMutation.mutate()
            }
            allowClear
          />
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            loading={enrollMutation.isPending}
            disabled={!newStudentId.trim()}
            onClick={() => enrollMutation.mutate()}
          >
            Enroll
          </Button>
        </Space.Compact>
      </Card>

      {/* Student list */}
      <Card
        title={
          <Space>
            <span>Enrolled Students</span>
          </Space>
        }
        extra={
          <Input.Search
            placeholder="Search by name or username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
        }
      >
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          pagination={
            filtered.length > 10
              ? { pageSize: 10, showSizeChanger: false }
              : false
          }
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  search
                    ? "No students match your search."
                    : "No students enrolled yet."
                }
              />
            ),
          }}
        />
      </Card>
    </div>
  );
}
