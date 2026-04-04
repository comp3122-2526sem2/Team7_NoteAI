/**
 * Persists the active syllabus generation job in localStorage so it survives
 * page navigation.  Any component that reads this hook will stay in sync via
 * a cross-tab / cross-component storage event listener.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "syllabus_job";

export interface SyllabusJob {
  courseId: string;
  documentId: string;
}

function readJob(): SyllabusJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SyllabusJob) : null;
  } catch {
    return null;
  }
}

function writeJob(job: SyllabusJob | null) {
  if (typeof window === "undefined") return;
  if (job) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  // Notify other instances of this hook in the same tab
  window.dispatchEvent(new Event("syllabus-job-changed"));
}

export function useSyllabusJob() {
  const [job, setJob] = useState<SyllabusJob | null>(readJob);

  useEffect(() => {
    const sync = () => setJob(readJob());
    window.addEventListener("syllabus-job-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("syllabus-job-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const startJob = useCallback((courseId: string, documentId: string) => {
    const next: SyllabusJob = { courseId, documentId };
    writeJob(next);
    setJob(next);
  }, []);

  const clearJob = useCallback(() => {
    writeJob(null);
    setJob(null);
  }, []);

  return { job, startJob, clearJob };
}
