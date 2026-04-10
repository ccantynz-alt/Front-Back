// ── Starter Templates Library ──────────────────────────────────────
// Pre-built, production-ready component trees for one-click project starts.
// Every template uses the existing ComponentCatalog so AI can edit them.

import { z } from "zod";
import type { Component } from "./components";

export const TemplateCategorySchema = z.enum([
  "landing",
  "portfolio",
  "ecommerce",
  "blog",
  "saas",
  "app",
]);
export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;

export const TemplateDifficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
export type TemplateDifficulty = z.infer<typeof TemplateDifficultySchema>;

/**
 * Runtime type guards. Useful when narrowing values from template
 * marketplace listings or URL filter params without throwing.
 */
export function isTemplateCategory(value: unknown): value is TemplateCategory {
  return TemplateCategorySchema.safeParse(value).success;
}

export function isTemplateDifficulty(value: unknown): value is TemplateDifficulty {
  return TemplateDifficultySchema.safeParse(value).success;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  preview: string;
  componentTree: Component[];
  tags: string[];
  difficulty: TemplateDifficulty;
  estimatedTime: string;
  featured?: boolean;
}

// ── Helper builders (zero HTML — just component tree literals) ─────

function hero(title: string, subtitle: string, cta: string): Component {
  return {
    component: "Stack",
    props: {
      direction: "vertical",
      gap: "lg",
      align: "center",
      justify: "center",
    },
    children: [
      { component: "Text", props: { content: title, variant: "h1", weight: "bold", align: "center" } },
      { component: "Text", props: { content: subtitle, variant: "body", weight: "normal", align: "center" } },
      { component: "Button", props: { label: cta, variant: "primary", size: "lg", disabled: false, loading: false } },
    ],
  };
}

function card(title: string, description: string): Component {
  return {
    component: "Card",
    props: { title, description, padding: "md" },
    children: [
      { component: "Text", props: { content: description, variant: "body", weight: "normal", align: "left" } },
    ],
  };
}

// ── The Templates ──────────────────────────────────────────────────

export const TEMPLATES: Template[] = [
  {
    id: "landing-startup",
    name: "Startup Landing Page",
    description: "Clean hero, features grid, and call-to-action. Perfect for launching a new product.",
    category: "landing",
    preview: "/templates/landing-startup.png",
    tags: ["startup", "saas", "marketing", "hero"],
    difficulty: "beginner",
    estimatedTime: "2 minutes",
    featured: true,
    componentTree: [
      hero("Ship Your Idea Today", "The fastest way to launch your startup.", "Get Started"),
      {
        component: "Stack",
        props: { direction: "horizontal", gap: "md", align: "stretch", justify: "center" },
        children: [
          card("Fast", "Built for speed from day one."),
          card("Secure", "Enterprise-grade security baked in."),
          card("Scalable", "Grows with your business."),
        ],
      },
    ],
  },
  {
    id: "landing-app",
    name: "Mobile App Landing",
    description: "Showcase your mobile app with download buttons and feature highlights.",
    category: "landing",
    preview: "/templates/landing-app.png",
    tags: ["mobile", "app", "ios", "android"],
    difficulty: "beginner",
    estimatedTime: "2 minutes",
    componentTree: [
      hero("The App You've Been Waiting For", "Available on iOS and Android.", "Download Now"),
      {
        component: "Stack",
        props: { direction: "horizontal", gap: "sm", align: "center", justify: "center" },
        children: [
          { component: "Button", props: { label: "App Store", variant: "outline", size: "lg", disabled: false, loading: false } },
          { component: "Button", props: { label: "Google Play", variant: "outline", size: "lg", disabled: false, loading: false } },
        ],
      },
    ],
  },
  {
    id: "portfolio-creative",
    name: "Creative Portfolio",
    description: "Showcase your work with a clean, modern portfolio layout.",
    category: "portfolio",
    preview: "/templates/portfolio-creative.png",
    tags: ["portfolio", "creative", "designer", "personal"],
    difficulty: "beginner",
    estimatedTime: "3 minutes",
    featured: true,
    componentTree: [
      {
        component: "Stack",
        props: { direction: "vertical", gap: "lg", align: "center", justify: "start" },
        children: [
          { component: "Avatar", props: { initials: "JD", size: "lg" } },
          { component: "Text", props: { content: "Jane Doe", variant: "h1", weight: "bold", align: "center" } },
          { component: "Text", props: { content: "Designer & Illustrator", variant: "body", weight: "medium", align: "center" } },
          { component: "Badge", props: { label: "Available for hire", variant: "success", size: "md" } },
        ],
      },
      {
        component: "Stack",
        props: { direction: "horizontal", gap: "md", align: "stretch", justify: "center" },
        children: [
          card("Project One", "Brand identity for a coffee shop."),
          card("Project Two", "Web design for a music festival."),
          card("Project Three", "Illustrations for a children's book."),
        ],
      },
    ],
  },
  {
    id: "portfolio-developer",
    name: "Developer Portfolio",
    description: "Tech-focused portfolio with skills, projects, and contact info.",
    category: "portfolio",
    preview: "/templates/portfolio-developer.png",
    tags: ["developer", "engineer", "github", "code"],
    difficulty: "intermediate",
    estimatedTime: "4 minutes",
    componentTree: [
      hero("Hi, I'm Alex", "Full-stack developer building delightful experiences.", "View My Work"),
      {
        component: "Stack",
        props: { direction: "horizontal", gap: "sm", align: "center", justify: "center" },
        children: [
          { component: "Badge", props: { label: "TypeScript", variant: "info", size: "md" } },
          { component: "Badge", props: { label: "SolidJS", variant: "info", size: "md" } },
          { component: "Badge", props: { label: "Rust", variant: "info", size: "md" } },
        ],
      },
    ],
  },
  {
    id: "ecommerce-store",
    name: "Online Store",
    description: "Product grid with cart and checkout. Sell anything online.",
    category: "ecommerce",
    preview: "/templates/ecommerce-store.png",
    tags: ["shop", "store", "products", "cart"],
    difficulty: "intermediate",
    estimatedTime: "5 minutes",
    featured: true,
    componentTree: [
      { component: "Text", props: { content: "Shop the Collection", variant: "h1", weight: "bold", align: "center" } },
      {
        component: "Stack",
        props: { direction: "horizontal", gap: "md", align: "stretch", justify: "center" },
        children: [
          card("T-Shirt", "$29.99 — Soft cotton, 6 colors."),
          card("Hoodie", "$59.99 — Cozy fleece lining."),
          card("Cap", "$19.99 — Adjustable strap."),
        ],
      },
      { component: "Button", props: { label: "View Cart", variant: "primary", size: "lg", disabled: false, loading: false } },
    ],
  },
  {
    id: "ecommerce-single",
    name: "Single Product Page",
    description: "Focused product page with description, gallery placeholder, and buy button.",
    category: "ecommerce",
    preview: "/templates/ecommerce-single.png",
    tags: ["product", "single", "buy"],
    difficulty: "beginner",
    estimatedTime: "2 minutes",
    componentTree: [
      { component: "Text", props: { content: "Premium Headphones", variant: "h1", weight: "bold", align: "left" } },
      { component: "Text", props: { content: "$249.00", variant: "h3", weight: "semibold", align: "left" } },
      { component: "Text", props: { content: "Studio-quality sound with 30-hour battery life.", variant: "body", weight: "normal", align: "left" } },
      { component: "Button", props: { label: "Add to Cart", variant: "primary", size: "lg", disabled: false, loading: false } },
    ],
  },
  {
    id: "blog-personal",
    name: "Personal Blog",
    description: "Simple blog layout with post cards. Share your thoughts with the world.",
    category: "blog",
    preview: "/templates/blog-personal.png",
    tags: ["blog", "writing", "personal", "posts"],
    difficulty: "beginner",
    estimatedTime: "2 minutes",
    featured: true,
    componentTree: [
      { component: "Text", props: { content: "My Blog", variant: "h1", weight: "bold", align: "center" } },
      { component: "Text", props: { content: "Thoughts on tech, life, and everything in between.", variant: "body", weight: "normal", align: "center" } },
      { component: "Separator", props: { orientation: "horizontal" } },
      {
        component: "Stack",
        props: { direction: "vertical", gap: "md", align: "stretch", justify: "start" },
        children: [
          card("Hello World", "My first blog post — what this is all about."),
          card("Why I Love SolidJS", "A deep dive into reactive primitives."),
          card("Building in Public", "Lessons from my first startup."),
        ],
      },
    ],
  },
  {
    id: "blog-magazine",
    name: "Magazine Style Blog",
    description: "Multi-column magazine layout for content-rich publications.",
    category: "blog",
    preview: "/templates/blog-magazine.png",
    tags: ["magazine", "news", "editorial"],
    difficulty: "advanced",
    estimatedTime: "5 minutes",
    componentTree: [
      { component: "Text", props: { content: "The Daily", variant: "h1", weight: "bold", align: "center" } },
      {
        component: "Tabs",
        props: {
          items: [
            { id: "tech", label: "Tech" },
            { id: "design", label: "Design" },
            { id: "business", label: "Business" },
          ],
          defaultTab: "tech",
        },
      },
      {
        component: "Stack",
        props: { direction: "horizontal", gap: "md", align: "stretch", justify: "start" },
        children: [
          card("Featured Story", "The biggest story of the day."),
          card("Editor's Pick", "Hand-picked by our editorial team."),
        ],
      },
    ],
  },
  {
    id: "saas-pricing",
    name: "SaaS Pricing Page",
    description: "Three-tier pricing table with features and signup buttons.",
    category: "saas",
    preview: "/templates/saas-pricing.png",
    tags: ["saas", "pricing", "subscription", "tiers"],
    difficulty: "intermediate",
    estimatedTime: "3 minutes",
    featured: true,
    componentTree: [
      { component: "Text", props: { content: "Simple, Transparent Pricing", variant: "h1", weight: "bold", align: "center" } },
      {
        component: "Stack",
        props: { direction: "horizontal", gap: "md", align: "stretch", justify: "center" },
        children: [
          {
            component: "Card",
            props: { title: "Starter", description: "$0/mo", padding: "lg" },
            children: [
              { component: "Text", props: { content: "Perfect for trying things out.", variant: "body", weight: "normal", align: "left" } },
              { component: "Button", props: { label: "Start Free", variant: "outline", size: "md", disabled: false, loading: false } },
            ],
          },
          {
            component: "Card",
            props: { title: "Pro", description: "$29/mo", padding: "lg" },
            children: [
              { component: "Text", props: { content: "For growing teams.", variant: "body", weight: "normal", align: "left" } },
              { component: "Button", props: { label: "Go Pro", variant: "primary", size: "md", disabled: false, loading: false } },
            ],
          },
          {
            component: "Card",
            props: { title: "Enterprise", description: "Custom", padding: "lg" },
            children: [
              { component: "Text", props: { content: "For large organizations.", variant: "body", weight: "normal", align: "left" } },
              { component: "Button", props: { label: "Contact Sales", variant: "outline", size: "md", disabled: false, loading: false } },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "saas-dashboard",
    name: "SaaS Dashboard",
    description: "Admin dashboard with stats cards and tabs.",
    category: "saas",
    preview: "/templates/saas-dashboard.png",
    tags: ["dashboard", "admin", "analytics"],
    difficulty: "advanced",
    estimatedTime: "5 minutes",
    componentTree: [
      { component: "Text", props: { content: "Dashboard", variant: "h1", weight: "bold", align: "left" } },
      {
        component: "Stack",
        props: { direction: "horizontal", gap: "md", align: "stretch", justify: "start" },
        children: [
          card("Revenue", "$12,345 this month"),
          card("Users", "1,234 active"),
          card("Growth", "+12% from last month"),
        ],
      },
      {
        component: "Tabs",
        props: {
          items: [
            { id: "overview", label: "Overview" },
            { id: "users", label: "Users" },
            { id: "billing", label: "Billing" },
          ],
          defaultTab: "overview",
        },
      },
    ],
  },
  {
    id: "app-contact",
    name: "Contact Form",
    description: "Simple contact form with name, email, and message fields.",
    category: "app",
    preview: "/templates/app-contact.png",
    tags: ["form", "contact", "email"],
    difficulty: "beginner",
    estimatedTime: "1 minute",
    componentTree: [
      { component: "Text", props: { content: "Get in Touch", variant: "h1", weight: "bold", align: "center" } },
      { component: "Input", props: { name: "name", type: "text", label: "Your Name", placeholder: "Jane Doe", required: true, disabled: false } },
      { component: "Input", props: { name: "email", type: "email", label: "Email", placeholder: "jane@example.com", required: true, disabled: false } },
      { component: "Textarea", props: { name: "message", label: "Message", placeholder: "Tell us what's on your mind...", rows: 5, resize: "vertical", required: true, disabled: false } },
      { component: "Button", props: { label: "Send Message", variant: "primary", size: "lg", disabled: false, loading: false } },
    ],
  },
  {
    id: "app-login",
    name: "Login Page",
    description: "Clean login form with email and password.",
    category: "app",
    preview: "/templates/app-login.png",
    tags: ["auth", "login", "form"],
    difficulty: "beginner",
    estimatedTime: "1 minute",
    componentTree: [
      {
        component: "Card",
        props: { title: "Welcome Back", description: "Sign in to continue", padding: "lg" },
        children: [
          { component: "Input", props: { name: "email", type: "email", label: "Email", placeholder: "you@example.com", required: true, disabled: false } },
          { component: "Input", props: { name: "password", type: "password", label: "Password", required: true, disabled: false } },
          { component: "Button", props: { label: "Sign In", variant: "primary", size: "lg", disabled: false, loading: false } },
        ],
      },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────

export function getTemplatesByCategory(category: string): Template[] {
  if (category === "all") return TEMPLATES;
  return TEMPLATES.filter((t) => t.category === category);
}

export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getFeaturedTemplates(): Template[] {
  return TEMPLATES.filter((t) => t.featured === true);
}

export function searchTemplates(query: string): Template[] {
  const q = query.toLowerCase().trim();
  if (!q) return TEMPLATES;
  return TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}
