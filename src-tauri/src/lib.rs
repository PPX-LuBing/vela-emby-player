use base64::Engine;
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_int, c_ulonglong, c_void};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::window::WindowBuilder;
use tauri::{Manager, Window, WindowEvent};

const SECURE_STORAGE_SERVICE: &str = "app.vela.emby-player";
const SECURE_STORAGE_ACCOUNTS_KEY: &str = "accounts";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MpvPlayRequest {
    url: String,
    title: Option<String>,
    mpv_path: Option<String>,
    headers: Vec<HttpHeader>,
    start_position_seconds: Option<f64>,
    audio_stream_index: Option<i64>,
    subtitle_stream_index: Option<i64>,
    subtitle_url: Option<String>,
    embed_bounds: Option<EmbeddedPlayerBounds>,
    render_mode: Option<PlayerRenderMode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpHeader {
    name: String,
    value: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddedPlayerBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum PlayerCommand {
    TogglePause,
    Stop,
    ToggleFullscreen,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum PlayerRenderMode {
    EmbeddedWindow,
    SoftwareCanvas,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MpvPlayResponse {
    pid: u32,
    engine: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderFrameRequest {
    width: u32,
    height: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderFrameResponse {
    width: u32,
    height: u32,
    stride: usize,
    rgba_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerDiagnostics {
    render_mode: String,
    path: Option<String>,
    video_codec: Option<String>,
    audio_codec: Option<String>,
    position: Option<f64>,
    duration: Option<f64>,
    vo_configured: Option<bool>,
    pause: Option<bool>,
    idle_active: Option<bool>,
    core_idle: Option<bool>,
    volume: Option<f64>,
    events: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerEngineStatus {
    libmpv_available: bool,
    libmpv_path: Option<String>,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecureStoragePayload {
    value: Option<String>,
}

#[derive(Default)]
struct PlayerState {
    libmpv: Mutex<Option<LibMpvPlayer>>,
}

type MpvHandle = *mut c_void;
type MpvCreate = unsafe extern "C" fn() -> MpvHandle;
type MpvInitialize = unsafe extern "C" fn(MpvHandle) -> c_int;
type MpvTerminateDestroy = unsafe extern "C" fn(MpvHandle);
type MpvSetOptionString = unsafe extern "C" fn(MpvHandle, *const c_char, *const c_char) -> c_int;
type MpvCommand = unsafe extern "C" fn(MpvHandle, *const *const c_char) -> c_int;
type MpvErrorString = unsafe extern "C" fn(c_int) -> *const c_char;
type MpvGetProperty = unsafe extern "C" fn(MpvHandle, *const c_char, c_int, *mut c_void) -> c_int;
type MpvFree = unsafe extern "C" fn(*mut c_void);
type MpvWaitEvent = unsafe extern "C" fn(MpvHandle, c_double) -> *mut MpvEvent;
type MpvEventName = unsafe extern "C" fn(c_int) -> *const c_char;
type MpvRenderContext = *mut c_void;
type MpvRenderContextCreate =
    unsafe extern "C" fn(*mut MpvRenderContext, MpvHandle, *mut MpvRenderParam) -> c_int;
type MpvRenderContextUpdate = unsafe extern "C" fn(MpvRenderContext) -> c_ulonglong;
type MpvRenderContextRender = unsafe extern "C" fn(MpvRenderContext, *mut MpvRenderParam) -> c_int;
type MpvRenderContextFree = unsafe extern "C" fn(MpvRenderContext);

const MPV_RENDER_PARAM_INVALID: c_int = 0;
const MPV_RENDER_PARAM_API_TYPE: c_int = 1;
const MPV_RENDER_PARAM_SW_SIZE: c_int = 17;
const MPV_RENDER_PARAM_SW_FORMAT: c_int = 18;
const MPV_RENDER_PARAM_SW_STRIDE: c_int = 19;
const MPV_RENDER_PARAM_SW_POINTER: c_int = 20;
const MPV_FORMAT_STRING: c_int = 1;
const MPV_FORMAT_FLAG: c_int = 3;
const MPV_FORMAT_DOUBLE: c_int = 5;
const MPV_EVENT_NONE: c_int = 0;

#[repr(C)]
struct MpvRenderParam {
    param_type: c_int,
    data: *mut c_void,
}

#[repr(C)]
struct MpvEvent {
    event_id: c_int,
    error: c_int,
    reply_userdata: u64,
    data: *mut c_void,
}

struct LibMpvApi {
    _library: libloading::Library,
    create: MpvCreate,
    initialize: MpvInitialize,
    terminate_destroy: MpvTerminateDestroy,
    set_option_string: MpvSetOptionString,
    command: MpvCommand,
    error_string: MpvErrorString,
    get_property: MpvGetProperty,
    free: MpvFree,
    wait_event: MpvWaitEvent,
    event_name: MpvEventName,
    render_context_create: MpvRenderContextCreate,
    render_context_update: MpvRenderContextUpdate,
    render_context_render: MpvRenderContextRender,
    render_context_free: MpvRenderContextFree,
}

struct LibMpvPlayer {
    api: LibMpvApi,
    handle: MpvHandle,
    render_context: Option<MpvRenderContext>,
    render_mode: PlayerRenderMode,
    recent_events: Vec<String>,
}

unsafe impl Send for LibMpvPlayer {}

impl Drop for LibMpvPlayer {
    fn drop(&mut self) {
        unsafe {
            if let Some(render_context) = self.render_context.take() {
                (self.api.render_context_free)(render_context);
            }
            (self.api.terminate_destroy)(self.handle);
        }
    }
}

#[tauri::command]
fn play_media(
    app: tauri::AppHandle,
    state: tauri::State<PlayerState>,
    request: MpvPlayRequest,
) -> Result<MpvPlayResponse, String> {
    if request.render_mode == Some(PlayerRenderMode::SoftwareCanvas) {
        return play_with_libmpv(&app, &state, &request);
    }

    match play_with_libmpv(&app, &state, &request) {
        Ok(response) => Ok(response),
        Err(libmpv_error) => {
            let mut response = play_with_sidecar_mpv(app, request)?;
            response.engine = format!("sidecar-mpv (libmpv unavailable: {libmpv_error})");
            Ok(response)
        }
    }
}

#[tauri::command]
fn play_with_mpv(app: tauri::AppHandle, request: MpvPlayRequest) -> Result<MpvPlayResponse, String> {
    play_with_sidecar_mpv(app, request)
}

#[tauri::command]
fn set_player_bounds(app: tauri::AppHandle, bounds: EmbeddedPlayerBounds) -> Result<(), String> {
    if let Some(window) = app.get_window("video-player") {
        apply_player_bounds(&window, bounds)?;
    }
    Ok(())
}

#[tauri::command]
fn render_player_frame(
    state: tauri::State<PlayerState>,
    request: RenderFrameRequest,
) -> Result<RenderFrameResponse, String> {
    let mut guard = state
        .libmpv
        .lock()
        .map_err(|_| "libmpv 状态锁定失败".to_string())?;
    let player = guard
        .as_mut()
        .ok_or_else(|| "当前没有 libmpv 渲染会话".to_string())?;

    player.render_frame(request)
}

#[tauri::command]
fn player_diagnostics(state: tauri::State<PlayerState>) -> Result<PlayerDiagnostics, String> {
    let mut guard = state
        .libmpv
        .lock()
        .map_err(|_| "libmpv 状态锁定失败".to_string())?;
    let player = guard
        .as_mut()
        .ok_or_else(|| "当前没有 libmpv 播放会话".to_string())?;

    Ok(player.diagnostics())
}

#[tauri::command]
fn seek_player(state: tauri::State<PlayerState>, seconds: f64) -> Result<(), String> {
    let mut guard = state
        .libmpv
        .lock()
        .map_err(|_| "libmpv 状态锁定失败".to_string())?;
    let player = guard
        .as_mut()
        .ok_or_else(|| "当前没有可控制的 libmpv 播放会话".to_string())?;
    player.command(&["seek", &seconds.max(0.0).to_string(), "absolute"])
}

#[tauri::command]
fn set_player_volume(state: tauri::State<PlayerState>, volume: f64) -> Result<(), String> {
    let mut guard = state
        .libmpv
        .lock()
        .map_err(|_| "libmpv 状态锁定失败".to_string())?;
    let player = guard
        .as_mut()
        .ok_or_else(|| "当前没有可控制的 libmpv 播放会话".to_string())?;
    player.command(&["set", "volume", &volume.clamp(0.0, 100.0).to_string()])
}

#[tauri::command]
fn control_player(
    app: tauri::AppHandle,
    state: tauri::State<PlayerState>,
    command: PlayerCommand,
) -> Result<(), String> {
    let mut guard = state
        .libmpv
        .lock()
        .map_err(|_| "libmpv 状态锁定失败".to_string())?;
    let player = guard
        .as_mut()
        .ok_or_else(|| "当前没有可控制的 libmpv 播放会话".to_string())?;

    match command {
        PlayerCommand::TogglePause => player.command(&["cycle", "pause"]),
        PlayerCommand::Stop => {
            player.command(&["stop"])?;
            if let Some(window) = app.get_window("video-player") {
                let _ = window.hide();
            }
            Ok(())
        }
        PlayerCommand::ToggleFullscreen => player.command(&["cycle", "fullscreen"]),
    }
}

#[tauri::command]
fn player_engine_status(app: tauri::AppHandle) -> PlayerEngineStatus {
    match resolve_libmpv_path(&app) {
        Ok(path) => match unsafe { libloading::Library::new(&path) } {
            Ok(_) => PlayerEngineStatus {
                libmpv_available: true,
                libmpv_path: Some(path.display().to_string()),
                message: "libmpv runtime 可用".to_string(),
            },
            Err(error) => PlayerEngineStatus {
                libmpv_available: false,
                libmpv_path: Some(path.display().to_string()),
                message: format!("libmpv 无法加载：{error}"),
            },
        },
        Err(error) => PlayerEngineStatus {
            libmpv_available: false,
            libmpv_path: None,
            message: error,
        },
    }
}

#[tauri::command]
fn read_secure_accounts() -> Result<SecureStoragePayload, String> {
    match keyring_entry(SECURE_STORAGE_ACCOUNTS_KEY).get_password() {
        Ok(value) => Ok(SecureStoragePayload { value: Some(value) }),
        Err(keyring::Error::NoEntry) => Ok(SecureStoragePayload { value: None }),
        Err(error) => Err(format!("读取系统安全存储失败：{error}")),
    }
}

#[tauri::command]
fn write_secure_accounts(value: String) -> Result<(), String> {
    keyring_entry(SECURE_STORAGE_ACCOUNTS_KEY)
        .set_password(&value)
        .map_err(|error| format!("写入系统安全存储失败：{error}"))
}

#[tauri::command]
fn delete_secure_accounts() -> Result<(), String> {
    match keyring_entry(SECURE_STORAGE_ACCOUNTS_KEY).delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("删除系统安全存储失败：{error}")),
    }
}

fn keyring_entry(key: &str) -> keyring::Entry {
    keyring::Entry::new(SECURE_STORAGE_SERVICE, key)
        .expect("static keyring service/account values should be valid")
}

fn play_with_sidecar_mpv(app: tauri::AppHandle, request: MpvPlayRequest) -> Result<MpvPlayResponse, String> {
    let mpv_path = resolve_mpv_path(&app, request.mpv_path.as_deref())?;

    let mut command = Command::new(mpv_path);
    command
        .arg("--force-window=yes")
        .arg("--no-terminal")
        .arg("--keep-open=no")
        .arg("--idle=no");

    if let Some(title) = request.title.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        command.arg(format!("--title={title}"));
    }

    if let Some(seconds) = request.start_position_seconds.filter(|value| *value > 0.0) {
        command.arg(format!("--start={seconds}"));
    }

    if let Some(audio_stream_index) = request.audio_stream_index {
        command.arg(format!("--aid={audio_stream_index}"));
    }

    if let Some(subtitle_stream_index) = request.subtitle_stream_index {
        command.arg(format!("--sid={subtitle_stream_index}"));
    } else {
        command.arg("--sid=no");
    }

    if let Some(user_agent) = user_agent_from_headers(&request.headers) {
        command.arg(format!("--user-agent={user_agent}"));
    }

    for header in request.headers {
        let name = header.name.trim();
        let value = header.value.trim();
        if !name.eq_ignore_ascii_case("User-Agent") && !name.is_empty() && !value.is_empty() {
            command.arg(format!("--http-header-fields={name}: {value}"));
        }
    }

    if let Some(subtitle_url) = request
        .subtitle_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        command.arg(format!("--sub-file={subtitle_url}"));
    }

    command.arg(request.url);

    let child = command
        .spawn()
        .map_err(|error| format!("无法启动 mpv：{error}"))?;

    Ok(MpvPlayResponse {
        pid: child.id(),
        engine: "sidecar-mpv".to_string(),
    })
}

fn user_agent_from_headers(headers: &[HttpHeader]) -> Option<String> {
    headers.iter().find_map(|header| {
        let name = header.name.trim();
        let value = header.value.trim();
        (name.eq_ignore_ascii_case("User-Agent") && !value.is_empty()).then(|| value.to_string())
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PlayerState::default())
        .invoke_handler(tauri::generate_handler![
            play_media,
            play_with_mpv,
            set_player_bounds,
            render_player_frame,
            player_diagnostics,
            seek_player,
            set_player_volume,
            control_player,
            player_engine_status,
            read_secure_accounts,
            write_secure_accounts,
            delete_secure_accounts
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}

fn play_with_libmpv(
    app: &tauri::AppHandle,
    state: &tauri::State<PlayerState>,
    request: &MpvPlayRequest,
) -> Result<MpvPlayResponse, String> {
    let mut guard = state
        .libmpv
        .lock()
        .map_err(|_| "libmpv 状态锁定失败".to_string())?;

    let requested_mode = request.render_mode.unwrap_or(PlayerRenderMode::EmbeddedWindow);
    let needs_recreate = guard
        .as_ref()
        .is_some_and(|player| player.render_mode != requested_mode);

    if needs_recreate {
        *guard = None;
    }

    if guard.is_none() {
        *guard = Some(LibMpvPlayer::new(app, request.embed_bounds, requested_mode)?);
    } else if let Some(bounds) = request.embed_bounds {
        if let Some(window) = app.get_window("video-player") {
            apply_player_bounds(&window, bounds)?;
        }
    }

    let player = guard
        .as_mut()
        .ok_or_else(|| "libmpv 初始化失败".to_string())?;
    player.play(request)?;
    player.drain_events();

    Ok(MpvPlayResponse {
        pid: 0,
        engine: match requested_mode {
            PlayerRenderMode::EmbeddedWindow => "libmpv-wid".to_string(),
            PlayerRenderMode::SoftwareCanvas => "libmpv-render-sw".to_string(),
        },
    })
}

impl LibMpvPlayer {
    fn new(
        app: &tauri::AppHandle,
        bounds: Option<EmbeddedPlayerBounds>,
        render_mode: PlayerRenderMode,
    ) -> Result<Self, String> {
        let api = LibMpvApi::load(app)?;
        let handle = unsafe { (api.create)() };
        if handle.is_null() {
            return Err("mpv_create 返回空指针".to_string());
        }

        let mut player = Self {
            api,
            handle,
            render_context: None,
            render_mode,
            recent_events: Vec::new(),
        };
        player.configure_output(app, bounds)?;
        player.set_option("terminal", "no")?;
        player.set_option("idle", "yes")?;
        player.set_option("keep-open", "no")?;
        player.check(unsafe { (player.api.initialize)(player.handle) })?;
        player.create_render_context_if_needed()?;
        Ok(player)
    }

    fn configure_output(
        &self,
        app: &tauri::AppHandle,
        bounds: Option<EmbeddedPlayerBounds>,
    ) -> Result<(), String> {
        match self.render_mode {
            PlayerRenderMode::EmbeddedWindow => {
                if let Some(wid) = resolve_player_window_id(app, bounds)? {
                    self.set_option("wid", &wid)?;
                } else {
                    self.set_option("force-window", "yes")?;
                }
            }
            PlayerRenderMode::SoftwareCanvas => {
                self.set_option("vo", "libmpv")?;
                self.set_option("video-timing-offset", "0")?;
                if let Some(window) = app.get_window("video-player") {
                    let _ = window.hide();
                }
            }
        }

        Ok(())
    }

    fn create_render_context_if_needed(&mut self) -> Result<(), String> {
        if self.render_mode != PlayerRenderMode::SoftwareCanvas {
            return Ok(());
        }

        let mut context: MpvRenderContext = std::ptr::null_mut();
        let api_type = CString::new("sw").map_err(|_| "render API type 包含空字节".to_string())?;
        let mut params = [
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_API_TYPE,
                data: api_type.as_ptr() as *mut c_void,
            },
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_INVALID,
                data: std::ptr::null_mut(),
            },
        ];

        self.check(unsafe {
            (self.api.render_context_create)(&mut context, self.handle, params.as_mut_ptr())
        })?;

        if context.is_null() {
            return Err("mpv_render_context_create 返回空指针".to_string());
        }

        self.render_context = Some(context);

        Ok(())
    }

    fn render_frame(&mut self, request: RenderFrameRequest) -> Result<RenderFrameResponse, String> {
        if self.render_mode != PlayerRenderMode::SoftwareCanvas {
            return Err("当前播放器不是 software canvas 渲染模式".to_string());
        }

        let context = self
            .render_context
            .ok_or_else(|| "libmpv render context 尚未初始化".to_string())?;
        let width = request.width.clamp(2, 1280);
        let height = request.height.clamp(2, 720);
        let stride = width as usize * 4;
        let mut pixels = vec![0_u8; stride * height as usize];
        let mut size = [width as c_int, height as c_int];
        let format = CString::new("rgb0").map_err(|_| "render format 包含空字节".to_string())?;
        let mut stride_value = stride;

        unsafe {
            (self.api.render_context_update)(context);
        }

        let mut params = [
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_SW_SIZE,
                data: size.as_mut_ptr() as *mut c_void,
            },
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_SW_FORMAT,
                data: format.as_ptr() as *mut c_void,
            },
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_SW_STRIDE,
                data: (&mut stride_value as *mut usize).cast(),
            },
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_SW_POINTER,
                data: pixels.as_mut_ptr().cast(),
            },
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_INVALID,
                data: std::ptr::null_mut(),
            },
        ];

        self.check(unsafe { (self.api.render_context_render)(context, params.as_mut_ptr()) })?;
        self.drain_events();

        Ok(RenderFrameResponse {
            width,
            height,
            stride,
            rgba_base64: base64::engine::general_purpose::STANDARD.encode(pixels),
        })
    }

    fn diagnostics(&mut self) -> PlayerDiagnostics {
        self.drain_events();

        PlayerDiagnostics {
            render_mode: match self.render_mode {
                PlayerRenderMode::EmbeddedWindow => "embeddedWindow".to_string(),
                PlayerRenderMode::SoftwareCanvas => "softwareCanvas".to_string(),
            },
            path: self.get_property_string("path"),
            video_codec: self.get_property_string("video-codec"),
            audio_codec: self.get_property_string("audio-codec"),
            position: self.get_property_double("time-pos"),
            duration: self.get_property_double("duration"),
            vo_configured: self.get_property_flag("vo-configured"),
            pause: self.get_property_flag("pause"),
            idle_active: self.get_property_flag("idle-active"),
            core_idle: self.get_property_flag("core-idle"),
            volume: self.get_property_double("volume"),
            events: self.recent_events.clone(),
        }
    }

    fn drain_events(&mut self) {
        loop {
            let event = unsafe { (self.api.wait_event)(self.handle, 0.0) };
            if event.is_null() {
                break;
            }

            let event = unsafe { &*event };
            if event.event_id == MPV_EVENT_NONE {
                break;
            }

            let name = unsafe {
                let ptr = (self.api.event_name)(event.event_id);
                if ptr.is_null() {
                    format!("event-{}", event.event_id)
                } else {
                    CStr::from_ptr(ptr).to_string_lossy().into_owned()
                }
            };
            let item = if event.error < 0 {
                format!("{name}: {}", self.error_message(event.error))
            } else {
                name
            };

            self.recent_events.push(item);
            if self.recent_events.len() > 20 {
                self.recent_events.remove(0);
            }
        }
    }

    fn get_property_string(&self, name: &str) -> Option<String> {
        let name = CString::new(name).ok()?;
        let mut value: *mut c_char = std::ptr::null_mut();
        let code = unsafe {
            (self.api.get_property)(
                self.handle,
                name.as_ptr(),
                MPV_FORMAT_STRING,
                (&mut value as *mut *mut c_char).cast(),
            )
        };
        if code < 0 || value.is_null() {
            return None;
        }

        let result = unsafe { CStr::from_ptr(value).to_string_lossy().into_owned() };
        unsafe {
            (self.api.free)(value.cast());
        }
        Some(result)
    }

    fn get_property_flag(&self, name: &str) -> Option<bool> {
        let name = CString::new(name).ok()?;
        let mut value: c_int = 0;
        let code = unsafe {
            (self.api.get_property)(
                self.handle,
                name.as_ptr(),
                MPV_FORMAT_FLAG,
                (&mut value as *mut c_int).cast(),
            )
        };
        (code >= 0).then_some(value != 0)
    }

    fn get_property_double(&self, name: &str) -> Option<f64> {
        let name = CString::new(name).ok()?;
        let mut value: c_double = 0.0;
        let code = unsafe {
            (self.api.get_property)(
                self.handle,
                name.as_ptr(),
                MPV_FORMAT_DOUBLE,
                (&mut value as *mut c_double).cast(),
            )
        };
        (code >= 0).then_some(value)
    }

    fn play(&mut self, request: &MpvPlayRequest) -> Result<(), String> {
        if let Some(title) = request.title.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            self.set_option("title", title)?;
        }

        if let Some(seconds) = request.start_position_seconds.filter(|value| *value > 0.0) {
            self.set_option("start", &seconds.to_string())?;
        }

        if let Some(audio_stream_index) = request.audio_stream_index {
            self.set_option("aid", &audio_stream_index.to_string())?;
        }

        if let Some(subtitle_stream_index) = request.subtitle_stream_index {
            self.set_option("sid", &subtitle_stream_index.to_string())?;
        } else {
            self.set_option("sid", "no")?;
        }

        if let Some(user_agent) = user_agent_from_headers(&request.headers) {
            self.set_option("user-agent", &user_agent)?;
        }

        let headers = request
            .headers
            .iter()
            .filter_map(|header| {
                let name = header.name.trim();
                let value = header.value.trim();
                (!name.eq_ignore_ascii_case("User-Agent") && !name.is_empty() && !value.is_empty())
                    .then(|| format!("{name}: {value}"))
            })
            .collect::<Vec<_>>()
            .join(",");
        if !headers.is_empty() {
            self.set_option("http-header-fields", &headers)?;
        }

        self.command(&["loadfile", request.url.as_str(), "replace"])?;

        if let Some(subtitle_url) = request
            .subtitle_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            self.command(&["sub-add", subtitle_url, "select"])?;
        }

        Ok(())
    }

    fn set_option(&self, name: &str, value: &str) -> Result<(), String> {
        let name = CString::new(name).map_err(|_| "libmpv option name 包含空字节".to_string())?;
        let value = CString::new(value).map_err(|_| "libmpv option value 包含空字节".to_string())?;
        let code = unsafe { (self.api.set_option_string)(self.handle, name.as_ptr(), value.as_ptr()) };
        if code >= 0 {
            return Ok(());
        }

        Err(format!(
            "设置 mpv option {}={} 失败：{}",
            name.to_string_lossy(),
            value.to_string_lossy(),
            self.error_message(code),
        ))
    }

    fn command(&self, args: &[&str]) -> Result<(), String> {
        let c_args = args
            .iter()
            .map(|arg| CString::new(*arg).map_err(|_| "libmpv command 参数包含空字节".to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        let mut ptrs = c_args.iter().map(|arg| arg.as_ptr()).collect::<Vec<_>>();
        ptrs.push(std::ptr::null());
        self.check(unsafe { (self.api.command)(self.handle, ptrs.as_ptr()) })
    }

    fn check(&self, code: c_int) -> Result<(), String> {
        if code >= 0 {
            return Ok(());
        }

        let message = self.error_message(code);
        Err(message)
    }

    fn error_message(&self, code: c_int) -> String {
        unsafe {
            let ptr = (self.api.error_string)(code);
            if ptr.is_null() {
                format!("libmpv error {code}")
            } else {
                CStr::from_ptr(ptr).to_string_lossy().into_owned()
            }
        }
    }
}

impl LibMpvApi {
    fn load(app: &tauri::AppHandle) -> Result<Self, String> {
        let path = resolve_libmpv_path(app)?;
        let library = unsafe { libloading::Library::new(&path) }
            .map_err(|error| format!("无法加载 libmpv {}：{error}", path.display()))?;

        unsafe {
            let create = *library.get::<MpvCreate>(b"mpv_create\0").map_err(|error| error.to_string())?;
            let initialize = *library.get::<MpvInitialize>(b"mpv_initialize\0").map_err(|error| error.to_string())?;
            let terminate_destroy = *library
                .get::<MpvTerminateDestroy>(b"mpv_terminate_destroy\0")
                .map_err(|error| error.to_string())?;
            let set_option_string = *library
                .get::<MpvSetOptionString>(b"mpv_set_option_string\0")
                .map_err(|error| error.to_string())?;
            let command = *library.get::<MpvCommand>(b"mpv_command\0").map_err(|error| error.to_string())?;
            let error_string = *library
                .get::<MpvErrorString>(b"mpv_error_string\0")
                .map_err(|error| error.to_string())?;
            let get_property = *library
                .get::<MpvGetProperty>(b"mpv_get_property\0")
                .map_err(|error| error.to_string())?;
            let free = *library
                .get::<MpvFree>(b"mpv_free\0")
                .map_err(|error| error.to_string())?;
            let wait_event = *library
                .get::<MpvWaitEvent>(b"mpv_wait_event\0")
                .map_err(|error| error.to_string())?;
            let event_name = *library
                .get::<MpvEventName>(b"mpv_event_name\0")
                .map_err(|error| error.to_string())?;
            let render_context_create = *library
                .get::<MpvRenderContextCreate>(b"mpv_render_context_create\0")
                .map_err(|error| error.to_string())?;
            let render_context_update = *library
                .get::<MpvRenderContextUpdate>(b"mpv_render_context_update\0")
                .map_err(|error| error.to_string())?;
            let render_context_render = *library
                .get::<MpvRenderContextRender>(b"mpv_render_context_render\0")
                .map_err(|error| error.to_string())?;
            let render_context_free = *library
                .get::<MpvRenderContextFree>(b"mpv_render_context_free\0")
                .map_err(|error| error.to_string())?;

            Ok(Self {
                _library: library,
                create,
                initialize,
                terminate_destroy,
                set_option_string,
                command,
                error_string,
                get_property,
                free,
                wait_event,
                event_name,
                render_context_create,
                render_context_update,
                render_context_render,
                render_context_free,
            })
        }
    }
}

fn resolve_mpv_path(app: &tauri::AppHandle, configured_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = configured_path.map(str::trim).filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(path));
    }

    for candidate in bundled_mpv_candidates(app) {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Ok(PathBuf::from("mpv"))
}

fn resolve_libmpv_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    for candidate in bundled_libmpv_candidates(app) {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    #[cfg(target_os = "macos")]
    {
        for candidate in [
            "/opt/homebrew/lib/libmpv.dylib",
            "/opt/homebrew/opt/mpv/lib/libmpv.dylib",
            "/usr/local/lib/libmpv.dylib",
            "/usr/local/opt/mpv/lib/libmpv.dylib",
        ] {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Ok(path);
            }
        }

        Ok(PathBuf::from("libmpv.dylib"))
    }

    #[cfg(target_os = "windows")]
    {
        Ok(PathBuf::from("mpv-2.dll"))
    }

    #[cfg(target_os = "linux")]
    {
        Ok(PathBuf::from("libmpv.so.2"))
    }
}

fn bundled_libmpv_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.extend(platform_libmpv_candidates(resource_dir.join("vendor").join("libmpv")));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.extend(platform_libmpv_candidates(
            current_dir.join("src-tauri").join("vendor").join("libmpv"),
        ));
        candidates.extend(platform_libmpv_candidates(current_dir.join("vendor").join("libmpv")));
    }

    candidates
}

fn bundled_mpv_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.extend(platform_candidates(resource_dir.join("vendor").join("mpv")));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.extend(platform_candidates(current_dir.join("src-tauri").join("vendor").join("mpv")));
        candidates.extend(platform_candidates(current_dir.join("vendor").join("mpv")));
    }

    candidates
}

fn resolve_player_window_id(
    app: &tauri::AppHandle,
    bounds: Option<EmbeddedPlayerBounds>,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let window = player_window(app, bounds)?;
        let ns_view = window
            .ns_view()
            .map_err(|error| format!("无法获取播放器 NSView：{error}"))?;
        return Ok(Some((ns_view as usize).to_string()));
    }

    #[cfg(target_os = "windows")]
    {
        let window = player_window(app, bounds)?;
        let hwnd = window.hwnd().map_err(|error| format!("无法获取播放器 HWND：{error}"))?;
        return Ok(Some((hwnd.0 as usize).to_string()));
    }

    #[cfg(target_os = "linux")]
    {
        Ok(None)
    }
}

fn player_window(app: &tauri::AppHandle, bounds: Option<EmbeddedPlayerBounds>) -> Result<Window, String> {
    const PLAYER_LABEL: &str = "video-player";

    if let Some(window) = app.get_window(PLAYER_LABEL) {
        if let Some(bounds) = bounds {
            apply_player_bounds(&window, bounds)?;
        }
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(window);
    }

    let mut builder = WindowBuilder::new(app, PLAYER_LABEL)
        .title("Vela Player")
        .min_inner_size(720.0, 405.0)
        .decorations(false)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .visible(false);

    if let Some(parent) = app.get_window("main") {
        builder = builder
            .parent(&parent)
            .map_err(|error| format!("无法绑定播放器父窗口：{error}"))?;
    }

    builder = if let Some(bounds) = bounds {
        builder
            .position(bounds.x, bounds.y)
            .inner_size(bounds.width, bounds.height)
    } else {
        builder.inner_size(1280.0, 720.0).center()
    };

    let window = builder
        .build()
        .map_err(|error| format!("无法创建播放器窗口：{error}"))?;

    let close_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = close_window.hide();
        }
    });

    Ok(window)
}

fn apply_player_bounds(window: &Window, bounds: EmbeddedPlayerBounds) -> Result<(), String> {
    let width = bounds.width.max(320.0);
    let height = bounds.height.max(180.0);

    window
        .set_position(tauri::LogicalPosition::new(bounds.x, bounds.y))
        .map_err(|error| format!("无法移动播放器窗口：{error}"))?;
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|error| format!("无法调整播放器窗口尺寸：{error}"))?;
    Ok(())
}

fn platform_candidates(base: PathBuf) -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        vec![
            base.join("macos").join("mpv.app").join("Contents").join("MacOS").join("mpv"),
            base.join("macos").join("mpv"),
        ]
    }

    #[cfg(target_os = "windows")]
    {
        vec![base.join("windows").join("mpv.exe")]
    }

    #[cfg(target_os = "linux")]
    {
        vec![base.join("linux").join("mpv")]
    }
}

fn platform_libmpv_candidates(base: PathBuf) -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        vec![
            base.join("macos").join("libmpv.dylib"),
            base.join("macos").join("lib").join("libmpv.dylib"),
        ]
    }

    #[cfg(target_os = "windows")]
    {
        vec![base.join("windows").join("mpv-2.dll")]
    }

    #[cfg(target_os = "linux")]
    {
        vec![base.join("linux").join("libmpv.so.2"), base.join("linux").join("libmpv.so")]
    }
}
