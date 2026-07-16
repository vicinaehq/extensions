import { expect, test, describe } from "bun:test"
import { parseInput, formatTime, formatTargetTime } from "./utils"

describe("parseInput", () => {
  test("parses plain numbers as minutes", () => {
    expect(parseInput("5")).toEqual({ seconds: 300, note: "Timer" })
  })

  test("parses minute suffix", () => {
    expect(parseInput("5m")).toEqual({ seconds: 300, note: "Timer" })
  })

  test("parses hour and second suffixes", () => {
    expect(parseInput("2h")).toEqual({ seconds: 7200, note: "Timer" })
    expect(parseInput("45s")).toEqual({ seconds: 45, note: "Timer" })
  })

  test("parses colon formats (MM:SS and HH:MM:SS)", () => {
    expect(parseInput("2:30")).toEqual({ seconds: 150, note: "Timer" })
    expect(parseInput("1:05:10")).toEqual({ seconds: 3910, note: "Timer" })
  })

  test("extracts notes correctly", () => {
    expect(parseInput("5m Check laundry")).toEqual({ seconds: 300, note: "Check laundry" })
    expect(parseInput("1:30 Read a book")).toEqual({ seconds: 90, note: "Read a book" })
  })

  test("handles empty or invalid input", () => {
    expect(parseInput("")).toEqual({ seconds: null, note: "" })
    expect(parseInput("   ")).toEqual({ seconds: null, note: "" })
  })
})

describe("formatTime", () => {
  test("formats minutes and seconds", () => {
    expect(formatTime(300)).toBe("5:00")
    expect(formatTime(150)).toBe("2:30")
    expect(formatTime(45)).toBe("0:45")
  })

  test("formats hours, minutes, and seconds", () => {
    expect(formatTime(3600)).toBe("1:00:00")
    expect(formatTime(3665)).toBe("1:01:05")
  })

  test("handles zero or negative seconds", () => {
    expect(formatTime(0)).toBe("0:00")
    expect(formatTime(-10)).toBe("0:00")
  })
})

describe("formatTargetTime", () => {
  test("returns a formatted time string", () => {
    const epoch = new Date("2026-01-01T15:30:00").getTime()
    const result = formatTargetTime(epoch)

    // Checks if the result matches a standard 12-hour or 24-hour time format (e.g., "3:30 PM" or "15:30")
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })
})
