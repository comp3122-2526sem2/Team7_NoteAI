"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { App, Button, Card, Col, Empty, Row, Space, Typography } from "antd";
import { EyeOutlined, DeleteOutlined } from "@ant-design/icons";
import { documentsApi } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { FileUpload } from "@/components/shared/file-upload";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const { Title, Text } = Typography;

export default function DocumentsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => documentsApi.list().then((r) => r.data),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return documentsApi.upload(formData);
    },
    onSuccess: () => {
      message.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: () => message.error("Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsApi.delete(id),
    onSuccess: () => {
      message.success("Deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: () => message.error("Failed to delete"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Documents</Title>
        <Text type="secondary">Upload PDF or DOCX files for AI format checking</Text>
      </div>

      <div style={{ marginBottom: 32 }}>
        <FileUpload
          accept=".pdf,.docx"
          onUpload={async (file) => { await uploadMutation.mutateAsync(file); }}
        />
      </div>

      {!documents?.length ? (
        <Empty description="No documents uploaded yet." />
      ) : (
        <Row gutter={[16, 16]}>
          {documents.map((doc) => (
            <Col key={doc.id} xs={24} sm={12} lg={8}>
              <Card
                hoverable
                actions={[
                  <Link key="view" href={`/documents/${doc.id}`}>
                    <Button type="link" icon={<EyeOutlined />} size="small">View</Button>
                  </Link>,
                  <ConfirmDialog
                    key="delete"
                    title="Delete document?"
                    onConfirm={() => deleteMutation.mutate(doc.id)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                  </ConfirmDialog>,
                ]}
              >
                <Card.Meta
                  title={
                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                      {doc.original_filename}
                    </span>
                  }
                  description={
                    <Space size={4} wrap>
                      <StatusBadge status={doc.conversion_status} />
                      <Text type="secondary" style={{ fontSize: 11 }}>{doc.original_file_type.toUpperCase()}</Text>
                    </Space>
                  }
                />
                <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: "block" }}>
                  {new Date(doc.created_at).toLocaleDateString()}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
