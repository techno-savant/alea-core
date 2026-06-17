import '../styles/alea-core.css';

import type { AleaApi } from './types/index.js';
import { MechanicRegistry } from './registry/MechanicRegistry.js';
import { calculi }          from './mechanics/Calculi.js';
import { limen }            from './mechanics/Limen.js';
import { gradus }           from './mechanics/Gradus.js';
import { scala }            from './mechanics/Scala.js';
import { bivium }           from './mechanics/Bivium.js';
import { fulmen }           from './mechanics/Fulmen.js';
import { comes }            from './mechanics/Comes.js';
import { certamen }         from './mechanics/Certamen.js';
import { casus }            from './mechanics/Casus.js';
import { createAleaApi }    from './api.js';
import { TierLabelRegistry } from './registry/TierLabelRegistry.js';
import { RollChatCard }      from './chat/RollChatCard.js';

Hooks.once('init', () => {
  game.settings.register('alea-core', 'automationLevel', {
    name: 'ALEA.Settings.AutomationLevel.Name',
    hint: 'ALEA.Settings.AutomationLevel.Hint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      full: 'ALEA.Automation.Full',
      semi: 'ALEA.Automation.Semi',
      none: 'ALEA.Automation.None',
    },
    default: 'full',
  });

  game.settings.register('alea-core', 'postRollTimer', {
    name: 'ALEA.Settings.PostRollTimer.Name',
    hint: 'ALEA.Settings.PostRollTimer.Hint',
    scope: 'client',
    config: true,
    type: Number,
    default: 15,
  });

  // Register default English tier labels. Ritus implementations call api.registerTierLabels() to override.
  TierLabelRegistry.register({
    'strong-hit': 'Strong Hit',
    'hit':        'Hit',
    'close-hit':  'Close Hit',
    'glancing':   'Glancing',
    'miss':       'Miss',
  });

  // Register all nine built-in mechanics.
  MechanicRegistry.register(calculi);
  MechanicRegistry.register(limen);
  MechanicRegistry.register(gradus);
  MechanicRegistry.register(scala);
  MechanicRegistry.register(bivium);
  MechanicRegistry.register(fulmen);
  MechanicRegistry.register(comes);
  MechanicRegistry.register(certamen);
  MechanicRegistry.register(casus);

  // Build the public API and expose it on the Foundry module record and globalThis.
  const api = createAleaApi();

  const mod = game.modules.get<{ api?: AleaApi }>('alea-core');
  if (mod !== undefined) mod.api = api;

  (globalThis as Record<string, unknown>).alea = api;
});

Hooks.once('ready', () => {
  // Optional lex integration — runs after lex has finished its own init.
  void import('./lex/integration.js').then(m => m.initLexIntegration());

  RollChatCard.init();

  const mod = game.modules.get<{ api?: AleaApi }>('alea-core');
  const api = mod?.api;

  Hooks.callAll('alea.ready', api);
});

export { getAleaApi } from './api.js';
export { RollChatCard } from './chat/RollChatCard.js';
