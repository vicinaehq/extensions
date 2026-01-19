// Must be at the top before any imports
vi.mock('@vicinae/api', () => ({
  closeMainWindow: vi.fn(),
}))
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}))
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}))
vi.mock('os', () => ({
  homedir: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, statSync, readdirSync } from 'fs'
import { execSync, spawn } from 'child_process'
import { homedir } from 'os'
import {
  getPidFile,
  getOutputFilePath,
  getRecordings,
  removeRecording,
  getRecordingStatus,
  toggleRecording,
  Recording
} from './utils'

const mockedExistsSync = existsSync as ReturnType<typeof vi.fn>
const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
const mockedWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>
const mockedUnlinkSync = unlinkSync as ReturnType<typeof vi.fn>
const mockedMkdirSync = mkdirSync as ReturnType<typeof vi.fn>
const mockedStatSync = statSync as ReturnType<typeof vi.fn>
const mockedReaddirSync = readdirSync as ReturnType<typeof vi.fn>
const mockedExecSync = execSync as ReturnType<typeof vi.fn>
const mockedSpawn = spawn as ReturnType<typeof vi.fn>
const mockedHomedir = homedir as ReturnType<typeof vi.fn>

describe('Screen Recording Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedHomedir.mockReturnValue('/home/test')
    mockedExecSync.mockReturnValue('')
    mockedSpawn.mockReturnValue({ pid: 1234, unref: vi.fn() } as any)
  })

  describe('File path utilities', () => {
    it('should return correct PID file path', () => {
      expect(getPidFile()).toBe('/home/test/.cache/vicinae/recording.pid')
    })

    it('should return correct output file path', () => {
      expect(getOutputFilePath()).toBe('/home/test/.cache/vicinae/recording.path')
    })
  })

  describe('Recording management', () => {
    it('should get empty recordings list when directory does not exist', async () => {
      mockedReaddirSync.mockImplementation(() => {
        throw new Error('Directory not found')
      })
      const recordings = await getRecordings()
      expect(recordings).toEqual([])
    })

    it('should get recordings from directory', async () => {
      const mockFiles = ['recording1.mp4', 'recording2.mp4', 'not-a-video.txt']
      mockedReaddirSync.mockReturnValue(mockFiles as any)
      mockedStatSync.mockImplementation((path) => ({
        birthtime: new Date('2024-01-01'),
        size: 1024
      } as any))

      const recordings = await getRecordings()
      expect(recordings).toHaveLength(2)
      expect(recordings[0].path).toContain('recording1.mp4') // Same timestamp, order unchanged
      expect(recordings[1].path).toContain('recording2.mp4')
    })

    it('should remove recording', async () => {
      mockedExistsSync.mockReturnValue(true)
      await removeRecording('/path/to/recording.mp4')
      expect(mockedUnlinkSync).toHaveBeenCalledWith('/path/to/recording.mp4')
    })

    it('should not remove non-existent recording', async () => {
      mockedExistsSync.mockReturnValue(false)
      await removeRecording('/path/to/recording.mp4')
      expect(mockedUnlinkSync).not.toHaveBeenCalled()
    })
  })

  describe('Recording status', () => {
    it('should return not recording when no PID files exist', () => {
      mockedExistsSync.mockReturnValue(false)
      const status = getRecordingStatus()
      expect(status).toEqual({ isRecording: false })
    })

    it('should return recording status for no-audio recording', () => {
      mockedExistsSync
        .mockReturnValueOnce(true) // PID file exists
        .mockReturnValueOnce(true) // Path file exists

      mockedReadFileSync
        .mockReturnValueOnce('1234') // PID
        .mockReturnValueOnce('{"path":"/path/to/recording.mp4","withAudio":false}') // Metadata

      mockedExecSync.mockReturnValue('') // Process is running

      const status = getRecordingStatus()
      expect(status).toEqual({
        isRecording: true,
        outputPath: '/path/to/recording.mp4'
      })
    })

    it('should return recording status for audio recording', () => {
      mockedExistsSync
        .mockReturnValueOnce(true) // PID file exists
        .mockReturnValueOnce(true) // Path file exists

      mockedReadFileSync
        .mockReturnValueOnce('5678') // PID
        .mockReturnValueOnce('{"path":"/path/to/audio-recording.mp4","withAudio":true}') // Metadata

      mockedExecSync.mockReturnValue('') // Process is running

      const status = getRecordingStatus()
      expect(status).toEqual({
        isRecording: true,
        outputPath: '/path/to/audio-recording.mp4'
      })
    })

    it('should cleanup stale PID files when process is not running', () => {
      mockedExistsSync.mockImplementation((path) => {
        return path === '/home/test/.cache/vicinae/recording.pid' // Only PID file exists
      })

      mockedReadFileSync.mockReturnValue('9999') // PID

      mockedExecSync.mockImplementation(() => {
        throw new Error('Process not found') // Process is not running
      })

      const status = getRecordingStatus()
      expect(status).toEqual({ isRecording: false })
      // Only PID file should be cleaned up since path file doesn't exist
      expect(mockedUnlinkSync).toHaveBeenCalledTimes(1)
      expect(mockedUnlinkSync).toHaveBeenCalledWith('/home/test/.cache/vicinae/recording.pid')
    })
  })

  describe('Toggle recording', () => {
    it('should throw error when no outputs are found', async () => {
      mockedExistsSync.mockImplementation(() => false)
      mockedExecSync.mockImplementation(() => '') // Empty output list

      await expect(toggleRecording('no-audio', false)).rejects.toThrow('No outputs found')
    })
  })
})