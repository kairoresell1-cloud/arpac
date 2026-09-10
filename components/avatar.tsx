import { decodeAvatar, type AvatarConfig } from '@/lib/avatar';

export function AvatarFigure({
  config: a,
  label = 'Avatar personalizzato',
}: {
  config: AvatarConfig;
  label?: string;
}) {
  const hair = a.hairColor;
  return (
    <svg viewBox="0 0 160 180" role="img" aria-label={label} xmlns="http://www.w3.org/2000/svg">
      <rect width="160" height="180" rx="26" fill={a.background} />
      <circle cx="80" cy="77" r="58" fill="#fff" opacity=".3" />
      <ellipse cx="80" cy="168" rx="47" ry="7" fill="#292238" opacity=".1" />
      {a.hair === 'long' && (
        <path d="M36 57Q34 12 80 14Q130 13 127 64L137 139Q81 157 24 139Z" fill={hair} />
      )}
      {a.hair === 'bun' && <circle cx="84" cy="22" r="19" fill={hair} />}
      {a.hair === 'bob' && (
        <path d="M33 65Q32 17 80 19Q127 17 128 64L130 113Q111 123 101 115H49L29 111Z" fill={hair} />
      )}
      <path
        d="M39 166L43 146Q48 127 70 126H90Q113 127 118 146L123 166Q80 177 39 166Z"
        fill={a.shirt}
      />
      <path d="M68 119V134Q80 145 92 134V119" fill={a.skin} />
      <path d="M68 129Q80 136 92 129V133Q80 142 68 133" fill="#543122" opacity=".12" />
      <ellipse cx="37" cy="85" rx="9" ry="13" fill={a.skin} />
      <ellipse cx="123" cy="85" rx="9" ry="13" fill={a.skin} />
      {a.face === 'round' ? (
        <ellipse cx="80" cy="82" rx="44" ry="49" fill={a.skin} />
      ) : a.face === 'oval' ? (
        <ellipse cx="80" cy="82" rx="38" ry="53" fill={a.skin} />
      ) : (
        <rect x="39" y="32" width="82" height="99" rx="29" fill={a.skin} />
      )}
      <ellipse cx="51" cy="99" rx="10" ry="5" fill="#dd797a" opacity=".22" />
      <ellipse cx="109" cy="99" rx="10" ry="5" fill="#dd797a" opacity=".22" />
      {a.hair === 'short' && (
        <path d="M37 74Q23 22 74 22Q129 15 125 73L113 51Q77 66 48 51Z" fill={hair} />
      )}
      {a.hair === 'side' && (
        <path
          d="M35 78Q22 24 72 20Q112 11 126 42L123 77L110 49Q80 66 55 47L45 80L44 55Z"
          fill={hair}
        />
      )}
      {a.hair === 'curly' && (
        <g fill={hair}>
          {[
            [36, 55],
            [38, 37],
            [56, 27],
            [77, 23],
            [98, 26],
            [117, 36],
            [124, 55],
          ].map(([x, y]) => (
            <circle key={x + '-' + y} cx={x} cy={y} r="16" />
          ))}
        </g>
      )}
      {(a.hair === 'bob' || a.hair === 'long') && (
        <path d="M35 72Q32 22 80 24Q127 22 125 73L113 54L84 42L67 58L45 56Z" fill={hair} />
      )}
      {a.hair === 'bun' && (
        <path d="M38 73Q25 24 80 25Q133 24 122 72L111 50Q74 63 48 51Z" fill={hair} />
      )}
      {a.hair === 'spiky' && (
        <path
          d="M36 78L28 41L45 43L45 20L64 31L82 9L89 29L112 16L112 36L133 34L124 76L112 52L97 60L75 50L57 60L45 53Z"
          fill={hair}
        />
      )}
      {[-1, 1].map((side) => {
        const x = 80 + a.eyeGap * side;
        const brow = a.brows === 'raised' ? 65 : 69;
        return (
          <g key={side}>
            <path
              d={
                a.brows === 'straight'
                  ? `M${x - 7} ${brow}h14`
                  : `M${x - 7} ${brow + 1}Q${x} ${brow - 5} ${x + 7} ${brow + 1}`
              }
              fill="none"
              stroke={hair}
              strokeWidth={a.brows === 'bold' ? 5 : 3}
              strokeLinecap="round"
            />
            {a.eyes === 'smile' || (a.eyes === 'wink' && side === 1) ? (
              <path
                d={`M${x - 6} 85Q${x} 76 ${x + 6} 85`}
                fill="none"
                stroke="#302831"
                strokeWidth="3"
                strokeLinecap="round"
              />
            ) : a.eyes === 'calm' ? (
              <path d={`M${x - 6} 82h12`} stroke="#302831" strokeWidth="3" strokeLinecap="round" />
            ) : (
              <g>
                <ellipse
                  cx={x}
                  cy="83"
                  rx={a.eyes === 'round' ? 6 : 4}
                  ry={a.eyes === 'round' ? 7 : 6}
                  fill="#302831"
                />
                <circle cx={x + 1.5} cy="81" r="1.6" fill="white" />
              </g>
            )}
          </g>
        );
      })}
      {a.nose === 'round' ? (
        <ellipse cx="80" cy="97" rx="6" ry="4" fill="#b86c48" opacity=".45" />
      ) : (
        <path
          d={a.nose === 'long' ? 'M80 84L75 99Q80 103 85 98' : 'M79 92L77 99H83'}
          fill="none"
          stroke="#8d4d35"
          opacity=".5"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {a.beard === 'beard' && (
        <path
          d="M48 102Q51 130 80 134Q111 130 113 102L101 112Q80 122 60 112Z"
          fill={hair}
          opacity=".9"
        />
      )}
      {a.mouth === 'smile' && (
        <path
          d="M68 110Q80 123 92 110"
          fill="none"
          stroke="#81403e"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {a.mouth === 'grin' && (
        <path
          d="M67 109Q80 114 93 109Q90 123 80 122Q70 122 67 109Z"
          fill="white"
          stroke="#81403e"
          strokeWidth="2"
        />
      )}
      {a.mouth === 'small' && (
        <path
          d="M75 113Q80 116 85 113"
          fill="none"
          stroke="#81403e"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {a.mouth === 'calm' && (
        <path d="M73 114H87" stroke="#81403e" strokeWidth="3" strokeLinecap="round" />
      )}
      {a.mouth === 'open' && <ellipse cx="80" cy="114" rx="6" ry="7" fill="#81403e" />}
      {a.beard === 'moustache' && (
        <path d="M80 103Q69 99 64 111Q73 116 80 109Q89 116 97 111Q91 99 80 103Z" fill={hair} />
      )}
      {a.glasses !== 'none' && (
        <g fill="none" stroke="#3d3945" strokeWidth="3">
          <rect
            x={80 - a.eyeGap - 12}
            y="73"
            width="24"
            height="21"
            rx={a.glasses === 'round' ? 11 : 5}
          />
          <rect
            x={80 + a.eyeGap - 12}
            y="73"
            width="24"
            height="21"
            rx={a.glasses === 'round' ? 11 : 5}
          />
          <path
            d={`M${92 - a.eyeGap} 80Q80 77 ${68 + a.eyeGap} 80M${68 - a.eyeGap} 79L39 76M${92 + a.eyeGap} 79L121 76`}
          />
        </g>
      )}
      <path
        d="M48 161L51 146M112 161L109 146"
        stroke="#000"
        opacity=".1"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Avatar({
  value,
  name = '',
  className = '',
}: {
  value?: string;
  name?: string;
  className?: string;
}) {
  const config = decodeAvatar(value);
  return (
    <span className={'avatar ' + (config ? 'character-avatar ' : '') + className}>
      {config ? (
        <AvatarFigure config={config} label={'Avatar di ' + (name || 'un membro')} />
      ) : (
        <span>{(value && value.length <= 4 ? value : name.slice(0, 2)).toUpperCase() || '?'}</span>
      )}
    </span>
  );
}
