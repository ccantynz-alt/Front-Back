import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

// ---------------------------------------------------------------------------
// RBAC: Role-Permission Mappings
// ---------------------------------------------------------------------------

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    id: text("id").primaryKey(),
    role: text("role", {
      enum: ["owner", "admin", "editor", "viewer", "billing_admin"],
    }).notNull(),
    permission: text("permission").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("role_permissions_role_idx").on(table.role),
    rolePermIdx: index("role_permissions_role_perm_idx").on(
      table.role,
      table.permission,
    ),
  }),
);

// ---------------------------------------------------------------------------
// RBAC: Team Members
// ---------------------------------------------------------------------------

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["owner", "admin", "editor", "viewer", "billing_admin"],
    }).notNull(),
    invitedBy: text("invited_by").references(() => users.id),
    invitedAt: integer("invited_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    acceptedAt: integer("accepted_at", { mode: "timestamp" }),
  },
  (table) => ({
    teamIdx: index("team_members_team_idx").on(table.teamId),
    userIdx: index("team_members_user_idx").on(table.userId),
    teamUserIdx: index("team_members_team_user_idx").on(
      table.teamId,
      table.userId,
    ),
  }),
);
