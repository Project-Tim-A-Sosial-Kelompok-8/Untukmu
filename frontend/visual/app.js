/* Bootstrap the product after its visual scene and API runtime have loaded. */
window.UM = window.UM || {};
UM.app = (function() {
  function boot() {
    document.body.classList.add('um-on'); UM.i18n.setLang('id');
    UM.ui.mount(); UM.sky.pasangKait(); UM.galaksi.pasangKait();
    var enter = window.enterSky, exit = window.exitSky;
    window.enterSky = function() { var result=enter(); UM.sky.onEnter(); UM.ui.renderSemua(); return result; };
    window.exitSky = function() { UM.sky.onExit(); var result=exit(); UM.ui.renderSemua(); return result; };
    window.addEventListener('keydown',function(event) {
      if (event.key === 'Escape' && UM.ui.anyScreenOpen()) { UM.ui.closeAllScreens(); event.stopImmediatePropagation(); }
    },true);
    UM.store.ready().then(function(){return UM.galaksi.refresh();}).then(function(){return UM.sky.refresh();}).then(function(){
      UM.ui.renderSemua(); if(new URLSearchParams(location.search).get('screen') === 'doa') UM.ui.bukaDoa(); else UM.ui.bukaEntry();
    }).catch(function(){UM.ui.bukaEntry();});
  }
  boot(); return {boot:boot};
})();
