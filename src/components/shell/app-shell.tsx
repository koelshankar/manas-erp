import { Suspense, type ReactNode } from "react";
import { TopNav } from "./top-nav";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-background">
        <TopNav />
        {/*
          Pages read `?new=1` (see useNewParam) to open their own create
          dialog, and useSearchParams() bails out of prerendering without a
          boundary above it. One here covers every page.
        */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-6 lg:py-10">
          <Suspense>{children}</Suspense>
        </main>
        <footer className="border-t border-border py-5">
          <p className="mx-auto max-w-[1600px] px-4 text-xs text-muted-foreground sm:px-6">
            Manas Developers — Developer ERP
          </p>
        </footer>
        {/* Top-right: dialog footers live bottom-right, and a toast there would
            sit on top of the very button that raised it. */}
        <Toaster position="top-right" />
      </div>
    </TooltipProvider>
  );
}
