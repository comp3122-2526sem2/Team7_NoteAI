"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { App, Button, Card, Form, Input, Typography } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "@/hooks/useAuth";

const { Title, Text } = Typography;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      const from = searchParams.get("from") ?? "/courses";
      router.push(from);
    } catch {
      message.error("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
      <Form.Item name="username" label="Username" rules={[{ required: true }]}>
        <Input prefix={<UserOutlined />} placeholder="Username" size="large" />
      </Form.Item>
      <Form.Item name="password" label="Password" rules={[{ required: true }]}>
        <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
      </Form.Item>
      <Form.Item style={{ marginBottom: 8 }}>
        <Button type="primary" htmlType="submit" size="large" block loading={loading}>
          Sign in
        </Button>
      </Form.Item>
      <div style={{ textAlign: "center" }}>
        <Text type="secondary">No account? </Text>
        <Link href="/register">Register</Link>
      </div>
    </Form>
  );
}

export default function LoginPage() {
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
      <Card style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>NoteAI</Title>
          <Text type="secondary">Sign in to your account</Text>
        </div>
        <Suspense fallback={<div>Loading…</div>}>
          <LoginForm />
        </Suspense>
      </Card>
    </div>
  );
}
