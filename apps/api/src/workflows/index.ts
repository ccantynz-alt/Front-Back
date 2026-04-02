export { inngest } from "./client";
export { aiPipelineWorkflow } from "./functions/ai-pipeline";
export { videoProcessWorkflow } from "./functions/video-process";
export { siteBuildWorkflow } from "./functions/site-build";
export {
  sendAIPipelineEvent,
  sendVideoProcessEvent,
  sendSiteBuildEvent,
  AIPipelineEventSchema,
  VideoProcessEventSchema,
  SiteBuildEventSchema,
} from "./events";
export type { WorkflowEvents } from "./events";

import { aiPipelineWorkflow } from "./functions/ai-pipeline";
import { videoProcessWorkflow } from "./functions/video-process";
import { siteBuildWorkflow } from "./functions/site-build";

/** All Inngest workflow functions, ready for serve() registration. */
export const workflowFunctions = [
  aiPipelineWorkflow,
  videoProcessWorkflow,
  siteBuildWorkflow,
];
