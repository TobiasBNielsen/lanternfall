'use strict';

// The shared log of deepest dives, kept in Supabase. The publishable key is meant to be public:
// the table itself is locked, and the two database functions decide what is accepted.
const Leaderboard = (() => {
  const URL = 'https://ccgbwsjuglnrhgemfyqf.supabase.co/rest/v1/rpc/';
  const KEY = 'sb_publishable_pd7mZWXkUdVbuASKXUPM8Q_meapf-I5';

  function playerId() {
    let id = Store.get('lf_player', null);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) ||
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 3) | 8).toString(16);
        });
      Store.set('lf_player', id);
    }
    return id;
  }

  async function call(fn, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(URL + fn, {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      // only the plain-language refusals written in schema.sql (raised as P0001) reach the player
      if (!res.ok) {
        const ours = data && data.code === 'P0001' && data.message;
        throw new Error(ours || (res.status === 404 ? 'The log has not been set up on the ship yet.' : 'The ship could not take the log just now.'));
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('The ship is not answering.');
      if (e instanceof TypeError) throw new Error('No line to the ship right now.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    top(limit = 10) { return call('top_dives', { p_limit: limit }); },
    async submit(d) {
      const rows = await call('submit_dive', {
        p_player: playerId(), p_name: d.name, p_score: d.score, p_depth: d.depth,
        p_kills: d.kills, p_species: d.species, p_duration: d.duration,
      });
      return rows && rows[0];
    },
  };
})();
