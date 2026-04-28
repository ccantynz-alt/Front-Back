//! Source URL fetching with allowlist enforcement (SSRF prevention).
//!
//! The allowlist is host-based — same model as the TS service. Wildcard
//! subdomains use a leading dot (`.example.com` matches `cdn.example.com`).
//! Only http/https schemes are accepted.

use std::time::Duration;

use bytes::Bytes;
use url::Url;

use crate::error::{Error, Result};

/// 25 MB hard cap on source payloads. Same as TS service.
pub const MAX_SOURCE_BYTES: usize = 25 * 1024 * 1024;

#[derive(Clone, Debug, Default)]
pub struct SourceAllowlist {
    /// Exact hosts (e.g. `cdn.example.com`).
    exact: Vec<String>,
    /// Suffix hosts (stored without leading dot; matched as `.suffix`).
    suffix: Vec<String>,
}

impl SourceAllowlist {
    pub fn new<I, S>(entries: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let mut exact = Vec::new();
        let mut suffix = Vec::new();
        for raw in entries {
            let s = raw.as_ref().trim().to_ascii_lowercase();
            if s.is_empty() {
                continue;
            }
            if let Some(rest) = s.strip_prefix('.') {
                if !rest.is_empty() {
                    suffix.push(rest.to_string());
                }
            } else {
                exact.push(s);
            }
        }
        Self { exact, suffix }
    }

    pub fn from_env_value(value: &str) -> Self {
        Self::new(value.split(',').map(str::trim))
    }

    pub fn check(&self, raw_url: &str) -> Result<Url> {
        let url = Url::parse(raw_url).map_err(|e| Error::SourceMalformed(e.to_string()))?;
        match url.scheme() {
            "http" | "https" => {}
            other => {
                return Err(Error::SourceMalformed(format!(
                    "scheme `{other}` not allowed"
                )))
            }
        }
        let host = url
            .host_str()
            .ok_or_else(|| Error::SourceMalformed("missing host".into()))?
            .to_ascii_lowercase();

        // Reject literal IPs outright — the allowlist is name-based and IPs
        // bypass DNS-level controls. SSRF defence-in-depth.
        if host.parse::<std::net::IpAddr>().is_ok() {
            return Err(Error::SourceNotAllowed);
        }

        let allowed = self.exact.iter().any(|h| h == &host)
            || self
                .suffix
                .iter()
                .any(|s| host == *s || host.ends_with(&format!(".{s}")));

        if !allowed {
            return Err(Error::SourceNotAllowed);
        }
        Ok(url)
    }
}

#[derive(Clone)]
pub struct SourceFetcher {
    client: reqwest::Client,
    allowlist: SourceAllowlist,
    max_bytes: usize,
}

impl SourceFetcher {
    pub fn new(allowlist: SourceAllowlist) -> Self {
        let client = reqwest::Client::builder()
            .user_agent("crontech-image-optimizer-rs/0.1")
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::limited(3))
            .build()
            .expect("reqwest client builds with default tls");
        Self {
            client,
            allowlist,
            max_bytes: MAX_SOURCE_BYTES,
        }
    }

    pub fn allowlist(&self) -> &SourceAllowlist {
        &self.allowlist
    }

    pub async fn fetch(&self, raw_url: &str) -> Result<Bytes> {
        let url = self.allowlist.check(raw_url)?;
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| Error::SourceFetch(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(Error::SourceUpstreamStatus(status.as_u16()));
        }
        if let Some(len) = resp.content_length() {
            if len as usize > self.max_bytes {
                return Err(Error::SourceTooLarge);
            }
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| Error::SourceFetch(e.to_string()))?;
        if bytes.len() > self.max_bytes {
            return Err(Error::SourceTooLarge);
        }
        Ok(bytes)
    }
}
