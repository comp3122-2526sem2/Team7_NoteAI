"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { App, ConfigProvider } from "antd";
import { StyleProvider } from "@ant-design/cssinjs";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StyleProvider layer>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#1677ff",
            borderRadius: 8,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          },
        }}
      >
        <App>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </App>
      </ConfigProvider>
    </StyleProvider>
  );
}
