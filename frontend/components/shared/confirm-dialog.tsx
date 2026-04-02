"use client";

import { Popconfirm } from "antd";

interface Props {
  title?: string;
  description?: string;
  onConfirm: () => void;
  children: React.ReactElement;
}

export function ConfirmDialog({
  title = "Are you sure?",
  description = "This action cannot be undone.",
  onConfirm,
  children,
}: Props) {
  return (
    <Popconfirm
      title={title}
      description={description}
      onConfirm={onConfirm}
      okText="Confirm"
      cancelText="Cancel"
      okButtonProps={{ danger: true }}
    >
      {children}
    </Popconfirm>
  );
}
