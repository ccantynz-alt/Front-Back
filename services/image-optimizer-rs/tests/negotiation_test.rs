//! Format negotiation.

use image_optimizer_rs::negotiation::{negotiate_format, OutputFormat};

#[test]
fn explicit_param_wins() {
    let f = negotiate_format(Some(OutputFormat::Png), Some("image/webp,image/avif,*/*"));
    assert_eq!(f, OutputFormat::Png);
}

#[test]
fn accept_avif_downgrades_to_webp_in_v1() {
    let f = negotiate_format(None, Some("image/avif,image/webp,*/*"));
    // v1 has no AVIF encoder bundled; we transparently use WebP.
    assert_eq!(f, OutputFormat::Webp);
}

#[test]
fn accept_webp_picks_webp() {
    let f = negotiate_format(None, Some("image/webp,*/*"));
    assert_eq!(f, OutputFormat::Webp);
}

#[test]
fn accept_only_jpeg_picks_jpeg() {
    let f = negotiate_format(None, Some("image/jpeg"));
    assert_eq!(f, OutputFormat::Jpeg);
}

#[test]
fn no_accept_falls_back_to_jpeg() {
    let f = negotiate_format(None, None);
    assert_eq!(f, OutputFormat::Jpeg);
}

#[test]
fn explicit_avif_downgrades_to_webp() {
    let f = negotiate_format(Some(OutputFormat::Avif), None);
    assert_eq!(f, OutputFormat::Webp);
}
