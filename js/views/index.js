/**
 * Router Index - Registers all views
 */

import { registerView, navigate, getCurrentView } from './router.js';
import { renderToday } from './today.js';
import { renderFocus } from './focus.js';
import { renderOverview } from './overview.js';
import { renderModuleObjectives } from './module-objectives.js';
import { renderModuleResources } from './module-resources.js';
import { renderModulePlan } from './module-plan.js';
import { renderCaptures } from './captures.js';
import { renderExamsGlobal } from './exams-global.js';
import { renderSettings } from './settings.js';
import { renderWeakSpots } from './weak-spots.js';

import { renderModule } from './module.js';

// Register all views
// "today" is the default landing; "overview" is the module grid;
// "module" is the consolidated module detail (Übersicht/Lernziele/Material/Plan).
// Legacy module-* views stay registered for back-compat; weekly review, tools,
// exam prep and mock exam now live as redirects or tabs of existing pages.
registerView('today', renderToday);
registerView('focus', renderFocus);
registerView('overview', renderOverview);
registerView('module', renderModule);
registerView('module-objectives', renderModuleObjectives);
registerView('module-resources', renderModuleResources);
registerView('module-plan', renderModulePlan);
registerView('captures', renderCaptures);
registerView('exams-global', renderExamsGlobal);
registerView('settings', renderSettings);
registerView('weak-spots', renderWeakSpots);

export { navigate, getCurrentView };