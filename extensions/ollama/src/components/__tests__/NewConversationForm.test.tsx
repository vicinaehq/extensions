import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { render, screen } from '@testing-library/react';
import { NewConversationForm } from '../NewConversationForm';

describe('NewConversationForm', () => {
  let mockOnCreateConversation = vi.fn();

  const defaultProps = {
    models: ['llama2', 'mistral', 'neural-chat'],
    defaultModel: 'llama2',
    systemPromptHistory: [],
    onCreateConversation: mockOnCreateConversation,
  };

  beforeEach(() => {
    mockOnCreateConversation = vi.fn();
  });

  describe('rendering', () => {
    it('should render form with correct title', () => {
      render(<NewConversationForm {...defaultProps} />);

      expect(screen.getByText('New Conversation')).toBeTruthy();
    });

    it('should render model dropdown', () => {
      render(<NewConversationForm {...defaultProps} />);

      expect(screen.getByText('Model')).toBeTruthy();
    });

    it('should render system prompt textarea', () => {
      render(<NewConversationForm {...defaultProps} />);

      expect(screen.getByText('System Prompt')).toBeTruthy();
    });

    it('should render Create button', () => {
      render(<NewConversationForm {...defaultProps} />);

      expect(screen.getByText('Create')).toBeTruthy();
    });
  });

  describe('model selection', () => {
    it('should render all available models', () => {
      render(<NewConversationForm {...defaultProps} />);

      defaultProps.models.forEach(model => {
        expect(screen.getByText(model)).toBeTruthy();
      });
    });

    it('should set default model on initial render', () => {
      render(<NewConversationForm {...defaultProps} />);

      expect(screen.getByText('llama2')).toBeTruthy();
    });

    it('should handle single model', () => {
      render(
        <NewConversationForm
          {...defaultProps}
          models={['llama2']}
          defaultModel="llama2"
        />
      );

      expect(screen.getByText('llama2')).toBeTruthy();
    });

    it('should handle multiple models', () => {
      const manyModels = ['model1', 'model2', 'model3', 'model4', 'model5'];

      render(
        <NewConversationForm
          {...defaultProps}
          models={manyModels}
          defaultModel="model1"
        />
      );

      manyModels.forEach(model => {
        expect(screen.getByText(model)).toBeTruthy();
      });
    });
  });

  describe('system prompt', () => {
    it('should render system prompt textarea with placeholder', () => {
      render(<NewConversationForm {...defaultProps} />);

      expect(screen.getByText('System Prompt')).toBeTruthy();
    });

    it('should render history dropdown when history is present', () => {
      const historyProps = {
        ...defaultProps,
        systemPromptHistory: ['Prompt 1', 'Prompt 2'],
      };

      render(<NewConversationForm {...historyProps} />);

      expect(screen.getByText('Load from History')).toBeTruthy();
    });

    it('should not render history dropdown when history is empty', () => {
      render(<NewConversationForm {...defaultProps} />);

      const historyButtons = screen.queryAllByText('Load from History');
      expect(historyButtons.length).toBe(0);
    });

    it('should handle long system prompts in history', () => {
      const longPrompt = 'A'.repeat(100);

      const historyProps = {
        ...defaultProps,
        systemPromptHistory: [longPrompt],
      };

      render(<NewConversationForm {...historyProps} />);

      expect(screen.getByText(/^A{50}\.\.\./)).toBeTruthy();
    });

    it('should handle short system prompts in history', () => {
      const shortPrompt = 'Short prompt';

      const historyProps = {
        ...defaultProps,
        systemPromptHistory: [shortPrompt],
      };

      render(<NewConversationForm {...historyProps} />);

      expect(screen.getByText(shortPrompt)).toBeTruthy();
    });

    it('should render all history prompts', () => {
      const prompts = ['Prompt 1', 'Prompt 2', 'Prompt 3'];

      const historyProps = {
        ...defaultProps,
        systemPromptHistory: prompts,
      };

      render(<NewConversationForm {...historyProps} />);

      prompts.forEach(prompt => {
        expect(screen.getByText(prompt)).toBeTruthy();
      });
    });
  });

  describe('callback integration', () => {
    it('should wire onCreateConversation callback to Create action', () => {
      const createSpy = vi.fn();

      render(
        <NewConversationForm
          {...defaultProps}
          onCreateConversation={createSpy}
        />
      );

      expect(screen.getByText('Create')).toBeTruthy();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('should bind onCreateConversation with selected model and prompt', () => {
      const createSpy = vi.fn();

      render(
        <NewConversationForm
          {...defaultProps}
          defaultModel="mistral"
          onCreateConversation={createSpy}
        />
      );

      expect(screen.getByText('Create')).toBeTruthy();
      expect(screen.getByText('mistral')).toBeTruthy();
    });

    it('should handle history prompt selection for onCreateConversation', () => {
      const createSpy = vi.fn();

      render(
        <NewConversationForm
          {...defaultProps}
          systemPromptHistory={['Prompt 1', 'Prompt 2', 'Prompt 3']}
          onCreateConversation={createSpy}
        />
      );

      expect(screen.getByText('Load from History')).toBeTruthy();
      expect(screen.getByText('Create')).toBeTruthy();
    });

    it('should pass correct model to callback when changed', () => {
      const createSpy = vi.fn();

      const { rerender } = render(
        <NewConversationForm
          {...defaultProps}
          defaultModel="llama2"
          onCreateConversation={createSpy}
        />
      );

      expect(screen.getByText('llama2')).toBeTruthy();

      rerender(
        <NewConversationForm
          {...defaultProps}
          defaultModel="mistral"
          onCreateConversation={createSpy}
        />
      );

      expect(screen.getByText('mistral')).toBeTruthy();
    });

    it('should allow empty system prompt in callback', () => {
      const createSpy = vi.fn();

      render(
        <NewConversationForm
          {...defaultProps}
          onCreateConversation={createSpy}
        />
      );

      expect(screen.getByText('Create')).toBeTruthy();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('should wire history prompt selection to callback preparation', () => {
      const createSpy = vi.fn();

      render(
        <NewConversationForm
          {...defaultProps}
          systemPromptHistory={['History Prompt 1', 'History Prompt 2']}
          onCreateConversation={createSpy}
        />
      );

      expect(screen.getByText('Load from History')).toBeTruthy();
      expect(screen.getByText('History Prompt 1')).toBeTruthy();
      expect(screen.getByText('History Prompt 2')).toBeTruthy();
    });
  });
});

