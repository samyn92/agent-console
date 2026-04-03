/**
 * Mobile Store
 *
 * Reactive mobile/responsive state management. Provides:
 * - Viewport size detection (isMobile breakpoint at 768px)
 * - Mobile sidebar drawer open/close state
 * - Virtual keyboard detection for chat input
 * - Safe area insets for notched devices
 * - Edge swipe gesture to open drawer
 */

import { createRoot, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Breakpoint below which the app switches to mobile layout */
const MOBILE_BREAKPOINT = 768;

/** Width of the left-edge swipe zone in pixels */
const SWIPE_EDGE_WIDTH = 24;

/** Minimum horizontal distance to trigger a swipe (px) */
const SWIPE_THRESHOLD = 60;

/** Maximum vertical deviation before cancelling swipe (px) */
const SWIPE_MAX_VERTICAL = 50;

// =============================================================================
// TYPES
// =============================================================================

interface MobileState {
  /** Whether the viewport is at mobile width */
  isMobile: boolean;
  /** Whether the sidebar drawer is open (mobile only) */
  drawerOpen: boolean;
  /** Whether the virtual keyboard is likely visible */
  keyboardVisible: boolean;
  /** Viewport height (tracks resize for keyboard detection) */
  viewportHeight: number;
  /** Initial viewport height (set once on load, before keyboard opens) */
  initialViewportHeight: number;
}

// =============================================================================
// STORE
// =============================================================================

function createMobileStore() {
  const initialHeight = typeof window !== "undefined" ? window.innerHeight : 800;

  const [state, setState] = createStore<MobileState>({
    isMobile: typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false,
    drawerOpen: false,
    keyboardVisible: false,
    viewportHeight: initialHeight,
    initialViewportHeight: initialHeight,
  });

  // --- Viewport resize listener ---
  const handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const wasMobile = state.isMobile;
    const nowMobile = width < MOBILE_BREAKPOINT;

    setState("isMobile", nowMobile);
    setState("viewportHeight", height);

    // If transitioning from mobile to desktop, close drawer
    if (wasMobile && !nowMobile) {
      setState("drawerOpen", false);
    }

    // Virtual keyboard detection: if viewport shrinks by >25% of initial height,
    // the keyboard is likely open. This is a heuristic — Android Chrome resizes
    // the viewport when the keyboard opens, iOS Safari uses visualViewport.
    if (nowMobile) {
      const shrinkage = state.initialViewportHeight - height;
      const isKeyboard = shrinkage > state.initialViewportHeight * 0.25;
      setState("keyboardVisible", isKeyboard);
    } else {
      setState("keyboardVisible", false);
    }
  };

  // --- Visual Viewport API (more reliable on iOS) ---
  const handleVisualViewportResize = () => {
    if (!window.visualViewport) return;
    const height = window.visualViewport.height;
    setState("viewportHeight", height);

    if (state.isMobile) {
      const shrinkage = state.initialViewportHeight - height;
      setState("keyboardVisible", shrinkage > state.initialViewportHeight * 0.25);
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleResize);

    // Use visualViewport API where available (iOS Safari, modern Chrome)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleVisualViewportResize);
    }
  }

  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
      }
    }
  });

  // --- Actions ---

  const openDrawer = () => {
    if (state.isMobile) {
      setState("drawerOpen", true);
      // Push state for back button support
      if (typeof window !== "undefined") {
        window.history.pushState({ drawer: true }, "");
      }
    }
  };

  const closeDrawer = () => {
    setState("drawerOpen", false);
  };

  const toggleDrawer = () => {
    if (state.drawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  };

  // --- Back button handler for drawer ---
  const handlePopState = (e: PopStateEvent) => {
    if (state.drawerOpen) {
      e.preventDefault();
      closeDrawer();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("popstate", handlePopState);
  }

  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("popstate", handlePopState);
    }
  });

  // --- Edge swipe gesture to open drawer ---
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;

  const handleTouchStart = (e: TouchEvent) => {
    if (!state.isMobile || state.drawerOpen) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    // Only start tracking if touch began near the left edge
    if (touch.clientX <= SWIPE_EDGE_WIDTH) {
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isSwiping = true;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isSwiping || !state.isMobile) return;
    if (e.touches.length !== 1) {
      isSwiping = false;
      return;
    }

    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = Math.abs(touch.clientY - touchStartY);

    // If vertical movement exceeds threshold, cancel — it's a scroll
    if (dy > SWIPE_MAX_VERTICAL) {
      isSwiping = false;
      return;
    }

    // If horizontal swipe exceeds threshold, open the drawer
    if (dx > SWIPE_THRESHOLD) {
      isSwiping = false;
      openDrawer();
    }
  };

  const handleTouchEnd = () => {
    isSwiping = false;
  };

  if (typeof window !== "undefined") {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
  }

  onCleanup(() => {
    if (typeof window !== "undefined") {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    }
  });

  return {
    state,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
}

export const mobileStore = createRoot(createMobileStore);
