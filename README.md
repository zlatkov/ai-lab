# ai-lab

A personal playground for AI experiments at [zlatkov.ai](https://zlatkov.ai).

## Apps

### [skillab](https://skillab.zlatkov.ai)

Tools for working with AI Agent Skills (SKILL.md files) — evaluate skills across models and visualise skill dependency graphs.

### [ai-news](https://ainews.zlatkov.ai)

AI industry news digest, scored and categorized — updated twice daily by an agent that scans Hacker News, Brave Search, RSS feeds, and key X accounts.

### [oss-llms](https://llms.zlatkov.ai)

Open-source LLM pricing and availability tracker across 9 inference providers (Groq, Together, DeepInfra, Fireworks, Hyperbolic, Cerebras, SambaNova, Novita, OpenRouter).

## Monorepo Structure

```
apps/
├── home/       → zlatkov.ai            Personal home page
├── skillab/    → skillab.zlatkov.ai    Skill evaluator + dependency graph
├── ai-news/    → ainews.zlatkov.ai     AI news digest
└── oss-llms/   → llms.zlatkov.ai       OSS LLM pricing tracker
```

Built with [Turborepo](https://turbo.build). Each app is deployed independently on Vercel.

## Development

```bash
npm install

npm run dev:home      # http://localhost:3000
npm run dev:skillab   # http://localhost:3001
npm run dev:ainews    # http://localhost:3002
npm run dev:ossllms   # http://localhost:3003

npm run dev           # all apps via turbo
```

## Tech Stack

- Next.js 15, React 19, TypeScript
- Tailwind CSS v4
- Vercel AI SDK
- Supabase (ai-news and oss-llms storage)
- Turborepo

## License

MIT
