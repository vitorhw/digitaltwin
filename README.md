# Digital Twin - Personal Memory Chat

A sophisticated AI-powered digital twin application that learns from your memories, habits, and communication style to create an authentic conversational representation of yourself.

## Overview

Digital Twin is a Next.js application that uses advanced AI and memory systems to create a personalized chatbot that doesn't just assist you—it **becomes** you. By analyzing your facts, episodic memories, procedural rules, and communication patterns, it can respond to conversations as if it were you speaking.

### Key Features

- **Semantic Memory (Facts)**: Stores and retrieves factual information about you
- **Episodic Memory**: Remembers specific events and experiences with temporal context
- **Procedural Rules**: Learns your habits, preferences, and if/then behavioral patterns
- **Communication Style**: Analyzes and replicates your tone, vocabulary, and writing style
- **AI-Powered Extraction**: Automatically discovers patterns and rules from conversations
- **Approval Workflow**: Review and approve AI-suggested memories before they're confirmed
- **Debug Interface**: Comprehensive tools to manage and inspect all memory types

## Tech Stack

- **Framework**: Next.js 15.5 (App Router)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4 via AI SDK
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI + shadcn/ui

## Prerequisites

- Node.js 18+ 
- npm, pnpm, or yarn
- A Supabase account and project
- An OpenAI API key

## Getting Started

### 1. Clone the Repository

\`\`\`bash
git clone <your-repo-url>
cd digitaltwin-frontend
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
# or
pnpm install
# or
yarn install
\`\`\`

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

\`\`\`env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Development Configuration
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000
\`\`\`

### 4. Set Up the Database

Run the SQL migration scripts in your Supabase SQL Editor in order:

1. Navigate to your Supabase project dashboard
2. Go to the SQL Editor
3. Execute each script in the `scripts/` folder sequentially:
   - `015_create_procedural_rules.sql`
   - `016_create_increment_rule_observation_function.sql`
   - (and any other numbered scripts in order)

These scripts will create all necessary tables, functions, and indexes.

### 5. Run the Development Server

\`\`\`bash
npm run dev
# or
pnpm dev
# or
yarn dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### First Time Setup

1. **Sign Up**: Create an account using email/password authentication
2. **Configure Style**: Go to the Style tab to set your communication preferences or use "Analyze from Memories" to auto-detect
3. **Add Memories**: Start chatting! The AI will automatically propose facts, memories, and rules as it learns about you

### Chat Interface

The chat interface is where your digital twin comes to life. As you converse:

- **Remembered**: Shows when the AI recalls relevant facts or memories
- **Proposed**: Displays new facts or memories the AI wants to add (requires approval)
- **Confirmed**: Indicates when a proposed item has been approved

### Debug Panel

Access comprehensive memory management tools:

- **Facts Tab**: View, approve, or reject semantic facts
- **Episodic Tab**: Manage episodic memories with temporal context
- **Rules Tab**: Review and manage procedural rules and habits

### Style Configuration

Fine-tune how your digital twin communicates:

- **Tone**: Formal, casual, professional, friendly, etc.
- **Formality Level**: 1-10 scale
- **Humor Style**: Sarcastic, witty, dry, playful, etc.
- **Common Phrases**: Expressions you frequently use
- **Vocabulary Level**: Simple, moderate, advanced, technical
- **Auto-Analysis**: Extract style from existing memories

## Project Structure

\`\`\`
digitaltwin-frontend/
├── app/
│   ├── actions/          # Server actions
│   │   ├── auth.ts       # Authentication actions
│   │   ├── memory.ts     # Memory management
│   │   ├── procedural-rules.ts
│   │   └── style.ts      # Communication style
│   ├── api/
│   │   └── chat/         # Chat API endpoint
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main page
├── components/
│   ├── chat-interface.tsx
│   ├── debug-facts-panel.tsx
│   ├── procedural-rules-panel.tsx
│   ├── single-page-app.tsx
│   ├── style-config-panel.tsx
│   └── ui/               # shadcn/ui components
├── lib/
│   ├── supabase/         # Supabase client utilities
│   └── temporal-parser.ts # Date/time parsing
├── scripts/              # Database migration scripts
└── public/               # Static assets
\`\`\`

## Key Concepts

### Memory Types

1. **Semantic (Facts)**: Timeless truths about you
   - Example: "favorite_color: blue"
   
2. **Episodic**: Specific events with context
   - Example: "Went to Paris in June 2023"
   
3. **Procedural**: Habits and behavioral rules
   - Example: "Always book flights with United"

### Approval Workflow

The system uses a three-stage approval process:

1. **AI Proposes**: During conversation, AI suggests new memories
2. **User Reviews**: You see proposals in the debug panel
3. **Confirmation**: Approve or reject to update the knowledge base

### Communication Style

Your digital twin learns to communicate like you by analyzing:

- Word choice and vocabulary
- Sentence structure and length
- Tone and formality
- Humor and personality markers
- Common phrases and expressions

## Development

### Build for Production

\`\`\`bash
npm run build
npm start
\`\`\`

### Linting

\`\`\`bash
npm run lint
\`\`\`

## Deployment

This project is optimized for deployment on Vercel:

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables in Vercel project settings
4. Deploy

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Your License Here]

## Support

For issues and questions, please open an issue on GitHub.
