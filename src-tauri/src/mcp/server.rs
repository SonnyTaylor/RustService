//! MCP HTTP Server
//!
//! Implements full MCP JSON-RPC protocol over HTTP transport.
//! Handles tools/list and tools/call methods for external LLM control.

use std::net::SocketAddr;
use std::sync::Arc;

use http_body_util::{BodyExt, Full};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;

use super::tools::RustServiceTools;

type BoxBody = Full<Bytes>;

// =============================================================================
// JSON-RPC Types
// =============================================================================

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    #[serde(default)]
    params: serde_json::Value,
    id: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
    id: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
}

impl JsonRpcResponse {
    fn success(result: serde_json::Value, id: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: Some(result),
            error: None,
            id,
        }
    }

    fn error(code: i32, message: &str, id: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.to_string(),
                data: None,
            }),
            id,
        }
    }
}

// =============================================================================
// Tool Definitions for tools/list
// =============================================================================

fn get_tool_definitions() -> serde_json::Value {
    serde_json::json!({
        "tools": [
            {
                "name": "execute_command",
                "description": "Execute a PowerShell command on the system. Returns stdout, stderr, and exit code.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The PowerShell command to execute"
                        },
                        "reason": {
                            "type": "string",
                            "description": "Brief explanation of why this command is needed"
                        }
                    },
                    "required": ["command", "reason"]
                }
            },
            {
                "name": "read_file",
                "description": "Read the contents of a file. Use this to examine configuration files, logs, or other text files.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Full path to the file"
                        }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "write_file",
                "description": "Write content to a file. Creates the file if it doesn't exist.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Full path to the file"
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write"
                        }
                    },
                    "required": ["path", "content"]
                }
            },
            {
                "name": "list_dir",
                "description": "List files and directories in a specific path. Use this to explore the file system.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to list content for"
                        }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "move_file",
                "description": "Move or rename a file from source to destination.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "src": {
                            "type": "string",
                            "description": "Source file path"
                        },
                        "dest": {
                            "type": "string",
                            "description": "Destination file path"
                        }
                    },
                    "required": ["src", "dest"]
                }
            },
            {
                "name": "copy_file",
                "description": "Copy a file from source to destination.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "src": {
                            "type": "string",
                            "description": "Source file path"
                        },
                        "dest": {
                            "type": "string",
                            "description": "Destination file path"
                        }
                    },
                    "required": ["src", "dest"]
                }
            },
            {
                "name": "get_system_info",
                "description": "Get detailed system information including OS version, CPU, memory, disks, and hostname.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }
            },
            {
                "name": "search_web",
                "description": "Search the web for information. Returns search results with titles, URLs, and snippets.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query"
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "list_programs",
                "description": "List all portable programs available in the data/programs folder.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }
            },
            {
                "name": "list_instruments",
                "description": "List available custom instruments (scripts) that can be run.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }
            },
            {
                "name": "run_instrument",
                "description": "Run a custom instrument (script) by name.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name of the instrument to run"
                        },
                        "args": {
                            "type": "string",
                            "description": "Optional arguments to pass to the instrument"
                        }
                    },
                    "required": ["name"]
                }
            }
        ]
    })
}

// =============================================================================
// Tool Dispatch
// =============================================================================

async fn dispatch_tool_call(
    tools: &RustServiceTools,
    name: &str,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match name {
        "execute_command" => {
            let command = arguments
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'command' argument")?;
            let reason = arguments
                .get("reason")
                .and_then(|v| v.as_str())
                .unwrap_or("MCP request");

            let result = tools
                .execute_command(command.to_string(), reason.to_string())
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "read_file" => {
            let path = arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?;

            let result = tools
                .read_file(path.to_string())
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "write_file" => {
            let path = arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?;
            let content = arguments
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'content' argument")?;

            let result = tools
                .write_file(path.to_string(), content.to_string())
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "list_dir" => {
            let path = arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?;

            let result = tools
                .list_dir(path.to_string())
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "move_file" => {
            let src = arguments
                .get("src")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'src' argument")?;
            let dest = arguments
                .get("dest")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'dest' argument")?;

            let result = tools
                .move_file(src.to_string(), dest.to_string())
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "copy_file" => {
            let src = arguments
                .get("src")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'src' argument")?;
            let dest = arguments
                .get("dest")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'dest' argument")?;

            let result = tools
                .copy_file(src.to_string(), dest.to_string())
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "get_system_info" => {
            let result = tools
                .get_system_info()
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "search_web" => {
            let query = arguments
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'query' argument")?;

            let result = tools
                .search_web(query.to_string())
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "list_programs" => {
            let result = tools
                .list_programs()
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "list_instruments" => {
            let result = tools
                .list_instruments()
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        "run_instrument" => {
            let name = arguments
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'name' argument")?;
            let args = arguments
                .get("args")
                .and_then(|v| v.as_str())
                .map(String::from);

            let result = tools
                .run_instrument(name.to_string(), args)
                .await
                .map_err(|e| format!("Tool error: {:?}", e))?;

            Ok(call_tool_result_to_json(result))
        }
        _ => Err(format!("Unknown tool: {}", name)),
    }
}

/// Convert rmcp CallToolResult to JSON
fn call_tool_result_to_json(result: rmcp::model::CallToolResult) -> serde_json::Value {
    let content: Vec<serde_json::Value> = result
        .content
        .iter()
        .map(|c| {
            // rmcp Content is Annotated<RawContent>, extract the raw content
            // The raw field contains the actual content
            serde_json::json!({
                "type": "text",
                "text": format!("{:?}", c.raw)
            })
        })
        .collect();

    serde_json::json!({
        "content": content,
        "isError": result.is_error.unwrap_or(false)
    })
}

// =============================================================================
// HTTP Request Handler
// =============================================================================

async fn handle_mcp_request(
    req: Request<Incoming>,
    api_key: Arc<String>,
    tools: Arc<RustServiceTools>,
) -> Result<Response<BoxBody>, hyper::Error> {
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    // Health check endpoint (no auth required)
    if path == "/" || path == "/health" {
        let response = serde_json::json!({
            "status": "ok",
            "service": "RustService MCP Server",
            "version": "1.0.0",
            "tools_available": 11
        });
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(BoxBody::new(Bytes::from(response.to_string())))
            .unwrap());
    }

    // Handle CORS preflight
    if method == Method::OPTIONS {
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            .header(
                "Access-Control-Allow-Headers",
                "Authorization, Content-Type",
            )
            .body(BoxBody::new(Bytes::new()))
            .unwrap());
    }

    // Check authorization for /mcp endpoint
    let auth_header = req.headers().get("authorization");
    let expected = format!("Bearer {}", api_key);

    if auth_header.map(|h| h.to_str().ok()) != Some(Some(expected.as_str())) {
        eprintln!("MCP: Unauthorized request to {}", path);
        return Ok(Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .header("Content-Type", "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(BoxBody::new(Bytes::from(
                r#"{"error":"Unauthorized - Bearer token required"}"#,
            )))
            .unwrap());
    }

    // Only accept POST to /mcp
    if path != "/mcp" {
        return Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header("Content-Type", "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(BoxBody::new(Bytes::from(
                r#"{"error":"Not Found - use POST /mcp"}"#,
            )))
            .unwrap());
    }

    if method != Method::POST {
        return Ok(Response::builder()
            .status(StatusCode::METHOD_NOT_ALLOWED)
            .header("Content-Type", "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(BoxBody::new(Bytes::from(
                r#"{"error":"Method not allowed - use POST"}"#,
            )))
            .unwrap());
    }

    // Collect request body
    let body_bytes = match req.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(e) => {
            eprintln!("MCP: Failed to read request body: {}", e);
            let response = JsonRpcResponse::error(
                -32700,
                "Failed to read request body",
                serde_json::Value::Null,
            );
            return Ok(Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(BoxBody::new(Bytes::from(
                    serde_json::to_string(&response).unwrap(),
                )))
                .unwrap());
        }
    };

    // Parse JSON-RPC request
    let rpc_request: JsonRpcRequest = match serde_json::from_slice(&body_bytes) {
        Ok(req) => req,
        Err(e) => {
            eprintln!("MCP: Failed to parse JSON-RPC: {}", e);
            let response = JsonRpcResponse::error(
                -32700,
                "Parse error - invalid JSON",
                serde_json::Value::Null,
            );
            return Ok(Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(BoxBody::new(Bytes::from(
                    serde_json::to_string(&response).unwrap(),
                )))
                .unwrap());
        }
    };

    eprintln!(
        "MCP: Received method '{}' id={}",
        rpc_request.method, rpc_request.id
    );

    // Handle MCP methods
    let response = match rpc_request.method.as_str() {
        "initialize" => {
            // MCP initialization - return server capabilities
            JsonRpcResponse::success(
                serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {
                            "listChanged": true
                        }
                    },
                    "serverInfo": {
                        "name": "RustService MCP",
                        "version": "1.0.0"
                    }
                }),
                rpc_request.id,
            )
        }
        "tools/list" => {
            // Return list of available tools
            JsonRpcResponse::success(get_tool_definitions(), rpc_request.id)
        }
        "tools/call" => {
            // Extract tool name and arguments
            let tool_name = rpc_request
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let arguments = rpc_request
                .params
                .get("arguments")
                .cloned()
                .unwrap_or(serde_json::json!({}));

            eprintln!("MCP: Calling tool '{}' with args: {}", tool_name, arguments);

            match dispatch_tool_call(&tools, tool_name, arguments).await {
                Ok(result) => JsonRpcResponse::success(result, rpc_request.id),
                Err(e) => JsonRpcResponse::error(-32603, &e, rpc_request.id),
            }
        }
        "notifications/initialized" => {
            // Client notification that initialization is complete - no response needed
            // But we return success anyway for non-notification requests
            JsonRpcResponse::success(serde_json::json!({}), rpc_request.id)
        }
        _ => {
            eprintln!("MCP: Method not found: {}", rpc_request.method);
            JsonRpcResponse::error(
                -32601,
                &format!("Method not found: {}", rpc_request.method),
                rpc_request.id,
            )
        }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(BoxBody::new(Bytes::from(
            serde_json::to_string(&response).unwrap(),
        )))
        .unwrap())
}

// =============================================================================
// Server Lifecycle
// =============================================================================

/// Run the MCP server with HTTP transport
pub async fn run_mcp_server_http(
    port: u16,
    api_key: String,
    tavily_key: Option<String>,
    searxng_url: Option<String>,
) {
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    eprintln!("Starting MCP HTTP server on http://0.0.0.0:{}/mcp", port);

    let tools = Arc::new(RustServiceTools::with_settings(tavily_key, searxng_url));
    let api_key = Arc::new(api_key);

    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind MCP server to {}: {}", addr, e);
            return;
        }
    };

    eprintln!("MCP HTTP server listening on http://{}/mcp", addr);
    eprintln!("Available tools: execute_command, read_file, write_file, list_dir, move_file, copy_file, get_system_info, search_web, list_programs, list_instruments, run_instrument");

    loop {
        let (stream, remote_addr) = match listener.accept().await {
            Ok(conn) => conn,
            Err(e) => {
                eprintln!("Failed to accept connection: {}", e);
                continue;
            }
        };

        let io = TokioIo::new(stream);
        let api_key = api_key.clone();
        let tools = tools.clone();

        tokio::spawn(async move {
            let service = service_fn(move |req| {
                let api_key = api_key.clone();
                let tools = tools.clone();
                async move { handle_mcp_request(req, api_key, tools).await }
            });

            if let Err(e) = http1::Builder::new().serve_connection(io, service).await {
                // Connection errors are usually just clients disconnecting
                eprintln!("Connection from {} ended: {}", remote_addr, e);
            }
        });
    }
}

/// Start the MCP server in a background thread
pub fn start_mcp_server_background(
    port: u16,
    api_key: String,
    tavily_key: Option<String>,
    searxng_url: Option<String>,
) {
    std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("Failed to create tokio runtime for MCP server: {}", e);
                return;
            }
        };

        rt.block_on(run_mcp_server_http(port, api_key, tavily_key, searxng_url));
    });
}
