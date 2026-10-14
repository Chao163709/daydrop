use std::{collections::{BTreeMap, BTreeSet}, fs, io::Write, path::PathBuf, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

const DAY_MS: i64 = 86_400_000;
#[derive(Clone, Deserialize)]
pub struct Reminder { key: String, at: i64, title: String, body: String }
struct Runtime {
    enabled: bool,
    queue: Vec<Reminder>,
    delivered: BTreeMap<String, i64>,
    ledger_path: PathBuf,
    ledger_error: Option<String>,
}
pub struct ReminderState(Mutex<Runtime>);

fn now_ms() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64 }
fn is_due(item: &Reminder, delivered: &BTreeMap<String, i64>, now: i64) -> bool {
    item.at <= now && item.at >= now - DAY_MS && !delivered.contains_key(&item.key)
}
fn persist_ledger(path: &PathBuf, delivered: &BTreeMap<String, i64>) -> Result<(), String> {
    let temporary = path.with_extension("tmp");
    let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(delivered).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(temporary, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_reminders(state: State<'_, ReminderState>, enabled: bool, reminders: Vec<Reminder>) -> Result<(), String> {
    let mut runtime = state.0.lock().map_err(|e| e.to_string())?;
    if !enabled { runtime.enabled = false; runtime.queue.clear(); return Ok(()); }
    if let Some(error) = &runtime.ledger_error { return Err(error.clone()); }
    if reminders.len() > 20_000 { return Err("提醒数量过多，请减少重复日程".into()); }
    let mut keys = BTreeSet::new();
    if reminders.iter().any(|item| item.key.is_empty() || item.title.is_empty() || item.key.len() > 256 || item.title.len() > 1024 || !keys.insert(item.key.clone())) {
        return Err("提醒数据无效或重复".into());
    }
    runtime.queue = reminders;
    runtime.enabled = true;
    Ok(())
}

fn deliver(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<ReminderState>();
    let mut runtime = state.0.lock().map_err(|e| e.to_string())?;
    if !runtime.enabled { return Ok(()); }
    if let Some(error) = &runtime.ledger_error { return Err(error.clone()); }
    let now = now_ms();
    let due: Vec<_> = runtime.queue.iter().filter(|item| is_due(item, &runtime.delivered, now)).cloned().collect();
    if due.is_empty() { return Ok(()); }
    let previous = runtime.delivered.clone();
    let mut delivered = previous.clone();
    delivered.retain(|_, time| *time >= now - 30 * DAY_MS);
    for item in &due { delivered.insert(item.key.clone(), now); }
    // Persist the claim first, so restarting cannot flood the notification center.
    persist_ledger(&runtime.ledger_path, &delivered)?;
    runtime.delivered = delivered;
    let (title, body) = if due.len() == 1 { (due[0].title.clone(), due[0].body.clone()) }
        else { (format!("日点 · {} 条提醒到达", due.len()), due.iter().take(3).map(|item| item.title.as_str()).collect::<Vec<_>>().join("\n")) };
    if let Err(error) = app.notification().builder().title(title).body(body).show() {
        if let Err(rollback) = persist_ledger(&runtime.ledger_path, &previous) {
            let issue = format!("通知发送失败且记录无法恢复：{}；{}", error, rollback);
            runtime.ledger_error = Some(issue.clone());
            return Err(issue);
        }
        runtime.delivered = previous;
        return Err(format!("通知未发送，将重试：{}", error));
    }
    Ok(())
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let directory = app.path().app_data_dir()?;
    fs::create_dir_all(&directory)?;
    let ledger_path = directory.join("reminder-deliveries.json");
    let (delivered, ledger_error) = match fs::read(&ledger_path) {
        Ok(bytes) => match serde_json::from_slice::<BTreeMap<String, i64>>(&bytes) {
            Ok(records) => (records, None),
            Err(error) => (BTreeMap::new(), Some(format!("提醒记录无法读取，原文件已保留：{}", error))),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (BTreeMap::new(), None),
        Err(error) => (BTreeMap::new(), Some(format!("提醒记录无法读取：{}", error))),
    };
    app.manage(ReminderState(Mutex::new(Runtime { enabled: false, queue: vec![], delivered, ledger_path, ledger_error })));
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        let mut previous_error = String::new();
        let mut refreshed_at = now_ms();
        loop {
            std::thread::sleep(Duration::from_secs(5));
            match deliver(&handle) {
                Ok(()) => previous_error.clear(),
                Err(error) => { if previous_error != error { let _ = handle.emit("daydrop-reminder-error", &error); previous_error = error; } }
            }
            if now_ms() - refreshed_at >= 3_600_000 {
                let _ = handle.emit("daydrop-refresh-reminders", ()); refreshed_at = now_ms();
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_recent_undelivered_items_are_due() {
        let now = 2 * DAY_MS;
        let mut item = Reminder { key: "a".into(), at: now, title: "Task".into(), body: "".into() };
        let mut ledger = BTreeMap::new();
        assert!(is_due(&item, &ledger, now));
        item.at = now + 1; assert!(!is_due(&item, &ledger, now));
        item.at = now - DAY_MS; assert!(is_due(&item, &ledger, now));
        item.at -= 1; assert!(!is_due(&item, &ledger, now));
        item.at = now; ledger.insert("a".into(), now); assert!(!is_due(&item, &ledger, now));
    }
    #[test]
    fn ledger_replacement_survives_a_second_write() {
        let directory = std::env::temp_dir().join(format!("daydrop-ledger-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("deliveries.json");
        let mut ledger = BTreeMap::new();
        ledger.insert("a".into(), 10); persist_ledger(&path, &ledger).unwrap();
        ledger.insert("b".into(), 20); persist_ledger(&path, &ledger).unwrap();
        assert_eq!(serde_json::from_slice::<BTreeMap<String, i64>>(&fs::read(&path).unwrap()).unwrap(), ledger);
        fs::remove_file(path).unwrap(); fs::remove_dir(directory).unwrap();
    }
}
