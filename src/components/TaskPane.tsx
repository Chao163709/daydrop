import { useEffect, useState, type FormEvent } from 'react';
import { addDays, format, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Archive, ArchiveRestore, CalendarDays, GripVertical, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Task } from '../types';
import { selectTasks, todayTasks, quickDueAt, type QuickSchedule, type TaskFilter, type TaskSort } from '../lib/tasks';
import { useTaskStore } from '../store/useTaskStore';
import TaskEditor, { emptyDraft } from './TaskEditor';
const priorities = { high: '高优先级', medium: '普通', low: '低优先级' };
function dueLabel(task: Task, now: Date) {
  if (!task.dueAt) return '';
  const date = new Date(task.dueAt);
  return isSameDay(date, now) ? '今天' : format(date, 'M月d日', { locale: zhCN });
}
export default function TaskPane({ tab, now, onInteractionChange }: { tab: 'today' | 'all'; now: Date; onInteractionChange: (locked: boolean) => void }) {
  const reducedMotion = useReducedMotion();
  const { tasks, loaded, busy, error, load, add, toggle, archive, remove, move, reschedule, clearError } = useTaskStore();
  const [schedule, setSchedule] = useState<QuickSchedule>(tab === 'today' ? 'today' : 'unscheduled');
  const [feedback, setFeedback] = useState('');
  const [quickTitle, setQuickTitle] = useState(''), [query, setQuery] = useState(''), [priority, setPriority] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('active'), [sort, setSort] = useState<TaskSort>('manual');
  const [options, setOptions] = useState(false), [editor, setEditor] = useState<Task | 'new' | null>(null), [deleting, setDeleting] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onInteractionChange(!!editor || !!quickTitle.trim() || !!deleting || !!dragged); }, [editor, quickTitle, deleting, dragged, onInteractionChange]);
  useEffect(() => () => onInteractionChange(false), [onInteractionChange]);
  useEffect(() => { setFilter('active'); setSchedule(tab === 'today' ? 'today' : 'unscheduled'); setFeedback(''); }, [tab]);
  const today = todayTasks(tasks, now), completed = today.filter((task) => task.completed).length;
  const rows = selectTasks(tasks, tab, filter, query, priority, sort, now);
  const manual = sort === 'manual' && !query.trim() && !priority;
  const quickAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (await add({ ...emptyDraft, title: quickTitle, dueAt: quickDueAt(schedule, new Date()) })) {
      setQuickTitle(''); setFeedback(schedule === 'tomorrow' ? '已安排到明天，可在全部或日历中查看。' : schedule === 'unscheduled' ? '已记下，可在「待安排」中选择日期。' : '已加入今天的安排。');
    }
  };
  return <>
    <div className="today-progress"><div className="day-chip"><span>{format(now, 'EEE', { locale: zhCN })}</span><strong>{format(now, 'dd')}</strong></div><div className="progress-info"><div><span>今日待处理</span><span><strong>{completed}</strong> / {today.length}</span></div><div className="progress-track" role="progressbar" aria-label="今日进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={today.length ? Math.round(completed / today.length * 100) : 0}><span style={{ width: `${today.length ? completed / today.length * 100 : 0}%` }}/></div><small>{today.length ? `已完成 ${Math.round(completed / today.length * 100)}%，含逾期与待安排。` : '从一件小事开始。'}</small></div></div>
    <form className="quick-add" onSubmit={quickAdd} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); setQuickTitle(''); } }}><input aria-label="快捷添加任务" placeholder="添加任务，按 Enter 保存" maxLength={160} value={quickTitle} disabled={!loaded || busy} onChange={(event) => setQuickTitle(event.target.value)}/>{quickTitle && <button type="button" className="icon-button" aria-label="清空输入" onClick={() => setQuickTitle('')}><X size={13}/></button>}<button type="submit" aria-label="添加任务" disabled={!loaded || busy || !quickTitle.trim()}><Plus size={17}/></button></form>
    <div className="quick-schedule" role="group" aria-label="新任务截止日期"><span>截止</span>{([{ value: 'today', label: '今天' }, { value: 'tomorrow', label: '明天' }, { value: 'unscheduled', label: '暂不安排' }] as const).map((choice) => <button key={choice.value} type="button" aria-pressed={schedule === choice.value} disabled={!loaded || busy} onClick={() => { setSchedule(choice.value); setFeedback(''); }}>{choice.label}</button>)}</div>
    {feedback && <div className="capture-feedback" role="status"><span>{feedback}</span><button className="icon-button" aria-label="关闭添加提示" onClick={() => setFeedback('')}><X size={11}/></button></div>}
    <div className="task-section-heading"><h1>{tab === 'today' ? '今日任务' : '全部任务'}<span>{rows.length}</span></h1><button className="icon-button" title="详细添加" aria-label="详细添加任务" disabled={!loaded || busy} onClick={() => setEditor('new')}><Plus size={15}/></button><button className={`icon-button ${options ? 'selected' : ''}`} title="搜索和筛选" aria-label="搜索和筛选" aria-expanded={options} onClick={() => setOptions(!options)}><SlidersHorizontal size={14}/></button></div>
    <div className="task-filters" aria-label="任务分类">{([{ value: 'active', label: '待办' }, { value: 'unscheduled', label: '待安排' }, { value: 'overdue', label: '逾期' }, ...(tab === 'all' ? [{ value: 'upcoming', label: '即将到期' }] : []), { value: 'completed', label: '已完成' }, ...(tab === 'all' ? [{ value: 'archived', label: '已归档' }] : [])] as { value: TaskFilter; label: string }[]).map((item) => <button key={item.value} className={filter === item.value ? 'active' : ''} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
    {options && <div className="task-options"><label className="search-field"><Search size={13}/><input aria-label="搜索任务" placeholder="搜索标题、备注、标签" value={query} onChange={(event) => setQuery(event.target.value)}/></label><div className="option-selects"><select aria-label="按优先级筛选" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">所有优先级</option><option value="high">高优先级</option><option value="medium">普通</option><option value="low">低优先级</option></select><select aria-label="任务排序" value={sort} onChange={(event) => setSort(event.target.value as TaskSort)}><option value="manual">手动排序</option><option value="due">截止时间</option><option value="priority">优先级</option><option value="created">最近添加</option></select>{(query || priority) && <button className="text-button" onClick={() => { setQuery(''); setPriority(''); }}>清除</button>}</div></div>}
    {error && <div className="task-error" role="alert"><p>{error}</p><button className="text-button" onClick={() => { clearError(); if (!loaded) void load(); }}>{loaded ? '关闭提示' : '重试加载'}</button></div>}
    {!loaded && !error ? <p className="list-message">正在加载任务…</p> : rows.length === 0 ? <div className="task-empty"><span className="empty-dash"/><h2>{query || priority ? '没有匹配的任务' : filter === 'completed' ? '还没有完成的任务' : filter === 'archived' ? '还没有归档的任务' : filter === 'unscheduled' ? '没有待安排的任务' : filter === 'overdue' ? '没有逾期任务' : filter === 'upcoming' ? '近期没有截止任务' : completed && tab === 'today' ? '今天的任务已完成' : tab === 'today' ? '今天，从一件小事开始' : '把要做的事记在这里'}</h2><p>{filter === 'active' && !query && !priority ? '在上方输入任务，或点击 + 添加详情。' : '试试其他分类或筛选条件。'}</p></div> : <div className="task-list"><AnimatePresence initial={false}>{rows.map((task, index) => <motion.article layout={!dragged && !reducedMotion} initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: reducedMotion ? undefined : 0 }} transition={{ duration: reducedMotion ? 0 : .16 }} key={task.id} className={`task-row p-${task.priority} ${task.completed ? 'completed' : ''} ${dragged === task.id ? 'dragging' : ''}`} onDragOver={(event) => { if (manual && dragged) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (manual && dragged) void move(dragged, task.id); setDragged(null); }}>
      <input type="checkbox" aria-label={`完成任务：${task.title}`} checked={task.completed} disabled={busy || task.archived} onChange={() => void toggle(task.id)}/>
      <div className="task-details"><button className="task-title" onClick={() => setEditor(task)} title="编辑任务" disabled={busy}>{task.title}</button>{(task.dueAt || task.tags.length > 0 || task.priority !== 'medium' || task.subtasks.length > 0 || task.repeat !== 'none') && <div className="task-meta">{task.priority !== 'medium' && <span className={`priority ${task.priority}`}>{priorities[task.priority]}</span>}{task.dueAt && <span className={!task.completed && new Date(task.dueAt) < now ? 'overdue' : ''}><CalendarDays size={10}/>{dueLabel(task, now)}</span>}{task.tags.slice(0, 3).map((tag) => <span className="task-tag" key={tag}>#{tag}</span>)}{task.subtasks.length > 0 && <span>步骤 {task.subtasks.filter((item) => item.completed).length}/{task.subtasks.length}</span>}{task.repeat !== 'none' && <span>{{ daily: '每天', weekly: '每周', monthly: '每月' }[task.repeat]}</span>}</div>}</div>
      {!task.completed && !task.archived && !task.dueAt && <button className="schedule-task" disabled={busy} title="未安排日期，点击设置为今天截止" aria-label={`将任务安排到今天：${task.title}`} onClick={async () => { if (await reschedule(task.id, new Date())) setFeedback('已安排到今天，原提醒时间保持不变。'); }}>安排今天</button>}
      {!task.completed && !task.archived && task.dueAt && new Date(task.dueAt) < now && <button className="schedule-task" disabled={busy} title="移至明天，保留截止时刻和提醒提前量" aria-label={`将逾期任务移至明天：${task.title}`} onClick={async () => { if (await reschedule(task.id, addDays(new Date(), 1))) setFeedback('已移至明天，保留截止时刻和提醒提前量。'); }}>移到明天</button>}
      <div className="task-actions"><button className="icon-button" aria-label={`编辑任务：${task.title}`} title="编辑" disabled={busy} onClick={() => setEditor(task)}><Pencil size={12}/></button><button className="icon-button" aria-label={`${task.archived ? '恢复' : '归档'}任务：${task.title}`} title={task.archived ? '恢复' : '归档'} disabled={busy} onClick={() => void archive(task.id)}>{task.archived ? <ArchiveRestore size={12}/> : <Archive size={12}/>}</button><button className="icon-button" aria-label={`删除任务：${task.title}`} title="删除" disabled={busy} onClick={() => setDeleting(task.id)}><Trash2 size={12}/></button></div>
      {manual && <button className="reorder-handle" title="拖动排序；方向键调整顺序" aria-label={`排序任务：${task.title}`} draggable={!busy} disabled={busy} onDragStart={(event) => { event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move'; setDragged(task.id); }} onDragEnd={() => setDragged(null)} onKeyDown={(event) => { if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); void move(task.id, rows[index - 1].id); } if (event.key === 'ArrowDown' && index < rows.length - 1) { event.preventDefault(); void move(task.id, rows[index + 1].id); } }}><GripVertical size={13}/></button>}
      {deleting === task.id && <div className="delete-confirm"><span>删除这条任务？</span><button className="text-button" disabled={busy} onClick={() => setDeleting(null)}>取消</button><button className="danger-button" disabled={busy} onClick={async () => { if (await remove(task.id)) setDeleting(null); }}>确认删除</button></div>}
    </motion.article>)}</AnimatePresence></div>}
    {editor && <TaskEditor task={editor === 'new' ? undefined : editor} initialDueAt={editor === 'new' ? quickDueAt(schedule, new Date()) ?? undefined : undefined} onClose={() => setEditor(null)}/>}
  </>;
}
