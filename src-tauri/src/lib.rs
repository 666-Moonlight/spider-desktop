use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const SERVER_PORT: u16 = 4319;

fn env_port() -> u16 {
    std::env::var("SPIDER_PORT")
        .ok()
        .and_then(|raw| raw.trim().parse().ok())
        .unwrap_or(SERVER_PORT)
}

#[derive(Default)]
struct ServerHandle(Mutex<Option<CommandChild>>);

/// Windows 的 current_exe() 会返回 \\?\ 扩展长度前缀，把它传给 Bun 会导致文件打不开。
fn plain_path(path: std::path::PathBuf) -> String {
    let raw = path.to_string_lossy().to_string();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

fn port_ready(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port))
        .map(|stream| {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
            true
        })
        .unwrap_or(false)
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if port_ready(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerHandle::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|err| format!("resource_dir unavailable: {err}"))?;
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(|dir| dir.to_path_buf()))
                .ok_or("current_exe directory unavailable")?;
            let static_dir = [resource_dir.join("dist"), exe_dir.join("dist")]
                .into_iter()
                .find(|dir| dir.join("index.html").exists())
                .ok_or("dist/index.html not found next to the executable or in resources")?;
            let data_dir = match std::env::var("SPIDER_DATA_DIR") {
                Ok(raw) if !raw.trim().is_empty() => std::path::PathBuf::from(raw),
                _ => app
                    .path()
                    .app_data_dir()
                    .map_err(|err| format!("app_data_dir unavailable: {err}"))?,
            };
            std::fs::create_dir_all(&data_dir)?;
            let seed = [resource_dir.join("seed").join("settings.json"), exe_dir.join("seed").join("settings.json")]
                .into_iter()
                .find(|path| path.exists());
            let target = data_dir.join("settings.json");
            if let Some(seed) = seed {
                if !target.exists() {
                    let _ = std::fs::copy(&seed, &target);
                }
            }
            let port = env_port();
            let sidecar = app
                .shell()
                .sidecar("spider-server")
                .map_err(|err| format!("sidecar not found: {err}"))?
                .env("SPIDER_PORT", port.to_string())
                .env("SPIDER_STATIC_DIR", plain_path(static_dir))
                .env("SPIDER_DATA_DIR", plain_path(data_dir.clone()));

            let (mut events, child) = sidecar
                .spawn()
                .map_err(|err| format!("sidecar spawn failed: {err}"))?;
            app.state::<ServerHandle>().0.lock().unwrap().replace(child);

            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                            println!("[sidecar] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(payload) => {
                            println!("[sidecar] terminated: {:?}", payload.code);
                        }
                        _ => {}
                    }
                }
            });

            if !wait_for_port(port, Duration::from_secs(40)) {
                return Err("local server did not become ready in 40s".into());
            }

            let url = format!("http://127.0.0.1:{port}/");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
                .title("Spider 独立版")
                .inner_size(1280.0, 860.0)
                .min_inner_size(720.0, 520.0)
                .resizable(true)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app_handle.state::<ServerHandle>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
