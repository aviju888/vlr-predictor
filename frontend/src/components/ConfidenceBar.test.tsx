import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConfidenceBar, { ConfidenceBarCompact } from './ConfidenceBar'

describe('ConfidenceBar', () => {
  it('renders team names correctly', () => {
    render(<ConfidenceBar teamA="Sentinels" teamB="Cloud9" probA={0.65} />)

    // Team names appear multiple times (in header and predicted section)
    expect(screen.getAllByText('Sentinels').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cloud9').length).toBeGreaterThan(0)
  })

  it('displays correct percentages', () => {
    render(<ConfidenceBar teamA="Team A" teamB="Team B" probA={0.7} />)

    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
  })

  it('shows high confidence for probabilities >= 0.7', () => {
    render(<ConfidenceBar teamA="Team A" teamB="Team B" probA={0.75} />)

    expect(screen.getByText('(High confidence)')).toBeInTheDocument()
    expect(screen.getAllByText('Team A').length).toBeGreaterThan(0)
  })

  it('shows medium confidence for probabilities >= 0.6', () => {
    render(<ConfidenceBar teamA="Team A" teamB="Team B" probA={0.65} />)

    expect(screen.getByText('(Medium confidence)')).toBeInTheDocument()
  })

  it('shows low confidence for probabilities < 0.6', () => {
    render(<ConfidenceBar teamA="Team A" teamB="Team B" probA={0.55} />)

    expect(screen.getByText('(Low confidence)')).toBeInTheDocument()
  })

  it('correctly identifies the predicted winner when teamA wins', () => {
    render(<ConfidenceBar teamA="Winner Team" teamB="Loser Team" probA={0.8} />)

    const predictedSection = screen.getByText('Predicted:').parentElement
    expect(predictedSection).toHaveTextContent('Winner Team')
  })

  it('correctly identifies the predicted winner when teamB wins', () => {
    render(<ConfidenceBar teamA="Loser Team" teamB="Winner Team" probA={0.3} />)

    const predictedSection = screen.getByText('Predicted:').parentElement
    expect(predictedSection).toHaveTextContent('Winner Team')
  })

  it('handles 50/50 probability', () => {
    render(<ConfidenceBar teamA="Team A" teamB="Team B" probA={0.5} />)

    // Both teams show 50%
    expect(screen.getAllByText('50%').length).toBe(2)
    expect(screen.getByText('(Low confidence)')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <ConfidenceBar teamA="A" teamB="B" probA={0.6} className="custom-class" />
    )

    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('ConfidenceBarCompact', () => {
  it('renders percentages correctly', () => {
    render(<ConfidenceBarCompact teamA="A" teamB="B" probA={0.65} />)

    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.getByText('35%')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <ConfidenceBarCompact teamA="A" teamB="B" probA={0.6} className="compact-class" />
    )

    expect(container.firstChild).toHaveClass('compact-class')
  })
})
