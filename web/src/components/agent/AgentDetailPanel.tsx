import { createSignal, Show, For, type Component, onCleanup } from "solid-js";
import {
  FiCpu, FiChevronDown, FiTool, FiBookOpen,
  FiClock, FiGitBranch,
  FiTerminal, FiFileText, FiEdit, FiSearch, FiGlobe, FiUsers,
  FiEye, FiFile, FiCheck
} from "solid-icons/fi";
import type { AgentResponse, CapabilityResponse } from "../../lib/api";
import {
  detectToolCategory,
  toolThemes,
  getCategoryIcon,
  getCategoryLabel,
} from "../../lib/capability-themes";

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
}

const AgentDetailPanel: Component<AgentDetailPanelProps> = (props) => {
  const [selectorOpen, setSelectorOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
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

  const agentCapabilities = () => {
    const refs = props.agent.spec.capabilityRefs || [];
    if (!props.capabilities) return [];
    return refs.map(ref => {
      const cap = props.capabilities!.find(c => c.metadata.name === ref.name);
      return { ref, capability: cap };
    }).filter(c => c.capability);
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
            <Show when={agentCapabilities().length > 0}>
              <span class="text-border-hover">·</span>
              <span>{agentCapabilities().length} capabilities</span>
            </Show>
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
        {/* Metadata badges */}
        <div class="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
          <span class={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${
            props.agent.status?.ready
              ? "bg-success/10 border-success/20 text-success"
              : "bg-warning/10 border-warning/20 text-warning"
          }`}>
            <span class="w-1 h-1 rounded-full bg-current" />
            {props.agent.status?.ready ? "Ready" : props.agent.status?.phase || "Pending"}
          </span>

          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-surface-2 border border-border rounded text-text-muted">
            <FiClock class="w-2.5 h-2.5" />
            {formatTimestamp(props.agent.metadata.creationTimestamp)}
          </span>
        </div>

        {/* Capabilities (always visible) */}
        <Show when={agentCapabilities().length > 0}>
          <div class="border-t border-border/30 px-3 py-2">
            <div class="flex items-center gap-1.5 mb-1.5">
              <FiBookOpen class="w-3 h-3 text-text-muted" />
              <span class="text-[11px] font-medium text-text-secondary">Capabilities</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-text-muted font-medium">
                {agentCapabilities().length}
              </span>
            </div>
            <div class="space-y-1">
              <For each={agentCapabilities()}>
                {({ ref, capability }) => {
                  const cat = detectToolCategory(ref.alias || ref.name);
                  const theme = toolThemes[cat];
                  const Icon = getCategoryIcon(cat);
                  const label = getCategoryLabel(cat);
                  return (
                    <div class={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${theme.border || "border-border"} ${theme.bg || "bg-surface-2"}`}>
                      <Icon class={`w-3.5 h-3.5 ${theme.iconColor} shrink-0`} />
                      <div class="min-w-0 flex-1">
                        <p class="text-xs text-text truncate">{ref.alias || ref.name}</p>
                        <Show when={capability}>
                          <p class="text-[10px] text-text-muted truncate">{capability!.spec.description}</p>
                        </Show>
                      </div>
                      <Show when={label}>
                        <span class={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${theme.badge}`}>
                          {label}
                        </span>
                      </Show>
                      <Show when={!label && capability?.spec.type}>
                        <span class="text-[10px] px-1 py-0.5 bg-surface border border-border rounded text-text-muted shrink-0">
                          {capability!.spec.type}
                        </span>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        {/* System Prompt (always visible, scrollable) */}
        <Show when={props.agent.spec.identity?.systemPrompt}>
          <div class="border-t border-border/30 px-3 py-2">
            <div class="flex items-center gap-1.5 mb-1.5">
              <FiFileText class="w-3 h-3 text-text-muted" />
              <span class="text-[11px] font-medium text-text-secondary">System Prompt</span>
            </div>
            <div class="bg-surface-2 rounded-md border border-border">
              <div class="px-2.5 py-2 text-[11px] font-mono text-text-secondary whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
                {props.agent.spec.identity?.systemPrompt}
              </div>
            </div>
          </div>
        </Show>

        {/* GitOps indicator */}
        <div class="border-t border-border/50 px-3 py-1.5 flex items-center gap-2">
          <FiGitBranch class="w-2.5 h-2.5 text-text-muted" />
          <span class="text-[10px] text-text-muted">GitOps Managed</span>
        </div>
      </Show>
    </div>
  );
};

export default AgentDetailPanel;
