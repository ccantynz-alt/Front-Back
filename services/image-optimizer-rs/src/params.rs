//! Query-param parsing, validation, and cache-key derivation.
//!
//! Mirrors the TS `services/image-optimizer/` query contract so customers can
//! flip `IMAGE_OPTIMIZER_BACKEND=rust` without changing client-side URLs.
//!
//! Cache-key derivation is **deterministic** — same canonical inputs always
//! produce the same SHA-256 hash. The TS service uses the same scheme so the
//! two backends share cache entries (an explicit goal of v1).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};
use crate::negotiation::OutputFormat;

/// Hard caps. Anything beyond these is a 400. These match the TS service.
pub const MAX_WIDTH: u32 = 8000;
pub const MAX_HEIGHT: u32 = 8000;
pub const MAX_QUALITY: u8 = 100;
pub const MIN_QUALITY: u8 = 1;
pub const MAX_BLUR: u8 = 100;
pub const MAX_DPR: u8 = 4;

/// `fit` modes — how to reconcile requested dimensions with source aspect.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Fit {
    /// Preserve aspect, fit inside box (default).
    #[default]
    Inside,
    /// Preserve aspect, cover the box, crop overflow.
    Cover,
    /// Preserve aspect, contain inside box, no crop.
    Contain,
    /// Stretch to exact dimensions (may distort).
    Fill,
}

impl Fit {
    fn as_str(self) -> &'static str {
        match self {
            Self::Inside => "inside",
            Self::Cover => "cover",
            Self::Contain => "contain",
            Self::Fill => "fill",
        }
    }

    pub fn parse(raw: &str) -> Result<Self> {
        match raw {
            "inside" => Ok(Self::Inside),
            "cover" => Ok(Self::Cover),
            "contain" => Ok(Self::Contain),
            "fill" => Ok(Self::Fill),
            other => Err(Error::InvalidParam {
                name: "fit",
                reason: format!("unknown fit `{other}`"),
            }),
        }
    }
}

/// All knobs the TS service supports. Validated on construction.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, Default)]
pub struct TransformParams {
    pub source: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub quality: Option<u8>,
    pub blur: Option<u8>,
    pub dpr: Option<u8>,
    pub fit: Fit,
    pub format: Option<OutputFormat>,
}

impl TransformParams {
    /// Parse from a `?key=value&…` style iterator. Mirrors `URLSearchParams`
    /// semantics: last write wins for duplicate keys.
    pub fn from_query(query: &str) -> Result<Self> {
        let mut map: BTreeMap<String, String> = BTreeMap::new();
        for pair in query.split('&').filter(|p| !p.is_empty()) {
            let mut it = pair.splitn(2, '=');
            let k = it.next().unwrap_or("");
            let v = it.next().unwrap_or("");
            let k = url_decode(k);
            let v = url_decode(v);
            map.insert(k, v);
        }

        let source =
            map.remove("source")
                .or_else(|| map.remove("url"))
                .ok_or(Error::InvalidParam {
                    name: "source",
                    reason: "missing source URL".to_string(),
                })?;
        if source.is_empty() {
            return Err(Error::InvalidParam {
                name: "source",
                reason: "empty source URL".to_string(),
            });
        }

        let width = parse_dim(
            map.get("w").or_else(|| map.get("width")),
            "width",
            MAX_WIDTH,
        )?;
        let height = parse_dim(
            map.get("h").or_else(|| map.get("height")),
            "height",
            MAX_HEIGHT,
        )?;
        let quality = parse_u8_in_range(
            map.get("q").or_else(|| map.get("quality")),
            "quality",
            MIN_QUALITY,
            MAX_QUALITY,
        )?;
        let blur = parse_u8_in_range(map.get("blur"), "blur", 0, MAX_BLUR)?;
        let dpr = parse_u8_in_range(map.get("dpr"), "dpr", 1, MAX_DPR)?;
        let fit = match map.get("fit") {
            Some(v) => Fit::parse(v)?,
            None => Fit::default(),
        };
        let format = match map.get("format").or_else(|| map.get("f")) {
            Some(v) => Some(OutputFormat::parse(v)?),
            None => None,
        };

        Ok(Self {
            source,
            width,
            height,
            quality,
            blur,
            dpr,
            fit,
            format,
        })
    }

    /// Effective width after DPR multiplier — what we actually resize to.
    pub fn effective_width(&self) -> Option<u32> {
        let dpr = self.dpr.unwrap_or(1) as u32;
        self.width.map(|w| w.saturating_mul(dpr).min(MAX_WIDTH))
    }

    /// Effective height after DPR multiplier.
    pub fn effective_height(&self) -> Option<u32> {
        let dpr = self.dpr.unwrap_or(1) as u32;
        self.height.map(|h| h.saturating_mul(dpr).min(MAX_HEIGHT))
    }
}

fn parse_dim(raw: Option<&String>, name: &'static str, max: u32) -> Result<Option<u32>> {
    let Some(s) = raw else {
        return Ok(None);
    };
    let n: u32 = s.parse().map_err(|_| Error::InvalidParam {
        name,
        reason: format!("`{s}` is not a non-negative integer"),
    })?;
    if n == 0 {
        return Err(Error::InvalidParam {
            name,
            reason: "must be > 0".into(),
        });
    }
    if n > max {
        return Err(Error::InvalidParam {
            name,
            reason: format!("must be <= {max}"),
        });
    }
    Ok(Some(n))
}

fn parse_u8_in_range(
    raw: Option<&String>,
    name: &'static str,
    min: u8,
    max: u8,
) -> Result<Option<u8>> {
    let Some(s) = raw else {
        return Ok(None);
    };
    let n: u8 = s.parse().map_err(|_| Error::InvalidParam {
        name,
        reason: format!("`{s}` is not an integer in [{min}, {max}]"),
    })?;
    if n < min || n > max {
        return Err(Error::InvalidParam {
            name,
            reason: format!("must be in [{min}, {max}]"),
        });
    }
    Ok(Some(n))
}

fn url_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = from_hex(bytes[i + 1]);
                let lo = from_hex(bytes[i + 2]);
                if let (Some(h), Some(l)) = (hi, lo) {
                    out.push((h << 4) | l);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            other => {
                out.push(other);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Deterministic cache key. Same canonical inputs → same hex digest. The TS
/// service uses the same scheme. Effective dimensions (post-DPR) are folded
/// in so `?w=100&dpr=2` and `?w=200` collide where appropriate.
pub fn cache_key(params: &TransformParams, output: OutputFormat) -> String {
    let mut hasher = Sha256::new();
    let mut canonical = String::new();
    canonical.push_str("v1\n");
    canonical.push_str("source=");
    canonical.push_str(&params.source);
    canonical.push('\n');
    if let Some(w) = params.effective_width() {
        canonical.push_str(&format!("w={w}\n"));
    }
    if let Some(h) = params.effective_height() {
        canonical.push_str(&format!("h={h}\n"));
    }
    if let Some(q) = params.quality {
        canonical.push_str(&format!("q={q}\n"));
    }
    if let Some(b) = params.blur {
        canonical.push_str(&format!("blur={b}\n"));
    }
    canonical.push_str(&format!("fit={}\n", params.fit.as_str()));
    canonical.push_str(&format!("format={}\n", output.as_str()));
    hasher.update(canonical.as_bytes());
    hex::encode(hasher.finalize())
}
