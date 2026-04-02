import { createSignal, For, Show, type Component, onCleanup, createEffect } from "solid-js";
import { FiChevronDown, FiCheck, FiCpu, FiSearch } from "solid-icons/fi";
import type { AgentResponse } from "../../lib/api";

interface AgentSelectorProps {
  agents: AgentResponse[];
  selectedAgent: AgentResponse | null;
  onSelect: (agent: AgentResponse) => void;
  loading?: boolean;
}

const AgentSelector: Component<AgentSelectorProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  let dropdownRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  // Close dropdown when clicking outside
  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setIsOpen(false);
    }
  };

  createEffect(() => {
    if (isOpen()) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchInputRef?.focus(), 50);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
      setSearchQuery("");
    }
  });

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
        agent.metadata.namespace.toLowerCase().includes(query)
    );
  };

  const getAgentDisplayName = (agent: AgentResponse) => {
    return agent.spec.identity?.name || agent.metadata.name;
  };

  const getAgentModel = (agent: AgentResponse) => {
    const parts = agent.spec.model.split("/");
    return parts[parts.length - 1];
  };

  return (
    <div class="relative w-full" ref={dropdownRef}>
      {/* Trigger — compact, clean, native feel */}
      <button
        onClick={() => setIsOpen(!isOpen())}
        disabled={props.loading}
        class={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
          isOpen()
            ? "bg-surface-2"
            : "hover:bg-surface-hover"
        }`}
      >
        <Show
          when={props.selectedAgent}
          fallback={
            <div class="flex items-center gap-2.5 text-text-muted">
              <div class="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center">
                <FiCpu class="w-3.5 h-3.5" />
              </div>
              <span class="text-sm font-semibold">Select Agent</span>
            </div>
          }
        >
          {(agent) => (
            <>
              <div class="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center shrink-0 border border-border">
                <FiCpu class="w-3.5 h-3.5 text-text-secondary" />
              </div>
              <div class="text-left flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-semibold text-text truncate">
                    {getAgentDisplayName(agent())}
                  </span>
                  <Show when={agent().status?.ready}>
                    <span class="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                  </Show>
                </div>
                <p class="text-xs text-text-muted truncate leading-tight">
                  {getAgentModel(agent())}
                </p>
              </div>
              <FiChevronDown
                class={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 shrink-0 ${
                  isOpen() ? "rotate-180" : ""
                }`}
              />
            </>
          )}
        </Show>
      </button>

      {/* Dropdown */}
      <Show when={isOpen()}>
        <div class="absolute z-[100] top-full right-0 left-0 mt-1.5 bg-surface border border-border rounded-lg shadow-lg overflow-hidden fade-in"
        >
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

          {/* Agent List */}
          <div class="max-h-56 overflow-y-auto p-1">
            <Show
              when={filteredAgents().length > 0}
              fallback={
                <p class="text-sm text-text-muted text-center py-5">
                  No agents found
                </p>
              }
            >
              <For each={filteredAgents()}>
                {(agent) => {
                  const isSelected = () =>
                    props.selectedAgent?.metadata.name === agent.metadata.name &&
                    props.selectedAgent?.metadata.namespace === agent.metadata.namespace;

                  return (
                    <button
                      onClick={() => {
                        props.onSelect(agent);
                        setIsOpen(false);
                      }}
                      class={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${
                        isSelected()
                          ? "bg-accent/10 text-text"
                          : "hover:bg-surface-hover text-text"
                      }`}
                    >
                      <div
                        class={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                          isSelected()
                            ? "bg-accent/10 border-accent/30"
                            : "bg-surface-2 border-border"
                        }`}
                      >
                        <FiCpu class={`w-3.5 h-3.5 ${isSelected() ? "text-accent" : "text-text-secondary"}`} />
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-sm font-normal text-text truncate">
                            {getAgentDisplayName(agent)}
                          </span>
                          <Show when={agent.status?.ready}>
                            <span class="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                          </Show>
                        </div>
                        <div class="flex items-center gap-1.5 text-xs text-text-muted leading-tight">
                          <span class="truncate">{agent.metadata.namespace}</span>
                          <span class="text-border-hover">·</span>
                          <span class="truncate">{getAgentModel(agent)}</span>
                        </div>
                      </div>
                      <Show when={isSelected()}>
                        <FiCheck class="w-3.5 h-3.5 text-accent shrink-0" />
                      </Show>
                    </button>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default AgentSelector;
