export type PlayerClass = 'warrior' | 'ninja';
export type Specialty = 'body' | 'mental' | 'melee' | 'ranged';
export interface Player { id: number; username: string; lastSeenAt: number; }
export interface LobbyCharacter { id: number; name: string; class: PlayerClass; specialty: Specialty; }
export interface LobbyMember extends Player { online: boolean; unread: number; }
export interface PlayerMessage { id: number; senderId: number; recipientId: number; body: string; createdAt: number; readAt: number | null; }
export const PRESENCE_WINDOW_MS = 75_000;
export const SPECIALTIES = { warrior: ['body', 'mental'], ninja: ['melee', 'ranged'] } as const;
