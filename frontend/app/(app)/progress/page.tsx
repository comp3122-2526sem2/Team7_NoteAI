"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, Empty, Table, Typography } from "antd";
import { progressApi, type StudentProgress } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MasteryBadge } from "@/components/shared/mastery-badge";

const { Title, Text } = Typography;

export default function MyProgressPage() {
  const { data: progress, isLoading } = useQuery({
    queryKey: ["my-progress"],
    queryFn: () => progressApi.myProgress().then((r) => r.data),
  });

  if (isLoading) return <LoadingSpinner />;

  const byCourse = (progress ?? []).reduce(
    (acc, p) => {
      if (!acc[p.course_id]) acc[p.course_id] = [];
      acc[p.course_id]!.push(p);
      return acc;
    },
    {} as Record<string, StudentProgress[]>
  );

  const masteryColumns = [
    { title: "Topic", dataIndex: "topic", key: "topic" },
    {
      title: "Mastery",
      dataIndex: "mastery_level",
      key: "mastery",
      render: (v: "weak" | "developing" | "proficient") => <MasteryBadge level={v} />,
    },
    {
      title: "Last Assessed",
      dataIndex: "last_assessed_at",
      key: "assessed",
      render: (v: string) => (v ? new Date(v).toLocaleDateString() : "—"),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>My Progress</Title>
        <Text type="secondary">Your topic mastery across all courses</Text>
      </div>

      {!progress?.length ? (
        <Empty description="No progress data yet." />
      ) : (
        Object.entries(byCourse).map(([courseId, rows]) => (
          <Card
            key={courseId}
            title={`Course: ${courseId.slice(0, 8)}…`}
            style={{ marginBottom: 16 }}
          >
            <Table
              dataSource={rows ?? []}
              columns={masteryColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        ))
      )}
    </div>
  );
}
