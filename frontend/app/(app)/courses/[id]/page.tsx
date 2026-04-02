"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button, Card, Col, Row, Typography } from "antd";
import {
  SettingOutlined,
  BookOutlined,
  LineChartOutlined,
} from "@ant-design/icons";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

const { Title, Text } = Typography;

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isTeacher } = useAuth();

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: () => coursesApi.get(id).then((r) => r.data),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!course) return <div>Course not found.</div>;

  const navItems = [
    {
      key: "chapters",
      label: "Chapters",
      icon: <BookOutlined style={{ fontSize: 28, color: "#1677ff" }} />,
      href: `/courses/${id}/chapters`,
    },
    ...(isTeacher
      ? [
          {
            key: "progress",
            label: "Student Progress",
            icon: <LineChartOutlined style={{ fontSize: 28, color: "#fa8c16" }} />,
            href: `/courses/${id}/progress`,
          },
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{course.name}</Title>
          <Text type="secondary">{course.description}</Text>
        </div>
        {isTeacher && (
          <Link href={`/courses/${id}/settings`}>
            <Button icon={<SettingOutlined />}>Settings</Button>
          </Link>
        )}
      </div>

      <Card style={{ marginBottom: 24 }}>
        <Title level={5}>Syllabus</Title>
        {course.syllabus ? (
          <MarkdownRenderer content={course.syllabus} />
        ) : (
          <Text type="secondary">No syllabus provided.</Text>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        {navItems.map((item) => (
          <Col key={item.key} xs={24} sm={12} md={8}>
            <Link href={item.href}>
              <Card
                hoverable
                style={{ textAlign: "center", cursor: "pointer" }}
                styles={{ body: { padding: "32px 24px" } }}
              >
                {item.icon}
                <Title level={5} style={{ margin: "12px 0 0" }}>{item.label}</Title>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  );
}
