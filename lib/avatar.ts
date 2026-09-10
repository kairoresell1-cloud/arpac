import { z } from 'zod';

export const skinColors = [
  '#f8d8ba',
  '#edbb91',
  '#d99765',
  '#b97548',
  '#91542f',
  '#603b29',
] as const;
export const hairColors = [
  '#292327',
  '#584032',
  '#985a36',
  '#d4a556',
  '#f0d6a0',
  '#c0bcc6',
  '#c56aa7',
  '#728bd4',
] as const;
export const shirtColors = [
  '#8b7cf8',
  '#5b9ddd',
  '#50b59a',
  '#e88d78',
  '#e8b956',
  '#d777ab',
  '#596175',
  '#e4e7ef',
] as const;
export const backColors = [
  '#e4ddff',
  '#d7ebfc',
  '#d9eee3',
  '#fae3d5',
  '#f8edc9',
  '#f7ddee',
] as const;
export const avatarSchema = z
  .object({
    face: z.enum(['oval', 'round', 'square']),
    skin: z.enum(skinColors),
    hair: z.enum(['short', 'side', 'curly', 'bob', 'long', 'bun', 'spiky', 'none']),
    hairColor: z.enum(hairColors),
    eyes: z.enum(['oval', 'round', 'smile', 'calm', 'wink']),
    brows: z.enum(['soft', 'straight', 'bold', 'raised']),
    nose: z.enum(['small', 'round', 'long']),
    mouth: z.enum(['smile', 'grin', 'small', 'open', 'calm']),
    glasses: z.enum(['none', 'round', 'square']),
    beard: z.enum(['none', 'moustache', 'beard']),
    shirt: z.enum(shirtColors),
    background: z.enum(backColors),
    eyeGap: z.number().int().min(12).max(23),
  })
  .strict();
export type AvatarConfig = z.infer<typeof avatarSchema>;
export const defaultAvatar: AvatarConfig = {
  face: 'round',
  skin: skinColors[1],
  hair: 'side',
  hairColor: hairColors[1],
  eyes: 'oval',
  brows: 'soft',
  nose: 'small',
  mouth: 'smile',
  glasses: 'none',
  beard: 'none',
  shirt: shirtColors[0],
  background: backColors[0],
  eyeGap: 18,
};
export function decodeAvatar(value: string | undefined): AvatarConfig | null {
  if (!value?.startsWith('arpac-avatar:') || value.length > 600) return null;
  try {
    return avatarSchema.parse(JSON.parse(value.slice(13)));
  } catch {
    return null;
  }
}
export const encodeAvatar = (value: AvatarConfig) =>
  'arpac-avatar:' + JSON.stringify(avatarSchema.parse(value));
export const avatarValueSchema = z
  .string()
  .max(600)
  .refine((value) => value.length <= 4 || !!decodeAvatar(value), 'Avatar non valido.');
export function avatarForName(name: string) {
  const n = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return encodeAvatar({
    ...defaultAvatar,
    shirt: shirtColors[n % shirtColors.length],
    background: backColors[n % backColors.length],
  });
}
