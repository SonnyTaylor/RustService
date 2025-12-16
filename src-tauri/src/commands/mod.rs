//! Tauri command handlers
//!
//! This module contains all the Tauri commands exposed to the frontend.

mod bluescreen;
mod data_dir;
mod event_log;
mod network;
mod network_diagnostics;
mod programs;
mod required_programs;
mod scripts;
mod services;
mod settings;
mod shortcuts;
mod startup;
mod system_info;
mod time_tracking;
mod utils;

pub use bluescreen::*;
pub use data_dir::*;
pub use event_log::*;
pub use network::*;
pub use network_diagnostics::*;
pub use programs::*;
pub use required_programs::*;
pub use scripts::*;
pub use services::*;
pub use settings::*;
pub use shortcuts::*;
pub use startup::*;
pub use system_info::*;
pub use time_tracking::*;
pub use utils::*;
