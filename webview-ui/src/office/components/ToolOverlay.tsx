import { Fragment, useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/Button.js';
import {
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  CHARACTER_NAMES,
  CONTEXT_CRITICAL_THRESHOLD,
  CONTEXT_DANGER_THRESHOLD,
  CONTEXT_GAUGE_BG,
  CONTEXT_GAUGE_COLOR_CRITICAL,
  CONTEXT_GAUGE_COLOR_DANGER,
  CONTEXT_GAUGE_COLOR_OK,
  CONTEXT_GAUGE_COLOR_WARN,
  CONTEXT_GAUGE_HEIGHT_PX,
  CONTEXT_GAUGE_WIDTH_PX,
  CONTEXT_WARN_THRESHOLD,
  GAME_TITLE_FONT_PX,
  GAME_TITLE_ICON_PX,
  GAME_TITLE_LIFT_PX,
  OVERLAY_BUBBLE_Z_INDEX,
  OVERLAY_LABEL_SELECTED_Z_INDEX,
  OVERLAY_LABEL_Z_INDEX,
  PATRON_HEART_LIFT_PX,
  PATRON_NAME_TAG_LIFT_PX,
  SPEECH_BG_COLOR,
  SPEECH_FONT_PX,
  SPEECH_HEART_CLEARANCE_PX,
  SPEECH_LIFT_PX,
  SPEECH_MAX_WIDTH_PX,
  SPEECH_TEXT_COLOR,
  TEAM_LEAD_COLOR,
  TEAM_ROLE_COLOR,
  TOOL_OVERLAY_VERTICAL_OFFSET,
  USER_AVATAR_NAME,
  WAITER_NAME,
} from '../../constants.js';
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js';
import { characterDrawOffsetPx } from '../engine/characters.js';
import type { OfficeState } from '../engine/officeState.js';
import { overlayProjection } from '../projection.js';
import lolIconUrl from '../sprites/lol-icon.png';
import { getCachedSprite } from '../sprites/spriteCache.js';
import {
  BUBBLE_HEART_SPRITE,
  BUBBLE_PERMISSION_SPRITE,
  BUBBLE_WAITING_SPRITE,
} from '../sprites/spriteData.js';
import type { ToolActivity } from '../types.js';
import { CharacterState } from '../types.js';

// Both turn-end states show the green checkmark bubble. A finished turn (Stop)
// shows ONLY the checkmark (the label falls through to its normal idle text);
// going idle waiting on the user (Notification(idle_prompt)) additionally
// surfaces this label. Driven by Character.waitingAwaitingInput.
const WAITING_INPUT_ACTIVITY_TEXT = 'Waiting for input';
/** Fallback name for a top-level Claude character whose palette has no
 *  CHARACTER_NAMES entry (sub-agents keep their subtask label). */
const CHARACTER_NAME = 'TNhunn';

interface ToolOverlayProps {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onCloseAgent: (id: number) => void;
  /** Open a cmd shell in the agent's working directory (standalone with a
   *  working terminal only; absent hides the button). */
  onOpenShell?: (id: number) => void;
  alwaysShowOverlay: boolean;
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
  bubbleType: 'permission' | 'waiting' | null,
  waitingAwaitingInput: boolean,
): string {
  if (bubbleType === 'permission') return 'Needs approval';
  // Only the idle case ("Waiting for input") gets a dedicated label. A finished
  // turn (Stop, waitingAwaitingInput=false) falls through so the checkmark alone
  // signals "done", same as the original behavior.
  if (bubbleType === 'waiting' && waitingAwaitingInput) return WAITING_INPUT_ACTIVITY_TEXT;

  const tools = agentTools[agentId];
  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval';
      return activeTool.status;
    }
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (isActive) {
      const lastTool = tools[tools.length - 1];
      if (lastTool) return lastTool.status;
    }
  }

  return 'Idle';
}

function getFuelColor(ratio: number): string {
  if (ratio >= CONTEXT_CRITICAL_THRESHOLD) return CONTEXT_GAUGE_COLOR_CRITICAL;
  if (ratio >= CONTEXT_DANGER_THRESHOLD) return CONTEXT_GAUGE_COLOR_DANGER;
  if (ratio >= CONTEXT_WARN_THRESHOLD) return CONTEXT_GAUGE_COLOR_WARN;
  return CONTEXT_GAUGE_COLOR_OK;
}

/** A speech-bubble sprite blitted into a DOM canvas. Bubbles live in the DOM
 *  (not the office canvas) so they can stack ABOVE the status label panels —
 *  canvas content can never out-paint the DOM overlay. */
function OverlayBubble({ cached, dpr }: { cached: HTMLCanvasElement; dpr: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = cached.width;
    canvas.height = cached.height;
    canvas.getContext('2d')?.drawImage(cached, 0, 0);
  }, [cached]);
  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: cached.width / dpr, height: cached.height / dpr }}
    />
  );
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  subagentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
  onOpenShell,
  alwaysShowOverlay,
}: ToolOverlayProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  // dpr is also needed to size the bubble canvases in CSS px (OverlayBubble).
  const dpr = window.devicePixelRatio || 1;
  const project = overlayProjection(
    officeState.getLayout(),
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    dpr,
  );

  const selectedId = officeState.selectedAgentId;
  const hoveredId = officeState.hoveredAgentId;

  // All character IDs
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)];

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;

        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        const isSub = ch.isSubagent;

        // Speech bubble (permission dots / done checkmark) — rendered here in
        // the DOM, above the label panels (OVERLAY_BUBBLE_Z_INDEX over the label panels), for every
        // character regardless of label visibility. Mirrors the geometry the
        // canvas renderer used. The idle "Waiting for input" state speaks
        // through its label, not a bubble.
        let bubbleNode = null;
        if (ch.bubbleType && !(ch.bubbleType === 'waiting' && ch.waitingAwaitingInput)) {
          const cachedBubble = getCachedSprite(
            ch.bubbleType === 'permission' ? BUBBLE_PERMISSION_SPRITE : BUBBLE_WAITING_SPRITE,
            zoom,
          );
          const bubbleSittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0;
          const alpha =
            ch.bubbleType === 'waiting' && ch.bubbleTimer < BUBBLE_FADE_DURATION_SEC
              ? ch.bubbleTimer / BUBBLE_FADE_DURATION_SEC
              : 1;
          bubbleNode = (
            <div
              className="absolute -translate-x-1/2 pointer-events-none"
              style={{
                left: project.toScreenX(ch.x),
                // Bubble bottom sits one sprite pixel above the character's
                // anchor: project the anchor, then lift by the bubble's own
                // device-pixel height plus one zoomed pixel, in CSS px.
                top:
                  project.toScreenY(ch.y + bubbleSittingOff - BUBBLE_VERTICAL_OFFSET_PX) -
                  (cachedBubble.height + zoom) / dpr,
                opacity: alpha,
                zIndex: OVERLAY_BUBBLE_Z_INDEX,
              }}
            >
              <OverlayBubble cached={cachedBubble} dpr={dpr} />
            </div>
          );
        }

        // Only show the label for hovered or selected agents (unless
        // always-show is on) — the bubble renders regardless.
        if (!alwaysShowOverlay && !isSelected && !isHovered) {
          return bubbleNode && <Fragment key={id}>{bubbleNode}</Fragment>;
        }

        // Position above character
        const sittingOffset = characterDrawOffsetPx(ch);
        const screenX = project.toScreenX(ch.x);
        const screenY = project.toScreenY(ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET);

        // A "Done" agent (finished turn: waiting bubble without awaitingInput)
        // shows ONLY its floating green checkmark bubble, never the label panel
        // (the panel would cover the bubble). Render an empty positioned marker
        // so overlay counts stay stable and hover/select can still bring the
        // panel back. When always-show is off, the early return above already
        // keeps the panel hidden for idle agents.
        const isDone = ch.bubbleType === 'waiting' && !ch.waitingAwaitingInput;
        if (isDone && !isSelected && !isHovered) {
          return (
            <Fragment key={id}>
              {bubbleNode}
              <div
                className="absolute"
                style={{ left: screenX, top: screenY, pointerEvents: 'none' }}
                data-testid="agent-overlay"
                data-agent-id={id}
              />
            </Fragment>
          );
        }

        // Get activity text
        const hasWaitingBubble = ch.bubbleType === 'waiting';
        const subHasPermission = isSub && ch.bubbleType === 'permission';
        let activityText: string;
        if (hasWaitingBubble && ch.waitingAwaitingInput) {
          // Idle, waiting on the user -> dedicated label. A finished turn (Stop)
          // shows only the checkmark and falls through to the normal idle text.
          activityText = WAITING_INPUT_ACTIVITY_TEXT;
        } else if (isSub) {
          if (subHasPermission) {
            activityText = 'Needs approval';
          } else {
            // Hover shows the subtask title; SELECTING the sub reveals its live
            // tool activity (watched sub-agents stream it via subagentToolStart).
            const sub = subagentCharacters.find((s) => s.id === id);
            const rows = sub ? subagentTools[sub.parentAgentId]?.[sub.parentToolId] : undefined;
            const activeRow =
              isSelected && rows ? [...rows].reverse().find((t) => !t.done) : undefined;
            activityText = activeRow?.status ?? (sub?.label || 'Subtask');
          }
        } else {
          activityText = getActivityText(
            id,
            agentTools,
            ch.isActive,
            ch.bubbleType,
            ch.waitingAwaitingInput ?? false,
          );
        }

        // Determine dot color
        const tools = agentTools[id];
        const hasPermission = subHasPermission || tools?.some((t) => t.permissionWait && !t.done);
        const hasActiveTools = tools?.some((t) => !t.done);
        const isActive = ch.isActive;
        const hasWaiting = ch.bubbleType === 'waiting';

        let dotColor: string | null = null;
        if (hasPermission || hasWaiting) {
          dotColor = 'var(--color-status-permission)';
        } else if (isActive && hasActiveTools) {
          dotColor = 'var(--color-status-active)';
        }

        // Team info
        const teamRoleLabel = ch.isTeamLead
          ? 'LEAD'
          : ch.agentName || (isSub ? null : (CHARACTER_NAMES[ch.palette] ?? CHARACTER_NAME));
        const hasExtraLines = !!(ch.directoryName || teamRoleLabel);

        // Context gauge. Every agent gets one — lead, teammate, adopted,
        // headless — as soon as it has taken a turn. Sub-agents never do: they
        // have no session of their own, so contextTokens stays 0.
        const contextRatio = ch.contextTokens / ch.maxContextTokens;
        const showContextGauge = !isSub && ch.contextTokens > 0;

        return (
          <Fragment key={id}>
            {bubbleNode}
            <div
              className="absolute flex flex-col items-center -translate-x-1/2"
              style={{
                left: screenX,
                top: screenY - (hasExtraLines ? 34 : 28),
                pointerEvents: isSelected ? 'auto' : 'none',
                opacity: alwaysShowOverlay && !isSelected && !isHovered ? (isSub ? 0.5 : 0.75) : 1,
                zIndex: isSelected ? OVERLAY_LABEL_SELECTED_Z_INDEX : OVERLAY_LABEL_Z_INDEX,
              }}
              data-testid="agent-overlay"
              data-agent-id={id}
            >
              <div className="flex items-center border-border px-8 pt-2 pb-4 gap-5 pixel-panel whitespace-nowrap max-w-2xs">
                {dotColor && (
                  <span
                    className={`w-6 h-6 rounded-full shrink-0 ${isActive && !hasPermission && !hasWaiting ? 'pixel-pulse' : ''}`}
                    style={{ background: dotColor }}
                  />
                )}
                <div className="flex flex-col gap-0 overflow-hidden">
                  {teamRoleLabel && (
                    <span
                      className="overflow-hidden text-ellipsis block leading-none"
                      style={{
                        fontSize: '18px',
                        color: ch.isTeamLead ? TEAM_LEAD_COLOR : TEAM_ROLE_COLOR,
                        fontWeight: ch.isTeamLead ? 'bold' : undefined,
                      }}
                    >
                      {teamRoleLabel}
                    </span>
                  )}
                  <span
                    className="overflow-hidden text-ellipsis block leading-none"
                    style={{
                      fontSize: isSub ? '20px' : '22px',
                      fontStyle: isSub ? 'italic' : undefined,
                    }}
                  >
                    {activityText}
                  </span>
                  {ch.directoryName && (
                    <span className="text-2xs leading-none overflow-hidden text-ellipsis block">
                      {ch.directoryName}
                    </span>
                  )}
                </div>
                {isSelected && !isSub && onOpenShell && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenShell(id);
                    }}
                    title="Open cmd in this agent's folder"
                    className="ml-2 shrink-0 leading-none"
                  >
                    {'›_'}
                  </Button>
                )}
                {isSelected && !isSub && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseAgent(id);
                    }}
                    title="Close agent"
                    className="ml-2 shrink-0 leading-none"
                  >
                    ×
                  </Button>
                )}
              </div>
              {showContextGauge && (
                <div
                  style={{
                    width: CONTEXT_GAUGE_WIDTH_PX,
                    height: CONTEXT_GAUGE_HEIGHT_PX,
                    background: CONTEXT_GAUGE_BG,
                    marginTop: 2,
                  }}
                  title={`${Math.round(contextRatio * 100)}% context used (${(ch.contextTokens / 1000).toFixed(0)}k of ${(ch.maxContextTokens / 1000).toFixed(0)}k tokens)`}
                  data-testid="context-gauge"
                  data-context-pct={Math.round(contextRatio * 100)}
                >
                  <div
                    style={{
                      width: `${Math.min(contextRatio * 100, 100)}%`,
                      height: '100%',
                      background: getFuelColor(contextRatio),
                    }}
                  />
                </div>
              )}
            </div>
          </Fragment>
        );
      })}
      {officeState.getVisiblePatrons().map((p) => {
        const name = CHARACTER_NAMES[p.palette];
        if (!name) return null;
        const left = project.toScreenX(p.x);
        const top =
          project.toScreenY(p.y + characterDrawOffsetPx(p) - TOOL_OVERLAY_VERTICAL_OFFSET) +
          PATRON_NAME_TAG_LIFT_PX;
        const heart = (p.heartTimer ?? 0) > 0 ? getCachedSprite(BUBBLE_HEART_SPRITE, zoom) : null;
        const gameTitle = officeState.gameTitle(p);
        const titleTop = gameTitle ? top - GAME_TITLE_LIFT_PX : top;
        const speech = p.speech ?? null;
        // Speech sits over the name tag (and title); the heart goes above it all
        const speechTop = titleTop - SPEECH_LIFT_PX;
        const heartBase = speech ? speechTop - SPEECH_HEART_CLEARANCE_PX : titleTop;
        return (
          <Fragment key={`patron-${p.id}`}>
            <span
              className="absolute -translate-x-1/2 -translate-y-full pointer-events-none whitespace-nowrap text-2xs leading-none pixel-panel px-2"
              style={{ left, top, zIndex: OVERLAY_LABEL_Z_INDEX, opacity: 0.85 }}
            >
              {name === USER_AVATAR_NAME
                ? `👑 ${name}`
                : name === WAITER_NAME
                  ? `🍺 ${name}`
                  : name}
            </span>
            {gameTitle && (
              // Playing at a gaming PC: match status over the name tag
              <span
                className="absolute -translate-x-1/2 -translate-y-full pointer-events-none whitespace-nowrap leading-none pixel-panel px-1 flex items-center gap-2"
                style={{
                  left,
                  top: titleTop,
                  fontSize: GAME_TITLE_FONT_PX,
                  zIndex: OVERLAY_LABEL_Z_INDEX,
                }}
              >
                <img
                  src={lolIconUrl}
                  alt=""
                  className="shrink-0"
                  style={{ width: GAME_TITLE_ICON_PX, height: GAME_TITLE_ICON_PX }}
                />
                {gameTitle}
              </span>
            )}
            {speech && (
              // Sofa chat: what this patron is saying right now
              <span
                className="absolute -translate-x-1/2 -translate-y-full pointer-events-none leading-tight text-center px-3 py-1"
                style={{
                  left,
                  top: speechTop,
                  width: 'max-content',
                  maxWidth: SPEECH_MAX_WIDTH_PX,
                  fontSize: SPEECH_FONT_PX,
                  color: SPEECH_TEXT_COLOR,
                  background: SPEECH_BG_COLOR,
                  border: `2px solid ${SPEECH_TEXT_COLOR}`,
                  borderRadius: 6,
                  zIndex: OVERLAY_BUBBLE_Z_INDEX,
                }}
              >
                {speech}
              </span>
            )}
            {heart && (
              // Storyline couple close together: a heart floats over the name tag
              <div
                className="absolute -translate-x-1/2 pointer-events-none"
                style={{
                  left,
                  top: heartBase - PATRON_HEART_LIFT_PX - heart.height / dpr,
                  zIndex: OVERLAY_BUBBLE_Z_INDEX,
                  opacity: Math.min(1, (p.heartTimer ?? 0) / BUBBLE_FADE_DURATION_SEC),
                }}
              >
                <OverlayBubble cached={heart} dpr={dpr} />
              </div>
            )}
          </Fragment>
        );
      })}
      {[...officeState.characters.values()].map((ch) => {
        if (!ch.speech) return null;
        // Agents chat too: the line floats where a patron's would, over the head
        const top =
          project.toScreenY(ch.y + characterDrawOffsetPx(ch) - TOOL_OVERLAY_VERTICAL_OFFSET) +
          PATRON_NAME_TAG_LIFT_PX -
          SPEECH_LIFT_PX;
        return (
          <span
            key={`speech-${ch.id}`}
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none leading-tight text-center px-3 py-1"
            style={{
              left: project.toScreenX(ch.x),
              top,
              width: 'max-content',
              maxWidth: SPEECH_MAX_WIDTH_PX,
              fontSize: SPEECH_FONT_PX,
              color: SPEECH_TEXT_COLOR,
              background: SPEECH_BG_COLOR,
              border: `2px solid ${SPEECH_TEXT_COLOR}`,
              borderRadius: 6,
              zIndex: OVERLAY_BUBBLE_Z_INDEX,
            }}
          >
            {ch.speech}
          </span>
        );
      })}
    </>
  );
}
