//! Param parsing & validation.

use image_optimizer_rs::negotiation::OutputFormat;
use image_optimizer_rs::params::{Fit, TransformParams, MAX_WIDTH};

#[test]
fn parses_minimum_query() {
    let p = TransformParams::from_query("source=https://cdn.example.com/a.png").unwrap();
    assert_eq!(p.source, "https://cdn.example.com/a.png");
    assert_eq!(p.width, None);
    assert_eq!(p.fit, Fit::Inside);
}

#[test]
fn parses_full_query_with_dpr() {
    let q = "source=https%3A%2F%2Fcdn.example.com%2Fa.png&w=400&h=300&q=80&blur=10&dpr=2&fit=cover&format=webp";
    let p = TransformParams::from_query(q).unwrap();
    assert_eq!(p.source, "https://cdn.example.com/a.png");
    assert_eq!(p.width, Some(400));
    assert_eq!(p.height, Some(300));
    assert_eq!(p.quality, Some(80));
    assert_eq!(p.blur, Some(10));
    assert_eq!(p.dpr, Some(2));
    assert_eq!(p.fit, Fit::Cover);
    assert_eq!(p.format, Some(OutputFormat::Webp));
    assert_eq!(p.effective_width(), Some(800));
    assert_eq!(p.effective_height(), Some(600));
}

#[test]
fn rejects_oversized_width() {
    let q = format!("source=https://cdn.example.com/a.png&w={}", MAX_WIDTH + 1);
    let err = TransformParams::from_query(&q).unwrap_err();
    let s = err.to_string();
    assert!(s.contains("width"), "got: {s}");
}

#[test]
fn rejects_zero_width() {
    let err = TransformParams::from_query("source=https://cdn.example.com/a.png&w=0").unwrap_err();
    assert!(err.to_string().contains("width"));
}

#[test]
fn rejects_quality_out_of_range() {
    let err = TransformParams::from_query("source=https://cdn.example.com/a.png&q=0").unwrap_err();
    assert!(err.to_string().contains("quality"));
    let err =
        TransformParams::from_query("source=https://cdn.example.com/a.png&q=101").unwrap_err();
    assert!(err.to_string().contains("quality"));
}

#[test]
fn missing_source_is_error() {
    let err = TransformParams::from_query("w=400").unwrap_err();
    assert!(err.to_string().contains("source"));
}

#[test]
fn dpr_caps_at_max_dimensions() {
    let q = format!(
        "source=https://cdn.example.com/a.png&w={}&dpr=4",
        MAX_WIDTH - 1
    );
    let p = TransformParams::from_query(&q).unwrap();
    assert_eq!(p.effective_width(), Some(MAX_WIDTH));
}

#[test]
fn unknown_fit_rejected() {
    let err = TransformParams::from_query("source=https://cdn.example.com/a.png&fit=stretch")
        .unwrap_err();
    assert!(err.to_string().contains("fit"));
}

#[test]
fn unknown_format_rejected() {
    let err = TransformParams::from_query("source=https://cdn.example.com/a.png&format=tiff")
        .unwrap_err();
    assert!(err.to_string().contains("format"));
}
