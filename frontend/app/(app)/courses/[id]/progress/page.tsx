"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button, Card, Empty, Table, Typography } from "antd";
import { progressApi, type StudentProgress } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MasteryBadge } from "@/components/shared/mastery-badge";

const { Title } = Typography;

export default function CourseProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);

  const { data: progress, isLoading } = useQuery({
    queryKey: ["progress", courseId],
    queryFn: () => progressApi.listCourseProgress(courseId).then((r) => r.data),
  });

  if (isLoading) return <LoadingSpinner />;

  const byStudent = (progress ?? []).reduce(
    (acc, p) => {
      if (!acc[p.student_id]) acc[p.student_id] = [];
      acc[p.student_id]!.push(p);
      return acc;
    },
    {} as Record<string, StudentProgress[]>
  );

  const topics = [...new Set((progress ?? []).map((p) => p.topic))];

  const columns = [
    { title: "Student ID", dataIndex: "studentId", key: "studentId" },
    ...topics.map((t) => ({
      title: t,
      key: t,
      render: (_: unknown, record: { studentId: string; rows: StudentProgress[] }) => {
        const row = record.rows.find((r) => r.topic === t);
        return row ? <MasteryBadge level={row.mastery_level} /> : "—";
      },
    })),
    {
      title: "Detail",
      key: "detail",
      render: (_: unknown, record: { studentId: string }) => (
        <Link href={`/courses/${courseId}/progress/students/${record.studentId}`}>
          <Button type="link" size="small">View</Button>
        </Link>
      ),
    },
  ];

  const dataSource = Object.entries(byStudent).map(([studentId, rows]) => ({
    studentId,
    rows: rows ?? [],
    key: studentId,
  }));

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Student Progress</Title>
      {!progress?.length ? (
        <Empty description="No progress data yet." />
      ) : (
        <Card title="Class Overview">
          <div style={{ overflowX: "auto" }}>
            <Table
              dataSource={dataSource}
              columns={columns}
              rowKey="studentId"
              pagination={false}
              size="small"
            />
          </div>
        </Card>
      )}
    </div>
  );
}
