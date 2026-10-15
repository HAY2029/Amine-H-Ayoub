use std::fs::{create_dir_all, File};
use std::io::Write;
use std::path::PathBuf;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use tauri::{AppHandle, Emitter, Manager};
use futures_util::StreamExt;

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    surah_number: u32,
    progress: f64,
    status: String,
    downloaded_bytes: u64,
    total_bytes: u64,
}

#[tauri::command]
async fn check_offline_status(app: AppHandle, surah_number: u32) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join("audio").join(format!("{}.mp3", surah_number));
    Ok(path.exists())
}

#[tauri::command]
async fn get_offline_audio_url(app: AppHandle, surah_number: u32) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join("audio").join(format!("{}.mp3", surah_number));
    if path.exists() {
        Ok(path.to_string_lossy().into_owned())
    } else {
        Err("File does not exist".to_string())
    }
}

#[tauri::command]
async fn download_surah(app: AppHandle, audio_url: String, surah_number: u32) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let audio_dir = app_dir.join("audio");
    create_dir_all(&audio_dir).map_err(|e| e.to_string())?;
    let path = audio_dir.join(format!("{}.mp3", surah_number));
    let temp_path = audio_dir.join(format!("{}.mp3.part", surah_number));

    let client = reqwest::Client::builder()
      .timeout(std::time::Duration::from_secs(120))
      .build()
      .map_err(|e| e.to_string())?;
    let response = client.get(&audio_url).send().await.map_err(|e| e.to_string())?
      .error_for_status().map_err(|e| e.to_string())?;
    let total_size = response.content_length().unwrap_or(0);

    let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = match item {
          Ok(chunk) => chunk,
          Err(error) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(error.to_string());
          }
        };
        if let Err(error) = file.write_all(&chunk) {
          let _ = std::fs::remove_file(&temp_path);
          return Err(error.to_string());
        }
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            app.emit("download-progress", DownloadProgress {
                surah_number,
                progress,
                status: "downloading".to_string(),
                downloaded_bytes: downloaded,
                total_bytes: total_size,
            }).unwrap_or(());
        }
    }

    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&temp_path, &path).map_err(|e| {
      let _ = std::fs::remove_file(&temp_path);
      e.to_string()
    })?;

    app.emit("download-progress", DownloadProgress {
        surah_number,
        progress: 100.0,
        status: "completed".to_string(),
        downloaded_bytes: downloaded,
        total_bytes: downloaded,
    }).unwrap_or(());

    Ok(path.to_string_lossy().into_owned())
}

/// حفظ صورة (شهادة / صورة احتفال) في مكان مرئي للمستخدم على كل المنصات:
/// - الحاسوب: مجلد الصور (Pictures) ثم التنزيلات (Downloads)
/// - الهاتف/التلفاز: إن لم يتوفر مجلد عام نستخدم مجلد التطبيق الداخلي
#[tauri::command]
fn save_base64_image(app: AppHandle, base64_data: String, filename: String) -> Result<String, String> {
  let bytes = BASE64_STANDARD
    .decode(base64_data.as_bytes())
    .map_err(|e| format!("فشل فك تشفير الصورة: {}", e))?;

  let base: PathBuf = match app.path().picture_dir() {
    Ok(p) => p,
    Err(_) => match app.path().download_dir() {
      Ok(p) => p,
      Err(_) => app.path().app_data_dir().map_err(|e| e.to_string())?,
    },
  };

  let dir = base.join("مصحف-أيوب-أمين");
  create_dir_all(&dir).map_err(|e| e.to_string())?;
  let path = dir.join(&filename);
  std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
  Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    // إضافة إضافة فتح الروابط الخارجية (المتصفح، واتساب، يوتيوب) على كل المنصات
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      check_offline_status,
      get_offline_audio_url,
      download_surah,
      exit_app,
      save_base64_image
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
