use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize)]
pub enum AppError {
    Io(String),
    Json(String),
    Database(String),
    Command(String),
    NotFound(String),
    InvalidInput(String),
    Internal(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Io(msg) => write!(f, "IO error: {}", msg),
            AppError::Json(msg) => write!(f, "JSON error: {}", msg),
            AppError::Database(msg) => write!(f, "Database error: {}", msg),
            AppError::Command(msg) => write!(f, "Command error: {}", msg),
            AppError::NotFound(msg) => write!(f, "Not found: {}", msg),
            AppError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            AppError::Internal(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Json(e.to_string())
    }
}

// Convert AppError to String for Tauri command compatibility
impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}
