//! Typed error model for image-optimizer-rs.
//!
//! All errors map cleanly to HTTP responses in the Axum layer. We never bubble
//! anyhow strings to the wire — every variant carries enough context for
//! observability while staying safe to render to the client.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("invalid query parameter `{name}`: {reason}")]
    InvalidParam { name: &'static str, reason: String },

    #[error("source URL is not on the allowlist")]
    SourceNotAllowed,

    #[error("source URL is malformed: {0}")]
    SourceMalformed(String),

    #[error("source returned status {0}")]
    SourceUpstreamStatus(u16),

    #[error("source fetch failed: {0}")]
    SourceFetch(String),

    #[error("source payload exceeded maximum size")]
    SourceTooLarge,

    #[error("decode failed: {0}")]
    Decode(String),

    #[error("encode failed: {0}")]
    Encode(String),

    #[error("requested dimensions exceed limits")]
    DimensionsExceeded,
}

pub type Result<T> = std::result::Result<T, Error>;

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = match &self {
            Error::InvalidParam { .. } | Error::DimensionsExceeded => StatusCode::BAD_REQUEST,
            Error::SourceNotAllowed => StatusCode::FORBIDDEN,
            Error::SourceMalformed(_) => StatusCode::BAD_REQUEST,
            Error::SourceUpstreamStatus(s) => {
                StatusCode::from_u16(*s).unwrap_or(StatusCode::BAD_GATEWAY)
            }
            Error::SourceFetch(_) => StatusCode::BAD_GATEWAY,
            Error::SourceTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            Error::Decode(_) | Error::Encode(_) => StatusCode::UNPROCESSABLE_ENTITY,
        };
        let body = serde_json::json!({
            "error": self.to_string(),
        });
        (status, axum::Json(body)).into_response()
    }
}
