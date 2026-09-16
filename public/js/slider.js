(function(){
  var wrap   = document.querySelector('.hero-slider-wrap');
  var slides = wrap.querySelectorAll('.slide');
  var dots   = wrap.querySelectorAll('.dot');
  var cur    = 0;
  var busy   = false;
  var timer  = setInterval(function(){ go(cur + 1, 1); }, 5000);

  function go(n, dir){
    if(busy) return;
    busy = true;

    var next = (n + slides.length) % slides.length;
    if(next === cur){ busy = false; return; }

    var leaving  = slides[cur];
    var entering = slides[next];

    dots[cur].classList.remove('active');
    dots[next].classList.add('active');

    /* posiciona o slide entrante fora da área (direita ou esquerda) */
    entering.style.transition = 'none';
    entering.style.transform  = 'translateX(' + (dir > 0 ? '100%' : '-100%') + ')';
    entering.style.opacity    = '1';
    entering.classList.add('active');

    /* força reflow para a transição funcionar */
    entering.getBoundingClientRect();

    var dur = '500ms';
    var ease = 'cubic-bezier(0.4,0,0.2,1)';

    leaving.style.transition  = 'transform ' + dur + ' ' + ease + ', opacity ' + dur + ' ' + ease;
    entering.style.transition = 'transform ' + dur + ' ' + ease + ', opacity ' + dur + ' ' + ease;

    leaving.style.transform   = 'translateX(' + (dir > 0 ? '-100%' : '100%') + ')';
    leaving.style.opacity     = '0';
    entering.style.transform  = 'translateX(0)';
    entering.style.opacity    = '1';

    entering.addEventListener('transitionend', function done(){
      entering.removeEventListener('transitionend', done);
      leaving.classList.remove('active');
      leaving.style.transition = '';
      leaving.style.transform  = '';
      leaving.style.opacity    = '';
      entering.style.transition = '';
      entering.style.transform  = '';
      entering.style.opacity    = '';
      cur  = next;
      busy = false;
    });
  }

  function resetTimer(){
    clearInterval(timer);
    timer = setInterval(function(){ go(cur + 1, 1); }, 5000);
  }

  window.goSlide = function(n){
    var dir = n > cur ? 1 : -1;
    resetTimer();
    go(n, dir);
  };

  window.changeSlide = function(d){
    resetTimer();
    go(cur + d, d);
  };
})();
