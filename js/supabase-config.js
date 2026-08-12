(function(global) {
  'use strict';

  // These are public browser configuration values, not privileged secrets.
  // Never add provider secrets or a Supabase service-role key to browser code.
  global.RIDEHERO_AUTH_CONFIG = Object.freeze({
    supabaseUrl: 'https://wiryzupgdfxftrvjvdzh.supabase.co',
    publishableKey: 'sb_publishable_NlH_dlXgON7osLtscCxYbA_AVTtFyQc',
    emailEnabled: true,
    // Keep social providers disabled in RideHero until their matching provider
    // credentials are enabled in Supabase. Their buttons remain visible but
    // unavailable, so users are not sent into a broken OAuth flow.
    enabledProviders: Object.freeze([]),
    profileReadRpc: 'get_my_profile',
    profileCompleteRpc: 'complete_profile',

    // Keep blank until a server-side Edge Function verifies the authenticated
    // user and securely removes their Auth identity and account-backed data.
    deleteAccountFunction: ''
  });
})(window);
