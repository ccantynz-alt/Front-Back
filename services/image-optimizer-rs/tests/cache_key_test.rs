//! Cache-key determinism. Same canonical inputs → same hash. Different
//! inputs → different hash. The TS service is intentionally identical so
//! cache lines can be shared.

use image_optimizer_rs::negotiation::OutputFormat;
use image_optimizer_rs::params::{cache_key, TransformParams};

fn p(q: &str) -> TransformParams {
    TransformParams::from_query(q).unwrap()
}

#[test]
fn same_inputs_same_key() {
    let a = cache_key(
        &p("source=https://cdn.example.com/a.png&w=400&q=80"),
        OutputFormat::Webp,
    );
    let b = cache_key(
        &p("source=https://cdn.example.com/a.png&w=400&q=80"),
        OutputFormat::Webp,
    );
    assert_eq!(a, b);
    assert_eq!(a.len(), 64); // SHA-256 hex
}

#[test]
fn dpr_collapse_into_effective_dims() {
    // ?w=200 should hash equivalent to ?w=100&dpr=2 (same effective width).
    let a = cache_key(
        &p("source=https://cdn.example.com/a.png&w=200"),
        OutputFormat::Webp,
    );
    let b = cache_key(
        &p("source=https://cdn.example.com/a.png&w=100&dpr=2"),
        OutputFormat::Webp,
    );
    assert_eq!(a, b);
}

#[test]
fn different_format_different_key() {
    let a = cache_key(
        &p("source=https://cdn.example.com/a.png&w=200"),
        OutputFormat::Webp,
    );
    let b = cache_key(
        &p("source=https://cdn.example.com/a.png&w=200"),
        OutputFormat::Jpeg,
    );
    assert_ne!(a, b);
}

#[test]
fn different_quality_different_key() {
    let a = cache_key(
        &p("source=https://cdn.example.com/a.png&q=80"),
        OutputFormat::Webp,
    );
    let b = cache_key(
        &p("source=https://cdn.example.com/a.png&q=90"),
        OutputFormat::Webp,
    );
    assert_ne!(a, b);
}

#[test]
fn fit_changes_key() {
    let a = cache_key(
        &p("source=https://cdn.example.com/a.png&w=200&fit=cover"),
        OutputFormat::Webp,
    );
    let b = cache_key(
        &p("source=https://cdn.example.com/a.png&w=200&fit=contain"),
        OutputFormat::Webp,
    );
    assert_ne!(a, b);
}
