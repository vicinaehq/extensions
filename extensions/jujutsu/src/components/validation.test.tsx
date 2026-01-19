import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepoPathValidationError, RepoPathValidationErrorDetail } from './validation';
import '@testing-library/jest-dom';

describe('RepoPathValidationError', () => {
  it('renders List with validation error item', () => {
    render(<RepoPathValidationError />);

    expect(screen.getByText('Repository path required')).toBeInTheDocument();
    expect(screen.getByText('Provide a repository path as argument')).toBeInTheDocument();
  });

  it('renders warning icon', () => {
    render(<RepoPathValidationError />);
    expect(screen.getByTestId('item-title')).toHaveTextContent('Repository path required');
  });
});

describe('RepoPathValidationErrorDetail', () => {
  it('renders Detail with error markdown', () => {
    render(<RepoPathValidationErrorDetail />);

    expect(screen.getByText(/Error/)).toBeInTheDocument();
    expect(screen.getByText(/Repository path required/)).toBeInTheDocument();
  });
});
