// Shared light/dark mode and palette preferences.
(function () {
  const KEY="etf-theme",PALETTE_KEY="etf-palette";
  const PALETTES=["mist","sage","lilac","sand","rose","slate","olive","apricot","cocoa","standard"];
  const root=document.documentElement,media=window.matchMedia("(prefers-color-scheme: dark)");
  const current=()=>root.dataset.theme|| (media.matches?"dark":"light");
  const saved=localStorage.getItem(KEY),savedPalette=localStorage.getItem(PALETTE_KEY);
  if(saved==="light"||saved==="dark")root.dataset.theme=saved;
  root.dataset.palette=PALETTES.includes(savedPalette)?savedPalette:PALETTES.includes(root.dataset.palette)?root.dataset.palette:"mist";
  if(!document.getElementById("themePaletteStyles")){
    const link=document.createElement("link");link.id="themePaletteStyles";link.rel="stylesheet";
    link.href=new URL("theme-palettes.css?v=20261123-contrast",document.currentScript?.src||location.href).href;
    document.head.appendChild(link);
  }
  function wire(){
    const toggle=document.getElementById("themeToggle");if(!toggle)return;
    let picker=document.getElementById("palettePicker");
    if(!picker){
      picker=document.createElement("details");picker.id="palettePicker";picker.className="palette-picker";
      picker.innerHTML='<summary aria-label="切換色調">色調</summary><div class="palette-menu" role="group" aria-label="色調"><button type="button" data-palette="mist"><i aria-hidden="true"></i>原有配色</button></div>';
      toggle.before(picker);
    }
    picker.querySelector("summary").setAttribute("aria-label","切換色調");
    const menu=picker.querySelector(".palette-menu");menu.setAttribute("aria-label","色調");
    if(!menu.querySelector('[data-palette="standard"]')){
      const standard=document.createElement("div");
      standard.innerHTML='<div class="palette-group-label">標準高對比</div><button type="button" data-palette="standard" data-palette-theme="light"><i aria-hidden="true"></i>標準亮色</button><button type="button" data-palette="standard" data-palette-theme="dark"><i aria-hidden="true"></i>標準暗色</button><div class="palette-group-label">'+(menu.querySelector('[data-palette="sage"]')?'莫蘭迪色調':'原有配色')+'</div>';
      menu.prepend(...standard.childNodes);
    }
    const buttons=picker.querySelectorAll("button[data-palette]");
    function refresh(){
      const dark=current()==="dark";toggle.textContent=dark?"☀️":"🌙";toggle.title=dark?"切換為淺色":"切換為深色";
      buttons.forEach(button=>{
        const active=button.dataset.palette===root.dataset.palette&&(!button.dataset.paletteTheme||button.dataset.paletteTheme===current());
        button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));
      });
    }
    toggle.addEventListener("click",()=>{const next=current()==="dark"?"light":"dark";root.dataset.theme=next;localStorage.setItem(KEY,next);refresh();});
    buttons.forEach(button=>button.addEventListener("click",()=>{
      const next=button.dataset.palette;if(!PALETTES.includes(next))return;
      root.dataset.palette=next;localStorage.setItem(PALETTE_KEY,next);
      if(button.dataset.paletteTheme){root.dataset.theme=button.dataset.paletteTheme;localStorage.setItem(KEY,button.dataset.paletteTheme);}
      refresh();picker.open=false;
    }));
    media.addEventListener("change",refresh);
    window.addEventListener("storage",event=>{
      if(event.key===KEY){if(event.newValue==="light"||event.newValue==="dark")root.dataset.theme=event.newValue;else delete root.dataset.theme;refresh();}
      if(event.key===PALETTE_KEY){root.dataset.palette=PALETTES.includes(event.newValue)?event.newValue:"mist";refresh();}
    });
    refresh();
  }
  if(document.readyState!=="loading")wire();else document.addEventListener("DOMContentLoaded",wire);
})();
