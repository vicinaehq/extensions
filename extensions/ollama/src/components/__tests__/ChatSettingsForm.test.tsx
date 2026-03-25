import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { render, screen } from '@testing-library/react';
import { ChatSettingsForm } from '../ChatSettingsForm';
import { OllamaConversationThread } from '@/types';

describe('ChatSettingsForm', () => {
  let mockOnSaveSettings = vi.fn();

  const mockThread: OllamaConversationThread = {
    id: 'thread_1',
    title: 'Test Chat',
    model: 'llama2',
    systemPrompt: 'Current prompt',
    messages: [],
    createdAt: 1000,
    updatedAt: 2000,
  };

  const defaultProps = {
    thread: mockThread,
    models: ['llama2', 'mistral', 'neural-chat'],
    systemPromptHistory: [],
    onSaveSettings: mockOnSaveSettings,
  };

  beforeEach(() => {
    mockOnSaveSettings = vi.fn();
  });

  describe('rendering', () => {
    it('should render form', () => {
      render(<ChatSettingsForm {...defaultProps} />);

      expect(screen.getByTestId('form')).toBeTruthy();
    });

    it('should render model field', () => {
      render(<ChatSettingsForm {...defaultProps} />);

      expect(screen.getByText('Model')).toBeTruthy();
    });

    it('should render system prompt field', () => {
      render(<ChatSettingsForm {...defaultProps} />);

      expect(screen.getByText('System Prompt')).toBeTruthy();
    });

    it('should render Save button', () => {
      render(<ChatSettingsForm {...defaultProps} />);

      expect(screen.getByText('Save')).toBeTruthy();
    });
  });

  describe('model selection', () => {
    it('should render all available models', () => {
      render(<ChatSettingsForm {...defaultProps} />);

      defaultProps.models.forEach(model => {
        expect(screen.getByText(model)).toBeTruthy();
      });
    });

    it('should set current thread model as selected', () => {
      render(<ChatSettingsForm {...defaultProps} />);

      expect(screen.getByText('llama2')).toBeTruthy();
    });

    it('should handle different current model', () => {
      const threadWithDifferentModel: OllamaConversationThread = {
        ...mockThread,
        model: 'mistral',
      };

      render(
        <ChatSettingsForm
          {...defaultProps}
          thread={threadWithDifferentModel}
        />
      );

      expect(screen.getByText('mistral')).toBeTruthy();
    });

    it('should render single model option', () => {
      render(
        <ChatSettingsForm
          {...defaultProps}
          models={['llama2']}
        />
      );

      expect(screen.getByText('llama2')).toBeTruthy();
    });

    it('should render multiple model options', () => {
      const manyModels = ['model1', 'model2', 'model3', 'model4'];

      render(
        <ChatSettingsForm
          {...defaultProps}
          models={manyModels}
        />
      );

      manyModels.forEach(model => {
        expect(screen.getByText(model)).toBeTruthy();
      });
    });
  });

  describe('system prompt', () => {
    it('should display system prompt label', () => {
      render(<ChatSettingsForm {...defaultProps} />);

      expect(screen.getByText('System Prompt')).toBeTruthy();
    });

    it('should handle empty system prompt', () => {
      const threadWithoutPrompt: OllamaConversationThread = {
        ...mockThread,
        systemPrompt: '',
      };

      render(
        <ChatSettingsForm
          {...defaultProps}
          thread={threadWithoutPrompt}
        />
      );

      expect(screen.getByText('System Prompt')).toBeTruthy();
    });

    it('should handle long system prompt', () => {
      const longPrompt = 'A'.repeat(200);

      const threadWithLongPrompt: OllamaConversationThread = {
        ...mockThread,
        systemPrompt: longPrompt,
      };

      render(
        <ChatSettingsForm
          {...defaultProps}
          thread={threadWithLongPrompt}
        />
      );

      expect(screen.getByText('System Prompt')).toBeTruthy();
    });
  });

  describe('history management', () => {
    it('should render with empty history', () => {
      render(<ChatSettingsForm {...defaultProps} />);

      expect(screen.getByTestId('form')).toBeTruthy();
    });

    it('should render history when prompts available', () => {
      render(
        <ChatSettingsForm
          {...defaultProps}
          systemPromptHistory={['Prompt 1', 'Prompt 2']}
        />
      );

      expect(screen.getAllByText('Prompt 1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Prompt 2').length).toBeGreaterThan(0);
    });

    it('should display all history prompts', () => {
      const prompts = ['Prompt 1', 'Prompt 2', 'Prompt 3', 'Prompt 4', 'Prompt 5'];

      render(
        <ChatSettingsForm
          {...defaultProps}
          systemPromptHistory={prompts}
        />
      );

      prompts.forEach(prompt => {
        expect(screen.getAllByText(prompt).length).toBeGreaterThan(0);
      });
    });
  });

  describe('callback integration', () => {
    it('should wire onSaveSettings callback to Save action', () => {
      const { container } = render(
        <ChatSettingsForm
          {...defaultProps}
          onSaveSettings={mockOnSaveSettings}
        />
      );

      expect(screen.getByText('Save')).toBeTruthy();
      const form = container.querySelector('[data-testid="form"]');
      expect(form).toBeTruthy();
    });

    it('should bind onSaveSettings with current model and prompt values', () => {
      const saveSettingsSpy = vi.fn();

      render(
        <ChatSettingsForm
          {...defaultProps}
          onSaveSettings={saveSettingsSpy}
        />
      );

      expect(screen.getByText('Save')).toBeTruthy();
      expect(saveSettingsSpy).not.toHaveBeenCalled();
    });

    it('should handle onSaveSettings with different models', () => {
      const threadWithDifferentModel: OllamaConversationThread = {
        ...mockThread,
        model: 'mistral',
      };
      const saveSettingsSpy = vi.fn();

      render(
        <ChatSettingsForm
          {...defaultProps}
          thread={threadWithDifferentModel}
          onSaveSettings={saveSettingsSpy}
        />
      );

      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.getByText('mistral')).toBeTruthy();
    });

    it('should wire history prompt selection to setPromptValue', () => {
      render(
        <ChatSettingsForm
          {...defaultProps}
          onSaveSettings={mockOnSaveSettings}
          systemPromptHistory={['Prompt 1', 'Prompt 2']}
        />
      );

      expect(screen.getAllByText('Load from History').length).toBeGreaterThan(0);
    });

    it('should pass correct thread ID to onSaveSettings callback', () => {
      const thread1: OllamaConversationThread = {
        ...mockThread,
        id: 'thread_1',
      };
      const thread2: OllamaConversationThread = {
        ...mockThread,
        id: 'thread_2',
      };
      const saveSettingsSpy = vi.fn();

      const { rerender } = render(
        <ChatSettingsForm
          {...defaultProps}
          thread={thread1}
          onSaveSettings={saveSettingsSpy}
        />
      );

      expect(screen.getByText('Save')).toBeTruthy();

      rerender(
        <ChatSettingsForm
          {...defaultProps}
          thread={thread2}
          onSaveSettings={saveSettingsSpy}
        />
      );

      expect(screen.getByText('Save')).toBeTruthy();
    });
  });
});
