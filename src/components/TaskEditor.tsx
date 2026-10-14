import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { format } from 'date-fns';
import { Plus, X } from 'lucide-react';
import type { Task } from '../types';
import type { TaskDraft } from '../lib/tasks';
import { useTaskStore } from '../store/useTaskStore';
export const emptyDraft: TaskDraft = { title: '', note: '', dueAt: null, remindAt: null, priority: 'medium', tags: [], subtasks: [], repeat: 'none' };
const localTime = (value: string | null) => value ? format(new Date(value), "yyyy-MM-dd'T'HH:mm") : '';
const isoTime = (value: string) => value ? new Date(value).toISOString() : null;
export default function TaskEditor({ task, initialDueAt, onClose }: { task?: Task; initialDueAt?: string; onClose: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState<TaskDraft>(task ? { ...task, subtasks: task.subtasks.map((subtask) => ({ ...subtask })) } : { ...emptyDraft, dueAt: initialDueAt ?? null });
  const [tags, setTags] = useState(draft.tags.join(', '));
  const [subtask, setSubtask] = useState('');
  const { busy, error, add, update, clearError } = useTaskStore();
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    clearError();
    formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { previouslyFocused?.focus(); };
  }, [clearError]);
  const change = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    const value = { ...draft, dueAt: isoTime(String(fields.get('dueAt') ?? '')), remindAt: isoTime(String(fields.get('remindAt') ?? '')), tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) };
    if (await (task ? update(task.id, value) : add(value))) onClose();
  };
  const addSubtask = () => {
    if (!subtask.trim()) return;
    change('subtasks', [...draft.subtasks, { id: crypto.randomUUID(), title: subtask.trim(), completed: false }]); setSubtask('');
  };
  return <><motion.div className="editor-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .15 }}/><motion.form ref={formRef} className="task-editor" initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .18 }} onSubmit={save} role="dialog" aria-modal="true" aria-label={task ? '编辑任务' : '新建任务'} onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="editor-header"><h2>{task ? '编辑任务' : '新建任务'}</h2><button type="button" className="icon-button" aria-label="取消编辑" onClick={onClose} disabled={busy}><X size={16}/></button></header>
    <fieldset className="editor-body" disabled={busy}>
      <label>标题<input autoFocus required maxLength={160} value={draft.title} onChange={(event) => change('title', event.target.value)} placeholder="要做什么？"/></label>
      <div className="editor-grid"><label>截止时间<input name="dueAt" type="datetime-local" value={localTime(draft.dueAt)} onInput={(event) => change('dueAt', isoTime(event.currentTarget.value))}/></label><label>优先级<select value={draft.priority} onChange={(event) => change('priority', event.target.value as Task['priority'])}><option value="low">低</option><option value="medium">普通</option><option value="high">高</option></select></label></div>
      <div className="editor-grid"><label>重复<select value={draft.repeat} onChange={(event) => change('repeat', event.target.value as Task['repeat'])}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><label>提醒时间<input name="remindAt" type="datetime-local" value={localTime(draft.remindAt)} onInput={(event) => change('remindAt', isoTime(event.currentTarget.value))}/></label></div>
      <p className="field-hint">桌面版会按提醒时间发送系统通知，可在设置中暂停。</p>
      <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="工作, 生活, 学习" maxLength={250}/></label>
      <label>备注<textarea value={draft.note} onChange={(event) => change('note', event.target.value)} placeholder="补充说明…" rows={3} maxLength={5000}/></label>
      <div className="subtask-heading">子任务 <span>{draft.subtasks.filter((item) => item.completed).length} / {draft.subtasks.length}</span></div>
      {draft.subtasks.map((item) => <div className="subtask-row" key={item.id}><input type="checkbox" aria-label={`完成子任务：${item.title}`} checked={item.completed} onChange={() => change('subtasks', draft.subtasks.map((row) => row.id === item.id ? { ...row, completed: !row.completed } : row))}/><span>{item.title}</span><button type="button" className="icon-button" aria-label={`移除子任务：${item.title}`} onClick={() => change('subtasks', draft.subtasks.filter((row) => row.id !== item.id))}><X size={12}/></button></div>)}
      <div className="subtask-add"><input aria-label="新子任务" placeholder="添加一个步骤" value={subtask} maxLength={160} onChange={(event) => setSubtask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubtask(); } }}/><button type="button" className="icon-button" aria-label="添加子任务" onClick={addSubtask}><Plus size={15}/></button></div>
    </fieldset>
    {error && <div className="editor-error" role="alert">{error}</div>}
    <footer className="editor-footer"><button type="button" className="text-button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={busy || !draft.title.trim()}>{busy ? '保存中…' : '保存任务'}</button></footer>
  </motion.form></>;
}
