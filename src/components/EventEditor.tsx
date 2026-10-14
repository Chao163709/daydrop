import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { addDays, format, startOfDay } from 'date-fns';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { CalendarEvent, RepeatRule } from '../types';
import { dayKey, eventColors, readEventDate } from '../lib/calendar';
import { useEventStore } from '../store/useEventStore';

const localTime = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");
export default function EventEditor({ event, day, onClose }: { event?: CalendarEvent; day: Date; onClose: () => void }) {
  const formRef = useRef<HTMLFormElement>(null), reducedMotion = useReducedMotion();
  const initialStart = event ? readEventDate(event.startAt, event.allDay) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9);
  const initialEnd = event ? readEventDate(event.endAt, event.allDay) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10);
  const [title, setTitle] = useState(event?.title ?? ''), [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [start, setStart] = useState(event?.allDay ? dayKey(initialStart) : localTime(initialStart));
  const [end, setEnd] = useState(event?.allDay ? dayKey(addDays(initialEnd, -1)) : localTime(initialEnd));
  const [color, setColor] = useState(event?.color ?? eventColors[0].color), [location, setLocation] = useState(event?.location ?? '');
  const [note, setNote] = useState(event?.note ?? ''), [repeat, setRepeat] = useState<RepeatRule>(event?.repeat ?? 'none');
  const [reminder, setReminder] = useState(event?.remindAt ? localTime(new Date(event.remindAt)) : ''), [localError, setLocalError] = useState('');
  const { busy, error, add, update, clearError } = useEventStore();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    clearError(); formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { previous?.focus(); };
  }, [clearError]);
  const toggleAllDay = (value: boolean) => {
    setLocalError('');
    if (value) {
      setStart(start.slice(0, 10));
      const endDate = new Date(end), startDate = new Date(start);
      setEnd(end && endDate > startDate && +endDate === +startOfDay(endDate) ? dayKey(addDays(endDate, -1)) : end.slice(0, 10));
    } else {
      setStart(start ? `${start}T09:00` : ''); setEnd(end ? `${end}T10:00` : '');
    }
    setAllDay(value);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault(); setLocalError('');
    try {
      const fields = new FormData(e.currentTarget as HTMLFormElement);
      const startValue = String(fields.get('startAt') ?? ''), endValue = String(fields.get('endAt') ?? '');
      const reminderValue = String(fields.get('remindAt') ?? '');
      const draft = {
        title, allDay, color, location, note, repeat,
        startAt: allDay ? dayKey(readEventDate(startValue, true)) : new Date(startValue).toISOString(),
        endAt: allDay ? dayKey(addDays(readEventDate(endValue, true), 1)) : new Date(endValue).toISOString(),
        remindAt: reminderValue ? new Date(reminderValue).toISOString() : null,
      };
      if (await (event ? update(event.id, draft) : add(draft))) onClose();
    } catch { setLocalError('请输入有效的开始、结束和提醒时间。'); }
  };
  return <>
    <motion.div className="editor-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .15 }}/>
    <motion.form className="task-editor" ref={formRef} role="dialog" aria-modal="true" aria-label={event ? '编辑日历事件' : '添加日历事件'}
      initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .18 }} onSubmit={save}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); }
        if (e.key === 'Tab') {
          const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'));
          const first = controls[0], last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="editor-header"><h2>{event ? '编辑事件' : '添加事件'}</h2><button type="button" className="icon-button" aria-label="取消编辑事件" disabled={busy} onClick={onClose}><X size={16}/></button></header>
      <fieldset className="editor-body" disabled={busy}>
        {event && event.repeat !== 'none' && <p className="field-hint">修改会应用到整个重复系列。</p>}
        <label>事件标题<input required maxLength={160} placeholder="会议、出行或其他安排" value={title} onChange={(e) => setTitle(e.target.value)}/></label>
        <label className="inline-check"><input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)}/>全天事件</label>
        <label>{allDay ? '开始日期' : '开始时间'}<input required name="startAt" type={allDay ? 'date' : 'datetime-local'} value={start} onInput={(e) => setStart(e.currentTarget.value)}/></label>
        <label>{allDay ? '结束日期（含当天）' : '结束时间'}<input required name="endAt" type={allDay ? 'date' : 'datetime-local'} min={start || undefined} value={end} onInput={(e) => setEnd(e.currentTarget.value)}/></label>
        <div className="color-options" aria-label="事件颜色">{eventColors.map((item) => <button type="button" key={item.color} aria-label={`颜色：${item.name}`} aria-pressed={color === item.color} style={{ '--event-color': item.color } as CSSProperties} onClick={() => setColor(item.color)}><i/>{item.name}</button>)}<input type="color" aria-label="自定义事件颜色" value={color} onChange={(e) => setColor(e.target.value)}/></div>
        <div className="editor-grid"><label>重复事件<select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatRule)}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><label>事件提醒时间<input name="remindAt" type="datetime-local" value={reminder} onInput={(e) => setReminder(e.currentTarget.value)}/></label></div>
        <p className="field-hint">桌面版会按提醒时间发送系统通知，可在设置中暂停。</p>
        <label>地点<input maxLength={250} placeholder="可选" value={location} onChange={(e) => setLocation(e.target.value)}/></label>
        <label>事件备注<textarea rows={3} maxLength={5000} placeholder="补充说明…" value={note} onChange={(e) => setNote(e.target.value)}/></label>
      </fieldset>
      {(localError || error) && <div className="editor-error" role="alert">{localError || error}</div>}
      <footer className="editor-footer"><button type="button" className="text-button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={busy || !title.trim()}>{busy ? '保存中…' : '保存事件'}</button></footer>
    </motion.form>
  </>;
}
