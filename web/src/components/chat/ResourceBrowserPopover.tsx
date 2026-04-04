import { createSignal, Show, For, type Component, onCleanup } from "solid-js";
import { FiX } from "solid-icons/fi";
import type { AgentResponse, CapabilityResponse, RepoResponse } from "../../lib/api";
import type { SelectedContext } from "../../types/context";
import { getContextId, getContextLabel } from "./ContextBar";
import {
  accentMap,
  capabilityMeta,
  InlineK8sBrowser,
  InlineHelmBrowser,
  InlineGitHubBrowser,
  InlineGitLabBrowser,
} from "../sources/CapabilityBrowser";
import type { CapabilityType, CapabilityInfo } from "../sources/CapabilityBrowser";

// =============================================================================
// PROPS
// =============================================================================

interface ResourceBrowserPopoverProps {
  agent?: AgentResponse;
  capabilities?: CapabilityResponse[];
  repos?: RepoResponse[];
  selectedContexts: SelectedContext[];
  onToggleContext: (ctx: SelectedContext) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

const ResourceBrowserPopover: Component<ResourceBrowserPopoverProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [activeType, setActiveType] = createSignal<CapabilityType | null>(null);
  let popoverRef: HTMLDivElement | undefined;

  // Close on outside click
  const handleClickOutside = (e: MouseEvent) => {
    if (popoverRef && !popoverRef.contains(e.target as Node)) {
      close();
    }
  };

  const open = () => {
    setIsOpen(true);
    document.addEventListener("mousedown", handleClickOutside);
  };

  const close = () => {
    setIsOpen(false);
    document.removeEventListener("mousedown", handleClickOutside);
  };

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  // Detect capabilities from agent refs
  const detectedCapabilities = (): CapabilityInfo[] => {
    const refs = props.agent?.spec?.capabilityRefs || [];
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

  const selectedCount = () => props.selectedContexts.length;

  const contextsByType = (type: CapabilityType) => {
    return props.selectedContexts.filter(c => {
      if (type === "kubernetes") return c.type === "k8s-resource";
      if (type === "helm") return c.type === "helm-release";
      if (type === "github") return c.type === "github-path";
      if (type === "gitlab") return c.type === "gitlab-path";
      return false;
    });
  };

  const hasCapabilities = () => detectedCapabilities().length > 0;

  return (
    <Show when={hasCapabilities()}>
      <div class="relative" ref={popoverRef}>
        {/* Trigger: capability-type pills */}
        <div class="flex items-center gap-1">
          <For each={detectedCapabilities()}>
            {(info) => {
              const accent = () => accentMap[info.type];
              const meta = () => capabilityMeta[info.type];
              const Icon = meta().icon;
              const count = () => contextsByType(info.type).length;
              const isActive = () => isOpen() && activeType() === info.type;

              return (
                <button
                  onClick={() => {
                    if (isActive()) {
                      close();
                    } else {
                      setActiveType(info.type);
                      if (!isOpen()) open();
                    }
                  }}
                  class={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                    isActive()
                      ? `${accent().borderActive} bg-gradient-to-br ${accent().bg} shadow-sm`
                      : `${accent().border} hover:${accent().bg} bg-transparent`
                  }`}
                  title={`Browse ${meta().label} resources`}
                >
                  <Icon class={`w-3 h-3 ${accent().iconColor}`} />
                  <span class={isActive() ? "text-text" : "text-text-muted"}>{meta().label}</span>
                  <Show when={count() > 0}>
                    <span class={`text-[9px] font-bold px-1 py-0.5 rounded-full leading-none ${accent().badge}`}>
                      {count()}
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>

        {/* Popover panel - floating above the composer */}
        <Show when={isOpen()}>
          <div class="absolute bottom-full left-0 mb-2 w-[380px] max-h-[60vh] bg-surface border border-border/60 rounded-xl shadow-xl overflow-hidden z-50 flex flex-col animate-popover-in">
            {/* Minimal header with active type label + close */}
            <div class="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-surface/80 backdrop-blur-sm">
              <Show when={activeType()}>
                {(_type) => {
                  const meta = () => capabilityMeta[activeType()!];
                  const accent = () => accentMap[activeType()!];
                  const Icon = meta().icon;
                  return (
                    <span class="inline-flex items-center gap-1.5 text-[12px] font-medium">
                      <Icon class={`w-3.5 h-3.5 ${accent().iconColor}`} />
                      <span class="text-text">{meta().label}</span>
                    </span>
                  );
                }}
              </Show>
              <button
                onClick={close}
                class="p-1 text-text-muted/50 hover:text-text-muted rounded transition-colors cursor-pointer"
              >
                <FiX class="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Browser content */}
            <div class="flex-1 overflow-y-auto min-h-0" style="max-height: calc(60vh - 44px)">
              <For each={detectedCapabilities()}>
                {(info) => (
                  <Show when={activeType() === info.type}>
                    <Show when={info.type === "kubernetes"}>
                      <InlineK8sBrowser
                        onToggleSelect={props.onToggleContext}
                        selectedContexts={props.selectedContexts}
                      />
                    </Show>
                    <Show when={info.type === "helm"}>
                      <InlineHelmBrowser
                        onToggleSelect={props.onToggleContext}
                        selectedContexts={props.selectedContexts}
                      />
                    </Show>
                    <Show when={info.type === "github"}>
                      <InlineGitHubBrowser
                        repos={(props.repos || []).filter(r => r.provider === "github")}
                        onToggleSelect={props.onToggleContext}
                        selectedContexts={props.selectedContexts}
                      />
                    </Show>
                    <Show when={info.type === "gitlab"}>
                      <InlineGitLabBrowser
                        repos={(props.repos || []).filter(r => r.provider === "gitlab")}
                        onToggleSelect={props.onToggleContext}
                        selectedContexts={props.selectedContexts}
                      />
                    </Show>
                  </Show>
                )}
              </For>
            </div>

            {/* Selected items footer */}
            <Show when={selectedCount() > 0}>
              <div class="border-t border-border/40 px-2.5 py-1.5 bg-surface/60 backdrop-blur-sm">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[10px] text-text-muted/60 font-medium shrink-0">{selectedCount()} selected</span>
                  <For each={props.selectedContexts}>
                    {(ctx) => {
                      const typeColor = () => {
                        if (ctx.type === "k8s-resource") return "bg-blue-500/10 border-blue-500/20 text-blue-400";
                        if (ctx.type === "helm-release") return "bg-cyan-500/10 border-cyan-500/20 text-cyan-400";
                        if (ctx.type === "github-path") return "bg-gray-500/10 border-gray-500/20 text-gray-300";
                        if (ctx.type === "gitlab-path") return "bg-orange-500/10 border-orange-500/20 text-orange-400";
                        return "";
                      };
                      return (
                        <span class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${typeColor()}`}>
                          <span class="truncate max-w-[120px]">{getContextLabel(ctx)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); props.onToggleContext(ctx); }}
                            class="hover:text-error transition-colors cursor-pointer"
                          >
                            <FiX class="w-2.5 h-2.5" />
                          </button>
                        </span>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default ResourceBrowserPopover;
