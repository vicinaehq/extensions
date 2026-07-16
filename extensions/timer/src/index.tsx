import {
  List,
  ActionPanel,
  Action,
  Icon,
  Cache,
  getPreferenceValues,
  Color,
  showToast,
  Toast,
} from "@vicinae/api"
import { useState, useEffect } from "react"
import { exec } from "child_process"
import { parseInput, formatTime, formatTargetTime } from "./utils"

type Timer = {
  id: string
  name: string
  note: string
  targetEpoch: number
  unitName: string
}

interface Preferences {
  presets: string
}

const cache = new Cache()

export default function TimerCommand() {
  const [timers, setTimers] = useState<Timer[]>([])
  const [searchText, setSearchText] = useState("")
  const [currentTime, setCurrentTime] = useState(Date.now())
  const prefs = getPreferenceValues<Preferences>()

  const presetsList = (prefs.presets || "")
    .split(",")
    .map(p => p.trim())
    .filter(Boolean)

  useEffect(() => {
    const stored = cache.get("active_timers")
    if (stored) {
      const parsedTimers = JSON.parse(stored)
      const activeTimers = parsedTimers.filter((t: Timer) => t.targetEpoch > Date.now())
      setTimers(activeTimers)
      if (activeTimers.length !== parsedTimers.length) {
        cache.set("active_timers", JSON.stringify(activeTimers))
      }
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)

      setTimers(current => {
        const active = current.filter(t => t.targetEpoch > now)
        if (active.length !== current.length) {
          cache.set("active_timers", JSON.stringify(active))
        }
        return active
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const { seconds: parsedSeconds, note } = parseInput(searchText)

  const startTimer = (seconds: number, timerNote: string) => {
    const id = Date.now().toString()
    const unitName = `vicinae-timer-${id}`

    const cmd = `systemd-run --user --on-active="${seconds}s" --timer-property=AccuracySec=1s --unit="${unitName}" -- /usr/bin/env bash -c 'notify-send -a "Vicinae" "Timer" "${timerNote}"'`

    exec(cmd, error => {
      if (error) {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to start timer",
          message: "Ensure 'systemd' and 'libnotify' are installed.",
        })
        return
      }
    })

    const newTimer: Timer = {
      id,
      name: formatTime(seconds),
      note: timerNote,
      targetEpoch: Date.now() + seconds * 1000,
      unitName,
    }

    const newTimers = [newTimer, ...timers]
    setTimers(newTimers)
    cache.set("active_timers", JSON.stringify(newTimers))
    setSearchText("")
  }

  const cancelTimer = (id: string, unitName: string) => {
    exec(`systemctl --user stop ${unitName}.timer`)
    const updated = timers.filter(t => t.id !== id)
    setTimers(updated)
    cache.set("active_timers", JSON.stringify(updated))
  }

  const cancelAllTimers = () => {
    timers.forEach(t => {
      exec(`systemctl --user stop ${t.unitName}.timer`)
    })
    setTimers([])
    cache.set("active_timers", JSON.stringify([]))
  }

  return (
    <List
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Duration and optional note (e.g., 5m Check laundry)"
    >
      {parsedSeconds !== null && parsedSeconds > 0 && (
        <List.Item
          title={`Start timer for ${formatTime(parsedSeconds)}`}
          subtitle={note}
          icon={{ source: Icon.Clock, tintColor: Color.Green }}
          actions={
            <ActionPanel>
              <Action
                title="Start Timer"
                onAction={() => startTimer(parsedSeconds, note)}
                icon={Icon.Play}
              />
            </ActionPanel>
          }
        />
      )}

      <List.Section title="Active Timers">
        {timers.map(timer => {
          const remainingSeconds = (timer.targetEpoch - currentTime) / 1000
          return (
            <List.Item
              key={timer.id}
              title={formatTime(remainingSeconds)}
              subtitle={timer.note}
              icon={Icon.Stopwatch}
              accessories={[
                { text: `Ends at ${formatTargetTime(timer.targetEpoch)}`, icon: Icon.Calendar },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Cancel Timer"
                    onAction={() => cancelTimer(timer.id, timer.unitName)}
                    icon={Icon.Stop}
                    style="destructive"
                  />
                  <Action.CopyToClipboard
                    title="Copy Timer Note"
                    content={timer.note}
                    shortcut={{ modifiers: ["ctrl"], key: "c" }}
                  />
                  <Action
                    title="Cancel All Timers"
                    onAction={cancelAllTimers}
                    icon={Icon.Trash}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "backspace" }}
                    style="destructive"
                  />
                </ActionPanel>
              }
            />
          )
        })}
      </List.Section>

      {!searchText && presetsList.length > 0 && (
        <List.Section title="Presets">
          {presetsList.map((preset, index) => {
            const parsedPreset = parseInput(preset)
            if (!parsedPreset.seconds) return null

            return (
              <List.Item
                key={index}
                title={formatTime(parsedPreset.seconds)}
                subtitle={parsedPreset.note}
                icon={Icon.Star}
                actions={
                  <ActionPanel>
                    <Action
                      title="Start Preset"
                      onAction={() => startTimer(parsedPreset.seconds as number, parsedPreset.note)}
                      icon={Icon.Play}
                    />
                  </ActionPanel>
                }
              />
            )
          })}
        </List.Section>
      )}
    </List>
  )
}
