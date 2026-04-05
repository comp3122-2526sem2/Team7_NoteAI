"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Row,
  Space,
  Spin,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  chaptersApi,
  lessonPlanTemplatesApi,
  lessonPlansApi,
  type LessonPlan,
  type LessonPlanConfig,
  type LessonPlanOutputLanguage,
  type LessonPlanStatus,
  type LessonPlanStylePreset,
  type LessonPlanVersionDetail,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { MarkdownInput } from "@/components/shared/markdown-input";
import { LessonPlanToolbar } from "@/components/lesson-plan/lesson-plan-toolbar";
import { LessonPlanConfigPanel } from "@/components/lesson-plan/lesson-plan-config-panel";
import { LessonPlanAiSettings } from "@/components/lesson-plan/lesson-plan-ai-settings";
import { LessonPlanMaterialsScope } from "@/components/lesson-plan/lesson-plan-materials-scope";
import { TemplatePickerModal } from "@/components/lesson-plan/template-picker-modal";
import { VersionHistoryDrawer } from "@/components/lesson-plan/version-history-drawer";
import { SelectionAiFloat } from "@/components/lesson-plan/selection-ai-float";

const { Title, Text, Paragraph } = Typography;

const DEFAULT_CONFIG: LessonPlanConfig = {
  topic: "",
  teaching_method: [],
  teaching_content: "",
  duration_minutes: 40,
  difficulty: "intermediate",
  student_level: "medium",
  assessment: [],
  objectives: [],
};

const EDITOR_MIN_PX = 480;

type AiUi = {
  output_language?: LessonPlanOutputLanguage;
  style_preset?: LessonPlanStylePreset;
  focus_instruction?: string;
  selected_document_ids?: string[];
  selected_focus_keywords?: string[];
};

type LessonPlanAiUiPayload = {
  outputLanguage: LessonPlanOutputLanguage;
  stylePreset: LessonPlanStylePreset;
  focusInstruction: string;
  selectedDocumentIds: string[];
  selectedFocusKeywords: string[];
};

function mergeConfigWithAiUi(base: LessonPlanConfig, ai: LessonPlanAiUiPayload): LessonPlanConfig {
  return {
    ...base,
    ai_ui: {
      output_language: ai.outputLanguage,
      style_preset: ai.stylePreset,
      focus_instruction: ai.focusInstruction,
      selected_document_ids: ai.selectedDocumentIds,
      selected_focus_keywords: ai.selectedFocusKeywords,
    },
  };
}

function buildAiPayload(
  outputLanguage: LessonPlanOutputLanguage,
  stylePreset: LessonPlanStylePreset,
  focusInstruction: string,
  selectedDocumentIds: string[],
  selectedFocusKeywords: string[]
): LessonPlanAiUiPayload {
  return {
    outputLanguage,
    stylePreset,
    focusInstruction,
    selectedDocumentIds,
    selectedFocusKeywords,
  };
}

function fingerprintFromPlan(p: LessonPlan): string {
  const c = (p.config as LessonPlanConfig) || DEFAULT_CONFIG;
  const ai = c.ai_ui as AiUi | undefined;
  return JSON.stringify(
    mergeConfigWithAiUi(
      c,
      buildAiPayload(
        ai?.output_language ?? "zh",
        ai?.style_preset ?? "balanced",
        (ai?.focus_instruction as string) ?? "",
        (ai?.selected_document_ids as string[]) ?? [],
        (ai?.selected_focus_keywords as string[]) ?? []
      )
    )
  );
}

export default function LessonPlanPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id: courseId, cid: chapterId } = use(params);
  const router = useRouter();
  const chapterHref = `/courses/${courseId}/chapters/${chapterId}`;
  const { isTeacher } = useAuth();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const editorWrapRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState<string | null>(null);
  const [status, setStatus] = useState<LessonPlanStatus | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [config, setConfig] = useState<LessonPlanConfig | null>(null);
  const [cssStyle, setCssStyle] = useState<string | null>(null);

  const [outputLanguage, setOutputLanguage] = useState<LessonPlanOutputLanguage>("zh");
  const [stylePreset, setStylePreset] = useState<LessonPlanStylePreset>("balanced");
  const [aiFocus, setAiFocus] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedFocusKeywords, setSelectedFocusKeywords] = useState<string[]>([]);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<LessonPlanVersionDetail | null>(
    null
  );
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(false);
  const [autoSyncReady, setAutoSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">(
    "idle"
  );

  const lastSavedFingerprint = useRef<string | null>(null);
  const syncDebounceRef = useRef<number | null>(null);
  const syncPayloadRef = useRef(
    mergeConfigWithAiUi(DEFAULT_CONFIG, buildAiPayload("zh", "balanced", "", [], []))
  );

  const planQuery = useQuery({
    queryKey: ["lesson-plan", courseId, chapterId],
    queryFn: () => lessonPlansApi.get(courseId, chapterId).then((r) => r.data),
    retry: false,
  });

  const plan = planQuery.data;
  const planNotFound = axios.isAxiosError(planQuery.error) && planQuery.error.response?.status === 404;
  const currentTitle = title ?? plan?.title ?? "Untitled Lesson Plan";
  const currentStatus = status ?? plan?.status ?? "draft";
  const currentContent = content ?? plan?.content ?? "";
  const currentConfig = config ?? (plan?.config as LessonPlanConfig) ?? DEFAULT_CONFIG;
  const currentCssStyle = cssStyle ?? plan?.css_style ?? "";

  const docsQuery = useQuery({
    queryKey: ["chapter-documents", courseId, chapterId],
    queryFn: () => chaptersApi.listDocuments(courseId, chapterId).then((r) => r.data),
    enabled: isTeacher && !planNotFound,
  });

  const templatesQuery = useQuery({
    queryKey: ["lesson-plan-templates"],
    queryFn: () => lessonPlanTemplatesApi.list().then((r) => r.data),
    enabled: templateOpen,
  });

  const versionsQuery = useQuery({
    queryKey: ["lesson-plan-versions", courseId, chapterId],
    queryFn: () => lessonPlansApi.listVersions(courseId, chapterId).then((r) => r.data),
    enabled: historyOpen && !planNotFound && isTeacher,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      lessonPlansApi.create(courseId, chapterId, {
        title: currentTitle,
        config: mergeConfigWithAiUi(
          currentConfig,
          buildAiPayload(
            outputLanguage,
            stylePreset,
            aiFocus,
            selectedDocumentIds,
            selectedFocusKeywords
          )
        ),
      }),
    onSuccess: (res) => {
      hydratePlanState(res.data);
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, chapterId] });
      message.success("已建立教案");
    },
    onError: () => message.error("無法建立教案"),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      lessonPlansApi.update(courseId, chapterId, {
        title: currentTitle,
        content: currentContent,
        config: mergeConfigWithAiUi(
          currentConfig,
          buildAiPayload(
            outputLanguage,
            stylePreset,
            aiFocus,
            selectedDocumentIds,
            selectedFocusKeywords
          )
        ),
        css_style: currentCssStyle,
        status: currentStatus,
      }),
    onSuccess: (res) => {
      hydratePlanState(res.data);
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, chapterId] });
      qc.invalidateQueries({ queryKey: ["lesson-plan-versions", courseId, chapterId] });
      message.success("已儲存");
    },
    onError: () => message.error("儲存失敗"),
  });

  const aiGenerateMutation = useMutation({
    mutationFn: () => {
      const completedIds =
        docsQuery.data?.filter((d) => d.conversion_status === "completed").map((d) => d.id) ??
        [];
      return lessonPlansApi.aiGenerate(courseId, chapterId, {
        instruction: aiFocus.trim() || undefined,
        output_language: outputLanguage,
        style_preset: stylePreset,
        document_ids: completedIds.length > 0 ? selectedDocumentIds : undefined,
        focus_keywords: selectedFocusKeywords.length > 0 ? selectedFocusKeywords : undefined,
      });
    },
    onSuccess: (res) => {
      hydratePlanState(res.data);
      qc.invalidateQueries({ queryKey: ["lesson-plan-versions", courseId, chapterId] });
      message.success("AI 已產生教案");
    },
    onError: () => message.error("AI 產生失敗"),
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      lessonPlansApi.restoreVersion(courseId, chapterId, versionId),
    onSuccess: (res) => {
      hydratePlanState(res.data);
      qc.invalidateQueries({ queryKey: ["lesson-plan-versions", courseId, chapterId] });
      message.success("已還原版本");
      setHistoryOpen(false);
    },
    onError: () => message.error("還原失敗"),
  });

  const regenerateSectionMutation = useMutation({
    mutationFn: (vars: { original_section: string; instruction: string }) =>
      lessonPlansApi.aiRegenerateSection(courseId, chapterId, {
        original_section: vars.original_section,
        instruction: vars.instruction,
        context_config: mergeConfigWithAiUi(
          currentConfig,
          buildAiPayload(
            outputLanguage,
            stylePreset,
            aiFocus,
            selectedDocumentIds,
            selectedFocusKeywords
          )
        ),
        output_language: outputLanguage,
        style_preset: stylePreset,
      }),
    onSuccess: (res, vars) => {
      setContent((prev) => {
        const base = prev ?? currentContent;
        return base.replace(vars.original_section, res.data.content);
      });
      message.success("已重寫選取段落");
    },
    onError: () => message.error("重寫失敗"),
  });

  const clearContentMutation = useMutation({
    mutationFn: () =>
      lessonPlansApi.update(courseId, chapterId, {
        content: "",
        config: DEFAULT_CONFIG,
        css_style: "",
      }),
    onSuccess: (res) => {
      hydratePlanState(res.data);
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, chapterId] });
      qc.invalidateQueries({ queryKey: ["lesson-plan-versions", courseId, chapterId] });
      message.success("已清空教案內容");
    },
    onError: () => message.error("清空失敗"),
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => lessonPlansApi.delete(courseId, chapterId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, chapterId] });
      message.success("已刪除教案");
      router.push(chapterHref);
    },
    onError: () => message.error("刪除失敗"),
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (versionId: string) =>
      lessonPlansApi.deleteVersion(courseId, chapterId, versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-plan-versions", courseId, chapterId] });
      message.success("已刪除版本");
    },
    onError: () => message.error("刪除版本失敗"),
  });

  const hydratePlanState = (next: LessonPlan) => {
    setTitle(next.title);
    setStatus(next.status);
    setContent(next.content);
    const c = (next.config as LessonPlanConfig) || DEFAULT_CONFIG;
    setConfig(c);
    const ai = c.ai_ui as AiUi | undefined;
    setOutputLanguage(ai?.output_language ?? "zh");
    setStylePreset(ai?.style_preset ?? "balanced");
    setAiFocus(ai?.focus_instruction ?? "");
    setSelectedDocumentIds((ai?.selected_document_ids as string[]) ?? []);
    setSelectedFocusKeywords((ai?.selected_focus_keywords as string[]) ?? []);
    setCssStyle(next.css_style ?? "");
    lastSavedFingerprint.current = fingerprintFromPlan(next);
  };

  const autoSyncMutation = useMutation({
    mutationFn: (payload: { config: LessonPlanConfig }) =>
      lessonPlansApi.update(courseId, chapterId, {
        config: payload.config,
        skip_version: true,
      }),
    onMutate: () => setSyncStatus("syncing"),
    onSuccess: (res) => {
      qc.setQueryData(["lesson-plan", courseId, chapterId], res.data);
      lastSavedFingerprint.current = fingerprintFromPlan(res.data);
      setSyncStatus("synced");
      window.setTimeout(() => setSyncStatus("idle"), 2000);
    },
    onError: () => {
      setSyncStatus("error");
      message.error("設定同步失敗");
    },
  });

  useEffect(() => {
    if (!plan || planNotFound) {
      setAutoSyncReady(false);
      return;
    }
    setAutoSyncReady(false);
    const t = window.setTimeout(() => setAutoSyncReady(true), 800);
    return () => window.clearTimeout(t);
  }, [plan?.id, planNotFound]);

  useEffect(() => {
    if (!plan || planNotFound) return;
    lastSavedFingerprint.current = fingerprintFromPlan(plan);
    const c = (plan.config as LessonPlanConfig) || DEFAULT_CONFIG;
    const ai = c.ai_ui as AiUi | undefined;
    setOutputLanguage(ai?.output_language ?? "zh");
    setStylePreset(ai?.style_preset ?? "balanced");
    setAiFocus(ai?.focus_instruction ?? "");
    setSelectedDocumentIds((ai?.selected_document_ids as string[]) ?? []);
    setSelectedFocusKeywords((ai?.selected_focus_keywords as string[]) ?? []);
    setConfig(c);
  }, [plan?.id, planNotFound]);

  useEffect(() => {
    if (!docsQuery.data?.length || !plan) return;
    const ai = (plan.config as LessonPlanConfig)?.ai_ui as AiUi | undefined;
    if (ai && Object.prototype.hasOwnProperty.call(ai, "selected_document_ids")) {
      return;
    }
    const completed = docsQuery.data
      .filter((d) => d.conversion_status === "completed")
      .map((d) => d.id);
    if (completed.length) setSelectedDocumentIds(completed);
  }, [docsQuery.data, plan?.id, plan?.config]);

  syncPayloadRef.current = mergeConfigWithAiUi(
    currentConfig,
    buildAiPayload(
      outputLanguage,
      stylePreset,
      aiFocus,
      selectedDocumentIds,
      selectedFocusKeywords
    )
  );

  useEffect(() => {
    if (!autoSyncReady || !plan || planNotFound || aiSidebarCollapsed) return;
    const merged = syncPayloadRef.current;
    const fp = JSON.stringify(merged);
    if (lastSavedFingerprint.current !== null && fp === lastSavedFingerprint.current) {
      return;
    }
    if (syncDebounceRef.current) window.clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = window.setTimeout(() => {
      const next = syncPayloadRef.current;
      if (
        lastSavedFingerprint.current !== null &&
        JSON.stringify(next) === lastSavedFingerprint.current
      ) {
        return;
      }
      autoSyncMutation.mutate({ config: next });
    }, 1000);
    return () => {
      if (syncDebounceRef.current) window.clearTimeout(syncDebounceRef.current);
    };
  }, [
    autoSyncReady,
    aiSidebarCollapsed,
    outputLanguage,
    stylePreset,
    aiFocus,
    config,
    currentConfig,
    planNotFound,
    selectedDocumentIds,
    selectedFocusKeywords,
  ]);

  const handleAIGenerate = () => {
    const run = () => aiGenerateMutation.mutateAsync();
    if (currentContent.trim()) {
      modal.confirm({
        title: "確認覆寫？",
        content: "目前已有內容，AI 產生會取代現有教案文字。",
        okText: "產生",
        cancelText: "取消",
        onOk: () => run(),
      });
    } else {
      run();
    }
  };

  const handleTemplateApply = (template: {
    content: string;
    default_config?: LessonPlanConfig;
    name: string;
  }) => {
    setContent(template.content);
    setConfig((template.default_config as LessonPlanConfig) || DEFAULT_CONFIG);
    if (!currentTitle || currentTitle === "Untitled Lesson Plan") {
      setTitle(template.name);
    }
    setTemplateOpen(false);
    message.success("已套用範本");
  };

  const handlePreviewVersion = async (versionId: string) => {
    try {
      const { data } = await lessonPlansApi.getVersion(courseId, chapterId, versionId);
      setPreviewVersion(data);
    } catch {
      message.error("無法載入版本內容");
    }
  };

  const handleClearContent = () => {
    modal.confirm({
      title: "清空教案內容？",
      content: "會移除正文並將右側設定重設為預設；教案仍保留，可重新編輯。",
      okText: "清空",
      okType: "danger",
      cancelText: "取消",
      onOk: () => clearContentMutation.mutateAsync(),
    });
  };

  const handleDeletePlan = () => {
    modal.confirm({
      title: "刪除整份教案？",
      content: "此章節的教案與所有版本紀錄將一併刪除，無法復原。",
      okText: "刪除",
      okType: "danger",
      cancelText: "取消",
      onOk: () => deletePlanMutation.mutateAsync(),
    });
  };

  const handleExportPdf = async () => {
    try {
      const res = await lessonPlansApi.exportPdf(courseId, chapterId);
      const url = window.URL.createObjectURL(res.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${currentTitle || "lesson-plan"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error("匯出 PDF 失敗");
    }
  };

  const docsPending = docsQuery.data?.some((d) => d.conversion_status === "pending");
  const hasUploadedDocs = (docsQuery.data?.length ?? 0) > 0;

  if (!isTeacher) {
    if (planQuery.isLoading) return <LoadingSpinner />;
    if (planQuery.isError || !plan) {
      return (
        <div>
          <Title level={3}>教案</Title>
          <Empty
            style={{ marginTop: 24 }}
            description="教案尚未發佈，或此章節尚未建立教案。"
          />
        </div>
      );
    }
    if (plan.status === "published") {
      return (
        <div>
          <Title level={3} style={{ marginTop: 0 }}>
            {plan.title}
          </Title>
          <Text type="secondary">已發佈教案（唯讀）</Text>
          <Card style={{ marginTop: 16 }}>
            <MarkdownRenderer content={plan.content} />
          </Card>
        </div>
      );
    }
    return (
      <div>
        <Title level={3}>教案</Title>
        <Empty description="教案尚未發佈。" />
      </div>
    );
  }

  if (planQuery.isLoading) return <LoadingSpinner />;

  return (
    <div>
      <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
        教案編輯器
      </Title>
      <Text type="secondary">
        每個章節一份教案。左邊編輯、右邊即時預覽（同寬）；右側為 AI 與選填設定。
      </Text>

      <div style={{ marginTop: 16 }}>
        {planNotFound ? (
          <Card>
            <Empty description="此章節尚未建立教案。">
              <Button
                type="primary"
                loading={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                建立教案
              </Button>
            </Empty>
          </Card>
        ) : (
          <>
            <LessonPlanToolbar
              title={currentTitle}
              onTitleChange={setTitle}
              status={currentStatus}
              onStatusChange={setStatus}
              onSave={() => saveMutation.mutate()}
              onTemplateOpen={() => setTemplateOpen(true)}
              onHistoryOpen={() => setHistoryOpen(true)}
              onExportPdf={handleExportPdf}
              chapterHref={chapterHref}
              onClearContent={handleClearContent}
              onDeletePlan={handleDeletePlan}
              saving={saveMutation.isPending}
            />

            {docsQuery.isSuccess && (
              <Alert
                style={{ marginBottom: 12 }}
                type={docsPending ? "warning" : hasUploadedDocs ? "success" : "info"}
                showIcon
                message={
                  docsPending
                    ? "仍有教材正在處理，完成後 AI 會更能對準你的檔案。"
                    : hasUploadedDocs
                      ? "章節教材已就緒，AI 會優先使用上傳內容。"
                      : "尚未上傳章節教材；建議先於章節頁上傳檔案再產生教案。"
                }
              />
            )}

            <Row gutter={[16, 16]} align="stretch">
              <Col xs={aiSidebarCollapsed ? 22 : 24} lg={aiSidebarCollapsed ? 23 : 16}>
                <Card
                  title="教案內容"
                  style={{ minHeight: "70vh" }}
                  styles={{ body: { minHeight: "calc(70vh - 57px)" } }}
                >
                  <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    左側編輯、右側即時預覽（同寬）。選取文字可浮動「AI 重寫」。
                  </Paragraph>
                  <Row gutter={[16, 16]} align="stretch">
                    <Col xs={24} md={12} style={{ display: "flex" }}>
                      <div
                        ref={editorWrapRef}
                        style={{ position: "relative", width: "100%", minHeight: EDITOR_MIN_PX }}
                      >
                        <MarkdownInput
                          value={currentContent}
                          onChange={setContent}
                          minHeight={EDITOR_MIN_PX}
                        />
                        <SelectionAiFloat
                          containerRef={editorWrapRef}
                          loading={regenerateSectionMutation.isPending}
                          onRegenerate={(selectedText, instruction) =>
                            regenerateSectionMutation.mutate({
                              original_section: selectedText,
                              instruction,
                            })
                          }
                        />
                      </div>
                    </Col>
                    <Col xs={24} md={12} style={{ display: "flex" }}>
                      <div
                        style={{
                          border: "1px solid #f0f0f0",
                          borderRadius: 8,
                          padding: 16,
                          minHeight: EDITOR_MIN_PX,
                          flex: 1,
                          overflow: "auto",
                          background: "#fafafa",
                        }}
                      >
                        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                          即時預覽
                        </Text>
                        <MarkdownRenderer content={currentContent} />
                      </div>
                    </Col>
                  </Row>
                </Card>
              </Col>
              {aiSidebarCollapsed && (
                <Col xs={2} lg={1}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      position: "sticky",
                      top: 72,
                      alignSelf: "flex-start",
                      paddingTop: 8,
                    }}
                  >
                    <Tooltip title="展開 AI 設定">
                      <Button
                        type="default"
                        aria-label="展開 AI 設定"
                        icon={<MenuUnfoldOutlined />}
                        onClick={() => setAiSidebarCollapsed(false)}
                        style={{
                          minWidth: 36,
                          height: 112,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 4px",
                        }}
                      />
                    </Tooltip>
                  </div>
                </Col>
              )}
              {!aiSidebarCollapsed && (
                <Col xs={24} lg={8}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <Space size="small">
                        {syncStatus === "syncing" || autoSyncMutation.isPending ? (
                          <>
                            <Spin size="small" />
                            <Text type="secondary" style={{ fontSize: 13 }}>
                              同步中…
                            </Text>
                          </>
                        ) : syncStatus === "synced" ? (
                          <>
                            <CheckCircleOutlined style={{ color: "#52c41a" }} />
                            <Text type="secondary" style={{ fontSize: 13 }}>
                              已同步
                            </Text>
                          </>
                        ) : syncStatus === "error" ? (
                          <Text type="danger" style={{ fontSize: 13 }}>
                            同步失敗
                          </Text>
                        ) : (
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            設定會自動儲存
                          </Text>
                        )}
                      </Space>
                      <Button
                        type="text"
                        size="small"
                        icon={<MenuFoldOutlined />}
                        onClick={() => setAiSidebarCollapsed(true)}
                      >
                        收合
                      </Button>
                    </div>
                    <LessonPlanMaterialsScope
                      courseId={courseId}
                      chapterId={chapterId}
                      documents={docsQuery.data ?? []}
                      selectedDocumentIds={selectedDocumentIds}
                      onDocumentSelectionChange={setSelectedDocumentIds}
                      selectedKeywords={selectedFocusKeywords}
                      onKeywordSelectionChange={setSelectedFocusKeywords}
                    />
                    <LessonPlanAiSettings
                      outputLanguage={outputLanguage}
                      stylePreset={stylePreset}
                      focusInstruction={aiFocus}
                      onOutputLanguageChange={setOutputLanguage}
                      onStylePresetChange={setStylePreset}
                      onFocusChange={setAiFocus}
                    />
                    <LessonPlanConfigPanel value={currentConfig} onChange={setConfig} />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto" }}>
                      <Button
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        loading={aiGenerateMutation.isPending}
                        onClick={handleAIGenerate}
                      >
                        AI 產生
                      </Button>
                    </div>
                  </div>
                </Col>
              )}
            </Row>
          </>
        )}
      </div>

      <TemplatePickerModal
        open={templateOpen}
        templates={templatesQuery.data ?? []}
        loading={templatesQuery.isLoading}
        onClose={() => setTemplateOpen(false)}
        onSelect={handleTemplateApply}
      />

      <VersionHistoryDrawer
        open={historyOpen}
        versions={versionsQuery.data ?? []}
        loading={versionsQuery.isLoading}
        restoring={restoreMutation.isPending}
        deletingVersionId={
          deleteVersionMutation.isPending && deleteVersionMutation.variables
            ? deleteVersionMutation.variables
            : null
        }
        onClose={() => setHistoryOpen(false)}
        onPreview={handlePreviewVersion}
        onRestore={(versionId) => restoreMutation.mutate(versionId)}
        onDeleteVersion={(versionId) => deleteVersionMutation.mutate(versionId)}
      />

      <Modal
        open={!!previewVersion}
        title={previewVersion ? `預覽 v${previewVersion.version_number}` : "預覽"}
        footer={null}
        onCancel={() => setPreviewVersion(null)}
        width={860}
      >
        <MarkdownRenderer content={previewVersion?.snapshot_content ?? ""} />
      </Modal>
    </div>
  );
}
