"use client";

import { List, Modal, Space, Tag, Typography } from "antd";
import type { LessonPlanTemplate } from "@/lib/api";

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  templates: LessonPlanTemplate[];
  loading?: boolean;
  onClose: () => void;
  onSelect: (template: LessonPlanTemplate) => void;
}

export function TemplatePickerModal({
  open,
  templates,
  loading,
  onClose,
  onSelect,
}: Props) {
  return (
    <Modal
      title="Select Template"
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnClose
    >
      <List
        loading={loading}
        dataSource={templates}
        renderItem={(item) => (
          <List.Item
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(item)}
            extra={<Text type="secondary">Click to apply</Text>}
          >
            <List.Item.Meta
              title={
                <Space>
                  <span>{item.name}</span>
                  <Tag>{item.template_type}</Tag>
                </Space>
              }
              description={
                <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                  {item.description || "No description"}
                </Paragraph>
              }
            />
          </List.Item>
        )}
      />
    </Modal>
  );
}
