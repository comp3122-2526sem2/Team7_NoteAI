"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button, Card, Empty, Space, Table, Typography } from "antd";
import { UserOutlined, BarChartOutlined } from "@ant-design/icons";
import { coursesApi, type User } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

const { Title, Text } = Typography;

export default function CourseProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const { isTeacher } = useAuth();

  const { data: students, isLoading } = useQuery({
    queryKey: ["course-students", courseId],
    queryFn: () => coursesApi.listStudents(courseId).then((r) => r.data),
  });

  if (!isTeacher) {
    return <Empty description="This section is for teachers only." />;
  }

  if (isLoading) return <LoadingSpinner />;

  const columns = [
    {
      title: "Name",
      key: "name",
      render: (_: unknown, record: User) => (
        <Space>
          <UserOutlined style={{ color: "#1677ff" }} />
          <Text strong>{record.nickname}</Text>
        </Space>
      ),
    },
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
      render: (v: string) => <Text type="secondary">@{v}</Text>,
    },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_: unknown, record: User) => (
        <Link href={`/courses/${courseId}/progress/students/${record.id}`}>
          <Button type="primary" size="small" icon={<BarChartOutlined />}>
            View Progress
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Student Progress</Title>
        <Text type="secondary">
          Select a student to view their assignment performance and AI study comments per chapter.
        </Text>
      </div>

      <Card>
        {!students?.length ? (
          <Empty description="No students enrolled in this course yet." />
        ) : (
          <Table
            dataSource={students}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="middle"
          />
        )}
      </Card>
    </div>
  );
}
