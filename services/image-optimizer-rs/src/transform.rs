//! Pure transform functions — resize, blur, quality, format conversion.
//!
//! Inputs are raw source bytes; outputs are encoded bytes plus the resolved
//! output format. No I/O; no Axum awareness — designed to be benchmarked and
//! unit-tested in isolation.

use std::io::Cursor;

use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat};

use crate::error::{Error, Result};
use crate::negotiation::OutputFormat;
use crate::params::{Fit, TransformParams};

/// Output of a transform pass.
#[derive(Clone, Debug)]
pub struct TransformOutput {
    pub bytes: Vec<u8>,
    pub format: OutputFormat,
    pub width: u32,
    pub height: u32,
}

/// Apply the full transform pipeline.
///
/// Order matters and matches sharp's pipeline order: resize → blur → encode.
/// `output` is the negotiated/explicit format from `negotiate_format`.
pub fn apply_transforms(
    source_bytes: &[u8],
    params: &TransformParams,
    output: OutputFormat,
) -> Result<TransformOutput> {
    let mut img =
        image::load_from_memory(source_bytes).map_err(|e| Error::Decode(e.to_string()))?;

    img = resize(&img, params)?;

    if let Some(blur) = params.blur {
        if blur > 0 {
            // sharp's blur sigma roughly maps 0..100 → 0..30 sigma. We keep
            // the same conservative scaling so cache keys stay meaningful.
            let sigma = (blur as f32 / 100.0) * 30.0;
            img = img.blur(sigma);
        }
    }

    let (w, h) = img.dimensions();
    let bytes = encode(
        &img,
        output,
        params.quality.unwrap_or(default_quality(output)),
    )?;
    Ok(TransformOutput {
        bytes,
        format: output,
        width: w,
        height: h,
    })
}

fn default_quality(format: OutputFormat) -> u8 {
    match format {
        OutputFormat::Webp | OutputFormat::Avif => 80,
        OutputFormat::Jpeg => 85,
        OutputFormat::Png => 100, // PNG ignores quality; placeholder.
    }
}

fn resize(img: &DynamicImage, params: &TransformParams) -> Result<DynamicImage> {
    let target_w = params.effective_width();
    let target_h = params.effective_height();
    if target_w.is_none() && target_h.is_none() {
        return Ok(img.clone());
    }

    let (sw, sh) = img.dimensions();
    let (tw, th) = (target_w.unwrap_or(sw), target_h.unwrap_or(sh));
    if tw == 0 || th == 0 {
        return Err(Error::DimensionsExceeded);
    }

    // Lanczos3 is the closest to sharp's default. CatmullRom is also good and
    // ~2× faster; we choose Lanczos3 because v1 prioritises quality parity.
    let filter = FilterType::Lanczos3;

    let out = match params.fit {
        Fit::Inside => img.resize(tw, th, filter),
        Fit::Contain => img.resize(tw, th, filter),
        Fit::Cover => img.resize_to_fill(tw, th, filter),
        Fit::Fill => img.resize_exact(tw, th, filter),
    };
    Ok(out)
}

fn encode(img: &DynamicImage, format: OutputFormat, quality: u8) -> Result<Vec<u8>> {
    match format {
        OutputFormat::Webp => encode_webp(img, quality),
        OutputFormat::Avif => {
            // Should never reach here — `negotiate_format` downgrades AVIF
            // to WebP for v1. Keep the arm exhaustive though.
            encode_webp(img, quality)
        }
        OutputFormat::Jpeg => encode_via_image_crate(img, ImageFormat::Jpeg, Some(quality)),
        OutputFormat::Png => encode_via_image_crate(img, ImageFormat::Png, None),
    }
}

fn encode_webp(img: &DynamicImage, quality: u8) -> Result<Vec<u8>> {
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), w, h);
    let memory = encoder.encode(quality as f32);
    Ok(memory.to_vec())
}

fn encode_via_image_crate(
    img: &DynamicImage,
    format: ImageFormat,
    quality: Option<u8>,
) -> Result<Vec<u8>> {
    let mut buf = Cursor::new(Vec::with_capacity(64 * 1024));
    match (format, quality) {
        (ImageFormat::Jpeg, Some(q)) => {
            // JPEG encoder honours quality (1..=100). We have already
            // validated it, but clamp just in case for defence in depth.
            let q = q.clamp(1, 100);
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, q);
            encoder
                .encode_image(img)
                .map_err(|e| Error::Encode(e.to_string()))?;
        }
        _ => {
            img.write_to(&mut buf, format)
                .map_err(|e| Error::Encode(e.to_string()))?;
        }
    }
    Ok(buf.into_inner())
}
