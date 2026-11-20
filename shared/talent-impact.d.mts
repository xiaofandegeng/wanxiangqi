export interface TalentStatistic {
  talent: string
  build: string
  wins: number
  appearances: number
  distinctMatches: number
  buildWins: number
  buildAppearances: number
  logWeight: number
}

export interface TalentImpact {
  pairs: TalentStatistic[]
  logWeight: number
}

export const TALENT_RULES: Record<string, string>
export function talentImpact(statistics: TalentStatistic[], build: string, selected: string[]): TalentImpact
export function applyTalentImpact(probabilities: number[], impacts: TalentImpact[]): number[]
