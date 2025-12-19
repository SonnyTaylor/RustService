//! MCP HTTP Server
//!
//! Simple HTTP transport for remote MCP access.

use std::net::SocketAddr;
use std::sync::Arc;

use http_body_util::Full;
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

use super::tools::RustServiceTools;

type BoxBody = Full<Bytes>;

/// Simple JSON-RPC handler for MCP
async fn handle_mcp_request(
    req: Request<Incoming>,
    api_key: Arc<String>,
    _tools: Arc<RustServiceTools>,
) -> Result<Response<BoxBody>, hyper::Error> {
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    // Health check endpoint (no auth required)
    if path == "/" || path == "/health" {
        let response = serde_json::json!({
            "status": "ok",
            "service": "RustService MCP Server",
            "version": "1.0.0"
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
            .body(BoxBody::new(Bytes::from(
                r#"{"error":"Not Found - use POST /mcp"}"#,
            )))
            .unwrap());
    }

    if method != Method::POST {
        return Ok(Response::builder()
            .status(StatusCode::METHOD_NOT_ALLOWED)
            .header("Content-Type", "application/json")
            .body(BoxBody::new(Bytes::from(
                r#"{"error":"Method not allowed - use POST"}"#,
            )))
            .unwrap());
    }

    // For now, respond with a simple capabilities message
    // Full MCP JSON-RPC handling would go here
    let response = serde_json::json!({
        "jsonrpc": "2.0",
        "result": {
            "capabilities": {
                "tools": {
                    "listChanged": true
                }
            },
            "serverInfo": {
                "name": "RustService MCP",
                "version": "1.0.0"
            }
        },
        "id": 1
    });

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(BoxBody::new(Bytes::from(response.to_string())))
        .unwrap())
}

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
