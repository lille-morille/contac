import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "../lib/auth.tsx";
import { OrgProvider } from "../lib/org.tsx";
import { TeamRealtimeProvider } from "../lib/team-realtime.tsx";
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={client}>
        <AuthProvider>
          <OrgProvider>
            <TeamRealtimeProvider>{children}</TeamRealtimeProvider>
          </OrgProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
