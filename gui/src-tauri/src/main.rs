// Vexa Code desktop shell (P21): spawns `vexa --gui` sidecar (node) and
// streams line-JSON events to the webview via an IPC channel.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::json;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

struct Bridge(Mutex<Option<Child>>);

#[tauri::command]
fn bridge_start(app: AppHandle, channel: tauri::ipc::Channel<serde_json::Value>) {
    let cwd = std::env::var("VEXA_GUI_CWD").unwrap_or_else(|_| std::env::current_dir().unwrap_or_default().display().to_string());
    let node = std::env::var("VEXA_GUI_NODE").unwrap_or_else(|_| "node".to_string());
    let entry = std::env::var("VEXA_GUI_ENTRY").unwrap_or_else(|_| "C:/Users/Administrator/vexa-code/dist/cli.js".to_string());
    let model = std::env::var("VEXA_GUI_MODEL").unwrap_or_else(|_| "nvidia".to_string());

    let child = Command::new(&node)
        .args([&entry, "--gui", "--model", &model])
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            let _ = channel.send(json!({"type": "error", "message": format!("failed to spawn sidecar: {e}")}));
            return;
        }
    };
    let stdin = child.stdin.take();
    if let Some(m) = STDIN_STDOUT.get() {
        if let Ok(mut guard) = m.lock() {
            *guard = stdin; // Option<ChildStdin>
        }
    }
    let _ = channel.send(json!({"type": "bridge_spawned", "cwd": cwd, "model": model}));

    let stdout = child.stdout.take().expect("stdout piped");
    let app2 = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let v: serde_json::Value = serde_json::from_str(&l).unwrap_or(json!({"type":"raw","text": l}));
                    let _ = channel.send(v);
                }
                Err(_) => break,
            }
        }
        let _ = app2.emit("bridge-exit", ());
    });
    // keep the child handle so it is not reaped
    std::thread::spawn(move || {
        let _ = child.wait();
    });
}

static STDIN_STDOUT: std::sync::OnceLock<Mutex<Option<std::process::ChildStdin>>> = std::sync::OnceLock::new();

#[tauri::command]
fn bridge_write(data: String) {
    if let Some(m) = STDIN_STDOUT.get() {
        if let Ok(mut guard) = m.lock() {
            if let Some(stdin) = guard.as_mut() {
                let _ = stdin.write_all(data.as_bytes());
                let _ = stdin.flush();
                return;
            }
        }
    }
    eprintln!("bridge_write: no active sidecar stdin");
}

fn main() {
    let _ = STDIN_STDOUT.set(Mutex::new(None));
    tauri::Builder::default()
        .manage(Bridge(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![bridge_start, bridge_write])
        .run(tauri::generate_context!())
        .expect("error while running vexa gui");
}
