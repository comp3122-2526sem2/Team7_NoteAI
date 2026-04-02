import { Spin } from "antd";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "48px 0" }}
    >
      <Spin size="large" />
    </div>
  );
}
