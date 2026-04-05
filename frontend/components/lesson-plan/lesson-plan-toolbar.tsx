"use client";

import Link from "next/link";
import { Button, Dropdown, Input, Select, Space } from "antd";
import type { MenuProps } from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  HistoryOutlined,
  MoreOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import type { LessonPlanStatus } from "@/lib/api";

interface Props {
  title: string;
  onTitleChange: (value: string) => void;
  status: LessonPlanStatus;
  onStatusChange: (value: LessonPlanStatus) => void;
  onSave: () => void;
  onTemplateOpen: () => void;
  onHistoryOpen: () => void;
  onExportPdf: () => void;
  chapterHref: string;
  onClearContent: () => void;
  onDeletePlan: () => void;
  saving?: boolean;
}

export function LessonPlanToolbar({
  title,
  onTitleChange,
  status,
  onStatusChange,
  onSave,
  onTemplateOpen,
  onHistoryOpen,
  onExportPdf,
  chapterHref,
  onClearContent,
  onDeletePlan,
  saving,
}: Props) {
  const moreItems: MenuProps["items"] = [
    {
      key: "clear",
      label: "Clear lesson plan content",
      onClick: onClearContent,
    },
    {
      key: "delete",
      label: "Delete lesson plan",
      danger: true,
      icon: <DeleteOutlined />,
      onClick: onDeletePlan,
    },
  ];

  return (
    <Space
      wrap
      style={{ width: "100%", justifyContent: "space-between", marginBottom: 12 }}
    >
      <Space wrap>
        <Link href={chapterHref}>
          <Button icon={<ArrowLeftOutlined />}>Back to chapter</Button>
        </Link>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Lesson plan title"
          style={{ width: 280 }}
        />
        <Select<LessonPlanStatus>
          value={status}
          onChange={onStatusChange}
          style={{ width: 140 }}
          options={[
            { value: "draft", label: "Draft" },
            { value: "published", label: "Published" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </Space>

      <Space wrap>
        <Dropdown menu={{ items: moreItems }} trigger={["click"]}>
          <Button icon={<MoreOutlined />}>More</Button>
        </Dropdown>
        <Button onClick={onTemplateOpen}>Templates</Button>
        <Button icon={<HistoryOutlined />} onClick={onHistoryOpen}>
          Version history
        </Button>
        <Button icon={<FilePdfOutlined />} onClick={onExportPdf}>
          Export PDF
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={onSave}
        >
          Save
        </Button>
      </Space>
    </Space>
  );
}
