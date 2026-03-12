#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
  fs,
  io::{self, Write},
  net::TcpStream,
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::Mutex,
  time::{Duration, SystemTime},
};
use std::fs::OpenOptions;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::{Manager, RunEvent};

struct ApiChild(Mutex<Option<Child>>);

fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
  fs::create_dir_all(dst)?;
  for entry in fs::read_dir(src)? {
    let entry = entry?;
    let entry_type = entry.file_type()?;
    let dest_path = dst.join(entry.file_name());
    if entry_type.is_dir() {
      copy_dir_recursive(&entry.path(), &dest_path)?;
    } else if entry_type.is_file() {
      fs::copy(entry.path(), dest_path)?;
    }
  }
  Ok(())
}

fn resolve_existing_path(paths: &[PathBuf]) -> Option<PathBuf> {
  paths.iter().find(|path| path.exists()).cloned()
}

fn find_dir_with_files(root: &Path, required_files: &[&str], depth: usize, max_depth: usize) -> Option<PathBuf> {
  if depth > max_depth {
    return None;
  }
  if required_files
    .iter()
    .all(|file| root.join(file).exists())
  {
    return Some(root.to_path_buf());
  }

  let entries = fs::read_dir(root).ok()?;
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      if let Some(found) = find_dir_with_files(&path, required_files, depth + 1, max_depth) {
        return Some(found);
      }
    }
  }
  None
}

fn find_file_recursive(root: &Path, file_name: &str, depth: usize, max_depth: usize) -> Option<PathBuf> {
  if depth > max_depth {
    return None;
  }
  let entries = fs::read_dir(root).ok()?;
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      if let Some(found) = find_file_recursive(&path, file_name, depth + 1, max_depth) {
        return Some(found);
      }
    } else if path.file_name().and_then(|name| name.to_str()) == Some(file_name) {
      return Some(path);
    }
  }
  None
}

fn log_path(app: &tauri::App) -> Option<PathBuf> {
  app
    .path()
    .app_data_dir()
    .ok()
    .map(|dir| dir.join("logs").join("api.log"))
}

fn log_line(app: &tauri::App, message: &str) {
  let Some(path) = log_path(app) else {
    return;
  };
  if let Some(parent) = path.parent() {
    let _ = fs::create_dir_all(parent);
  }
  if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
    let _ = writeln!(file, "[{:?}] {}", SystemTime::now(), message);
  }
}

fn open_log_file(app: &tauri::App) -> Option<std::fs::File> {
  let path = log_path(app)?;
  if let Some(parent) = path.parent() {
    let _ = fs::create_dir_all(parent);
  }
  OpenOptions::new().create(true).append(true).open(path).ok()
}

fn needs_server_refresh(server_dest: &Path) -> bool {
  if !server_dest.exists() {
    return true;
  }
  let node_modules = server_dest.join("node_modules");
  let better_sqlite = node_modules.join("better-sqlite3");
  !better_sqlite.exists()
}

fn resolve_resource_root(app: &tauri::App) -> PathBuf {
  app
    .path()
    .resource_dir()
    .ok()
    .or_else(|| std::env::current_dir().ok())
    .unwrap_or_else(|| PathBuf::from("."))
}

fn prepare_server_assets(app: &tauri::App) -> io::Result<PathBuf> {
  let resource_root = resolve_resource_root(app);
  log_line(app, &format!("resource_root = {}", resource_root.display()));

  let server_src = resolve_existing_path(&[
    resource_root.join("server"),
    resource_root.join("resources").join("server"),
    resource_root.join("..").join("server"),
    resource_root.join("..").join("resources").join("server"),
  ])
  .or_else(|| find_dir_with_files(&resource_root, &["index.js", "db.js", "schema.sql"], 0, 6))
  .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "server resources not found"))?;

  let data_src = resolve_existing_path(&[
    resource_root.join("data").join("sermons.db"),
    resource_root.join("resources").join("data").join("sermons.db"),
    resource_root.join("..").join("data").join("sermons.db"),
    resource_root.join("..").join("resources").join("data").join("sermons.db"),
  ])
  .or_else(|| find_file_recursive(&resource_root, "sermons.db", 0, 6))
  .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "seed database not found"))?;

  let app_data_dir = app
    .path()
    .app_data_dir()
    .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;

  let server_dest = app_data_dir.join("server");
  let data_dest_dir = app_data_dir.join("data");
  let data_dest = data_dest_dir.join("sermons.db");

  if needs_server_refresh(&server_dest) {
    if server_dest.exists() {
      fs::remove_dir_all(&server_dest)?;
    }
    copy_dir_recursive(&server_src, &server_dest)?;
  }

  if !data_dest.exists() {
    fs::create_dir_all(&data_dest_dir)?;
    fs::copy(&data_src, &data_dest)?;
  }

  Ok(server_dest.join("index.js"))
}

fn is_port_open(port: u16) -> bool {
  let addr = format!("127.0.0.1:{port}");
  let Ok(addr) = addr.parse() else {
    return false;
  };
  TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn try_start_api(app: &tauri::App) -> Option<Child> {
  if is_port_open(3927) {
    log_line(app, "API already running on port 3927.");
    return None;
  }

  let script = match prepare_server_assets(app) {
    Ok(path) => path,
    Err(err) => {
      log_line(app, &format!("prepare_server_assets failed: {err}"));
      return None;
    }
  };
  if !script.exists() {
    log_line(app, "Server entrypoint not found after preparing assets.");
    return None;
  }

  log_line(app, &format!("Starting API via node: {}", script.display()));

  let mut cmd = Command::new("node");
  cmd
    .arg(script)
    .env("SERMON_API_PORT", "3927")
    .stdin(Stdio::null());

  #[cfg(target_os = "windows")]
  {
    // Hide the spawned node.exe console window.
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  if let Some(log_file) = open_log_file(app) {
    cmd.stdout(Stdio::from(log_file));
  } else {
    cmd.stdout(Stdio::null());
  }

  if let Some(log_file) = open_log_file(app) {
    cmd.stderr(Stdio::from(log_file));
  } else {
    cmd.stderr(Stdio::null());
  }

  match cmd.spawn() {
    Ok(child) => {
      log_line(app, &format!("API process started (pid {}).", child.id()));
      for _ in 0..12 {
        if is_port_open(3927) {
          log_line(app, "API is listening on port 3927.");
          break;
        }
        std::thread::sleep(Duration::from_millis(250));
      }
      if !is_port_open(3927) {
        log_line(app, "API did not open port 3927 within 3 seconds.");
      }
      Some(child)
    }
    Err(err) => {
      log_line(app, &format!("Failed to spawn node: {err}"));
      None
    }
  }
}

fn main() {
  let app = tauri::Builder::default()
    .setup(|app| {
      let child = try_start_api(app);
      app.manage(ApiChild(Mutex::new(child)));
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application");

  app.run(|app_handle, event| {
    if let RunEvent::ExitRequested { .. } = event {
      let state = app_handle.state::<ApiChild>();
      let child = {
        let mut guard = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.take()
      };
      if let Some(mut child) = child {
        let _ = child.kill();
      }
    }
  });
}
