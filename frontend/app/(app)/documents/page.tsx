"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { documentsApi } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { FileUpload } from "@/components/shared/file-upload";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

export default function DocumentsPage() {
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
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: () => toast.error("Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsApi.delete(id),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-muted-foreground text-sm">Upload PDF or DOCX files for AI format checking</p>
      </div>

      <FileUpload
        accept=".pdf,.docx"
        onUpload={async (file) => { await uploadMutation.mutateAsync(file); }}
      />

      {!documents?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium truncate">
                    {doc.original_filename}
                  </CardTitle>
                  <StatusBadge status={doc.conversion_status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {doc.document_type}
                  </Badge>
                  <Badge variant="secondary" className="text-xs uppercase">
                    {doc.original_file_type}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(doc.created_at).toLocaleDateString()}
                </p>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" render={<Link href={`/documents/${doc.id}`} />}>
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </Button>
                <ConfirmDialog
                  title="Delete document?"
                  onConfirm={() => deleteMutation.mutate(doc.id)}
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </ConfirmDialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
