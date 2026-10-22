import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchTeams,
  predictMap,
  predictMapLive,
  predictSeries,
  fetchModelInfo,
} from './api'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('fetchTeams', () => {
    it('returns teams array on success', async () => {
      const mockTeams = ['Sentinels', 'Cloud9', 'LOUD']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ teams: mockTeams }),
      })

      const result = await fetchTeams()

      expect(result).toEqual(mockTeams)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/advanced/available-teams',
        { cache: 'no-store' }
      )
    })

    it('returns empty array when teams is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      const result = await fetchTeams()

      expect(result).toEqual([])
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(fetchTeams()).rejects.toThrow('Failed to load teams')
    })
  })

  describe('predictMap', () => {
    it('makes correct API call with required params', async () => {
      const mockResponse = {
        prob_teamA: 0.65,
        prob_teamB: 0.35,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await predictMap({
        teamA: 'Sentinels',
        teamB: 'Cloud9',
      })

      expect(result).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/advanced/realistic/map-predict'),
        { cache: 'no-store' }
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('teamA=Sentinels'),
        expect.anything()
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('teamB=Cloud9'),
        expect.anything()
      )
    })

    it('includes map_name when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prob_teamA: 0.5, prob_teamB: 0.5 }),
      })

      await predictMap({
        teamA: 'Team A',
        teamB: 'Team B',
        map_name: 'Ascent',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('map_name=Ascent'),
        expect.anything()
      )
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(
        predictMap({ teamA: 'A', teamB: 'B' })
      ).rejects.toThrow('Prediction failed')
    })
  })

  describe('predictMapLive', () => {
    it('calls live endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prob_teamA: 0.6, prob_teamB: 0.4 }),
      })

      await predictMapLive({
        teamA: 'Sentinels',
        teamB: 'Cloud9',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/advanced/live/map-predict'),
        expect.anything()
      )
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      await expect(
        predictMapLive({ teamA: 'A', teamB: 'B' })
      ).rejects.toThrow('Live prediction failed')
    })
  })

  describe('predictSeries', () => {
    it('makes correct API call', async () => {
      const mockResponse = {
        teamA: 'Sentinels',
        teamB: 'Cloud9',
        format: 'BO3',
        headline: {
          maps: ['Ascent', 'Bind', 'Haven'],
          prob_teamA: 0.6,
          prob_teamB: 0.4,
          per_map: [],
        },
        alternatives: [],
        generated_at: '2026-01-26',
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await predictSeries('Sentinels', 'Cloud9')

      expect(result).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/advanced/series-predict'),
        expect.anything()
      )
    })

    it('includes maps when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await predictSeries('A', 'B', 3, ['Ascent', 'Bind'])

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('maps=Ascent%2CBind'),
        expect.anything()
      )
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      await expect(predictSeries('A', 'B')).rejects.toThrow(
        'Series prediction failed'
      )
    })
  })

  describe('fetchModelInfo', () => {
    it('returns model info on success', async () => {
      const mockInfo = {
        model_name: 'realistic',
        accuracy: 0.64,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockInfo,
      })

      const result = await fetchModelInfo()

      expect(result).toEqual(mockInfo)
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      await expect(fetchModelInfo()).rejects.toThrow('Failed to fetch model info')
    })
  })
})
