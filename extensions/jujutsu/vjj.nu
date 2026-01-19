#!/usr/bin/env nu

# Vicinae Jujutsu Extension CLI Wrapper
# This script provides CLI commands that wrap the Vicinae Jujutsu extension using deeplinks.
# Mimics original JJ CLI syntax but uses vjj command.

# Usage examples:
#   vjj main (or just vjj - defaults to main)
#   vjj status
#   vjj log --repo /path/to/repo
#   vjj bookmarks
#   vjj undo
#   vjj squash
#   vjj split
#   vjj abandon
#   vjj help
#   vjj help status
#   vjj status --help

# Helper function to open Vicinae deeplink
def open-vicinae [url: string] {
  if ($nu.os-info.name == "linux") {
    run-external "xdg-open" $url
  } else if ($nu.os-info.name == "macos") {
    run-external "open" $url
  } else if ($nu.os-info.name =~ "windows") {
    run-external "start" $url
  } else {
    print $"Unsupported OS for opening URLs: ($nu.os-info.name)"
  }
}

# Get current working directory as repo path
def get-repo-path [] {
  $env.PWD
}

# --- Help ---

def print-help [] {
  print "vjj - Vicinae Jujutsu Extension CLI Wrapper"
  print ""
  print "Usage:"
  print "  vjj [command] [--repo <path>]"
  print "  vjj help [command]"
  print ""
  print "Commands:"
  print "  main        Open the JJ main dashboard (default)"
  print "  status      Show working copy status"
  print "  log         Show change history"
  print "  new-change  Create a new change"
  print "  describe    Edit change description"
  print "  diff        Show working copy diff"
  print "  bookmarks   Manage bookmarks"
  print "  undo        Undo last operation"
  print "  squash      Squash changes"
  print "  split       Split change"
  print "  abandon     Abandon change"
  print "  resolve     Resolve conflicts"
  print "  edit        Time travel / edit change"
  print ""
  print "Options:"
  print "  -r, --repo <path>   Repository path (defaults to current directory)"
  print "  -h, --help          Show help for a specific command (e.g. vjj status --help)"
  print ""
  print "Examples:"
  print "  vjj"
  print "  vjj status"
  print "  vjj log --repo /path/to/repo"
  print "  vjj bookmarks"
  print "  vjj resolve -r ."
  print "  vjj help"
  print "  vjj help status"
}


def print-command-help [cmd: string] {
  let key = ($cmd | str downcase)

  match $key {
    "main" => {
      print "vjj main - Open JJ main dashboard"
      print "Usage: vjj main [--repo <path>]"
      print ""
      print "Notes:"
      print "  If --repo is omitted, vjj passes your current shell directory as repo-path."
    }
    "status" => {
      print "vjj status - Show JJ status"
      print "Usage: vjj status [--repo <path>]"
    }
    "log" => {
      print "vjj log - Show JJ log"
      print "Usage: vjj log [--repo <path>]"
    }
    "new-change" => {
      print "vjj new-change - Create a new change"
      print "Usage: vjj new-change [--repo <path>]"
      print ""
      print "Note:"
      print "  The change description is entered in Vicinae."
    }
    "describe" => {
      print "vjj describe - Edit current change description"
      print "Usage: vjj describe [--repo <path>]"
    }
    "diff" => {
      print "vjj diff - Show working copy diff"
      print "Usage: vjj diff [--repo <path>]"
    }
    "bookmarks" => {
      print "vjj bookmarks - Manage bookmarks"
      print "Usage: vjj bookmarks [--repo <path>]"
    }
    "undo" => {
      print "vjj undo - Undo last operation"
      print "Usage: vjj undo [--repo <path>]"
    }
    "squash" => {
      print "vjj squash - Squash changes"
      print "Usage: vjj squash [--repo <path>]"
    }
    "split" => {
      print "vjj split - Split current change"
      print "Usage: vjj split [--repo <path>]"
    }
    "abandon" => {
      print "vjj abandon - Abandon current change"
      print "Usage: vjj abandon [--repo <path>]"
    }
    "resolve" => {
      print "vjj resolve - Resolve conflicts"
      print "Usage: vjj resolve [--repo <path>]"
    }
    "edit" => {
      print "vjj edit - Time travel / edit a change"
      print "Usage: vjj edit [--repo <path>]"
    }
    "revset" => {
      print "vjj revset - Query changes with revset expressions"
      print "Usage: vjj revset [--repo <path>]"
      print ""
      print "Examples:"
      print "  vjj revset                    # Query working copy"
      print "  vjj revset --repo /path       # Query at path"
    }
    _ => {
      print $"Unknown command: ($cmd)"
      print ""
      print-help
    }
  }
}

# --- Commands ---

# jj main (all operations in one interface)
def "vjj main" [--repo (-r): string --help (-h)] {
  if $help {
    print-command-help "main"
    return
  }

  let actual_repo = if ($repo == null) { get-repo-path } else { $repo }
  let args_enc = ({"repo-path": $actual_repo} | to json --raw | url encode)
  let url = $"vicinae://extensions/knoopx/jujutsu/main?arguments=($args_enc)"
  open-vicinae $url
}

def _vjj-open [cmd: string, repo?: string] {
  let actual_repo = if ($repo == null) { get-repo-path } else { $repo }
  let args_enc = ({"repo-path": $actual_repo} | to json --raw | url encode)
  let url = $"vicinae://extensions/knoopx/jujutsu/($cmd)?arguments=($args_enc)"
  open-vicinae $url
}

# jj status
def "vjj status" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "status"; return }
  _vjj-open "status" $repo
}

# jj log
def "vjj log" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "log"; return }
  _vjj-open "log" $repo
}

# jj new-change
def "vjj new-change" [--repo (-r): string --message (-m): string --help (-h)] {
  if $help { print-command-help "new-change"; return }
  _vjj-open "new-change" $repo
}

# jj describe
def "vjj describe" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "describe"; return }
  _vjj-open "describe" $repo
}

# jj diff
def "vjj diff" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "diff"; return }
  _vjj-open "diff" $repo
}

# jj bookmarks
def "vjj bookmarks" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "bookmarks"; return }
  _vjj-open "bookmarks" $repo
}

# jj undo
def "vjj undo" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "undo"; return }
  _vjj-open "undo" $repo
}

# jj squash
def "vjj squash" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "squash"; return }
  _vjj-open "squash" $repo
}

# jj split
def "vjj split" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "split"; return }
  _vjj-open "split" $repo
}

# jj abandon
def "vjj abandon" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "abandon"; return }
  _vjj-open "abandon" $repo
}

# jj resolve
def "vjj resolve" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "resolve"; return }
  _vjj-open "resolve" $repo
}

# jj edit
def "vjj edit" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "edit"; return }
  _vjj-open "edit" $repo
}

# jj revset
def "vjj revset" [--repo (-r): string --help (-h)] {
  if $help { print-command-help "revset"; return }
  _vjj-open "revset" $repo
}

# Main vjj command dispatcher
# Note: Nushell reserves -h/--help at the script level.
# Global help is therefore provided via: `vjj help` and `vjj help <command>`.
def main [
  command?: string
  --repo (-r): string
] {
  let cmd = if ($command == null) { "main" } else { $command }

  match $cmd {
    "help" => {
      if ($command == null) {
        print-help
      } else {
        print-command-help $command
      }
    }

    "main" => { if ($repo == null) { vjj main } else { vjj main --repo $repo } }
    "status" => { if ($repo == null) { vjj status } else { vjj status --repo $repo } }
    "log" => { if ($repo == null) { vjj log } else { vjj log --repo $repo } }
    "new-change" => { if ($repo == null) { vjj new-change } else { vjj new-change --repo $repo } }
    "describe" => { if ($repo == null) { vjj describe } else { vjj describe --repo $repo } }
    "diff" => { if ($repo == null) { vjj diff } else { vjj diff --repo $repo } }
    "bookmarks" => { if ($repo == null) { vjj bookmarks } else { vjj bookmarks --repo $repo } }
    "undo" => { if ($repo == null) { vjj undo } else { vjj undo --repo $repo } }
    "squash" => { if ($repo == null) { vjj squash } else { vjj squash --repo $repo } }
    "split" => { if ($repo == null) { vjj split } else { vjj split --repo $repo } }
    "abandon" => { if ($repo == null) { vjj abandon } else { vjj abandon --repo $repo } }
    "resolve" => { if ($repo == null) { vjj resolve } else { vjj resolve --repo $repo } }
    "edit" => { if ($repo == null) { vjj edit } else { vjj edit --repo $repo } }
    "revset" => { if ($repo == null) { vjj revset } else { vjj revset --repo $repo } }

    _ => {
      print $"Unknown command: ($cmd)"
      print ""
      print-help
    }
  }
}
