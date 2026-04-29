//! OWASP default rule pack.
//!
//! Where the TS implementation runs `RegExp.test` for every pattern in series,
//! we take two shortcuts that compound to roughly an order-of-magnitude
//! speedup:
//!
//!   1. **Aho-Corasick** for the substring-style sets (scanner UAs, bot UAs,
//!      allowed bots, plus the keyword skeletons of SQLi/XSS/traversal). One
//!      pass over the input matches every pattern simultaneously and lights
//!      the SIMD path in the [`aho_corasick`] crate.
//!   2. **`regex::RegexSet`** for the small residual set of structural
//!      patterns that genuinely need regex semantics (e.g. quoted-or-equals
//!      tautologies). `RegexSet` shares its DFA across patterns, so we pay
//!      one DFA traversal per haystack instead of N.
//!
//! Both layers are case-insensitive. Both compile exactly once via
//! [`once_cell::sync::Lazy`].

use std::sync::Arc;

use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};
use once_cell::sync::Lazy;
use regex::RegexSet;

/// SQLi keyword fragments — caught by Aho-Corasick fast path.
const SQLI_KEYWORDS: &[&str] = &[
    "union select",
    "union all select",
    "select * from",
    "drop table",
    "drop database",
    "; drop ",
    "; delete ",
    "; update ",
    "; insert ",
    "; truncate ",
    "; alter ",
    "xp_cmdshell",
    "pg_sleep(",
    "sleep(",
    "benchmark(",
    "/*",
    "*/",
    "-- ",
];

/// SQLi structural patterns — only the things keywords miss. Anchored with
/// case-insensitive flag.
const SQLI_REGEXES: &[&str] = &[
    // `OR 1=1`, `AND '1'='1'`, etc.
    r#"(?i)\b(or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+"#,
    // quoted tautologies
    r#"(?i)["']\s*(?:or|and)\s+["']?[a-z0-9_]+["']?\s*=\s*["']?[a-z0-9_]+"#,
    // SELECT ... FROM
    r"(?i)\bselect\s+.+\s+from\b",
];

/// XSS keyword fragments.
const XSS_KEYWORDS: &[&str] = &[
    "<script",
    "</script",
    "javascript:",
    "document.cookie",
    "<iframe",
    "onerror=",
    "onclick=",
    "onload=",
    "onmouseover=",
    "onfocus=",
    "onblur=",
    "eval(",
];

/// XSS structural patterns.
const XSS_REGEXES: &[&str] = &[
    r"(?i)<\s*script[^>]*>",
    r"(?i)<\s*/\s*script\s*>",
    r"(?i)<\s*iframe[^>]*>",
    r"(?i)<\s*img[^>]*\bonerror\s*=",
    r"(?i)\bjavascript\s*:",
    r"(?i)\bon(?:click|error|load|mouseover|focus|blur)\s*=",
];

/// Path-traversal fragments.
const TRAVERSAL_KEYWORDS: &[&str] = &[
    "../",
    "..\\",
    "..;",
    "/etc/passwd",
    "%2e%2e/",
    "%2e%2e\\",
    "%c0%ae%c0%ae",
    "c:\\windows\\system32",
];

const TRAVERSAL_REGEXES: &[&str] = &[
    r"(?i)\.\.[/\\]",
    r"(?i)%2e%2e[%2f%5c]",
    r"(?i)%c0%ae%c0%ae",
    r"(?i)\.\.;",
    r"(?i)/etc/passwd",
    r"(?i)c:\\windows\\system32",
];

/// Scanner / pen-test User-Agent blacklist (substring, case-insensitive).
const SCANNER_UAS: &[&str] = &[
    "sqlmap",
    "nikto",
    "zgrab",
    "masscan",
    "nmap",
    "acunetix",
    "openvas",
    "nessus",
    "burpsuite",
    "wpscan",
    "dirbuster",
    "gobuster",
    "wfuzz",
    "havij",
];

const BOT_UAS: &[&str] = &[
    "bot",
    "crawler",
    "spider",
    "scraper",
    "headless",
    "phantomjs",
    "selenium",
    "puppeteer",
];

const ALLOWED_BOTS: &[&str] = &[
    "googlebot",
    "bingbot",
    "duckduckbot",
    "yandexbot",
    "baiduspider",
    "slackbot",
    "twitterbot",
    "linkedinbot",
    "facebookexternalhit",
    "applebot",
];

/// One pre-compiled OWASP automaton bundle. Cheap to clone — internally an
/// `Arc` per matcher.
#[derive(Debug)]
pub struct OwaspPack {
    sqli_ac: AhoCorasick,
    sqli_re: RegexSet,
    xss_ac: AhoCorasick,
    xss_re: RegexSet,
    traversal_ac: AhoCorasick,
    traversal_re: RegexSet,
    scanner_ua_ac: AhoCorasick,
    bot_ua_ac: AhoCorasick,
    allowed_bot_ac: AhoCorasick,
    scanner_uas: Vec<&'static str>,
    bot_uas: Vec<&'static str>,
    allowed_bots: Vec<&'static str>,
}

fn build_ac(patterns: &[&str]) -> AhoCorasick {
    AhoCorasickBuilder::new()
        .ascii_case_insensitive(true)
        .match_kind(MatchKind::LeftmostFirst)
        .build(patterns)
        .expect("OWASP keyword set is non-empty and valid")
}

fn build_re(patterns: &[&str]) -> RegexSet {
    RegexSet::new(patterns).expect("OWASP regex set must compile")
}

impl OwaspPack {
    /// Build the canonical pack. Idempotent — see [`owasp_pack`] for the
    /// process-wide singleton.
    pub fn build() -> Self {
        Self {
            sqli_ac: build_ac(SQLI_KEYWORDS),
            sqli_re: build_re(SQLI_REGEXES),
            xss_ac: build_ac(XSS_KEYWORDS),
            xss_re: build_re(XSS_REGEXES),
            traversal_ac: build_ac(TRAVERSAL_KEYWORDS),
            traversal_re: build_re(TRAVERSAL_REGEXES),
            scanner_ua_ac: build_ac(SCANNER_UAS),
            bot_ua_ac: build_ac(BOT_UAS),
            allowed_bot_ac: build_ac(ALLOWED_BOTS),
            scanner_uas: SCANNER_UAS.to_vec(),
            bot_uas: BOT_UAS.to_vec(),
            allowed_bots: ALLOWED_BOTS.to_vec(),
        }
    }

    pub fn is_sqli(&self, haystack: &str) -> bool {
        self.sqli_ac.is_match(haystack) || self.sqli_re.is_match(haystack)
    }

    pub fn is_xss(&self, haystack: &str) -> bool {
        self.xss_ac.is_match(haystack) || self.xss_re.is_match(haystack)
    }

    pub fn is_traversal(&self, haystack: &str) -> bool {
        self.traversal_ac.is_match(haystack) || self.traversal_re.is_match(haystack)
    }

    pub fn is_scanner_ua(&self, ua: &str) -> bool {
        self.scanner_ua_ac.is_match(ua)
    }

    pub fn is_bot_ua(&self, ua: &str) -> bool {
        self.bot_ua_ac.is_match(ua)
    }

    pub fn is_allowed_bot(&self, ua: &str) -> bool {
        self.allowed_bot_ac.is_match(ua)
    }

    pub fn scanner_uas(&self) -> &[&'static str] {
        &self.scanner_uas
    }

    pub fn bot_uas(&self) -> &[&'static str] {
        &self.bot_uas
    }

    pub fn allowed_bots(&self) -> &[&'static str] {
        &self.allowed_bots
    }
}

/// Process-wide OWASP pack singleton. Only built once, regardless of how many
/// engine instances spin up.
pub fn owasp_pack() -> Arc<OwaspPack> {
    static PACK: Lazy<Arc<OwaspPack>> = Lazy::new(|| Arc::new(OwaspPack::build()));
    PACK.clone()
}

/// Generic substring contains check used by the engine outside of the OWASP
/// fast path (e.g. ad-hoc UA fragment lists).
pub fn ua_contains(ua: &str, fragments: &[&str]) -> bool {
    let lower = ua.to_ascii_lowercase();
    fragments.iter().any(|f| lower.contains(f))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqli_union_select() {
        let p = OwaspPack::build();
        assert!(p.is_sqli("/?id=1 UNION SELECT password FROM users"));
        assert!(p.is_sqli("?q=' or 1=1 --"));
        assert!(!p.is_sqli("/normal/path"));
    }

    #[test]
    fn xss_script_tag() {
        let p = OwaspPack::build();
        assert!(p.is_xss("hello <script>alert(1)</script>"));
        assert!(p.is_xss("<img src=x onerror=alert(1)>"));
        assert!(p.is_xss("javascript:alert(1)"));
        assert!(!p.is_xss("benign text"));
    }

    #[test]
    fn traversal_dot_dot_slash() {
        let p = OwaspPack::build();
        assert!(p.is_traversal("/files/../etc/passwd"));
        assert!(p.is_traversal("/x/%2e%2e/etc"));
        assert!(!p.is_traversal("/normal/path"));
    }

    #[test]
    fn scanner_ua_detected() {
        let p = OwaspPack::build();
        assert!(p.is_scanner_ua("sqlmap/1.6 (https://sqlmap.org)"));
        assert!(p.is_scanner_ua("Mozilla/5.0 nikto"));
        assert!(!p.is_scanner_ua("Mozilla/5.0 (X11; Linux x86_64)"));
    }

    #[test]
    fn allowed_bot_recognised() {
        let p = OwaspPack::build();
        assert!(p.is_allowed_bot("Mozilla/5.0 (compatible; Googlebot/2.1)"));
        assert!(p.is_bot_ua("Mozilla/5.0 (compatible; Googlebot/2.1)"));
    }
}
