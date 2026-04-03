"use client";

import { use, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { App, Button, Card, Col, Modal, Row, Spin, Typography, Upload } from "antd";
import {
  SettingOutlined,
  BookOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  InboxOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { coursesApi, documentsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

const { Title, Text } = Typography;
const { Dragger } = Upload;

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingDocId, setGeneratingDocId] = useState<string | null>(null);

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: () => coursesApi.get(id).then((r) => r.data),
  });

  // Poll the document until generation completes or fails
  const { data: genDoc } = useQuery({
    queryKey: ["syllabus-job", generatingDocId],
    queryFn: () => documentsApi.get(generatingDocId!).then((r) => r.data),
    enabled: !!generatingDocId,
    refetchInterval: (query) =>
      query.state.data?.conversion_status === "pending" ? 3000 : false,
  });

  useEffect(() => {
    if (!genDoc) return;
    if (genDoc.conversion_status === "completed") {
      qc.invalidateQueries({ queryKey: ["course", id] });
      setGeneratingDocId(null);
      setUploadModalOpen(false);
      message.success("Syllabus generated!");
    } else if (genDoc.conversion_status === "failed") {
      setGeneratingDocId(null);
      message.error("Syllabus generation failed. Please try again.");
    }
  }, [genDoc, qc, id, message]);

  const handleSyllabusUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data } = await coursesApi.uploadSyllabus(id, file);
      setGeneratingDocId(data.document_id);
      message.info("File uploaded — generating syllabus in the background…");
    } catch {
      message.error("Failed to upload file.");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (!course) return <div>Course not found.</div>;

  const isGenerating = !!generatingDocId;

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
          {
            key: "chapter-performance",
            label: "Chapter Performance",
            icon: <ThunderboltOutlined style={{ fontSize: 28, color: "#52c41a" }} />,
            href: `/courses/${id}/progress/chapters`,
          },
        ]
      : []),
  ];

  const syllabusExtra = isTeacher ? (
    isGenerating ? (
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#1677ff" }}>
        <Spin indicator={<LoadingOutlined spin />} size="small" />
        <Text style={{ color: "#1677ff", fontSize: 13 }}>Generating…</Text>
      </span>
    ) : (
      <Button size="small" icon={<ThunderboltOutlined />} onClick={() => setUploadModalOpen(true)}>
        Generate from File
      </Button>
    )
  ) : null;

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
        extra={syllabusExtra}
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
        onCancel={() => !uploading && !isGenerating && setUploadModalOpen(false)}
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
