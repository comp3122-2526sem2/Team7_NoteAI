"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button, Card, Col, Empty, Row, Typography } from "antd";
import { PlusOutlined, BookOutlined } from "@ant-design/icons";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

const { Title, Text, Paragraph } = Typography;

export default function CoursesPage() {
  const { isTeacher } = useAuth();

  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => coursesApi.list().then((r) => r.data),
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
          <Link href="/courses/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New Course
            </Button>
          </Link>
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
    </div>
  );
}
