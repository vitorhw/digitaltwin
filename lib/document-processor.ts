export interface DocumentChunk {
  text: string
  sectionPath?: string
  pageNumber?: number
}

export function chunkDocument(text: string, chunkSize = 1000, overlap = 200): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]

  let currentChunk = ""
  let currentLength = 0

  for (const sentence of sentences) {
    const sentenceLength = sentence.length

    if (currentLength + sentenceLength > chunkSize && currentChunk.length > 0) {
      chunks.push({ text: currentChunk.trim() })

      // Keep overlap from previous chunk
      const words = currentChunk.split(" ")
      const overlapWords = words.slice(-Math.floor(overlap / 5))
      currentChunk = overlapWords.join(" ") + " " + sentence
      currentLength = currentChunk.length
    } else {
      currentChunk += sentence
      currentLength += sentenceLength
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({ text: currentChunk.trim() })
  }

  return chunks
}

export function extractTextFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const text = e.target?.result as string
      resolve(text)
    }

    reader.onerror = () => {
      reject(new Error("Failed to read file"))
    }

    // For now, only support text files
    // In production, you'd want to add PDF, DOCX parsing
    if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      reader.readAsText(file)
    } else {
      reject(new Error("Unsupported file type. Please upload a text file."))
    }
  })
}
