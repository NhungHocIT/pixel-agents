import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentActivity, AgentAppearance, TabStatus } from '../components/AgentCard.js';
import {
  TERMINAL_DRAWER_DEFAULT_HEIGHT_RATIO,
  TERMINAL_DRAWER_MAX_HEIGHT_RATIO,
  TERMINAL_DRAWER_MIN_HEIGHT_PX,
  TERMINAL_OFFICE_MIN_HEIGHT_PX,
} from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';

/** A character not (yet) in the office — the mug shot falls back to palette 0. */
const DEFAULT_APPEARANCE: AgentAppearance = { palette: 0, hueShift: 0 };

interface TerminalDrawerInputs {
  /** Agent ids with a live server-side PTY, in open order (control plane). */
  terminalAgentIds: number[];
  getOfficeState: () => OfficeState;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  agentAwaitingInput: Record<number, boolean>;
  agentSeenActivity: Record<number, boolean>;
}

export interface TerminalDrawerController {
  activeAgentId: number | null;
  /** The pane actually showing: the active agent's, or the first terminal
   *  when the active agent has no PTY (an external session's character was
   *  clicked). null only when there are no terminals. Both shells and the
   *  mobile key bar read this one resolution. */
  shownAgentId: number | null;
  isOpen: boolean;
  heightPx: number;
  /** The newest terminal the drawer saw appear (launch answered, or a reload
   *  re-announcing live sessions) — it became the active tab. `seq` makes
   *  every appearance a distinct value for effects to key on. */
  lastOpened: { agentId: number; seq: number } | null;
  /** Show an agent's terminal if it has one; no-op otherwise. The office's
   *  character click routes here: standalone has no editor panel to raise, so
   *  "focus the agent" means "open its tab", mirroring VS Code's terminalRef.show(). */
  reveal: (agentId: number) => void;
  /** Card click: open the tab AND select + follow the character, so the card
   *  and the office stay in sync. */
  select: (agentId: number) => void;
  close: () => void;
  onResizeStart: (e: ReactMouseEvent) => void;
  getAppearance: (agentId: number) => AgentAppearance;
  /** Card status dot: 'disconnected' (red) for a terminal whose socket
   *  dropped, otherwise the agent's activity; null before its first activity. */
  statusFor: (agentId: number) => TabStatus | null;
  /** Each TerminalPane reports its socket state here. */
  onStatusChange: (agentId: number, status: TerminalConnectionStatus) => void;
}

/**
 * The drawer height that fits a viewport: the office above keeps at least
 * TERMINAL_OFFICE_MIN_HEIGHT_PX (the agents stay visible, and the cards
 * overlaying its right edge are the way to switch agents), so on a short
 * window the minimum gives way to that.
 */
export function clampDrawerHeight(preferredPx: number, viewportPx: number): number {
  const maxPx = Math.min(
    viewportPx * TERMINAL_DRAWER_MAX_HEIGHT_RATIO,
    viewportPx - TERMINAL_OFFICE_MIN_HEIGHT_PX,
  );
  return Math.max(0, Math.min(maxPx, Math.max(TERMINAL_DRAWER_MIN_HEIGHT_PX, preferredPx)));
}

/**
 * All state and derivations behind the standalone terminal panes, on both
 * shells: which tab is active (and which pane that resolves to), whether the
 * desktop panel is open, its height and drag-resize gesture, each pane's socket
 * state, and the per-agent lookups the cards render from. App only composes it.
 */
export function useTerminalDrawer({
  terminalAgentIds,
  getOfficeState,
  agentTools,
  agentStatuses,
  agentAwaitingInput,
  agentSeenActivity,
}: TerminalDrawerInputs): TerminalDrawerController {
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null);
  const [lastOpened, setLastOpened] = useState<{ agentId: number; seq: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  // The height the user asked for; what renders is that clamped to the
  // viewport, re-derived on every window resize so a window that shrinks
  // while the drawer is open never pushes the office (and its agents) out.
  // Null until the user drags: the panel then keeps an even split with the
  // office as the window resizes.
  const [preferredHeightPx, setPreferredHeightPx] = useState<number | null>(null);
  const [viewportPx, setViewportPx] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setViewportPx(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const heightPx = clampDrawerHeight(
    preferredHeightPx ?? viewportPx * TERMINAL_DRAWER_DEFAULT_HEIGHT_RATIO,
    viewportPx,
  );
  const [connStatuses, setConnStatuses] = useState<Record<number, TerminalConnectionStatus>>({});

  const shownAgentId =
    activeAgentId !== null && terminalAgentIds.includes(activeAgentId)
      ? activeAgentId
      : (terminalAgentIds[0] ?? null);

  // Reveal a newly-opened terminal. Launching is async — the toolbar sends
  // launchAgent and the server answers with terminalSessionOpened once the PTY
  // is up — so "open the drawer on launch" is expressed as "open it when a
  // terminal we hadn't seen appears". This also restores the drawer after a
  // reload, when webviewReady re-announces the live sessions.
  const knownIdsRef = useRef<number[]>([]);
  useEffect(() => {
    const added = terminalAgentIds.filter((id) => !knownIdsRef.current.includes(id));
    knownIdsRef.current = terminalAgentIds;
    if (added.length === 0) return;
    const newest = added[added.length - 1];
    setActiveAgentId(newest);
    setIsOpen(true);
    setLastOpened((prev) => ({ agentId: newest, seq: (prev?.seq ?? 0) + 1 }));
  }, [terminalAgentIds]);

  const reveal = useCallback(
    (agentId: number) => {
      if (!terminalAgentIds.includes(agentId)) return;
      setActiveAgentId(agentId);
      setIsOpen(true);
    },
    [terminalAgentIds],
  );

  const select = useCallback(
    (agentId: number) => {
      setActiveAgentId(agentId);
      setIsOpen(true);
      getOfficeState().selectAndFollow(agentId);
    },
    [getOfficeState],
  );

  const close = useCallback(() => setIsOpen(false), []);

  // Drag the panel's top edge to resize. The office region is flex-1 above it,
  // so it reflows to fill whatever height is left — the canvas ResizeObserver
  // repaints and re-centres the camera on the smaller region automatically.
  const onResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = heightPx;
      const onMove = (ev: MouseEvent) => {
        // Dragging up (smaller clientY) grows the panel.
        const next = startHeight + (startY - ev.clientY);
        setPreferredHeightPx(clampDrawerHeight(next, window.innerHeight));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
      };
      // Suppress text selection while dragging over the terminal/office.
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [heightPx],
  );

  // A terminal tab shows the agent's character (front-facing mug shot), so it
  // reads the same palette/hueShift the office assigned that character.
  const getAppearance = useCallback(
    (id: number): AgentAppearance => {
      const ch = getOfficeState().characters.get(id);
      return ch ? { palette: ch.palette, hueShift: ch.hueShift } : DEFAULT_APPEARANCE;
    },
    [getOfficeState],
  );

  // Activity for the tab status dot (green idle / blue working / yellow needs
  // attention). null until the agent's first activity, so the dot stays empty.
  const getActivity = useCallback(
    (id: number): AgentActivity | null => {
      if (!agentSeenActivity[id]) return null;
      const tools = agentTools[id];
      if (tools?.some((t) => t.permissionWait && !t.done)) return 'attention';
      if (tools?.some((t) => !t.done)) return 'working';
      if (agentAwaitingInput[id]) return 'attention';
      if (agentStatuses[id] === 'waiting') return 'idle';
      return 'working';
    },
    [agentSeenActivity, agentTools, agentStatuses, agentAwaitingInput],
  );

  const onStatusChange = useCallback((agentId: number, status: TerminalConnectionStatus) => {
    setConnStatuses((prev) => (prev[agentId] === status ? prev : { ...prev, [agentId]: status }));
  }, []);

  // Broken connection (red) wins over activity, for agents that have a pane.
  const statusFor = useCallback(
    (id: number): TabStatus | null => {
      const conn = connStatuses[id];
      if (terminalAgentIds.includes(id) && (conn === 'closed' || conn === 'reconnecting')) {
        return 'disconnected';
      }
      return getActivity(id);
    },
    [connStatuses, terminalAgentIds, getActivity],
  );

  return {
    activeAgentId,
    shownAgentId,
    lastOpened,
    isOpen,
    heightPx,
    reveal,
    select,
    close,
    onResizeStart,
    getAppearance,
    statusFor,
    onStatusChange,
  };
}
