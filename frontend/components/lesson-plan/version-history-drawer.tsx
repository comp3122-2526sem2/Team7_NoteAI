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
      title="Version History"
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
                Preview
              </Button>,
              <Button
                key="restore"
                type="primary"
                size="small"
                loading={restoring}
                onClick={() => onRestore(item.id)}
              >
                Restore
              </Button>,
              <Popconfirm
                key="delete"
                title="Delete this version?"
                description="This only deletes the historical snapshot and does not affect the current lesson plan."
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
                onConfirm={() => onDeleteVersion(item.id)}
              >
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={deletingVersionId === item.id}
                >
                  Delete
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
              description={item.saved_by ? `Saved by: ${item.saved_by}` : "Saved by: Unknown"}
            />
          </List.Item>
        )}
      />
    </Drawer>
  );
}
