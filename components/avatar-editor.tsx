'use client';
import { useState } from 'react';
import { Shuffle, Check } from 'lucide-react';
import { AvatarFigure } from './avatar';
import {
  defaultAvatar,
  decodeAvatar,
  encodeAvatar,
  skinColors,
  hairColors,
  shirtColors,
  backColors,
  type AvatarConfig,
} from '@/lib/avatar';

const choices = {
  face: [
    ['round', 'Tondo'],
    ['oval', 'Ovale'],
    ['square', 'Squadrato'],
  ],
  hair: [
    ['short', 'Corto'],
    ['side', 'Ciuffo'],
    ['curly', 'Ricci'],
    ['bob', 'Caschetto'],
    ['long', 'Lunghi'],
    ['bun', 'Chignon'],
    ['spiky', 'A punta'],
    ['none', 'Rasato'],
  ],
  eyes: [
    ['oval', 'Classici'],
    ['round', 'Grandi'],
    ['smile', 'Sorridenti'],
    ['calm', 'Rilassati'],
    ['wink', 'Occhiolino'],
  ],
  brows: [
    ['soft', 'Morbide'],
    ['straight', 'Dritte'],
    ['bold', 'Folte'],
    ['raised', 'Alzate'],
  ],
  nose: [
    ['small', 'Piccolo'],
    ['round', 'Tondo'],
    ['long', 'Allungato'],
  ],
  mouth: [
    ['smile', 'Sorriso'],
    ['grin', 'Sorriso aperto'],
    ['small', 'Accennato'],
    ['open', 'Sorpresa'],
    ['calm', 'Seria'],
  ],
  glasses: [
    ['none', 'Nessuno'],
    ['round', 'Tondi'],
    ['square', 'Rettangolari'],
  ],
  beard: [
    ['none', 'Nessuna'],
    ['moustache', 'Baffi'],
    ['beard', 'Barba'],
  ],
} as const;
const tabs = ['Volto', 'Capelli', 'Occhi', 'Bocca', 'Accessori', 'Colori'] as const;

export default function AvatarEditor({
  value,
  name,
  busy,
  onSave,
  onCancel,
}: {
  value: string;
  name: string;
  busy: boolean;
  onSave: (value: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [avatar, setAvatar] = useState<AvatarConfig>(
    () => decodeAvatar(value) || { ...defaultAvatar },
  );
  const [tab, setTab] = useState<(typeof tabs)[number]>('Volto');
  const [error, setError] = useState('');
  function update<K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) {
    setAvatar((a) => ({ ...a, [key]: value }));
  }
  function options(key: keyof typeof choices, title: string) {
    return (
      <fieldset className="avatar-options">
        <legend>{title}</legend>
        <div className="avatar-option-grid">
          {choices[key].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={avatar[key] === value}
              aria-label={title + ': ' + label}
              onClick={() => update(key, value as AvatarConfig[typeof key])}
            >
              <AvatarFigure config={{ ...avatar, [key]: value }} label={label} />
              <span>{label}</span>
              {avatar[key] === value && <Check size={13} className="avatar-option-check" />}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  function colors(
    key: 'skin' | 'hairColor' | 'shirt' | 'background',
    title: string,
    palette: readonly string[],
  ) {
    return (
      <fieldset className="avatar-colors">
        <legend>{title}</legend>
        <div>
          {palette.map((color, i) => (
            <button
              key={color}
              type="button"
              title={title + ' ' + (i + 1)}
              aria-label={title + ' ' + (i + 1)}
              aria-pressed={avatar[key] === color}
              style={{ backgroundColor: color }}
              onClick={() => update(key, color as AvatarConfig[typeof key])}
            >
              {avatar[key] === color && <Check size={16} />}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  function shuffle() {
    const pick = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)];
    setAvatar({
      ...avatar,
      face: pick(choices.face)[0],
      hair: pick(choices.hair)[0],
      skin: pick(skinColors),
      hairColor: pick(hairColors),
      eyes: pick(choices.eyes)[0],
      mouth: pick(choices.mouth)[0],
      shirt: pick(shirtColors),
      background: pick(backColors),
    });
  }
  return (
    <div className="avatar-studio">
      <div className="eyebrow">IL TUO PERSONAGGIO</div>
      <h2>Un piccolo te, nel team.</h2>
      <p>Scegli i dettagli che ti somigliano. Puoi cambiarli quando vuoi.</p>
      <div className="avatar-studio-layout">
        <div className="avatar-preview" style={{ backgroundColor: avatar.background }}>
          <div className="avatar-preview-tag">CIAO, SONO</div>
          <strong>{name}</strong>
          <AvatarFigure config={avatar} label={'Anteprima avatar di ' + name} />
          <button type="button" className="avatar-shuffle" onClick={shuffle}>
            <Shuffle size={15} /> Sorprendimi
          </button>
        </div>
        <div className="avatar-customize">
          <nav className="avatar-tabs" aria-label="Parti dell’avatar">
            {tabs.map((t) => (
              <button type="button" key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <div className="avatar-controls">
            {tab === 'Volto' && (
              <>
                {options('face', 'Forma del viso')}
                {colors('skin', 'Carnagione', skinColors)}
                {options('nose', 'Naso')}
              </>
            )}
            {tab === 'Capelli' && (
              <>
                {options('hair', 'Taglio')}
                {colors('hairColor', 'Colore capelli', hairColors)}
              </>
            )}
            {tab === 'Occhi' && (
              <>
                {options('eyes', 'Occhi')}
                {options('brows', 'Sopracciglia')}
                <label className="avatar-slider">
                  Distanza occhi
                  <input
                    aria-label="Distanza occhi"
                    type="range"
                    min="12"
                    max="23"
                    value={avatar.eyeGap}
                    onChange={(e) => update('eyeGap', Number(e.target.value))}
                  />
                </label>
              </>
            )}
            {tab === 'Bocca' && options('mouth', 'Espressione')}
            {tab === 'Accessori' && (
              <>
                {options('glasses', 'Occhiali')}
                {options('beard', 'Barba e baffi')}
              </>
            )}
            {tab === 'Colori' && (
              <>
                {colors('shirt', 'Maglia', shirtColors)}
                {colors('background', 'Sfondo', backColors)}
                {colors('skin', 'Carnagione', skinColors)}
                {colors('hairColor', 'Colore capelli', hairColors)}
              </>
            )}
          </div>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="avatar-studio-footer">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={async () => {
            setError('');
            if (!(await onSave(encodeAvatar(avatar)))) setError('Avatar non salvato. Riprova.');
          }}
        >
          {busy ? 'Salvataggio…' : 'Salva il mio avatar'}
        </button>
      </div>
    </div>
  );
}
