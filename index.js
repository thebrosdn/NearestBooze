import { registerRootComponent } from 'expo';

import App from './App';
import { initReporting, wrapRoot } from './lib/reporting';

initReporting();

registerRootComponent(wrapRoot(App));
