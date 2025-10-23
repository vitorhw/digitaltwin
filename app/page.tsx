import { createServerClient } from "@/lib/supabase/server"
import {
  getCurrentFacts,
  getEpisodicMemories,
  getDocuments,
  getMemoryGraphData,
  sweepExpiredFacts,
} from "@/app/actions/memory"
import { getProceduralRules } from "@/app/actions/procedural-rules"
import { SinglePageApp } from "@/components/single-page-app"

export default async function HomePage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <SinglePageApp
        isLoggedIn={false}
        initialFacts={[]}
        initialMemories={[]}
        initialDocuments={[]}
        initialRules={[]}
      />
    )
  }

  await sweepExpiredFacts()

  const [factsResult, memoriesResult, documentsResult, graphDataResult, rulesResult] = await Promise.all([
    getCurrentFacts(),
    getEpisodicMemories(),
    getDocuments(),
    getMemoryGraphData(),
    getProceduralRules(),
  ])

  const facts = factsResult.facts || []
  const memories = memoriesResult.memories || []
  const documents = documentsResult.documents || []
  const rules = rulesResult.rules || []

  // Use graph data with embeddings for 3D visualization if available
  const graphFacts = graphDataResult.facts || facts
  const graphMemories = graphDataResult.memories || memories
  const graphDocuments = graphDataResult.documents || documents

  return (
    <SinglePageApp
      isLoggedIn={true}
      initialFacts={graphFacts}
      initialMemories={graphMemories}
      initialDocuments={graphDocuments}
      initialRules={rules}
    />
  )
}
