import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StreamCard } from '@/ui/components/StreamCard';

afterEach(() => cleanup());

const baseStream = {
  id: 'stream-123',
  employeeName: 'Rafi Ananda',
  title: 'Backend Development',
  status: 'active',
  ratePerSecondMinor: '119',
  fundedAmountMinor: '312000000', // 312 USDC
  withdrawnAmountMinor: '0',
  startedAt: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
};

describe('StreamCard', () => {
  it('renders employee name', () => {
    render(<StreamCard stream={baseStream} locale="en" />);
    expect(screen.getByText('Rafi Ananda')).toBeTruthy();
  });

  it('renders work title', () => {
    render(<StreamCard stream={baseStream} locale="en" />);
    expect(screen.getAllByText('Backend Development').length).toBeGreaterThan(0);
  });

  it('renders active status badge', () => {
    render(<StreamCard stream={baseStream} locale="en" />);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('renders cancelled status badge', () => {
    render(<StreamCard stream={{ ...baseStream, status: 'cancelled' }} locale="en" />);
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });

  it('renders completed status badge', () => {
    render(<StreamCard stream={{ ...baseStream, status: 'completed' }} locale="en" />);
    expect(screen.getByText('Completed')).toBeTruthy();
  });

  it('renders view link', () => {
    render(<StreamCard stream={baseStream} locale="en" />);
    const links = screen.getAllByRole('link', { name: /view/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].getAttribute('href')).toContain('/en/streams/stream-123');
  });

  it('shows monthly rate', () => {
    render(<StreamCard stream={baseStream} locale="en" />);
    expect(screen.getAllByText(/Monthly/i).length).toBeGreaterThan(0);
  });

  it('shows funded amount', () => {
    render(<StreamCard stream={baseStream} locale="en" />);
    expect(screen.getAllByText(/Funded/i).length).toBeGreaterThan(0);
  });
});
