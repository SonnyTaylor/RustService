//! MCP Server Module
//!
//! Implements a Model Context Protocol server for remote LLM control.
//! Uses rmcp crate with streamable HTTP transport.

mod server;
mod tools;

pub use server::{run_mcp_server_http, start_mcp_server_background};
pub use tools::RustServiceTools;
