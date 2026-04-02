"use client";

import { Avatar, Dropdown, Tag, Typography, App } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "@/hooks/useAuth";

const { Text } = Typography;

const roleColor: Record<string, string> = {
  student: "blue",
  teacher: "green",
  admin: "red",
};

export function Topbar() {
  const { user, logout } = useAuth();
  const { modal } = App.useApp();

  const handleLogout = () => {
    modal.confirm({
      title: "Sign out",
      content: "Are you sure you want to sign out?",
      onOk: logout,
      okText: "Sign out",
    });
  };

  if (!user) return null;

  const menuItems = [
    {
      key: "info",
      label: (
        <div style={{ padding: "4px 0" }}>
          <div style={{ fontWeight: 600 }}>{user.nickname}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>@{user.username}</Text>
        </div>
      ),
      disabled: true,
    },
    { type: "divider" as const },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Sign out",
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <div
      style={{
        height: 56,
        background: "#fff",
        borderBottom: "1px solid #f0f0f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={["click"]}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 8px", borderRadius: 6 }}
          className="hover:bg-gray-50"
        >
          <Avatar size="small" icon={<UserOutlined />} style={{ background: "#1677ff" }} />
          <Text strong style={{ fontSize: 14 }}>{user.nickname}</Text>
          <Tag color={roleColor[user.role] ?? "default"} style={{ margin: 0, textTransform: "capitalize" }}>
            {user.role}
          </Tag>
        </div>
      </Dropdown>
    </div>
  );
}
