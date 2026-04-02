import { createRoot, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import {
  getAgentVCS,
  getSessionDiff,
  getAgentGitContext,
  getAgentCommits,
  getAgentPRs,
  getAgentPipelines,
  type VCSInfo,
  type SessionDiffFile,
  type GitRepoInfo,
  type CommitInfo,
  type EnrichedPullRequest,
  type PipelineInfo,
} from "../lib/api";
import { subscribe as subscribeToEventBus } from "../lib/event-bus";
import type { FileDiff } from "../types/acp";

// =============================================================================
// TYPES
// =============================================================================

export interface GitState {
  /** VCS info (branch, sha, ahead/behind) */
  vcs: VCSInfo | null;
  /** Current file diffs for the active session */
  diffs: SessionDiffFile[];
  /** Repositories from the agent's capabilityRefs */
  repositories: GitRepoInfo[];
  /** Recent commits for the agent's primary repository */
  commits: CommitInfo[];
  /** Pull requests for the agent's primary repository */
  pullRequests: EnrichedPullRequest[];
  /** CI/CD pipelines for the agent's primary repository */
  pipelines: PipelineInfo[];
  /** Currently selected file for diff viewing */
  selectedFile: string | null;
  /** Loading states */
  loading: {
    vcs: boolean;
    diffs: boolean;
    repos: boolean;
    commits: boolean;
    pullRequests: boolean;
    pipelines: boolean;
  };
  /** Error messages */
  error: string | null;
}

// =============================================================================
// STORE
// =============================================================================

function createGitStore() {
  const [state, setState] = createStore<GitState>({
    vcs: null,
    diffs: [],
    repositories: [],
    commits: [],
    pullRequests: [],
    pipelines: [],
    selectedFile: null,
    loading: { vcs: false, diffs: false, repos: false, commits: false, pullRequests: false, pipelines: false },
    error: null,
  });

  // Track current agent and session
  let currentAgent: { namespace: string; name: string } | null = null;
  let currentSessionId: string | null = null;
  let unsubscribeEvents: (() => void) | null = null;
  let pipelinePollingInterval: ReturnType<typeof setInterval> | null = null;

  // ==========================================================================
  // SSE EVENT HANDLING
  // ==========================================================================

  const startListening = () => {
    // Unsubscribe from previous listener
    unsubscribeEvents?.();

    unsubscribeEvents = subscribeToEventBus((event) => {
      switch (event.type) {
        case "session.diff": {
          // Real-time diff update from the agent
          const props = event.properties as { sessionID?: string; diff?: FileDiff[] };
          if (
            currentSessionId &&
            props.sessionID === currentSessionId &&
            props.diff
          ) {
            // Convert FileDiff[] to SessionDiffFile[]
            const diffs: SessionDiffFile[] = props.diff.map((d) => ({
              file: d.file,
              before: d.before,
              after: d.after,
              additions: d.additions,
              deletions: d.deletions,
            }));
            setState("diffs", diffs);
          }
          break;
        }

        case "file.edited": {
          // A file was edited — refresh diffs from the API
          if (currentAgent && currentSessionId) {
            fetchDiffs(currentAgent.namespace, currentAgent.name, currentSessionId);
          }
          break;
        }

        case "session.idle": {
          // Agent finished — refresh VCS, diffs, commits, PRs, and pipelines for final state
          const props = event.properties as { sessionID?: string };
          if (
            currentAgent &&
            currentSessionId &&
            props.sessionID === currentSessionId
          ) {
            fetchVCS(currentAgent.namespace, currentAgent.name);
            fetchDiffs(currentAgent.namespace, currentAgent.name, currentSessionId);
            fetchCommits(currentAgent.namespace, currentAgent.name);
            fetchPullRequests(currentAgent.namespace, currentAgent.name);
            fetchPipelines(currentAgent.namespace, currentAgent.name);
          }
          break;
        }
      }
    });
  };

  // Clean up on disposal
  onCleanup(() => {
    unsubscribeEvents?.();
    stopPipelinePolling();
  });

  // ==========================================================================
  // API CALLS
  // ==========================================================================

  const fetchVCS = async (namespace: string, name: string) => {
    setState("loading", "vcs", true);
    try {
      const vcs = await getAgentVCS(namespace, name);
      setState("vcs", vcs);
      setState("error", null);
    } catch (err) {
      // VCS might not be available — not an error worth showing
      setState("vcs", null);
    } finally {
      setState("loading", "vcs", false);
    }
  };

  const fetchDiffs = async (namespace: string, name: string, sessionId: string) => {
    setState("loading", "diffs", true);
    try {
      const diffs = await getSessionDiff(namespace, name, sessionId);
      setState("diffs", diffs);
      setState("error", null);
    } catch {
      // Diffs might not be available
      setState("diffs", []);
    } finally {
      setState("loading", "diffs", false);
    }
  };

  const fetchGitContext = async (namespace: string, name: string) => {
    setState("loading", "repos", true);
    try {
      const ctx = await getAgentGitContext(namespace, name);
      setState("repositories", ctx.repositories || []);
    } catch {
      setState("repositories", []);
    } finally {
      setState("loading", "repos", false);
    }
  };

  const fetchCommits = async (namespace: string, name: string, branch?: string) => {
    setState("loading", "commits", true);
    try {
      const commits = await getAgentCommits(namespace, name, branch);
      setState("commits", commits);
    } catch {
      setState("commits", []);
    } finally {
      setState("loading", "commits", false);
    }
  };

  const fetchPullRequests = async (namespace: string, name: string) => {
    setState("loading", "pullRequests", true);
    try {
      const response = await getAgentPRs(namespace, name);
      setState("pullRequests", response.pullRequests || []);
    } catch {
      setState("pullRequests", []);
    } finally {
      setState("loading", "pullRequests", false);
    }
  };

  const fetchPipelines = async (namespace: string, name: string, branch?: string) => {
    setState("loading", "pipelines", true);
    try {
      const response = await getAgentPipelines(namespace, name, branch);
      setState("pipelines", response.pipelines || []);
    } catch {
      setState("pipelines", []);
    } finally {
      setState("loading", "pipelines", false);
    }
  };

  /** Start polling pipelines every 30 seconds for in-progress updates */
  const startPipelinePolling = () => {
    stopPipelinePolling();
    pipelinePollingInterval = setInterval(() => {
      if (currentAgent) {
        fetchPipelines(currentAgent.namespace, currentAgent.name);
      }
    }, 30_000);
  };

  /** Stop pipeline polling */
  const stopPipelinePolling = () => {
    if (pipelinePollingInterval) {
      clearInterval(pipelinePollingInterval);
      pipelinePollingInterval = null;
    }
  };

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  /** Set the active agent — fetches git context and VCS info */
  const setAgent = (namespace: string, name: string) => {
    if (
      currentAgent &&
      currentAgent.namespace === namespace &&
      currentAgent.name === name
    ) {
      return;
    }

    currentAgent = { namespace, name };

    // Reset state for new agent
    setState("vcs", null);
    setState("diffs", []);
    setState("commits", []);
    setState("pullRequests", []);
    setState("pipelines", []);
    setState("selectedFile", null);
    setState("error", null);

    // Fetch git context (repos from capabilityRefs), VCS, commits, PRs, and pipelines
    fetchGitContext(namespace, name);
    fetchVCS(namespace, name);
    fetchCommits(namespace, name);
    fetchPullRequests(namespace, name);
    fetchPipelines(namespace, name);

    // Start polling pipelines for in-progress updates
    startPipelinePolling();

    // Start listening for SSE events
    startListening();
  };

  /** Set the active session — fetches diffs for it */
  const setSession = (sessionId: string | null) => {
    if (currentSessionId === sessionId) return;

    currentSessionId = sessionId;
    setState("diffs", []);
    setState("selectedFile", null);

    if (sessionId && currentAgent) {
      fetchDiffs(currentAgent.namespace, currentAgent.name, sessionId);
    }
  };

  /** Select a file to view its diff */
  const selectFile = (file: string | null) => {
    setState("selectedFile", file);
  };

  /** Refresh all git data */
  const refresh = () => {
    if (!currentAgent) return;
    fetchVCS(currentAgent.namespace, currentAgent.name);
    fetchGitContext(currentAgent.namespace, currentAgent.name);
    fetchCommits(currentAgent.namespace, currentAgent.name);
    fetchPullRequests(currentAgent.namespace, currentAgent.name);
    fetchPipelines(currentAgent.namespace, currentAgent.name);
    if (currentSessionId) {
      fetchDiffs(currentAgent.namespace, currentAgent.name, currentSessionId);
    }
  };

  /** Get the selected diff (derived) */
  const selectedDiff = () => {
    if (!state.selectedFile) return null;
    return state.diffs.find((d) => d.file === state.selectedFile) || null;
  };

  /** Get total additions across all diffs */
  const totalAdditions = () => state.diffs.reduce((sum, d) => sum + d.additions, 0);

  /** Get total deletions across all diffs */
  const totalDeletions = () => state.diffs.reduce((sum, d) => sum + d.deletions, 0);

  return {
    state,
    // Actions
    setAgent,
    setSession,
    selectFile,
    refresh,
    // Derived
    selectedDiff,
    totalAdditions,
    totalDeletions,
  };
}

export const gitStore = createRoot(createGitStore);
