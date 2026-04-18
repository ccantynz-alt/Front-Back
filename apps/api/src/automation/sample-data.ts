// ── Sample Data Generator ──────────────────────────────────────────
// Creates sample projects, team members, and usage stats for new users
// so they have something to play with from second one. Called on signup.

import { TEMPLATES, type Template } from "@back-to-the-future/schemas";
import { randomBytes } from "crypto";

export interface SampleProject {
  id: string;
  name: string;
  description: string;
  templateId: string;
  componentTree: Template["componentTree"];
  createdAt: string;
  updatedAt: string;
}

export interface SamplePersona {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
  avatarInitials: string;
}

export interface SampleUsageStats {
  projectsCreated: number;
  pagesPublished: number;
  aiTokensUsed: number;
  teamMembers: number;
  storageUsedMb: number;
}

export interface SampleDataBundle {
  projects: SampleProject[];
  team: SamplePersona[];
  stats: SampleUsageStats;
}

const PERSONAS: SamplePersona[] = [
  { id: "p1", name: "Avery Chen", email: "avery@example.com", role: "owner", avatarInitials: "AC" },
  { id: "p2", name: "Jordan Patel", email: "jordan@example.com", role: "editor", avatarInitials: "JP" },
  { id: "p3", name: "Sam Rivera", email: "sam@example.com", role: "editor", avatarInitials: "SR" },
  { id: "p4", name: "Taylor Kim", email: "taylor@example.com", role: "viewer", avatarInitials: "TK" },
];

function pickTemplate(id: string): Template {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Sample template missing: ${id}`);
  return t;
}

function projectFromTemplate(id: string, name: string, description: string): SampleProject {
  const t = pickTemplate(id);
  const now = new Date().toISOString();
  return {
    id: `sample-${id}-${randomBytes(3).toString('hex')}`,
    name,
    description,
    templateId: t.id,
    componentTree: t.componentTree,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSampleProjects(): SampleProject[] {
  return [
    projectFromTemplate("landing-startup", "My First Landing Page", "A starter landing page to learn the ropes."),
    projectFromTemplate("portfolio-creative", "My Portfolio", "Show off your best work."),
    projectFromTemplate("blog-personal", "My Blog", "A simple blog to share your thoughts."),
  ];
}

export function createSampleTeam(): SamplePersona[] {
  return PERSONAS;
}

export function createSampleStats(): SampleUsageStats {
  return {
    projectsCreated: 3,
    pagesPublished: 1,
    aiTokensUsed: 1240,
    teamMembers: PERSONAS.length,
    storageUsedMb: 8,
  };
}

export function createSampleDataBundle(): SampleDataBundle {
  return {
    projects: createSampleProjects(),
    team: createSampleTeam(),
    stats: createSampleStats(),
  };
}

// Called automatically when a new user signs up.
// In a real system this would persist to the database.
export async function seedNewUser(userId: string): Promise<SampleDataBundle> {
  const bundle = createSampleDataBundle();
  return bundle;
}