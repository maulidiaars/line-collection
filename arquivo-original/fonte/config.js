/* ============================================================
   LINE COLLECTION — CONFIGURAÇÃO DE VENDAS (único lugar a editar)
   Quando os produtos existirem no Gumroad, cole os links abaixo
   (ex.: "https://SEU-USUARIO.gumroad.com/l/eqline") e troque
   lojaAberta para true. Com lojaAberta=false os botões mostram
   "em breve" e não levam a lugar nenhum.
   ============================================================ */
window.LINE_CONFIG = {
  lojaAberta: false,
  precos: { avulso: 99, avulsoLancamento: 69, pacoteVoz: 149, pacoteVozLancamento: 119,
            pacoteMix: 299, pacoteMixLancamento: 219, pacoteCompleto: 499, pacoteCompletoLancamento: 349, diasLancamento: 7 },
  lancamentoAtivo: true,          // mostra o preço de lançamento riscando o normal
  links: {
    pacoteVoz: "#",               // Pacote Voz — AutoLine + HarmoLine + SilentLine
    pacoteMix: "#",               // Pacote Mix & Master — EqLine, CompLine, DriveLine, PingLine, ReverbLine, LimitLine
    pacoteCompleto: "#",          // Pacote Completo — os 10 plugins
    autoline: "#", harmoline: "#", silentline: "#", eqline: "#", compline: "#", limitline: "#",
    driveline: "#", pingline: "#", reverbline: "#", synthkeyline: "#",
    avulso: "#"                   // página "escolha seu plugin" (opcional)
  }
};
(function(){
  function apply(){
    var C = window.LINE_CONFIG;
    document.querySelectorAll('[data-buy]').forEach(function(a){
      var url = C.links[a.getAttribute('data-buy')] || '#';
      var open = C.lojaAberta && url && url !== '#';
      a.setAttribute('href', open ? url : '#');
      if (open) { a.removeAttribute('aria-disabled'); a.classList.add('gumroad-button'); }
      else { a.setAttribute('aria-disabled','true'); a.addEventListener('click', function(e){ if(!C.lojaAberta) e.preventDefault(); }); }
      var note = a.parentNode.querySelector('.soon'); if (note) note.hidden = open;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
