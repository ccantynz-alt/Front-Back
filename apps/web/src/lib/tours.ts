// ── Guided Tour Definitions ─────────────────────────────────────────

export interface TourStep {
  readonly target: string;
  readonly title: string;
  readonly content: string;
  readonly action?: "click" | "hover" | "wait";
  readonly placement?: "top" | "bottom" | "left" | "right";
}

export const DASHBOARD_TOUR: ReadonlyArray<TourStep> = [
  {
    target: "[data-tour='dashboard-welcome']",
    title: "Welcome to your dashboard",
    content: "This is home base. All your projects live here.",
    placement: "bottom",
  },
  {
    target: "[data-tour='dashboard-create']",
    title: "Start a new project",
    content: "Click here whenever you want to create a new website or video.",
    placement: "bottom",
  },
  {
    target: "[data-tour='nav-builder']",
    title: "Composer",
    content: "Generate SolidJS component trees from a prompt. Runs on the three-tier compute router.",
    placement: "bottom",
  },
  {
    target: "[data-tour='nav-video']",
    title: "Video Editor",
    content: "Trim, caption, and style videos with AI help.",
    placement: "bottom",
  },
];

export const BUILDER_TOUR: ReadonlyArray<TourStep> = [
  {
    target: "[data-tour='builder-chat']",
    title: "Chat with your designer",
    content: "Type what you want — like 'a coffee shop landing page'. The AI builds it instantly.",
    placement: "right",
  },
  {
    target: "[data-tour='builder-preview']",
    title: "Live preview",
    content: "See your site as you build it. Every change shows up here in real time.",
    placement: "left",
  },
  {
    target: "[data-tour='builder-export']",
    title: "Export or publish",
    content: "When you're happy, download your site or publish it live with one click.",
    placement: "bottom",
  },
];

export const VIDEO_TOUR: ReadonlyArray<TourStep> = [
  {
    target: "[data-tour='video-upload']",
    title: "Upload a clip",
    content: "Drop a video file here, or pick a sample to play with.",
    placement: "bottom",
  },
  {
    target: "[data-tour='video-timeline']",
    title: "The timeline",
    content: "Trim, split, and rearrange your clips. Just drag.",
    placement: "top",
  },
  {
    target: "[data-tour='video-export']",
    title: "Export your masterpiece",
    content: "Save your video to your computer or share a link.",
    placement: "left",
  },
];

export const COLLAB_TOUR: ReadonlyArray<TourStep> = [
  {
    target: "[data-tour='collab-create-room']",
    title: "Start a room",
    content: "Create a shared space where you and your team work together live.",
    placement: "bottom",
  },
  {
    target: "[data-tour='collab-invite']",
    title: "Invite people",
    content: "Send a link — anyone with it can join and edit alongside you.",
    placement: "bottom",
  },
];

export const SETTINGS_TOUR: ReadonlyArray<TourStep> = [
  {
    target: "[data-tour='settings-profile']",
    title: "Your profile",
    content: "Add an email or photo. We'll never spam you.",
    placement: "right",
  },
  {
    target: "[data-tour='settings-team']",
    title: "Your team",
    content: "Invite teammates here. They get a friendly join link.",
    placement: "right",
  },
];

export const TOUR_REGISTRY: Record<string, ReadonlyArray<TourStep>> = {
  dashboard: DASHBOARD_TOUR,
  builder: BUILDER_TOUR,
  video: VIDEO_TOUR,
  collab: COLLAB_TOUR,
  settings: SETTINGS_TOUR,
};

const SEEN_KEY = "btf-tours-seen-v1";

export function hasSeenTour(name: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return false;
    const seen = JSON.parse(raw) as string[];
    return Array.isArray(seen) && seen.includes(name);
  } catch {
    return false;
  }
}

export function markTourSeen(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (!seen.includes(name)) seen.push(name);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* noop */
  }
}

export function resetTours(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SEEN_KEY);
  } catch {
    /* noop */
  }
}
