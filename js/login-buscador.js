/* Fase 7.7: directory of display names only. Auth continues to verify the password. */
(() => {
  'use strict';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  document.addEventListener('DOMContentLoaded',()=>{
    const select=document.getElementById('usuario'),input=document.getElementById('buscarNombre'),list=document.getElementById('resultadosNombres');
    if(!select||!input||!list)return;
    const note=document.getElementById('nombreSeleccionado'),wrap=document.getElementById('buscarNombreContenedor'),back=document.getElementById('btnVolverNombres'),other=document.getElementById('btnOtraCuenta');
    const entries=Array.from(select.options).filter(o=>o.value&&o.value!=='__otra_cuenta__');
    let filtered=[],active=-1;
    function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
    function choose(o){const changed=select.value!==o.value;select.value=o.value;input.value=o.textContent;close();note.textContent='Seleccionado: '+o.textContent;select.dispatchEvent(new Event('change',{bubbles:true}));if(changed)document.getElementById('password').value='';document.getElementById('password').focus();}
    function paint(){
      const q=norm(input.value);filtered=entries.filter(o=>norm(o.textContent).includes(q)||norm(o.value.split('@')[0]).includes(q));active=-1;list.replaceChildren();
      filtered.forEach((o,i)=>{const b=document.createElement('button');b.type='button';b.id='nombre-opcion-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected',String(select.value===o.value));b.textContent=o.textContent;b.addEventListener('click',()=>choose(o));list.appendChild(b);});
      if(!filtered.length){const t=document.createElement('p');t.textContent='No se encontraron coincidencias. Puedes usar otra cuenta.';list.appendChild(t);}
      list.hidden=false;input.setAttribute('aria-expanded','true');note.textContent=filtered.length+' nombre(s) encontrado(s). Selecciona el tuyo.';
    }
    function sync(){const manual=select.value==='__otra_cuenta__';wrap.hidden=manual;back.hidden=!manual;other.hidden=manual;if(!manual){const o=entries.find(o=>o.value===select.value);input.value=o?o.textContent:'';note.textContent=o?'Seleccionado: '+o.textContent:'Selecciona tu nombre; luego escribe tu contrase\u00f1a.';}close();}
    input.addEventListener('focus',paint);
    input.addEventListener('input',()=>{input.classList.remove('input-error');document.getElementById('errorUsuario').textContent='';select.value='';window.alternarCuentaManual?.();paint();});
    input.addEventListener('keydown',e=>{
      if(e.key==='Escape'){close();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)paint();if(!filtered.length)return;active=(active+(e.key==='ArrowDown'?1:-1)+filtered.length)%filtered.length;Array.from(list.children).forEach((b,i)=>b.classList.toggle('activo',i===active));const b=list.children[active];input.setAttribute('aria-activedescendant',b.id);b.scrollIntoView({block:'nearest'});}
      if(e.key==='Enter'&&!list.hidden){e.preventDefault();if(active>=0)choose(filtered[active]);else if(filtered.length===1)choose(filtered[0]);else note.textContent='Selecciona uno de los nombres de la lista.';}
    });
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))close();});
    select.addEventListener('change',sync);
    other.addEventListener('click',()=>{select.value='__otra_cuenta__';sync();window.alternarCuentaManual?.(true);});
    back.addEventListener('click',()=>{select.value='';sync();window.alternarCuentaManual?.();input.focus();});
    sync();
  });
})();
