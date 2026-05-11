import { BG } from 'bgutils-js';
import { JSDOM } from 'jsdom';
import { YT_USER_AGENT } from './constants';

interface PoTokenData {
  visitorData: string;
  poToken: string;
  generatedAt: number;
  ttlMs: number;
}

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

let cachedToken: PoTokenData | null = null;
let generationPromise: Promise<PoTokenData> | null = null;

const DEFAULT_TTL_MS = 30 * 60 * 1000;

const DEBUG = process.env.YT_DEBUG === '1';

function createDomGlobals(): { globals: Record<string, any>; restore: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    userAgent: YT_USER_AGENT,
  });

  const win = dom.window as any;
  const globals: Record<string, any> = {
    window: win,
    document: win.document,
    location: win.location,
    origin: win.origin,
  };

  const saved: Record<string, any> = {};
  const keys = Object.keys(globals);
  for (const key of keys) {
    if (key in globalThis) saved[key] = (globalThis as any)[key];
  }

  let navigatorSaved = false;
  let navigatorHadDescriptor = false;
  let existingDescriptor: PropertyDescriptor | undefined;
  if ('navigator' in globalThis) {
    navigatorSaved = true;
    existingDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    navigatorHadDescriptor = !!existingDescriptor;
  }

  Object.assign(globalThis, globals);
  if (!Reflect.has(globalThis, 'navigator')) {
    Object.defineProperty(globalThis, 'navigator', { value: win.navigator });
  }

  const restore = () => {
    for (const key of keys) {
      if (key in saved) {
        (globalThis as any)[key] = saved[key];
      } else {
        delete (globalThis as any)[key];
      }
    }
    if (navigatorSaved) {
      if (navigatorHadDescriptor && existingDescriptor) {
        Object.defineProperty(globalThis, 'navigator', existingDescriptor);
      } else if (!navigatorHadDescriptor) {
        delete (globalThis as any)['navigator'];
      }
    } else {
      delete (globalThis as any)['navigator'];
    }
  };

  return { globals, restore };
}

async function generatePotokenInner(): Promise<PoTokenData> {
  const { Innertube } = await import('youtubei.js');

  const userAgent = YT_USER_AGENT;

  const tempInnertube = await Innertube.create({
    retrieve_player: false,
    user_agent: userAgent,
    generate_session_locally: true,
  });

  const visitorData = tempInnertube.session.context.client.visitorData;
  if (!visitorData) {
    throw new Error('[PoToken] Could not obtain visitor_data from Innertube session');
  }

  const { globals, restore } = createDomGlobals();

  try {
    const bgConfig = {
      fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
      globalObj: globalThis,
      identifier: visitorData,
      requestKey: REQUEST_KEY,
    };

    if (DEBUG) console.debug('[PoToken] Fetching BotGuard challenge…');
    const bgChallenge = await BG.Challenge.create(bgConfig as any);
    if (!bgChallenge) {
      throw new Error('[PoToken] Could not obtain BotGuard challenge');
    }

    const interpreterJavascript =
      bgChallenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;

    if (interpreterJavascript) {
      // eslint-disable-next-line react-doctor/no-eval
      new Function(interpreterJavascript)();
    } else {
      throw new Error('[PoToken] Could not load BotGuard VM (no interpreter script)');
    }

    if (DEBUG) console.debug('[PoToken] Running PoToken.generate…');
    const poTokenResult = await BG.PoToken.generate({
      program: bgChallenge.program,
      globalName: bgChallenge.globalName,
      bgConfig: bgConfig as any,
    });

    const poToken = poTokenResult.poToken;
    if (!poToken) {
      throw new Error('[PoToken] PoToken generation returned empty result');
    }

    if (DEBUG) {
      console.debug('[PoToken] Generated PoToken successfully', {
        visitorData: visitorData.slice(0, 20) + '…',
        poToken: poToken.slice(0, 20) + '…',
        hasIntegrityTokenData: !!poTokenResult.integrityTokenData,
      });
    }

    const ttlMs =
      poTokenResult.integrityTokenData?.estimatedTtlSecs != null
        ? Math.max(poTokenResult.integrityTokenData.estimatedTtlSecs * 1000 * 0.8, 60_000)
        : DEFAULT_TTL_MS;

    return {
      visitorData,
      poToken,
      generatedAt: Date.now(),
      ttlMs,
    };
  } finally {
    restore();
  }
}

export async function getPoToken(): Promise<PoTokenData> {
  if (cachedToken && Date.now() < cachedToken.generatedAt + cachedToken.ttlMs) {
    return cachedToken;
  }

  if (generationPromise) {
    return generationPromise;
  }

  generationPromise = (async () => {
    try {
      const data = await generatePotokenInner();
      cachedToken = data;
      return data;
    } catch (err) {
      console.error('[PoToken] Auto-generation failed:', err);
      cachedToken = null;
      throw err;
    } finally {
      generationPromise = null;
    }
  })();

  return generationPromise;
}

export function invalidatePoToken(): void {
  cachedToken = null;
  generationPromise = null;
}

export function hasValidPoToken(): boolean {
  return cachedToken != null && Date.now() < cachedToken.generatedAt + cachedToken.ttlMs;
}