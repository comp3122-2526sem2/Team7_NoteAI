"use client";

import { useEffect } from "react";
import Link from "next/link";
import { App, Button, notification } from "antd";
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { documentsApi } from "@/lib/api";
import { useSyllabusJob } from "@/hooks/useSyllabusJob";

const NOTIF_KEY = "syllabus-generation";

/**
 * Mounted once in the app layout.  Reads any active syllabus job from
 * localStorage, polls the document status, and shows a persistent
 * notification so the teacher can navigate freely while it runs.
 */
export function SyllabusGenerationBanner() {
  const { job, clearJob } = useSyllabusJob();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [api, contextHolder] = notification.useNotification();

  const { data: doc } = useQuery({
    queryKey: ["syllabus-job", job?.documentId],
    queryFn: () => documentsApi.get(job!.documentId).then((r) => r.data),
    enabled: !!job,
    refetchInterval: (query) =>
      query.state.data?.conversion_status === "pending" ? 3000 : false,
  });

  // Show / update the persistent notification while generating
  useEffect(() => {
    if (!job) {
      api.destroy(NOTIF_KEY);
      return;
    }

    api.open({
      key: NOTIF_KEY,
      message: "Generating Syllabus",
      description: (
        <span>
          AI is building the syllabus for your course.{" "}
          <Link href={`/courses/${job.courseId}`}>View course</Link>
        </span>
      ),
      icon: <LoadingOutlined style={{ color: "#1677ff" }} spin />,
      duration: 0,
      placement: "bottomRight",
    });
  }, [job, api]);

  // React to completion / failure
  useEffect(() => {
    if (!doc || !job) return;

    if (doc.conversion_status === "completed") {
      api.open({
        key: NOTIF_KEY,
        message: "Syllabus Ready",
        description: (
          <span>
            Syllabus generated successfully.{" "}
            <Link href={`/courses/${job.courseId}`}>View course</Link>
          </span>
        ),
        icon: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
        duration: 6,
        placement: "bottomRight",
      });
      qc.invalidateQueries({ queryKey: ["course", job.courseId] });
      clearJob();
    } else if (doc.conversion_status === "failed") {
      api.open({
        key: NOTIF_KEY,
        message: "Syllabus Generation Failed",
        description: "Something went wrong. Please try uploading the file again.",
        icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
        duration: 8,
        placement: "bottomRight",
      });
      clearJob();
    }
  }, [doc, job, api, qc, clearJob, message]);

  return <>{contextHolder}</>;
}
