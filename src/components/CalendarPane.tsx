import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { addDays, addMonths, addWeeks, endOfDay, format, isSameDay, isSameMonth, parseISO, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarPlus, ChevronLeft, ChevronRight, GripVertical, ListPlus, MapPin, Repeat2, Trash2 } from 'lucide-react';
import type { CalendarEvent, Task } from '../types';
import { calendarDays, dayKey, occurrencesInRange, occurrencesOnDay, tasksOnDay, type CalendarView, type EventOccurrence } from '../lib/calendar';
import { useTaskStore } from '../store/useTaskStore';
import { useEventStore } from '../store/useEventStore';
import TaskEditor from './TaskEditor';
import EventEditor from './EventEditor';

function eventTime(item: EventOccurrence, day: Date) {
  if (item.event.allDay) return '全天';
  const startsHere = isSameDay(item.start, day), endsHere = isSameDay(item.end, day);
  return `${startsHere ? format(item.start, 'HH:mm') : '延续'}–${endsHere ? format(item.end, 'HH:mm') : '次日'}`;
}
export default function CalendarPane({ now, onInteractionChange }: { now: Date; onInteractionChange: (locked: boolean) => void }) {
  const { tasks, loaded: tasksLoaded, busy: taskBusy, error: taskError, load: loadTasks, toggle, reschedule, clearError: clearTaskError } = useTaskStore();
  const { events, loaded, busy, error, load, remove, reschedule: moveEvent, clearError } = useEventStore();
  const [view, setView] = useState<CalendarView>('month'), [selected, setSelected] = useState(() => startOfDay(now));
  const [eventEditor, setEventEditor] = useState<CalendarEvent | 'new' | null>(null), [taskEditor, setTaskEditor] = useState<Task | 'new' | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null), [dragged, setDragged] = useState<string | null>(null), [dropDay, setDropDay] = useState('');
  const [notice, setNotice] = useState('');
  const pointerDrag = useRef<{ id: string; kind: 'task' | 'event'; x: number; y: number; active: boolean } | null>(null);
  const [rescheduling, setRescheduling] = useState<{ id: string; kind: 'task' | 'event'; title: string } | null>(null);
  const [targetDate, setTargetDate] = useState('');
  useEffect(() => { void load(); void loadTasks(); }, [load, loadTasks]);
  useEffect(() => { setDeleting(null); }, [selected, view]);
  useEffect(() => { onInteractionChange(!!eventEditor || !!taskEditor || !!deleting || !!dragged || !!rescheduling || busy || taskBusy); }, [eventEditor, taskEditor, deleting, dragged, rescheduling, busy, taskBusy, onInteractionChange]);
  useEffect(() => () => onInteractionChange(false), [onInteractionChange]);
  const days = useMemo(() => calendarDays(selected, view), [selected, view]);
  const occurrences = useMemo(() => events.flatMap((event) => occurrencesInRange(event, days[0], addDays(days[days.length - 1], 1))), [events, days]);
  const unscheduled = tasks.filter((task) => !task.archived && !task.completed && !task.dueAt).sort((a, b) => a.order - b.order);
  const ready = loaded && tasksLoaded, saving = busy || taskBusy;
  const navigate = (direction: number) => setSelected(view === 'month' ? addMonths(selected, direction) : view === 'week' ? addWeeks(selected, direction) : addDays(selected, direction));
  const finishPointerDrag = async (e: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = pointerDrag.current;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-calendar-day]')?.dataset.calendarDay;
    pointerDrag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragged(null); setDropDay('');
    if (!cancelled && drag?.active && target && !saving) {
      const day = parseISO(target);
      if (await (drag.kind === 'event' ? moveEvent : reschedule)(drag.id, day)) { setSelected(day); setNotice(`已改期到 ${format(day, 'M月d日')}`); }
    } else if (!cancelled && drag?.active) {
      setNotice('尚未改期：请松开在月历日期格或周视图的日期上。');
    }
  };
  const openReschedule = (id: string, kind: 'task' | 'event', title: string) => { setRescheduling({ id, kind, title }); setTargetDate(dayKey(selected)); };
  const dragHandle = (id: string, kind: 'task' | 'event', title: string) => <button className="reorder-handle" aria-label={`拖动改期：${title}`} title="拖到日期上改期" disabled={saving}
    onPointerDown={(e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      pointerDrag.current = { id, kind, x: e.clientX, y: e.clientY, active: false };
      setDragged(id);
    }}
    onPointerMove={(e) => {
      const drag = pointerDrag.current;
      if (!drag) return;
      if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      drag.active = true; setNotice('');
      setDropDay(document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-calendar-day]')?.dataset.calendarDay ?? '');
    }}
    onPointerUp={(e) => void finishPointerDrag(e)} onPointerCancel={(e) => void finishPointerDrag(e, true)}
    onLostPointerCapture={() => { pointerDrag.current = null; setDragged(null); setDropDay(''); }}><GripVertical size={13}/></button>;
  const taskRow = (task: Task) => <div className={`calendar-task ${task.completed ? 'completed' : ''} ${dragged === task.id ? 'dragging' : ''}`} key={task.id}>
    <input type="checkbox" aria-label={`完成任务：${task.title}`} checked={task.completed} disabled={saving} onChange={() => void toggle(task.id)}/>
    <button className="task-title" disabled={saving} onClick={() => setTaskEditor(task)}>{task.title}</button>
    {task.dueAt && <time>{format(new Date(task.dueAt), 'HH:mm')}</time>}
    <button className="text-button" disabled={saving} aria-label={`选择改期日期：${task.title}`} onClick={() => openReschedule(task.id, 'task', task.title)}>改期</button>
    {view !== 'day' && dragHandle(task.id, 'task', task.title)}
  </div>;
  const agenda = (day: Date, showHeading: boolean) => {
    const dayTasks = tasksOnDay(tasks, day), dayEvents = occurrencesOnDay(occurrences, day);
    return <section key={dayKey(day)} data-calendar-day={dayKey(day)} className={`calendar-agenda ${dropDay === dayKey(day) ? 'drop-target' : ''}`} aria-label={`${format(day, 'M月d日')}的安排`}>
      {showHeading && <div className="agenda-heading"><h2>{format(day, 'M月d日 · EEE', { locale: zhCN })}{isSameDay(day, now) && <span>今天</span>}</h2><button className="text-button" onClick={() => { setSelected(day); setEventEditor('new'); }} disabled={!ready || saving}>添加事件</button></div>}
      {dayEvents.map((item) => <div className="calendar-event" key={item.key} style={{ '--event-color': item.event.color } as CSSProperties}>
        <div className="event-time">{eventTime(item, day)}</div>
        <button className="event-detail" disabled={saving} aria-label={`编辑事件：${item.event.title}`} onClick={() => setEventEditor(item.event)}><strong>{item.event.title}</strong>{(item.event.location || item.event.repeat !== 'none') && <small>{item.event.repeat !== 'none' && <Repeat2 size={10}/>} {item.event.location && <><MapPin size={10}/>{item.event.location}</>}</small>}</button>
        <button className="text-button" disabled={saving} aria-label={`选择改期日期：${item.event.title}`} onClick={() => item.event.repeat === 'none' ? openReschedule(item.event.id, 'event', item.event.title) : setEventEditor(item.event)}>{item.event.repeat === 'none' ? '改期' : '编辑系列'}</button>
        {view !== 'day' && item.event.repeat === 'none' && dragHandle(item.event.id, 'event', item.event.title)}
        <button className="icon-button event-delete" aria-label={`删除事件：${item.event.title}`} disabled={saving} onClick={() => setDeleting(item.event.id)}><Trash2 size={12}/></button>
        {deleting === item.event.id && <div className="delete-confirm"><span>{item.event.repeat === 'none' ? '删除这项事件？' : '删除整个重复系列？'}</span><button className="text-button" disabled={saving} onClick={() => setDeleting(null)}>取消</button><button className="danger-button" disabled={saving} onClick={async () => { if (await remove(item.event.id)) setDeleting(null); }}>确认删除事件</button></div>}
      </div>)}
      {dayTasks.map(taskRow)}
      {!dayTasks.length && !dayEvents.length && <p className="agenda-empty">当天没有安排。</p>}
    </section>;
  };
  return <div className="calendar-pane" onKeyDown={(e) => { if (e.key === 'Escape' && deleting && !saving) { e.stopPropagation(); setDeleting(null); } }}>
    <div className="calendar-heading"><h1>{format(selected, view === 'day' ? 'M月d日 · EEE' : 'yyyy年 M月', { locale: zhCN })}</h1><button className="text-button" onClick={() => setSelected(startOfDay(now))}>今天</button><button className="icon-button" aria-label="上一段日历" onClick={() => navigate(-1)}><ChevronLeft size={16}/></button><button className="icon-button" aria-label="下一段日历" onClick={() => navigate(1)}><ChevronRight size={16}/></button></div>
    <div className="calendar-view-switch" aria-label="日历视图">{([{ id: 'month', label: '月' }, { id: 'week', label: '周' }, { id: 'day', label: '日' }] as const).map((item) => <button key={item.id} aria-pressed={view === item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}<span><i className="task-mark"/>任务<i className="event-mark"/>事件</span></div>
    {view !== 'day' && <>
      <div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((name) => <span key={name}>{name}</span>)}</div>
      <div className={`calendar-grid ${view === 'week' ? 'week-strip' : ''}`} aria-label={view === 'month' ? '月历' : '本周日期'}>{days.map((day) => {
        const dayTasks = tasksOnDay(tasks, day), dayEvents = occurrencesOnDay(occurrences, day);
        const selectedDay = isSameDay(day, selected);
        return <div data-calendar-day={dayKey(day)} className={`calendar-cell ${!isSameMonth(day, selected) && view === 'month' ? 'outside-month' : ''} ${selectedDay ? 'selected' : ''} ${dropDay === dayKey(day) ? 'drop-target' : ''}`} key={dayKey(day)}>
          <button type="button" aria-label={`${format(day, 'yyyy年M月d日')}，${dayTasks.length}条任务，${dayEvents.length}项事件`} aria-pressed={selectedDay} onClick={() => setSelected(day)}>
            <span className={`calendar-date ${isSameDay(day, now) ? 'is-today' : ''}`}>{format(day, 'd')}{dayTasks.length > 0 && <small>{dayTasks.length}</small>}</span>
            {dayEvents.length > 0 ? <span className="calendar-cell-event" style={{ color: dayEvents[0].event.color }}><i style={{ background: dayEvents[0].event.color }}/>{dayEvents[0].event.title}</span> : <span className="calendar-cell-space"/>}
            {dayEvents.length > 1 && <span className="calendar-more">+{dayEvents.length - 1}</span>}
          </button>
        </div>;
      })}</div>
    </>}
    <div className="selected-date-heading"><h2>{view === 'week' ? `${format(days[0], 'M月d日')}–${format(days[6], 'M月d日')}` : format(selected, 'M月d日 · EEE', { locale: zhCN })}</h2><button className="icon-button" aria-label="为所选日期添加任务" title="添加任务" disabled={!ready || saving} onClick={() => setTaskEditor('new')}><ListPlus size={16}/></button><button className="icon-button" aria-label="添加日历事件" title="添加事件" disabled={!ready || saving} onClick={() => setEventEditor('new')}><CalendarPlus size={16}/></button></div>
    {(error || taskError) && <div className="task-error" role="alert"><p>{error || taskError}</p><button className="text-button" onClick={() => { clearError(); clearTaskError(); if (!loaded) void load(); if (!tasksLoaded) void loadTasks(); }}>重试 / 关闭提示</button></div>}
    {!ready && !error && !taskError ? <p className="list-message">正在加载日历…</p> : view === 'week' ? days.map((day) => agenda(day, true)) : agenda(selected, false)}
    {unscheduled.length > 0 && <details className="unscheduled-tasks" open><summary>未安排日期的任务 <span>{unscheduled.length}</span></summary>{unscheduled.map(taskRow)}</details>}
    <p className="calendar-help" role="status">{notice || (view === 'day' ? '点击「改期」选择新日期。重复事件请编辑系列。' : '任务和非重复事件：拖动右侧把手到日期格，或点击「改期」。')}</p>
    {rescheduling && <form className="calendar-reschedule" aria-label="选择改期日期" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!saving) setRescheduling(null); } }} onSubmit={async (e) => {
      e.preventDefault();
      if (!targetDate || saving) return;
      const day = parseISO(String(new FormData(e.currentTarget).get('targetDate') ?? ''));
      if (await (rescheduling.kind === 'event' ? moveEvent : reschedule)(rescheduling.id, day)) {
        setSelected(day); setNotice(`已改期到 ${format(day, 'M月d日')}`); setRescheduling(null);
      }
    }}><strong>{rescheduling.title}</strong><label>新日期<input autoFocus required type="date" name="targetDate" aria-label="改期目标日期" value={targetDate} disabled={saving} onInput={(e) => setTargetDate(e.currentTarget.value)}/></label><span>{rescheduling.kind === 'event' ? '保留事件时长和提醒提前量；全天事件保留天数。' : '保留截止时刻；已有截止日期的任务会同步调整提醒。'}</span><div><button type="button" className="text-button" disabled={saving} onClick={() => setRescheduling(null)}>取消</button><button type="submit" className="primary-button" disabled={saving || !targetDate}>确认改期</button></div></form>}
    {eventEditor && <EventEditor event={eventEditor === 'new' ? undefined : eventEditor} day={selected} onClose={() => setEventEditor(null)}/>}
    {taskEditor && <TaskEditor task={taskEditor === 'new' ? undefined : taskEditor} initialDueAt={endOfDay(selected).toISOString()} onClose={() => setTaskEditor(null)}/>}
  </div>;
}
