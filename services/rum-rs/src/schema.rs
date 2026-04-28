//! Beacon payload schema.
//!
//! Mirrors the TS reference (Zod schema in `services/rum/`) so the JS
//! beacon does not need to change. We accept arbitrary extra fields and
//! ignore them — RUM payloads evolve faster than backend deploys.

use serde::{Deserialize, Serialize};

/// One RUM event submitted by the JS beacon.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeaconEvent {
    /// Tenant / site identifier.
    pub tenant_id: String,
    /// Page route (normalised, no query string).
    pub route: String,
    /// User agent string (truncated to 256 chars).
    #[serde(default)]
    pub user_agent: Option<String>,
    /// Connection type ("4g", "wifi", etc.).
    #[serde(default)]
    pub connection: Option<String>,
    /// Country (ISO-3166 alpha-2).
    #[serde(default)]
    pub country: Option<String>,
    /// Timestamp (ms since epoch).
    pub ts: u64,
    /// Core Web Vitals + custom metrics.
    pub metrics: Metrics,
    /// Optional session identifier.
    #[serde(default)]
    pub session_id: Option<String>,
}

/// Core Web Vitals + a few custom metrics.
///
/// All values are in milliseconds unless otherwise noted. Missing
/// metrics simply aren't recorded.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub struct Metrics {
    /// Largest Contentful Paint.
    #[serde(default, alias = "lcp")]
    pub lcp: Option<f64>,
    /// First Contentful Paint.
    #[serde(default, alias = "fcp")]
    pub fcp: Option<f64>,
    /// Interaction to Next Paint.
    #[serde(default, alias = "inp")]
    pub inp: Option<f64>,
    /// Cumulative Layout Shift (unitless).
    #[serde(default, alias = "cls")]
    pub cls: Option<f64>,
    /// Time to First Byte.
    #[serde(default, alias = "ttfb")]
    pub ttfb: Option<f64>,
    /// First Input Delay.
    #[serde(default, alias = "fid")]
    pub fid: Option<f64>,
}

impl Metrics {
    /// Iterate metrics that are present, yielding `(name, value_ms)`.
    pub fn present(&self) -> impl Iterator<Item = (&'static str, f64)> + '_ {
        [
            ("LCP", self.lcp),
            ("FCP", self.fcp),
            ("INP", self.inp),
            ("CLS", self.cls),
            ("TTFB", self.ttfb),
            ("FID", self.fid),
        ]
        .into_iter()
        .filter_map(|(name, v)| v.map(|x| (name, x)))
    }
}

/// Either a single event or a batch of them. The beacon sends batches
/// when navigating away — both shapes must be accepted on `/collect`.
///
/// `Single` is boxed so the enum stays compact — the typical batch
/// path doesn't pay for the largest variant.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum BeaconPayload {
    Batch { events: Vec<BeaconEvent> },
    Single(Box<BeaconEvent>),
}

impl BeaconPayload {
    pub fn into_events(self) -> Vec<BeaconEvent> {
        match self {
            Self::Batch { events } => events,
            Self::Single(e) => vec![*e],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_single_event() {
        let json = r#"{
            "tenantId": "site-1",
            "route": "/home",
            "ts": 1700000000000,
            "metrics": { "LCP": 1234.5, "FCP": 800.0, "CLS": 0.05 }
        }"#;
        let p: BeaconPayload = serde_json::from_str(json).expect("parses");
        let evs = p.into_events();
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].route, "/home");
        assert!((evs[0].metrics.lcp.unwrap() - 1234.5).abs() < f64::EPSILON);
    }

    #[test]
    fn deserialize_batch() {
        let json = r#"{
            "events": [
                {"tenantId":"t","route":"/a","ts":1,"metrics":{"LCP":100}},
                {"tenantId":"t","route":"/b","ts":2,"metrics":{"INP":50}}
            ]
        }"#;
        let p: BeaconPayload = serde_json::from_str(json).expect("parses");
        let evs = p.into_events();
        assert_eq!(evs.len(), 2);
    }

    #[test]
    fn metrics_lowercase_alias() {
        // Some beacons send lowercase keys.
        let json = r#"{ "lcp": 12.0, "ttfb": 5.0 }"#;
        let m: Metrics = serde_json::from_str(json).expect("parses");
        assert!((m.lcp.unwrap() - 12.0).abs() < f64::EPSILON);
        assert!((m.ttfb.unwrap() - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn metrics_present_iterates_only_set() {
        let m = Metrics {
            lcp: Some(1.0),
            inp: Some(2.0),
            ..Default::default()
        };
        let names: Vec<&str> = m.present().map(|(n, _)| n).collect();
        assert_eq!(names, vec!["LCP", "INP"]);
    }
}
