/**
 * Router Index - Registers all views
 */

import { registerView, navigate, getCurrentView } from './router.js';
import { renderToday } from './today.js';
import { renderOverview } from './overview.js';
import { renderModuleHome } from './module-home.js';
import { renderModuleObjectives } from './module-objectives.js';
import { renderModuleResources } from './module-resources.js';
import { renderModuleSessions } from './module-sessions.js';
import { renderModuleExams } from './module-exams.js';
import { renderModulePlan } from './module-plan.js';
import { renderCaptures } from './captures.js';
import { renderWeeklyReview } from './weekly-review.js';
import { renderExamsGlobal } from './exams-global.js';
import { renderTools } from './tools.js';
import { renderSettings } from './settings.js';
import { renderWeakSpots } from './weak-spots.js';
import { renderMockExam } from './mock-exam.js';
import { renderExamPrep } from './exam-prep.js';

import { renderModule } from './module.js';

// Register all views
// "today" is the default landing; "overview" is the module grid;
// "module" is the consolidated module detail (Ziele/Plan/Sessions/Material).
// Legacy module-* views stay registered for back-compat.
registerView('today', renderToday);
registerView('overview', renderOverview);
registerView('module', renderModule);
registerView('module-home', renderModuleHome);
registerView('module-objectives', renderModuleObjectives);
registerView('module-resources', renderModuleResources);
registerView('module-sessions', renderModuleSessions);
registerView('module-exams', renderModuleExams);
registerView('module-plan', renderModulePlan);
registerView('captures', renderCaptures);
registerView('weekly-review', renderWeeklyReview);
registerView('exams-global', renderExamsGlobal);
registerView('tools', renderTools);
registerView('settings', renderSettings);
registerView('weak-spots', renderWeakSpots);
registerView('mock-exam', renderMockExam);
registerView('exam-prep', renderExamPrep);

export { navigate, getCurrentView };