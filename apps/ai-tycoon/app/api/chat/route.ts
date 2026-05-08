import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { BUILDING_DEFS, GRID_W, GRID_H } from '../../../lib/constants';

interface ChatBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  gameSummary: string;
  userApiKey?: string;
  model?: string;
}

const buildingsList = Object.values(BUILDING_DEFS)
  .map(d => `- "${d.type}" (${d.size}x${d.size}, $${d.cost}): produces ${JSON.stringify(d.produces)}, consumes ${JSON.stringify(d.consumes)}`)
  .join('\n');

const SYSTEM_PROMPT = `You are an AI advisor inside an AI-economy tycoon game. The player builds the AI industry: power plants, data centers, GPU farms, research labs, AI labs.

The world is a ${GRID_W}x${GRID_H} grid; (0,0) is top-left, x grows right, y grows down. Buildings occupy their footprint starting at (x,y) top-left.

Buildings:
${buildingsList}

Infrastructure: "road" ($50/tile), "railway" ($150/tile), "power_line" ($30/tile). Adjacent infra gives +10% efficiency to a building. A building idles when its inputs (energy, compute, data, talent) cannot be supplied; capital can go negative (debt).

You can both advise and act. To act, end your reply with a JSON block:
<commands>
[{"type":"build","buildingType":"data_center","x":15,"y":15},
 {"type":"infra","infraType":"road","x":15,"y":17,"x2":20,"y2":17},
 {"type":"demolish","x":5,"y":5}]
</commands>

Rules for commands:
- Only emit a <commands> block if the player asked to do something specific OR you're confident the action is correct given their goal.
- Never build "hq" — there's only one.
- Avoid placing on occupied tiles. The game state lists existing buildings.
- For infra lines, "x"/"y" is the start, "x2"/"y2" is the end. Omit x2/y2 for a single tile.
- Coordinates must be within bounds.

Be terse — 1-3 sentences of advice, then commands if any. No markdown headers, no fluff.`;

export async function POST(req: Request) {
  try {
    const body = await req.json() as ChatBody;
    const apiKey = body.userApiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) return Response.json({ error: 'No API key configured. Add your OpenRouter API key in the AI settings.' }, { status: 500 });

    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      headers: {
        'HTTP-Referer': 'https://tycoon.zlatkov.ai',
        'X-Title': 'tycoon',
      },
    });
    const model = body.model ?? process.env.TYCOON_MODEL ?? 'meta-llama/llama-3.1-8b-instruct';

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: `Game state:\n${body.gameSummary}` },
      ...body.messages,
    ];

    const { text } = await generateText({
      model: openrouter(model),
      system: SYSTEM_PROMPT,
      messages,
    });

    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
