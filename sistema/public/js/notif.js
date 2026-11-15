/* Sino desativado — notificações fake removidas a pedido. */
(function (global) {
  "use strict";
  function noop() {}
  global.TorcidaNotif = {
    boot: noop,
    setNotifs: noop,
    render: noop,
    nova: noop,
    fechar: noop
  };
})(window);
