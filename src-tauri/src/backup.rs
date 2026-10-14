use serde_json::Value;
use sqlx::{Pool, Sqlite};
use tauri_plugin_sql::DbInstances;

// Keep both collections on the same SQL connection and transaction.
async fn merge(pool: &Pool<Sqlite>, payload: &str) -> Result<(), String> {
    if payload.len() > 20 * 1024 * 1024 { return Err("备份不能超过 20 MB".into()); }
    let data: Value = serde_json::from_str(payload).map_err(|e| e.to_string())?;
    if data["format"] != "daydrop-backup" || data["version"] != 1 { return Err("备份版本无效".into()); }
    for key in ["tasks", "events"] {
        let rows = data[key].as_array().ok_or("备份列表格式无效")?;
        if rows.len() > 10000 { return Err("备份条目过多".into()); }
        for row in rows {
            if row["id"].as_str().map(|s| s.trim().is_empty()).unwrap_or(true) { return Err("备份 ID 无效".into()); }
        }
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO tasks (id,title,note,due_at,remind_at,priority,tags,subtasks,repeat,completed,archived,created_at,updated_at,sort_order,completed_at,repeat_source_id)
        SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),json_extract(value,'$.note'),json_extract(value,'$.dueAt'),json_extract(value,'$.remindAt'),json_extract(value,'$.priority'),json_extract(value,'$.tags'),json_extract(value,'$.subtasks'),json_extract(value,'$.repeat'),json_extract(value,'$.completed'),json_extract(value,'$.archived'),json_extract(value,'$.createdAt'),json_extract(value,'$.updatedAt'),json_extract(value,'$.order'),json_extract(value,'$.completedAt'),json_extract(value,'$.repeatSourceId')
        FROM json_each(?,'$.tasks') WHERE true ON CONFLICT(id) DO NOTHING")
        .bind(payload).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO events (id,title,start_at,end_at,all_day,color,location,note,repeat,remind_at)
        SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),json_extract(value,'$.startAt'),json_extract(value,'$.endAt'),json_extract(value,'$.allDay'),json_extract(value,'$.color'),json_extract(value,'$.location'),json_extract(value,'$.note'),json_extract(value,'$.repeat'),json_extract(value,'$.remindAt')
        FROM json_each(?,'$.events') WHERE true ON CONFLICT(id) DO NOTHING")
        .bind(payload).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_backup(databases: tauri::State<'_, DbInstances>, payload: String) -> Result<(), String> {
    let pool = {
        let instances = databases.0.read().await;
        match instances.get("sqlite:daydrop.db") {
            Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => pool.clone(),
            _ => return Err("数据库尚未加载".into()),
        }
    };
    merge(&pool, &payload).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn import_is_atomic_and_keeps_existing_rows() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
            sqlx::raw_sql(include_str!("../migrations/001_initial.sql")).execute(&pool).await.unwrap();
            sqlx::raw_sql(include_str!("../migrations/002_task_history.sql")).execute(&pool).await.unwrap();
            let task = serde_json::json!({"id":"task","title":"Original","note":"","dueAt":null,"remindAt":null,"priority":"medium","tags":[],"subtasks":[],"repeat":"none","completed":false,"archived":false,"createdAt":"2026-10-10T00:00:00Z","updatedAt":"2026-10-10T00:00:00Z","order":1,"completedAt":null,"repeatSourceId":null});
            let mut data = serde_json::json!({"format":"daydrop-backup","version":1,"tasks":[task],"events":[{"id":"invalid","title":""}]});
            assert!(merge(&pool, &data.to_string()).await.is_err());
            assert_eq!(sqlx::query_scalar::<_, i64>("SELECT count(*) FROM tasks").fetch_one(&pool).await.unwrap(), 0);
            data["events"] = serde_json::json!([]);
            merge(&pool, &data.to_string()).await.unwrap();
            data["tasks"][0]["title"] = serde_json::json!("Changed");
            merge(&pool, &data.to_string()).await.unwrap();
            assert_eq!(sqlx::query_scalar::<_, String>("SELECT title FROM tasks").fetch_one(&pool).await.unwrap(), "Original");
        });
    }
}
