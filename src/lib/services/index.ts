// The app's services, sharing one signed in session. Pages import what they need from here.

import { ApprovalsBadge } from '#lib/stores/approvals.svelte.js';
import { AppState } from '#lib/stores/app.svelte.js';
import { ApprovalsService } from './approvals.js';
import { InsightsService } from './insights.js';
import { MembersService } from './members.js';
import { OASService } from './oas.js';
import { PreloadService } from './preload.js';
import { ProgressService } from './progress.js';
import { RecordingService } from './recording.js';
import { ReferenceService } from './reference.js';
import { UnitProgressService } from './unitProgress.js';

export const app = new AppState();
export const members = new MembersService(app);
export const unitProgress = new UnitProgressService(app, members);
export const oas = new OASService(() => app.terrain);
export const insights = new InsightsService(app, members, unitProgress, oas);
export const progress = new ProgressService(app, members);
export const recording = new RecordingService(app, unitProgress);
export const reference = new ReferenceService(() => app.terrain);
export const preload = new PreloadService(app, unitProgress, oas);
export const approvals = new ApprovalsService(app);
export const approvalsBadge = new ApprovalsBadge(approvals);

// A different leader, or none, mustn't see the last one's youth
app.onReset(() => {
	members.clear();
	unitProgress.clear();
	approvalsBadge.clear();
});
