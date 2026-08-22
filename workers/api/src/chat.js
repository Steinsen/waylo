/**
 * Chatbot med Claude tool use.
 *
 * Kör en agentloop: Claude får frågan + verktygen, anropar verktyg tills
 * den är klar, och texten strömmas ut till widgeten via SSE.
 *
 * Modellen styrs av CLAUDE_MODEL i wrangler.toml (default claude-sonnet-4-6,
 * ett medvetet val för latens och kostnad i en chattwidget). Extended
 * thinking är avstängt av samma skäl — svaren ska komma direkt.
 */

import Anthropic from '@anthropic-ai/sdk';
import { byggTools, executeTool } from './tools.js';
import {
  hamtaInstans,
  byggSystemPrompt,
  aktuellSasong,
  andraSasongen,
} from './config.js';
import { loggaChatt } from './poi.js';

const MAX_ITERATIONER = 6;
const MAX_PAUSER = 4;      // pause_turn räknas separat från verktygsvarven
const MAX_TOKENS = 2048;
const MAX_HISTORIK = 20; // meddelanden som skickas med bakåt

/**
 * Kör en chattomgång och yieldar händelser:
 *   { typ: 'text',  text }        — textdelta att rendera direkt
 *   { typ: 'verktyg', namn }      — verktyg körs (visa "söker ...")
 *   { typ: 'poi',   ids }         — POI:er som nämnts, för kartan
 *   { typ: 'kallor', kallor }     — källor från webbsökning, måste visas
 *   { typ: 'klar',  svar }        — färdigt svar
 *   { typ: 'fel',   meddelande }
 */
export async function* koraChatt(env, { fraga, historik, sprak, session_id }) {
  const instans_id = env.INSTANS_ID;
  const instans = await hamtaInstans(env, instans_id);

  const nu = new Date();
  const sasong = aktuellSasong(nu);

  const ctx = {
    instans,
    instans_id,
    sprak: sprak || 'sv',
    poi_ids: new Set(),
  };

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    // Endast för test mot en stubbad API-server; tom i produktion.
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
  });

  const system = byggSystemPrompt(instans, {
    sasong,
    sprak: ctx.sprak,
    datum: nu.toISOString().slice(0, 10),
  }) + `\n\nDen andra säsongen (${andraSasongen(sasong)}) finns också i ` +
    `databasen — sök gärna där när gästen planerar en framtida resa.`;

  const messages = [
    ...normaliseraHistorik(historik),
    { role: 'user', content: fraga },
  ];

  const tools = byggTools(instans_id);
  const kallor = new Map();   // url -> { url, titel }
  let svarstext = '';
  let pauser = 0;

  for (let i = 0; i < MAX_ITERATIONER; i++) {
    const stream = client.messages.stream({
      model: env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: MAX_TOKENS,
      system,
      tools,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        svarstext += event.delta.text;
        yield { typ: 'text', text: event.delta.text };
      } else if (
        event.type === 'content_block_start' &&
        event.content_block.type === 'server_tool_use'
      ) {
        // Webbsökningen körs hos Anthropic — visa status under pausen
        yield { typ: 'verktyg', namn: event.content_block.name };
      }
    }

    const svar = await stream.finalMessage();

    // Sökresultatens encrypted_content måste tillbaka orört, så
    // content-blocken skickas vidare precis som de kom.
    messages.push({ role: 'assistant', content: svar.content });

    for (const kalla of plockaKallor(svar.content)) {
      if (!kallor.has(kalla.url)) kallor.set(kalla.url, kalla);
    }

    // Anthropic pausar långa server-tool-turer. Skicka tillbaka det
    // pausade svaret oförändrat så fortsätter den där den slutade —
    // utan detta klipps svaret tyst mitt i.
    if (svar.stop_reason === 'pause_turn') {
      if (++pauser > MAX_PAUSER) break;
      i--;   // en paus är inte ett verktygsvarv
      continue;
    }

    if (svar.stop_reason !== 'tool_use') {
      break;
    }

    const anrop = svar.content.filter((b) => b.type === 'tool_use');
    for (const block of anrop) {
      yield { typ: 'verktyg', namn: block.name };
    }

    // Parallella verktygsanrop måste besvaras i EN user-message
    const resultat = await Promise.all(
      anrop.map(async (block) => {
        try {
          const output = await executeTool(block.name, block.input, env, ctx);
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: output,
          };
        } catch (err) {
          console.error(`Verktyg ${block.name} misslyckades:`, err);
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Verktyget misslyckades: ${err.message}`,
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: 'user', content: resultat });
  }

  const poi_ids = [...ctx.poi_ids];
  if (poi_ids.length) yield { typ: 'poi', ids: poi_ids };
  if (kallor.size) yield { typ: 'kallor', kallor: [...kallor.values()] };

  await loggaChatt(env, {
    instans_id,
    session_id,
    fraga,
    svar: svarstext,
    poi_ids,
    sprak: ctx.sprak,
  });

  yield { typ: 'klar', svar: svarstext, poi_ids };
}

/** POST /chat — Server-Sent Events (default) eller JSON (stream: false). */
export async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ fel: 'Ogiltig JSON' }, { status: 400 });
  }

  const fraga = (body.fraga ?? body.message ?? '').toString().trim();
  if (!fraga) {
    return Response.json({ fel: 'Fältet "fraga" saknas' }, { status: 400 });
  }
  if (fraga.length > 2000) {
    return Response.json({ fel: 'Frågan är för lång' }, { status: 400 });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json(
      { fel: 'ANTHROPIC_API_KEY saknas — kör: wrangler secret put ANTHROPIC_API_KEY' },
      { status: 500 }
    );
  }

  const args = {
    fraga,
    historik: body.historik,
    sprak: body.sprak,
    session_id: body.session_id,
  };

  if (body.stream === false) {
    try {
      let slutsvar = null;
      for await (const h of koraChatt(env, args)) {
        if (h.typ === 'klar') slutsvar = h;
      }
      return Response.json({ svar: slutsvar?.svar ?? '', poi_ids: slutsvar?.poi_ids ?? [] });
    } catch (err) {
      console.error('Chattfel:', err);
      return Response.json({ fel: err.message }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const skicka = (data) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const h of koraChatt(env, args)) skicka(h);
      } catch (err) {
        console.error('Chattfel:', err);
        skicka({ typ: 'fel', meddelande: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Plockar ut källhänvisningar ur svarets textblock. Anthropics villkor
 * kräver att källorna visas för slutanvändaren när svaret återges.
 */
function plockaKallor(content) {
  const ut = [];
  for (const block of content) {
    if (block.type !== 'text' || !block.citations) continue;
    for (const c of block.citations) {
      if (c.url) ut.push({ url: c.url, titel: c.title ?? c.url });
    }
  }
  return ut;
}

/** Trimmar och validerar historiken från klienten. */
function normaliseraHistorik(historik) {
  if (!Array.isArray(historik)) return [];
  return historik
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim()
    )
    .slice(-MAX_HISTORIK)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}
