import { useEffect, useState } from 'react';
import { Bell, ExternalLink, Keyboard, Monitor, Power, Settings2 } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { useSettingsStore } from '../store/useSettingsStore';
import { hideToTray, quitApplication, testNotification } from '../lib/desktop';
import BackupPane from './BackupPane';

export default function SettingsPane({ onInteractionChange, onAppearanceInteractionChange }: { onInteractionChange: (locked: boolean) => void; onAppearanceInteractionChange?: (locked: boolean) => void }) {
  const { settings, update, loaded, busy, error, desktop, clearError, load } = useSettingsStore();
  const native = isTauri();
  const [hotkey, setHotkey] = useState(settings.hotkey), [editingHotkey, setEditingHotkey] = useState(false);
  const [testing, setTesting] = useState(false), [notice, setNotice] = useState(''), [quitConfirm, setQuitConfirm] = useState(false);
  const [backupLocked, setBackupLocked] = useState(false);
  const [appearanceEditing, setAppearanceEditing] = useState(false);
  useEffect(() => { setHotkey(settings.hotkey); }, [settings.hotkey]);
  useEffect(() => { onInteractionChange(busy || editingHotkey || testing || quitConfirm || backupLocked); return () => onInteractionChange(false); }, [busy, editingHotkey, testing, quitConfirm, backupLocked, onInteractionChange]);
  useEffect(() => { onAppearanceInteractionChange?.(appearanceEditing); return () => onAppearanceInteractionChange?.(false); }, [appearanceEditing, onAppearanceInteractionChange]);
  const action = async (fn: () => Promise<unknown>, success = '') => {
    setTesting(true); setNotice(''); clearError();
    try { await fn(); setNotice(success); } catch (e) { useSettingsStore.setState({ error: String(e) }); }
    finally { setTesting(false); }
  };
  const controlsUnavailable = !loaded || busy || backupLocked;
  const unavailable = !native || controlsUnavailable || testing;
  const isAppearanceControl = (target: EventTarget | null) => target instanceof HTMLElement && target.matches('select, input[type="color"], input[type="range"]');
  return <div className="settings-pane" onFocusCapture={(e) => { if (isAppearanceControl(e.target)) setAppearanceEditing(true); }} onBlurCapture={(e) => { if (isAppearanceControl(e.target)) setAppearanceEditing(isAppearanceControl(e.relatedTarget)); }} onKeyDown={(e) => { if (e.key === 'Escape' && quitConfirm) { e.stopPropagation(); setQuitConfirm(false); } }}>
    <div className="section-heading"><h1>设置</h1><span>{busy ? '正在保存…' : loaded ? '已自动保存' : '正在加载…'}</span></div>
    <div className="settings-environment"><Monitor size={14}/><div><strong>{native ? '桌面常驻' : '浏览器预览'}</strong><p>{native ? '收起留在桌面，隐藏留在托盘。' : '外观可在此调整，系统功能请在桌面版使用。'}</p></div><span>{native ? '本地运行' : '预览'}</span></div>
    <h2 className="settings-group-heading"><Settings2 size={12}/>浮窗与外观</h2>
    <label className="setting-row"><span>外观主题</span><select aria-label="外观主题" disabled={controlsUnavailable} value={settings.theme} onChange={(e) => void update({ theme: e.target.value as typeof settings.theme })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
    <label className="setting-row"><span>强调色<small>默认浅蓝，深色使用原来的柔和色</small></span><input type="color" aria-label="强调色" disabled={controlsUnavailable} value={settings.accentColor} onChange={(e) => void update({ accentColor: e.target.value })}/></label>
    <label className="setting-row"><span>浮窗宽度</span><select aria-label="浮窗宽度" disabled={controlsUnavailable} value={settings.width} onChange={(e) => void update({ width: Number(e.target.value) })}>{[...new Set([360,390,420,settings.width])].sort((a,b) => a-b).map((v) => <option key={v} value={v}>{v} px</option>)}</select></label>
    <button className="settings-cancel" disabled={controlsUnavailable} onClick={() => void update({ accentColor: '#5279d8', opacity: .82, width: 420 })}>恢复默认外观参数</button>
    <label className="setting-row"><span>背景不透明度</span><div className="opacity-control"><input type="range" aria-label="玻璃不透明度" min="65" max="98" disabled={controlsUnavailable} value={Math.round(settings.opacity * 100)} onChange={(e) => void update({ opacity: Number(e.target.value) / 100 })}/><span>{Math.round(settings.opacity * 100)}%</span></div></label>
    <label className="setting-row"><span>展开方式</span><select aria-label="展开方式" disabled={controlsUnavailable} value={settings.expandMode} onChange={(e) => void update({ expandMode: e.target.value as typeof settings.expandMode })}><option value="hover">悬停展开</option><option value="click">点击展开</option><option value="pinned">固定展开</option></select></label>
    <div className="settings-delay-grid"><label>悬停展开<select aria-label="悬停延迟" disabled={controlsUnavailable} value={settings.hoverDelay} onChange={(e) => void update({ hoverDelay: Number(e.target.value) })}>{[100,300,500,1000].map((v) => <option key={v} value={v}>{v} ms</option>)}</select></label><label>离开后收起<select aria-label="收起延迟" disabled={controlsUnavailable} value={settings.collapseDelay} onChange={(e) => void update({ collapseDelay: Number(e.target.value) })}>{[500,1000,2000,5000].map((v) => <option key={v} value={v}>{v / 1000} 秒</option>)}</select></label></div>
    <label className="setting-row"><span>始终置顶{!native && <small>桌面版生效</small>}</span><input type="checkbox" aria-label="始终置顶" disabled={controlsUnavailable} checked={settings.alwaysOnTop} onChange={(e) => void update({ alwaysOnTop: e.target.checked })}/></label>
    <h2 className="settings-group-heading"><Power size={12}/>桌面与启动{!native && <span>需桌面版</span>}</h2>
    <label className="setting-row"><span>开机自动启动<small>登录电脑后启动日点</small></span><input type="checkbox" aria-label="开机自动启动" disabled={unavailable || !!desktop.startupError} checked={settings.launchAtStartup} onChange={(e) => void update({ launchAtStartup: e.target.checked })}/></label>
    <div className="settings-shortcut"><label htmlFor="global-hotkey"><Keyboard size={12}/>唤回浮窗快捷键</label><div><input id="global-hotkey" value={hotkey} disabled={unavailable} maxLength={64} onFocus={() => setEditingHotkey(true)} onChange={(e) => setHotkey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setHotkey(settings.hotkey); setEditingHotkey(false); e.currentTarget.blur(); } }} onBlur={() => { if (hotkey === settings.hotkey) setEditingHotkey(false); }}/><button disabled={unavailable || (hotkey === settings.hotkey && !desktop.shortcutError)} onClick={() => { void update({ hotkey }).then((saved) => { if (saved) { setEditingHotkey(false); setNotice('快捷键已更新'); } }); }}>应用</button></div><p>例如 Alt+Space、Control+Shift+D。被占用时保留原快捷键。</p>{hotkey !== settings.hotkey && <button className="settings-cancel" onClick={() => { setHotkey(settings.hotkey); setEditingHotkey(false); }}>取消修改</button>}</div>
    <h2 className="settings-group-heading"><Bell size={12}/>提醒{!native && <span>需桌面版</span>}</h2>
    <label className="setting-row"><span>系统通知提醒<small>任务与日程的提醒时间到达时通知</small></span><input type="checkbox" aria-label="系统通知提醒" disabled={unavailable} checked={settings.notificationsEnabled} onChange={(e) => void update({ notificationsEnabled: e.target.checked })}/></label>
    <div className="settings-notification"><p>{native ? settings.notificationsEnabled ? desktop.permissionGranted ? '隐藏到托盘后仍会提醒。休眠后补发最近 24 小时的提醒。' : '通知权限未开启，请关闭后重新打开提醒开关。' : '已暂停提醒，任务与日程的提醒时间仍会保留。' : '预览不会发送系统通知。'}</p><button disabled={unavailable || !settings.notificationsEnabled} onClick={() => void action(testNotification, '已提交测试通知，请查看系统通知中心')}>测试通知</button></div>
    <p className="settings-hint">固定展开时暂停自动收起，Esc 和收起按钮仍可使用。退出应用后停止提醒。</p>
    <BackupPane onLock={setBackupLocked} disabled={testing || quitConfirm || editingHotkey}/>
    {native && <div className="settings-app-actions"><button disabled={busy || testing || backupLocked} onClick={() => void action(hideToTray)}><ExternalLink size={12}/>隐藏到托盘</button><button disabled={busy || testing || backupLocked} onClick={() => setQuitConfirm(true)}>退出日点</button></div>}
    {quitConfirm && <div className="inline-confirm" role="alert"><span>退出后将暂停提醒。</span><button onClick={() => setQuitConfirm(false)}>取消</button><button disabled={testing} onClick={() => void action(quitApplication)}>确认退出</button></div>}
    {notice && <p className="settings-notice" role="status">{notice}</p>}
    {[error, desktop.shortcutError, desktop.startupError, desktop.notificationError].filter(Boolean).map((issue, index) => <p key={index} role="alert" className="settings-error">{issue}</p>)}
    {!loaded && error && <button className="settings-cancel" onClick={() => void load()}>重新加载设置</button>}
  </div>;
}
