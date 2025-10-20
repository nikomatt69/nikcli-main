/*!
 * Context Module
 * Workspace context and RAG system - Production Ready
 */

pub mod workspace_context;
pub mod context_manager;
pub mod workspace_rag;
pub mod semantic_search;

pub use workspace_context::WorkspaceContext;
pub use context_manager::ContextManager;
pub use workspace_rag::WorkspaceRAG;
pub use semantic_search::SemanticSearch;

pub mod rag_system;
pub mod docs_context_manager;
pub use rag_system::{RAGSystem, UNIFIED_RAG_SYSTEM};
pub use docs_context_manager::{DocsContextManager, DOCS_CONTEXT_MANAGER};
