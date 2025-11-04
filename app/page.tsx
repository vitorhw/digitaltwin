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
        initialVoiceProfile={null}
      />
    )
  }

  await sweepExpiredFacts()

  const [factsResult, memoriesResult, documentsResult, graphDataResult, rulesResult, voiceProfileResult] =
    await Promise.all([
    getCurrentFacts(),
    getEpisodicMemories(),
    getDocuments(),
    getMemoryGraphData(),
    getProceduralRules(),
      supabase
        .from("voice_profile")
        .select("user_id, sample_object_path, sample_mime_type, clone_reference, speak_back_enabled, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ])

  const facts = factsResult.facts || []
  const memories = memoriesResult.memories || []
  const documents = documentsResult.documents || []
  const rules = rulesResult.rules || []
  const voiceProfile = voiceProfileResult.data || null

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
      initialVoiceProfile={voiceProfile}
    />
  )
}
