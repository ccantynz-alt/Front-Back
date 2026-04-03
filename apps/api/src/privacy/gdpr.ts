import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

/** GDPR Data Subject Request types */
export interface DataSubjectRequest {
  type: "access" | "deletion" | "portability" | "rectification";
  userId: string;
  email: string;
  requestedAt: string;
}

const dataSubjectRequestSchema = z.object({
  type: z.enum(["access", "deletion", "portability", "rectification"]),
  userId: z.string().min(1),
  email: z.string().email(),
  requestedAt: z.string().datetime(),
});

const consentSchema = z.object({
  userId: z.string().min(1),
  consentType: z.string().min(1),
  granted: z.boolean(),
});

/** In-memory audit log for data subject requests (replace with persistent store in production) */
const auditLog: Array<DataSubjectRequest & { receivedAt: string }> = [];

/** In-memory consent records (replace with persistent store in production) */
const consentRecords: Array<{
  userId: string;
  consentType: string;
  granted: boolean;
  timestamp: string;
}> = [];

/**
 * Creates GDPR-compliant Hono routes for privacy management.
 * Handles data subject requests, consent recording, and data deletion.
 */
export function createGDPRHandler(): Hono {
  const app = new Hono();

  // POST /request — accept a data subject request
  app.post("/request", zValidator("json", dataSubjectRequestSchema), (c) => {
    const request = c.req.valid("json");

    const entry = {
      ...request,
      receivedAt: new Date().toISOString(),
    };
    auditLog.push(entry);

    return c.json(
      {
        status: "received",
        message: `Data subject ${request.type} request recorded`,
        requestedAt: request.requestedAt,
        receivedAt: entry.receivedAt,
      },
      201,
    );
  });

  // GET /policy — return privacy policy as JSON
  app.get("/policy", (c) => {
    return c.json({
      name: "Back to the Future Privacy Policy",
      version: "1.0.0",
      lastUpdated: "2026-04-03",
      dataController: {
        name: "Back to the Future Platform",
        contact: "privacy@backtothefuture.dev",
      },
      dataSubjectRights: [
        "Right of access (Article 15)",
        "Right to rectification (Article 16)",
        "Right to erasure (Article 17)",
        "Right to data portability (Article 20)",
        "Right to restrict processing (Article 18)",
        "Right to object (Article 21)",
      ],
      dataRetention: {
        policy:
          "Personal data is retained only as long as necessary for the purposes for which it was collected.",
        auditLogs: "Audit logs are retained for 7 years in WORM storage.",
      },
      breachNotification: {
        authority: "Within 72 hours of becoming aware of a breach.",
        dataSubjects:
          "Without undue delay when the breach is likely to result in high risk.",
      },
      requestEndpoint: "/api/privacy/request",
    });
  });

  // POST /consent — record user consent with timestamp
  app.post("/consent", async (c) => {
    const body = await c.req.json();
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid consent data", details: parsed.error.flatten() }, 400);
    }
    const consent = parsed.data;

    const record = {
      userId: consent.userId,
      consentType: consent.consentType,
      granted: consent.granted,
      timestamp: new Date().toISOString(),
    };
    consentRecords.push(record);

    return c.json(
      {
        status: "recorded",
        userId: consent.userId,
        consentType: consent.consentType,
        granted: consent.granted,
        timestamp: record.timestamp,
      },
      201,
    );
  });

  // DELETE /data/:userId — placeholder for data deletion
  app.delete("/data/:userId", (c) => {
    const userId = c.req.param("userId");

    // Log the deletion request to the audit trail
    auditLog.push({
      type: "deletion",
      userId,
      email: "redacted@deletion-request",
      requestedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    });

    return c.json({
      status: "scheduled",
      message: `Data deletion for user ${userId} has been scheduled and logged to the audit trail.`,
      userId,
      scheduledAt: new Date().toISOString(),
    });
  });

  return app;
}
