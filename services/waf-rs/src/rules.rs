//! Core types + the pure rule-evaluation engine.
//!
//! The evaluation order matches `services/waf/src/engine.ts` byte-for-byte so
//! flipping `WAF_BACKEND=rust` is transparent to consumers:
//!   1. global IP allowlist (engine option)
//!   2. matched-rule IP allowlist
//!   3. matched-rule IP denylist
//!   4. scanner UA — terminal deny
//!   5. per-rule terminal verdicts (allow / deny / method-not-allowed / body deny)
//!   6. OWASP default pack (SQLi, XSS, traversal)
//!   7. bot detection (allowed-bot whitelist short-circuits later rate-limit)
//!   8. requireAuth — 401 if not authenticated
//!   9. rate limit (rule-level wins over engine default)
//!  10. default allow

use std::sync::Arc;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::owasp::{ua_contains, OwaspPack};
use crate::rate_limit::{build_key, RateLimitResult, RateLimiter};
use crate::registry::RuleRegistry;

/// HTTP method enum. `*` is a wildcard that matches any method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    #[serde(rename = "GET")]
    Get,
    #[serde(rename = "POST")]
    Post,
    #[serde(rename = "PUT")]
    Put,
    #[serde(rename = "PATCH")]
    Patch,
    #[serde(rename = "DELETE")]
    Delete,
    #[serde(rename = "HEAD")]
    Head,
    #[serde(rename = "OPTIONS")]
    Options,
    #[serde(rename = "*")]
    Any,
}

impl HttpMethod {
    /// Parse a wire string (case-insensitive) into a method. Unknown verbs
    /// fall back to `*` so the engine still evaluates the rest of the pipeline
    /// rather than crashing on exotic HTTP methods.
    pub fn from_str_lossy(s: &str) -> Self {
        match s.to_ascii_uppercase().as_str() {
            "GET" => Self::Get,
            "POST" => Self::Post,
            "PUT" => Self::Put,
            "PATCH" => Self::Patch,
            "DELETE" => Self::Delete,
            "HEAD" => Self::Head,
            "OPTIONS" => Self::Options,
            _ => Self::Any,
        }
    }
}

/// Rate-limit aggregation scope.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RateLimitScope {
    #[default]
    Ip,
    Tenant,
}

/// Rate-limit algorithm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum RateLimitAlgorithm {
    #[default]
    TokenBucket,
    SlidingWindow,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub limit: u32,
    #[serde(rename = "windowMs")]
    pub window_ms: u64,
    #[serde(default)]
    pub scope: RateLimitScope,
    #[serde(default)]
    pub algorithm: RateLimitAlgorithm,
}

/// A WAF rule. Mirrors `RuleSchema` in the TS reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub pattern: String,
    #[serde(default = "default_methods")]
    pub methods: Vec<HttpMethod>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub allow: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deny: Option<bool>,
    #[serde(rename = "rateLimit", skip_serializing_if = "Option::is_none", default)]
    pub rate_limit: Option<RateLimitConfig>,
    #[serde(
        rename = "requireAuth",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub require_auth: Option<bool>,
    #[serde(default = "default_priority")]
    pub priority: i32,
    #[serde(
        rename = "ipAllowlist",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub ip_allowlist: Option<Vec<String>>,
    #[serde(
        rename = "ipDenylist",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub ip_denylist: Option<Vec<String>>,
    #[serde(
        rename = "bodyDenyPatterns",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub body_deny_patterns: Option<Vec<String>>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

fn default_methods() -> Vec<HttpMethod> {
    vec![HttpMethod::Any]
}

fn default_priority() -> i32 {
    100
}

/// Wire format for `POST /admin/tenants/:tenantId/rules` — id and tenantId are
/// supplied by the route, createdAt is server-stamped.
#[derive(Debug, Clone, Deserialize)]
pub struct NewRule {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub pattern: String,
    #[serde(default = "default_methods")]
    pub methods: Vec<HttpMethod>,
    #[serde(default)]
    pub allow: Option<bool>,
    #[serde(default)]
    pub deny: Option<bool>,
    #[serde(rename = "rateLimit", default)]
    pub rate_limit: Option<RateLimitConfig>,
    #[serde(rename = "requireAuth", default)]
    pub require_auth: Option<bool>,
    #[serde(default = "default_priority")]
    pub priority: i32,
    #[serde(rename = "ipAllowlist", default)]
    pub ip_allowlist: Option<Vec<String>>,
    #[serde(rename = "ipDenylist", default)]
    pub ip_denylist: Option<Vec<String>>,
    #[serde(rename = "bodyDenyPatterns", default)]
    pub body_deny_patterns: Option<Vec<String>>,
}

impl NewRule {
    /// Inflate a [`NewRule`] into a fully-formed [`Rule`].
    pub fn into_rule(self, tenant_id: String, fallback_id: String, now: i64) -> Rule {
        Rule {
            id: self.id.unwrap_or(fallback_id),
            tenant_id,
            description: self.description,
            pattern: self.pattern,
            methods: self.methods,
            allow: self.allow,
            deny: self.deny,
            rate_limit: self.rate_limit,
            require_auth: self.require_auth,
            priority: self.priority,
            ip_allowlist: self.ip_allowlist,
            ip_denylist: self.ip_denylist,
            body_deny_patterns: self.body_deny_patterns,
            created_at: now,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Decision {
    Allow,
    Deny,
    RateLimited,
    AuthRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Reason {
    IpAllowlist,
    IpDenylist,
    DefaultAllow,
    RuleAllow,
    RuleDeny,
    OwaspSqli,
    OwaspXss,
    OwaspTraversal,
    ScannerUa,
    BotUa,
    RateLimit,
    AuthRequired,
    MethodNotAllowed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Outcome {
    pub decision: Decision,
    pub reason: Reason,
    #[serde(rename = "ruleId", skip_serializing_if = "Option::is_none", default)]
    pub rule_id: Option<String>,
    #[serde(
        rename = "retryAfter",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub retry_after: Option<u64>,
}

/// All inputs the evaluator needs from the host request.
#[derive(Debug, Clone)]
pub struct RequestContext<'a> {
    pub tenant_id: &'a str,
    pub method: HttpMethod,
    pub pathname: &'a str,
    pub ip: &'a str,
    pub user_agent: &'a str,
    pub authenticated: bool,
    pub body: Option<&'a str>,
    pub query: &'a str,
    /// Wall clock injected for deterministic tests.
    pub now: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    pub ts: i64,
    pub ip: String,
    pub method: HttpMethod,
    pub pathname: String,
    #[serde(default, rename = "userAgent")]
    pub user_agent: String,
    pub outcome: Outcome,
}

/// Compile-time engine options.
#[derive(Debug, Clone, Default)]
pub struct EngineOptions {
    pub global_allow_ips: Vec<String>,
    pub default_rate_limit: Option<RateLimitConfig>,
    pub disable_owasp_defaults: bool,
}

/// The evaluator. Holds shared references to the registry, the rate limiter,
/// and the OWASP pack — none of which it owns. Cheap to clone.
#[derive(Clone)]
pub struct Engine {
    pub registry: Arc<RuleRegistry>,
    pub limiter: Arc<RateLimiter>,
    pub owasp: Arc<OwaspPack>,
    pub options: Arc<EngineOptions>,
}

impl Engine {
    pub fn new(
        registry: Arc<RuleRegistry>,
        limiter: Arc<RateLimiter>,
        owasp: Arc<OwaspPack>,
        options: EngineOptions,
    ) -> Self {
        Self {
            registry,
            limiter,
            owasp,
            options: Arc::new(options),
        }
    }

    /// Evaluate one request. Pure (modulo rate-limiter state).
    pub fn evaluate(&self, ctx: &RequestContext<'_>) -> Outcome {
        let now = ctx.now;
        let owasp_enabled = !self.options.disable_owasp_defaults;

        // 0. Global allow.
        if self.options.global_allow_ips.iter().any(|ip| ip == ctx.ip) {
            return Outcome {
                decision: Decision::Allow,
                reason: Reason::IpAllowlist,
                rule_id: None,
                retry_after: None,
            };
        }

        // Snapshot tenant rules (already priority-sorted) and pre-compute matches.
        let snapshot = self.registry.snapshot(ctx.tenant_id);
        let mut matched: Vec<Arc<CompiledRule>> = Vec::with_capacity(snapshot.len());
        for cr in &snapshot {
            if cr.path_re.is_match(ctx.pathname) {
                matched.push(cr.clone());
            }
        }

        // 1. Rule-supplied IP allowlist.
        for cr in &matched {
            if let Some(list) = cr.rule.ip_allowlist.as_ref() {
                if list.iter().any(|ip| ip == ctx.ip) {
                    return Outcome {
                        decision: Decision::Allow,
                        reason: Reason::IpAllowlist,
                        rule_id: Some(cr.rule.id.clone()),
                        retry_after: None,
                    };
                }
            }
        }

        // 2. Rule-supplied IP denylist.
        for cr in &matched {
            if let Some(list) = cr.rule.ip_denylist.as_ref() {
                if list.iter().any(|ip| ip == ctx.ip) {
                    return Outcome {
                        decision: Decision::Deny,
                        reason: Reason::IpDenylist,
                        rule_id: Some(cr.rule.id.clone()),
                        retry_after: None,
                    };
                }
            }
        }

        // 3. Scanner UA.
        if !ctx.user_agent.is_empty() && self.owasp.is_scanner_ua(ctx.user_agent) {
            return Outcome {
                decision: Decision::Deny,
                reason: Reason::ScannerUa,
                rule_id: None,
                retry_after: None,
            };
        }

        // 4. Per-rule terminal verdicts in priority order.
        for cr in &matched {
            if cr.rule.allow.unwrap_or(false) {
                return Outcome {
                    decision: Decision::Allow,
                    reason: Reason::RuleAllow,
                    rule_id: Some(cr.rule.id.clone()),
                    retry_after: None,
                };
            }
            if cr.rule.deny.unwrap_or(false) {
                return Outcome {
                    decision: Decision::Deny,
                    reason: Reason::RuleDeny,
                    rule_id: Some(cr.rule.id.clone()),
                    retry_after: None,
                };
            }
            if !cr.rule.methods.is_empty()
                && !cr.rule.methods.contains(&HttpMethod::Any)
                && !cr.rule.methods.contains(&ctx.method)
            {
                return Outcome {
                    decision: Decision::Deny,
                    reason: Reason::MethodNotAllowed,
                    rule_id: Some(cr.rule.id.clone()),
                    retry_after: None,
                };
            }
            if !cr.body_deny_res.is_empty() {
                let haystack = build_haystack(ctx);
                for re in &cr.body_deny_res {
                    if re.is_match(&haystack) {
                        return Outcome {
                            decision: Decision::Deny,
                            reason: Reason::RuleDeny,
                            rule_id: Some(cr.rule.id.clone()),
                            retry_after: None,
                        };
                    }
                }
            }
        }

        // 5. OWASP default pack — Aho-Corasick (substr) + a small regex set.
        if owasp_enabled {
            let haystack = build_haystack(ctx);
            if self.owasp.is_sqli(&haystack) {
                return Outcome {
                    decision: Decision::Deny,
                    reason: Reason::OwaspSqli,
                    rule_id: None,
                    retry_after: None,
                };
            }
            if self.owasp.is_xss(&haystack) {
                return Outcome {
                    decision: Decision::Deny,
                    reason: Reason::OwaspXss,
                    rule_id: None,
                    retry_after: None,
                };
            }
            if self.owasp.is_traversal(&haystack) {
                return Outcome {
                    decision: Decision::Deny,
                    reason: Reason::OwaspTraversal,
                    rule_id: None,
                    retry_after: None,
                };
            }
        }

        // 6. Bot detection.
        let is_allowed_bot =
            !ctx.user_agent.is_empty() && ua_contains(ctx.user_agent, self.owasp.allowed_bots());
        let is_generic_bot =
            !ctx.user_agent.is_empty() && ua_contains(ctx.user_agent, self.owasp.bot_uas());

        // 7. Auth requirement.
        for cr in &matched {
            if cr.rule.require_auth.unwrap_or(false) && !ctx.authenticated {
                return Outcome {
                    decision: Decision::AuthRequired,
                    reason: Reason::AuthRequired,
                    rule_id: Some(cr.rule.id.clone()),
                    retry_after: None,
                };
            }
        }

        // 8. Rate limit.
        let rl_rule = matched.iter().find(|cr| cr.rule.rate_limit.is_some());
        let rl_cfg = rl_rule
            .and_then(|cr| cr.rule.rate_limit)
            .or(self.options.default_rate_limit);
        if let Some(cfg) = rl_cfg {
            if !is_allowed_bot {
                let key = build_key(cfg.scope, ctx.tenant_id, ctx.ip);
                let RateLimitResult {
                    allowed,
                    retry_after,
                } = self.limiter.check(&key, &cfg, now);
                if !allowed {
                    return Outcome {
                        decision: Decision::RateLimited,
                        reason: Reason::RateLimit,
                        rule_id: rl_rule.map(|cr| cr.rule.id.clone()),
                        retry_after: Some(retry_after),
                    };
                }
            }
        }

        if is_generic_bot && !is_allowed_bot {
            return Outcome {
                decision: Decision::Allow,
                reason: Reason::BotUa,
                rule_id: None,
                retry_after: None,
            };
        }

        Outcome {
            decision: Decision::Allow,
            reason: Reason::DefaultAllow,
            rule_id: None,
            retry_after: None,
        }
    }
}

fn build_haystack(ctx: &RequestContext<'_>) -> String {
    let body = ctx.body.unwrap_or("");
    let mut s = String::with_capacity(ctx.pathname.len() + ctx.query.len() + body.len() + 2);
    s.push_str(ctx.pathname);
    s.push('\n');
    s.push_str(ctx.query);
    s.push('\n');
    s.push_str(body);
    s
}

/// Pre-compiled rule. The registry keeps one per stored [`Rule`] so the hot
/// path never re-compiles regexes.
#[derive(Debug)]
pub struct CompiledRule {
    pub rule: Rule,
    pub path_re: Regex,
    pub body_deny_res: Vec<Regex>,
}

impl CompiledRule {
    /// Compile a [`Rule`]. Invalid regexes silently degrade to "matches
    /// nothing" so a single bad user pattern never crashes the WAF — same
    /// behaviour as the TS implementation.
    pub fn compile(rule: Rule) -> Self {
        let path_re = Regex::new(&rule.pattern).unwrap_or_else(|_| {
            // `\b\B` is unsatisfiable in the `regex` crate's literal mode; this
            // gives us "never matches" without needing a Result on the hot path.
            Regex::new("$.^").expect("trivial impossible regex compiles")
        });
        let body_deny_res = match rule.body_deny_patterns.as_ref() {
            Some(pats) => pats
                .iter()
                .filter_map(|p| {
                    // case-insensitive to match TS `new RegExp(pat, "i")`.
                    Regex::new(&format!("(?i){p}")).ok()
                })
                .collect(),
            None => Vec::new(),
        };
        Self {
            rule,
            path_re,
            body_deny_res,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::owasp::owasp_pack;
    use crate::rate_limit::RateLimiter;
    use crate::registry::RuleRegistry;

    fn engine_with(rules: Vec<Rule>) -> Engine {
        let registry = Arc::new(RuleRegistry::new());
        for r in rules {
            registry.upsert(r);
        }
        Engine::new(
            registry,
            Arc::new(RateLimiter::new()),
            owasp_pack(),
            EngineOptions::default(),
        )
    }

    fn ctx<'a>(path: &'a str, ip: &'a str, ua: &'a str) -> RequestContext<'a> {
        RequestContext {
            tenant_id: "t1",
            method: HttpMethod::Get,
            pathname: path,
            ip,
            user_agent: ua,
            authenticated: false,
            body: None,
            query: "",
            now: 0,
        }
    }

    fn deny_rule(id: &str, pattern: &str) -> Rule {
        Rule {
            id: id.into(),
            tenant_id: "t1".into(),
            description: None,
            pattern: pattern.into(),
            methods: vec![HttpMethod::Any],
            allow: None,
            deny: Some(true),
            rate_limit: None,
            require_auth: None,
            priority: 50,
            ip_allowlist: None,
            ip_denylist: None,
            body_deny_patterns: None,
            created_at: 0,
        }
    }

    #[test]
    fn default_allow_when_no_rules() {
        let e = engine_with(vec![]);
        let o = e.evaluate(&ctx("/", "1.2.3.4", ""));
        assert_eq!(o.decision, Decision::Allow);
        assert_eq!(o.reason, Reason::DefaultAllow);
    }

    #[test]
    fn rule_deny_blocks() {
        let e = engine_with(vec![deny_rule("r1", "^/admin")]);
        let o = e.evaluate(&ctx("/admin/users", "1.2.3.4", ""));
        assert_eq!(o.decision, Decision::Deny);
        assert_eq!(o.reason, Reason::RuleDeny);
        assert_eq!(o.rule_id.as_deref(), Some("r1"));
    }

    #[test]
    fn allow_overrides_deny_via_priority() {
        let allow = Rule {
            id: "allow1".into(),
            tenant_id: "t1".into(),
            description: None,
            pattern: "^/admin".into(),
            methods: vec![HttpMethod::Any],
            allow: Some(true),
            deny: None,
            rate_limit: None,
            require_auth: None,
            priority: 10,
            ip_allowlist: None,
            ip_denylist: None,
            body_deny_patterns: None,
            created_at: 0,
        };
        let e = engine_with(vec![deny_rule("d1", "^/admin"), allow]);
        let o = e.evaluate(&ctx("/admin/x", "1.2.3.4", ""));
        assert_eq!(o.decision, Decision::Allow);
        assert_eq!(o.reason, Reason::RuleAllow);
        assert_eq!(o.rule_id.as_deref(), Some("allow1"));
    }

    #[test]
    fn ip_allowlist_overrides_deny() {
        let mut r = deny_rule("d1", "^/admin");
        r.ip_allowlist = Some(vec!["10.0.0.1".into()]);
        let e = engine_with(vec![r]);
        let o = e.evaluate(&ctx("/admin/x", "10.0.0.1", ""));
        assert_eq!(o.decision, Decision::Allow);
        assert_eq!(o.reason, Reason::IpAllowlist);
    }

    #[test]
    fn scanner_ua_terminal_deny() {
        let e = engine_with(vec![]);
        let o = e.evaluate(&ctx("/", "1.2.3.4", "sqlmap/1.6"));
        assert_eq!(o.decision, Decision::Deny);
        assert_eq!(o.reason, Reason::ScannerUa);
    }

    #[test]
    fn owasp_sqli_fires() {
        let e = engine_with(vec![]);
        let mut c = ctx("/", "1.2.3.4", "");
        c.query = "?id=1 UNION SELECT password FROM users";
        let o = e.evaluate(&c);
        assert_eq!(o.decision, Decision::Deny);
        assert_eq!(o.reason, Reason::OwaspSqli);
    }

    #[test]
    fn owasp_xss_fires() {
        let e = engine_with(vec![]);
        let mut c = ctx("/", "1.2.3.4", "");
        c.query = "?q=<script>alert(1)</script>";
        let o = e.evaluate(&c);
        assert_eq!(o.decision, Decision::Deny);
        assert_eq!(o.reason, Reason::OwaspXss);
    }

    #[test]
    fn owasp_traversal_fires() {
        let e = engine_with(vec![]);
        let o = e.evaluate(&ctx("/files/../etc/passwd", "1.2.3.4", ""));
        assert_eq!(o.decision, Decision::Deny);
        assert_eq!(o.reason, Reason::OwaspTraversal);
    }

    #[test]
    fn auth_required_fires() {
        let r = Rule {
            id: "auth1".into(),
            tenant_id: "t1".into(),
            description: None,
            pattern: "^/me".into(),
            methods: vec![HttpMethod::Any],
            allow: None,
            deny: None,
            rate_limit: None,
            require_auth: Some(true),
            priority: 75,
            ip_allowlist: None,
            ip_denylist: None,
            body_deny_patterns: None,
            created_at: 0,
        };
        let e = engine_with(vec![r]);
        let o = e.evaluate(&ctx("/me", "1.2.3.4", ""));
        assert_eq!(o.decision, Decision::AuthRequired);
        assert_eq!(o.reason, Reason::AuthRequired);
    }

    #[test]
    fn method_not_allowed_fires() {
        let r = Rule {
            id: "m1".into(),
            tenant_id: "t1".into(),
            description: None,
            pattern: "^/api".into(),
            methods: vec![HttpMethod::Post],
            allow: None,
            deny: None,
            rate_limit: None,
            require_auth: None,
            priority: 100,
            ip_allowlist: None,
            ip_denylist: None,
            body_deny_patterns: None,
            created_at: 0,
        };
        let e = engine_with(vec![r]);
        let o = e.evaluate(&ctx("/api/x", "1.2.3.4", ""));
        assert_eq!(o.decision, Decision::Deny);
        assert_eq!(o.reason, Reason::MethodNotAllowed);
    }

    #[test]
    fn allowed_bot_skips_rate_limit() {
        let r = Rule {
            id: "rl1".into(),
            tenant_id: "t1".into(),
            description: None,
            pattern: "^/".into(),
            methods: vec![HttpMethod::Any],
            allow: None,
            deny: None,
            rate_limit: Some(RateLimitConfig {
                limit: 1,
                window_ms: 60_000,
                scope: RateLimitScope::Ip,
                algorithm: RateLimitAlgorithm::TokenBucket,
            }),
            require_auth: None,
            priority: 100,
            ip_allowlist: None,
            ip_denylist: None,
            body_deny_patterns: None,
            created_at: 0,
        };
        let e = engine_with(vec![r]);
        for _ in 0..10 {
            let o = e.evaluate(&ctx(
                "/",
                "9.9.9.9",
                "Mozilla/5.0 (compatible; Googlebot/2.1)",
            ));
            assert_eq!(o.decision, Decision::Allow);
        }
    }
}
