(function(root, factory) {
  'use strict';
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroShareActions = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function(root) {
  'use strict';

  async function share(options) {
    options = options || {};
    var navigatorApi = options.navigator || root.navigator || {};
    var data = { title:String(options.title || 'RideHero'), text:String(options.text || ''), url:String(options.url || '') };
    if (typeof navigatorApi.share === 'function') {
      if (typeof options.imageFactory === 'function' && typeof options.fileFactory === 'function' && typeof navigatorApi.canShare === 'function') {
        try {
          var blob = await options.imageFactory();
          var file = options.fileFactory(blob);
          if (file && navigatorApi.canShare({ files:[file] })) data.files = [file];
        } catch (imageError) {
          // A social-card export is optional. Link sharing must still work.
        }
      }
      try {
        await navigatorApi.share(data);
        return { ok:true, method:data.files ? 'native-file' : 'native-link', data:data };
      } catch (error) {
        if (error && error.name === 'AbortError') return { ok:false, method:'cancelled', cancelled:true };
      }
    }
    if (typeof options.copyLink === 'function') {
      await options.copyLink(data.url);
      return { ok:true, method:'copied-link', data:data };
    }
    return { ok:false, method:'unavailable' };
  }

  return Object.freeze({ share:share });
});
