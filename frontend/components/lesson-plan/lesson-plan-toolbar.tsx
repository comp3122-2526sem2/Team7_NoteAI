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
      label: "清空教案內容",
      onClick: onClearContent,
    },
    {
      key: "delete",
      label: "刪除整份教案",
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
          <Button icon={<ArrowLeftOutlined />}>返回章節</Button>
        </Link>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="教案標題"
          style={{ width: 280 }}
        />
        <Select<LessonPlanStatus>
          value={status}
          onChange={onStatusChange}
          style={{ width: 140 }}
          options={[
            { value: "draft", label: "草稿" },
            { value: "published", label: "已發佈" },
            { value: "archived", label: "已封存" },
          ]}
        />
      </Space>

      <Space wrap>
        <Dropdown menu={{ items: moreItems }} trigger={["click"]}>
          <Button icon={<MoreOutlined />}>更多</Button>
        </Dropdown>
        <Button onClick={onTemplateOpen}>範本</Button>
        <Button icon={<HistoryOutlined />} onClick={onHistoryOpen}>
          版本紀錄
        </Button>
        <Button icon={<FilePdfOutlined />} onClick={onExportPdf}>
          匯出 PDF
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={onSave}
        >
          儲存
        </Button>
      </Space>
    </Space>
  );
}
