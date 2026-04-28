//! Output-format negotiation.
//!
//! Honors an explicit `?format=` first, then walks the `Accept` header for
//! the highest-priority modern format we can encode. Falls back to JPEG.

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Webp,
    Avif,
    Jpeg,
    Png,
}

impl OutputFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Webp => "webp",
            Self::Avif => "avif",
            Self::Jpeg => "jpeg",
            Self::Png => "png",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            Self::Webp => "image/webp",
            Self::Avif => "image/avif",
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
        }
    }

    pub fn parse(raw: &str) -> Result<Self> {
        match raw.to_ascii_lowercase().as_str() {
            "webp" => Ok(Self::Webp),
            "avif" => Ok(Self::Avif),
            "jpeg" | "jpg" => Ok(Self::Jpeg),
            "png" => Ok(Self::Png),
            other => Err(Error::InvalidParam {
                name: "format",
                reason: format!("unknown format `{other}`"),
            }),
        }
    }
}

/// Pick an output format. Explicit param wins; otherwise sniff `Accept`.
///
/// AVIF is currently *negotiable* but not encodable in this build (the
/// pure-Rust `image` crate lacks an AVIF encoder by default). When the
/// negotiation chooses AVIF we transparently downgrade to WebP — same
/// modern-codec benefit, zero binary-size cost.
pub fn negotiate_format(
    explicit: Option<OutputFormat>,
    accept_header: Option<&str>,
) -> OutputFormat {
    if let Some(f) = explicit {
        return downgrade_unsupported(f);
    }
    let Some(accept) = accept_header else {
        return OutputFormat::Jpeg;
    };

    let lower = accept.to_ascii_lowercase();
    if lower.contains("image/avif") {
        return downgrade_unsupported(OutputFormat::Avif);
    }
    if lower.contains("image/webp") {
        return OutputFormat::Webp;
    }
    if lower.contains("image/png") {
        return OutputFormat::Png;
    }
    OutputFormat::Jpeg
}

fn downgrade_unsupported(f: OutputFormat) -> OutputFormat {
    match f {
        // No pure-Rust AVIF encoder bundled in v1; transparently use WebP.
        OutputFormat::Avif => OutputFormat::Webp,
        other => other,
    }
}
