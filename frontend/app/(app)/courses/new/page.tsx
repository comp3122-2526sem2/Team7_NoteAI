"use client";

import { useRouter } from "next/navigation";
import { App, Button, Card, Form, Input, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { coursesApi } from "@/lib/api";
import { MarkdownInput } from "@/components/shared/markdown-input";

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function NewCoursePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; syllabus?: string }) =>
      coursesApi.create(values),
    onSuccess: () => {
      message.success("Course created");
      qc.invalidateQueries({ queryKey: ["courses"] });
      router.push("/courses");
    },
    onError: () => message.error("Failed to create course"),
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/courses">
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ marginBottom: 8, paddingLeft: 0 }}>
            Back to Courses
          </Button>
        </Link>
        <Title level={3} style={{ margin: 0 }}>New Course</Title>
        <Text type="secondary">Fill in the details to create a new course</Text>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => createMutation.mutate(v)}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input size="large" placeholder="e.g. Introduction to Mathematics" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <TextArea rows={3} placeholder="A short summary of the course" />
          </Form.Item>
          <Form.Item name="syllabus" label="Syllabus">
            <MarkdownInput placeholder="Write the course syllabus…"  />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={createMutation.isPending}
            >
              Create Course
            </Button>
            <Button
              style={{ marginLeft: 12 }}
              onClick={() => router.push("/courses")}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
