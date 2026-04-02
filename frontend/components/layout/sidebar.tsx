"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Typography } from "antd";
import {
  BookOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
  RiseOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/hooks/useAuth";

const { Title } = Typography;

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const allItems = [
    {
      key: "/courses",
      icon: <AppstoreOutlined />,
      label: <Link href="/courses">Courses</Link>,
      roles: ["student", "teacher", "admin"],
    },
    {
      key: "/documents",
      icon: <FileTextOutlined />,
      label: <Link href="/documents">Documents</Link>,
      roles: ["teacher", "admin"],
    },
    {
      key: "/progress-student",
      icon: <RiseOutlined />,
      label: <Link href="/progress">My Progress</Link>,
      roles: ["student"],
    },
    {
      key: "/progress-teacher",
      icon: <TrophyOutlined />,
      label: <Link href="/progress">Progress</Link>,
      roles: ["teacher", "admin"],
    },
  ];

  const items = allItems.filter((item) =>
    user ? item.roles.includes(user.role) : false
  );

  const selectedKey =
    items.find((item) => pathname.startsWith(item.key.replace(/-student|-teacher/, "")))?.key ?? "";

  return (
    <div
      style={{
        width: 220,
        minHeight: "100vh",
        background: "#fff",
        borderRight: "1px solid #f0f0f0",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0" }}>
        <Link href="/courses" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BookOutlined style={{ fontSize: 18, color: "#1677ff" }} />
          <Title level={5} style={{ margin: 0, color: "#1677ff" }}>
            NoteAI
          </Title>
        </Link>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        style={{ border: "none", flex: 1 }}
      />
    </div>
  );
}
