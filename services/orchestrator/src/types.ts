// ── Deploy Orchestrator Types ──────────────────────────────────────────

export type Runtime = "nextjs" | "bun";

export interface DeployRequest {
  appName: string;
  repoUrl: string;
  branch: string;
  domain: string;
  subdomain?: string | undefined;
  port: number;
  runtime: Runtime;
  envVars?: Record<string, string> | undefined;
}

export interface DeployResult {
  containerId: string;
  appName: string;
  domain: string;
  url: string;
  status: "running" | "failed";
  healthCheck: "pass" | "fail" | "pending";
}

export interface AppStatus {
  name: string;
  containerId: string;
  image: string;
  status: "running" | "stopped" | "restarting" | "exited" | "unknown";
  port: number;
  domain: string;
  healthUrl: string | null;
  uptime: string;
  createdAt: string;
}

// ── Docker API Types ──────────────────────────────────────────────────

export interface ContainerConfig {
  Image: string;
  Env?: string[];
  ExposedPorts?: Record<string, Record<string, never>>;
  HostConfig?: {
    PortBindings?: Record<string, Array<{ HostPort: string }>>;
    RestartPolicy?: { Name: string; MaximumRetryCount?: number };
    NetworkMode?: string | undefined;
  };
  Labels?: Record<string, string>;
  name?: string;
}

export interface Container {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Ports: Array<{
    PrivatePort: number;
    PublicPort?: number | undefined;
    Type: string;
  }>;
  Labels: Record<string, string>;
}

export interface ContainerInspect {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    StartedAt: string;
    FinishedAt: string;
  };
  Config: {
    Image: string;
    Env: string[];
    Labels: Record<string, string>;
  };
  NetworkSettings: {
    Ports: Record<
      string,
      Array<{ HostIp: string; HostPort: string }> | null
    >;
  };
}

// ── Caddy API Types ───────────────────────────────────────────────────

export interface CaddyRoute {
  "@id"?: string | undefined;
  match?: Array<{ host?: string[] }> | undefined;
  handle?: Array<{
    handler: string;
    upstreams?: Array<{ dial: string }> | undefined;
  }> | undefined;
}

export interface CaddyConfig {
  apps?: {
    http?: {
      servers?: Record<string, { routes?: CaddyRoute[] }>;
    };
  };
}
