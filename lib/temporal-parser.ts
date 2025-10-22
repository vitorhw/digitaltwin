"use server"

/**
 * Parse temporal references in text and convert to absolute dates
 * Examples: "yesterday", "last Tuesday", "two weeks ago", "in 2020"
 */
export function parseTemporalReference(text: string, referenceDate: Date = new Date()): Date | null {
  const lowerText = text.toLowerCase().trim()

  // Today/now
  if (lowerText.includes("today") || lowerText.includes("now")) {
    return referenceDate
  }

  // Yesterday
  if (lowerText.includes("yesterday")) {
    const date = new Date(referenceDate)
    date.setDate(date.getDate() - 1)
    return date
  }

  // Tomorrow
  if (lowerText.includes("tomorrow")) {
    const date = new Date(referenceDate)
    date.setDate(date.getDate() + 1)
    return date
  }

  // Last week
  if (lowerText.includes("last week")) {
    const date = new Date(referenceDate)
    date.setDate(date.getDate() - 7)
    return date
  }

  // This week
  if (lowerText.includes("this week")) {
    return referenceDate
  }

  // Days of the week (last Monday, last Tuesday, etc.)
  const dayMatch = lowerText.match(/last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)
  if (dayMatch) {
    const targetDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(
      dayMatch[1].toLowerCase(),
    )
    const currentDay = referenceDate.getDay()
    let daysAgo = currentDay - targetDay
    if (daysAgo <= 0) daysAgo += 7 // Go back to previous week
    const date = new Date(referenceDate)
    date.setDate(date.getDate() - daysAgo)
    return date
  }

  // X days/weeks/months/years ago
  const agoMatch = lowerText.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i)
  if (agoMatch) {
    const amount = Number.parseInt(agoMatch[1])
    const unit = agoMatch[2].toLowerCase()
    const date = new Date(referenceDate)

    switch (unit) {
      case "day":
        date.setDate(date.getDate() - amount)
        break
      case "week":
        date.setDate(date.getDate() - amount * 7)
        break
      case "month":
        date.setMonth(date.getMonth() - amount)
        break
      case "year":
        date.setFullYear(date.getFullYear() - amount)
        break
    }
    return date
  }

  // Specific year (e.g., "in 2020", "during 2019")
  const yearMatch = lowerText.match(/\b(in|during|since)\s+(\d{4})\b/i)
  if (yearMatch) {
    const year = Number.parseInt(yearMatch[2])
    if (year >= 1900 && year <= 2100) {
      return new Date(year, 0, 1) // January 1st of that year
    }
  }

  // Month and year (e.g., "in March 2020", "during June 2019")
  const monthYearMatch = lowerText.match(
    /\b(in|during)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i,
  )
  if (monthYearMatch) {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ]
    const month = months.indexOf(monthYearMatch[2].toLowerCase())
    const year = Number.parseInt(monthYearMatch[3])
    if (month !== -1 && year >= 1900 && year <= 2100) {
      return new Date(year, month, 1)
    }
  }

  return null
}

/**
 * Extract temporal information from text and return both the parsed date and cleaned text
 */
export function extractTemporalInfo(text: string): {
  date: Date | null
  cleanedText: string
  temporalPhrase: string | null
} {
  const parsedDate = parseTemporalReference(text)

  if (!parsedDate) {
    return { date: null, cleanedText: text, temporalPhrase: null }
  }

  // Try to identify and remove the temporal phrase from the text
  const temporalPatterns = [
    /\b(yesterday|today|tomorrow)\b/gi,
    /\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|year)\b/gi,
    /\b\d+\s+(day|week|month|year)s?\s+ago\b/gi,
    /\b(in|during|since)\s+\d{4}\b/gi,
    /\b(in|during)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/gi,
  ]

  let cleanedText = text
  let temporalPhrase: string | null = null

  for (const pattern of temporalPatterns) {
    const match = text.match(pattern)
    if (match) {
      temporalPhrase = match[0]
      cleanedText = text.replace(pattern, "").trim()
      // Clean up extra spaces
      cleanedText = cleanedText.replace(/\s+/g, " ").trim()
      break
    }
  }

  return { date: parsedDate, cleanedText, temporalPhrase }
}
