import type { Component } from "solid-js";
import { createMemo, createSignal, createEffect, onCleanup } from "solid-js";
import { Marked } from "marked";
import hljs from "highlight.js/lib/core";

// Register only the languages we need to keep bundle small
import yaml from "highlight.js/lib/languages/yaml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import go from "highlight.js/lib/languages/go";
import python from "highlight.js/lib/languages/python";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import ini from "highlight.js/lib/languages/ini";
import diff from "highlight.js/lib/languages/diff";
import plaintext from "highlight.js/lib/languages/plaintext";

hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("go", go);
hljs.registerLanguage("golang", go);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("docker", dockerfile);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("toml", ini);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("text", plaintext);

// Configure marked with highlight.js
const marked = new Marked({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : undefined;
      let highlighted: string;
      try {
        highlighted = language
          ? hljs.highlight(text, { language }).value
          : hljs.highlightAuto(text).value;
      } catch {
        highlighted = escapeHtml(text);
      }
      const langLabel = language || lang || "";
      return `<div class="md-code-block"><div class="md-code-header"><span class="md-code-lang">${escapeHtml(langLabel)}</span></div><pre><code class="hljs">${highlighted}</code></pre></div>`;
    },
  },
  gfm: true,
  breaks: false,
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface MarkdownProps {
  content: string;
  class?: string;
}

const Markdown: Component<MarkdownProps> = (props) => {
  const html = createMemo(() => {
    try {
      return marked.parse(props.content, { async: false }) as string;
    } catch {
      return `<p>${escapeHtml(props.content)}</p>`;
    }
  });

  return (
    <div
      class={`md-prose ${props.class || ""}`}
      innerHTML={html()}
    />
  );
};

// =============================================================================
// STREAMING MARKDOWN — throttled re-parsing for live rendering during streaming
// =============================================================================

// A separate marked instance for streaming that skips syntax highlighting
// (hljs.highlightAuto is expensive, and code is still being typed out)
const markedStreaming = new Marked({
  renderer: {
    code({ text, lang }) {
      const langLabel = lang || "";
      return `<div class="md-code-block"><div class="md-code-header"><span class="md-code-lang">${escapeHtml(langLabel)}</span></div><pre><code class="hljs">${escapeHtml(text)}</code></pre></div>`;
    },
  },
  gfm: true,
  breaks: false,
});

/**
 * Patch incomplete markdown so it doesn't break the parser.
 * Handles unclosed code fences, which are the most common mid-stream issue.
 */
function patchIncompleteMarkdown(text: string): string {
  // Count code fences — if odd, close it
  const fenceMatches = text.match(/^```/gm);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    text += "\n```";
  }
  return text;
}

interface StreamingMarkdownProps {
  content: string;
  class?: string;
  /** Throttle interval in ms (default 120) */
  throttleMs?: number;
}

/**
 * Markdown renderer optimized for streaming text.
 * - Throttles re-parsing to avoid O(n) markdown parsing on every keyframe
 * - Uses a lightweight marked instance (no syntax highlighting) for speed
 * - Patches incomplete markdown (unclosed code fences) mid-stream
 * - Appends a CSS streaming cursor after the rendered HTML
 */
const StreamingMarkdown: Component<StreamingMarkdownProps> = (props) => {
  const interval = () => props.throttleMs ?? 120;
  const [throttledContent, setThrottledContent] = createSignal(props.content);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastUpdate = 0;

  createEffect(() => {
    const content = props.content;
    const now = Date.now();
    const elapsed = now - lastUpdate;

    if (elapsed >= interval()) {
      // Enough time passed — update immediately
      setThrottledContent(content);
      lastUpdate = now;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    } else if (!timer) {
      // Schedule a trailing update
      timer = setTimeout(() => {
        timer = null;
        setThrottledContent(props.content);
        lastUpdate = Date.now();
      }, interval() - elapsed);
    }
  });

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  const html = createMemo(() => {
    const raw = throttledContent();
    if (!raw.trim()) return "";
    try {
      const patched = patchIncompleteMarkdown(raw);
      const rendered = markedStreaming.parse(patched, { async: false }) as string;
      // Append streaming cursor inside the last block-level element
      return rendered.replace(/<\/(p|li|h[1-6]|pre|blockquote|div)>(?![\s\S]*<\/(p|li|h[1-6]|pre|blockquote|div)>)/, '<span class="streaming-cursor"></span></$1>');
    } catch {
      return `<p>${escapeHtml(raw)}<span class="streaming-cursor"></span></p>`;
    }
  });

  return (
    <div
      class={`md-prose ${props.class || ""}`}
      innerHTML={html()}
    />
  );
};

export { StreamingMarkdown };
export default Markdown;
