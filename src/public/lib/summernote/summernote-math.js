/**
 * Summernote Math Plugin - KaTeX offline
 * Lengkap dengan tab kategori: Dasar, Kalkulus, Turunan, Trigonometri, Aljabar, Statistik, Simbol
 */
(function (factory) {
  if (typeof define === 'function' && define.amd) { define(['jquery'], factory); }
  else if (typeof module === 'object' && module.exports) { module.exports = factory(require('jquery')); }
  else { factory(window.jQuery); }
}(function ($) {

  // Semua kategori shortcut
  var SHORTCUTS = {
    'Dasar': [
      { label: 'Pecahan', latex: '\\frac{a}{b}' },
      { label: 'Akar', latex: '\\sqrt{x}' },
      { label: 'Akar ke-n', latex: '\\sqrt[n]{x}' },
      { label: 'Pangkat', latex: 'x^{2}' },
      { label: 'Indeks', latex: 'x_{i}' },
      { label: 'Pangkat+Indeks', latex: 'x_{i}^{2}' },
      { label: '±', latex: '\\pm' },
      { label: '∓', latex: '\\mp' },
      { label: '×', latex: '\\times' },
      { label: '÷', latex: '\\div' },
      { label: '≠', latex: '\\neq' },
      { label: '≈', latex: '\\approx' },
      { label: '≤', latex: '\\leq' },
      { label: '≥', latex: '\\geq' },
      { label: '∞', latex: '\\infty' },
      { label: 'Mutlak', latex: '|x|' },
      { label: 'Kurung besar', latex: '\\left( \\frac{a}{b} \\right)' },
      { label: 'Kurung siku', latex: '\\left[ x \\right]' },
    ],
    'Kalkulus': [
      { label: 'Limit', latex: '\\lim_{x \\to a} f(x)' },
      { label: 'Limit ∞', latex: '\\lim_{x \\to \\infty} f(x)' },
      { label: 'Integral', latex: '\\int_{a}^{b} f(x)\\,dx' },
      { label: 'Integral ∞', latex: '\\int_{-\\infty}^{\\infty} f(x)\\,dx' },
      { label: 'Integral ganda', latex: '\\iint_{D} f(x,y)\\,dx\\,dy' },
      { label: 'Sigma', latex: '\\sum_{i=1}^{n} a_i' },
      { label: 'Produk', latex: '\\prod_{i=1}^{n} a_i' },
      { label: 'Turunan', latex: "f'(x)" },
      { label: 'Turunan ke-2', latex: "f''(x)" },
      { label: 'Turunan ke-n', latex: 'f^{(n)}(x)' },
      { label: 'd/dx', latex: '\\frac{d}{dx} f(x)' },
      { label: 'd²/dx²', latex: '\\frac{d^2}{dx^2} f(x)' },
      { label: '∂/∂x', latex: '\\frac{\\partial f}{\\partial x}' },
      { label: 'Aturan rantai', latex: "\\frac{d}{dx}[f(g(x))] = f'(g(x)) \\cdot g'(x)" },
      { label: 'Aturan hasil kali', latex: "(uv)' = u'v + uv'" },
      { label: 'Aturan hasil bagi', latex: "\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^2}" },
    ],
    'Turunan': [
      { label: 'u=f(x), u\'=f\'(x)', latex: "u = f(x),\\quad u' = f'(x)" },
      { label: 'v=cos(g(x))', latex: "v = \\cos(g(x)),\\quad v' = -\\sin(g(x)) \\cdot g'(x)" },
      { label: 'F\'(x) komposit', latex: "F'(x) = f'(x)\\cos(g(x)) + f(x)(-\\sin(g(x)) \\cdot g'(x))" },
      { label: 'F\'(1) substitusi', latex: "F'(1) = f'(1)\\cos(g(1)) + f(1)(-\\sin(g(1)) \\cdot g'(1))" },
      { label: 'Turunan sin', latex: "\\frac{d}{dx}[\\sin(x)] = \\cos(x)" },
      { label: 'Turunan cos', latex: "\\frac{d}{dx}[\\cos(x)] = -\\sin(x)" },
      { label: 'Turunan tan', latex: "\\frac{d}{dx}[\\tan(x)] = \\sec^2(x)" },
      { label: 'Turunan eˣ', latex: "\\frac{d}{dx}[e^x] = e^x" },
      { label: 'Turunan ln', latex: "\\frac{d}{dx}[\\ln(x)] = \\frac{1}{x}" },
      { label: 'Turunan xⁿ', latex: "\\frac{d}{dx}[x^n] = nx^{n-1}" },
      { label: 'Turunan aˣ', latex: "\\frac{d}{dx}[a^x] = a^x \\ln(a)" },
      { label: 'Turunan arcsin', latex: "\\frac{d}{dx}[\\arcsin(x)] = \\frac{1}{\\sqrt{1-x^2}}" },
      { label: 'Turunan arctan', latex: "\\frac{d}{dx}[\\arctan(x)] = \\frac{1}{1+x^2}" },
      { label: 'Titik kritis', latex: "f'(x) = 0" },
      { label: 'Uji turunan ke-2', latex: "f''(x) > 0 \\Rightarrow \\text{minimum}" },
    ],
    'Trigonometri': [
      { label: 'sin(x)', latex: '\\sin(x)' },
      { label: 'cos(x)', latex: '\\cos(x)' },
      { label: 'tan(x)', latex: '\\tan(x)' },
      { label: 'cot(x)', latex: '\\cot(x)' },
      { label: 'sec(x)', latex: '\\sec(x)' },
      { label: 'csc(x)', latex: '\\csc(x)' },
      { label: 'arcsin', latex: '\\arcsin(x)' },
      { label: 'arccos', latex: '\\arccos(x)' },
      { label: 'arctan', latex: '\\arctan(x)' },
      { label: 'sin²+cos²=1', latex: '\\sin^2(x) + \\cos^2(x) = 1' },
      { label: 'sin 2x', latex: '\\sin(2x) = 2\\sin(x)\\cos(x)' },
      { label: 'cos 2x', latex: '\\cos(2x) = \\cos^2(x) - \\sin^2(x)' },
      { label: 'tan 2x', latex: '\\tan(2x) = \\frac{2\\tan(x)}{1-\\tan^2(x)}' },
      { label: 'Rumus jumlah sin', latex: '\\sin(A+B) = \\sin A\\cos B + \\cos A\\sin B' },
      { label: 'Rumus jumlah cos', latex: '\\cos(A+B) = \\cos A\\cos B - \\sin A\\sin B' },
      { label: 'π', latex: '\\pi' },
      { label: 'π/2', latex: '\\frac{\\pi}{2}' },
      { label: 'π/3', latex: '\\frac{\\pi}{3}' },
      { label: 'π/4', latex: '\\frac{\\pi}{4}' },
      { label: 'π/6', latex: '\\frac{\\pi}{6}' },
    ],
    'Aljabar': [
      { label: 'Persamaan kuadrat', latex: 'ax^2 + bx + c = 0' },
      { label: 'Rumus abc', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
      { label: 'Diskriminan', latex: 'D = b^2 - 4ac' },
      { label: '(a+b)²', latex: '(a+b)^2 = a^2 + 2ab + b^2' },
      { label: '(a-b)²', latex: '(a-b)^2 = a^2 - 2ab + b^2' },
      { label: 'a²-b²', latex: 'a^2 - b^2 = (a+b)(a-b)' },
      { label: '(a+b)³', latex: '(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3' },
      { label: 'log', latex: '\\log_{a}(b)' },
      { label: 'ln', latex: '\\ln(x)' },
      { label: 'log sifat', latex: '\\log(ab) = \\log a + \\log b' },
      { label: 'Kombinasi', latex: '\\binom{n}{k} = \\frac{n!}{k!(n-k)!}' },
      { label: 'Faktorial', latex: 'n!' },
      { label: 'Matriks 2x2', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
      { label: 'Det matriks', latex: '\\det(A) = ad - bc' },
      { label: 'Sistem persamaan', latex: '\\begin{cases} ax + by = c \\\\ dx + ey = f \\end{cases}' },
      { label: 'Vektor', latex: '\\vec{v} = (x, y, z)' },
      { label: 'Dot product', latex: '\\vec{a} \\cdot \\vec{b} = |a||b|\\cos\\theta' },
    ],
    'Statistik': [
      { label: 'Rata-rata', latex: '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i' },
      { label: 'Variansi', latex: 's^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i - \\bar{x})^2' },
      { label: 'Std deviasi', latex: 's = \\sqrt{\\frac{\\sum(x_i-\\bar{x})^2}{n-1}}' },
      { label: 'Peluang', latex: 'P(A) = \\frac{n(A)}{n(S)}' },
      { label: 'P(A∪B)', latex: 'P(A \\cup B) = P(A) + P(B) - P(A \\cap B)' },
      { label: 'P(A|B)', latex: 'P(A|B) = \\frac{P(A \\cap B)}{P(B)}' },
      { label: 'Binomial', latex: 'P(X=k) = \\binom{n}{k} p^k (1-p)^{n-k}' },
      { label: 'Normal', latex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}' },
      { label: 'Korelasi', latex: 'r = \\frac{\\sum(x_i-\\bar{x})(y_i-\\bar{y})}{\\sqrt{\\sum(x_i-\\bar{x})^2 \\sum(y_i-\\bar{y})^2}}' },
      { label: 'Regresi', latex: 'y = a + bx' },
    ],
    'Simbol': [
      { label: 'α', latex: '\\alpha' },
      { label: 'β', latex: '\\beta' },
      { label: 'γ', latex: '\\gamma' },
      { label: 'δ', latex: '\\delta' },
      { label: 'ε', latex: '\\epsilon' },
      { label: 'θ', latex: '\\theta' },
      { label: 'λ', latex: '\\lambda' },
      { label: 'μ', latex: '\\mu' },
      { label: 'σ', latex: '\\sigma' },
      { label: 'φ', latex: '\\phi' },
      { label: 'ω', latex: '\\omega' },
      { label: 'Δ', latex: '\\Delta' },
      { label: 'Σ', latex: '\\Sigma' },
      { label: 'Π', latex: '\\Pi' },
      { label: 'Ω', latex: '\\Omega' },
      { label: '∈', latex: '\\in' },
      { label: '∉', latex: '\\notin' },
      { label: '⊂', latex: '\\subset' },
      { label: '∪', latex: '\\cup' },
      { label: '∩', latex: '\\cap' },
      { label: '∀', latex: '\\forall' },
      { label: '∃', latex: '\\exists' },
      { label: '→', latex: '\\rightarrow' },
      { label: '⇒', latex: '\\Rightarrow' },
      { label: '⇔', latex: '\\Leftrightarrow' },
      { label: '∴', latex: '\\therefore' },
      { label: '∵', latex: '\\because' },
      { label: 'Garis AB', latex: '\\overline{AB}' },
      { label: 'Sudut', latex: '\\angle ABC' },
      { label: 'Segitiga', latex: '\\triangle ABC' },
    ]
  };

  $.extend($.summernote.plugins, {
    'math': function (context) {
      var self = this;
      var ui = $.summernote.ui;

      context.memo('button.math', function () {
        return ui.button({
          contents: '<span style="font-style:normal;font-weight:bold;font-family:serif;font-size:15px;">∑</span>',
          tooltip: 'Sisipkan Rumus Matematika (LaTeX)',
          click: function () { self.showDialog(); }
        }).render();
      });

      self.showDialog = function () {
        var selectedText = '';
        var sel = window.getSelection();
        if (sel && sel.toString()) selectedText = sel.toString();

        // Build tab HTML
        var tabNames = Object.keys(SHORTCUTS);
        var tabBtns = tabNames.map(function(name, i) {
          return '<button class="math-tab-btn" data-tab="' + name + '" style="padding:5px 12px;border-radius:6px;border:1px solid #e2e8f0;background:' + (i===0?'#6366f1':'#f1f5f9') + ';color:' + (i===0?'#fff':'#475569') + ';cursor:pointer;font-size:12px;white-space:nowrap;">' + name + '</button>';
        }).join('');

        var shortcutPanels = tabNames.map(function(name) {
          var btns = SHORTCUTS[name].map(function(s) {
            return '<button class="math-shortcut" data-latex="' + s.latex.replace(/"/g,'&quot;') + '" title="' + s.latex.replace(/"/g,'&quot;') + '" style="padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;font-size:12px;white-space:nowrap;">' + s.label + '</button>';
          }).join('');
          return '<div class="math-tab-panel" data-panel="' + name + '" style="display:' + (name===tabNames[0]?'flex':'none') + ';flex-wrap:wrap;gap:5px;">' + btns + '</div>';
        }).join('');

        var $dialog = $('<div>').css({
          position:'fixed',top:0,left:0,right:0,bottom:0,
          background:'rgba(0,0,0,0.55)',zIndex:99999,
          display:'flex',alignItems:'center',justifyContent:'center'
        });

        var $box = $('<div>').css({
          background:'#fff',borderRadius:'14px',padding:'20px',
          width:'680px',maxWidth:'96vw',maxHeight:'90vh',
          overflowY:'auto',boxShadow:'0 24px 64px rgba(0,0,0,0.3)'
        });

        $box.html(
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
            '<h3 style="margin:0;font-size:17px;color:#1e1b4b;font-weight:700;">∑ Sisipkan Rumus Matematika</h3>' +
            '<button id="math-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;line-height:1;">✕</button>' +
          '</div>' +

          '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">' +
            '<button class="math-mode-btn active" data-mode="inline" style="padding:5px 14px;border-radius:8px;border:2px solid #6366f1;background:#6366f1;color:#fff;cursor:pointer;font-size:13px;">Inline $...$</button>' +
            '<button class="math-mode-btn" data-mode="block" style="padding:5px 14px;border-radius:8px;border:2px solid #e2e8f0;background:#f8fafc;color:#475569;cursor:pointer;font-size:13px;">Block $$...$$</button>' +
          '</div>' +

          '<textarea id="math-input" placeholder="Ketik LaTeX di sini, contoh: \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" style="width:100%;height:80px;padding:10px;border:2px solid #c7d2fe;border-radius:8px;font-family:monospace;font-size:13px;resize:vertical;box-sizing:border-box;outline:none;">' + selectedText + '</textarea>' +

          '<div style="margin:10px 0;">' +
            '<div style="font-size:11px;color:#64748b;margin-bottom:5px;font-weight:600;">PREVIEW:</div>' +
            '<div id="math-preview" style="min-height:44px;padding:10px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;overflow-x:auto;text-align:center;font-size:16px;"></div>' +
          '</div>' +

          '<div style="margin-bottom:8px;">' +
            '<div style="font-size:11px;color:#64748b;margin-bottom:6px;font-weight:600;">TEMPLATE CEPAT:</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">' + tabBtns + '</div>' +
            shortcutPanels +
          '</div>' +

          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;">' +
            '<button id="math-cancel" style="padding:8px 20px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;cursor:pointer;font-size:14px;">Batal</button>' +
            '<button id="math-insert" style="padding:8px 24px;border-radius:8px;border:none;background:#6366f1;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">✓ Sisipkan</button>' +
          '</div>'
        );

        $dialog.append($box);
        $('body').append($dialog);

        var mode = 'inline';
        var $input = $dialog.find('#math-input');
        var $preview = $dialog.find('#math-preview');

        function renderPreview() {
          var latex = $input.val().trim();
          if (!latex) {
            $preview.html('<span style="color:#94a3b8;font-size:13px;">Preview akan muncul di sini...</span>');
            return;
          }
          try {
            $preview.html(katex.renderToString(latex, { throwOnError: false, displayMode: mode === 'block' }));
          } catch(e) {
            $preview.html('<span style="color:#ef4444;font-size:12px;">Error: ' + e.message + '</span>');
          }
        }

        $input.on('input', renderPreview);
        if (selectedText) renderPreview();

        // Mode toggle
        $dialog.find('.math-mode-btn').on('click', function() {
          $dialog.find('.math-mode-btn').css({ background:'#f8fafc', color:'#475569', borderColor:'#e2e8f0' });
          $(this).css({ background:'#6366f1', color:'#fff', borderColor:'#6366f1' });
          mode = $(this).data('mode');
          renderPreview();
        });

        // Tab switch
        $dialog.find('.math-tab-btn').on('click', function() {
          var tab = $(this).data('tab');
          $dialog.find('.math-tab-btn').css({ background:'#f1f5f9', color:'#475569', borderColor:'#e2e8f0' });
          $(this).css({ background:'#6366f1', color:'#fff', borderColor:'#6366f1' });
          $dialog.find('.math-tab-panel').hide();
          $dialog.find('.math-tab-panel[data-panel="' + tab + '"]').css('display','flex');
        });

        // Shortcut insert ke textarea (append, bukan replace)
        $dialog.find('.math-shortcut').on('click', function() {
          var latex = $(this).data('latex');
          var el = $input[0];
          var start = el.selectionStart;
          var val = $input.val();
          var newVal = val.slice(0, start) + latex + val.slice(start);
          $input.val(newVal);
          el.selectionStart = el.selectionEnd = start + latex.length;
          $input.focus();
          renderPreview();
        });

        // Hover shortcut
        $dialog.find('.math-shortcut').on('mouseenter', function() {
          $(this).css({ background:'#e0e7ff', borderColor:'#6366f1' });
        }).on('mouseleave', function() {
          $(this).css({ background:'#f8fafc', borderColor:'#e2e8f0' });
        });

        // Close
        $dialog.find('#math-cancel, #math-close').on('click', function() { $dialog.remove(); });
        $dialog.on('click', function(e) { if ($(e.target).is($dialog)) $dialog.remove(); });

        // Insert ke editor
        $dialog.find('#math-insert').on('click', function() {
          var latex = $input.val().trim();
          if (!latex) { $input.focus(); return; }
          var isBlock = mode === 'block';
          var rendered = katex.renderToString(latex, { throwOnError: false, displayMode: isBlock });
          var mathHtml;
          if (isBlock) {
            mathHtml = '<div class="math-formula-block" style="text-align:center;margin:10px 0;overflow-x:auto;">' +
              '<span class="math-formula" data-latex="' + latex.replace(/"/g,'&quot;') + '" data-mode="block" contenteditable="false">' + rendered + '</span>' +
              '</div>';
          } else {
            mathHtml = '<span class="math-formula" data-latex="' + latex.replace(/"/g,'&quot;') + '" data-mode="inline" contenteditable="false">' + rendered + '</span>&nbsp;';
          }
          context.invoke('editor.pasteHTML', mathHtml);
          $dialog.remove();
        });

        // Enter = insert
        $input.on('keydown', function(e) {
          if (e.ctrlKey && e.key === 'Enter') $dialog.find('#math-insert').click();
        });

        $input.focus();
        if (selectedText) { $input[0].select(); }
      };

      self.initialize = function () {};
    }
  });
}));
