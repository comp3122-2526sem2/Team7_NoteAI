"use client";

import { useState } from "react";
import { Upload, Progress, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";

const { Dragger } = Upload;

interface Props {
  accept?: string;
  onUpload: (file: File) => Promise<void>;
}

export function FileUpload({ accept = ".pdf,.docx", onUpload }: Props) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleCustomRequest = async ({ file, onSuccess, onError }: {
    file: File | string | Blob;
    onSuccess?: (body: unknown) => void;
    onError?: (err: Error) => void;
  }) => {
    if (!(file instanceof File)) return;
    setUploading(true);
    setProgress(30);
    try {
      await onUpload(file);
      setProgress(100);
      onSuccess?.("ok");
      setTimeout(() => setProgress(0), 1500);
    } catch (err) {
      onError?.(err as Error);
      message.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Dragger
        accept={accept}
        showUploadList={false}
        customRequest={handleCustomRequest as Parameters<typeof Dragger>[0]["customRequest"]}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Click or drag file to this area to upload</p>
        <p className="ant-upload-hint">Supports {accept}</p>
      </Dragger>
      {(uploading || progress > 0) && (
        <Progress percent={progress} style={{ marginTop: 8 }} />
      )}
    </div>
  );
}
