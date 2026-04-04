"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { App, Button, Card, Col, Modal, Row, Spin, Typography, Upload } from "antd";
import {
  SettingOutlined,
  BookOutlined,
  LineChartOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  InboxOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSyllabusJob } from "@/hooks/useSyllabusJob";
import { validateSyllabusFile } from "@/lib/validate-syllabus-file";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

const { Title, Text } = Typography;
const { Dragger } = Upload;

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { job, startJob } = useSyllabusJob();

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: () => coursesApi.get(id).then((r) => r.data),
  });

  const isGenerating = job?.courseId === id;

  const handleSyllabusUpload = async (file: File) => {
    const validationError = await validateSyllabusFile(file);
    if (validationError) {
      message.error(validationError);
      return;
    }
    setUploading(true);
    try {
      const { data } = await coursesApi.uploadSyllabus(id, file);
      startJob(id, data.document_id);
      setUploadModalOpen(false);
      message.info("File uploaded — generating syllabus in the background…");
    } catch {
      message.error("Failed to upload file.");
    } finally {
      setUploading(false);
    }
  };

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
            key: "students",
            label: "Students",
            icon: <TeamOutlined style={{ fontSize: 28, color: "#1677ff" }} />,
            href: `/courses/${id}/students`,
          },
          {
            key: "progress",
            label: "Student Progress",
            icon: <LineChartOutlined style={{ fontSize: 28, color: "#fa8c16" }} />,
            href: `/courses/${id}/progress`,
          },
          {
            key: "chapter-performance",
            label: "Chapter Performance",
            icon: <ThunderboltOutlined style={{ fontSize: 28, color: "#52c41a" }} />,
            href: `/courses/${id}/progress/chapters`,
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

      <Card
        style={{ marginBottom: 24 }}
        title={<Title level={5} style={{ margin: 0 }}>Syllabus</Title>}
        extra={null}
      >
        {isGenerating ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", color: "#8c8c8c" }}>
            <Spin indicator={<LoadingOutlined spin />} />
            <Text type="secondary">AI is generating the syllabus from your file…</Text>
          </div>
        ) : course.syllabus ? (
          <MarkdownRenderer content={course.syllabus} />
        ) : (
          <Text type="secondary">
            No syllabus provided.{" "}
            {isTeacher && (
              <Button type="link" style={{ padding: 0 }} onClick={() => setUploadModalOpen(true)}>
                Generate one from a file
              </Button>
            )}
          </Text>
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

      <Modal
        title={
          <span>
            <ThunderboltOutlined style={{ color: "#1677ff", marginRight: 8 }} />
            Generate Syllabus from File
          </span>
        }
        open={uploadModalOpen}
        onCancel={() => !uploading && setUploadModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Upload a PDF, Word document, or text file. AI will extract a structured
          markdown syllabus in the background and save it to this course.
        </Text>
        <Dragger
          accept=".pdf,.docx,.doc,.txt,.md"
          showUploadList={false}
          disabled={uploading || isGenerating}
          beforeUpload={(file) => {
            handleSyllabusUpload(file as unknown as File);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {uploading ? "Uploading…" : isGenerating ? "Generating syllabus…" : "Click or drag a file here"}
          </p>
          <p className="ant-upload-hint">Supports PDF, DOCX, DOC, TXT, MD</p>
        </Dragger>
      </Modal>
    </div>
  );
}
