"use client";

import { use, useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  App, Button, Card, Col, DatePicker, Divider, Empty, Form, Input,
  InputNumber, List, Modal, Radio, Row, Select, Space, Table, Tag,
  Typography, Upload,
} from "antd";
import {
  PlusOutlined, ThunderboltOutlined, ReloadOutlined, EyeOutlined,
  DeleteOutlined, FileOutlined, UploadOutlined, SendOutlined,
  RobotOutlined, UserOutlined, MinusCircleOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import { assignmentsApi, chaptersApi } from "@/lib/api";
import type {
  Assignment, AssignmentContent, AssignmentSection,
  ChatMessage, ChapterThread, Document, LongQuestion, MCQuestion, PassageSection,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/lib/auth-store";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { MarkdownInput } from "@/components/shared/markdown-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const TYPES = ["quiz", "homework", "project", "exam"] as const;


// ── Question Builder ──────────────────────────────────────────────────────────

type DraftMC = MCQuestion & { _key: string };
type DraftLong = LongQuestion & { _key: string };
type DraftPassage = Omit<PassageSection, "questions"> & {
  _key: string;
  questions: Array<(MCQuestion | LongQuestion) & { _key: string }>;
};
type DraftSection = DraftMC | DraftLong | DraftPassage;

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function newMC(): DraftMC {
  return { _key: makeKey(), type: "mc", question: "", options: ["", "", "", ""] };
}
function newLong(): DraftLong {
  return { _key: makeKey(), type: "long", question: "", suggested_answer: "" };
}
function newPassage(): DraftPassage {
  return { _key: makeKey(), type: "passage", passage: "", questions: [] };
}

function toContent(sections: DraftSection[]): AssignmentContent {
  return {
    sections: sections.map((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _key, ...rest } = s as DraftSection & { _key: string };
      if (rest.type === "passage") {
        return {
          ...rest,
          questions: (rest as DraftPassage).questions.map(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ({ _key: _k, ...q }) => q as MCQuestion | LongQuestion
          ),
        } as PassageSection;
      }
      return rest as MCQuestion | LongQuestion;
    }) as AssignmentSection[],
  };
}

function QuestionBuilder({
  sections,
  onChange,
}: {
  sections: DraftSection[];
  onChange: (s: DraftSection[]) => void;
}) {
  const update = (key: string, patch: Partial<DraftSection>) =>
    onChange(sections.map((s) => (s._key === key ? { ...s, ...patch } as DraftSection : s)));

  const remove = (key: string) => onChange(sections.filter((s) => s._key !== key));

  const addSubQ = (parentKey: string, type: "mc" | "long") => {
    onChange(
      sections.map((s) => {
        if (s._key !== parentKey || s.type !== "passage") return s;
        const sub = type === "mc" ? newMC() : newLong();
        return { ...s, questions: [...(s as DraftPassage).questions, sub] };
      })
    );
  };

  const updateSubQ = (parentKey: string, subKey: string, patch: object) =>
    onChange(
      sections.map((s) => {
        if (s._key !== parentKey || s.type !== "passage") return s;
        return {
          ...s,
          questions: (s as DraftPassage).questions.map((q) =>
            q._key === subKey ? { ...q, ...patch } : q
          ),
        };
      })
    );

  const removeSubQ = (parentKey: string, subKey: string) =>
    onChange(
      sections.map((s) => {
        if (s._key !== parentKey || s.type !== "passage") return s;
        return {
          ...s,
          questions: (s as DraftPassage).questions.filter((q) => q._key !== subKey),
        };
      })
    );

  return (
    <div>
      {sections.map((section, idx) => (
        <Card
          key={section._key}
          size="small"
          style={{ marginBottom: 12, background: "#fafafa" }}
          title={
            <Space>
              <Tag color={
                section.type === "mc" ? "blue" :
                section.type === "long" ? "green" : "purple"
              }>
                {section.type === "mc" ? "Multiple Choice" :
                 section.type === "long" ? "Long Question" : "Reading Passage"}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>Section {idx + 1}</Text>
            </Space>
          }
          extra={
            <Button
              type="text" danger size="small" icon={<MinusCircleOutlined />}
              onClick={() => remove(section._key)}
            />
          }
        >
          {section.type === "passage" && (
            <>
              <Form.Item label="Passage Text" style={{ marginBottom: 8 }}>
                <TextArea
                  rows={5}
                  placeholder="Paste the reading passage here…"
                  value={(section as DraftPassage).passage}
                  onChange={(e) => update(section._key, { passage: e.target.value })}
                />
              </Form.Item>

              {/* Sub-questions */}
              {(section as DraftPassage).questions.map((sq, qi) => (
                <Card
                  key={sq._key} size="small"
                  style={{ marginBottom: 8, background: "#fff" }}
                  title={
                    <Space>
                      <Tag color={sq.type === "mc" ? "blue" : "green"} style={{ fontSize: 11 }}>
                        {sq.type === "mc" ? "MC" : "Long"}
                      </Tag>
                      <Text style={{ fontSize: 12 }}>Q{qi + 1}</Text>
                    </Space>
                  }
                  extra={
                    <Button type="text" danger size="small" icon={<MinusCircleOutlined />}
                      onClick={() => removeSubQ(section._key, sq._key)} />
                  }
                >
                  <SubQuestionFields
                    q={sq}
                    onChange={(patch) => updateSubQ(section._key, sq._key, patch)}
                  />
                </Card>
              ))}

              <Space>
                <Button size="small" icon={<PlusOutlined />}
                  onClick={() => addSubQ(section._key, "mc")}>
                  Add MC
                </Button>
                <Button size="small" icon={<PlusOutlined />}
                  onClick={() => addSubQ(section._key, "long")}>
                  Add Long Question
                </Button>
              </Space>
            </>
          )}

          {(section.type === "mc" || section.type === "long") && (
            <SubQuestionFields
              q={section as DraftMC | DraftLong}
              onChange={(patch) => update(section._key, patch)}
            />
          )}
        </Card>
      ))}

      <Space wrap>
        <Button icon={<PlusOutlined />} onClick={() => onChange([...sections, newMC()])}>
          Add MC Question
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => onChange([...sections, newLong()])}>
          Add Long Question
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => onChange([...sections, newPassage()])}>
          Add Reading Passage
        </Button>
      </Space>
    </div>
  );
}

const OPTION_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function SubQuestionFields({
  q,
  onChange,
}: {
  q: (MCQuestion | LongQuestion) & { _key?: string };
  onChange: (patch: object) => void;
}) {
  const mc = q as MCQuestion;
  const long = q as LongQuestion;

  const updateOption = (idx: number, val: string) => {
    const opts = [...mc.options];
    opts[idx] = val;
    onChange({ options: opts });
  };

  const addOption = () => onChange({ options: [...mc.options, ""] });

  const removeOption = (idx: number) => {
    const opts = mc.options.filter((_, i) => i !== idx);
    // If the current correct_answer label no longer exists, clear it
    const validLabels = opts.map((_, i) => OPTION_LABELS[i]);
    const newCorrect = validLabels.includes(mc.correct_answer ?? "") ? mc.correct_answer : undefined;
    onChange({ options: opts, correct_answer: newCorrect });
  };

  return (
    <>
      <Form.Item label="Question" style={{ marginBottom: 8 }}>
        <Input
          value={q.question}
          placeholder="Enter question text…"
          onChange={(e) => onChange({ question: e.target.value })}
        />
      </Form.Item>

      {q.type === "mc" && (
        <>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Options</Text>
            {mc.options.map((opt, idx) => (
              <Row key={idx} gutter={8} align="middle" style={{ marginTop: 6 }}>
                <Col flex="28px">
                  <Text strong style={{ fontSize: 13, color: "#1677ff" }}>
                    {OPTION_LABELS[idx]}.
                  </Text>
                </Col>
                <Col flex="auto">
                  <Input
                    size="small"
                    value={opt}
                    placeholder={`Option ${OPTION_LABELS[idx]}…`}
                    onChange={(e) => updateOption(idx, e.target.value)}
                  />
                </Col>
                <Col flex="32px">
                  <Button
                    type="text" danger size="small" icon={<MinusCircleOutlined />}
                    disabled={mc.options.length <= 2}
                    onClick={() => removeOption(idx)}
                  />
                </Col>
              </Row>
            ))}
            <Button
              size="small" icon={<PlusOutlined />} style={{ marginTop: 8 }}
              onClick={addOption}
              disabled={mc.options.length >= 26}
            >
              Add Option
            </Button>
          </div>
          <Form.Item label="Correct Answer" style={{ marginBottom: 0 }}>
            <Select
              size="small"
              style={{ width: 80 }}
              value={mc.correct_answer}
              onChange={(v) => onChange({ correct_answer: v })}
              options={mc.options.map((_, i) => ({
                value: OPTION_LABELS[i],
                label: OPTION_LABELS[i],
              }))}
              allowClear
              placeholder="—"
            />
          </Form.Item>
        </>
      )}

      {q.type === "long" && (
        <Form.Item label="Suggested Answer (teacher only)" style={{ marginBottom: 0 }}>
          <TextArea
            rows={3}
            placeholder="Model answer shown to teachers when reviewing submissions…"
            value={long.suggested_answer ?? ""}
            onChange={(e) => onChange({ suggested_answer: e.target.value })}
          />
        </Form.Item>
      )}
    </>
  );
}


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChapterDetailPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id: courseId, cid: chapterId } = use(params);
  const { isTeacher } = useAuth();
  const { token } = useAuthStore();
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [sections, setSections] = useState<DraftSection[]>([]);
  const [streaming, setStreaming] = useState(false);
  const streamedRef = useRef("");

  const { data: chapter, isLoading: chapterLoading } = useQuery({
    queryKey: ["chapter", courseId, chapterId],
    queryFn: () => chaptersApi.get(courseId, chapterId).then((r) => r.data),
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["assignments", courseId, { chapterId }],
    queryFn: () =>
      assignmentsApi
        .list(courseId)
        .then((r) => r.data.filter((a) => a.chapter_id === chapterId)),
  });

  const { data: aiComment, refetch: refetchAIComment } = useQuery({
    queryKey: ["chapter-ai-comment", courseId, chapterId],
    queryFn: () => chaptersApi.getAIComment(courseId, chapterId).then((r) => r.data),
    enabled: !isTeacher,
  });

  const [streamedComment, setStreamedComment] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: documents, refetch: refetchDocs } = useQuery({
    queryKey: ["chapter-documents", courseId, chapterId],
    queryFn: () => chaptersApi.listDocuments(courseId, chapterId).then((r) => r.data),
    enabled: isTeacher,
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.conversion_status === "pending") ? 3000 : false,
  });

  const generateMutation = useMutation({
    mutationFn: () => chaptersApi.generateAIComment(courseId, chapterId),
    onSuccess: () => { message.success("AI comment generated"); refetchAIComment(); },
    onError: () => message.error("Failed to generate AI comment"),
  });

  const handleStreamAI = useCallback(async () => {
    setStreaming(true);
    streamedRef.current = "";
    setStreamedComment("");
    const url = chaptersApi.aiCommentStreamUrl(courseId, chapterId);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            const text = line.slice(6);
            if (text === "[DONE]") break;
            streamedRef.current += text;
            setStreamedComment(streamedRef.current);
          }
        }
      }
      message.success("AI comment updated");
      refetchAIComment();
    } catch {
      message.error("Streaming failed");
    } finally {
      setStreaming(false);
    }
  }, [courseId, chapterId, token, refetchAIComment]);

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; assignment_type: "quiz" | "homework" | "project" | "exam"; topic?: string; due_date_picker: dayjs.Dayjs; max_score?: number }) => {
      const { due_date_picker, ...rest } = values;
      return assignmentsApi.create(courseId, {
        ...rest,
        due_date: due_date_picker.toISOString(),
        chapter_id: chapterId,
        content: sections.length > 0 ? toContent(sections) : undefined,
      });
    },
    onSuccess: () => {
      message.success("Assignment created");
      qc.invalidateQueries({ queryKey: ["assignments", courseId, { chapterId }] });
      setCreateOpen(false);
      form.resetFields();
      setSections([]);
    },
    onError: () => message.error("Failed to create assignment"),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => chaptersApi.deleteDocument(courseId, chapterId, docId),
    onSuccess: () => { message.success("Document removed"); refetchDocs(); },
    onError: () => message.error("Failed to remove document"),
  });

  const handleUpload = async (file: UploadFile) => {
    setUploadingFile(true);
    const formData = new FormData();
    formData.append("file", file as unknown as Blob);
    try {
      await chaptersApi.uploadDocument(courseId, chapterId, formData);
      message.success(`${file.name} saved — embedding in background…`);
      refetchDocs();
    } catch {
      message.error(`Failed to upload ${file.name}`);
    } finally {
      setUploadingFile(false);
    }
    return false;
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assignmentsApi.delete(courseId, id),
    onSuccess: () => {
      message.success("Assignment deleted");
      qc.invalidateQueries({ queryKey: ["assignments", courseId, { chapterId }] });
    },
    onError: () => message.error("Failed to delete"),
  });

  if (chapterLoading) return <LoadingSpinner />;
  if (!chapter) return <div>Chapter not found.</div>;

  const displayedComment = streamedComment ?? aiComment?.comment;

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: Assignment) => (
        <Link href={`/courses/${courseId}/assignments/${record.id}`}>
          <Button type="link" style={{ padding: 0 }}>{name}</Button>
        </Link>
      ),
    },
    {
      title: "Type",
      dataIndex: "assignment_type",
      key: "type",
      render: (t: string) => <Tag color="blue" style={{ textTransform: "capitalize" }}>{t}</Tag>,
    },
    {
      title: "Questions",
      key: "questions",
      render: (_: unknown, record: Assignment) => {
        if (!record.content?.sections?.length) return <Text type="secondary">—</Text>;
        let count = 0;
        for (const s of record.content.sections) {
          if (s.type === "passage") count += s.questions.length;
          else count += 1;
        }
        return <Tag>{count} question{count !== 1 ? "s" : ""}</Tag>;
      },
    },
    {
      title: "Due",
      dataIndex: "due_date",
      key: "due",
      render: (d?: string) => d ? new Date(d).toLocaleDateString() : "—",
    },
    {
      title: "Max Score",
      dataIndex: "max_score",
      key: "score",
      render: (s?: number) => s ?? "—",
    },
    ...(isTeacher
      ? [{
          title: "",
          key: "actions",
          width: 60,
          render: (_: unknown, record: Assignment) => (
            <ConfirmDialog title="Delete this assignment?" onConfirm={() => deleteMutation.mutate(record.id)}>
              <Button type="text" danger size="small" icon={<DeleteOutlined />} />
            </ConfirmDialog>
          ),
        }]
      : [{
          title: "",
          key: "view",
          width: 60,
          render: (_: unknown, record: Assignment) => (
            <Link href={`/courses/${courseId}/assignments/${record.id}`}>
              <Button type="text" size="small" icon={<EyeOutlined />} />
            </Link>
          ),
        }]),
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>{chapter.title}</Title>
        {chapter.description && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {chapter.description}
          </Paragraph>
        )}
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={!isTeacher ? 14 : 24}>
          <Card
            title={`Assignments (${assignments?.length ?? 0})`}
            extra={
              isTeacher && (
                <Button type="primary" size="small" icon={<PlusOutlined />}
                  onClick={() => setCreateOpen(true)}>
                  Add
                </Button>
              )
            }
          >
            {assignmentsLoading ? (
              <LoadingSpinner />
            ) : !assignments?.length ? (
              <Empty description="No assignments in this chapter yet." />
            ) : (
              <Table dataSource={assignments} columns={columns} rowKey="id"
                pagination={false} size="small" />
            )}
          </Card>
        </Col>

        {!isTeacher && (
          <Col xs={24} lg={10}>
            <Card
              title={
                <Space>
                  <ThunderboltOutlined style={{ color: "#1677ff" }} />
                  <span>AI Study Comment</span>
                </Space>
              }
              extra={
                <Space>
                  <Button size="small" icon={<ReloadOutlined />}
                    loading={generateMutation.isPending}
                    onClick={() => generateMutation.mutate()}>
                    Refresh
                  </Button>
                  <Button size="small" icon={<ThunderboltOutlined />}
                    loading={streaming} onClick={handleStreamAI}>
                    Stream
                  </Button>
                </Space>
              }
            >
              {displayedComment ? (
                <MarkdownRenderer content={displayedComment} />
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <Text type="secondary">No AI comment yet.</Text>
                  <br />
                  <Button type="primary" icon={<ThunderboltOutlined />}
                    style={{ marginTop: 12 }} loading={generateMutation.isPending}
                    onClick={() => generateMutation.mutate()}>
                    Generate
                  </Button>
                </div>
              )}
              {aiComment && (
                <>
                  <Divider style={{ margin: "12px 0" }} />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Last updated {new Date(aiComment.updated_at).toLocaleString()}
                  </Text>
                </>
              )}
            </Card>
          </Col>
        )}
      </Row>

      {isTeacher && (
        <Card
          title={
            <Space>
              <FileOutlined />
              <span>Chapter Documents</span>
              <Tag color="blue">{documents?.length ?? 0}</Tag>
            </Space>
          }
          extra={
            <Upload
              accept=".pdf,.docx,.doc,.txt,.md"
              showUploadList={false}
              beforeUpload={(file) => { handleUpload(file as unknown as UploadFile); return false; }}
            >
              <Button icon={<UploadOutlined />} loading={uploadingFile} size="small">
                Upload
              </Button>
            </Upload>
          }
          style={{ marginTop: 24 }}
        >
          {!documents?.length ? (
            <Empty
              description="No documents uploaded yet."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <List
              dataSource={documents}
              size="small"
              renderItem={(doc: Document) => (
                <List.Item
                  actions={[
                    <Tag key="status"
                      color={doc.conversion_status === "completed" ? "green" :
                             doc.conversion_status === "failed" ? "red" : "orange"}>
                      {doc.conversion_status}
                    </Tag>,
                    <Button key="del" type="text" danger size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => deleteDocMutation.mutate(doc.id)}
                      loading={deleteDocMutation.isPending} />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<FileOutlined style={{ fontSize: 18, color: "#1677ff" }} />}
                    title={doc.original_filename}
                    description={
                      <Space size={4}>
                        <Tag>{doc.original_file_type.toUpperCase()}</Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {new Date(doc.created_at).toLocaleDateString()}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      )}

      <Card
        title={
          <Space>
            <RobotOutlined style={{ color: "#1677ff" }} />
            <span>Chapter Chat</span>
          </Space>
        }
        style={{ marginTop: 24 }}
        styles={{ body: { padding: 0 } }}
      >
        <ChapterChat courseId={courseId} chapterId={chapterId} token={token ?? ""} />
      </Card>

      {/* Create Assignment Modal */}
      <Modal
        title="Add Assignment"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); setSections([]); }}
        footer={null}
        destroyOnClose
        width={760}
      >
        <Form form={form} layout="vertical"
          onFinish={(v) => createMutation.mutate(v)}
          style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="assignment_type" label="Type"
                initialValue="homework" rules={[{ required: true }]}>
                <Select options={TYPES.map((t) => ({ value: t, label: t }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Description">
            <MarkdownInput placeholder="Describe the assignment…" minHeight={80} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="topic" label="Topic">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="max_score" label="Max Score">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="due_date_picker" label="Due Date" rules={[{ required: true, message: "Due date is required" }]}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="left" style={{ fontSize: 13 }}>Questions</Divider>
          <QuestionBuilder sections={sections} onChange={setSections} />

          <Form.Item style={{ marginBottom: 0, marginTop: 16 }}>
            <Button type="primary" htmlType="submit" block loading={createMutation.isPending}>
              Create
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}


// ── Chapter Chat ──────────────────────────────────────────────────────────────

function ChapterChat({ courseId, chapterId, token }: {
  courseId: string; chapterId: string; token: string;
}) {
  const { message: antMessage } = App.useApp();
  const qc = useQueryClient();

  const [activeThread, setActiveThread] = useState<ChapterThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [responding, setResponding] = useState(false);
  const [newThreadName, setNewThreadName] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef("");

  const { data: threads, isLoading: threadsLoading } = useQuery({
    queryKey: ["chapter-threads", courseId, chapterId],
    queryFn: () => chaptersApi.listThreads(courseId, chapterId).then((r) => r.data),
  });

  useEffect(() => {
    if (threads?.length && !activeThread) setActiveThread(threads[0]);
  }, [threads, activeThread]);

  const { data: threadHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["thread-history", courseId, chapterId, activeThread?.id],
    queryFn: () =>
      chaptersApi.getThreadHistory(courseId, chapterId, activeThread!.id).then((r) => r.data),
    enabled: !!activeThread,
  });

  useEffect(() => {
    if (threadHistory) setMessages(threadHistory.history ?? []);
  }, [threadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreateThread = useCallback(async () => {
    const name = newThreadName.trim() || `Thread ${(threads?.length ?? 0) + 1}`;
    setCreatingThread(true);
    try {
      const res = await chaptersApi.createThread(courseId, chapterId, name);
      qc.invalidateQueries({ queryKey: ["chapter-threads", courseId, chapterId] });
      setActiveThread(res.data);
      setMessages([]);
      setNewThreadName("");
    } catch {
      antMessage.error("Failed to create thread");
    } finally {
      setCreatingThread(false);
    }
  }, [newThreadName, threads?.length, courseId, chapterId, qc, antMessage]);

  const handleDeleteThread = useCallback(async (thread: ChapterThread) => {
    try {
      await chaptersApi.deleteThread(courseId, chapterId, thread.id);
      qc.invalidateQueries({ queryKey: ["chapter-threads", courseId, chapterId] });
      if (activeThread?.id === thread.id) { setActiveThread(null); setMessages([]); }
    } catch {
      antMessage.error("Failed to delete thread");
    }
  }, [activeThread, courseId, chapterId, qc, antMessage]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || responding || !activeThread) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setResponding(true);
    streamingRef.current = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const url = chaptersApi.threadStreamUrl(courseId, chapterId, activeThread.id);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") break;
          try {
            const tok = JSON.parse(raw) as string;
            streamingRef.current += tok;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: streamingRef.current };
              return next;
            });
          } catch { /* ignore */ }
        }
      }
    } catch {
      antMessage.error("Chat failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setResponding(false);
    }
  }, [input, responding, activeThread, courseId, chapterId, token, antMessage]);

  return (
    <div style={{ display: "flex", height: 520 }}>
      {/* Thread sidebar */}
      <div style={{
        width: 200, borderRight: "1px solid #f0f0f0", display: "flex",
        flexDirection: "column", flexShrink: 0,
      }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #f0f0f0" }}>
          <Text strong style={{ fontSize: 12, color: "#888" }}>THREADS</Text>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {threadsLoading ? (
            <div style={{ padding: 12 }}><LoadingSpinner /></div>
          ) : !threads?.length ? (
            <div style={{ padding: "12px", textAlign: "center" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>No threads yet</Text>
            </div>
          ) : (
            threads.map((t) => (
              <div key={t.id}
                onClick={() => { setActiveThread(t); setMessages([]); }}
                style={{
                  padding: "8px 12px", cursor: "pointer",
                  background: activeThread?.id === t.id ? "#e6f4ff" : "transparent",
                  borderLeft: activeThread?.id === t.id ? "3px solid #1677ff" : "3px solid transparent",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <Text ellipsis style={{
                  fontSize: 13, fontWeight: activeThread?.id === t.id ? 600 : 400,
                  flex: 1, minWidth: 0,
                }}>
                  {t.name}
                </Text>
                <Button type="text" size="small" danger icon={<DeleteOutlined />}
                  style={{ flexShrink: 0, opacity: 0.5 }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteThread(t); }} />
              </div>
            ))
          )}
        </div>
        <div style={{ padding: "10px 12px", borderTop: "1px solid #f0f0f0" }}>
          <Input size="small" placeholder="Thread name…" value={newThreadName}
            onChange={(e) => setNewThreadName(e.target.value)}
            onPressEnter={handleCreateThread} style={{ marginBottom: 6 }} />
          <Button type="primary" size="small" block icon={<PlusOutlined />}
            loading={creatingThread} onClick={handleCreateThread}>
            New Thread
          </Button>
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!activeThread ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Select a thread or create a new one to start chatting" />
          </div>
        ) : (
          <>
            <div style={{
              padding: "8px 16px", borderBottom: "1px solid #f0f0f0",
              background: "#fafafa", display: "flex", alignItems: "center", gap: 8,
            }}>
              <RobotOutlined style={{ color: "#1677ff" }} />
              <Text strong style={{ fontSize: 13 }}>{activeThread.name}</Text>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {historyLoading ? (
                <LoadingSpinner />
              ) : messages.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No messages yet. Ask anything about this chapter!" />
              ) : (
                messages.map((msg, i) => (
                  <div key={i} style={{
                    display: "flex",
                    flexDirection: msg.role === "user" ? "row-reverse" : "row",
                    alignItems: "flex-start", gap: 10, marginBottom: 16,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: msg.role === "user" ? "#1677ff" : "#f0f0f0",
                      color: msg.role === "user" ? "#fff" : "#555", fontSize: 13,
                    }}>
                      {msg.role === "user" ? <UserOutlined /> : <RobotOutlined />}
                    </div>
                    <div style={{
                      maxWidth: "72%",
                      background: msg.role === "user" ? "#1677ff" : "#fafafa",
                      color: msg.role === "user" ? "#fff" : "inherit",
                      borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                      padding: "10px 14px",
                      border: msg.role === "assistant" ? "1px solid #f0f0f0" : "none",
                    }}>
                      {msg.role === "assistant"
                        ? <MarkdownRenderer content={msg.content || "…"} />
                        : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
            <div style={{
              borderTop: "1px solid #f0f0f0", padding: "12px 16px",
              display: "flex", gap: 8,
            }}>
              <Input value={input} onChange={(e) => setInput(e.target.value)}
                onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about this chapter… (Enter to send)"
                disabled={responding} style={{ flex: 1 }} />
              <Button type="primary" icon={<SendOutlined />} onClick={sendMessage}
                loading={responding} disabled={!input.trim()}>
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
