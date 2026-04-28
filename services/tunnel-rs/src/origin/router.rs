//! Path-prefix → upstream-port routing on the origin side.
//!
//! Mirrors the `TUNNEL_ROUTES` env var pattern. Default rules:
//! `/api:3001,/trpc:3001,/healthz:3001,/auth/:3001`. Anything else
//! falls back to the default port (typically 3000).

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    pub prefix: String,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub struct Router {
    routes: Vec<Route>,
    default_port: u16,
}

impl Router {
    pub fn new(default_port: u16) -> Self {
        Self {
            routes: Vec::new(),
            default_port,
        }
    }

    pub fn with_routes(default_port: u16, routes: Vec<Route>) -> Self {
        Self {
            routes,
            default_port,
        }
    }

    /// Parse a `TUNNEL_ROUTES` spec like `"/api:3001,/trpc:3001"`.
    pub fn parse(spec: &str, default_port: u16) -> Result<Self, RouterError> {
        let mut routes = Vec::new();
        for part in spec.split(',').filter(|s| !s.trim().is_empty()) {
            let part = part.trim();
            let colon = part
                .rfind(':')
                .ok_or_else(|| RouterError::Malformed(format!("missing ':' in route '{part}'")))?;
            let prefix = &part[..colon];
            let port_str = &part[colon + 1..];
            if prefix.is_empty() {
                return Err(RouterError::Malformed(format!("empty prefix in '{part}'")));
            }
            let port: u16 = port_str
                .parse()
                .map_err(|e| RouterError::Malformed(format!("bad port '{port_str}': {e}")))?;
            routes.push(Route {
                prefix: prefix.to_string(),
                port,
            });
        }
        Ok(Self {
            routes,
            default_port,
        })
    }

    pub fn resolve(&self, path: &str) -> u16 {
        for r in &self.routes {
            if path.starts_with(&r.prefix) {
                return r.port;
            }
        }
        self.default_port
    }

    pub fn default_port(&self) -> u16 {
        self.default_port
    }

    pub fn routes(&self) -> &[Route] {
        &self.routes
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RouterError {
    #[error("malformed route spec: {0}")]
    Malformed(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_default_routes() {
        let r = Router::parse("/api:3001,/trpc:3001,/healthz:3001,/auth/:3001", 3000).unwrap();
        assert_eq!(r.resolve("/api/users"), 3001);
        assert_eq!(r.resolve("/trpc/foo"), 3001);
        assert_eq!(r.resolve("/auth/callback"), 3001);
        assert_eq!(r.resolve("/healthz"), 3001);
        assert_eq!(r.resolve("/"), 3000);
        assert_eq!(r.resolve("/index.html"), 3000);
    }

    #[test]
    fn empty_spec_uses_default() {
        let r = Router::parse("", 3000).unwrap();
        assert_eq!(r.resolve("/anything"), 3000);
    }

    #[test]
    fn malformed_rejected() {
        assert!(Router::parse("noport", 3000).is_err());
        assert!(Router::parse(":3001", 3000).is_err());
        assert!(Router::parse("/api:notaport", 3000).is_err());
    }

    #[test]
    fn first_match_wins() {
        let r = Router::with_routes(
            3000,
            vec![
                Route {
                    prefix: "/api/v1".into(),
                    port: 3001,
                },
                Route {
                    prefix: "/api".into(),
                    port: 3002,
                },
            ],
        );
        assert_eq!(r.resolve("/api/v1/foo"), 3001);
        assert_eq!(r.resolve("/api/v2/foo"), 3002);
        assert_eq!(r.resolve("/foo"), 3000);
    }
}
