"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App, Button, Card, Divider, Form, Input, Spin, Steps,
  Typography, Upload,
} from "antd";
import {
  ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined,
  FileTextOutlined, InboxOutlined, LoadingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { coursesApi, documentsApi } from "@/lib/api";
import { MarkdownInput } from "@/components/shared/markdown-input";

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

const ACCEPTED = ".pdf,.docx,.doc,.txt,.md";

// ── Step 1: basic info ────────────────────────────────────────────────────────

function BasicInfoStep({
  onCreated,
}: {
  onCreated: (courseId: string) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: { name: string; description?: string }) => {
    setLoading(true);
    try {
      const { data } = await coursesApi.create(values);
      onCreated(data.id);
    } catch {
      message.error("Failed to create course. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish}>
      <Form.Item name="name" label="Course Name" rules={[{ required: true, message: "Please enter a course name" }]}>
        <Input size="large" placeholder="e.g. Introduction to Mathematics" autoFocus />
      </Form.Item>
      <Form.Item name="description" label="Description">
        <TextArea rows={4} placeholder="A short summary of what students will learn in this course" />
      </Form.Item>
      <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
        <Button type="primary" htmlType="submit" size="large" loading={loading} icon={<ArrowRightOutlined />} iconPosition="end">
          Create &amp; Continue
        </Button>
      </Form.Item>
    </Form>
  );
}

// ── Step 2: syllabus ──────────────────────────────────────────────────────────

type SyllabusMode = "file" | "write";

function SyllabusStep({
  courseId,
  onDone,
}: {
  courseId: string;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [mode, setMode] = useState<SyllabusMode>("file");
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [syllabusText, setSyllabusText] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingDocId, setGeneratingDocId] = useState<string | null>(null);

  // Poll document until background generation finishes
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
      message.success("Syllabus generated!");
      onDone();
    } else if (genDoc.conversion_status === "failed") {
      setGeneratingDocId(null);
      message.error("Syllabus generation failed. You can retry from the course settings.");
      onDone();
    }
  }, [genDoc, message, onDone]);

  const isGenerating = !!generatingDocId;

  const handleSave = async () => {
    setLoading(true);
    try {
      if (mode === "file" && syllabusFile) {
        const { data } = await coursesApi.uploadSyllabus(courseId, syllabusFile);
        setGeneratingDocId(data.document_id);
        message.info("File uploaded — generating syllabus in the background…");
      } else if (mode === "write" && syllabusText.trim()) {
        await coursesApi.update(courseId, { syllabus: syllabusText });
        message.success("Syllabus saved!");
        onDone();
      }
    } catch {
      message.error("Failed to save syllabus. You can try again from the course settings.");
      onDone();
    } finally {
      setLoading(false);
    }
  };

  const canSave =
    (mode === "file" && syllabusFile !== null) ||
    (mode === "write" && syllabusText.trim().length > 0);

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <Card
          hoverable
          onClick={() => setMode("file")}
          style={{
            flex: 1,
            cursor: "pointer",
            borderColor: mode === "file" ? "#1677ff" : "#f0f0f0",
            background: mode === "file" ? "#f0f7ff" : "#fff",
            transition: "all 0.2s",
          }}
          styles={{ body: { padding: "16px 20px" } }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ThunderboltOutlined style={{ fontSize: 20, color: mode === "file" ? "#1677ff" : "#8c8c8c" }} />
            <div>
              <Text strong style={{ color: mode === "file" ? "#1677ff" : undefined }}>Generate from File</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>Upload a PDF, Word doc, or text file and AI will extract the syllabus</Text>
            </div>
          </div>
        </Card>

        <Card
          hoverable
          onClick={() => setMode("write")}
          style={{
            flex: 1,
            cursor: "pointer",
            borderColor: mode === "write" ? "#1677ff" : "#f0f0f0",
            background: mode === "write" ? "#f0f7ff" : "#fff",
            transition: "all 0.2s",
          }}
          styles={{ body: { padding: "16px 20px" } }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileTextOutlined style={{ fontSize: 20, color: mode === "write" ? "#1677ff" : "#8c8c8c" }} />
            <div>
              <Text strong style={{ color: mode === "write" ? "#1677ff" : undefined }}>Write Manually</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>Type or paste the syllabus using the markdown editor</Text>
            </div>
          </div>
        </Card>
      </div>

      {/* File upload */}
      {mode === "file" && (
        <>
          {syllabusFile ? (
            <div
              style={{
                padding: "16px 20px",
                background: "#f6ffed",
                border: "1px solid #b7eb8f",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <ThunderboltOutlined style={{ color: "#52c41a", fontSize: 18 }} />
              <div style={{ flex: 1 }}>
                <Text strong>{syllabusFile.name}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  AI will extract the syllabus from this file when you click Save.
                </Text>
              </div>
              <Button size="small" onClick={() => setSyllabusFile(null)}>Change file</Button>
            </div>
          ) : (
            <Dragger
              accept={ACCEPTED}
              showUploadList={false}
              beforeUpload={(file) => {
                setSyllabusFile(file as unknown as File);
                return false;
              }}
              style={{ marginBottom: 16 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag a file to this area</p>
              <p className="ant-upload-hint">Supports PDF, DOCX, DOC, TXT, MD</p>
            </Dragger>
          )}
        </>
      )}

      {/* Manual editor */}
      {mode === "write" && (
        <div style={{ marginBottom: 16 }}>
          <MarkdownInput
            value={syllabusText}
            onChange={setSyllabusText}
            placeholder="Write the course syllabus in markdown…"
            minHeight={280}
          />
        </div>
      )}

      <Divider style={{ margin: "16px 0" }} />

      {isGenerating && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, color: "#1677ff" }}>
          <Spin indicator={<LoadingOutlined spin />} />
          <Text style={{ color: "#1677ff" }}>AI is generating the syllabus — you'll be taken to the course when it's ready…</Text>
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <Button
          type="primary"
          size="large"
          loading={loading}
          disabled={!canSave || isGenerating}
          icon={<CheckOutlined />}
          onClick={handleSave}
        >
          Save Syllabus
        </Button>
        <Button
          size="large"
          onClick={onDone}
          disabled={loading || isGenerating}
        >
          Skip for Now
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewCoursePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);

  const handleCourseCreated = (courseId: string) => {
    setCreatedCourseId(courseId);
    qc.invalidateQueries({ queryKey: ["courses"] });
    setStep(1);
  };

  const handleDone = () => {
    if (createdCourseId) {
      qc.invalidateQueries({ queryKey: ["course", createdCourseId] });
      router.push(`/courses/${createdCourseId}`);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/courses">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            style={{ marginBottom: 8, paddingLeft: 0 }}
            disabled={step === 1}
          >
            Back to Courses
          </Button>
        </Link>
        <Title level={3} style={{ margin: 0 }}>New Course</Title>
        <Text type="secondary">Set up your course in two quick steps</Text>
      </div>

      <Steps
        current={step}
        style={{ marginBottom: 32 }}
        items={[
          { title: "Basic Info", description: "Name & description" },
          { title: "Syllabus", description: "Manual or AI-generated" },
        ]}
      />

      <Card>
        {step === 0 && (
          <BasicInfoStep onCreated={handleCourseCreated} />
        )}
        {step === 1 && createdCourseId && (
          <SyllabusStep courseId={createdCourseId} onDone={handleDone} />
        )}
      </Card>
    </div>
  );
}
