"use client";

import { Button, Drawer, List, Popconfirm, Space, Tag, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { LessonPlanVersion } from "@/lib/api";

const { Text } = Typography;

interface Props {
  open: boolean;
  versions: LessonPlanVersion[];
  loading?: boolean;
  restoring?: boolean;
  deletingVersionId?: string | null;
  onClose: () => void;
  onPreview: (versionId: string) => void;
  onRestore: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
}

export function VersionHistoryDrawer({
  open,
  versions,
  loading,
  restoring,
  deletingVersionId,
  onClose,
  onPreview,
  onRestore,
  onDeleteVersion,
}: Props) {
  return (
    <Drawer
      title="版本紀錄"
      open={open}
      onClose={onClose}
      size={460}
      destroyOnClose
    >
      <List
        loading={loading}
        dataSource={versions}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button key="preview" size="small" onClick={() => onPreview(item.id)}>
                預覽
              </Button>,
              <Button
                key="restore"
                type="primary"
                size="small"
                loading={restoring}
                onClick={() => onRestore(item.id)}
              >
                還原
              </Button>,
              <Popconfirm
                key="delete"
                title="刪除此版本紀錄？"
                description="只會刪除歷史快照，不會改動目前教案正文。"
                okText="刪除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => onDeleteVersion(item.id)}
              >
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={deletingVersionId === item.id}
                >
                  刪除
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Tag color="blue">v{item.version_number}</Tag>
                  <Text>{new Date(item.created_at).toLocaleString()}</Text>
                </Space>
              }
              description={item.saved_by ? `儲存者：${item.saved_by}` : "儲存者：未知"}
            />
          </List.Item>
        )}
      />
    </Drawer>
  );
}
