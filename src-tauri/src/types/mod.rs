//! Type definitions for RustService
//!
//! This module contains all the data structures used throughout the application.

mod program;
mod required_program;
mod script;
mod service;
mod settings;
mod system_info;
mod time_tracking;

pub use program::*;
pub use required_program::*;
pub use script::*;
pub use service::*;
pub use settings::*;
pub use system_info::*;
pub use time_tracking::*;
