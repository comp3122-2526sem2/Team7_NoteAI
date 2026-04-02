"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { App, Button, Card, Form, Input, Select, Typography } from "antd";
import { authApi } from "@/lib/api";

const { Title, Text } = Typography;

export default function RegisterPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const role = Form.useWatch("role", form);

  const handleSubmit = async (values: {
    username: string;
    password: string;
    nickname: string;
    role: "student" | "teacher";
    student_id?: string;
    teacher_id?: string;
  }) => {
    setLoading(true);
    try {
      await authApi.register(values);
      message.success("Account created! Please sign in.");
      router.push("/login");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Registration failed";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f5",
        padding: 16,
      }}
    >
      <Card style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>NoteAI</Title>
          <Text type="secondary">Create your account</Text>
        </div>
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="nickname" label="Nickname" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="student" rules={[{ required: true }]}>
            <Select size="large" options={[
              { value: "student", label: "Student" },
              { value: "teacher", label: "Teacher" },
            ]} />
          </Form.Item>
          {role === "student" && (
            <Form.Item name="student_id" label="Student ID" rules={[{ required: true }]}>
              <Input size="large" />
            </Form.Item>
          )}
          {role === "teacher" && (
            <Form.Item name="teacher_id" label="Teacher ID" rules={[{ required: true }]}>
              <Input size="large" />
            </Form.Item>
          )}
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Create account
            </Button>
          </Form.Item>
          <div style={{ textAlign: "center" }}>
            <Text type="secondary">Already have an account? </Text>
            <Link href="/login">Sign in</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
