import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { GameSession, MatchStats, MatchSummary } from '@shared/types';
import { api } from '../api';
import { PageHeader, Spinner, useToast } from '../components/ui';

export const SPEC_LABELS: Record<string, string> = {
  warrior: 'Savaşçı',
  warrior_body: 'Bedensel Savaşçı',
  warrior_mental: 'Zihinsel Savaşçı',
  ninja: 'Ninja',
  ninja_dagger: 'Yakın Dövüş (Bıçakçı)',
  ninja_bow: 'Uzak Dövüş (Okçu)',
  sura: 'Sura',
  sura_weapon: 'Büyülü Silah Sura',
  sura_magic: 'Kara Büyü Sura',
  shaman: 'Şaman',
  shaman_dragon: 'Ejderha Gücü Şaman',
  shaman_lightning: 'İyileştirme Şaman',
};

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '—';
  const s = Math.round(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours} sa ${remMins} dk`;
  }
  return `${mins} dk ${secs} sn`;
}

export function formatDate(sqlite: string | null | undefined): string {
  if (!sqlite) return '—';
  try {
    return new Date(sqlite.replace(' ', 'T') + 'Z').toLocaleString('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  } catch {
    return sqlite;
  }
}

export function MatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'sessions' ? 'sessions' : 'matches';

  const [stats, setStats] = useState<MatchStats | null>(null);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);

  const [matchTotal, setMatchTotal] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const matchPage = Math.max(1, Number(searchParams.get('mpage')) || 1);
  const sessionPage = Math.max(1, Number(searchParams.get('spage')) || 1);
  const statusFilter = searchParams.get('status') || '';
  const searchFilter = searchParams.get('q') || '';
  const classFilter = searchParams.get('class') || '';

  const toast = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const statsData = await api.get<MatchStats>('/api/matches/stats');
      setStats(statsData);

      if (activeTab === 'matches') {
        const query = new URLSearchParams({
          page: String(matchPage),
          pageSize: '20',
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(searchFilter ? { search: searchFilter } : {}),
        });
        const res = await api.get<{ matches: MatchSummary[]; total: number }>(`/api/matches?${query}`);
        setMatches(res.matches);
        setMatchTotal(res.total);
      } else {
        const query = new URLSearchParams({
          page: String(sessionPage),
          pageSize: '25',
          ...(searchFilter ? { search: searchFilter } : {}),
          ...(classFilter ? { class: classFilter } : {}),
        });
        const res = await api.get<{ sessions: GameSession[]; total: number }>(`/api/sessions?${query}`);
        setSessions(res.sessions);
        setSessionTotal(res.total);
      }
    } catch (err: any) {
      toast('error', err.message || 'Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, matchPage, sessionPage, statusFilter, searchFilter, classFilter]);

  const handleTabChange = (tab: 'matches' | 'sessions') => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await api.post<{ matches: number; sessions: number; pending: number; errors: string[] }>('/api/matches/import');
      toast('success', `Günlükler aktarıldı: ${res.matches} maç, ${res.sessions} oturum.`);
      loadData();
    } catch (err: any) {
      toast('error', err.message || 'Aktarma başarısız.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Maçlar & Oyuncu Oturumları"
        subtitle="Oyun sunucusundan aktarılan gerçek maç kayıtları, oyuncu istatistikleri ve oturum günlükleri"
        actions={
          <button
            type="button"
            className="btn-ghost flex items-center gap-2"
            onClick={handleImport}
            disabled={importing}
            title="MATCH_LOG_DIR altındaki JSONL günlüklerini elle aktar"
          >
            {importing ? <Spinner className="h-4 w-4" /> : <span>↻</span>}
            Günlükleri Şimdi Tara
          </button>
        }
      />

      {/* KPI İstatistik Kartları */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Toplam Maç</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-slate-100 tabular-nums">
                {stats.totalMatches}
              </span>
              <span className="text-xs text-slate-400">
                ({stats.finishedMatches} bitti)
              </span>
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Ortalama Süre</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-brand-300 tabular-nums">
                {formatDuration(stats.avgDurationSeconds)}
              </span>
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Takım Galibiyeti</div>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="font-semibold text-sky-400">
                {stats.lightWins} Işık
              </span>
              <span className="text-slate-600">/</span>
              <span className="font-semibold text-rose-400">
                {stats.darkWins} Karanlık
              </span>
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Toplam Oturum</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-slate-100 tabular-nums">
                {stats.totalSessions}
              </span>
              <span className="text-xs text-slate-400">
                ({stats.uniquePlayers} tekil oyuncu)
              </span>
            </div>
          </div>

          <div className="card p-4 col-span-2 sm:col-span-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">Aktif Oturum</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="font-display text-2xl font-bold text-emerald-400 tabular-nums">
                {stats.activeSessions}
              </span>
              <span className="text-xs text-slate-400">çevrimiçi</span>
            </div>
          </div>
        </div>
      )}

      {/* Sekmeler */}
      <div className="mb-6 flex border-b border-white/[0.08]">
        <button
          type="button"
          onClick={() => handleTabChange('matches')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 font-display text-sm font-semibold tracking-wide transition ${
            activeTab === 'matches'
              ? 'border-brand-400 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>⚔️</span> Maç Günlükleri
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">
            {stats?.totalMatches ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('sessions')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 font-display text-sm font-semibold tracking-wide transition ${
            activeTab === 'sessions'
              ? 'border-brand-400 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>🎮</span> Oyuncu Oturumları
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">
            {stats?.totalSessions ?? 0}
          </span>
        </button>
      </div>

      {/* TAB 1: MAÇ GÜNLÜKLERİ */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          {/* Filtre Barı */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-ink-900/60 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Maç kimliği veya oyuncu ara..."
                defaultValue={searchFilter}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const next = new URLSearchParams(searchParams);
                    next.set('q', (e.target as HTMLInputElement).value);
                    next.set('mpage', '1');
                    setSearchParams(next);
                  }
                }}
                className="input input-sm w-64 text-sm"
              />

              <div className="flex items-center gap-1">
                {(['', 'finished', 'aborted', 'crashed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      if (st) next.set('status', st);
                      else next.delete('status');
                      next.set('mpage', '1');
                      setSearchParams(next);
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      statusFilter === st
                        ? 'bg-brand-500 text-white'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    }`}
                  >
                    {st === '' && 'Tüm Durumlar'}
                    {st === 'finished' && 'Tamamlandı'}
                    {st === 'aborted' && 'Yarıda Kaldı'}
                    {st === 'crashed' && 'Çöktü'}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-slate-500">
              Toplam {matchTotal} maç
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center p-12">
              <Spinner className="h-6 w-6 text-brand-400" />
            </div>
          ) : matches.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">
              <p className="text-lg">Kayıtlı maç bulunamadı.</p>
              <p className="mt-1 text-xs text-slate-500">
                Oyun sunucusu çalıştığında ve maç tamamlandığında günlükler buraya aktarılır.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/[0.08] bg-ink-900/90 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Maç Kimliği</th>
                    <th className="px-4 py-3">Tarih</th>
                    <th className="px-4 py-3">Durum</th>
                    <th className="px-4 py-3">Skor (Öldürme)</th>
                    <th className="px-4 py-3">Kazanan</th>
                    <th className="px-4 py-3">Oyuncular</th>
                    <th className="px-4 py-3">Süre</th>
                    <th className="px-4 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {matches.map((m) => {
                    const isFinished = m.status === 'finished';
                    const isAborted = m.status === 'aborted';
                    return (
                      <tr key={m.id} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-3.5 font-mono text-xs text-brand-300">
                          <Link
                            to={`/admin/matches/${m.id}`}
                            className="hover:underline flex items-center gap-1.5"
                          >
                            <span>#{m.id}</span>
                            <span className="text-slate-300">{m.matchKey}</span>
                          </Link>
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                          {formatDate(m.startedAt)}
                        </td>

                        <td className="px-4 py-3.5">
                          {isFinished && (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/30">
                              Tamamlandı
                            </span>
                          )}
                          {isAborted && (
                            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
                              Yarıda Kaldı
                            </span>
                          )}
                          {!isFinished && !isAborted && (
                            <span className="inline-flex items-center rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400 border border-red-500/30">
                              Çöktü
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 tabular-nums whitespace-nowrap">
                          <span className="font-semibold text-sky-400">{m.lightKills}</span>
                          <span className="mx-1 text-slate-600">-</span>
                          <span className="font-semibold text-rose-400">{m.darkKills}</span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {m.winner === 'light' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-sky-400">
                              <span className="h-2 w-2 rounded-full bg-sky-400" />
                              Işık Takımı
                            </span>
                          ) : m.winner === 'dark' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-rose-400">
                              <span className="h-2 w-2 rounded-full bg-rose-400" />
                              Karanlık Takımı
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-300 tabular-nums">
                          {m.playerCount} oyuncu
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-300 font-mono tabular-nums">
                          {formatDuration(m.durationSeconds)}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <Link
                            to={`/admin/matches/${m.id}`}
                            className="btn-ghost btn-sm text-xs text-brand-300 hover:text-brand-200"
                          >
                            İncele ➔
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: OYUNCU OTURUMLARI */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          {/* Filtre Barı */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-ink-900/60 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Oyuncu adı veya oturum kimliği..."
                defaultValue={searchFilter}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const next = new URLSearchParams(searchParams);
                    next.set('q', (e.target as HTMLInputElement).value);
                    next.set('spage', '1');
                    setSearchParams(next);
                  }
                }}
                className="input input-sm w-64 text-sm"
              />

              <select
                value={classFilter}
                onChange={(e) => {
                  const next = new URLSearchParams(searchParams);
                  if (e.target.value) next.set('class', e.target.value);
                  else next.delete('class');
                  next.set('spage', '1');
                  setSearchParams(next);
                }}
                className="input input-sm text-sm"
              >
                <option value="">Tüm Sınıflar</option>
                <option value="warrior">Savaşçı</option>
                <option value="ninja">Ninja</option>
                <option value="sura">Sura</option>
                <option value="shaman">Şaman</option>
              </select>
            </div>

            <span className="text-xs text-slate-500">
              Toplam {sessionTotal} oturum
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center p-12">
              <Spinner className="h-6 w-6 text-brand-400" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">
              <p className="text-lg">Kayıtlı oturum bulunamadı.</p>
              <p className="mt-1 text-xs text-slate-500">
                Oyuncular oyuna giriş yaptığında oturum günlükleri burada listelenir.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/[0.08] bg-ink-900/90 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Oyuncu</th>
                    <th className="px-4 py-3">Sınıf & Uzmanlık</th>
                    <th className="px-4 py-3">Seviye</th>
                    <th className="px-4 py-3">Katılma Zamanı</th>
                    <th className="px-4 py-3">Ayrılma Zamanı</th>
                    <th className="px-4 py-3">Süre</th>
                    <th className="px-4 py-3">Maçlar</th>
                    <th className="px-4 py-3">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sessions.map((s) => {
                    const isOnline = !s.leftAt;
                    const specTitle = SPEC_LABELS[s.spec] || SPEC_LABELS[s.class] || s.class || '—';
                    return (
                      <tr key={s.id} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-200">
                            {s.playerName}
                          </div>
                          {s.accountEmail && (
                            <div className="text-xs text-slate-500 truncate max-w-[180px]">
                              {s.accountEmail}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-300">
                          <span className="rounded bg-white/5 px-2 py-0.5 border border-white/10">
                            {specTitle}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-xs tabular-nums text-slate-300">
                          Lv {s.levelStart}
                          {s.levelEnd && s.levelEnd !== s.levelStart ? (
                            <span className="text-emerald-400"> ➔ {s.levelEnd}</span>
                          ) : null}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                          {formatDate(s.joinedAt)}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                          {isOnline ? (
                            <span className="text-emerald-400 font-medium">Hâlâ oyunda</span>
                          ) : (
                            formatDate(s.leftAt)
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-300 font-mono tabular-nums">
                          {formatDuration(s.durationSeconds)}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-300 tabular-nums">
                          {s.matches} maç
                        </td>

                        <td className="px-4 py-3.5">
                          {isOnline ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/30">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Bağlı
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs text-slate-400 border border-white/5">
                              Ayrıldı
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
