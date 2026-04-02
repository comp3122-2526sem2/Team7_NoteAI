"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button, Card, Tabs, Typography } from "antd";
import { SettingOutlined, UnorderedListOutlined, BookOutlined } from "@ant-design/icons";
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

  const tabItems = [
    {
      key: "overview",
      label: "Overview",
      children: (
        <Card>
          <Title level={5}>Syllabus</Title>
          {course.syllabus ? (
            <MarkdownRenderer content={course.syllabus} />
          ) : (
            <Text type="secondary">No syllabus provided.</Text>
          )}
        </Card>
      ),
    },
    {
      key: "assignments",
      label: "Assignments",
      children: (
        <div>
          <Link href={`/courses/${id}/assignments`}>
            <Button icon={<UnorderedListOutlined />}>View All Assignments</Button>
          </Link>
        </div>
      ),
    },
    ...(isTeacher
      ? [
          {
            key: "lesson-plans",
            label: "Lesson Plans",
            children: (
              <div>
                <Link href={`/courses/${id}/lesson-plans`}>
                  <Button icon={<BookOutlined />}>View All Lesson Plans</Button>
                </Link>
              </div>
            ),
          },
          {
            key: "progress",
            label: "Student Progress",
            children: (
              <div>
                <Link href={`/courses/${id}/progress`}>
                  <Button>View Progress</Button>
                </Link>
              </div>
            ),
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

      <Tabs items={tabItems} />
    </div>
  );
}
