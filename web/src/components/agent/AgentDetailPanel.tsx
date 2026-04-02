import { createSignal, Show, For, type Component } from "solid-js";
import {
  FiCpu, FiChevronDown, FiChevronRight, FiTool, FiBookOpen,
  FiShield, FiClock, FiBox, FiGitBranch,
  FiTerminal, FiFileText, FiEdit, FiSearch, FiGlobe, FiUsers,
  FiEye, FiFile
} from "solid-icons/fi";
import type { AgentResponse, CapabilityResponse } from "../../lib/api";

// =============================================================================
// POPOVER COMPONENT
// =============================================================================

const Popover: Component<{
  trigger: any;
  children: any;
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  return (
    <div
      ref={containerRef}
      class="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {props.trigger}
      <Show when={open()}>
        <div class="absolute z-50 left-0 top-full mt-1 min-w-[240px] max-w-[320px] bg-surface border border-border rounded-lg shadow-lg p-3 fade-in">
          {props.children}
        </div>
      </Show>
    </div>
  );
};

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
// COLLAPSIBLE SECTION
// =============================================================================

const CollapsibleSection: Component<{
  title: string;
  icon: any;
  defaultOpen?: boolean;
  badge?: string;
  children: any;
}> = (props) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);
  const Icon = props.icon;

  return (
    <div class="border-t border-border/50">
      <button
        onClick={() => setOpen(!open())}
        class="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/50 transition-colors text-left"
      >
        <Icon class="w-3 h-3 text-text-muted shrink-0" />
        <span class="text-xs font-medium text-text-secondary flex-1">{props.title}</span>
        <Show when={props.badge}>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-text-muted font-medium">
            {props.badge}
          </span>
        </Show>
        <FiChevronRight
          class={`w-3 h-3 text-text-muted transition-transform duration-150 ${open() ? "rotate-90" : ""}`}
        />
      </button>
      <Show when={open()}>
        <div class="px-3 pb-2.5">
          {props.children}
        </div>
      </Show>
    </div>
  );
};

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

  const filteredAgents = () => {
    const query = searchQuery().toLowerCase();
    if (!query) return props.agents;
    return props.agents.filter(
      (agent) =>
        agent.metadata.name.toLowerCase().includes(query) ||
        agent.spec.identity?.name?.toLowerCase().includes(query) ||
        agent.metadata.namespace.toLowerCase().includes(query)
    );
  };

  const getAgentDisplayName = (agent: AgentResponse) =>
    agent.spec.identity?.name || agent.metadata.name;

  const getModelShort = (model: string) => {
    const parts = model.split("/");
    return parts[parts.length - 1];
  };

  const enabledTools = () => {
    const tools = props.agent.spec.tools;
    if (!tools) return [];
    return Object.entries(tools)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);
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
      {/* ===== Agent Header (clickable selector) ===== */}
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

        {/* Info */}
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
            <span class="truncate">{props.agent.metadata.namespace}</span>
            <span class="text-border-hover">·</span>
            <span class="truncate">{getModelShort(props.agent.spec.model)}</span>
          </div>
        </div>

        <FiChevronDown
          class={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 shrink-0 ${
            selectorOpen() ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* ===== Agent Selector Dropdown ===== */}
      <Show when={selectorOpen()}>
        <div class="border-t border-border bg-surface">
          {/* Search */}
          <div class="p-2 border-b border-border">
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
          {/* Agent list */}
          <div class="max-h-48 overflow-y-auto p-1">
            <For each={filteredAgents()}>
              {(agent) => {
                const isSelected = () =>
                  props.agent.metadata.name === agent.metadata.name &&
                  props.agent.metadata.namespace === agent.metadata.namespace;
                return (
                  <button
                    onClick={() => {
                      props.onSelectAgent(agent);
                      setSelectorOpen(false);
                      setSearchQuery("");
                    }}
                    class={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${
                      isSelected() ? "bg-accent/10 text-text" : "hover:bg-surface-hover text-text"
                    }`}
                  >
                    <div class={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                      isSelected() ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-border"
                    }`}>
                      <FiCpu class={`w-3.5 h-3.5 ${isSelected() ? "text-accent" : "text-text-secondary"}`} />
                    </div>
                    <div class="flex-1 min-w-0">
                      <span class="text-sm text-text truncate block">{getAgentDisplayName(agent)}</span>
                      <div class="flex items-center gap-1.5 text-xs text-text-muted leading-tight">
                        <span class="truncate">{agent.metadata.namespace}</span>
                        <span class="text-border-hover">·</span>
                        <span class="truncate">{getModelShort(agent.spec.model)}</span>
                      </div>
                    </div>
                    <Show when={agent.status?.ready}>
                      <span class="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
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

      {/* ===== Metadata Quick Row ===== */}
      <Show when={!selectorOpen()}>
        <div class="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
          {/* Model badge */}
          <Popover
            trigger={
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-surface-2 border border-border rounded text-text-secondary cursor-default">
                <FiCpu class="w-2.5 h-2.5" />
                {getModelShort(props.agent.spec.model)}
              </span>
            }
          >
            <div class="space-y-2">
              <div>
                <p class="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Model</p>
                <p class="text-xs text-text font-mono">{props.agent.spec.model}</p>
              </div>
              <div>
                <p class="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Provider</p>
                <p class="text-xs text-text capitalize">{props.agent.spec.provider}</p>
              </div>
            </div>
          </Popover>

          {/* Status badge */}
          <span class={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${
            props.agent.status?.ready
              ? "bg-success/10 border-success/20 text-success"
              : "bg-warning/10 border-warning/20 text-warning"
          }`}>
            <span class="w-1 h-1 rounded-full bg-current" />
            {props.agent.status?.ready ? "Ready" : props.agent.status?.phase || "Pending"}
          </span>

          {/* Replicas */}
          <Show when={props.agent.status?.readyReplicas !== undefined}>
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-surface-2 border border-border rounded text-text-muted">
              <FiBox class="w-2.5 h-2.5" />
              {props.agent.status.readyReplicas}
            </span>
          </Show>

          {/* Created */}
          <Popover
            trigger={
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-surface-2 border border-border rounded text-text-muted cursor-default">
                <FiClock class="w-2.5 h-2.5" />
                {formatTimestamp(props.agent.metadata.creationTimestamp)}
              </span>
            }
          >
            <div>
              <p class="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Created</p>
              <p class="text-xs text-text font-mono">{props.agent.metadata.creationTimestamp}</p>
            </div>
          </Popover>
        </div>

        {/* ===== Collapsible Sections ===== */}

        {/* Tools Section */}
        <Show when={enabledTools().length > 0}>
          <CollapsibleSection
            title="Tools"
            icon={FiTool}
            badge={`${enabledTools().length}`}
            defaultOpen={false}
          >
            <div class="flex flex-wrap gap-1 mt-1">
              <For each={enabledTools()}>
                {(tool) => {
                  const ToolIcon = toolIconMap[tool] || FiTool;
                  return (
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-surface-2 border border-border rounded text-text-secondary font-mono">
                      <ToolIcon class="w-2.5 h-2.5 text-text-muted" />
                      {tool}
                    </span>
                  );
                }}
              </For>
            </div>
          </CollapsibleSection>
        </Show>

        {/* Capabilities Section */}
        <Show when={agentCapabilities().length > 0}>
          <CollapsibleSection
            title="Capabilities"
            icon={FiBookOpen}
            badge={`${agentCapabilities().length}`}
            defaultOpen={false}
          >
            <div class="space-y-1 mt-1">
              <For each={agentCapabilities()}>
                {({ ref, capability }) => (
                  <div class="flex items-center gap-2 px-2 py-1.5 bg-surface-2 rounded-md border border-border">
                    <FiShield class="w-3 h-3 text-text-muted shrink-0" />
                    <div class="min-w-0 flex-1">
                      <p class="text-xs text-text truncate">{ref.alias || ref.name}</p>
                      <Show when={capability}>
                        <p class="text-[10px] text-text-muted truncate">{capability!.spec.description}</p>
                      </Show>
                    </div>
                    <Show when={capability?.spec.type}>
                      <span class="text-[10px] px-1 py-0.5 bg-surface border border-border rounded text-text-muted shrink-0">
                        {capability!.spec.type}
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </CollapsibleSection>
        </Show>

        {/* System Prompt Section */}
        <Show when={props.agent.spec.identity?.systemPrompt}>
          <CollapsibleSection
            title="System Prompt"
            icon={FiFileText}
            defaultOpen={false}
          >
            <div class="mt-1 bg-surface-2 rounded-md border border-border">
              <div class="px-2.5 py-2 text-[11px] font-mono text-text-secondary whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
                {props.agent.spec.identity?.systemPrompt}
              </div>
            </div>
          </CollapsibleSection>
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
