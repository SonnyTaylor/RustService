//! File attachment system

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use chrono::Utc;
use uuid::Uuid;

use super::{get_agent_dir, get_data_dir_path};
use crate::types::{
    compute_checksum, format_file_size, FileAttachment, FileAttachmentMetadata, FileCategory,
    FileSource, FilesystemMetadata, GenerationMetadata, PathValidationResult, UploadMetadata,
    FILE_SIZE_SMALL, MAX_CONTENT_EXTRACTION_SIZE,
};

/// Get the agent files directory
fn get_agent_files_dir() -> PathBuf {
    get_agent_dir().join("files")
}

/// Get the uploaded files directory
fn get_uploaded_files_dir() -> PathBuf {
    get_agent_files_dir().join("uploaded")
}

/// Get the generated files directory
fn get_generated_files_dir() -> PathBuf {
    get_agent_files_dir().join("generated")
}

/// Get the thumbnails directory
fn get_thumbnails_dir() -> PathBuf {
    get_agent_files_dir().join("thumbnails")
}

/// Ensure all file directories exist
fn ensure_file_dirs() -> Result<(), String> {
    let dirs = [
        get_agent_files_dir(),
        get_uploaded_files_dir(),
        get_generated_files_dir(),
        get_thumbnails_dir(),
    ];

    for dir in &dirs {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory {}: {}", dir.display(), e))?;
    }

    Ok(())
}

/// Save metadata sidecar file
fn save_file_metadata(attachment: &FileAttachment) -> Result<(), String> {
    let meta_path = Path::new(&attachment.stored_path).with_extension("meta.json");
    let meta_json = serde_json::to_string_pretty(attachment)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    fs::write(&meta_path, meta_json).map_err(|e| format!("Failed to write metadata: {}", e))?;
    Ok(())
}

/// Load metadata from sidecar file
fn load_file_metadata(stored_path: &str) -> Result<FileAttachment, String> {
    let meta_path = Path::new(stored_path).with_extension("meta.json");
    let meta_json =
        fs::read_to_string(&meta_path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let attachment: FileAttachment =
        serde_json::from_str(&meta_json).map_err(|e| format!("Failed to parse metadata: {}", e))?;
    Ok(attachment)
}

/// Extract text content from file if applicable
fn extract_file_content(
    path: &Path,
    category: &FileCategory,
    max_size: usize,
) -> Result<Option<String>, String> {
    if !category.should_auto_extract() {
        return Ok(None);
    }

    let metadata = fs::metadata(path).map_err(|e| format!("Failed to get file metadata: {}", e))?;

    if metadata.len() > max_size as u64 {
        return Ok(Some(format!(
            "[File too large for content extraction: {}]",
            format_file_size(metadata.len())
        )));
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read file content: {}", e))?;

    Ok(Some(content))
}

/// Save an uploaded file from the frontend
#[tauri::command(rename_all = "snake_case")]
pub fn save_uploaded_file(
    file_name: String,
    mime_type: String,
    _size: u64,
    content_base64: String,
) -> Result<FileAttachment, String> {
    ensure_file_dirs()?;

    // Validate file size
    let content_bytes = base64::engine::general_purpose::STANDARD
        .decode(&content_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    if content_bytes.len() as u64 > FILE_SIZE_SMALL {
        return Err(format!(
            "File too large for direct upload ({}). Use chunked upload for files > 10MB.",
            format_file_size(content_bytes.len() as u64)
        ));
    }

    // Generate IDs and paths
    let id = Uuid::new_v4().to_string();
    let stored_name = id.to_string();
    let stored_path = get_uploaded_files_dir().join(&stored_name);
    let now = Utc::now().to_rfc3339();

    // Determine category and MIME type
    let category = FileCategory::from_extension(&file_name);
    let mime_type = if mime_type.is_empty() {
        match category {
            FileCategory::Text => "text/plain",
            FileCategory::Code => "application/octet-stream",
            FileCategory::Document => "application/octet-stream",
            FileCategory::Image => "image/png",
            FileCategory::Media => "application/octet-stream",
            FileCategory::Binary => "application/octet-stream",
        }
        .to_string()
    } else {
        mime_type
    };

    // Write file
    fs::write(&stored_path, &content_bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    // Compute checksum
    let checksum = compute_checksum(&content_bytes);

    // Extract content if applicable
    let content = extract_file_content(&stored_path, &category, MAX_CONTENT_EXTRACTION_SIZE)?;
    let line_count = content.as_ref().map(|c| c.lines().count() as u32);

    // Create attachment
    let attachment = FileAttachment {
        id: id.clone(),
        source: FileSource::Upload,
        original_name: file_name.clone(),
        stored_name: stored_name.clone(),
        mime_type: mime_type.clone(),
        category: category.clone(),
        size: content_bytes.len() as u64,
        stored_path: stored_path.to_string_lossy().to_string(),
        thumbnail_path: None,
        content: content.clone(),
        encoding: Some("utf-8".to_string()),
        line_count,
        checksum: checksum.clone(),
        uploaded_at: now.clone(),
        expires_at: None,
        metadata: FileAttachmentMetadata {
            upload_metadata: Some(UploadMetadata {
                uploaded_by: "user".to_string(),
                original_path: None,
                auto_extracted: content.is_some(),
            }),
            generation_metadata: None,
            filesystem_metadata: None,
        },
    };

    // Save metadata sidecar
    save_file_metadata(&attachment)?;

    Ok(attachment)
}

/// Generate a file from the agent
#[tauri::command(rename_all = "snake_case")]
pub fn generate_agent_file(
    filename: String,
    content: String,
    description: String,
    mime_type: Option<String>,
    tool_call_id: String,
    approved: bool,
) -> Result<FileAttachment, String> {
    ensure_file_dirs()?;

    // Generate IDs and paths
    let id = Uuid::new_v4().to_string();
    let stored_name = id.to_string();
    let stored_path = get_generated_files_dir().join(&stored_name);
    let now = Utc::now().to_rfc3339();

    // Determine category and MIME type
    let category = FileCategory::from_extension(&filename);
    let mime_type = mime_type.unwrap_or_else(|| match category {
        FileCategory::Text => "text/plain".to_string(),
        FileCategory::Code => "application/octet-stream".to_string(),
        FileCategory::Document => "application/octet-stream".to_string(),
        FileCategory::Image => "image/png".to_string(),
        FileCategory::Media => "application/octet-stream".to_string(),
        FileCategory::Binary => "application/octet-stream".to_string(),
    });

    // Write file
    fs::write(&stored_path, content.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Compute checksum
    let checksum = compute_checksum(content.as_bytes());

    // Count lines for code/text files
    let line_count = if category.should_auto_extract() {
        Some(content.lines().count() as u32)
    } else {
        None
    };

    // Create attachment
    let attachment = FileAttachment {
        id: id.clone(),
        source: FileSource::Generated,
        original_name: filename.clone(),
        stored_name: stored_name.clone(),
        mime_type: mime_type.clone(),
        category: category.clone(),
        size: content.len() as u64,
        stored_path: stored_path.to_string_lossy().to_string(),
        thumbnail_path: None,
        content: if category.should_auto_extract() {
            Some(content.clone())
        } else {
            None
        },
        encoding: Some("utf-8".to_string()),
        line_count,
        checksum: checksum.clone(),
        uploaded_at: now.clone(),
        expires_at: None,
        metadata: FileAttachmentMetadata {
            upload_metadata: None,
            generation_metadata: Some(GenerationMetadata {
                generated_by: "agent".to_string(),
                description: description.clone(),
                tool_call_id: tool_call_id.clone(),
                approved,
            }),
            filesystem_metadata: None,
        },
    };

    // Save metadata sidecar
    save_file_metadata(&attachment)?;

    Ok(attachment)
}

/// Read file content as text
#[tauri::command(rename_all = "snake_case")]
pub fn read_file_content(file_id: String) -> Result<String, String> {
    // Try to find the file in uploaded or generated directories
    let uploaded_path = get_uploaded_files_dir().join(&file_id);
    let generated_path = get_generated_files_dir().join(&file_id);

    let path = if uploaded_path.exists() {
        uploaded_path
    } else if generated_path.exists() {
        generated_path
    } else {
        return Err(format!("File not found: {}", file_id));
    };

    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Read file content as base64 (for binary files)
#[tauri::command(rename_all = "snake_case")]
pub fn read_file_binary(file_id: String) -> Result<String, String> {
    let uploaded_path = get_uploaded_files_dir().join(&file_id);
    let generated_path = get_generated_files_dir().join(&file_id);

    let path = if uploaded_path.exists() {
        uploaded_path
    } else if generated_path.exists() {
        generated_path
    } else {
        return Err(format!("File not found: {}", file_id));
    };

    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Get file info by ID
#[tauri::command(rename_all = "snake_case")]
pub fn get_file_info(file_id: String) -> Result<FileAttachment, String> {
    // Try to load metadata from uploaded or generated directories
    let uploaded_meta = get_uploaded_files_dir().join(format!("{}.meta.json", file_id));
    let generated_meta = get_generated_files_dir().join(format!("{}.meta.json", file_id));

    let meta_path = if uploaded_meta.exists() {
        uploaded_meta
    } else if generated_meta.exists() {
        generated_meta
    } else {
        return Err(format!("File metadata not found: {}", file_id));
    };

    let meta_json =
        fs::read_to_string(&meta_path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let attachment: FileAttachment =
        serde_json::from_str(&meta_json).map_err(|e| format!("Failed to parse metadata: {}", e))?;

    Ok(attachment)
}

/// List all agent files
#[tauri::command(rename_all = "snake_case")]
pub fn list_agent_files(
    source: Option<FileSource>,
    limit: Option<u32>,
) -> Result<Vec<FileAttachment>, String> {
    ensure_file_dirs()?;

    let mut attachments = Vec::new();
    let limit = limit.unwrap_or(100) as usize;

    // Helper to scan a directory
    let mut scan_dir = |dir: &PathBuf, expected_source: FileSource| {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    continue; // Skip metadata files
                }

                if let Ok(attachment) = load_file_metadata(&path.to_string_lossy()) {
                    if source
                        .as_ref()
                        .map(|s| *s == expected_source)
                        .unwrap_or(true)
                    {
                        attachments.push(attachment);
                    }
                }
            }
        }
    };

    // Scan uploaded files
    if source
        .as_ref()
        .map(|s| *s == FileSource::Upload)
        .unwrap_or(true)
    {
        scan_dir(&get_uploaded_files_dir(), FileSource::Upload);
    }

    // Scan generated files
    if source
        .as_ref()
        .map(|s| *s == FileSource::Generated)
        .unwrap_or(true)
    {
        scan_dir(&get_generated_files_dir(), FileSource::Generated);
    }

    // Sort by upload date (newest first) and limit
    attachments.sort_by(|a, b| b.uploaded_at.cmp(&a.uploaded_at));
    attachments.truncate(limit);

    Ok(attachments)
}

/// Delete an agent file
#[tauri::command(rename_all = "snake_case")]
pub fn delete_agent_file(file_id: String) -> Result<(), String> {
    // Try to find and delete in both directories
    let uploaded_path = get_uploaded_files_dir().join(&file_id);
    let uploaded_meta = get_uploaded_files_dir().join(format!("{}.meta.json", file_id));
    let generated_path = get_generated_files_dir().join(&file_id);
    let generated_meta = get_generated_files_dir().join(format!("{}.meta.json", file_id));

    let mut deleted = false;

    if uploaded_path.exists() {
        fs::remove_file(&uploaded_path).ok();
        fs::remove_file(&uploaded_meta).ok();
        deleted = true;
    }

    if generated_path.exists() {
        fs::remove_file(&generated_path).ok();
        fs::remove_file(&generated_meta).ok();
        deleted = true;
    }

    if !deleted {
        return Err(format!("File not found: {}", file_id));
    }

    Ok(())
}

/// Validate a filesystem path for security
#[tauri::command(rename_all = "snake_case")]
pub fn validate_filesystem_path(path: String) -> Result<PathValidationResult, String> {
    let path_obj = Path::new(&path);

    // Check if path exists
    if !path_obj.exists() {
        return Ok(PathValidationResult {
            valid: false,
            sanitized_path: None,
            error: Some("Path does not exist".to_string()),
            within_sandbox: false,
        });
    }

    // Check if it's a file
    if !path_obj.is_file() {
        return Ok(PathValidationResult {
            valid: false,
            sanitized_path: None,
            error: Some("Path is not a file".to_string()),
            within_sandbox: false,
        });
    }

    // Get canonical path
    let canonical = path_obj
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize path: {}", e))?;

    // Check if within data directory (sandbox)
    let data_dir = get_data_dir_path();
    let within_sandbox = canonical.starts_with(&data_dir);

    Ok(PathValidationResult {
        valid: true,
        sanitized_path: Some(canonical.to_string_lossy().to_string()),
        error: None,
        within_sandbox,
    })
}

/// Read a file from the filesystem and optionally create an attachment
#[tauri::command(rename_all = "snake_case")]
pub fn read_filesystem_file(
    path: String,
    auto_extract: bool,
    max_size: Option<u64>,
) -> Result<FileAttachment, String> {
    // Validate path
    let validation = validate_filesystem_path(path.clone())?;
    if !validation.valid {
        return Err(validation
            .error
            .unwrap_or_else(|| "Invalid path".to_string()));
    }

    let sanitized_path = validation.sanitized_path.unwrap_or(path);
    let path_obj = Path::new(&sanitized_path);

    // Get file metadata
    let metadata =
        fs::metadata(path_obj).map_err(|e| format!("Failed to get file metadata: {}", e))?;

    // Check size limit
    let max_size = max_size.unwrap_or(FILE_SIZE_SMALL);
    if metadata.len() > max_size {
        return Err(format!(
            "File too large: {} (max: {})",
            format_file_size(metadata.len()),
            format_file_size(max_size)
        ));
    }

    // Read file content
    let content_bytes = fs::read(path_obj).map_err(|e| format!("Failed to read file: {}", e))?;

    // Determine file properties
    let filename = path_obj
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let category = FileCategory::from_extension(&filename);

    // Compute checksum
    let checksum = compute_checksum(&content_bytes);

    // Extract content if requested and applicable
    let (content, line_count) = if auto_extract && category.should_auto_extract() {
        match String::from_utf8(content_bytes.clone()) {
            Ok(text) => {
                let lines = text.lines().count() as u32;
                (Some(text), Some(lines))
            }
            Err(_) => (Some("[Binary content]".to_string()), None),
        }
    } else {
        (None, None)
    };

    let now = Utc::now().to_rfc3339();

    // Create attachment (not saved to disk, just returned)
    let attachment = FileAttachment {
        id: Uuid::new_v4().to_string(),
        source: FileSource::Filesystem,
        original_name: filename.clone(),
        stored_name: filename.clone(),
        mime_type: "application/octet-stream".to_string(),
        category,
        size: metadata.len(),
        stored_path: sanitized_path.clone(),
        thumbnail_path: None,
        content,
        encoding: Some("utf-8".to_string()),
        line_count,
        checksum,
        uploaded_at: now.clone(),
        expires_at: None,
        metadata: FileAttachmentMetadata {
            upload_metadata: None,
            generation_metadata: None,
            filesystem_metadata: Some(FilesystemMetadata {
                original_path: sanitized_path,
                accessed_at: now,
                auto_read: auto_extract,
            }),
        },
    };

    Ok(attachment)
}
