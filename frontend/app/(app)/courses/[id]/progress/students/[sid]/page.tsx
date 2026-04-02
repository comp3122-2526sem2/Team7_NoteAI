"use client";

import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Divider, Table, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { progressApi } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MasteryBadge } from "@/components/shared/mastery-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

const { Title, Text } = Typography;

export default function StudentProgressPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id: courseId, sid: studentId } = use(params);
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data: progress, isLoading } = useQuery({
    queryKey: ["student-progress", courseId, studentId],
    queryFn: () => progressApi.getStudentProgress(courseId, studentId).then((r) => r.data),
  });

  const { data: recommendations } = useQuery({
    queryKey: ["recommendations", courseId, studentId],
    queryFn: () => progressApi.getRecommendations(courseId, studentId).then((r) => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: () => progressApi.generateRecommendation(courseId, studentId),
    onSuccess: () => {
      message.success("Recommendation generated");
      qc.invalidateQueries({ queryKey: ["recommendations", courseId, studentId] });
    },
    onError: () => message.error("Failed to generate"),
  });

  if (isLoading) return <LoadingSpinner />;

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
    <div style={{ maxWidth: 800 }}>
      <Title level={3}>Student Progress Detail</Title>
      <Text type="secondary">Student ID: {studentId}</Text>

      <Card title="Topic Mastery" style={{ marginTop: 16, marginBottom: 24 }}>
        <Table
          dataSource={progress ?? []}
          columns={masteryColumns}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: "No progress data." }}
        />
      </Card>

      <Divider />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>AI Recommendations</Title>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => generateMutation.mutate()}
          loading={generateMutation.isPending}
        >
          Generate Recommendation
        </Button>
      </div>

      {!recommendations?.length ? (
        <Text type="secondary">No recommendations yet.</Text>
      ) : (
        recommendations.map((r) => (
          <Card key={r.id} size="small" style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(r.created_at).toLocaleString()}
            </Text>
            <MarkdownRenderer content={r.recommendation} />
          </Card>
        ))
      )}
    </div>
  );
}
