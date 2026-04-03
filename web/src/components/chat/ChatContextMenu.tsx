import type { Component } from "solid-js";
import { onCleanup } from "solid-js";
import { FiTrash2, FiMapPin } from "solid-icons/fi";

interface ChatContextMenuProps {
  x: number;
  y: number;
  sessionId: string;
  isPinned: boolean;
  onDelete: (sessionId: string) => void;
  onTogglePin: (sessionId: string) => void;
  onClose: () => void;
}

const ChatContextMenu: Component<ChatContextMenuProps> = (props) => {
  // Close on outside click or escape
  const handleClickOutside = () => props.onClose();
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };

  // Delay adding listeners to avoid immediately closing
  setTimeout(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  }, 0);

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  // Adjust position to stay within viewport
  const adjustedStyle = () => {
    const menuWidth = 180;
    const menuHeight = 120;
    let x = props.x;
    let y = props.y;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 8;
    }

    return {
      left: `${x}px`,
      top: `${y}px`,
    };
  };

  return (
    <div
      class="fixed z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
      style={adjustedStyle()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          props.onTogglePin(props.sessionId);
          props.onClose();
        }}
        class="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <FiMapPin class={`w-3.5 h-3.5 ${props.isPinned ? "text-accent" : ""}`} />
        <span>{props.isPinned ? "Unpin from top" : "Pin to top"}</span>
      </button>
      <div class="border-t border-border my-1" />
      <button
        onClick={() => {
          props.onDelete(props.sessionId);
          props.onClose();
        }}
        class="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-error/80 hover:text-error hover:bg-error/5 transition-colors cursor-pointer"
      >
        <FiTrash2 class="w-3.5 h-3.5" />
        <span>Delete conversation</span>
      </button>
    </div>
  );
};

export default ChatContextMenu;
