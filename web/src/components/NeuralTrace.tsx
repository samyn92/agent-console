import type { Component } from "solid-js";

/**
 * NeuralTrace — A luminous scanning beam that sweeps back and forth,
 * inspired by the OpenCode CLI's bouncing progress bar.
 *
 * The beam has a tight hotspot with a trailing comet-tail glow,
 * eased with cubic-bezier for natural acceleration at each end.
 *
 * Props:
 *   size    — "sm" (2px) or "md" (3px, default)
 *   color   — "accent" | "success" | "warning" | "error"
 *   inline  — compact variant for tight spaces (narrower beam, faster)
 *   class   — additional classes for the container
 */

type NeuralTraceColor = "accent" | "success" | "warning" | "error";
type NeuralTraceSize = "sm" | "md";

interface NeuralTraceProps {
  size?: NeuralTraceSize;
  color?: NeuralTraceColor;
  inline?: boolean;
  class?: string;
}

const NeuralTrace: Component<NeuralTraceProps> = (props) => {
  const size = () => props.size ?? "md";
  const color = () => props.color ?? "accent";

  return (
    <div
      class={`neural-trace neural-trace--${size()} neural-trace--${color()} neural-trace-enter ${
        props.inline ? "neural-trace--inline" : ""
      } ${props.class ?? ""}`}
      role="progressbar"
      aria-label="Agent is processing"
    >
      <div class="neural-trace__rail" />
      <div class="neural-trace__glow" />
      <div class="neural-trace__beam" />
    </div>
  );
};

export default NeuralTrace;
