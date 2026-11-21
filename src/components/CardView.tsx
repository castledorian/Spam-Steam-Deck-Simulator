"use client";

import { memo } from "react";
import type { RawCard } from "@/sim/compile";
import { img, useSpam } from "./SpamProvider";

const px = (v: number) => `${(v * 100) / 961}cqw`;

/** Rendu fidèle de la carte officielle, composé à partir de layout.json du SpamDex (illustration + cadre + textes). */
function CardViewInner({ card, big = false, eager = false }: { card: RawCard; big?: boolean; eager?: boolean }) {
  const { layout: L } = useSpam();
  if (!L) return <div className="aspect-[961/1375] rounded-2xl bg-white/5" />;
  const art = big ? card.artwork.file : card.artwork.small;
  const rows: { kind: "a" | "s"; name: string; cd?: number }[] = [
    ...card.abilities.map((a) => ({ kind: "a" as const, name: a.name, cd: a.cooldown })),
    ...card.skills.map((s) => ({ kind: "s" as const, name: s.name })),
  ].slice(0, L.rows.max);
  const R = L.rows;
  // Disposition façon Dojo SPAM : grosse icône d'élément en haut à gauche, qui déborde du coin ; coût en Spamtons en haut à droite.
  const ORB = 250;
  const orbX = -85, orbY = -65;
  const spX = L.spamton.x;
  const abs = { position: "absolute" as const };
  return (
    <div
      className="spam-card relative select-none"
      style={{ aspectRatio: `${L.width}/${L.height}`, containerType: "inline-size", fontFamily: "'Lilita One', system-ui, sans-serif" }}
      role="img"
      aria-label={`Carte ${card.name}`}
    >
      <div className="absolute inset-0 overflow-hidden bg-[#0b0618]" style={{ borderRadius: `${(L.cornerRadius / L.width) * 100}% / ${(L.cornerRadius / L.height) * 100}%` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(art)} alt="" loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} style={{ ...abs, inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "center" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(L.body.image.replace("{element}", card.element))} alt="" loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} style={{ ...abs, inset: 0, width: "100%", height: "100%" }} />
      <div style={{ ...abs, left: 0, top: 0, width: "100%", height: px(L.header.height), background: `linear-gradient(${L.header.gradient[0]}, ${L.header.gradient[1]})` }} />
      <div style={{ ...abs, left: px(spX), top: px(L.spamton.y), width: px(L.spamton.width), height: px(L.spamton.height) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img(L.spamton.image)} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%" }} />
        <span style={{ ...abs, left: 0, top: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: px(L.spamton.text.fontSize), color: L.spamton.text.color, transform: `translate(${px(L.spamton.text.centerX - L.spamton.x - L.spamton.width / 2)}, ${px(L.spamton.text.centerY - L.spamton.y - L.spamton.height / 2)})` }}>
          {card.spamton}
        </span>
      </div>
      <div style={{ ...abs, left: px(L.name.x), top: px(L.name.y), width: px(L.name.width), fontSize: px(L.name.fontSize), lineHeight: L.name.lineHeight, color: "#fff", textTransform: "uppercase", textShadow: L.name.shadow.replace(/(\d+)px/g, (_, n) => `${(+n * 100) / 961}cqw`), display: "-webkit-box", WebkitLineClamp: L.name.maxLines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {card.name}
      </div>
      {rows.map((r, i) => {
        const y = R.top + i * R.step;
        return (
          <div key={i} style={{ ...abs, left: px(R.x), top: px(y), width: px(R.width), height: px(R.height) }}>
            {r.kind === "a" ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img(R.ability.bar.image)} alt="" loading="lazy" decoding="async" style={{ ...abs, left: 0, top: 0, width: "100%", height: "100%", filter: "brightness(0)", opacity: R.ability.bar.opacity }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img(R.ability.cooldown.image)} alt="" loading="lazy" decoding="async" style={{ ...abs, left: px(R.ability.cooldown.x), top: px(R.ability.cooldown.y), width: px(R.ability.cooldown.width), height: px(R.ability.cooldown.height), mixBlendMode: "overlay" }} />
                <span style={{ ...abs, left: px(R.ability.cooldownText.centerX - 45), top: px(R.ability.cooldownText.centerY - 30), width: px(90), height: px(60), display: "flex", alignItems: "center", justifyContent: "center", fontSize: px(R.ability.cooldownText.fontSize), color: "#fff" }}>{r.cd}</span>
                <span style={{ ...abs, left: px(R.ability.name.x), width: px(R.ability.name.width), top: px(R.ability.name.centerY - 30), height: px(60), display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: px(R.ability.name.fontSize), color: "#fff", textTransform: "uppercase", lineHeight: 1 }}>{r.name}</span>
              </>
            ) : (
              <>
                {[R.skill.lineLeft, R.skill.lineRight].map((ln, k) => (
                  <div key={k} style={{ ...abs, left: px(ln.x), top: px(ln.y), width: px(ln.width), height: px(ln.height), overflow: "hidden" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img(ln.image.replace("{rarity}", card.skills[i - card.abilities.length]?.rarity ?? "common"))} alt="" loading="lazy" decoding="async" style={{ ...abs, top: 0, left: k === 0 ? 0 : px(-ln.width), width: px(ln.width * 2), height: "100%" }} />
                  </div>
                ))}
                <span style={{ ...abs, left: px(R.skill.name.x), width: px(R.skill.name.width), top: px(R.skill.name.centerY - 30), height: px(60), display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: px(R.skill.name.fontSize), color: "#fff", textTransform: "uppercase", lineHeight: 1 }}>{r.name}</span>
              </>
            )}
          </div>
        );
      })}
      <div style={{ ...abs, left: px(L.hpBar.x), top: px(L.hpBar.y), width: px(L.hpBar.width), height: px(L.hpBar.height), borderRadius: px(L.hpBar.radius), background: L.hpBar.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: px(L.hpBar.text.fontSize), color: L.hpBar.text.color }}>
        {card.hp}/{card.hp}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(L.rarityGem.image.replace("{rarity}", card.rarity))} alt="" loading="lazy" decoding="async" style={{ ...abs, left: px(L.rarityGem.x), top: px(L.rarityGem.y), width: px(L.rarityGem.width), height: px(L.rarityGem.height) }} />
      <div style={{ ...abs, inset: 0, borderRadius: px(L.cornerRadius), boxShadow: `inset 0 0 0 ${px(L.border.width)} #000`, pointerEvents: "none" }} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(L.elementOrb.image.replace("{element}", card.element))} alt={card.element} loading="lazy" decoding="async" style={{ ...abs, left: px(orbX), top: px(orbY), width: px(ORB), height: px(ORB), filter: "drop-shadow(0 4px 6px rgba(0,0,0,.7))" }} />
    </div>
  );
}
export const CardView = memo(CardViewInner);

/** Mini vignette : illustration entière (non rognée), icône d'élément en haut à droite, nom en bas. */
export function CardChip({ card, size = 56, onClick, title }: { card: RawCard; size?: number; onClick?: () => void; title?: string }) {
  const { layout: L } = useSpam();
  const orb = L ? img(L.elementOrb.image.replace("{element}", card.element)) : null;
  return (
    <button type="button" onClick={onClick} title={title ?? card.name} className="group relative shrink-0 overflow-hidden rounded-xl border border-white/15 bg-[#0b0618] transition hover:border-white/50" style={{ width: size, aspectRatio: `${card.artwork.width}/${card.artwork.height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(card.artwork.tiny)} alt={card.name} loading="lazy" decoding="async" className="h-full w-full object-contain" />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1 pb-0.5 pt-3 text-[9px] leading-tight text-white">{card.name}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {orb && <img src={orb} alt={card.element} className="absolute left-0 top-0 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]" style={{ width: Math.max(18, size * 0.46), height: Math.max(18, size * 0.46) }} />}
    </button>
  );
}
