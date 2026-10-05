'use strict';

// The shared log of deepest dives, kept by the server at CONFIG.api (this page's own server, or the
// real one when the game is played on CrazyGames).
// Each browser is one diver: an id and a secret the server hands out once and the browser keeps.
const Leaderboard = (() => {
  const API = CONFIG.api;

  async function call(method, path, body, auth = true) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (auth) {
        const me = await diver();
        headers.Authorization = `Bearer ${me.id}.${me.token}`;
      }
      const res = await fetch(API + path, {
        method, headers, signal: ctrl.signal,
        // IIS refuses a POST without a length, so every write carries at least {}
        body: method === 'GET' ? undefined : JSON.stringify(body === undefined ? {} : body),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401 && auth) {
        // the server forgot this diver (or the secret was lost): start over as a new one
        Store.set('lf_diver', null);
        throw new Error('The ship did not recognise the sphere. Try again.');
      }
      if (!res.ok) {
        const err = new Error((data && data.message) || 'The ship could not take the log just now.');
        err.status = res.status;
        throw err;
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

  let pending = null;
  function diver() {
    const saved = Store.get('lf_diver', null);
    if (saved && saved.id && saved.token) return Promise.resolve(saved);
    // one request even if several calls ask at once
    pending = pending || call('POST', 'players', undefined, false)
      .then(d => { Store.set('lf_diver', d); return d; })
      .finally(() => { pending = null; });
    return pending;
  }

  return {
    // Rows of {rank, name, score, depth, me}, plus this diver's own row when it is below the list.
    board(limit = 10) {
      const auth = !!Store.get('lf_diver', null);
      return call('GET', `board?limit=${limit}`, undefined, auth);
    },
    me() { return call('GET', 'me'); },
    rename(name) { return call('PUT', 'me/name', { name }); },
    // Called as the sphere goes down; resolves to the dive's id, or null if the ship cannot be reached.
    start() { return call('POST', 'dives').then(d => d.id, () => null); },
    finish(id, d) {
      return call('POST', `dives/${id}/finish`, {
        score: d.score, depth: d.depth, kills: d.kills, species: d.species, duration: d.duration,
      });
    },
  };
})();
