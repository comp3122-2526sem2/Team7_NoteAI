"use client";

import { useCallback, useState } from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface Props {
  accept?: string;
  onUpload: (file: File) => Promise<void>;
  className?: string;
}

export function FileUpload({ accept = ".pdf,.docx", onUpload, className }: Props) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(
    async (f: File) => {
      setFile(f);
      setUploading(true);
      setProgress(30);
      try {
        await onUpload(f);
        setProgress(100);
      } finally {
        setUploading(false);
        setTimeout(() => {
          setFile(null);
          setProgress(0);
        }, 1500);
      }
    },
    [onUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {file ? (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
            {!uploading && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setFile(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {uploading ? "Uploading…" : "Done!"}
          </p>
        </div>
      ) : (
        <>
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Drag & drop a file here</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Supports {accept}
          </p>
          <label className="cursor-pointer">
            <input
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button type="button" variant="outline" size="sm" render={<span />}>
              Browse files
            </Button>
          </label>
        </>
      )}
    </div>
  );
}
