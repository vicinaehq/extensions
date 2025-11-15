# Taskwarrior Extension

A Vicinae extension for managing tasks with [Taskwarrior](https://taskwarrior.org/).

## Features

- View tasks in different views (next, overdue, active, all)
- Add new tasks quickly
- Start/stop task tracking
- Delete tasks
- Search and filter tasks

## Requirements

- [Taskwarrior](https://taskwarrior.org/download/) must be installed and configured on your system

## Installation

1. Make sure Taskwarrior is installed: `task --version`
2. Configure Taskwarrior if you haven't already: `task config`
3. The extension will automatically detect and use your Taskwarrior setup

## Usage

### View Tasks
Use the "Taskwarrior Tasks" command to view your tasks. You can switch between different views:
- **Next**: Most urgent tasks (default)
- **List**: All pending tasks
- **Overdue**: Tasks past their due date
- **Active**: Currently active (started) tasks
- **All**: All tasks including completed and deleted

### Add Tasks
Use the "Add Task" command with a description to quickly add new tasks.

### Task Actions
From the task list, you can:
- **Start**: Begin working on a task
- **Stop**: Stop working on a task
- **Delete**: Remove a task permanently

## Preferences

- **Default View**: Choose which view to show by default
- **Show Due Dates**: Display due date information
- **Show Priority**: Display task priority levels
- **Show Tags**: Display task tags
- **Show Project**: Display project information

## Taskwarrior Integration

This extension uses Taskwarrior's command-line interface and JSON export format. All your existing Taskwarrior configuration and data will work seamlessly with this extension.