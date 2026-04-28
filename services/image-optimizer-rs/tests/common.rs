//! Shared test helpers — generates small test images on the fly so we don't
//! need binary fixtures committed to the repo.

#![allow(dead_code)]

use image::{ImageBuffer, Rgba};
use std::io::Cursor;

/// Generate a synthetic 64×48 RGBA gradient PNG. Total payload <2KB.
pub fn make_test_png() -> Vec<u8> {
    let img = ImageBuffer::from_fn(64, 48, |x, y| {
        let r = ((x * 4) % 256) as u8;
        let g = ((y * 5) % 256) as u8;
        let b = (((x + y) * 3) % 256) as u8;
        Rgba([r, g, b, 255])
    });
    let mut buf = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut buf, image::ImageFormat::Png)
        .expect("encode test png");
    buf.into_inner()
}

/// Slightly larger 256×256 JPEG used by the benchmark and one slow test.
pub fn make_test_jpeg(size: u32) -> Vec<u8> {
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
        .expect("encode test jpeg");
    buf.into_inner()
}
