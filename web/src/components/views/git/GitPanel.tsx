import { type Component, Show, createEffect } from "solid-js";
import { FiGitBranch } from "solid-icons/fi";
import type { AgentResponse } from "../../../lib/api";
import { gitStore } from "../../../stores/gitStore";
import { sessionStore } from "../../../stores/sessions";
import RepoHeader from "./RepoHeader";
import ChangesSection from "./ChangesSection";
import DiffViewer from "./DiffViewer";
import CommitHistory from "./CommitHistory";
import PullRequestSection from "./PullRequestSection";
import CIChecksSection from "./CIChecksSection";

// =============================================================================
// GIT PANEL — Right sidebar container
// =============================================================================
// Phase 1.2: RepoHeader, ChangesSection, DiffViewer
// Phase 1.3: CommitHistory
// Phase 2.1: PullRequestSection (checks, reviews, merge readiness)
// Phase 2.2: CIChecksSection (pipeline tracking with job details)

interface GitPanelProps {
  /** Active agent (used to resolve repos via capabilityRefs) */
  agent: AgentResponse | null;
}

const GitPanel: Component<GitPanelProps> = (props) => {
  // Sync gitStore with active agent
  createEffect(() => {
    const agent = props.agent;
    if (agent) {
      gitStore.setAgent(agent.metadata.namespace, agent.metadata.name);
    }
  });

  // Sync gitStore with active session
  createEffect(() => {
    gitStore.setSession(sessionStore.state.activeSessionId);
  });

  return (
    <div class="flex flex-col h-full">
      {/* Panel header */}
      <div class="shrink-0 h-[40px] flex items-center px-3 border-b border-border">
        <FiGitBranch class="w-3.5 h-3.5 text-text-muted mr-2" />
        <span class="text-sm font-semibold text-text">Git</span>
      </div>

      {/* Panel content */}
      <div class="flex-1 min-h-0 flex flex-col">
        <Show
          when={props.agent}
          fallback={
            <div class="flex flex-col items-center justify-center h-full px-6 text-center">
              <FiGitBranch class="w-6 h-6 text-text-muted/30 mb-2" />
              <p class="text-xs text-text-muted">No agent selected</p>
            </div>
          }
        >
          {/* Scrollable top section: repo + changes */}
          <div class="flex-1 min-h-0 overflow-y-auto">
            {/* Repo header (branch, ahead/behind, SHA) */}
            <RepoHeader
              vcs={gitStore.state.vcs}
              repositories={gitStore.state.repositories}
              loading={gitStore.state.loading.vcs || gitStore.state.loading.repos}
              onRefresh={() => gitStore.refresh()}
            />

            {/* Changed files list */}
            <ChangesSection
              diffs={gitStore.state.diffs}
              selectedFile={gitStore.state.selectedFile}
              loading={gitStore.state.loading.diffs}
              totalAdditions={gitStore.totalAdditions()}
              totalDeletions={gitStore.totalDeletions()}
              onSelectFile={(file) => gitStore.selectFile(file)}
            />

            {/* Commit history */}
            <CommitHistory
              commits={gitStore.state.commits}
              loading={gitStore.state.loading.commits}
            />

            {/* Pull Requests */}
            <PullRequestSection
              pullRequests={gitStore.state.pullRequests}
              loading={gitStore.state.loading.pullRequests}
            />

            {/* CI/CD Pipelines */}
            <CIChecksSection
              pipelines={gitStore.state.pipelines}
              loading={gitStore.state.loading.pipelines}
            />
          </div>

          {/* Diff viewer (anchored to bottom, shown when a file is selected) */}
          <Show when={gitStore.selectedDiff()}>
            <div class="shrink-0 max-h-[40%] min-h-[120px] flex flex-col">
              <DiffViewer
                diff={gitStore.selectedDiff()}
                onClose={() => gitStore.selectFile(null)}
              />
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default GitPanel;
