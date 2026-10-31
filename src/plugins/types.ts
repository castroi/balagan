import type { Speaker, VoiceLang } from '../platform/tts';

/** A voice-test item: Hebrew text, or text with the language its voice speaks. */
export type SpeakItem = string | { text: string; lang: VoiceLang };
import type { Sounds } from '../platform/sounds';

export interface ParseResult<D> {
  /** null when there are errors. */
  data: D | null;
  errors: string[];
  warnings: string[];
}

/** What the platform gives a running game. */
export interface GameContext {
  speaker: Speaker;
  sounds: Sounds;
  totalPoints(): number;
  /** How long the popup after a word stays when it shows a right/wrong pair (device setting). */
  pairMs: number;
  loadProgress(): unknown;
  /** Saves progress and adds points in one write, so points are never counted twice. */
  commit(progress: unknown, pointsToAdd?: number): void;
  exit(): void;
}

/**
 * One assignment type. The platform handles saving, clearing, sharing and
 * screens; each type defines its own editor format, data and game.
 */
export interface AssignmentPlugin<D> {
  /** Stable id — used in storage and in share links. Never change it. */
  id: string;
  /** Version of the data shape; bump it and handle old versions in `deserialize`. */
  dataVersion: number;
  title: string;
  /** Up to three letters shown as decoration on the home card ("/" draws a separator). */
  cardTiles: string[];
  editor: { label: string; hint: string; placeholder: string };

  parse(text: string): ParseResult<D>;
  toText(data: D): string;
  /** Validates data from storage or a share link; null if unusable. */
  deserialize(raw: unknown, version: number): D | null;
  /** Items the parent can listen to in the editor (voice test): Hebrew text, or text in another language. One per item. */
  speakItems(data: D): SpeakItem[];
  summary(data: D, progress: unknown): { line: string; fraction: number };
  /** Optional "what the kid will see" preview, shown under valid editor content. */
  preview?(data: D): HTMLElement;

  /** Mounts the game; returns a cleanup function. */
  mount(container: HTMLElement, data: D, ctx: GameContext): () => void;
}

export type AnyPlugin = AssignmentPlugin<any>;
