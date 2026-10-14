import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ChevronDown, GripHorizontal, Layers, ListTodo, Monitor, Pin, PinOff, ExternalLink, Settings2 } from 'lucide-react';
import { initializeDatabase, type StorageStatus } from './lib/database';
import { useAppStore } from './store/useAppStore';
import { useWidgetStore } from './store/useWidgetStore';
import { useFloatingWindow } from './hooks/useFloatingWindow';
import TaskPane from './components/TaskPane';
import { useTaskStore } from './store/useTaskStore';
import { todayTasks } from './lib/tasks';
import { useAppearance } from './hooks/useAppearance';
import CalendarPane from './components/CalendarPane';
import { useEventStore } from './store/useEventStore';
import SettingsPane from './components/SettingsPane';
import { useSettingsStore } from './store/useSettingsStore';
import { useDesktopIntegration } from './hooks/useDesktopIntegration';
import { hideToTray } from './lib/desktop';
const tabs = [{ id: 'today', label: '今日', icon: ListTodo }, { id: 'all', label: '全部', icon: Layers }, { id: 'calendar', label: '日历', icon: CalendarDays }, { id: 'settings', label: '设置', icon: Settings2 }] as const;
export default function App() {
  const { tab, setTab } = useAppStore();
  const { mode, collapse } = useWidgetStore();
  const { update: updateSettings, busy: settingsBusy, error: settingsError } = useSettingsStore();
  useAppearance();
  const [interactionLocked, setInteractionLocked] = useState(false);
  const [appearanceLocked, setAppearanceLocked] = useState(false);
  useDesktopIntegration(interactionLocked || settingsBusy || appearanceLocked);
  const widget = useFloatingWindow(interactionLocked || settingsBusy || appearanceLocked);
  const { tasks, load, busy } = useTaskStore();
  const eventBusy = useEventStore((state) => state.busy);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    document.body.classList.toggle('desktop-preview', !widget.native);
    void load();
    let active = true;
    initializeDatabase().then((result) => { if (active) setStorage(result); }).catch((e: unknown) => { if (active) setError(String(e)); });
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [widget.native, load]);
  const pendingToday = todayTasks(tasks, now).filter((task) => !task.completed).length;
  return <>
    {!widget.native && <div className="desktop-backdrop"><div className="preview-heading"><Monitor size={20}/><span>桌面浮窗预览</span><small>拖动圆点或标题栏 · 悬停展开 · Esc 收起</small></div><div className="desktop-caption"><span>留在桌面一角。</span><p>需要时展开，忙碌时收起。</p></div><div className="desktop-taskbar"><span className="taskbar-mark"><span/><span/><span/><span/></span><span>日点</span><time>{format(now, 'HH:mm')}<small>{format(now, 'yyyy/MM/dd')}</small></time></div></div>}
    <motion.div className={`floating-window ${widget.expanded ? 'is-expanded' : 'is-collapsed'}`} style={widget.native ? { right: 0, top: 0 } : { left: widget.position.x, top: widget.position.y }} animate={{ width: widget.size.width, height: widget.size.height }} transition={{ duration: reducedMotion ? 0 : .18, ease: 'easeOut' }} onMouseEnter={widget.onEnter} onMouseLeave={widget.onLeave}>
      <AnimatePresence mode="wait" initial={false}>
      {widget.expanded ? <motion.main key="panel" className="panel" initial={{ opacity: 0, scale: reducedMotion ? 1 : .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reducedMotion ? 1 : .97 }} transition={{ duration: reducedMotion ? 0 : .16 }} aria-label="日点浮窗">
        <header className="titlebar"><div className="drag-handle" {...widget.dragProps}><span className="brand-dot"/><strong>日点</strong><span className="titlebar-date">{format(now, 'M 月 d 日 · EEEE', { locale: zhCN })}</span><GripHorizontal size={14}/></div><div className="window-actions"><button aria-label={mode === 'pinned' ? '取消固定展开' : '固定展开'} title={mode === 'pinned' ? '取消固定展开' : '固定展开'} aria-pressed={mode === 'pinned'} disabled={settingsBusy || interactionLocked} onClick={() => void updateSettings({ expandMode: mode === 'pinned' ? 'hover' : 'pinned' })}>{mode === 'pinned' ? <Pin size={14}/> : <PinOff size={14}/>}</button><button aria-label="收起浮窗" disabled={interactionLocked} title={interactionLocked ? "请先保存或取消编辑" : "收起 · Esc"} onClick={() => { widget.clearTimer(); collapse(true); }}><ChevronDown size={17}/></button>{widget.native && <button aria-label="隐藏到托盘" disabled={interactionLocked} title="隐藏到托盘，提醒继续运行" onClick={() => hideToTray().catch((e: unknown) => setError(String(e)))}><ExternalLink size={13}/></button>}</div></header>
        <nav aria-label="主要导航" className="toolbar">{tabs.map(({ id, label, icon: Icon }) => <button key={id} disabled={interactionLocked} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'tab active' : 'tab'}><Icon size={14}/>{label}</button>)}</nav>
        <section className="panel-content">
        {tab === 'settings' ? <SettingsPane onInteractionChange={setInteractionLocked} onAppearanceInteractionChange={setAppearanceLocked}/>
        : tab === 'calendar' ? <CalendarPane now={now} onInteractionChange={setInteractionLocked}/>
        : <TaskPane tab={tab} now={now} onInteractionChange={setInteractionLocked}/>}
        </section>
        <footer className="statusbar"><span className="storage-status"><i className={error || widget.windowError || settingsError ? 'error' : ''}/>{error || widget.windowError || settingsError ? '运行遇到问题' : busy || eventBusy || settingsBusy ? '正在保存…' : storage?.message ?? '正在准备存储…'}</span><span>{mode === 'pinned' ? '已固定' : mode === 'hover' ? '悬停展开' : '点击展开'}</span></footer>
        {(error || widget.windowError) && <div role="alert" className="error-message">{error || widget.windowError}</div>}
      </motion.main> : <motion.button key="dot" className="desktop-dot" aria-label="展开日点浮窗" title="日点 · 拖动移动，点击展开" {...widget.dragProps} onClick={widget.openDot} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .08 }}><span className="dot-month">{format(now, 'M 月')}</span><strong>{format(now, 'dd')}</strong><span className="dot-indicator"/>{pendingToday > 0 && <span className="dot-count">{pendingToday > 99 ? "99+" : pendingToday}</span>}</motion.button>}
      </AnimatePresence>
    </motion.div>
  </>;
}
