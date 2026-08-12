(function(global) {
  'use strict';

  // These are public browser configuration values, not privileged secrets.
  // Replace the placeholders after the Supabase project and providers are ready.
  // Never add provider secrets or a Supabase service-role key to browser code.
  global.RIDEHERO_AUTH_CONFIG = Object.freeze({
    supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
    publishableKey: 'sb_publishable_REPLACE_ME',
    emailEnabled: true,
    enabledProviders: Object.freeze(['google', 'facebook']),
    profileReadRpc: 'get_my_profile',
    profileCompleteRpc: 'complete_profile',

    // Keep blank until a server-side Edge Function verifies the authenticated
    // user and securely removes their Auth identity and account-backed data.
    deleteAccountFunction: ''
  });
})(window);
