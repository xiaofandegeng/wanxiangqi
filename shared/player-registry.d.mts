export interface CredentialTypeMeta {
  code: string
  label: string
  defaultRegion: string
}

export interface PlayerBadgeCredential {
  credentialType: string
  platform: string
  region: string
  uid: string
}

export interface VerifiedPlayerIdentityGroup {
  canonical: string
  aliases: string[]
  badge: PlayerBadgeCredential | null
  note: string
}

export const CREDENTIAL_TYPES: Readonly<Record<string, CredentialTypeMeta>>
export function derivePersonUid(profileId: string | null | undefined): string | null
export const VERIFIED_PLAYER_IDENTITY_GROUPS: readonly VerifiedPlayerIdentityGroup[]
