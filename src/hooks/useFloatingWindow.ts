import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { fitPosition, type Point } from '../lib/geometry';
import { useWidgetStore } from '../store/useWidgetStore';
import { useSettingsStore } from '../store/useSettingsStore';
export const PANEL_SIZE = { width: 420, height: 560 }, DOT_SIZE = { width: 64, height: 64 };
const native = isTauri();
let nativeQueue: Promise<unknown> = Promise.resolve();
function enqueue(action: () => Promise<void>, onError: (message: string) => void) { nativeQueue = nativeQueue.then(action).catch((error: unknown) => onError(String(error))); }
export function useFloatingWindow(interactionLocked = false) {
  const { expanded, mode, hoverDelay, collapseDelay, alwaysOnTop, expand, collapse } = useWidgetStore();
  const [position, setPosition] = useState<Point>(() => ({ x: Math.max(8, window.innerWidth - 442), y: 80 }));
  const [windowError, setWindowError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), moveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousSize = useRef(PANEL_SIZE), dragging = useRef(false), draggedAt = useRef(0), programmaticUntil = useRef(0), nativeInitialized = useRef(false);
  const dragOrigin = useRef<{ pointer: Point; window: Point } | null>(null);
  const locked = useRef(interactionLocked), hovered = useRef(false), previousLock = useRef(interactionLocked);
  locked.current = interactionLocked;
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const preferredWidth = useSettingsStore((state) => state.settings.width);
  const panelWidth = native ? preferredWidth : Math.min(preferredWidth, Math.max(240, viewport.width - 16));
  const panelHeight = native ? PANEL_SIZE.height : Math.min(PANEL_SIZE.height, Math.max(300, viewport.height - 64));
  const size = expanded ? { width: panelWidth, height: panelHeight } : DOT_SIZE;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const previewBounds = () => ({ x: 8, y: 8, width: window.innerWidth - 16, height: window.innerHeight - 56 });
  const clearTimer = useCallback(() => { clearTimeout(timer.current); }, []);
  const onEnter = () => { hovered.current = true; clearTimer(); if (!dragging.current && Date.now() - draggedAt.current > 500 && mode === 'hover') timer.current = setTimeout(expand, hoverDelay); };
  const onLeave = () => { hovered.current = false; clearTimer(); if (!dragging.current && !locked.current && mode !== 'pinned') timer.current = setTimeout(() => { if (!locked.current) collapse(); }, collapseDelay); };
  useEffect(() => {
    if (interactionLocked) clearTimer();
    else if (previousLock.current && !hovered.current && mode !== 'pinned') timer.current = setTimeout(() => { if (!locked.current) collapse(); }, collapseDelay);
    previousLock.current = interactionLocked;
  }, [interactionLocked, mode, collapseDelay, collapse, clearTimer]);
  const snapNative = useCallback(async () => {
    const win = getCurrentWindow(), monitor = await currentMonitor() ?? await primaryMonitor();
    if (!monitor) return;
    const [pos, dimensions] = await Promise.all([win.outerPosition(), win.outerSize()]);
    const fitted = fitPosition(pos, dimensions, { ...monitor.workArea.position, ...monitor.workArea.size }, true, 24 * monitor.scaleFactor);
    if (fitted.x !== pos.x || fitted.y !== pos.y) { programmaticUntil.current = Date.now() + 500; await win.setPosition(new PhysicalPosition(fitted.x, fitted.y)); }
  }, []);
  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];
    const register = (unlisten: () => void) => { if (active) unlisteners.push(unlisten); else unlisten(); };
    const loseFocus = () => { clearTimer(); if (!locked.current) collapse(); };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !locked.current) { clearTimer(); collapse(true); } };
    window.addEventListener('keydown', keydown);
    if (native) {
      const win = getCurrentWindow();
      win.onFocusChanged(({ payload }) => { if (!payload) loseFocus(); }).then(register).catch((e: unknown) => { if (active) setWindowError(String(e)); });
      win.onMoved(() => {
        if (!active || Date.now() < programmaticUntil.current) return;
        draggedAt.current = Date.now();
        clearTimeout(moveTimer.current); moveTimer.current = setTimeout(() => enqueue(snapNative, setWindowError), 250);
      }).then(register).catch((e: unknown) => { if (active) setWindowError(String(e)); });
    } else window.addEventListener('blur', loseFocus);
    return () => { active = false; clearTimer(); clearTimeout(moveTimer.current); unlisteners.forEach((fn) => fn()); window.removeEventListener('keydown', keydown); window.removeEventListener('blur', loseFocus); };
  }, [clearTimer, collapse, snapNative]);
  useEffect(() => {
    if (native) {
      let cancelled = false;
      const resize = () => enqueue(async () => {
        if (cancelled) return;
        const win = getCurrentWindow();
        const [pos, oldSize, monitor] = await Promise.all([win.outerPosition(), win.outerSize(), currentMonitor()]);
        programmaticUntil.current = Date.now() + 750;
        const scale = monitor?.scaleFactor ?? await win.scaleFactor();
        const target = !nativeInitialized.current && monitor
          ? { x: monitor.workArea.position.x + monitor.workArea.size.width - size.width * scale - 12 * scale, y: monitor.workArea.position.y + 80 * scale }
          : { x: pos.x + oldSize.width - size.width * scale, y: pos.y };
        const fitted = monitor ? fitPosition(target, { width: size.width * scale, height: size.height * scale }, { ...monitor.workArea.position, ...monitor.workArea.size }) : target;
        await win.setSize(new LogicalSize(size.width, size.height));
        await win.setPosition(new PhysicalPosition(Math.round(fitted.x), Math.round(fitted.y)));
        nativeInitialized.current = true;
      }, setWindowError);
      const delay = setTimeout(resize, expanded ? 0 : 180);
      return () => { cancelled = true; clearTimeout(delay); };
    }
    // Read the old width before React flushes the updater (including StrictMode).
    const oldWidth = previousSize.current.width;
    setPosition((pos) => fitPosition({ x: pos.x + oldWidth - size.width, y: pos.y }, size, previewBounds()));
    previousSize.current = size;
  }, [expanded, panelWidth, panelHeight]);
  useEffect(() => { if (native) enqueue(() => getCurrentWindow().setAlwaysOnTop(alwaysOnTop), setWindowError); }, [alwaysOnTop]);
  useEffect(() => {
    if (native) return;
    const resize = () => { setViewport({ width: window.innerWidth, height: window.innerHeight }); setPosition((pos) => fitPosition(pos, sizeRef.current, previewBounds())); };
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    clearTimer(); dragOrigin.current = { pointer: { x: event.clientX, y: event.clientY }, window: position };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = dragOrigin.current; if (!origin) return;
    const dx = event.clientX - origin.pointer.x, dy = event.clientY - origin.pointer.y;
    if (!dragging.current && Math.hypot(dx, dy) < 5) return;
    dragging.current = true;
    if (native) {
      dragOrigin.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      getCurrentWindow().startDragging().then(() => enqueue(snapNative, setWindowError)).catch((e: unknown) => setWindowError(String(e))).finally(() => { dragging.current = false; draggedAt.current = Date.now(); });
    } else setPosition(fitPosition({ x: origin.window.x + dx, y: origin.window.y + dy }, size, previewBounds()));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragging.current) { draggedAt.current = Date.now(); if (!native) setPosition((pos) => fitPosition(pos, size, previewBounds(), true)); }
    dragOrigin.current = null; dragging.current = false;
  };
  const dragProps = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
  const openDot = () => { if (Date.now() - draggedAt.current > 500) { clearTimer(); expand(); } };
  return { native, expanded, position, size, windowError, onEnter, onLeave, dragProps, openDot, clearTimer };
}
