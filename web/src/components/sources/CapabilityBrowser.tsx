import { createSignal, createResource, Show, For, type Component } from "solid-js";
import {
  FiChevronRight, FiFolder, FiFile, FiPackage, FiBox, FiLayers,
  FiGitCommit, FiGitPullRequest, FiCheck, FiClock, FiAlertCircle, FiAlertTriangle,
  FiArrowLeft, FiRefreshCw, FiSearch, FiX, FiShield, FiTerminal, FiUser
} from "solid-icons/fi";
import {
  listNamespaces, listWorkloads, listPods, listServices, listHelmReleases,
  listRepoContents, getRepoDetail, listCapabilities,
  type HelmRelease, type RepoResponse, type RepoContentEntry, type CapabilityResponse
} from "../../lib/api";
import type { SelectedContext, K8sResourceContext, GitHubPathContext, GitLabPathContext, HelmReleaseContext } from "../../types/context";
import { getContextId, getContextLabel } from "../chat/ContextBar";

// =============================================================================
// ICONS
// =============================================================================

const KubernetesIcon = (props: { class?: string }) => (
  <svg viewBox="9.70 9.20 210.86 204.86" class={props.class} fill="currentColor">
    <path d="M134.358 126.46551a3.59023 3.59023 0 0 0-.855-.065 3.68515 3.68515 0 0 0-1.425.37 3.725 3.725 0 0 0-1.803 4.825l-.026.037 8.528 20.603a43.53012 43.53012 0 0 0 17.595-22.102l-21.976-3.714zm-34.194 2.92a3.72 3.72 0 0 0-3.568-2.894 3.6556 3.6556 0 0 0-.733.065l-.037-.045-21.785 3.698a43.69506 43.69506 0 0 0 17.54 21.946l8.442-20.399-.066-.08a3.68318 3.68318 0 0 0 .207-2.291zm18.245 8a3.718 3.718 0 0 0-6.557.008h-.018l-10.713 19.372a43.637 43.637 0 0 0 23.815 1.225q2.197-.5 4.292-1.199l-10.738-19.407zm33.914-45l-16.483 14.753.009.047a3.725 3.725 0 0 0 1.46 6.395l.02.089 21.35 6.15a44.278 44.278 0 0 0-6.356-27.432zM121.7 94.0385a3.725 3.725 0 0 0 5.913 2.84l.065.028 18.036-12.789a43.85 43.85 0 0 0-25.287-12.19l1.253 22.105zm-19.1 2.922a3.72 3.72 0 0 0 5.904-2.85l.092-.044 1.253-22.139a44.68209 44.68209 0 0 0-4.501.775 43.4669 43.4669 0 0 0-20.937 11.409l18.154 12.869zm-9.678 16.728a3.72 3.72 0 0 0 1.462-6.396l.018-.087-16.574-14.825a43.454 43.454 0 0 0-6.168 27.511l21.245-6.13zm16.098 6.512l6.114 2.94 6.096-2.933 1.514-6.582-4.219-5.276h-6.79l-4.231 5.268z"/>
    <path d="M216.208 133.16651l-17.422-75.675a13.60207 13.60207 0 0 0-7.293-9.073l-70.521-33.67a13.589 13.589 0 0 0-11.705 0l-70.507 33.688a13.598 13.598 0 0 0-7.295 9.072l-17.394 75.673a13.315 13.315 0 0 0-.004 5.81 13.50607 13.50607 0 0 0 .491 1.718 13.0998 13.0998 0 0 0 1.343 2.726c.239.365.491.72.765 1.064l48.804 60.678c.213.264.448.505.681.75a13.42334 13.42334 0 0 0 2.574 2.133 13.9237 13.9237 0 0 0 3.857 1.677 13.29785 13.29785 0 0 0 3.43.473h.759l77.504-.018a12.99345 12.99345 0 0 0 1.41-.083 13.46921 13.46921 0 0 0 1.989-.378 13.872 13.872 0 0 0 1.381-.442c.353-.135.705-.27 1.045-.433a13.94127 13.94127 0 0 0 1.479-.822 13.30347 13.30347 0 0 0 3.237-2.865l1.488-1.85 47.299-58.84a13.185 13.185 0 0 0 2.108-3.785 13.67036 13.67036 0 0 0 .5-1.724 13.28215 13.28215 0 0 0-.004-5.809zm-73.147 29.432a14.51575 14.51575 0 0 0 .703 1.703 3.314 3.314 0 0 0-.327 2.49 39.37244 39.37244 0 0 0 3.742 6.7 35.06044 35.06044 0 0 1 2.263 3.364c.17.315.392.803.553 1.136a4.24 4.24 0 1 1-7.63 3.607c-.161-.33-.385-.77-.522-1.082a35.27528 35.27528 0 0 1-1.225-3.868 39.3046 39.3046 0 0 0-2.896-7.097 3.335 3.335 0 0 0-2.154-1.307c-.135-.233-.635-1.149-.903-1.623a54.617 54.617 0 0 1-38.948-.1l-.955 1.731a3.429 3.429 0 0 0-1.819.886 29.51728 29.51728 0 0 0-3.268 7.582 34.89931 34.89931 0 0 1-1.218 3.868c-.135.31-.361.744-.522 1.073v.009l-.007.008a4.238 4.238 0 1 1-7.619-3.616c.159-.335.372-.82.54-1.135a35.17706 35.17706 0 0 1 2.262-3.373 41.22786 41.22786 0 0 0 3.82-6.866 4.18792 4.18792 0 0 0-.376-2.387l.768-1.84a54.922 54.922 0 0 1-24.338-30.387l-1.839.313a4.68007 4.68007 0 0 0-2.428-.855 39.52352 39.52352 0 0 0-7.356 2.165 35.58886 35.58886 0 0 1-3.787 1.45c-.305.084-.745.168-1.093.244-.028.01-.052.022-.08.029a.60518.60518 0 0 1-.065.006 4.236 4.236 0 1 1-1.874-8.224l.061-.015.037-.01c.353-.083.805-.2 1.127-.262a35.27 35.27 0 0 1 4.05-.326 39.38835 39.38835 0 0 0 7.564-1.242 5.83506 5.83506 0 0 0 1.814-1.83l1.767-.516a54.613 54.613 0 0 1 8.613-38.073l-1.353-1.206a4.688 4.688 0 0 0-.848-2.436 39.36558 39.36558 0 0 0-6.277-4.41 35.2503 35.2503 0 0 1-3.499-2.046c-.256-.191-.596-.478-.874-.704l-.063-.044a4.473 4.473 0 0 1-1.038-6.222 4.066 4.066 0 0 1 3.363-1.488 5.03 5.03 0 0 1 2.942 1.11c.287.225.68.526.935.745a35.25285 35.25285 0 0 1 2.78 2.95 39.38314 39.38314 0 0 0 5.69 5.142 3.333 3.333 0 0 0 2.507.243q.754.55 1.522 1.082a54.28892 54.28892 0 0 1 27.577-15.754 55.05181 55.05181 0 0 1 7.63-1.173l.1-1.784a4.6001 4.6001 0 0 0 1.37-2.184 39.47551 39.47551 0 0 0-.47-7.654 35.466 35.466 0 0 1-.576-4.014c-.011-.307.006-.731.01-1.081 0-.04-.01-.079-.01-.118a4.242 4.242 0 1 1 8.441-.004c0 .37.022.861.009 1.2a35.109 35.109 0 0 1-.579 4.013 39.53346 39.53346 0 0 0-.478 7.656 3.344 3.344 0 0 0 1.379 2.11c.015.305.065 1.323.102 1.884a55.309 55.309 0 0 1 35.032 16.927l1.606-1.147a4.6901 4.6901 0 0 0 2.56-.278 39.53152 39.53152 0 0 0 5.69-5.148 35.00382 35.00382 0 0 1 2.787-2.95c.259-.222.65-.52.936-.746a4.242 4.242 0 1 1 5.258 6.598c-.283.229-.657.548-.929.75a35.09523 35.09523 0 0 1-3.507 2.046 39.49476 39.49476 0 0 0-6.277 4.41 3.337 3.337 0 0 0-.792 2.39c-.235.216-1.06.947-1.497 1.343a54.837 54.837 0 0 1 8.792 37.983l1.704.496a4.7449 4.7449 0 0 0 1.82 1.831 39.46448 39.46448 0 0 0 7.568 1.245 35.64041 35.64041 0 0 1 4.046.324c.355.065.868.207 1.23.29a4.236 4.236 0 1 1-1.878 8.223l-.061-.008c-.028-.007-.054-.022-.083-.029-.348-.076-.785-.152-1.09-.232a35.1407 35.1407 0 0 1-3.785-1.462 39.47672 39.47672 0 0 0-7.363-2.165 3.337 3.337 0 0 0-2.362.877q-.9-.171-1.804-.316a54.91994 54.91994 0 0 1-24.328 30.605z"/>
  </svg>
);

const HelmIcon = (props: { class?: string }) => (
  <svg viewBox="0 0 32 32" class={props.class} fill="currentColor">
    <path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zm0 2c7.732 0 14 6.268 14 14s-6.268 14-14 14S2 23.732 2 16 8.268 2 16 2zm-1 5v3h2V7h-2zm-5.5 2.134l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zm13 0l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zM16 12a4 4 0 100 8 4 4 0 000-8zm-8.5 4.268l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zm17 0l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zM9.768 20.232l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zm12.464 0l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zM15 23v3h2v-3h-2z"/>
  </svg>
);

const GitHubIcon = (props: { class?: string }) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const GitLabIcon = (props: { class?: string }) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
  </svg>
);

// =============================================================================
// TYPES
// =============================================================================

type CapabilityType = "kubernetes" | "helm" | "github" | "gitlab";
type CapabilityTab = "browse" | "permissions" | "status";

interface CapabilityInfo {
  type: CapabilityType;
  capabilityRef: string;
  capability?: CapabilityResponse;
}

// =============================================================================
// ACCENT COLOR MAPS
// =============================================================================

const accentMap = {
  kubernetes: {
    border: "border-blue-500/20",
    borderActive: "border-blue-500/50",
    borderHover: "hover:border-blue-500/40",
    bg: "from-blue-500/8 to-blue-600/3",
    glow: "group-hover:shadow-blue-500/10",
    icon: "text-blue-400/10 group-hover:text-blue-400/15",
    iconColor: "text-blue-400",
    badge: "bg-blue-500/15 text-blue-400",
    tabActive: "text-blue-400 border-blue-400",
    searchFocus: "focus:border-text/50",
  },
  helm: {
    border: "border-cyan-500/20",
    borderActive: "border-cyan-500/50",
    borderHover: "hover:border-cyan-500/40",
    bg: "from-cyan-500/8 to-cyan-600/3",
    glow: "group-hover:shadow-cyan-500/10",
    icon: "text-cyan-400/10 group-hover:text-cyan-400/15",
    iconColor: "text-cyan-400",
    badge: "bg-cyan-500/15 text-cyan-400",
    tabActive: "text-cyan-400 border-cyan-400",
    searchFocus: "focus:border-text/50",
  },
  github: {
    border: "border-white/10",
    borderActive: "border-white/30",
    borderHover: "hover:border-white/20",
    bg: "from-white/5 to-white/2",
    glow: "group-hover:shadow-white/5",
    icon: "text-white/8 group-hover:text-white/12",
    iconColor: "text-gray-300",
    badge: "bg-white/10 text-gray-300",
    tabActive: "text-gray-300 border-gray-300",
    searchFocus: "focus:border-text/50",
  },
  gitlab: {
    border: "border-orange-500/20",
    borderActive: "border-orange-500/50",
    borderHover: "hover:border-orange-500/40",
    bg: "from-orange-500/8 to-orange-600/3",
    glow: "group-hover:shadow-orange-500/10",
    icon: "text-orange-400/10 group-hover:text-orange-400/15",
    iconColor: "text-orange-400",
    badge: "bg-orange-500/15 text-orange-400",
    tabActive: "text-orange-400 border-orange-400",
    searchFocus: "focus:border-text/50",
  },
};

const capabilityMeta: Record<CapabilityType, { label: string; description: string; icon: Component<{ class?: string }>; bgIcon: Component<{ class?: string }> }> = {
  kubernetes: { label: "Kubernetes", description: "Pods, Deployments, Services", icon: KubernetesIcon, bgIcon: KubernetesIcon },
  helm: { label: "Helm", description: "Releases & Charts", icon: HelmIcon, bgIcon: HelmIcon },
  github: { label: "GitHub", description: "Files, Commits, PRs", icon: GitHubIcon, bgIcon: GitHubIcon },
  gitlab: { label: "GitLab", description: "Files, Commits, MRs", icon: GitLabIcon, bgIcon: GitLabIcon },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface CapabilityBrowserProps {
  onToggleSelect: (item: SelectedContext) => void;
  selectedContexts: SelectedContext[];
  agentNamespace: string;
  capabilityRefs: Array<{ name: string; alias?: string }>;
  repos: RepoResponse[];
}

const CapabilityBrowser = (props: CapabilityBrowserProps) => {
  const [expandedCapability, setExpandedCapability] = createSignal<CapabilityType | null>(null);
  const [activeTab, setActiveTab] = createSignal<CapabilityTab>("browse");

  // Fetch all capabilities for the agent's namespace
  const [capabilities] = createResource(
    () => props.agentNamespace,
    (ns) => listCapabilities(ns).catch(() => [])
  );

  // Detect which capability types are present and map to CapabilityInfo
  const detectedCapabilities = (): CapabilityInfo[] => {
    const refs = props.capabilityRefs || [];
    const allCapabilities = capabilities() || [];
    const result: CapabilityInfo[] = [];

    for (const ref of refs) {
      const capability = allCapabilities.find(s => s.metadata.name === ref.name);
      let type: CapabilityType | null = null;

      // Use CRD containerType if available
      if (capability?.spec?.type === "Container" && capability.spec.container?.containerType) {
        const ct = capability.spec.container.containerType;
        if (ct === "kubernetes" || ct === "helm" || ct === "github" || ct === "gitlab") {
          type = ct;
        }
      }

      // Fallback to name-based detection
      if (!type) {
        const name = ref.name.toLowerCase();
        if (name.includes("kubectl") || name.includes("kubernetes")) type = "kubernetes";
        else if (name.includes("helm")) type = "helm";
        else if (name.includes("github")) type = "github";
        else if (name.includes("gitlab")) type = "gitlab";
      }

      if (type && !result.some(s => s.type === type)) {
        result.push({ type, capabilityRef: ref.name, capability });
      }
    }
    return result;
  };

  const toggleCapability = (type: CapabilityType) => {
    if (expandedCapability() === type) {
      setExpandedCapability(null);
    } else {
      setExpandedCapability(type);
      setActiveTab("browse");
    }
  };

  const selectedCount = (type: CapabilityType) => {
    return props.selectedContexts.filter(c => {
      if (type === "kubernetes") return c.type === "k8s-resource";
      if (type === "helm") return c.type === "helm-release";
      if (type === "github") return c.type === "github-path";
      if (type === "gitlab") return c.type === "gitlab-path";
      return false;
    }).length;
  };

  const contextsByType = (type: CapabilityType) => {
    return props.selectedContexts.filter(c => {
      if (type === "kubernetes") return c.type === "k8s-resource";
      if (type === "helm") return c.type === "helm-release";
      if (type === "github") return c.type === "github-path";
      if (type === "gitlab") return c.type === "gitlab-path";
      return false;
    });
  };

  return (
    <div class="flex flex-col gap-2 p-3">
      <For each={detectedCapabilities()}>
        {(info) => {
          const accent = () => accentMap[info.type];
          const meta = () => capabilityMeta[info.type];
          const isExpanded = () => expandedCapability() === info.type;
          const Icon = meta().icon;
          const BgIcon = meta().bgIcon;

          return (
            <div class={`rounded-xl border overflow-hidden transition-all duration-200 ${
              isExpanded() ? accent().borderActive : `${accent().border} ${accent().borderHover}`
            }`}>
              {/* ===== CARD HEADER (always visible) ===== */}
              <button
                onClick={() => toggleCapability(info.type)}
                class={`group relative w-full overflow-hidden transition-all duration-200 hover:shadow-lg ${accent().glow} bg-gradient-to-br ${accent().bg}`}
              >
                {/* Background Watermark */}
                <div class={`absolute -right-4 -bottom-4 transition-all duration-200 ${accent().icon} group-hover:scale-110 group-hover:-rotate-6`}>
                  <BgIcon class="w-28 h-28" />
                </div>

                {/* Content */}
                <div class="relative z-10 flex items-center gap-3 p-3.5">
                  <div class={`shrink-0 ${accent().iconColor}`}>
                    <Icon class="w-7 h-7" />
                  </div>
                  <div class="flex-1 text-left min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-text">{meta().label}</span>
                      <Show when={info.capability}>
                        {(() => {
                          const phase = info.capability!.status?.phase || "Unknown";
                          const phaseStyle = phase === "Ready" ? "bg-success/10 text-success" :
                            phase === "Pending" ? "bg-warning/10 text-warning" :
                            phase === "Failed" ? "bg-error/10 text-error" : "bg-gray-500/10 text-gray-400";
                          return (
                            <span class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${phaseStyle}`}>
                              <span class={`w-1.5 h-1.5 rounded-full ${
                                phase === "Ready" ? "bg-success" :
                                phase === "Pending" ? "bg-warning" :
                                phase === "Failed" ? "bg-error" : "bg-gray-400"
                              }`} />
                              {phase}
                            </span>
                          );
                        })()}
                      </Show>
                      <Show when={selectedCount(info.type) > 0}>
                        <span class={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${accent().badge}`}>
                          {selectedCount(info.type)}
                        </span>
                      </Show>
                    </div>
                    <p class="text-xs text-text-muted mt-0.5">{meta().description}</p>

                    {/* Permission & Approval Summary */}
                    <Show when={info.capability}>
                      {(() => {
                        const allowCount = info.capability!.spec.permissions?.allow?.length || 0;
                        const approveCount = info.capability!.spec.permissions?.approve?.length || 0;
                        const denyCount = info.capability!.spec.permissions?.deny?.length || 0;
                        const hasAudit = info.capability!.spec.audit;
                        const rateLimit = info.capability!.spec.rateLimit?.requestsPerMinute;
                        const hasAny = allowCount > 0 || approveCount > 0 || denyCount > 0 || hasAudit || rateLimit;
                        return (
                          <Show when={hasAny}>
                            <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                              <Show when={allowCount > 0}>
                                <span class="inline-flex items-center gap-1 text-xs text-success bg-success/8 px-1.5 py-0.5 rounded-md">
                                  <FiCheck class="w-3 h-3" /> {allowCount}
                                </span>
                              </Show>
                              <Show when={approveCount > 0}>
                                <span class="inline-flex items-center gap-1 text-xs text-warning bg-warning/8 px-1.5 py-0.5 rounded-md">
                                  <FiAlertTriangle class="w-3 h-3" /> {approveCount}
                                </span>
                              </Show>
                              <Show when={denyCount > 0}>
                                <span class="inline-flex items-center gap-1 text-xs text-error bg-error/8 px-1.5 py-0.5 rounded-md">
                                  <FiX class="w-3 h-3" /> {denyCount}
                                </span>
                              </Show>
                              <Show when={hasAudit}>
                                <span class="inline-flex items-center gap-1 text-xs text-text-muted bg-surface/50 px-1.5 py-0.5 rounded-md">
                                  <FiShield class="w-3 h-3" /> Audit
                                </span>
                              </Show>
                              <Show when={rateLimit}>
                                <span class="inline-flex items-center gap-1 text-xs text-text-muted bg-surface/50 px-1.5 py-0.5 rounded-md">
                                  <FiClock class="w-3 h-3" /> {rateLimit}/m
                                </span>
                              </Show>
                            </div>
                          </Show>
                        );
                      })()}
                    </Show>
                  </div>
                  <div class={`shrink-0 text-text-muted transition-transform duration-200 ${isExpanded() ? "rotate-90" : ""}`}>
                    <FiChevronRight class="w-4 h-4" />
                  </div>
                </div>
              </button>

              {/* ===== EXPANDED CONTENT ===== */}
              <Show when={isExpanded()}>
                <div class="capability-expand-enter border-t border-border/50">
                  {/* Tab Bar */}
                  <div class="flex items-center border-b border-border/50 bg-surface/30">
                    <CapabilityTabButton
                      label="Browse"
                      active={activeTab() === "browse"}
                      onClick={() => setActiveTab("browse")}
                      type={info.type}
                    />
                    <CapabilityTabButton
                      label="Permissions"
                      active={activeTab() === "permissions"}
                      onClick={() => setActiveTab("permissions")}
                      type={info.type}
                    />
                    <CapabilityTabButton
                      label="Status"
                      active={activeTab() === "status"}
                      onClick={() => setActiveTab("status")}
                      type={info.type}
                    />
                  </div>

                  {/* Tab Content */}
                  <div class="max-h-[60vh] overflow-y-auto scrollbar-thin">
                    <Show when={activeTab() === "browse"}>
                      <Show when={info.type === "kubernetes"}>
                        <InlineK8sBrowser
                          onToggleSelect={props.onToggleSelect}
                          selectedContexts={props.selectedContexts}
                        />
                      </Show>
                      <Show when={info.type === "helm"}>
                        <InlineHelmBrowser
                          onToggleSelect={props.onToggleSelect}
                          selectedContexts={props.selectedContexts}
                        />
                      </Show>
                      <Show when={info.type === "github"}>
                        <InlineGitHubBrowser
                          repos={props.repos.filter(r => r.provider === "github")}
                          onToggleSelect={props.onToggleSelect}
                          selectedContexts={props.selectedContexts}
                        />
                      </Show>
                      <Show when={info.type === "gitlab"}>
                        <InlineGitLabBrowser
                          repos={props.repos.filter(r => r.provider === "gitlab")}
                          onToggleSelect={props.onToggleSelect}
                          selectedContexts={props.selectedContexts}
                        />
                      </Show>
                    </Show>

                    <Show when={activeTab() === "permissions"}>
                      <PermissionsView capability={info.capability} />
                    </Show>

                    <Show when={activeTab() === "status"}>
                      <StatusView capability={info.capability} />
                    </Show>
                  </div>
                </div>
              </Show>

              {/* ===== SELECTED ITEMS (shown below card when collapsed) ===== */}
              <Show when={!isExpanded() && contextsByType(info.type).length > 0}>
                <div
                  onClick={() => toggleCapability(info.type)}
                  class="border-t border-border/30 py-1 cursor-pointer"
                >
                  <For each={contextsByType(info.type)}>
                    {(ctx) => (
                      <div class="group/row flex items-center gap-2 pl-4 pr-3 py-[3px] hover:bg-surface-hover/40 transition-colors">
                         <span class="text-xs text-text/70 truncate flex-1 tracking-tight" title={getContextLabel(ctx)}>
                          {getContextLabel(ctx)}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); props.onToggleSelect(ctx); }}
                          class="p-0.5 rounded text-transparent group-hover/row:text-text-muted hover:!text-error transition-all shrink-0"
                        >
                          <FiX class="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          );
        }}
      </For>

      {/* No capabilities fallback */}
      <Show when={detectedCapabilities().length === 0}>
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <div class="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
            <FiBox class="w-6 h-6 text-text-muted" />
          </div>
          <p class="text-sm text-text-muted font-semibold">No capabilities configured</p>
          <p class="text-xs text-text-muted/60 mt-1">Attach capabilities to extend this agent</p>
        </div>
      </Show>
    </div>
  );
};

// =============================================================================
// CAPABILITY TAB BUTTON
// =============================================================================

const CapabilityTabButton = (props: { label: string; active: boolean; onClick: () => void; type: CapabilityType }) => {
  const accent = () => accentMap[props.type];
  return (
    <button
      onClick={props.onClick}
      class={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors relative text-center ${
        props.active
          ? accent().tabActive
          : "text-text-muted hover:text-text"
      }`}
    >
      {props.label}
      <Show when={props.active}>
        <div class={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${
          props.type === "kubernetes" ? "bg-blue-400" :
          props.type === "helm" ? "bg-cyan-400" :
          props.type === "gitlab" ? "bg-orange-400" : "bg-gray-300"
        }`} />
      </Show>
    </button>
  );
};

// =============================================================================
// PERMISSIONS VIEW
// =============================================================================

const PermissionsView: Component<{ capability?: CapabilityResponse }> = (props) => {
  const allowCount = () => props.capability?.spec.permissions?.allow?.length || 0;
  const approveCount = () => props.capability?.spec.permissions?.approve?.length || 0;
  const denyCount = () => props.capability?.spec.permissions?.deny?.length || 0;

  return (
    <div class="p-3 space-y-3">
      <Show when={!props.capability}>
        <p class="text-xs text-text-muted italic text-center py-4">Capability not found in cluster</p>
      </Show>

      <Show when={props.capability}>
        {/* Summary badges */}
        <div class="flex items-center gap-2 flex-wrap">
          <Show when={allowCount() > 0}>
            <span class="inline-flex items-center gap-1 text-xs text-success bg-success/8 px-1.5 py-0.5 rounded-md">
              <FiCheck class="w-3 h-3" /> {allowCount()} allow
            </span>
          </Show>
          <Show when={approveCount() > 0}>
            <span class="inline-flex items-center gap-1 text-xs text-warning bg-warning/8 px-1.5 py-0.5 rounded-md">
              <FiAlertTriangle class="w-3 h-3" /> {approveCount()} approve
            </span>
          </Show>
          <Show when={denyCount() > 0}>
            <span class="inline-flex items-center gap-1 text-xs text-error bg-error/8 px-1.5 py-0.5 rounded-md">
              <FiX class="w-3 h-3" /> {denyCount()} deny
            </span>
          </Show>
        </div>

        {/* Allow patterns */}
        <Show when={allowCount() > 0}>
          <div>
            <div class="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Allowed</div>
            <div class="space-y-1">
              <For each={props.capability!.spec.permissions?.allow || []}>
                {(pattern) => (
                  <div class="flex items-center gap-1.5 text-xs">
                    <FiCheck class="w-3 h-3 text-success shrink-0" />
                    <code class="font-mono text-success/80 text-xs break-all">{pattern}</code>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Approval rules */}
        <Show when={approveCount() > 0}>
          <div>
            <div class="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Requires Approval</div>
            <div class="space-y-1.5">
              <For each={props.capability!.spec.permissions?.approve || []}>
                {(rule) => (
                  <div class="p-2 rounded-lg bg-warning/5 border border-warning/15">
                    <code class="font-mono text-warning text-xs break-all">{rule.pattern}</code>
                    <Show when={rule.message}>
                      <p class="text-xs text-text-muted mt-1">{rule.message}</p>
                    </Show>
                    <div class="flex items-center gap-2 mt-1 text-xs text-text-muted">
                      <Show when={rule.severity}>
                        <span class="capitalize">{rule.severity}</span>
                      </Show>
                      <Show when={rule.timeout}>
                        <span>{rule.timeout}s timeout</span>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Deny patterns */}
        <Show when={denyCount() > 0}>
          <div>
            <div class="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Denied</div>
            <div class="space-y-1">
              <For each={props.capability!.spec.permissions?.deny || []}>
                {(pattern) => (
                  <div class="flex items-center gap-1.5 text-xs">
                    <FiX class="w-3 h-3 text-error shrink-0" />
                    <code class="font-mono text-error/80 text-xs break-all">{pattern}</code>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={allowCount() === 0 && approveCount() === 0 && denyCount() === 0}>
          <p class="text-xs text-text-muted italic text-center py-4">No permission rules configured</p>
        </Show>
      </Show>
    </div>
  );
};

// =============================================================================
// STATUS VIEW
// =============================================================================

const StatusView: Component<{ capability?: CapabilityResponse }> = (props) => {
  return (
    <div class="p-3 space-y-3">
      <Show when={!props.capability}>
        <p class="text-xs text-text-muted italic text-center py-4">Capability not found in cluster</p>
      </Show>

      <Show when={props.capability}>
        {/* Phase */}
        <DetailRow label="Phase">
          {(() => {
            const phase = props.capability!.status?.phase || "Unknown";
            const style = phase === "Ready" ? "bg-success/10 text-success" :
              phase === "Pending" ? "bg-warning/10 text-warning" :
              phase === "Failed" ? "bg-error/10 text-error" : "bg-gray-500/10 text-gray-400";
            return (
              <span class={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
                <span class={`w-1.5 h-1.5 rounded-full ${
                  phase === "Ready" ? "bg-success" : phase === "Pending" ? "bg-warning" :
                  phase === "Failed" ? "bg-error" : "bg-gray-400"
                }`} />
                {phase}
              </span>
            );
          })()}
        </DetailRow>

        {/* Image */}
        <DetailRow label="Image">
          <span class="text-xs font-mono text-text-secondary break-all leading-relaxed">{props.capability!.spec.image}</span>
        </DetailRow>

        {/* Command Prefix */}
        <Show when={props.capability!.spec.commandPrefix}>
          <DetailRow label="Command Prefix">
            <div class="flex items-center gap-1.5">
              <FiTerminal class="w-3 h-3 text-text-muted shrink-0" />
              <span class="text-xs font-mono text-text-secondary">{props.capability!.spec.commandPrefix}</span>
            </div>
          </DetailRow>
        </Show>

        {/* Service Account */}
        <Show when={props.capability!.spec.serviceAccountName}>
          <DetailRow label="Service Account">
            <div class="flex items-center gap-1.5">
              <FiUser class="w-3 h-3 text-text-muted shrink-0" />
              <span class="text-xs font-mono text-text-secondary">{props.capability!.spec.serviceAccountName}</span>
            </div>
          </DetailRow>
        </Show>

        {/* Rate Limit */}
        <Show when={props.capability!.spec.rateLimit?.requestsPerMinute}>
          <DetailRow label="Rate Limit">
            <div class="flex items-center gap-1.5">
              <FiClock class="w-3 h-3 text-text-muted shrink-0" />
              <span class="text-xs text-text-secondary">{props.capability!.spec.rateLimit!.requestsPerMinute} req/min</span>
            </div>
          </DetailRow>
        </Show>

        {/* Audit */}
        <DetailRow label="Audit">
          <div class="flex items-center gap-1.5">
            <FiShield class="w-3 h-3 text-text-muted shrink-0" />
            <span class="text-xs text-text-secondary">{props.capability!.spec.audit ? "Enabled" : "Disabled"}</span>
          </div>
        </DetailRow>

        {/* Instructions */}
        <Show when={props.capability!.spec.instructions}>
          <DetailRow label="Instructions">
            <p class="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed line-clamp-4">
              {props.capability!.spec.instructions}
            </p>
          </DetailRow>
        </Show>

        {/* Used By */}
        <Show when={(props.capability!.status?.usedBy?.length || 0) > 0}>
          <DetailRow label="Used By">
            <div class="flex flex-wrap gap-1">
              <For each={props.capability!.status!.usedBy!}>
                {(agent) => (
                  <span class="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded-md font-semibold">{agent}</span>
                )}
              </For>
            </div>
          </DetailRow>
        </Show>

        {/* Namespace + Created */}
        <div class="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-text-muted">
          <span>{props.capability!.metadata.namespace}</span>
          <Show when={props.capability!.metadata.creationTimestamp}>
            <span>{new Date(props.capability!.metadata.creationTimestamp).toLocaleDateString()}</span>
          </Show>
        </div>
      </Show>
    </div>
  );
};

const DetailRow: Component<{ label: string; children: any }> = (props) => (
  <div>
    <div class="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">{props.label}</div>
    {props.children}
  </div>
);

// =============================================================================
// SELECTION DOT
// =============================================================================

const SelectionDot = (props: { selected: boolean; onClick: () => void; color: "blue" | "cyan" | "gray" | "orange"; size?: "sm" | "md" }) => {
  const colorMap = {
    blue: { active: "bg-blue-500 border-blue-500", hover: "hover:border-blue-400", ring: "hover:ring-blue-500/20" },
    cyan: { active: "bg-cyan-500 border-cyan-500", hover: "hover:border-cyan-400", ring: "hover:ring-cyan-500/20" },
    gray: { active: "bg-gray-400 border-gray-400", hover: "hover:border-gray-400", ring: "hover:ring-gray-400/20" },
    orange: { active: "bg-orange-500 border-orange-500", hover: "hover:border-orange-400", ring: "hover:ring-orange-500/20" },
  };
  const c = colorMap[props.color];
  const sz = props.size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const dotSz = props.size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";

  return (
    <button
      onClick={(e) => { e.stopPropagation(); props.onClick(); }}
      class={`${sz} rounded-full border flex items-center justify-center transition-all duration-200 shrink-0 ${c.ring} hover:ring-2 ${
        props.selected ? `${c.active} border-transparent` : `border-text-muted/30 ${c.hover}`
      }`}
      title={props.selected ? "Remove from context" : "Add to context"}
    >
      <Show when={props.selected}>
        <div class={`${dotSz} bg-white rounded-full`} />
      </Show>
    </button>
  );
};

// =============================================================================
// INLINE TAB BUTTON (for browse sub-tabs)
// =============================================================================

const InlineTabButton = (props: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={props.onClick}
    class={`px-2.5 py-2 text-xs font-semibold transition-colors relative ${
      props.active ? "text-text" : "text-text-muted hover:text-text"
    }`}
  >
    {props.label}
    <Show when={props.active}>
      <div class="absolute bottom-0 left-1 right-1 h-0.5 bg-primary rounded-full" />
    </Show>
  </button>
);

// =============================================================================
// INLINE KUBERNETES BROWSER
// =============================================================================

interface InlineK8sBrowserProps {
  onToggleSelect: (item: K8sResourceContext) => void;
  selectedContexts: SelectedContext[];
}

const InlineK8sBrowser: Component<InlineK8sBrowserProps> = (props) => {
  const [view, setView] = createSignal<"namespaces" | "detail">("namespaces");
  const [activeNamespace, setActiveNamespace] = createSignal("");
  const [activeTab, setActiveTab] = createSignal<"workloads" | "pods" | "services">("workloads");
  const [searchQuery, setSearchQuery] = createSignal("");

  const [namespaces, { refetch: refetchNs }] = createResource(() => listNamespaces().catch(() => []));
  const [workloads] = createResource(
    () => activeNamespace() || null,
    (ns) => listWorkloads(ns).catch(() => [])
  );
  const [pods] = createResource(
    () => (activeNamespace() && activeTab() === "pods") ? activeNamespace() : null,
    (ns) => listPods(ns).catch(() => [])
  );
  const [services] = createResource(
    () => (activeNamespace() && activeTab() === "services") ? activeNamespace() : null,
    (ns) => listServices(ns).catch(() => [])
  );

  const openNamespace = (ns: string) => {
    setActiveNamespace(ns);
    setActiveTab("workloads");
    setView("detail");
    setSearchQuery("");
  };

  const goBack = () => {
    setView("namespaces");
    setActiveNamespace("");
    setSearchQuery("");
  };

  const createK8sCtx = (kind: string, name: string, namespace: string): K8sResourceContext => ({
    type: "k8s-resource", source: "kubectl", kind, name, namespace,
  });

  const isSelected = (ctx: K8sResourceContext) => {
    return props.selectedContexts.some(c => getContextId(c) === getContextId(ctx));
  };

  const getStatusColor = (ready: number, replicas: number) => {
    if (ready === replicas && replicas > 0) return "text-success";
    if (ready > 0) return "text-warning";
    return "text-error";
  };

  const getPodStatusColor = (phase: string) => {
    if (phase === "Running") return "text-success";
    if (phase === "Pending") return "text-warning";
    if (phase === "Succeeded") return "text-blue-400";
    return "text-error";
  };

  const filter = <T extends { name: string }>(items: T[] | undefined) => {
    const q = searchQuery().toLowerCase();
    if (!q) return items || [];
    return (items || []).filter(i => i.name.toLowerCase().includes(q));
  };

  return (
    <div>
      {/* Navigation header */}
      <div class="flex items-center gap-1 px-3 py-2 border-b border-border/50 bg-surface/30">
        <Show when={view() === "detail"}>
          <button onClick={goBack} class="p-1 text-text-muted hover:text-text rounded transition-colors">
            <FiArrowLeft class="w-3 h-3" />
          </button>
        </Show>
        <span class="text-xs text-text-muted font-semibold">
          {view() === "namespaces" ? "Cluster" : activeNamespace()}
        </span>
        <div class="flex-1" />
        <button onClick={() => refetchNs()} class="p-1 text-text-muted hover:text-text rounded transition-colors">
          <FiRefreshCw class="w-3 h-3" />
        </button>
      </div>

      {/* Search */}
      <div class="px-3 py-1.5 border-b border-border/50">
        <div class="relative">
          <FiSearch class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            type="text"
            placeholder={view() === "namespaces" ? "Filter namespaces..." : "Filter resources..."}
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full pl-7 pr-2 py-1 text-xs bg-surface-2 border border-border rounded-md text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-text/30 focus:border-text/50 transition-colors"
          />
        </div>
      </div>

      {/* Namespace List */}
      <Show when={view() === "namespaces"}>
        <Show when={namespaces.loading}>
          <MiniLoader message="Loading namespaces..." />
        </Show>
        <Show when={!namespaces.loading}>
          <div class="divide-y divide-border/30">
            <For each={filter(namespaces())}>
              {(ns) => {
                const ctx = createK8sCtx("Namespace", ns.name, ns.name);
                return (
                  <div class="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors group">
                    <SelectionDot selected={isSelected(ctx)} onClick={() => props.onToggleSelect(ctx)} color="blue" size="sm" />
                    <button onClick={() => openNamespace(ns.name)} class="flex-1 flex items-center gap-2 text-left min-w-0">
                      <FiLayers class="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <div class="flex-1 min-w-0">
                        <div class="text-xs text-text truncate">{ns.name}</div>
                        <div class="text-xs text-text-muted">{ns.deployments} deploy · {ns.statefulSets} sts · {ns.pods} pod</div>
                      </div>
                      <FiChevronRight class="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
          <Show when={filter(namespaces()).length === 0}>
            <MiniEmpty message="No namespaces found" />
          </Show>
        </Show>
      </Show>

      {/* Namespace Detail */}
      <Show when={view() === "detail"}>
        <div class="flex items-center border-b border-border/50 px-1">
          <InlineTabButton label="Workloads" active={activeTab() === "workloads"} onClick={() => { setActiveTab("workloads"); setSearchQuery(""); }} />
          <InlineTabButton label="Pods" active={activeTab() === "pods"} onClick={() => { setActiveTab("pods"); setSearchQuery(""); }} />
          <InlineTabButton label="Services" active={activeTab() === "services"} onClick={() => { setActiveTab("services"); setSearchQuery(""); }} />
        </div>

        {/* Workloads */}
        <Show when={activeTab() === "workloads"}>
          <Show when={workloads.loading}><MiniLoader message="Loading..." /></Show>
          <Show when={!workloads.loading}>
            <div class="divide-y divide-border/30">
              <For each={filter(workloads())}>
                {(w) => {
                  const ctx = createK8sCtx(w.kind, w.name, w.namespace);
                  return (
                    <div class="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors">
                       <SelectionDot selected={isSelected(ctx)} onClick={() => props.onToggleSelect(ctx)} color="blue" size="sm" />
                      <div class="flex-1 flex items-center gap-2 min-w-0">
                         <FiBox class="w-3 h-3 text-blue-400 shrink-0" />
                         <div class="flex-1 min-w-0">
                           <div class="text-xs text-text truncate">{w.name}</div>
                           <div class="text-xs text-text-muted uppercase tracking-wider">{w.kind}</div>
                         </div>
                         <span class={`text-xs font-mono font-semibold ${getStatusColor(w.ready, w.replicas)}`}>{w.ready}/{w.replicas}</span>
                       </div>
                    </div>
                  );
                }}
              </For>
            </div>
            <Show when={filter(workloads()).length === 0}><MiniEmpty message="No workloads" /></Show>
          </Show>
        </Show>

        {/* Pods */}
        <Show when={activeTab() === "pods"}>
          <Show when={pods.loading}><MiniLoader message="Loading..." /></Show>
          <Show when={!pods.loading}>
            <div class="divide-y divide-border/30">
              <For each={filter(pods())}>
                {(p) => {
                  const ctx = createK8sCtx("Pod", p.name, p.namespace);
                  return (
                    <div class="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover/50 transition-colors">
                       <SelectionDot selected={isSelected(ctx)} onClick={() => props.onToggleSelect(ctx)} color="blue" size="sm" />
                      <div class="flex-1 flex items-center gap-2 min-w-0">
                         <div class={`w-1.5 h-1.5 rounded-full shrink-0 ${getPodStatusColor(p.phase)}`} />
                         <span class="text-xs text-text truncate font-mono flex-1">{p.name}</span>
                         <span class="text-xs text-text-muted shrink-0">{p.phase}</span>
                       </div>
                    </div>
                  );
                }}
              </For>
            </div>
            <Show when={filter(pods()).length === 0}><MiniEmpty message="No pods" /></Show>
          </Show>
        </Show>

        {/* Services */}
        <Show when={activeTab() === "services"}>
          <Show when={services.loading}><MiniLoader message="Loading..." /></Show>
          <Show when={!services.loading}>
            <div class="divide-y divide-border/30">
              <For each={filter(services())}>
                {(s) => {
                  const ctx = createK8sCtx("Service", s.name, s.namespace);
                  return (
                    <div class="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors">
                       <SelectionDot selected={isSelected(ctx)} onClick={() => props.onToggleSelect(ctx)} color="blue" size="sm" />
                      <div class="flex-1 flex items-center gap-2 min-w-0">
                         <FiLayers class="w-3 h-3 text-purple-400 shrink-0" />
                         <div class="flex-1 min-w-0">
                           <div class="text-xs text-text truncate">{s.name}</div>
                           <div class="text-xs text-text-muted">{s.type} · {s.clusterIP}</div>
                         </div>
                         <span class="text-xs text-text-muted shrink-0">{s.ports?.map(p => `${p.port}`).join(",")}</span>
                       </div>
                    </div>
                  );
                }}
              </For>
            </div>
            <Show when={filter(services()).length === 0}><MiniEmpty message="No services" /></Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
};

// =============================================================================
// INLINE HELM BROWSER
// =============================================================================

interface InlineHelmBrowserProps {
  onToggleSelect: (item: HelmReleaseContext) => void;
  selectedContexts: SelectedContext[];
}

const InlineHelmBrowser: Component<InlineHelmBrowserProps> = (props) => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [activeNamespace, setActiveNamespace] = createSignal<string | null>(null);
  const [releases, { refetch }] = createResource(() => listHelmReleases().catch(() => []));

  const namespaceGroups = () => {
    const rels = releases() || [];
    const groups = new Map<string, HelmRelease[]>();
    for (const rel of rels) {
      const existing = groups.get(rel.namespace) || [];
      existing.push(rel);
      groups.set(rel.namespace, existing);
    }
    return groups;
  };

  const namespaces = () => Array.from(namespaceGroups().keys()).sort();

  const filteredReleases = () => {
    const ns = activeNamespace();
    const q = searchQuery().toLowerCase();
    let rels = releases() || [];
    if (ns) rels = rels.filter(r => r.namespace === ns);
    if (q) rels = rels.filter(r => r.name.toLowerCase().includes(q) || r.chart.toLowerCase().includes(q));
    return rels;
  };

  const createHelmCtx = (rel: HelmRelease): HelmReleaseContext => ({
    type: "helm-release", source: "helm", name: rel.name, namespace: rel.namespace,
    chart: rel.chart, chartVersion: rel.chartVersion, status: rel.status,
  });

  const isSelected = (ctx: HelmReleaseContext) => {
    return props.selectedContexts.some(c => getContextId(c) === getContextId(ctx));
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "deployed": return { icon: FiCheck, color: "text-success", bg: "bg-success/10" };
      case "failed": return { icon: FiAlertCircle, color: "text-error", bg: "bg-error/10" };
      default: return { icon: FiClock, color: "text-warning", bg: "bg-warning/10" };
    }
  };

  return (
    <div>
      {/* Search + refresh */}
      <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/50">
        <div class="relative flex-1">
          <FiSearch class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            type="text"
            placeholder="Filter releases..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full pl-7 pr-2 py-1 text-xs bg-surface-2 border border-border rounded-md text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-text/30 focus:border-text/50 transition-colors"
          />
        </div>
        <button onClick={() => refetch()} class="p-1 text-text-muted hover:text-text rounded transition-colors">
          <FiRefreshCw class="w-3 h-3" />
        </button>
      </div>

      {/* Namespace filter pills */}
      <Show when={namespaces().length > 1}>
        <div class="px-3 py-1.5 border-b border-border/50 flex items-center gap-1 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setActiveNamespace(null)}
            class={`text-xs px-2 py-0.5 rounded-full transition-colors whitespace-nowrap ${
              !activeNamespace() ? "bg-cyan-500/15 text-cyan-400 font-semibold" : "text-text-muted hover:text-text"
            }`}
          >All</button>
          <For each={namespaces()}>
            {(ns) => (
              <button
                onClick={() => setActiveNamespace(ns)}
                class={`text-xs px-2 py-0.5 rounded-full transition-colors whitespace-nowrap ${
                  activeNamespace() === ns ? "bg-cyan-500/15 text-cyan-400 font-semibold" : "text-text-muted hover:text-text"
                }`}
              >{ns}</button>
            )}
          </For>
        </div>
      </Show>

      {/* Release list */}
      <Show when={releases.loading}><MiniLoader message="Loading releases..." /></Show>
      <Show when={!releases.loading}>
        <div class="divide-y divide-border/30">
          <For each={filteredReleases()}>
            {(rel) => {
              const ctx = createHelmCtx(rel);
              const status = getStatusIcon(rel.status);
              const StatusIcon = status.icon;
              return (
                <div class="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors">
                   <SelectionDot selected={isSelected(ctx)} onClick={() => props.onToggleSelect(ctx)} color="cyan" size="sm" />
                  <div class="flex-1 flex items-center gap-2 min-w-0">
                     <FiPackage class={`w-3.5 h-3.5 ${status.color} shrink-0`} />
                     <div class="flex-1 min-w-0">
                       <div class="text-xs text-text truncate">{rel.name}</div>
                       <div class="text-xs text-text-muted">{rel.chart} · <span class="font-mono">{rel.chartVersion}</span></div>
                     </div>
                     <div class={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold ${status.bg} ${status.color}`}>
                       <StatusIcon class="w-3 h-3" />
                       {rel.status}
                     </div>
                   </div>
                </div>
              );
            }}
          </For>
        </div>
        <Show when={filteredReleases().length === 0}><MiniEmpty message="No releases found" /></Show>
      </Show>
    </div>
  );
};

// =============================================================================
// INLINE GITHUB BROWSER
// =============================================================================

interface InlineGitHubBrowserProps {
  repos: RepoResponse[];
  onToggleSelect: (item: GitHubPathContext) => void;
  selectedContexts: SelectedContext[];
}

const InlineGitHubBrowser: Component<InlineGitHubBrowserProps> = (props) => {
  const [view, setView] = createSignal<"repos" | "detail">("repos");
  const [activeRepo, setActiveRepo] = createSignal<RepoResponse | null>(null);
  const [activeTab, setActiveTab] = createSignal<"files" | "commits" | "prs">("files");
  const [currentPath, setCurrentPath] = createSignal("");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [contentsCache, setContentsCache] = createSignal<Map<string, RepoContentEntry[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = createSignal<Set<string>>(new Set());

  const [repoDetail, { refetch: refetchDetail }] = createResource(
    () => activeRepo() ? { owner: activeRepo()!.owner, name: activeRepo()!.name } : null,
    (args) => getRepoDetail(args.owner, args.name).catch(() => null)
  );

  const getCacheKey = (owner: string, name: string, path: string) => `${owner}/${name}:${path || "/"}`;

  const loadContents = async (owner: string, name: string, path: string = "") => {
    const key = getCacheKey(owner, name, path);
    if (contentsCache().has(key)) return;
    setLoadingPaths(prev => new Set([...prev, key]));
    try {
      const contents = await listRepoContents(owner, name, path);
      contents.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setContentsCache(prev => new Map([...prev, [key, contents]]));
    } catch {
      setContentsCache(prev => new Map([...prev, [key, []]]));
    } finally {
      setLoadingPaths(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const openRepo = (repo: RepoResponse) => {
    setActiveRepo(repo);
    setView("detail");
    setActiveTab("files");
    setCurrentPath("");
    setSearchQuery("");
    loadContents(repo.owner, repo.name, "");
  };

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setSearchQuery("");
    loadContents(activeRepo()!.owner, activeRepo()!.name, path);
  };

  const goBack = () => {
    if (currentPath()) {
      const parts = currentPath().split("/");
      parts.pop();
      setCurrentPath(parts.join("/"));
      setSearchQuery("");
    } else {
      setView("repos");
      setActiveRepo(null);
      setSearchQuery("");
    }
  };

  const createGhCtx = (owner: string, repo: string, path: string, isFile: boolean): GitHubPathContext => ({
    type: "github-path", source: "github", owner, repo, path: path || "/", isFile,
  });

  const isSelected = (ctx: GitHubPathContext) => {
    return props.selectedContexts.some(c => getContextId(c) === getContextId(ctx));
  };

  const currentContents = () => {
    const repo = activeRepo();
    if (!repo) return [];
    const key = getCacheKey(repo.owner, repo.name, currentPath());
    const contents = contentsCache().get(key) || [];
    const q = searchQuery().toLowerCase();
    if (!q) return contents;
    return contents.filter(e => e.name.toLowerCase().includes(q));
  };

  const isLoading = () => {
    const repo = activeRepo();
    if (!repo) return false;
    return loadingPaths().has(getCacheKey(repo.owner, repo.name, currentPath()));
  };

  const timeAgo = (timestamp?: string) => {
    if (!timestamp) return "";
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  // Breadcrumb text
  const breadcrumbText = () => {
    if (view() === "repos") return "Repositories";
    const repo = activeRepo();
    if (!repo) return "";
    if (!currentPath()) return repo.name;
    return `${repo.name}/${currentPath()}`;
  };

  return (
    <div>
      {/* Navigation header */}
      <div class="flex items-center gap-1 px-3 py-2 border-b border-border/50 bg-surface/30">
        <Show when={view() === "detail"}>
          <button onClick={goBack} class="p-1 text-text-muted hover:text-text rounded transition-colors">
            <FiArrowLeft class="w-3 h-3" />
          </button>
        </Show>
        <span class="text-xs text-text-muted font-semibold truncate">{breadcrumbText()}</span>
        <div class="flex-1" />
        <Show when={view() === "detail"}>
          <button onClick={() => { refetchDetail(); }} class="p-1 text-text-muted hover:text-text rounded transition-colors">
            <FiRefreshCw class="w-3 h-3" />
          </button>
        </Show>
      </div>

      {/* Search */}
      <div class="px-3 py-1.5 border-b border-border/50">
        <div class="relative">
          <FiSearch class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            type="text"
            placeholder={view() === "repos" ? "Filter repos..." : "Filter files..."}
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full pl-7 pr-2 py-1 text-xs bg-surface-2 border border-border rounded-md text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-text/30 focus:border-text/50 transition-colors"
          />
        </div>
      </div>

      {/* Repo list */}
      <Show when={view() === "repos"}>
        <div class="divide-y divide-border/30">
          <For each={props.repos.filter(r => !searchQuery() || r.name.toLowerCase().includes(searchQuery().toLowerCase()))}>
            {(repo) => {
              const rootCtx = createGhCtx(repo.owner, repo.name, "/", false);
              return (
                <div class="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors group">
                  <SelectionDot selected={isSelected(rootCtx)} onClick={() => props.onToggleSelect(rootCtx)} color="gray" size="sm" />
                  <button onClick={() => openRepo(repo)} class="flex-1 flex items-center gap-2 text-left min-w-0">
                    <GitHubIcon class="w-3.5 h-3.5 text-text shrink-0" />
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-text truncate">{repo.name}</div>
                      <div class="text-xs text-text-muted">{repo.owner}</div>
                    </div>
                    <FiChevronRight class="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                </div>
              );
            }}
          </For>
        </div>
        <Show when={props.repos.length === 0}><MiniEmpty message="No repositories" /></Show>
      </Show>

      {/* Repo detail */}
      <Show when={view() === "detail"}>
        <div class="flex items-center border-b border-border/50 px-1">
          <InlineTabButton label="Files" active={activeTab() === "files"} onClick={() => { setActiveTab("files"); setSearchQuery(""); }} />
          <InlineTabButton label="Commits" active={activeTab() === "commits"} onClick={() => { setActiveTab("commits"); setSearchQuery(""); }} />
          <InlineTabButton label="PRs" active={activeTab() === "prs"} onClick={() => { setActiveTab("prs"); setSearchQuery(""); }} />
        </div>

        {/* Files */}
        <Show when={activeTab() === "files"}>
          <Show when={isLoading()}><MiniLoader message="Loading..." /></Show>
          <Show when={!isLoading()}>
            <Show when={currentPath()}>
              <button onClick={goBack} class="flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-hover/50 w-full text-left transition-colors">
                <FiArrowLeft class="w-3 h-3" /><span>..</span>
              </button>
            </Show>
            <div class="divide-y divide-border/30">
              <For each={currentContents()}>
                {(entry) => {
                  const isDir = entry.type === "dir";
                  const ctx = createGhCtx(activeRepo()!.owner, activeRepo()!.name, entry.path, !isDir);
                  return (
                    <div class="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover/50 transition-colors">
                      <SelectionDot selected={isSelected(ctx)} onClick={() => props.onToggleSelect(ctx)} color="gray" size="sm" />
                      <button
                        onClick={() => isDir ? navigateTo(entry.path) : props.onToggleSelect(ctx)}
                        class="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        {isDir
                          ? <FiFolder class="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                          : <FiFile class="w-3.5 h-3.5 text-text-muted shrink-0" />
                        }
                        <span class="text-xs text-text truncate flex-1">{entry.name}</span>
                        <Show when={isDir}>
                          <FiChevronRight class="w-3 h-3 text-text-muted/50 shrink-0" />
                        </Show>
                        <Show when={!isDir && entry.size > 0}>
                          <span class="text-xs text-text-muted shrink-0">
                            {entry.size > 1024 ? `${(entry.size / 1024).toFixed(1)}K` : `${entry.size}B`}
                          </span>
                        </Show>
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
            <Show when={currentContents().length === 0}><MiniEmpty message="Empty" /></Show>
          </Show>
        </Show>

        {/* Commits */}
        <Show when={activeTab() === "commits"}>
          <Show when={repoDetail.loading}><MiniLoader message="Loading..." /></Show>
          <Show when={!repoDetail.loading}>
            <div class="divide-y divide-border/30">
              <For each={repoDetail()?.recentCommits || []}>
                {(commit) => (
                  <div class="flex items-start gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors">
                    <FiGitCommit class="w-3 h-3 text-text-muted shrink-0 mt-0.5" />
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-text leading-snug truncate">{commit.message.split("\n")[0]}</div>
                      <div class="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
                        <span>{commit.author}</span>
                        <span class="text-text-muted/40">·</span>
                        <span>{timeAgo(commit.timestamp)}</span>
                        <span class="font-mono text-xs text-text-muted/60">{commit.sha.slice(0, 7)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
            <Show when={!repoDetail()?.recentCommits?.length}><MiniEmpty message="No commits" /></Show>
          </Show>
        </Show>

        {/* PRs */}
        <Show when={activeTab() === "prs"}>
          <Show when={repoDetail.loading}><MiniLoader message="Loading..." /></Show>
          <Show when={!repoDetail.loading}>
            <div class="divide-y divide-border/30">
              <For each={repoDetail()?.pullRequests || []}>
                {(pr) => (
                  <div class="flex items-start gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors">
                    <FiGitPullRequest class={`w-3 h-3 shrink-0 mt-0.5 ${
                      pr.state === "open" ? "text-success" : pr.state === "merged" ? "text-purple-400" : "text-error"
                    }`} />
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-text leading-snug truncate">
                        {pr.title} <span class="text-text-muted text-xs">#{pr.number}</span>
                      </div>
                      <div class="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
                        <span>{pr.author}</span>
                        <span class="text-text-muted/40">·</span>
                        <span>{pr.branch}</span>
                        <Show when={pr.additions > 0 || pr.deletions > 0}>
                          <span class="text-success">+{pr.additions}</span>
                          <span class="text-error">-{pr.deletions}</span>
                        </Show>
                      </div>
                    </div>
                    <span class={`text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                      pr.state === "open" ? "bg-success/10 text-success" :
                      pr.state === "merged" ? "bg-purple-500/10 text-purple-400" : "bg-error/10 text-error"
                    }`}>{pr.state}</span>
                  </div>
                )}
              </For>
            </div>
            <Show when={!repoDetail()?.pullRequests?.length}><MiniEmpty message="No PRs" /></Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
};

// =============================================================================
// INLINE GITLAB BROWSER
// =============================================================================

interface InlineGitLabBrowserProps {
  repos: RepoResponse[];
  onToggleSelect: (item: GitLabPathContext) => void;
  selectedContexts: SelectedContext[];
}

const InlineGitLabBrowser: Component<InlineGitLabBrowserProps> = (props) => {
  const [view, setView] = createSignal<"repos" | "detail">("repos");
  const [activeRepo, setActiveRepo] = createSignal<RepoResponse | null>(null);
  const [activeTab, setActiveTab] = createSignal<"files" | "commits" | "mrs">("files");
  const [currentPath, setCurrentPath] = createSignal("");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [contentsCache, setContentsCache] = createSignal<Map<string, RepoContentEntry[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = createSignal<Set<string>>(new Set());

  const [repoDetail, { refetch: refetchDetail }] = createResource(
    () => activeRepo() ? { owner: activeRepo()!.owner, name: activeRepo()!.name } : null,
    (args) => getRepoDetail(args.owner, args.name).catch(() => null)
  );

  const getCacheKey = (owner: string, name: string, path: string) => `${owner}/${name}:${path || "/"}`;

  const loadContents = async (owner: string, name: string, path: string = "") => {
    const key = getCacheKey(owner, name, path);
    if (contentsCache().has(key)) return;
    setLoadingPaths(prev => new Set([...prev, key]));
    try {
      const contents = await listRepoContents(owner, name, path);
      contents.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setContentsCache(prev => new Map([...prev, [key, contents]]));
    } catch {
      setContentsCache(prev => new Map([...prev, [key, []]]));
    } finally {
      setLoadingPaths(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const openRepo = (repo: RepoResponse) => {
    setActiveRepo(repo);
    setView("detail");
    setActiveTab("files");
    setCurrentPath("");
    setSearchQuery("");
    loadContents(repo.owner, repo.name, "");
  };

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setSearchQuery("");
    loadContents(activeRepo()!.owner, activeRepo()!.name, path);
  };

  const goBack = () => {
    if (currentPath()) {
      const parts = currentPath().split("/");
      parts.pop();
      setCurrentPath(parts.join("/"));
      setSearchQuery("");
    } else {
      setView("repos");
      setActiveRepo(null);
      setSearchQuery("");
    }
  };

  const createGlCtx = (owner: string, repo: string, path: string, isFile: boolean): GitLabPathContext => ({
    type: "gitlab-path", source: "gitlab", project: `${owner}/${repo}`, path: path || "/", isFile,
  });

  const isSelected = (ctx: GitLabPathContext) => {
    return props.selectedContexts.some(c => getContextId(c) === getContextId(ctx));
  };

  const currentContents = () => {
    const repo = activeRepo();
    if (!repo) return [];
    const key = getCacheKey(repo.owner, repo.name, currentPath());
    const contents = contentsCache().get(key) || [];
    const q = searchQuery().toLowerCase();
    if (!q) return contents;
    return contents.filter(e => e.name.toLowerCase().includes(q));
  };

  const isLoading = () => {
    const repo = activeRepo();
    if (!repo) return false;
    return loadingPaths().has(getCacheKey(repo.owner, repo.name, currentPath()));
  };

  const timeAgo = (timestamp?: string) => {
    if (!timestamp) return "";
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const breadcrumbText = () => {
    if (view() === "repos") return "Projects";
    const repo = activeRepo();
    if (!repo) return "";
    if (!currentPath()) return `${repo.owner}/${repo.name}`;
    return `${repo.name}/${currentPath()}`;
  };

  return (
    <div>
      {/* Navigation header */}
      <div class="flex items-center gap-1 px-3 py-2 border-b border-border/50 bg-surface/30">
        <Show when={view() === "detail"}>
          <button onClick={goBack} class="p-1 text-text-muted hover:text-text rounded transition-colors">
            <FiArrowLeft class="w-3 h-3" />
          </button>
        </Show>
        <span class="text-xs text-text-muted font-semibold truncate">{breadcrumbText()}</span>
        <div class="flex-1" />
        <Show when={view() === "detail"}>
          <button onClick={() => { refetchDetail(); }} class="p-1 text-text-muted hover:text-text rounded transition-colors">
            <FiRefreshCw class="w-3 h-3" />
          </button>
        </Show>
      </div>

      {/* Search */}
      <div class="px-3 py-1.5 border-b border-border/50">
        <div class="relative">
          <FiSearch class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            type="text"
            placeholder={view() === "repos" ? "Filter projects..." : "Filter files..."}
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full pl-7 pr-2 py-1 text-xs bg-surface-2 border border-border rounded-md text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-text/30 focus:border-text/50 transition-colors"
          />
        </div>
      </div>

      {/* Project list */}
      <Show when={view() === "repos"}>
        <div class="divide-y divide-border/30">
          <For each={props.repos.filter(r => !searchQuery() || r.name.toLowerCase().includes(searchQuery().toLowerCase()))}>
            {(repo) => {
              const rootCtx = createGlCtx(repo.owner, repo.name, "/", false);
              return (
                <div class="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors group">
                  <SelectionDot selected={isSelected(rootCtx)} onClick={() => props.onToggleSelect(rootCtx)} color="orange" size="sm" />
                  <button onClick={() => openRepo(repo)} class="flex-1 flex items-center gap-2 text-left min-w-0">
                    <GitLabIcon class="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-text truncate">{repo.name}</div>
                      <div class="text-xs text-text-muted">{repo.owner}</div>
                    </div>
                    <FiChevronRight class="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                </div>
              );
            }}
          </For>
        </div>
        <Show when={props.repos.length === 0}><MiniEmpty message="No projects" /></Show>
      </Show>

      {/* Project detail */}
      <Show when={view() === "detail"}>
        <div class="flex items-center border-b border-border/50 px-1">
          <InlineTabButton label="Files" active={activeTab() === "files"} onClick={() => { setActiveTab("files"); setSearchQuery(""); }} />
          <InlineTabButton label="Commits" active={activeTab() === "commits"} onClick={() => { setActiveTab("commits"); setSearchQuery(""); }} />
          <InlineTabButton label="MRs" active={activeTab() === "mrs"} onClick={() => { setActiveTab("mrs"); setSearchQuery(""); }} />
        </div>

        {/* Files */}
        <Show when={activeTab() === "files"}>
          <Show when={isLoading()}><MiniLoader message="Loading..." /></Show>
          <Show when={!isLoading()}>
            <Show when={currentPath()}>
              <button onClick={goBack} class="flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-hover/50 w-full text-left transition-colors">
                <FiArrowLeft class="w-3 h-3" /><span>..</span>
              </button>
            </Show>
            <div class="divide-y divide-border/30">
              <For each={currentContents()}>
                {(entry) => {
                  const isDir = entry.type === "dir";
                  const ctx = createGlCtx(activeRepo()!.owner, activeRepo()!.name, entry.path, !isDir);
                  return (
                    <div class="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover/50 transition-colors">
                      <SelectionDot selected={isSelected(ctx)} onClick={() => props.onToggleSelect(ctx)} color="orange" size="sm" />
                      <button
                        onClick={() => isDir ? navigateTo(entry.path) : props.onToggleSelect(ctx)}
                        class="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        {isDir
                          ? <FiFolder class="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                          : <FiFile class="w-3.5 h-3.5 text-text-muted shrink-0" />
                        }
                        <span class="text-xs text-text truncate flex-1">{entry.name}</span>
                        <Show when={isDir}>
                          <FiChevronRight class="w-3 h-3 text-text-muted/50 shrink-0" />
                        </Show>
                        <Show when={!isDir && entry.size > 0}>
                          <span class="text-xs text-text-muted shrink-0">
                            {entry.size > 1024 ? `${(entry.size / 1024).toFixed(1)}K` : `${entry.size}B`}
                          </span>
                        </Show>
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
            <Show when={currentContents().length === 0}><MiniEmpty message="Empty" /></Show>
          </Show>
        </Show>

        {/* Commits */}
        <Show when={activeTab() === "commits"}>
          <Show when={repoDetail.loading}><MiniLoader message="Loading..." /></Show>
          <Show when={!repoDetail.loading}>
            <div class="divide-y divide-border/30">
              <For each={repoDetail()?.recentCommits || []}>
                {(commit) => (
                  <div class="flex items-start gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors">
                    <FiGitCommit class="w-3 h-3 text-text-muted shrink-0 mt-0.5" />
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-text leading-snug truncate">{commit.message.split("\n")[0]}</div>
                      <div class="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
                        <span>{commit.author}</span>
                        <span class="text-text-muted/40">·</span>
                        <span>{timeAgo(commit.timestamp)}</span>
                        <span class="font-mono text-xs text-text-muted/60">{commit.sha.slice(0, 7)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
            <Show when={!repoDetail()?.recentCommits?.length}><MiniEmpty message="No commits" /></Show>
          </Show>
        </Show>

        {/* MRs (Merge Requests) */}
        <Show when={activeTab() === "mrs"}>
          <Show when={repoDetail.loading}><MiniLoader message="Loading..." /></Show>
          <Show when={!repoDetail.loading}>
            <div class="divide-y divide-border/30">
              <For each={repoDetail()?.pullRequests || []}>
                {(pr) => (
                  <div class="flex items-start gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors">
                    <FiGitPullRequest class={`w-3 h-3 shrink-0 mt-0.5 ${
                      pr.state === "open" ? "text-success" : pr.state === "merged" ? "text-purple-400" : "text-error"
                    }`} />
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-text leading-snug truncate">
                        {pr.title} <span class="text-text-muted text-xs">!{pr.number}</span>
                      </div>
                      <div class="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
                        <span>{pr.author}</span>
                        <span class="text-text-muted/40">·</span>
                        <span>{pr.branch}</span>
                        <Show when={pr.additions > 0 || pr.deletions > 0}>
                          <span class="text-success">+{pr.additions}</span>
                          <span class="text-error">-{pr.deletions}</span>
                        </Show>
                      </div>
                    </div>
                    <span class={`text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                      pr.state === "open" ? "bg-success/10 text-success" :
                      pr.state === "merged" ? "bg-purple-500/10 text-purple-400" : "bg-error/10 text-error"
                    }`}>{pr.state}</span>
                  </div>
                )}
              </For>
            </div>
            <Show when={!repoDetail()?.pullRequests?.length}><MiniEmpty message="No merge requests" /></Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
};

// =============================================================================
// SHARED MINI COMPONENTS (compact for sidebar use)
// =============================================================================

const MiniLoader = (props: { message: string }) => (
  <div class="flex items-center justify-center gap-2 py-6">
    <div class="w-3.5 h-3.5 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
    <span class="text-xs text-text-muted">{props.message}</span>
  </div>
);

const MiniEmpty = (props: { message: string }) => (
  <div class="text-center py-6">
    <p class="text-xs text-text-muted">{props.message}</p>
  </div>
);

export default CapabilityBrowser;

// Named exports for reuse in AgentDetailPanel
export {
  CapabilityBrowser,
  InlineK8sBrowser,
  InlineHelmBrowser,
  InlineGitHubBrowser,
  InlineGitLabBrowser,
  PermissionsView,
  StatusView,
  SelectionDot,
  CapabilityTabButton,
  InlineTabButton,
  MiniLoader,
  MiniEmpty,
  accentMap,
  capabilityMeta,
  KubernetesIcon,
  HelmIcon,
  GitHubIcon,
  GitLabIcon,
};

export type { CapabilityType, CapabilityTab, CapabilityInfo };
