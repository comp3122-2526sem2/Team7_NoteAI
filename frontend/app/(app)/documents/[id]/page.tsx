"use client";

import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Divider, Space, Spin, Tag, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { documentsApi } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

const { Title, Text } = Typography;

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => documentsApi.get(id).then((r) => r.data),
    refetchInterval: (query) =>
      query.state.data?.conversion_status === "pending" ? 3000 : false,
  });

  const aiCheckMutation = useMutation({
    mutationFn: () => documentsApi.runAiCheck(id),
    onSuccess: () => {
      message.success("AI check complete");
      qc.invalidateQueries({ queryKey: ["document", id] });
    },
    onError: () => message.error("AI check failed"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!doc) return <div>Document not found.</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0, wordBreak: "break-all" }}>{doc.original_filename}</Title>
          <Space style={{ marginTop: 8 }}>
            <StatusBadge status={doc.conversion_status} />
            <Tag>{doc.document_type}</Tag>
            <Tag>{doc.original_file_type.toUpperCase()}</Tag>
          </Space>
        </div>
      </div>

      {doc.conversion_status === "pending" && (
        <Alert
          icon={<Spin size="small" />}
          type="info"
          message="Converting document…"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {doc.conversion_status === "completed" && (
        <>
          <Card
            title="Document Content"
            extra={
              <Button
                icon={<ThunderboltOutlined />}
                type="primary"
                size="small"
                onClick={() => aiCheckMutation.mutate()}
                loading={aiCheckMutation.isPending}
              >
                Run AI Check
              </Button>
            }
            style={{ marginBottom: 24 }}
          >
            {doc.converted_markdown ? (
              <MarkdownRenderer
                content={doc.converted_markdown}
                cssStyle={doc.css_style ?? undefined}
              />
            ) : (
              <Text type="secondary">No content available.</Text>
            )}
          </Card>

          {doc.ai_format_feedback && (
            <>
              <Divider />
              <Card
                title={
                  <span>
                    <ThunderboltOutlined style={{ color: "#1677ff", marginRight: 8 }} />
                    AI Format Feedback
                  </span>
                }
              >
                <MarkdownRenderer content={doc.ai_format_feedback} />
              </Card>
            </>
          )}
        </>
      )}

      {doc.conversion_status === "failed" && (
        <Alert
          type="error"
          message="Document conversion failed. Please try uploading again."
          showIcon
        />
      )}
    </div>
  );
}
