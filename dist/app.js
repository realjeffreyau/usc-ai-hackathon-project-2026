// TroyPlan website: the same planner UI as the WebReg drawer, mounted as a full page with three tabs.
import { mountPlanner } from './panel.js';

mountPlanner({ shell: 'page', container: document.getElementById('app') });
