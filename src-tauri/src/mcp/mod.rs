//! MCP Server Module
//!
//! Implements a Model Context Protocol server for remote LLM control.
//! Uses rmcp crate with streamable HTTP transport.

mod handlers;
mod server;
mod tools;

pub use server::start_mcp_server_background;
