export function parseInput(input: string): { seconds: number | null; note: string } {
  const trimmed = input.trim()
  if (!trimmed) return { seconds: null, note: "" }

  const match = trimmed.match(/^((?:\d+:\d{1,2}(?::\d{1,2})?)|\d+[hms]?)(?:\s+(.*))?$/i)
  if (!match) return { seconds: null, note: "" }

  const durationStr = match[1].toLowerCase()
  const note = match[2] || "Timer"
  let seconds = null

  const colonMatch = durationStr.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (colonMatch) {
    if (colonMatch[3]) {
      seconds =
        parseInt(colonMatch[1]) * 3600 + parseInt(colonMatch[2]) * 60 + parseInt(colonMatch[3])
    } else {
      seconds = parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2])
    }
  } else {
    const suffixMatch = durationStr.match(/^(\d+)(h|m|s)?$/)
    if (suffixMatch) {
      const value = parseInt(suffixMatch[1])
      const suffix = suffixMatch[2] || "m"
      if (suffix === "h") seconds = value * 3600
      if (suffix === "m") seconds = value * 60
      if (suffix === "s") seconds = value
    }
  }

  return { seconds, note }
}

export function formatTime(seconds: number) {
  if (seconds <= 0) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function formatTargetTime(epoch: number) {
  return new Date(epoch).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
