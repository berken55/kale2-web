import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MatchDetail, MatchEvent, MatchPlayer } from '@shared/types';
import { api } from '../api';
import { Spinner, useToast } from '../components/ui';
import { formatDate, formatDuration, SPEC_LABELS } from './Matches';

function formatEventTime(seconds: number): string {
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const toast = useToast();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<MatchDetail>(`/api/matches/${id}`)
      .then(setMatch)
      .catch((err) => toast('error', err.message || 'Maç detayı yüklenemedi.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-400" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="card p-12 text-center text-slate-400">
        <p className="text-lg">Maç bulunamadı.</p>
        <Link to="/admin/matches" className="btn-primary mt-4 inline-block">
          ← Maç Listesine Dön
        </Link>
      </div>
    );
  }

  const lightPlayers = match.players.filter((p) => p.team === 'light');
  const darkPlayers = match.players.filter((p) => p.team === 'dark');

  // Filter events
  const filteredEvents = match.events.filter((e) => {
    if (eventFilter === 'all') return true;
    if (eventFilter === 'kills') return e.ev === 'kill';
    if (eventFilter === 'structures') return e.ev === 'structure_down';
    if (eventFilter === 'levels') return e.ev === 'level';
    if (eventFilter === 'sessions') return e.ev === 'join' || e.ev === 'leave';
    return true;
  });

  const isLightWinner = match.winner === 'light';
  const isDarkWinner = match.winner === 'dark';

  return (
    <div className="space-y-6">
      {/* Üst Navigasyon & Geri Linki */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/matches"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            title="Geri"
          >
            ←
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-white">
                Maç #{match.id}
              </h1>
              <span className="font-mono text-xs text-slate-400">
                ({match.matchKey})
              </span>
            </div>
            <div className="text-xs text-slate-400">
              Başlama: {formatDate(match.startedAt)} · Bitiş: {formatDate(match.endedAt)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Sürüm: <span className="text-slate-200">{match.gameVersion || '0.9.0'}</span>
          </span>
          <span className="text-xs text-slate-500">|</span>
          <span className="text-xs text-slate-400">
            Protokol: <span className="text-slate-200">{match.protocol ?? '—'}</span>
          </span>
        </div>
      </div>

      {/* Maç Sonuç Kartı / Banner */}
      <div
        className={`relative overflow-hidden rounded-xl border p-6 backdrop-blur ${
          isLightWinner
            ? 'border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-ink-900 to-ink-900'
            : isDarkWinner
            ? 'border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-ink-900 to-ink-900'
            : match.status === 'aborted'
            ? 'border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-ink-900 to-ink-900'
            : 'border-white/10 bg-ink-900/70'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          {/* Sol: Kazanan / Durum */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>Durum:</span>
              <span
                className={`rounded px-2 py-0.5 ${
                  match.status === 'finished'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : match.status === 'aborted'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-red-500/20 text-red-300'
                }`}
              >
                {match.status === 'finished'
                  ? 'Tamamlandı'
                  : match.status === 'aborted'
                  ? 'Yarıda Kaldı (Oyuncular Ayrıldı)'
                  : 'Çöktü'}
              </span>
            </div>

            <div className="mt-2 font-display text-3xl font-extrabold tracking-wide">
              {isLightWinner ? (
                <span className="text-sky-400">IŞIK TAKIMI ZAFERİ 🏆</span>
              ) : isDarkWinner ? (
                <span className="text-rose-400">KARANLIK TAKIMI ZAFERİ 🏆</span>
              ) : (
                <span className="text-slate-300">KAZANANI OLMAYAN MAÇ</span>
              )}
            </div>

            {match.titles && Object.keys(match.titles).length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {Object.entries(match.titles).map(([titleKey, playerName]) => (
                  <span
                    key={titleKey}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-amber-300"
                  >
                    👑 <strong className="uppercase">{titleKey}:</strong> {String(playerName)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Orta: Skor Göstergesi */}
          <div className="flex items-center gap-6 rounded-xl border border-white/10 bg-black/40 px-6 py-4">
            <div className="text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-400">
                Işık Takımı
              </div>
              <div className="font-display text-4xl font-extrabold text-sky-400 tabular-nums">
                {match.lightKills}
              </div>
            </div>

            <div className="text-center font-display text-2xl text-slate-600">:</div>

            <div className="text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-rose-400">
                Karanlık
              </div>
              <div className="font-display text-4xl font-extrabold text-rose-400 tabular-nums">
                {match.darkKills}
              </div>
            </div>
          </div>

          {/* Sağ: Süre ve Katılım */}
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Maç Süresi
            </div>
            <div className="font-display text-2xl font-bold text-white tabular-nums">
              {formatDuration(match.durationSeconds)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {match.playerCount} Oyuncu Katıldı
            </div>
          </div>
        </div>
      </div>

      {/* SKOR TAHTALARI (TEAMS SCOREBOARD) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* IŞIK TAKIMI (LIGHT) */}
        <div className="card overflow-hidden border-sky-500/20">
          <div className="flex items-center justify-between border-b border-sky-500/20 bg-sky-950/30 px-5 py-3">
            <div className="flex items-center gap-2 font-display text-base font-bold text-sky-300">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              IŞIK TAKIMI (MAVİ)
            </div>
            <span className="text-xs text-sky-400/80">
              {lightPlayers.length} Oyuncu · {match.lightKills} Leş
            </span>
          </div>

          {lightPlayers.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Bu takımda oyuncu yok.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/5 bg-ink-900/60 font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Oyuncu</th>
                    <th className="px-3 py-2.5">Seviye</th>
                    <th className="px-3 py-2.5">K / D / A</th>
                    <th className="px-3 py-2.5 text-right">Hasar</th>
                    <th className="px-3 py-2.5 text-right">Yang / XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {lightPlayers.map((p) => (
                    <PlayerRow key={p.playerName} player={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* KARANLIK TAKIMI (DARK) */}
        <div className="card overflow-hidden border-rose-500/20">
          <div className="flex items-center justify-between border-b border-rose-500/20 bg-rose-950/30 px-5 py-3">
            <div className="flex items-center gap-2 font-display text-base font-bold text-rose-300">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              KARANLIK TAKIMI (KIRMIZI)
            </div>
            <span className="text-xs text-rose-400/80">
              {darkPlayers.length} Oyuncu · {match.darkKills} Leş
            </span>
          </div>

          {darkPlayers.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Bu takımda oyuncu yok.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/5 bg-ink-900/60 font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Oyuncu</th>
                    <th className="px-3 py-2.5">Seviye</th>
                    <th className="px-3 py-2.5">K / D / A</th>
                    <th className="px-3 py-2.5 text-right">Hasar</th>
                    <th className="px-3 py-2.5 text-right">Yang / XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {darkPlayers.map((p) => (
                    <PlayerRow key={p.playerName} player={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MAÇTA NE OLDU NE BİTTİ? (KRONOLOJİK OLAY ZAMAN ÇİZELGESİ) */}
      <section className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <span>📜</span> Maçta Ne Oldu Ne Bitti? (Olay Akışı)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Maç boyunca gerçekleşen tüm öldürmeler, kule yıkımları, seviye atlamaları ve giriş/çıkışlar
            </p>
          </div>

          {/* Filtre Butonları */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'kills', label: '⚔️ Öldürmeler' },
              { id: 'structures', label: '🏰 Kule / Yapı' },
              { id: 'levels', label: '⬆️ Seviye' },
              { id: 'sessions', label: '🚪 Giriş / Çıkış' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setEventFilter(f.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  eventFilter === f.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Seçilen kategoride kayıtlı bir olay bulunamadı.
          </div>
        ) : (
          <div className="relative space-y-3 pl-4 before:absolute before:bottom-2 before:left-[19px] before:top-2 before:w-[2px] before:bg-white/10">
            {filteredEvents.map((e) => (
              <TimelineEventItem key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PlayerRow({ player: p }: { player: MatchPlayer }) {
  const specTitle = SPEC_LABELS[p.spec] || SPEC_LABELS[p.class] || p.class || '—';
  return (
    <tr className="hover:bg-white/[0.03]">
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-200 flex items-center gap-1.5">
          <span>{p.playerName}</span>
          {p.won && <span title="Kazanan Takım">👑</span>}
        </div>
        <div className="text-[10px] text-slate-500">{specTitle}</div>
      </td>

      <td className="px-3 py-3 font-mono text-slate-300">
        Lv {p.levelStart}
        {p.levelEnd !== p.levelStart ? (
          <span className="text-emerald-400"> ➔ {p.levelEnd}</span>
        ) : null}
      </td>

      <td className="px-3 py-3 font-mono font-medium">
        <span className="text-emerald-400">{p.kills}</span>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-rose-400">{p.deaths}</span>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-amber-400">{p.assists}</span>
      </td>

      <td className="px-3 py-3 text-right font-mono text-slate-300">
        <div title="Kahramana Verilen Hasar">
          ⚔️ {Math.round(p.dmgHero).toLocaleString('tr-TR')}
        </div>
        <div className="text-[10px] text-slate-500" title="Yaratık / Kule Hasarı">
          👾 {Math.round(p.dmgMob).toLocaleString('tr-TR')} · 🏰{' '}
          {Math.round(p.dmgStructure).toLocaleString('tr-TR')}
        </div>
      </td>

      <td className="px-3 py-3 text-right font-mono text-slate-300">
        <div className="text-amber-400">
          💰 {p.yang.toLocaleString('tr-TR')}
        </div>
        <div className="text-[10px] text-slate-500">
          ✨ {p.xp.toLocaleString('tr-TR')} XP
        </div>
      </td>
    </tr>
  );
}

function TimelineEventItem({ event: e }: { event: MatchEvent }) {
  const timeStr = formatEventTime(e.t);
  const data = e.data || {};

  if (e.ev === 'kill') {
    const killer = data.killer || 'Bilinmeyen';
    const victim = data.victim || 'Bilinmeyen';
    const killerLv = data.killer_level ? `(Lv ${data.killer_level})` : '';
    const victimLv = data.victim_level ? `(Lv ${data.victim_level})` : '';
    const assists = Array.isArray(data.assists) && data.assists.length ? data.assists.join(', ') : null;
    const gains = data.gains && typeof data.gains === 'object' ? data.gains[killer] : null;

    return (
      <div className="relative flex items-start gap-4">
        {/* Timeline nokta */}
        <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-xs shadow-lg">
          ⚔️
        </div>

        <div className="flex-1 rounded-lg border border-white/5 bg-ink-900/50 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-slate-400">{timeStr}</span>
            <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-400 border border-rose-500/20">
              Öldürme
            </span>
          </div>

          <div className="mt-1 text-slate-200 text-sm">
            <strong className="text-sky-300">{killer}</strong> {killerLv}{' '}
            <span className="text-rose-400 font-semibold">kesti ➔</span>{' '}
            <strong className="text-rose-300">{victim}</strong> {victimLv}
          </div>

          {(assists || gains) && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-slate-400 text-[11px] border-t border-white/5 pt-1.5">
              {assists && (
                <span>
                  Asist: <strong className="text-slate-300">{assists}</strong>
                </span>
              )}
              {Array.isArray(gains) && gains.length >= 2 && (
                <span className="text-amber-400 font-mono">
                  +{gains[1]} Yang, +{gains[0]} XP
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (e.ev === 'structure_down') {
    const structure = data.structure || data.kind || 'Kule';
    const by = data.by || 'Bilinmeyen';
    const team = data.team === 'dark' ? 'Karanlık Takımı' : 'Işık Takımı';

    return (
      <div className="relative flex items-start gap-4">
        <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs shadow-lg">
          🏰
        </div>

        <div className="flex-1 rounded-lg border border-white/5 bg-ink-900/50 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-slate-400">{timeStr}</span>
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-400 border border-amber-500/20">
              Yapı Yıkımı
            </span>
          </div>

          <div className="mt-1 text-slate-200 text-sm">
            <strong className="text-amber-300">{structure}</strong> ({team}) yerle bir edildi!
          </div>

          <div className="mt-1 text-[11px] text-slate-400">
            Yıkan oyuncu: <strong className="text-white">{by}</strong>
          </div>
        </div>
      </div>
    );
  }

  if (e.ev === 'level') {
    const name = data.name || 'Oyuncu';
    const level = data.level || '?';

    return (
      <div className="relative flex items-start gap-4">
        <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs shadow-lg">
          ⬆️
        </div>

        <div className="flex-1 rounded-lg border border-white/5 bg-ink-900/50 p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-slate-400">{timeStr}</span>
            <span className="text-[10px] font-semibold text-emerald-400">
              Seviye Atlama
            </span>
          </div>
          <div className="mt-0.5 text-slate-300">
            <strong className="text-white">{name}</strong>,{' '}
            <span className="font-bold text-emerald-400">Seviye {level}</span> oldu!
          </div>
        </div>
      </div>
    );
  }

  if (e.ev === 'leave') {
    const name = data.name || 'Oyuncu';
    const reason = data.reason || 'Bilinmiyor';

    return (
      <div className="relative flex items-start gap-4">
        <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-500/20 text-slate-400 border border-white/10 text-xs">
          🚪
        </div>

        <div className="flex-1 rounded-lg border border-white/5 bg-ink-900/40 p-2.5 text-xs text-slate-400">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-slate-500">{timeStr}</span>
            <span className="text-[10px] text-slate-500">Ayrılma</span>
          </div>
          <div className="mt-0.5">
            <strong className="text-slate-300">{name}</strong> maçtan ayrıldı{' '}
            <span className="text-slate-500">({reason})</span>
          </div>
        </div>
      </div>
    );
  }

  if (e.ev === 'join') {
    const name = data.name || 'Oyuncu';
    const spec = SPEC_LABELS[data.spec] || SPEC_LABELS[data.class] || data.class || '';
    const team = data.team === 'light' ? 'Işık Takımı' : 'Karanlık Takımı';

    return (
      <div className="relative flex items-start gap-4">
        <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs">
          🚩
        </div>

        <div className="flex-1 rounded-lg border border-white/5 bg-ink-900/40 p-2.5 text-xs text-slate-400">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-slate-500">{timeStr}</span>
            <span className="text-[10px] text-blue-400">Katılma</span>
          </div>
          <div className="mt-0.5">
            <strong className="text-slate-200">{name}</strong> ({spec} · {team}) maça katıldı.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-start gap-4">
      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-slate-400 border border-white/10 text-xs">
        •
      </div>
      <div className="flex-1 rounded-lg border border-white/5 bg-ink-900/40 p-2 text-xs text-slate-400">
        <span className="font-mono text-slate-500">{timeStr}</span> —{' '}
        <span className="font-semibold text-slate-300">{e.ev}</span>:{' '}
        {JSON.stringify(data)}
      </div>
    </div>
  );
}
