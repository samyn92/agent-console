import { createSignal, Show, For, type Component, onCleanup } from "solid-js";
import {
  FiCpu, FiChevronDown, FiChevronRight, FiTool, FiBookOpen,
  FiTerminal, FiFileText, FiEdit, FiSearch, FiGlobe, FiUsers,
  FiEye, FiFile, FiCheck, FiX, FiAlertTriangle, FiClock, FiShield,
} from "solid-icons/fi";
import type { AgentResponse, CapabilityResponse, RepoResponse } from "../../lib/api";
import type { SelectedContext } from "../../types/context";
import { getContextId, getContextLabel } from "../chat/ContextBar";
import {
  detectToolCategory,
  toolThemes,
  getCategoryIcon,
  getCategoryLabel,
} from "../../lib/capability-themes";
import {
  accentMap,
  capabilityMeta,
  InlineK8sBrowser,
  InlineHelmBrowser,
  InlineGitHubBrowser,
  InlineGitLabBrowser,
  PermissionsView,
  StatusView,
  CapabilityTabButton,
} from "../sources/CapabilityBrowser";
import type { CapabilityType, CapabilityTab, CapabilityInfo } from "../sources/CapabilityBrowser";

// =============================================================================
// TOOL ICON MAP
// =============================================================================

const toolIconMap: Record<string, any> = {
  bash: FiTerminal,
  read: FiEye,
  write: FiFileText,
  edit: FiEdit,
  glob: FiFile,
  grep: FiSearch,
  webfetch: FiGlobe,
  task: FiUsers,
};

// =============================================================================
// HELPERS
// =============================================================================

const getAgentDisplayName = (agent: AgentResponse) =>
  agent.spec.identity?.name || agent.metadata.name;

const getModelShort = (model: string) => {
  // Strip date suffix like -20250514 from model name
  return model.replace(/-\d{8}$/, "");
};

const getAgentTools = (agent: AgentResponse) => {
  const tools = agent.spec.tools;
  if (!tools) return [];
  return Object.entries(tools)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
};

const getCapabilityNames = (agent: AgentResponse) =>
  (agent.spec.capabilityRefs || []).map(r => r.alias || r.name);

// =============================================================================
// AGENT DETAIL PANEL
// =============================================================================

interface AgentDetailPanelProps {
  agent: AgentResponse;
  agents: AgentResponse[];
  onSelectAgent: (agent: AgentResponse) => void;
  capabilities?: CapabilityResponse[];
  loading?: boolean;
  // Resource browser integration
  selectedContexts?: SelectedContext[];
  onToggleSelect?: (item: SelectedContext) => void;
  repos?: RepoResponse[];
}

const AgentDetailPanel: Component<AgentDetailPanelProps> = (props) => {
  const [selectorOpen, setSelectorOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [expandedCapability, setExpandedCapability] = createSignal<CapabilityType | null>(null);
  const [activeCapTab, setActiveCapTab] = createSignal<CapabilityTab>("browse");
  let dropdownRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  // Close dropdown when clicking outside
  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setSelectorOpen(false);
      setSearchQuery("");
    }
  };

  const toggleSelector = () => {
    const opening = !selectorOpen();
    setSelectorOpen(opening);
    if (opening) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchInputRef?.focus(), 50);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
      setSearchQuery("");
    }
  };

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  const filteredAgents = () => {
    const query = searchQuery().toLowerCase();
    if (!query) return props.agents;
    return props.agents.filter(
      (agent) =>
        agent.metadata.name.toLowerCase().includes(query) ||
        agent.spec.identity?.name?.toLowerCase().includes(query) ||
        agent.metadata.namespace.toLowerCase().includes(query) ||
        getCapabilityNames(agent).some(c => c.toLowerCase().includes(query))
    );
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return ts;
    }
  };

  // Detect capability types from refs and resolve to CapabilityInfo[]
  const detectedCapabilities = (): CapabilityInfo[] => {
    const refs = props.agent.spec.capabilityRefs || [];
    const allCapabilities = props.capabilities || [];
    const result: CapabilityInfo[] = [];

    for (const ref of refs) {
      const name = ref.name.toLowerCase();
      let type: CapabilityType | null = null;
      if (name.includes("kubectl") || name.includes("kubernetes")) type = "kubernetes";
      else if (name.includes("helm")) type = "helm";
      else if (name.includes("github")) type = "github";
      else if (name.includes("gitlab")) type = "gitlab";

      if (type && !result.some(s => s.type === type)) {
        const capability = allCapabilities.find(s => s.metadata.name === ref.name);
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
      setActiveCapTab("browse");
    }
  };

  const selectedCount = (type: CapabilityType) => {
    if (!props.selectedContexts) return 0;
    return props.selectedContexts.filter(c => {
      if (type === "kubernetes") return c.type === "k8s-resource";
      if (type === "helm") return c.type === "helm-release";
      if (type === "github") return c.type === "github-path";
      if (type === "gitlab") return c.type === "gitlab-path";
      return false;
    }).length;
  };

  const contextsByType = (type: CapabilityType) => {
    if (!props.selectedContexts) return [];
    return props.selectedContexts.filter(c => {
      if (type === "kubernetes") return c.type === "k8s-resource";
      if (type === "helm") return c.type === "helm-release";
      if (type === "github") return c.type === "github-path";
      if (type === "gitlab") return c.type === "gitlab-path";
      return false;
    });
  };

  return (
    <div class="shrink-0 border-b border-border" ref={dropdownRef}>
      {/* ===== Agent Header (clickable to open selector) ===== */}
      <button
        onClick={toggleSelector}
        class={`w-full flex items-center gap-3 px-3 py-3 transition-all duration-200 cursor-pointer ${
          selectorOpen() ? "bg-surface-2" : "hover:bg-surface-hover"
        }`}
      >
        {/* Avatar */}
        <div class="w-9 h-9 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0">
          <FiCpu class="w-4 h-4 text-text-secondary" />
        </div>

        {/* Name + sub-info */}
        <div class="flex-1 min-w-0 text-left">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-semibold text-text truncate">
              {getAgentDisplayName(props.agent)}
            </span>
            <Show when={props.agent.status?.ready}>
              <span class="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
            </Show>
          </div>
          <div class="flex items-center gap-1.5 text-xs text-text-muted leading-tight">
            <span class="truncate">{getModelShort(props.agent.spec.model)}</span>
            <span class="text-border-hover">·</span>
            <span>{formatTimestamp(props.agent.metadata.creationTimestamp)}</span>
          </div>
        </div>

        <FiChevronDown
          class={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 shrink-0 ${
            selectorOpen() ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* ===== Agent Selector Dropdown (menu of agents) ===== */}
      <Show when={selectorOpen()}>
        <div class="border-t border-border bg-surface">
          {/* Search */}
          <div class="p-2 border-b border-border/50">
            <div class="relative">
              <FiSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                placeholder="Search agents..."
                class="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-md text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-text/30 focus:border-text/50 transition-colors"
              />
            </div>
          </div>

          {/* Agent cards */}
          <div class="max-h-[60vh] overflow-y-auto p-1.5 space-y-1">
            <For each={filteredAgents()}>
              {(agent) => {
                const isSelected = () =>
                  props.agent.metadata.name === agent.metadata.name &&
                  props.agent.metadata.namespace === agent.metadata.namespace;
                const caps = () => getCapabilityNames(agent);
                const tools = () => getAgentTools(agent);

                return (
                  <button
                    onClick={() => {
                      props.onSelectAgent(agent);
                      setSelectorOpen(false);
                      setSearchQuery("");
                    }}
                    class={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${
                      isSelected()
                        ? "bg-accent/8 ring-1 ring-accent/20"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    {/* Top row: avatar + name + status */}
                    <div class="flex items-center gap-2.5 mb-1.5">
                      <div class={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        isSelected() ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-border"
                      }`}>
                        <FiCpu class={`w-3.5 h-3.5 ${isSelected() ? "text-accent" : "text-text-secondary"}`} />
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-sm font-medium text-text truncate">
                            {getAgentDisplayName(agent)}
                          </span>
                          <Show when={agent.status?.ready}>
                            <span class="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                          </Show>
                        </div>
                        <div class="flex items-center gap-1.5 text-[11px] text-text-muted leading-tight">
                          <span class="truncate">{agent.metadata.namespace}</span>
                          <span class="text-border-hover">·</span>
                          <span class="truncate">{getModelShort(agent.spec.model)}</span>
                        </div>
                      </div>
                      <Show when={isSelected()}>
                        <FiCheck class="w-3.5 h-3.5 text-accent shrink-0" />
                      </Show>
                    </div>

                    {/* Capability tags (themed to match tool cards) */}
                    <Show when={caps().length > 0}>
                      <div class="flex flex-wrap gap-1 ml-[38px]">
                        <For each={caps()}>
                          {(cap) => {
                            const cat = detectToolCategory(cap);
                            const theme = toolThemes[cat];
                            const Icon = getCategoryIcon(cat);
                            const label = getCategoryLabel(cat);
                            return (
                              <span class={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${theme.badge || "bg-surface-2 text-text-muted"}`}>
                                <Icon class={`w-2.5 h-2.5 ${theme.iconColor}`} />
                                {label || cap}
                              </span>
                            );
                          }}
                        </For>
                      </div>
                    </Show>

                    {/* Tool tags */}
                    <Show when={tools().length > 0}>
                      <div class="flex flex-wrap gap-1 mt-1 ml-[38px]">
                        <For each={tools()}>
                          {(tool) => {
                            const ToolIcon = toolIconMap[tool] || FiTool;
                            return (
                              <span class="inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] bg-surface-2/60 border border-border/60 rounded text-text-muted font-mono">
                                <ToolIcon class="w-2 h-2" />
                                {tool}
                              </span>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </button>
                );
              }}
            </For>
            <Show when={filteredAgents().length === 0}>
              <p class="text-sm text-text-muted text-center py-4">No agents found</p>
            </Show>
          </div>
        </div>
      </Show>

      {/* ===== Selected Agent Details (when dropdown closed) ===== */}
      <Show when={!selectorOpen()}>
        {/* Compact info bar: capability badges + system prompt toggle */}
        <div class="border-t border-border px-3 py-1.5 space-y-1.5">
          {/* Capability badges row */}
          <Show when={detectedCapabilities().length > 0}>
            <div class="flex items-center gap-1.5 flex-wrap">
              <For each={detectedCapabilities()}>
                {(info) => {
                  const accent = () => accentMap[info.type];
                  const meta = () => capabilityMeta[info.type];
                  const isExpanded = () => expandedCapability() === info.type;
                  const Icon = meta().icon;
                  const phase = () => info.capability?.status?.phase || "Unknown";

                  return (
                    <button
                      onClick={() => toggleCapability(info.type)}
                      class={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                        isExpanded()
                          ? `${accent().borderActive} bg-gradient-to-br ${accent().bg} shadow-sm`
                          : `${accent().border} hover:${accent().bg} bg-transparent`
                      }`}
                    >
                      <Icon class={`w-3.5 h-3.5 ${accent().iconColor}`} />
                      <span class="text-text">{meta().label}</span>
                      <Show when={phase() === "Ready"}>
                        <span class="w-1.5 h-1.5 rounded-full bg-success" />
                      </Show>
                      <Show when={phase() === "Failed"}>
                        <span class="w-1.5 h-1.5 rounded-full bg-error" />
                      </Show>
                      <Show when={selectedCount(info.type) > 0}>
                        <span class={`text-[9px] font-bold px-1 py-0.5 rounded-full leading-none ${accent().badge}`}>
                          {selectedCount(info.type)}
                        </span>
                      </Show>
                    </button>
                  );
                }}
              </For>
              {/* Total selected count */}
              <Show when={props.selectedContexts && props.selectedContexts.length > 0}>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold ml-auto">
                  {props.selectedContexts!.length} sel.
                </span>
              </Show>
            </div>
          </Show>

          {/* System Prompt — collapsible */}
          <Show when={props.agent.spec.identity?.systemPrompt}>
            <details class="group">
              <summary class="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer hover:text-text-secondary select-none py-0.5">
                <FiChevronRight class="w-3 h-3 group-open:rotate-90 transition-transform" />
                <FiFileText class="w-3 h-3" />
                <span class="font-medium">System Prompt</span>
              </summary>
              <div class="mt-1 bg-surface-2 rounded-md border border-border">
                <div class="px-2.5 py-2 text-[11px] font-mono text-text-secondary whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
                  {props.agent.spec.identity?.systemPrompt}
                </div>
              </div>
            </details>
          </Show>
        </div>

        {/* Expanded capability browser (appears below badges when one is selected) */}
        <Show when={expandedCapability()}>
          <div class="border-t border-border">
            <For each={detectedCapabilities()}>
              {(info) => {
                const accent = () => accentMap[info.type];
                const isExpanded = () => expandedCapability() === info.type;

                return (
                  <Show when={isExpanded()}>
                    <div>
                      {/* Tab Bar */}
                      <div class="flex items-center border-b border-border/50 bg-surface/30">
                        <CapabilityTabButton
                          label="Browse"
                          active={activeCapTab() === "browse"}
                          onClick={() => setActiveCapTab("browse")}
                          type={info.type}
                        />
                        <CapabilityTabButton
                          label="Permissions"
                          active={activeCapTab() === "permissions"}
                          onClick={() => setActiveCapTab("permissions")}
                          type={info.type}
                        />
                        <CapabilityTabButton
                          label="Status"
                          active={activeCapTab() === "status"}
                          onClick={() => setActiveCapTab("status")}
                          type={info.type}
                        />
                      </div>

                      {/* Tab Content */}
                      <div class="max-h-[40vh] overflow-y-auto scrollbar-thin">
                        <Show when={activeCapTab() === "browse"}>
                          <Show when={props.onToggleSelect}>
                            <Show when={info.type === "kubernetes"}>
                              <InlineK8sBrowser
                                onToggleSelect={props.onToggleSelect!}
                                selectedContexts={props.selectedContexts || []}
                              />
                            </Show>
                            <Show when={info.type === "helm"}>
                              <InlineHelmBrowser
                                onToggleSelect={props.onToggleSelect!}
                                selectedContexts={props.selectedContexts || []}
                              />
                            </Show>
                            <Show when={info.type === "github"}>
                              <InlineGitHubBrowser
                                repos={(props.repos || []).filter(r => r.provider === "github")}
                                onToggleSelect={props.onToggleSelect!}
                                selectedContexts={props.selectedContexts || []}
                              />
                            </Show>
                            <Show when={info.type === "gitlab"}>
                              <InlineGitLabBrowser
                                repos={(props.repos || []).filter(r => r.provider === "gitlab")}
                                onToggleSelect={props.onToggleSelect!}
                                selectedContexts={props.selectedContexts || []}
                              />
                            </Show>
                          </Show>
                          <Show when={!props.onToggleSelect}>
                            <div class="text-center py-6">
                              <p class="text-xs text-text-muted">Resource browsing not available</p>
                            </div>
                          </Show>
                        </Show>

                        <Show when={activeCapTab() === "permissions"}>
                          <PermissionsView capability={info.capability} />
                        </Show>

                        <Show when={activeCapTab() === "status"}>
                          <StatusView capability={info.capability} />
                        </Show>
                      </div>

                      {/* Selected items for this capability */}
                      <Show when={contextsByType(info.type).length > 0 && props.onToggleSelect}>
                        <div class="border-t border-border/30 py-1">
                          <For each={contextsByType(info.type)}>
                            {(ctx) => (
                              <div class="group/row flex items-center gap-2 pl-4 pr-3 py-[3px] hover:bg-surface-hover/40 transition-colors">
                                <span class="text-xs text-text/70 truncate flex-1 tracking-tight" title={getContextLabel(ctx)}>
                                  {getContextLabel(ctx)}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); props.onToggleSelect!(ctx); }}
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
                  </Show>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default AgentDetailPanel;
