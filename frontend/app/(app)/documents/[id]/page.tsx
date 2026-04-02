"use client";

import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsApi } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
      toast.success("AI check complete");
      qc.invalidateQueries({ queryKey: ["document", id] });
    },
    onError: () => toast.error("AI check failed"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!doc) return <div>Document not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold truncate">{doc.original_filename}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="capitalize text-xs">{doc.document_type}</Badge>
            <Badge variant="secondary" className="uppercase text-xs">{doc.original_file_type}</Badge>
          </div>
        </div>
        <StatusBadge status={doc.conversion_status} />
      </div>

      {doc.conversion_status === "pending" && (
        <Card>
          <CardContent className="pt-4 flex items-center gap-3 text-muted-foreground">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Converting document…
          </CardContent>
        </Card>
      )}

      {doc.conversion_status === "completed" && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Document Content</CardTitle>
              <Button
                size="sm"
                onClick={() => aiCheckMutation.mutate()}
                disabled={aiCheckMutation.isPending}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                {aiCheckMutation.isPending ? "Checking…" : "Run AI Check"}
              </Button>
            </CardHeader>
            <CardContent>
              {doc.converted_markdown ? (
                <MarkdownRenderer
                  content={doc.converted_markdown}
                  cssStyle={doc.css_style ?? undefined}
                />
              ) : (
                <p className="text-muted-foreground text-sm">No content available.</p>
              )}
            </CardContent>
          </Card>

          {doc.ai_format_feedback && (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Format Feedback
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MarkdownRenderer content={doc.ai_format_feedback} />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {doc.conversion_status === "failed" && (
        <Card>
          <CardContent className="pt-4 text-destructive">
            Document conversion failed. Please try uploading again.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
