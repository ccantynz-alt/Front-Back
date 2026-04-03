/** English locale - default language */
export const en = {
  // Navigation
  "nav.home": "Home",
  "nav.dashboard": "Dashboard",
  "nav.builder": "Builder",
  "nav.projects": "Projects",
  "nav.settings": "Settings",
  "nav.docs": "Documentation",

  // Common buttons
  "button.save": "Save",
  "button.cancel": "Cancel",
  "button.delete": "Delete",
  "button.edit": "Edit",
  "button.create": "Create",
  "button.submit": "Submit",
  "button.close": "Close",
  "button.confirm": "Confirm",
  "button.back": "Back",
  "button.next": "Next",
  "button.loading": "Loading...",
  "button.retry": "Retry",

  // Form labels
  "form.email": "Email",
  "form.password": "Password",
  "form.name": "Name",
  "form.description": "Description",
  "form.title": "Title",
  "form.search": "Search",
  "form.required": "Required",
  "form.optional": "Optional",

  // Errors
  "error.generic": "Something went wrong. Please try again.",
  "error.notFound": "Page not found.",
  "error.unauthorized": "You are not authorized to view this page.",
  "error.forbidden": "Access denied.",
  "error.validation": "Please check your input and try again.",
  "error.network": "Network error. Please check your connection.",
  "error.timeout": "Request timed out. Please try again.",

  // Auth pages
  "auth.signIn": "Sign In",
  "auth.signUp": "Sign Up",
  "auth.signOut": "Sign Out",
  "auth.passkey": "Sign in with Passkey",
  "auth.createAccount": "Create Account",
  "auth.forgotPassword": "Forgot Password?",
  "auth.welcome": "Welcome back",
  "auth.newUser": "New to Back to the Future?",

  // Builder page
  "builder.title": "Website Builder",
  "builder.newProject": "New Project",
  "builder.addComponent": "Add Component",
  "builder.preview": "Preview",
  "builder.publish": "Publish",
  "builder.undo": "Undo",
  "builder.redo": "Redo",
  "builder.layers": "Layers",
  "builder.properties": "Properties",
  "builder.aiAssist": "AI Assistant",
  "builder.components": "Components",
} as const;

export type Dictionary = typeof en;
export type DictionaryKey = keyof Dictionary;
