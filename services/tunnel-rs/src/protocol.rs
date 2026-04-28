//! Reverse-tunnel wire protocol (v1) — byte-for-byte compatible with
//! `services/tunnel/shared/frame.ts` and `services/tunnel/shared/auth.ts`.
//!
//! Every message on the wire is:
//!
//! ```text
//! ┌──────────────────┬──────────────────────────────────────────────┐
//! │ length (4 bytes) │ JSON payload (UTF-8, `length` bytes)         │
//! └──────────────────┴──────────────────────────────────────────────┘
//! ```
//!
//! The 4-byte length prefix is big-endian unsigned. Payloads exceeding
//! `MAX_FRAME_BYTES` are rejected.
//!
//! All frames carry an `id` for correlation. Pure encode/decode — no I/O,
//! exhaustively unit-tested.

use base64::engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD as B64URL};
use base64::Engine as _;
use bytes::{Buf, BufMut, BytesMut};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::BTreeMap;
use subtle::ConstantTimeEq;
use thiserror::Error;

pub const MAX_FRAME_BYTES: usize = 32 * 1024 * 1024; // 32 MiB hard ceiling
pub const FRAME_HEADER_BYTES: usize = 4;
pub const PROTOCOL_VERSION: &str = "v1";
pub const TOKEN_FRESHNESS_SECONDS: i64 = 60;

#[derive(Debug, Error)]
pub enum FrameError {
    #[error("frame payload {got}B exceeds max {max}B")]
    TooLarge { got: usize, max: usize },
    #[error("frame too short ({got}B < {need}B header)")]
    TooShort { got: usize, need: usize },
    #[error("declared length {got}B exceeds max {max}B")]
    DeclaredTooLarge { got: usize, max: usize },
    #[error("frame length mismatch: header says {declared}B, buffer carries {actual}B")]
    LengthMismatch { declared: usize, actual: usize },
    #[error("malformed JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid frame: {0}")]
    Invalid(String),
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("secret must be non-empty")]
    EmptySecret,
    #[error("token missing")]
    Missing,
    #[error("token malformed: expected <claims>.<signature>")]
    Malformed,
    #[error("token signature mismatch")]
    SignatureMismatch,
    #[error("token claims malformed: {0}")]
    BadClaims(String),
    #[error("token freshness expired (issued {ts}, now {now}, window {window}s)")]
    Stale { ts: i64, now: i64, window: i64 },
    #[error("base64 decode error: {0}")]
    B64(String),
}

// ── Frame types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RequestFrame {
    pub id: String,
    pub hostname: String,
    pub method: String,
    pub url: String,
    /// Header map. We use `BTreeMap` so JSON serialisation has stable key order,
    /// matching the deterministic shape needed for round-trip tests.
    pub headers: BTreeMap<String, String>,
    /// Base64-encoded body. Empty string for none.
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResponseFrame {
    pub id: String,
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AdvertiseFrame {
    pub id: String,
    pub hostnames: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PingFrame {
    pub id: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PongFrame {
    pub id: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShutdownFrame {
    pub id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Frame {
    Request(RequestFrame),
    Response(ResponseFrame),
    Advertise(AdvertiseFrame),
    Ping(PingFrame),
    Pong(PongFrame),
    Shutdown(ShutdownFrame),
}

impl Frame {
    pub fn id(&self) -> &str {
        match self {
            Frame::Request(f) => &f.id,
            Frame::Response(f) => &f.id,
            Frame::Advertise(f) => &f.id,
            Frame::Ping(f) => &f.id,
            Frame::Pong(f) => &f.id,
            Frame::Shutdown(f) => &f.id,
        }
    }
}

// ── Encode / decode ────────────────────────────────────────────────

/// Encode a frame to its wire representation: 4-byte BE length prefix +
/// UTF-8 JSON payload.
pub fn encode_frame(frame: &Frame) -> Result<Vec<u8>, FrameError> {
    let payload = serde_json::to_vec(frame)?;
    if payload.len() > MAX_FRAME_BYTES {
        return Err(FrameError::TooLarge {
            got: payload.len(),
            max: MAX_FRAME_BYTES,
        });
    }
    let mut out = Vec::with_capacity(FRAME_HEADER_BYTES + payload.len());
    out.put_u32(payload.len() as u32);
    out.extend_from_slice(&payload);
    Ok(out)
}

/// Decode a single complete frame buffer (length-prefixed). Buffer must
/// contain exactly the prefix + payload — no more, no less. For streamed
/// reads use [`FrameDecoder`].
pub fn decode_frame(buf: &[u8]) -> Result<Frame, FrameError> {
    if buf.len() < FRAME_HEADER_BYTES {
        return Err(FrameError::TooShort {
            got: buf.len(),
            need: FRAME_HEADER_BYTES,
        });
    }
    let mut header = &buf[..FRAME_HEADER_BYTES];
    let length = header.get_u32() as usize;
    if length > MAX_FRAME_BYTES {
        return Err(FrameError::DeclaredTooLarge {
            got: length,
            max: MAX_FRAME_BYTES,
        });
    }
    let actual = buf.len() - FRAME_HEADER_BYTES;
    if actual != length {
        return Err(FrameError::LengthMismatch {
            declared: length,
            actual,
        });
    }
    let payload = &buf[FRAME_HEADER_BYTES..];
    let frame: Frame = serde_json::from_slice(payload)?;
    Ok(frame)
}

/// Streaming decoder: feed bytes in, pull whole frames out.
#[derive(Default)]
pub struct FrameDecoder {
    buf: BytesMut,
}

impl FrameDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn feed(&mut self, chunk: &[u8]) {
        self.buf.extend_from_slice(chunk);
    }

    /// Returns the next complete frame if one is fully buffered.
    pub fn next_frame(&mut self) -> Result<Option<Frame>, FrameError> {
        if self.buf.len() < FRAME_HEADER_BYTES {
            return Ok(None);
        }
        let length =
            u32::from_be_bytes([self.buf[0], self.buf[1], self.buf[2], self.buf[3]]) as usize;
        if length > MAX_FRAME_BYTES {
            return Err(FrameError::DeclaredTooLarge {
                got: length,
                max: MAX_FRAME_BYTES,
            });
        }
        let total = FRAME_HEADER_BYTES + length;
        if self.buf.len() < total {
            return Ok(None);
        }
        let frame_bytes = self.buf.split_to(total);
        let frame: Frame = serde_json::from_slice(&frame_bytes[FRAME_HEADER_BYTES..])?;
        Ok(Some(frame))
    }
}

// ── Auth: signed token ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TunnelClaims {
    pub id: String,
    pub ts: i64,
    pub nonce: String,
    pub hostnames: Vec<String>,
}

type HmacSha256 = Hmac<Sha256>;

fn hmac_sha256(secret: &str, message: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key size");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

/// Sign a fresh tunnel token. Wire form: `<claimsB64>.<signatureB64>`.
pub fn sign_tunnel_token(claims: &TunnelClaims, secret: &str) -> Result<String, AuthError> {
    if secret.is_empty() {
        return Err(AuthError::EmptySecret);
    }
    if claims.hostnames.is_empty() {
        return Err(AuthError::BadClaims(
            "claims.hostnames must be non-empty".into(),
        ));
    }
    let json =
        serde_json::to_vec(claims).map_err(|e| AuthError::BadClaims(format!("serialise: {e}")))?;
    let claims_b64 = B64URL.encode(&json);
    let sig = hmac_sha256(secret, claims_b64.as_bytes());
    let sig_b64 = B64URL.encode(sig);
    Ok(format!("{claims_b64}.{sig_b64}"))
}

#[derive(Debug, Clone, Copy, Default)]
pub struct VerifyOptions {
    pub now_seconds: Option<i64>,
    pub freshness_seconds: Option<i64>,
}

/// Verify a presented tunnel token. Returns claims on success.
pub fn verify_tunnel_token(
    token: &str,
    secret: &str,
    opts: VerifyOptions,
) -> Result<TunnelClaims, AuthError> {
    if secret.is_empty() {
        return Err(AuthError::EmptySecret);
    }
    if token.is_empty() {
        return Err(AuthError::Missing);
    }
    let dot = token.find('.').ok_or(AuthError::Malformed)?;
    if dot == 0 || dot == token.len() - 1 {
        return Err(AuthError::Malformed);
    }
    let claims_b64 = &token[..dot];
    let sig_b64 = &token[dot + 1..];

    let expected_sig = hmac_sha256(secret, claims_b64.as_bytes());
    let expected_b64 = B64URL.encode(expected_sig);

    // constant-time compare
    if expected_b64
        .as_bytes()
        .ct_eq(sig_b64.as_bytes())
        .unwrap_u8()
        == 0
    {
        return Err(AuthError::SignatureMismatch);
    }

    let claims_bytes = B64URL
        .decode(claims_b64)
        .map_err(|e| AuthError::B64(e.to_string()))?;
    let claims: TunnelClaims =
        serde_json::from_slice(&claims_bytes).map_err(|e| AuthError::BadClaims(e.to_string()))?;

    if claims.id.is_empty() {
        return Err(AuthError::BadClaims("claims.id must be non-empty".into()));
    }
    if claims.nonce.is_empty() {
        return Err(AuthError::BadClaims(
            "claims.nonce must be non-empty".into(),
        ));
    }
    if claims.hostnames.is_empty() {
        return Err(AuthError::BadClaims(
            "claims.hostnames must be non-empty".into(),
        ));
    }
    for h in &claims.hostnames {
        if h.is_empty() {
            return Err(AuthError::BadClaims(
                "claims.hostnames entries must be non-empty".into(),
            ));
        }
    }

    let freshness = opts.freshness_seconds.unwrap_or(TOKEN_FRESHNESS_SECONDS);
    let now = opts.now_seconds.unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    });
    if (now - claims.ts).abs() > freshness {
        return Err(AuthError::Stale {
            ts: claims.ts,
            now,
            window: freshness,
        });
    }
    Ok(claims)
}

/// Generate a 96-bit random nonce as base64url (no padding).
pub fn generate_nonce() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut bytes);
    B64URL.encode(bytes)
}

/// Generate a short, URL-safe correlation id.
pub fn generate_request_id() -> String {
    generate_nonce()
}

/// Encode binary HTTP body to base64 (matches TS `bodyToBase64`).
pub fn body_to_base64(body: &[u8]) -> String {
    if body.is_empty() {
        return String::new();
    }
    B64.encode(body)
}

/// Decode base64-encoded body back to bytes. Empty string → empty Vec.
pub fn body_from_base64(encoded: &str) -> Result<Vec<u8>, AuthError> {
    if encoded.is_empty() {
        return Ok(Vec::new());
    }
    B64.decode(encoded)
        .map_err(|e| AuthError::B64(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req_frame() -> Frame {
        let mut headers = BTreeMap::new();
        headers.insert("content-type".into(), "application/json".into());
        Frame::Request(RequestFrame {
            id: "abc".into(),
            hostname: "demo.crontech.app".into(),
            method: "POST".into(),
            url: "/api/echo".into(),
            headers,
            body: body_to_base64(b"{\"x\":1}"),
        })
    }

    #[test]
    fn round_trip_request() {
        let f = req_frame();
        let bytes = encode_frame(&f).expect("encode");
        let back = decode_frame(&bytes).expect("decode");
        assert_eq!(f, back);
    }

    #[test]
    fn round_trip_all_frame_types() {
        let frames = vec![
            Frame::Response(ResponseFrame {
                id: "r1".into(),
                status: 200,
                headers: BTreeMap::new(),
                body: String::new(),
            }),
            Frame::Advertise(AdvertiseFrame {
                id: "tok".into(),
                hostnames: vec!["a.example".into(), "b.example".into()],
            }),
            Frame::Ping(PingFrame {
                id: "p".into(),
                timestamp: 12345,
            }),
            Frame::Pong(PongFrame {
                id: "p".into(),
                timestamp: 12346,
            }),
            Frame::Shutdown(ShutdownFrame {
                id: "s".into(),
                reason: "draining".into(),
            }),
        ];
        for f in frames {
            let bytes = encode_frame(&f).unwrap();
            let back = decode_frame(&bytes).unwrap();
            assert_eq!(f, back);
        }
    }

    #[test]
    fn decode_rejects_short_buffer() {
        let r = decode_frame(&[0u8, 0, 0]);
        assert!(matches!(r, Err(FrameError::TooShort { .. })));
    }

    #[test]
    fn decode_rejects_length_mismatch() {
        let mut bytes = encode_frame(&req_frame()).unwrap();
        bytes.push(0xFF);
        let r = decode_frame(&bytes);
        assert!(matches!(r, Err(FrameError::LengthMismatch { .. })));
    }

    #[test]
    fn streaming_decoder_handles_split_chunks() {
        let bytes = encode_frame(&req_frame()).unwrap();
        let mut dec = FrameDecoder::new();
        // feed in tiny chunks to exercise the buffering path
        for chunk in bytes.chunks(3) {
            dec.feed(chunk);
            // before the final chunk, no full frame yet (until last)
        }
        let frame = dec.next_frame().expect("decode").expect("some frame");
        assert_eq!(frame, req_frame());
        assert!(dec.next_frame().unwrap().is_none());
    }

    #[test]
    fn streaming_decoder_handles_two_back_to_back() {
        let f1 = req_frame();
        let f2 = Frame::Ping(PingFrame {
            id: "p".into(),
            timestamp: 99,
        });
        let mut wire = encode_frame(&f1).unwrap();
        wire.extend(encode_frame(&f2).unwrap());

        let mut dec = FrameDecoder::new();
        dec.feed(&wire);
        let g1 = dec.next_frame().unwrap().unwrap();
        let g2 = dec.next_frame().unwrap().unwrap();
        assert_eq!(g1, f1);
        assert_eq!(g2, f2);
        assert!(dec.next_frame().unwrap().is_none());
    }

    #[test]
    fn token_round_trip() {
        let claims = TunnelClaims {
            id: "vps-vultr-1".into(),
            ts: 1_700_000_000,
            nonce: generate_nonce(),
            hostnames: vec!["demo.crontech.app".into()],
        };
        let token = sign_tunnel_token(&claims, "supersecret").unwrap();
        let back = verify_tunnel_token(
            &token,
            "supersecret",
            VerifyOptions {
                now_seconds: Some(1_700_000_010),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(back, claims);
    }

    #[test]
    fn token_rejects_bad_signature() {
        let claims = TunnelClaims {
            id: "x".into(),
            ts: 1,
            nonce: "n".into(),
            hostnames: vec!["h".into()],
        };
        let mut token = sign_tunnel_token(&claims, "s").unwrap();
        // flip last char of signature
        let last = token.pop().unwrap();
        let flipped = if last == 'A' { 'B' } else { 'A' };
        token.push(flipped);
        let r = verify_tunnel_token(
            &token,
            "s",
            VerifyOptions {
                now_seconds: Some(1),
                ..Default::default()
            },
        );
        assert!(matches!(r, Err(AuthError::SignatureMismatch)));
    }

    #[test]
    fn token_rejects_wrong_secret() {
        let claims = TunnelClaims {
            id: "x".into(),
            ts: 1,
            nonce: "n".into(),
            hostnames: vec!["h".into()],
        };
        let token = sign_tunnel_token(&claims, "right").unwrap();
        let r = verify_tunnel_token(
            &token,
            "wrong",
            VerifyOptions {
                now_seconds: Some(1),
                ..Default::default()
            },
        );
        assert!(matches!(r, Err(AuthError::SignatureMismatch)));
    }

    #[test]
    fn token_rejects_stale() {
        let claims = TunnelClaims {
            id: "x".into(),
            ts: 100,
            nonce: "n".into(),
            hostnames: vec!["h".into()],
        };
        let token = sign_tunnel_token(&claims, "s").unwrap();
        let r = verify_tunnel_token(
            &token,
            "s",
            VerifyOptions {
                now_seconds: Some(10_000),
                freshness_seconds: Some(60),
            },
        );
        assert!(matches!(r, Err(AuthError::Stale { .. })));
    }

    #[test]
    fn token_rejects_malformed() {
        let r = verify_tunnel_token("nodot", "s", VerifyOptions::default());
        assert!(matches!(r, Err(AuthError::Malformed)));
        let r = verify_tunnel_token(".sig", "s", VerifyOptions::default());
        assert!(matches!(r, Err(AuthError::Malformed)));
        let r = verify_tunnel_token("claims.", "s", VerifyOptions::default());
        assert!(matches!(r, Err(AuthError::Malformed)));
    }

    #[test]
    fn body_base64_round_trip() {
        let body = b"hello world".to_vec();
        let enc = body_to_base64(&body);
        let dec = body_from_base64(&enc).unwrap();
        assert_eq!(body, dec);
        assert_eq!(body_to_base64(b""), "");
        assert_eq!(body_from_base64("").unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn empty_secret_is_rejected() {
        let claims = TunnelClaims {
            id: "x".into(),
            ts: 1,
            nonce: "n".into(),
            hostnames: vec!["h".into()],
        };
        assert!(matches!(
            sign_tunnel_token(&claims, ""),
            Err(AuthError::EmptySecret)
        ));
        assert!(matches!(
            verify_tunnel_token("a.b", "", VerifyOptions::default()),
            Err(AuthError::EmptySecret)
        ));
    }
}
