//! Throughput benchmark — Lanczos3 resize + WebP encode on a 256×256 source.
//!
//! Run with `cargo bench --bench transform`. Compare against the TS service's
//! sharp-backed equivalent on the same image to confirm the 10× target.

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use image::{ImageBuffer, Rgba};
use image_optimizer_rs::negotiation::OutputFormat;
use image_optimizer_rs::params::TransformParams;
use image_optimizer_rs::transform::apply_transforms;
use std::io::Cursor;

fn make_jpeg(size: u32) -> Vec<u8> {
    let img = ImageBuffer::from_fn(size, size, |x, y| {
        let r = ((x * 2) % 256) as u8;
        let g = ((y * 2) % 256) as u8;
        let b = (((x ^ y) * 3) % 256) as u8;
        Rgba([r, g, b, 255])
    });
    let mut buf = Cursor::new(Vec::new());
    let dynamic = image::DynamicImage::ImageRgba8(img).to_rgb8();
    image::DynamicImage::ImageRgb8(dynamic)
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .unwrap();
    buf.into_inner()
}

fn bench_transform(c: &mut Criterion) {
    let src = make_jpeg(256);
    let params = TransformParams::from_query(
        "source=https://cdn.example.com/a.jpg&w=128&h=128&q=80&fit=cover",
    )
    .unwrap();

    let mut group = c.benchmark_group("transform");
    group.throughput(Throughput::Bytes(src.len() as u64));
    group.bench_function("resize_to_128x128_webp", |b| {
        b.iter(|| {
            let out = apply_transforms(black_box(&src), black_box(&params), OutputFormat::Webp)
                .expect("transform succeeds");
            black_box(out.bytes.len());
        })
    });
    group.bench_function("resize_to_128x128_jpeg", |b| {
        b.iter(|| {
            let out = apply_transforms(black_box(&src), black_box(&params), OutputFormat::Jpeg)
                .expect("transform succeeds");
            black_box(out.bytes.len());
        })
    });
    group.finish();
}

criterion_group!(benches, bench_transform);
criterion_main!(benches);
