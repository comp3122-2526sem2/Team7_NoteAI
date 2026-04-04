"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Form, Input, Spin, Typography, Upload } from "antd";
import { InboxOutlined, LoadingOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { coursesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSyllabusJob } from "@/hooks/useSyllabusJob";
import { validateSyllabusFile } from "@/lib/validate-syllabus-file";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownInput } from "@/components/shared/markdown-input";

const { Dragger } = Upload;
const { Title, Text } = Typography;

export default function CourseSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isTeacher } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [syllabusUploading, setSyllabusUploading] = useState(false);
  const { job, startJob } = useSyllabusJob();

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: () => coursesApi.get(id).then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; syllabus?: string }) =>
      coursesApi.update(id, values),
    onSuccess: () => {
      message.success("Course updated");
      qc.invalidateQueries({ queryKey: ["course", id] });
    },
    onError: () => message.error("Failed to update"),
  });

  const handleSyllabusUpload = async (file: File) => {
    const validationError = await validateSyllabusFile(file);
    if (validationError) {
      message.error(validationError);
      return false;
    }
    setSyllabusUploading(true);
    try {
      const { data } = await coursesApi.uploadSyllabus(id, file);
      startJob(id, data.document_id);
      message.info("File uploaded — generating syllabus in the background…");
    } catch {
      message.error("Failed to upload file.");
    } finally {
      setSyllabusUploading(false);
    }
    return false;
  };

  const isGenerating = job?.courseId === id;

  if (isLoading) return <LoadingSpinner />;
  if (!course) return <div>Course not found.</div>;
  if (!isTeacher) return <div>Access denied.</div>;

  return (
    <div>
      <Title level={3}>Course Settings</Title>

      <Card title="Details" style={{ marginBottom: 24 }}>
        {/*
          key={course.id} forces the Form (and MarkdownInput inside it) to
          fully re-mount with the loaded data as initialValues, so the editor
          receives the existing syllabus content correctly.
        */}
        <Form
          key={course.id}
          layout="vertical"
          initialValues={{
            name: course.name,
            description: course.description ?? "",
            syllabus: course.syllabus ?? "",
          }}
          onFinish={(v) => updateMutation.mutate(v)}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="syllabus" label={
            <span>
              Syllabus
              <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                <ThunderboltOutlined style={{ color: "#1677ff", marginRight: 4 }} />
                or generate from a file below
              </Text>
            </span>
          }>
            <MarkdownInput placeholder="Write the course syllabus…" minHeight={240} />
          </Form.Item>

          {/* Generate from file — inline under the Syllabus field */}
          <Form.Item label={
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>
              Generate Syllabus from File
            </span>
          }>
            {isGenerating ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
                <Spin indicator={<LoadingOutlined spin />} />
                <Text type="secondary">Generating syllabus in the background…</Text>
              </div>
            ) : (
              <Dragger
                accept=".pdf,.docx,.doc,.txt,.md"
                showUploadList={false}
                disabled={syllabusUploading}
                beforeUpload={(file) => {
                  handleSyllabusUpload(file as unknown as File);
                  return false;
                }}
                style={{ padding: "4px 0" }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">
                  {syllabusUploading
                    ? "Uploading…"
                    : "Click or drag a file here to generate a syllabus"}
                </p>
                <p className="ant-upload-hint">
                  Supports PDF, DOCX, DOC, TXT, MD — overwrites the current syllabus
                </p>
              </Dragger>
            )}
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
              Save Changes
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
