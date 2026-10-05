'use strict';

// Which ad network this copy of the game uses, and where the leaderboard lives.
// The CrazyGames package swaps this file for deploy/crazygames.config.js.
const CONFIG = {
  ads: 'google', // 'google' | 'crazygames' | 'none'
  api: 'api/',
  google: {
    client: 'ca-pub-2275526476267750',
    h5: false,        // true once H5 Games Ads is approved for the site
    bannerSlot: null, // the AdSense ad unit id for the title page banner
  },
};
