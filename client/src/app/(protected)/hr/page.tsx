"use client";

import { useRef, useState } from "react";
import { BarChart3, FileSpreadsheet, UserRound, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/feature/fade-in";
import { InterviewerSection } from "@/components/feature/admin/interviewer-section";
import { CandidateSection } from "@/components/feature/admin/candidate-section";
import { HrReportsSection } from "@/components/feature/admin/hr-reports-section";
import { BulkImportSection } from "@/components/feature/admin/bulk-import-section";
import type { BulkTemplateKind } from "@/contracts";

type HrTab = "interviewers" | "candidates" | "bulk" | "reports";

export default function HrHomePage() {
  const [tab, setTab] = useState<HrTab>("interviewers");
  // Bumping these counters forces the matching section to re-mount and re-fetch
  // after a bulk import lands a batch of new rows.
  const [refreshTokens, setRefreshTokens] = useState({
    candidates: 0,
    interviewers: 0,
  });
  // Only bump the refresh token — leave the user on the Bulk import tab so the
  // success toast (and the temp-password dialog for interviewers) stays
  // visible. The matching list will be fresh when they navigate.
  const onImported = useRef((kind: BulkTemplateKind) => {
    setRefreshTokens((r) => ({ ...r, [kind]: r[kind] + 1 }));
  }).current;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <FadeIn y={12}>
        <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.18em]">
          hr console
        </p>
        <h1 className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
          People &amp; sessions
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage interviewers, candidates, and review past interview sessions.
        </p>
      </FadeIn>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as HrTab)}
        className="gap-6"
      >
        <TabsList variant="line" className="self-start">
          <TabsTrigger value="interviewers">
            <Users className="mr-1.5 h-4 w-4" />
            Interviewers
          </TabsTrigger>
          <TabsTrigger value="candidates">
            <UserRound className="mr-1.5 h-4 w-4" />
            Candidates
          </TabsTrigger>
          <TabsTrigger value="bulk">
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />
            Bulk import
          </TabsTrigger>
          <TabsTrigger value="reports">
            <BarChart3 className="mr-1.5 h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interviewers">
          <InterviewerSection key={`int-${refreshTokens.interviewers}`} />
        </TabsContent>

        <TabsContent value="candidates">
          <CandidateSection key={`cand-${refreshTokens.candidates}`} />
        </TabsContent>

        <TabsContent value="bulk">
          <BulkImportSection onImported={onImported} />
        </TabsContent>

        <TabsContent value="reports">
          <HrReportsSection />
        </TabsContent>
      </Tabs>
    </main>
  );
}
