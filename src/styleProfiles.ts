import type { HouseStyleProfile } from './types'

export const HOUSE_STYLE_PROFILES: HouseStyleProfile[] = [
  {
    id: 'addleshaw-goddard',
    name: 'AG Corporate',
    description: 'Conservative legal production baseline with Arial-heavy body copy and standard footer hygiene.',
    preferredFonts: ['Arial', 'Arial MT', 'Calibri'],
    preferredSizes: ['20', '22', '24'],
    footerWatchTerms: ['draft', 'confidential', 'client matter', 'reference number'],
    source: 'local',
  },
  {
    id: 'neutral-legal',
    name: 'Neutral Legal',
    description: 'General firm-safe profile for contracts, letters, and markups when the client style is unknown.',
    preferredFonts: ['Arial', 'Calibri', 'Times New Roman'],
    preferredSizes: ['20', '22', '24'],
    footerWatchTerms: ['draft', 'without prejudice', 'old client', 'matter number'],
    source: 'local',
  },
  {
    id: 'litigation-bundle',
    name: 'Litigation Bundle',
    description: 'Stricter serif-friendly profile for court-facing packs and evidence bundles.',
    preferredFonts: ['Times New Roman', 'Arial'],
    preferredSizes: ['20', '22', '24', '26'],
    footerWatchTerms: ['privileged', 'bundle reference', 'hearing date', 'client matter'],
    source: 'local',
  },
]

export const DEFAULT_STYLE_PROFILE = HOUSE_STYLE_PROFILES[0]
