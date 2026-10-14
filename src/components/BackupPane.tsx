import { useEffect, useRef, useState } from 'react';
import { Download, Upload, DatabaseBackup } from 'lucide-react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, stat } from '@tauri-apps/plugin-fs';
import { MAX_BACKUP_BYTES, parseBackup, serializeBackup, mergeBackup, saveBrowserBackup, backupFileName, type Backup } from '../lib/backup';
import { taskRepository } from '../lib/taskRepository';
import { eventRepository } from '../lib/eventRepository';
import { useTaskStore } from '../store/useTaskStore';
import { useEventStore } from '../store/useEventStore';
import { useSettingsStore } from '../store/useSettingsStore';

export default function BackupPane({ onLock, disabled = false }: { onLock: (locked: boolean) => void; disabled?: boolean }) {
  const tasks = useTaskStore(), events = useEventStore(), preferences = useSettingsStore();
  const [busy, setBusy] = useState(false), [pending, setPending] = useState<Backup | null>(null);
  const [appearance, setAppearance] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { void useTaskStore.getState().load(); void useEventStore.getState().load(); }, []);
  useEffect(() => { onLock(busy || !!pending); return () => onLock(false); }, [busy, pending, onLock]);
  const ready = !disabled && tasks.loaded && events.loaded && preferences.loaded && !tasks.busy && !events.busy && !preferences.busy && !busy;
  const snapshot = () => ({ tasks: useTaskStore.getState().tasks, events: useEventStore.getState().events, settings: useSettingsStore.getState().settings });
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const inspect = (text: string) => { setPending(parseBackup(text)); setAppearance(false); };
  const exportFile = () => act(async () => {
    const text = serializeBackup(snapshot()), name = backupFileName();
    if (isTauri()) {
      const path = await save({ title: '导出日点备份', defaultPath: name, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
      if (!path) return;
      await writeTextFile(path, text); setMessage('备份已保存到所选位置');
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000); setMessage('已提交备份下载');
    }
  });
  const selectFile = () => {
    if (!isTauri()) { input.current?.click(); return; }
    void act(async () => {
      const path = await open({ title: '选择日点 JSON 备份', multiple: false, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
      if (!path) return;
      if ((await stat(path)).size > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 20 MB');
      inspect(await readTextFile(path));
    });
  };
  const importFile = () => act(async () => {
    if (!pending || useTaskStore.getState().busy || useEventStore.getState().busy || useSettingsStore.getState().busy) throw new Error('数据正在保存，请稍后重试');
    const before = snapshot(), merged = mergeBackup(before, pending);
    useTaskStore.setState({ busy: true }); useEventStore.setState({ busy: true });
    try {
      if (isTauri()) {
        await invoke('import_backup', { payload: JSON.stringify(pending) });
        setPending(null);
        try {
          const [freshTasks, freshEvents] = await Promise.all([taskRepository.load(), eventRepository.load()]);
          useTaskStore.setState({ tasks: freshTasks }); useEventStore.setState({ events: freshEvents });
        } catch { throw new Error('数据已导入，但刷新失败，请重启日点查看。'); }
      } else {
        saveBrowserBackup(merged);
        useTaskStore.setState({ tasks: merged.tasks }); useEventStore.setState({ events: merged.events }); setPending(null);
      }
      const count = `${merged.tasks.length - before.tasks.length} 个任务、${merged.events.length - before.events.length} 个事件`;
      if (appearance) {
        const { theme, opacity, width, accentColor } = pending.settings;
        if (!await preferences.update({ theme, opacity, width, accentColor })) { setMessage(`已导入 ${count}，外观恢复失败，可在设置中重试。`); return; }
      }
      setMessage(`已导入 ${count}，已有记录保持不变。`);
    } finally { useTaskStore.setState({ busy: false }); useEventStore.setState({ busy: false }); }
  });
  const preview = pending ? mergeBackup(snapshot(), pending) : null;
  return <section className="backup-pane" onKeyDown={(e) => { if (e.key === 'Escape' && pending && !busy) { e.stopPropagation(); setPending(null); setError(''); } }}>
    <h2 className="settings-group-heading"><DatabaseBackup size={12}/>数据与备份</h2>
    <p className="settings-hint">JSON 包含全部任务、归档、日程和设置。请妥善保存备份文件。</p>
    <div className="backup-actions"><button disabled={!ready || !!pending} onClick={() => void exportFile()}><Download size={13}/>导出备份</button><button disabled={!ready || !!pending} onClick={selectFile}><Upload size={13}/>导入备份</button></div>
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; void act(async () => { if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 20 MB'); inspect(await file.text()); }); }}/>
    {pending && preview && <div className="backup-preview" role="region" aria-label="导入预览">
      <strong>合并备份</strong><p>文件包含 {pending.tasks.length} 个任务、{pending.events.length} 个事件。</p><p>新增 {preview.tasks.length - tasks.tasks.length} 个任务、{preview.events.length - events.events.length} 个事件；相同 ID 跳过。</p>
      <label><input type="checkbox" checked={appearance} disabled={busy} onChange={(e) => setAppearance(e.target.checked)}/>同时恢复主题、颜色、透明度和宽度</label>
      <p>自启、快捷键和通知开关保留当前设置。</p>
      <div className="backup-actions"><button disabled={busy} onClick={() => setPending(null)}>取消</button><button disabled={!ready} onClick={() => void importFile()}>确认导入</button></div>
    </div>}
    {busy && <p role="status" className="settings-notice">正在处理备份…</p>}
    {message && <p role="status" className="settings-notice">{message}</p>}
    {error && <p role="alert" className="settings-error">{error}</p>}
    {(tasks.error || events.error) && <p role="alert" className="settings-error">{tasks.error || events.error}</p>}
  </section>;
}
