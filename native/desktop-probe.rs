//! Read-only UDA appearance bridge. Built inside the pinned SDK workspace in Actions.
//! No arguments, network access, configuration writes or session/power operations.
use uda_core::appearance::AppearanceManager;
use uda_core::capability::{Capability, Theme};
use uda_platform_windows::appearance::WindowsAppearanceManager;

fn theme_json(theme: Option<Theme>) -> &'static str {
    match theme {
        Some(Theme::Light) => "\"light\"",
        Some(Theme::Dark) => "\"dark\"",
        _ => "null",
    }
}

fn main() {
    if std::env::args_os().len() != 1 {
        std::process::exit(2);
    }
    let appearance = WindowsAppearanceManager::new();
    let caps = match appearance.capabilities() {
        Ok(caps) => caps,
        Err(_) => Capability::empty(),
    };
    let theme = if caps.contains(Capability::DETECT_THEME) {
        appearance.detect_theme().ok()
    } else {
        None
    };
    let accent = if caps.contains(Capability::READ_ACCENT_COLOR) {
        appearance.get_accent_color().ok()
    } else {
        None
    };
    let accent_json = match accent {
        Some(color) => format!("[{}, {}, {}, {}]", color.r, color.g, color.b, color.a),
        None => "null".to_string(),
    };
    // Every interpolated value is an enum, boolean or byte. No external text is
    // interpolated into JSON, and unavailable reads remain null, never guessed.
    println!(
        "{{\"schema\":1,\"sdk\":\"UniDesktop/SDK\",\"revision\":\"a74bd2cf372efad2407d6be4b57739e682cf1d9a\",\"platform\":\"windows\",\"theme\":{},\"accent\":{},\"capabilities\":{{\"detectTheme\":{},\"readAccent\":{}}}}}",
        theme_json(theme), accent_json,
        caps.contains(Capability::DETECT_THEME),
        caps.contains(Capability::READ_ACCENT_COLOR),
    );
}
