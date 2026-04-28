//! End-to-end transform tests using synthetic in-memory images.

mod common;

use image_optimizer_rs::negotiation::OutputFormat;
use image_optimizer_rs::params::TransformParams;
use image_optimizer_rs::transform::apply_transforms;

#[test]
fn resize_preserves_aspect_inside() {
    let png = common::make_test_png();
    let params =
        TransformParams::from_query("source=https://cdn.example.com/a.png&w=32&fit=inside")
            .unwrap();
    let out = apply_transforms(&png, &params, OutputFormat::Webp).unwrap();
    assert!(out.width <= 32);
    assert!(out.height <= 48);
    assert_eq!(out.format, OutputFormat::Webp);
    assert!(!out.bytes.is_empty());
    // WebP magic: "RIFF....WEBP".
    assert_eq!(&out.bytes[..4], b"RIFF");
    assert_eq!(&out.bytes[8..12], b"WEBP");
}

#[test]
fn resize_cover_fills_box() {
    let png = common::make_test_png();
    let params =
        TransformParams::from_query("source=https://cdn.example.com/a.png&w=20&h=20&fit=cover")
            .unwrap();
    let out = apply_transforms(&png, &params, OutputFormat::Jpeg).unwrap();
    assert_eq!(out.width, 20);
    assert_eq!(out.height, 20);
    // JPEG SOI marker.
    assert_eq!(&out.bytes[..2], &[0xFF, 0xD8]);
}

#[test]
fn fit_fill_stretches_exact() {
    let png = common::make_test_png();
    let params =
        TransformParams::from_query("source=https://cdn.example.com/a.png&w=10&h=80&fit=fill")
            .unwrap();
    let out = apply_transforms(&png, &params, OutputFormat::Png).unwrap();
    assert_eq!(out.width, 10);
    assert_eq!(out.height, 80);
}

#[test]
fn no_dimensions_keeps_size() {
    let png = common::make_test_png();
    let params = TransformParams::from_query("source=https://cdn.example.com/a.png").unwrap();
    let out = apply_transforms(&png, &params, OutputFormat::Webp).unwrap();
    assert_eq!(out.width, 64);
    assert_eq!(out.height, 48);
}

#[test]
fn blur_changes_output() {
    let png = common::make_test_png();
    let sharp = TransformParams::from_query("source=https://cdn.example.com/a.png").unwrap();
    let blurry =
        TransformParams::from_query("source=https://cdn.example.com/a.png&blur=50").unwrap();
    let a = apply_transforms(&png, &sharp, OutputFormat::Png).unwrap();
    let b = apply_transforms(&png, &blurry, OutputFormat::Png).unwrap();
    assert_ne!(a.bytes, b.bytes);
}

#[test]
fn invalid_source_bytes_decode_error() {
    let bad = b"not an image at all".to_vec();
    let params = TransformParams::from_query("source=https://cdn.example.com/a.png").unwrap();
    let err = apply_transforms(&bad, &params, OutputFormat::Webp).unwrap_err();
    assert!(
        err.to_string().to_lowercase().contains("decode")
            || err.to_string().to_lowercase().contains("format")
    );
}

#[test]
fn dpr_doubles_effective_dimensions() {
    let png = common::make_test_png();
    let params = TransformParams::from_query(
        "source=https://cdn.example.com/a.png&w=16&h=12&dpr=2&fit=fill",
    )
    .unwrap();
    let out = apply_transforms(&png, &params, OutputFormat::Png).unwrap();
    assert_eq!(out.width, 32);
    assert_eq!(out.height, 24);
}

#[test]
fn quality_changes_jpeg_size() {
    // Use a larger image so quality changes are observable.
    let jpeg = common::make_test_jpeg(128);
    let high = TransformParams::from_query("source=https://cdn.example.com/a.jpg&q=90").unwrap();
    let low = TransformParams::from_query("source=https://cdn.example.com/a.jpg&q=10").unwrap();
    let a = apply_transforms(&jpeg, &high, OutputFormat::Jpeg).unwrap();
    let b = apply_transforms(&jpeg, &low, OutputFormat::Jpeg).unwrap();
    assert!(
        a.bytes.len() > b.bytes.len(),
        "high q={} low q={}",
        a.bytes.len(),
        b.bytes.len()
    );
}
