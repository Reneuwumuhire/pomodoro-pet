//! Native folder-music playback via `rodio`.
//!
//! Why native and not the WebView? macOS WKWebView can only play media from the
//! document's own `tauri://localhost` origin — asset://, blob:, http://127.0.0.1,
//! custom schemes and MSE all fail. So the user's folder songs (often multi-hundred-
//! MB mixes) can't be streamed in the WebView at all. Decoding here with rodio plays
//! any size at low memory, fully outside the WebView; the UI just sends commands.
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rodio::{Decoder, OutputStream, Sink};

pub enum Cmd {
    /// Replace the playlist and start at `index`.
    Play { tracks: Vec<String>, index: usize },
    Pause,
    Resume,
    Next,
    Prev,
    SetVolume(f32),
    Stop,
}

#[derive(Default, Clone, serde::Serialize)]
pub struct Now {
    pub name: String,
    pub index: usize,
    pub count: usize,
    pub playing: bool,
}

pub struct Player {
    tx: Sender<Cmd>,
    pub now: Arc<Mutex<Now>>,
}

impl Player {
    pub fn new() -> Self {
        let (tx, rx) = channel::<Cmd>();
        let now = Arc::new(Mutex::new(Now::default()));
        let now_thread = now.clone();
        std::thread::Builder::new()
            .name("petomato-music".into())
            .spawn(move || run(rx, now_thread))
            .expect("spawn music thread");
        Player { tx, now }
    }
    pub fn send(&self, cmd: Cmd) {
        let _ = self.tx.send(cmd);
    }
}

fn track_name(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

/// Build a fresh Sink playing `tracks[index]` at `volume`. Returns None on decode error.
fn start(handle: &rodio::OutputStreamHandle, path: &str, volume: f32) -> Option<Sink> {
    let file = File::open(path).ok()?;
    let decoder = Decoder::new(BufReader::new(file)).ok()?;
    let sink = Sink::try_new(handle).ok()?;
    sink.set_volume(volume);
    sink.append(decoder);
    sink.play();
    Some(sink)
}

fn run(rx: Receiver<Cmd>, now: Arc<Mutex<Now>>) {
    // OutputStream must stay alive for the whole thread or audio stops.
    let (_stream, handle) = match OutputStream::try_default() {
        Ok(s) => s,
        Err(_) => return,
    };

    let mut tracks: Vec<String> = Vec::new();
    let mut index: usize = 0;
    let mut volume: f32 = 1.0;
    let mut sink: Option<Sink> = None;
    let mut paused = false;

    let set_now = |now: &Arc<Mutex<Now>>, tracks: &[String], index: usize, playing: bool| {
        let mut n = now.lock().unwrap();
        n.count = tracks.len();
        n.index = index;
        n.name = tracks.get(index).map(|p| track_name(p)).unwrap_or_default();
        n.playing = playing;
    };

    loop {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(Cmd::Play { tracks: t, index: i }) => {
                tracks = t;
                index = if tracks.is_empty() { 0 } else { i.min(tracks.len() - 1) };
                paused = false;
                sink = tracks.get(index).and_then(|p| start(&handle, p, volume));
                set_now(&now, &tracks, index, sink.is_some());
            }
            Ok(Cmd::Pause) => {
                if let Some(s) = &sink {
                    s.pause();
                }
                paused = true;
                set_now(&now, &tracks, index, false);
            }
            Ok(Cmd::Resume) => {
                paused = false;
                if let Some(s) = &sink {
                    s.play();
                    set_now(&now, &tracks, index, true);
                } else if !tracks.is_empty() {
                    sink = tracks.get(index).and_then(|p| start(&handle, p, volume));
                    set_now(&now, &tracks, index, sink.is_some());
                }
            }
            Ok(Cmd::SetVolume(v)) => {
                volume = v.clamp(0.0, 1.0);
                if let Some(s) = &sink {
                    s.set_volume(volume);
                }
            }
            Ok(Cmd::Next) => {
                if !tracks.is_empty() {
                    index = (index + 1) % tracks.len();
                    paused = false;
                    sink = tracks.get(index).and_then(|p| start(&handle, p, volume));
                    set_now(&now, &tracks, index, sink.is_some());
                }
            }
            Ok(Cmd::Prev) => {
                if !tracks.is_empty() {
                    index = (index + tracks.len() - 1) % tracks.len();
                    paused = false;
                    sink = tracks.get(index).and_then(|p| start(&handle, p, volume));
                    set_now(&now, &tracks, index, sink.is_some());
                }
            }
            Ok(Cmd::Stop) => {
                sink = None;
                paused = false;
                set_now(&now, &tracks, index, false);
            }
            Err(RecvTimeoutError::Timeout) => {
                // Auto-advance to the next track when the current one finishes.
                if !paused {
                    if let Some(s) = &sink {
                        if s.empty() && !tracks.is_empty() {
                            index = (index + 1) % tracks.len();
                            sink = tracks.get(index).and_then(|p| start(&handle, p, volume));
                            set_now(&now, &tracks, index, sink.is_some());
                        }
                    }
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}
