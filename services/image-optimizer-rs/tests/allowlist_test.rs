//! Source allowlist enforcement — SSRF defence-in-depth.

use image_optimizer_rs::source::SourceAllowlist;

#[test]
fn exact_host_allowed() {
    let a = SourceAllowlist::new(["cdn.example.com"]);
    a.check("https://cdn.example.com/a.png").unwrap();
}

#[test]
fn exact_host_subdomain_rejected() {
    let a = SourceAllowlist::new(["cdn.example.com"]);
    let err = a.check("https://evil.cdn.example.com/a.png").unwrap_err();
    assert!(err.to_string().contains("allowlist"));
}

#[test]
fn wildcard_subdomain_allowed() {
    let a = SourceAllowlist::new([".example.com"]);
    a.check("https://cdn.example.com/a.png").unwrap();
    a.check("https://images.cdn.example.com/a.png").unwrap();
    a.check("https://example.com/a.png").unwrap();
}

#[test]
fn wildcard_does_not_match_unrelated() {
    let a = SourceAllowlist::new([".example.com"]);
    a.check("https://example.org/a.png").unwrap_err();
    a.check("https://notexample.com/a.png").unwrap_err();
}

#[test]
fn ip_addresses_rejected() {
    let a = SourceAllowlist::new([".example.com"]);
    a.check("http://127.0.0.1/a.png").unwrap_err();
    a.check("http://10.0.0.1/a.png").unwrap_err();
    a.check("http://[::1]/a.png").unwrap_err();
}

#[test]
fn non_http_schemes_rejected() {
    let a = SourceAllowlist::new(["cdn.example.com"]);
    a.check("file:///etc/passwd").unwrap_err();
    a.check("gopher://cdn.example.com/").unwrap_err();
}

#[test]
fn empty_allowlist_blocks_everything() {
    let a = SourceAllowlist::new::<[&str; 0], &str>([]);
    a.check("https://cdn.example.com/a.png").unwrap_err();
}

#[test]
fn malformed_url_rejected() {
    let a = SourceAllowlist::new([".example.com"]);
    let err = a.check("not a url").unwrap_err();
    assert!(err.to_string().contains("malformed"));
}

#[test]
fn from_env_value_parses_csv() {
    let a = SourceAllowlist::from_env_value("cdn.example.com, .images.example.com ,");
    a.check("https://cdn.example.com/x").unwrap();
    a.check("https://foo.images.example.com/x").unwrap();
    a.check("https://other.com/x").unwrap_err();
}
