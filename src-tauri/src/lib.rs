use std::sync::Mutex;
use tauri::{async_runtime, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

// 从 sidecar 的一行 stdout 里解析 "PORT=<n>"。纯函数,便于单测。
fn parse_port_line(line: &str) -> Option<u16> {
    line.trim().strip_prefix("PORT=")?.parse::<u16>().ok()
}

#[derive(Default)]
struct EnginePort(Mutex<Option<u16>>);

// webview 调用以拿到 engine 的 WS 地址;端口尚未从 sidecar stdout 解析到时返回 Err,
// 前端会退避重试(见 web/engine-url.ts)。
#[tauri::command]
fn engine_url(state: State<EnginePort>) -> Result<String, String> {
    match *state.0.lock().map_err(|e| e.to_string())? {
        Some(port) => Ok(format!("ws://127.0.0.1:{port}")),
        None => Err("engine not ready".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(EnginePort::default())
        .invoke_handler(tauri::generate_handler![engine_url])
        .setup(|app| {
            let handle = app.handle().clone();

            let mut cmd = app
                .shell()
                .sidecar("roguent-engine")
                .expect("sidecar 'roguent-engine' 缺失(先跑 build-sidecar)");

            // CLI 资源:.app 内 resources/claude 存在则经 env 传给 sidecar
            //(SDK 用作 pathToClaudeCodeExecutable);dev 无资源则回落 SDK 默认解析。
            if let Ok(dir) = app.path().resource_dir() {
                let cli = dir.join("claude");
                if cli.exists() {
                    cmd = cmd.env("ROGUENT_CLI_PATH", cli.to_string_lossy().to_string());
                }
            }
            // 回放透传:host 环境设了 ROGUENT_REPLAY 就转给 sidecar(零额度验证渲染)。
            if let Ok(replay) = std::env::var("ROGUENT_REPLAY") {
                cmd = cmd.env("ROGUENT_REPLAY", replay);
            }

            let (mut rx, _child) = cmd.spawn().expect("spawn sidecar 失败");

            async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(bytes) = event {
                        let line = String::from_utf8_lossy(&bytes);
                        if let Some(port) = parse_port_line(&line) {
                            *handle.state::<EnginePort>().0.lock().unwrap() = Some(port);
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::parse_port_line;

    #[test]
    fn parses_valid_port_line() {
        assert_eq!(parse_port_line("PORT=54321"), Some(54321));
        assert_eq!(parse_port_line("  PORT=8787\n"), Some(8787));
    }

    #[test]
    fn rejects_non_port_lines() {
        assert_eq!(parse_port_line("[server] LIVE"), None);
        assert_eq!(parse_port_line("PORT="), None);
        assert_eq!(parse_port_line("PORT=notanumber"), None);
        assert_eq!(parse_port_line("PORT=99999999"), None); // 超出 u16
    }
}
